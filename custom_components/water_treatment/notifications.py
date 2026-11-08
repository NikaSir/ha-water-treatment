"""Optional, replayable publisher; never imports the notification centre."""
import asyncio
from copy import deepcopy
import logging

_LOGGER = logging.getLogger(__name__)
DOMAIN = 'nikas_notifications'


class NotificationPublisher:
    def __init__(self, hass, manager, instance_id, source_session, runtime):
        self.hass, self.manager = hass, manager
        self.source = {'domain': 'water_treatment', 'instance_id': instance_id}
        self.session, self.runtime = source_session, runtime
        self.cursor = None
        self.revision = 0
        self.pending = None
        self.lock = asyncio.Lock()
        self.stopped = False
        self.unsubscribers = []
        self.tasks = set()

    async def publish(self):
        async with self.lock:
            if self.stopped or not self.hass.services.has_service(DOMAIN, 'register_source') or not self.hass.services.has_service(DOMAIN, 'sync_source'):
                return
            try:
                if self.cursor is None:
                    args = {'source': self.source, 'source_session': self.session}
                    if self.runtime is not None:
                        args['runtime'] = self.runtime
                    response = await self.hass.services.async_call(DOMAIN, 'register_source', args,
                                                                    blocking=True, return_response=True)
                    if not isinstance(response, dict) or response.get('accepted') is not True or type(response.get('lifecycle_cursor')) is not int:
                        raise ValueError('source registration was not accepted')
                    self.cursor = response['lifecycle_cursor']
                while not self.stopped:
                    journal = deepcopy(self.manager.envelope['notifications'])
                    if journal.get('overflow'):
                        raise ValueError('source lifecycle stream is full; reconciliation requires intervention')
                    if self.cursor > journal['lifecycle_seq']:
                        raise ValueError('centre cursor exceeds retained source history')
                    if self.pending is None:
                        remaining = [item for item in journal['transitions'] if item['lifecycle_seq'] > self.cursor]
                        chunk = remaining[:128]
                        # Keep a proved late-replacement inactive/active pair atomic.
                        if len(remaining) > len(chunk) and chunk:
                            last, following = chunk[-1]['observation'], remaining[len(chunk)]['observation']
                            if (last.get('state') == 'inactive' and last.get('resolution')
                                    and following.get('state') == 'active'
                                    and last.get('object_key') == following.get('object_key')):
                                chunk.append(remaining[len(chunk)])
                        complete = len(chunk) == len(remaining)
                        self.revision += 1
                        self.pending = {'schema_version': 1, 'source': self.source,
                            'source_session': self.session, 'revision': self.revision, 'catalog_version': 1,
                            'replay': True, 'complete': complete, 'observations': list(journal['observations'].values()) if complete else [],
                            'transitions': chunk}
                    response = await self.hass.services.async_call(DOMAIN, 'sync_source', self.pending,
                                                                    blocking=True, return_response=True)
                    if not isinstance(response, dict) or response.get('accepted') is not True or type(response.get('lifecycle_cursor')) is not int:
                        raise ValueError('source synchronization was not accepted')
                    expected = self.pending['transitions'][-1]['lifecycle_seq'] if self.pending['transitions'] else self.cursor
                    if response['lifecycle_cursor'] != expected:
                        raise ValueError('unexpected centre cursor')
                    done = self.pending['complete']
                    self.cursor = expected
                    self.pending = None
                    if done and self.cursor == self.manager.envelope['notifications']['lifecycle_seq']:
                        break

            except Exception as err:  # Optional centre must never fail the maintenance write.
                _LOGGER.warning('Notification publication deferred: %s', err)

    def schedule(self, *_args, reconnect=False):
        if self.stopped:
            return
        async def run():
            try:
                if reconnect:
                    async with self.lock:
                        self.cursor = None
                await self.manager.refresh_notifications()
                await self.publish()
            except Exception as err:
                _LOGGER.warning('Notification refresh deferred: %s', err)
        task = self.hass.async_create_task(run())
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def stop(self):
        self.stopped = True
        for unsubscribe in self.unsubscribers:
            unsubscribe()
        for task in tuple(self.tasks):
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
