"""Notification proof is committed with the corresponding maintenance record."""
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest

from test_filter_store import load_adapter


class MaintenanceEvidenceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.adapter, self.store = load_adapter()
        self.state = SimpleNamespace(state='353.456', attributes={'unit_of_measurement': 'm³'})
        self.hass = SimpleNamespace(states=SimpleNamespace(get=lambda entity: self.state), data={})
        self.manager = self.adapter.FilterStore(self.hass)
        await self.manager.load()

    async def test_replacement_and_proof_share_commit_and_retry_does_not_duplicate(self):
        payload = {'filter': 'ferrostop'}
        await self.manager.mutate('replace', payload, 0, 'stable-id')
        saved = deepcopy(self.store.saved)
        self.assertIn('notifications', saved)
        self.assertEqual(saved['notifications']['evidence']['ferrostop']['evidence_id'], 'stable-id')
        await self.manager.mutate('replace', payload, 0, 'stable-id')
        self.assertEqual(self.store.saved, saved)

    async def test_failed_save_keeps_evidence_and_revision_unmodified(self):
        before = deepcopy(self.manager.envelope)
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.manager.mutate('replace', {'filter': 'ferrostop'}, 0, 'failure')
        self.assertEqual(self.manager.envelope, before)
        self.assertEqual(self.manager.revision, 0)

    async def test_legacy_main_api_never_fabricates_confirmation(self):
        await self.manager.mutate('replace', {'filter': 'main'}, 0, 'legacy')
        evidence = self.store.saved['notifications']['evidence']['main']
        self.assertFalse(evidence['baseline_confirmed'])

    async def test_refresh_bootstraps_durable_observations_without_centre(self):
        await self.manager.refresh_notifications()
        journal = self.store.saved['notifications']
        self.assertEqual(set(journal['observations']), {'main', 'ferrostop', 'softening', 'postcarbon', 'softener'})
        self.assertEqual(len(journal['transitions']), 5)
        await self.manager.refresh_notifications()
        self.assertEqual(self.store.saved['notifications'], journal)

    async def test_failed_refresh_does_not_publish_uncommitted_state(self):
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.manager.refresh_notifications()
        self.assertNotIn('notifications', self.manager.envelope)

    async def test_late_replacement_emits_healthy_cycle_then_new_due(self):
        await self.manager.mutate('record', {'filter':'ferrostop','date':'2024-01-01'}, 0, 'old')
        before = self.manager.envelope['notifications']['lifecycle_seq']
        await self.manager.mutate('record', {'filter':'ferrostop','date':'2025-01-01'}, 1, 'late')
        transitions = self.manager.envelope['notifications']['transitions']
        states = [t['observation']['state'] for t in transitions if t['lifecycle_seq'] > before and t['observation']['object_key'] == 'ferrostop']
        self.assertEqual(states, ['inactive', 'active'])
        proof = next(t['observation']['resolution'] for t in transitions if t['lifecycle_seq'] > before and t['observation']['state'] == 'inactive' and t['observation']['object_key'] == 'ferrostop')
        self.assertEqual(proof['details']['date'], '2025-01-01')

    async def test_recent_historical_replacement_with_proven_old_due_resolves(self):
        await self.manager.mutate('record', {'filter':'ferrostop','date':'2024-01-01'}, 0, 'old')
        await self.manager.mutate('record', {'filter':'ferrostop','date':'2026-09-01'}, 1, 'recent')
        journal = self.manager.envelope['notifications']
        self.assertEqual(journal['observations']['ferrostop']['state'], 'inactive')
        self.assertEqual(journal['observations']['ferrostop']['resolution']['evidence_id'], 'recent')

    async def test_corrupt_transition_history_fails_closed_on_reload(self):
        await self.manager.refresh_notifications()
        broken = deepcopy(self.store.saved)
        broken['notifications']['transitions'][0]['lifecycle_seq'] = 9
        self.store.saved = broken
        reloaded = self.adapter.FilterStore(self.hass)
        with self.assertRaises(ValueError):
            await reloaded.load()

    async def test_later_day_salt_enough_resolves_earlier_low(self):
        await self.manager.mutate('salt_check', {'level':'low','date':'2026-10-10'}, 0, 'low')
        await self.manager.mutate('salt_check', {'level':'enough','date':'2026-10-11'}, 1, 'enough')
        observation = self.manager.envelope['notifications']['observations']['softener']
        self.assertEqual(observation['state'], 'inactive')
        self.assertEqual(observation['resolution']['evidence_id'], 'enough')

    async def test_main_needs_new_timestamp_after_confirmed_baseline(self):
        from datetime import timedelta
        numeric = self.state
        sample = SimpleNamespace(state='2026-10-11T23:00:00+00:00', attributes={})
        self.hass.states.get = lambda entity: sample if entity.endswith('_obnovleno') else numeric
        await self.manager.mutate('settings', {'main':{'mode':'both', 'volume':10}}, 0, 'cfg')
        await self.manager.mutate('record', {'filter':'main','date':'2026-01-01','baseline':300}, 1, 'old')
        self.assertEqual(self.manager.envelope['notifications']['observations']['main']['state'], 'active')
        await self.manager.mutate('replace', {'filter':'main','baseline':353.456,'baseline_confirmed':True}, 2, 'new')
        self.assertEqual(self.manager.envelope['notifications']['observations']['main']['state'], 'unknown')
        sample.state = '2026-10-12T00:00:00+00:00'
        await self.manager.refresh_notifications()
        self.assertEqual(self.manager.envelope['notifications']['observations']['main']['state'], 'inactive')
        numeric.state = '1'
        await self.manager.refresh_notifications()
        self.assertEqual(self.manager.envelope['notifications']['observations']['main']['state'], 'unknown')

    async def test_main_time_warning_independent_of_missing_meter(self):
        self.state.state = 'unavailable'
        # 6 months from April 20 is October 20, eight days from fake today.
        self.manager.data['main']['date'] = '2026-04-20'
        await self.manager.refresh_notifications()
        observation = self.manager.envelope['notifications']['observations']['main']
        self.assertEqual(observation['state'], 'active')
        self.assertEqual(observation['facts']['status'], 'warning')

    async def test_same_day_untimed_salt_check_cannot_resolve_low(self):
        await self.manager.mutate('salt_check', {'level':'low','date':'2026-10-12'}, 0, 'low-same-day')
        await self.manager.mutate('salt_check', {'level':'enough','date':'2026-10-12'}, 1, 'enough-same-day')
        self.assertEqual(self.manager.envelope['notifications']['observations']['softener']['state'], 'unknown')

    async def test_performed_now_is_recorded_only_for_today(self):
        await self.manager.mutate('salt_check', {'level':'low','date':'2026-10-11','performed_now':True}, 0, 'old-check')
        self.assertNotIn('performed_at', self.manager.data['salt']['history'][-1])
        await self.manager.mutate('salt_check', {'level':'enough','date':'2026-10-12','performed_now':True}, 1, 'current-check')
        self.assertIn('performed_at', self.manager.data['salt']['history'][-1])
        self.assertEqual(self.manager.envelope['notifications']['observations']['softener']['state'], 'inactive')

    async def test_legacy_volume_warning_and_due_open_then_survive_refresh_and_reload(self):
        for mode in ('volume', 'both'):
            for reading, expected in ((309.5, 'warning'), (353.456, 'due')):
                with self.subTest(mode=mode, reading=reading):
                    adapter, store = load_adapter()
                    settings = adapter.defaults()
                    settings['main'].update(mode=mode, date='2026-10-01', months=6, baseline=300, volume=10)
                    store.saved = {'settings': settings, 'revision': 7}
                    numeric = SimpleNamespace(state=str(reading), attributes={'unit_of_measurement':'m³'})
                    timestamp = SimpleNamespace(state='2026-10-11T23:00:00+00:00', attributes={})
                    hass = SimpleNamespace(states=SimpleNamespace(get=lambda entity: timestamp if entity.endswith('_obnovleno') else numeric), data={})
                    manager = adapter.FilterStore(hass)
                    await manager.load()
                    self.assertEqual(manager.snapshot()['status']['main']['state'], expected)
                    await manager.refresh_notifications()
                    obs = manager.envelope['notifications']['observations']['main']
                    self.assertEqual((obs['state'], obs['quality'], obs['facts']['status']), ('active', 'verified', expected))
                    self.assertNotIn('resolution', obs)
                    saved = deepcopy(manager.envelope['notifications'])
                    await manager.refresh_notifications()
                    self.assertEqual(manager.envelope['notifications'], saved)
                    reloaded = adapter.FilterStore(hass); await reloaded.load(); await reloaded.refresh_notifications()
                    self.assertEqual(reloaded.envelope['notifications'], saved)

    async def test_legacy_volume_missing_future_invalid_or_reset_samples_do_not_activate(self):
        settings = self.adapter.defaults()
        settings['main'].update(mode='volume', date='2026-10-01', months=6, baseline=300, volume=10)
        self.store.saved = {'settings': settings, 'revision': 7}
        numeric = self.state
        timestamp = SimpleNamespace(state='unavailable', attributes={})
        self.hass.states.get = lambda entity: timestamp if entity.endswith('_obnovleno') else numeric
        for bad in ('unavailable', '2026-10-12T00:00:01+00:00', '2026-09-30T23:00:00+00:00', '2026-10-01T20:00:00+00:00'):
            with self.subTest(timestamp=bad):
                timestamp.state = bad
                manager = self.adapter.FilterStore(self.hass); await manager.load(); await manager.refresh_notifications()
                self.assertEqual(manager.envelope['notifications']['observations']['main']['state'], 'unknown')
                self.store.saved = {'settings': deepcopy(settings), 'revision': 7}
        timestamp.state = '2026-10-11T23:00:00+00:00'
        numeric.state = '299'
        manager = self.adapter.FilterStore(self.hass); await manager.load(); await manager.refresh_notifications()
        self.assertEqual(manager.envelope['notifications']['observations']['main']['state'], 'unknown')

    async def test_legacy_same_day_timestamp_does_not_establish_sample_order(self):
        settings = self.adapter.defaults()
        settings['main'].update(mode='volume', date='2026-10-12', months=6, baseline=300, volume=10)
        self.store.saved = {'settings': settings, 'revision': 7}
        timestamp = SimpleNamespace(state='2026-10-12T00:00:00+00:00', attributes={})
        self.hass.states.get = lambda entity: timestamp if entity.endswith('_obnovleno') else self.state
        manager = self.adapter.FilterStore(self.hass); await manager.load()
        self.assertEqual(manager.snapshot()['status']['main']['state'], 'due')
        await manager.refresh_notifications()
        self.assertEqual(manager.envelope['notifications']['observations']['main']['state'], 'unknown')

    async def test_legacy_lower_consumption_without_replacement_does_not_resolve(self):
        settings = self.adapter.defaults()
        settings['main'].update(mode='volume', date='2026-10-01', baseline=300, volume=10)
        self.store.saved = {'settings': settings, 'revision': 7}
        timestamp = SimpleNamespace(state='2026-10-11T23:00:00+00:00', attributes={})
        self.hass.states.get = lambda entity: timestamp if entity.endswith('_obnovleno') else self.state
        manager = self.adapter.FilterStore(self.hass); await manager.load(); await manager.refresh_notifications()
        self.assertEqual(manager.envelope['notifications']['observations']['main']['state'], 'active')
        self.state.state = '301'
        await manager.refresh_notifications()
        observation = manager.envelope['notifications']['observations']['main']
        self.assertEqual(observation['state'], 'unknown')
        self.assertNotIn('resolution', observation)

    async def test_unconfirmed_new_record_can_raise_but_never_resolve(self):
        timestamp = SimpleNamespace(state='2026-10-12T00:00:00+00:00', attributes={})
        self.hass.states.get = lambda entity: timestamp if entity.endswith('_obnovleno') else self.state
        await self.manager.mutate('settings', {'main':{'mode':'volume','volume':10}}, 0, 'configure-volume')
        await self.manager.mutate('record', {'filter':'main','date':'2026-10-01','baseline':300}, 1, 'legacy-write')
        obs = self.manager.envelope['notifications']['observations']['main']
        self.assertEqual(obs['state'], 'active')
        self.assertFalse(self.manager.envelope['notifications']['evidence']['main']['baseline_confirmed'])
        self.state.state = '301'
        await self.manager.refresh_notifications()
        obs = self.manager.envelope['notifications']['observations']['main']
        self.assertEqual(obs['state'], 'unknown')
        self.assertNotIn('resolution', obs)


class PublisherTests(unittest.IsolatedAsyncioTestCase):
    async def test_replays_only_after_centre_cursor_and_checks_acknowledgement(self):
        import importlib.util
        from pathlib import Path
        path = Path(__file__).resolve().parents[1] / 'custom_components/water_treatment/notifications.py'
        self.assertTrue(path.exists(), 'publisher is missing')
        spec = importlib.util.spec_from_file_location('_water_publisher_test', path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        calls = []
        class Services:
            def has_service(self, domain, action): return True
            async def async_call(self, domain, action, data, **kwargs):
                calls.append((action, deepcopy(data), kwargs))
                return {'accepted': True, 'lifecycle_cursor': 1 if action == 'register_source' else 2}
        journal = {'lifecycle_seq': 2, 'transitions': [
            {'transition_id': 'a', 'lifecycle_seq': 1, 'observation': {}},
            {'transition_id': 'b', 'lifecycle_seq': 2, 'observation': {}}], 'observations': {}}
        manager = SimpleNamespace(envelope={'notifications': journal})
        hass = SimpleNamespace(services=Services())
        publisher = mod.NotificationPublisher(hass, manager, 'entry', 'session', None)
        await publisher.publish()
        self.assertEqual([t['lifecycle_seq'] for t in calls[1][1]['transitions']], [2])
        self.assertEqual(calls[1][1]['source_session'], 'session')
        self.assertTrue(calls[1][2]['return_response'])
        self.assertEqual(publisher.cursor, 2)

    async def test_large_replay_is_batched_before_final_snapshot(self):
        import importlib.util
        from pathlib import Path
        path = Path(__file__).resolve().parents[1] / 'custom_components/water_treatment/notifications.py'
        spec = importlib.util.spec_from_file_location('_water_publisher_batch', path)
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        calls = []
        class Services:
            def has_service(self, *args): return True
            async def async_call(self, domain, action, data, **kwargs):
                calls.append((action, deepcopy(data)))
                return {'accepted':True, 'lifecycle_cursor': 0 if action == 'register_source' else data['transitions'][-1]['lifecycle_seq']}
        journal = {'lifecycle_seq':300, 'transitions':[{'transition_id':str(i),'lifecycle_seq':i,'observation':{}} for i in range(1,301)], 'observations':{'main':{}}}
        publisher = mod.NotificationPublisher(SimpleNamespace(services=Services()), SimpleNamespace(envelope={'notifications':journal}), 'entry', 'session', None)
        await publisher.publish()
        packets = [data for action,data in calls if action == 'sync_source']
        self.assertGreater(len(packets), 1)
        self.assertTrue(all(packet.get('replay') is True for packet in packets))
        self.assertFalse(packets[0]['complete'])
        self.assertEqual(packets[0]['observations'], [])
        self.assertTrue(packets[-1]['complete'])
        self.assertEqual(publisher.cursor, 300)

    async def test_ambiguous_failure_retries_identical_revision_and_packet(self):
        import importlib.util
        from pathlib import Path
        path = Path(__file__).resolve().parents[1] / 'custom_components/water_treatment/notifications.py'
        spec = importlib.util.spec_from_file_location('_water_publisher_retry', path)
        mod = importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        attempts=[]
        class Services:
            def has_service(self,*args): return True
            async def async_call(self, domain, action, data, **kwargs):
                if action == 'register_source': return {'accepted':True,'lifecycle_cursor':0}
                attempts.append(deepcopy(data))
                if len(attempts)==1: raise TimeoutError('ambiguous')
                return {'accepted':True,'lifecycle_cursor':1,'duplicate':True}
        journal={'lifecycle_seq':1,'transitions':[{'lifecycle_seq':1,'transition_id':'a','observation':{}}], 'observations':{}}
        publisher=mod.NotificationPublisher(SimpleNamespace(services=Services()),SimpleNamespace(envelope={'notifications':journal}),'entry','session',None)
        await publisher.publish()
        await publisher.publish()
        self.assertEqual(attempts[0],attempts[1])
        self.assertEqual(publisher.cursor,1)
