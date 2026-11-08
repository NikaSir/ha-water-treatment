"""Authenticated, persistent filter maintenance API."""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import date
from math import isfinite

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util

from .const import DOMAIN, ENTITY_MAP
from .salt_model import migrate_salt, salt_action, salt_status
from .treatment_model import treatment_defaults, treatment_action, treatment_status
from .filter_model import CARTRIDGES, defaults, softening_basis, status, update_settings
from .migration import assert_no_legacy_writer, load_envelope
from .journal_storage import JournalStore as Store


class FilterStore:
    def __init__(self, hass):
        self.hass = hass
        self.store = Store(hass, 1, f'{DOMAIN}.filters')
        self.data = defaults()
        self.revision = 0
        self.lock = asyncio.Lock()
        self.envelope = {}

    async def load(self):
        saved, needs_save = await load_envelope(self.hass, self.store)
        if saved is not None:
            self.data = saved['settings']
            self.revision = saved.get('revision', 0)
        elif self.data['softening_auto']:
            self.data['cartridges']['softening']['months'] = None

        self.data['salt'] = migrate_salt(self.data.get('salt', {}))
        self.data.setdefault('treatment', treatment_defaults())
        self.envelope = saved if saved is not None else {}
        self.envelope.update(settings=deepcopy(self.data), revision=self.revision)
        self.snapshot()  # Validate calculations before persisting an imported envelope.
        if needs_save:
            assert_no_legacy_writer(self.hass)
            await self.store.async_save(self.envelope)
            if await self.store.async_load() != self.envelope:
                raise ValueError('Не удалось проверить сохранение перенесённого журнала')

    def meter(self):
        state = self.hass.states.get(ENTITY_MAP['drinking_total'])
        if state is None:
            return None
        try:
            value = float(state.state)
        except (TypeError, ValueError):
            return None
        if not isfinite(value) or value < 0:
            return None
        unit = state.attributes.get('unit_of_measurement')
        if unit in ('L', 'l', 'л'):
            return value / 1000
        return value if unit in ('m³', 'm3', 'м³', 'м3') else None

    def snapshot(self):
        assert_no_legacy_writer(self.hass)
        today = dt_util.now().date()
        meter = self.meter()
        return {'settings': deepcopy(self.data), 'revision': self.revision,
                'migration': {key: value for key, value in self.envelope.get('migration', {}).items()
                              if key != 'source_snapshot'},
                'salt_status': salt_status(self.data['salt'], today, self.data['treatment']['profile']),
                'treatment_status': treatment_status(self.data['treatment']),
                'softening_basis': softening_basis(self.data),
                'meter': meter, 'today': today.isoformat(),
                'status': {'main': status(self.data['main'], today, meter),
                           **{key: status(self.data['cartridges'][key], today) for key in CARTRIDGES}}}

    async def mutate(self, action, payload, revision, operation_id=None):
        async with self.lock:
            assert_no_legacy_writer(self.hass)
            if operation_id is not None:
                if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 128:
                    raise ValueError('Неверный идентификатор операции')
                previous = self.envelope.get('operations', {}).get(operation_id)
                if previous is not None:
                    if previous != {'action': action, 'payload': payload}:
                        raise ValueError('Идентификатор операции уже использован для другой записи')
                    return self.snapshot()
            if revision != self.revision:
                raise ValueError('Настройки изменились на другом устройстве. Обновите вкладку.')
            data = deepcopy(self.data)
            if action.startswith('salt_'):
                data['salt'] = salt_action(data['salt'], action[5:], payload, dt_util.now().date())
            elif action.startswith('treatment_'):
                kind = action[len('treatment_'):]
                apply = payload.get('apply_to_filter', False)
                if not isinstance(apply, bool):
                    raise ValueError('Неверный признак применения жёсткости')
                if apply and (kind != 'gh' or payload.get('point') != 'softener'):
                    raise ValueError('Для БАРЬЕР используйте пробу на выходе умягчителя')
                data['treatment'] = treatment_action(data['treatment'], kind, payload, dt_util.now().date())
                if apply:
                    data = update_settings(data, {'hardness': data['treatment']['gh_history'][-1]['zh']})
                if kind == 'old_profile':
                    data['salt'] = salt_action(data['salt'], 'old_profile', {}, dt_util.now().date())
            elif action == 'settings':
                data = update_settings(data, payload)
            else:
                key = payload.get('filter')
                if key not in ('main', *CARTRIDGES):
                    raise ValueError('Неизвестный картридж')
                installed = payload.get('date') or dt_util.now().date().isoformat()
                if date.fromisoformat(installed) > dt_util.now().date():
                    raise ValueError('Дата замены не может быть в будущем')
                config = data['main'] if key == 'main' else data['cartridges'][key]
                config['date'] = installed
                if key == 'main':
                    baseline = self.meter() if action == 'replace' else payload.get('baseline')
                    if baseline is None:
                        raise ValueError('Нет показания питьевого счётчика. Для прошлой замены укажите показание вручную.')
                    if isinstance(baseline, bool):
                        raise ValueError('Неверное показание счётчика')
                    baseline = float(baseline)
                    if not isfinite(baseline) or baseline < 0:
                        raise ValueError('Неверное показание счётчика')
                    current = self.meter()
                    if current is not None and baseline > current:
                        raise ValueError('Показание при замене больше текущего')
                    config['baseline'] = baseline
            revision_next = self.revision + 1
            envelope = deepcopy(self.envelope)
            envelope.update(settings=data, revision=revision_next)
            if operation_id is not None:
                envelope.setdefault('operations', {})[operation_id] = {
                    'action': action, 'payload': deepcopy(payload)}
            await self.store.async_save(envelope)
            self.envelope = envelope
            self.data, self.revision = data, revision_next
            return self.snapshot()


@websocket_api.websocket_command({vol.Required('type'): f'{DOMAIN}/filters',
                                 vol.Optional('action', default='get'): vol.In(('get', 'settings', 'replace', 'record',
                                     'salt_cleanup', 'salt_settings', 'salt_topup', 'salt_check', 'salt_service', 'salt_remove', 'salt_regeneration',
                                     'treatment_settings', 'treatment_gh', 'treatment_old_profile')),
                                 vol.Optional('payload', default=dict): dict,
                                 vol.Optional('revision'): int,
                                 vol.Optional('operation_id'): str})
@websocket_api.async_response
async def filters_command(hass, connection, msg):
    manager = hass.data.get(DOMAIN, {}).get('filters')
    if manager is None:
        connection.send_error(msg['id'], 'not_loaded', 'Интеграция не загружена')
        return
    if msg['action'] == 'get':
        try:
            connection.send_result(msg['id'], manager.snapshot())
        except (ValueError, TypeError, HomeAssistantError) as err:
            connection.send_error(msg['id'], 'legacy_writer_active', str(err))
        return
    if connection.user is None or not connection.user.is_admin:
        connection.send_error(msg['id'], 'unauthorized', 'Изменять фильтры может только администратор HA')
        return
    try:
        result = await manager.mutate(msg['action'], msg['payload'], msg.get('revision'), msg.get('operation_id'))
    except (ValueError, TypeError, HomeAssistantError, OSError) as err:
        connection.send_error(msg['id'], 'invalid_settings', str(err))
        return
    connection.send_result(msg['id'], result)


async def async_setup_filters(hass):
    domain_data = hass.data.setdefault(DOMAIN, {})
    manager = FilterStore(hass)
    await manager.load()
    domain_data['filters'] = manager
    if not domain_data.get('filters_registered'):
        websocket_api.async_register_command(hass, filters_command)
        domain_data['filters_registered'] = True
