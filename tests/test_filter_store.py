"""Exercise real persistence adapter with small HA boundary fakes."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / 'custom_components/water_treatment'


def load_adapter():
    modules = {}
    def module(name, **attrs):
        item = ModuleType(name)
        item.__dict__.update(attrs)
        modules[name] = item
        return item
    class Store:
        saved = None
        fail = False
        def __init__(self, *args): pass
        async def async_load(self): return deepcopy(self.saved)
        async def async_save(self, value):
            if self.fail: raise OSError('disk full')
            type(self).saved = deepcopy(value)
    class Field:
        def __init__(self, *args, **kwargs): pass
    websocket = SimpleNamespace(websocket_command=lambda schema: lambda fn: fn,
        async_response=lambda fn: fn, async_register_command=lambda *args: None)
    module('voluptuous', Required=Field, Optional=Field, In=lambda x: x)
    module('homeassistant')
    module('homeassistant.components', websocket_api=websocket)
    module('homeassistant.exceptions', HomeAssistantError=RuntimeError)
    module('homeassistant.helpers')
    module('homeassistant.helpers.storage', Store=Store)
    module('homeassistant.util', dt=SimpleNamespace(now=lambda: datetime(2026,10,12,tzinfo=timezone.utc)))
    pkg = module('_filter_test_package');pkg.__path__=[str(ROOT)]
    with patch.dict(sys.modules, modules):
        spec=importlib.util.spec_from_file_location('_filter_test_package.filters',ROOT/'filters.py')
        adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
    # Business-logic tests stub storage; test_journal_storage exercises the
    # production wrapper against actual files and HA's silent-failure behavior.
    adapter.Store = Store
    adapter.load_envelope.__globals__['Store'] = Store
    return adapter, Store


class FilterStoreTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.adapter, self.store = load_adapter()
        self.state = SimpleNamespace(state='353.456',attributes={'unit_of_measurement':'m³'})
        self.hass = SimpleNamespace(states=SimpleNamespace(get=lambda entity: self.state),data={})
        self.manager = self.adapter.FilterStore(self.hass)

    async def test_snapshot_explains_saved_hardness_without_writing_or_resetting_dates(self):
        await self.manager.load()
        await self.manager.mutate('record', {'filter': 'softening', 'date': '2026-10-01'}, 0)
        await self.manager.mutate('treatment_gh', {
            'drops': 2, 'point': 'softener', 'apply_to_filter': True}, 1)
        before = deepcopy(self.store.saved)
        snapshot = self.manager.snapshot()
        self.assertEqual(snapshot['softening_basis']['hardness'], 0.7132)
        self.assertEqual(snapshot['softening_basis']['applied_months'], 2)
        self.assertEqual(snapshot['softening_basis']['band_max'], 3)
        self.assertEqual(snapshot['status']['softening']['deadline'], '2026-12-01')
        self.assertEqual(snapshot['settings']['cartridges']['softening']['date'], '2026-10-01')
        self.assertEqual(self.store.saved, before)
        self.assertEqual(self.manager.revision, 2)

    async def test_replacement_reload_and_settings_never_reset_baseline(self):
        await self.manager.load()
        await self.manager.mutate('replace',{'filter':'main'},0)
        self.assertEqual(self.manager.data['main']['baseline'],353.456)
        self.state.state='363.456'
        self.assertEqual(self.manager.snapshot()['status']['main']['used'],10)
        await self.manager.mutate('settings',{'main':{'profile':'wound','volume':200}},1)
        reloaded=self.adapter.FilterStore(self.hass);await reloaded.load()
        self.assertEqual(reloaded.data['main']['baseline'],353.456)
        self.assertEqual(reloaded.revision,2)

    async def test_conflict_and_failed_save_leave_state_untouched(self):
        await self.manager.load()
        with self.assertRaises(ValueError):
            await self.manager.mutate('replace',{'filter':'main'},9)
        self.store.fail=True
        with self.assertRaises(OSError):
            await self.manager.mutate('replace',{'filter':'main'},0)
        self.assertIsNone(self.manager.data['main']['date'])
        self.assertEqual(self.manager.revision,0)

    async def test_invalid_future_date_and_missing_meter_rejected(self):
        await self.manager.load()
        with self.assertRaises(ValueError):
            await self.manager.mutate('record',{'filter':'ferrostop','date':'2027-01-01'},0)
        self.state.state='unavailable'
        with self.assertRaises(ValueError):
            await self.manager.mutate('replace',{'filter':'main'},0)
        self.state.state='1000';self.state.attributes['unit_of_measurement']='L'
        self.assertEqual(self.manager.meter(),1)
        self.state.attributes['unit_of_measurement']='unexpected'
        self.assertIsNone(self.manager.meter())

    async def test_non_admin_can_read_but_cannot_mutate(self):
        await self.manager.load()
        self.hass.data={'water_treatment':{'filters':self.manager}}
        results=[]
        errors=[]
        connection=SimpleNamespace(send_result=lambda *args: results.append(args), user=SimpleNamespace(is_admin=False), send_error=lambda *args: errors.append(args))
        await self.adapter.filters_command(self.hass,connection,{'id':1,'action':'get'})
        self.assertEqual(len(results),1)
        await self.adapter.filters_command(self.hass,connection,{'id':2,'action':'settings'})
        self.assertEqual(errors[0][1], 'unauthorized')
        self.assertEqual(self.manager.revision,0)

    async def test_salt_migration_and_reload_preserve_filter_dates(self):
        await self.manager.load()
        await self.manager.mutate('replace',{'filter':'ferrostop'},0)
        await self.manager.mutate('salt_topup',{'kg':25},1)
        await self.manager.mutate('salt_check',{'level':'low'},2)
        reloaded=self.adapter.FilterStore(self.hass)
        await reloaded.load()
        self.assertEqual(reloaded.data['cartridges']['ferrostop']['date'],'2026-10-12')
        self.assertEqual(reloaded.data['salt']['last_added_kg'],25)
        self.assertEqual(reloaded.snapshot()['salt_status']['state'],'low')
        del self.store.saved['settings']['salt']
        migrated=self.adapter.FilterStore(self.hass)
        await migrated.load()
        self.assertEqual(migrated.data['cartridges']['ferrostop']['date'],'2026-10-12')
        self.assertIsNone(migrated.data['salt']['last_checked'])

    async def test_legacy_migration_preserves_settings_without_inventing_stock(self):
        saved=self.adapter.defaults()
        saved['people']=2
        saved['main'].update(date='2025-10-01',baseline=350)
        saved['salt']={'dose':1.5,'check_days':6,'level':'unknown','last_added':'2026-01-01',
                       'last_added_kg':25,'history':[{'action':'topup','date':'2026-01-01','kg':25}]}
        self.store.saved={'settings':saved,'revision':7}
        await self.manager.load()
        snap=self.manager.snapshot()
        self.assertEqual(snap['revision'],7)
        self.assertEqual(snap['settings']['people'],2)
        self.assertEqual(snap['settings']['main']['baseline'],350)
        self.assertEqual(snap['settings']['salt'].get('dose_basis'),'legacy_unverified')
        self.assertIsNone(snap['settings']['salt'].get('known_kg'))
        self.assertIn('treatment',snap['settings'])
        self.assertEqual(len(snap['settings']['salt']['history']),1)

    async def test_tank_and_cycle_records_survive_reload_without_rewriting_water_meter(self):
        await self.manager.load()
        await self.manager.mutate('replace',{'filter':'main'},0)
        await self.manager.mutate('salt_service',{'remaining_kg':0,'added_kg':5,'refill_l':3},1)
        await self.manager.mutate('salt_regeneration',{'completed':True,'result':'unverified','water_m3':0.39},2)
        reloaded=self.adapter.FilterStore(self.hass)
        await reloaded.load()
        self.assertEqual(reloaded.data['salt']['estimated_kg'],4)
        self.assertIsNone(reloaded.data['salt']['known_kg'])
        self.assertEqual(reloaded.data['salt']['regenerations'],1)
        self.assertEqual(reloaded.data['main']['baseline'],353.456)
        self.assertEqual(reloaded.snapshot()['status']['main']['used'],0)

    async def test_only_softener_outlet_can_explicitly_update_barrier_hardness(self):
        await self.manager.load()
        for point in ('mains','barrier'):
            with self.assertRaises(ValueError):
                await self.manager.mutate('treatment_gh',{'drops':14,'point':point,'apply_to_filter':True},0)
        self.assertIsNone(self.manager.data['hardness'])
        self.assertEqual(self.manager.revision,0)
        await self.manager.mutate('treatment_gh',{'drops':14,'point':'softener','apply_to_filter':True},0)
        self.assertEqual(self.manager.data['hardness'],4.9924)
        self.assertEqual(self.manager.data['cartridges']['softening']['months'],1)
        self.assertEqual(len(self.manager.data['treatment']['gh_history']),1)
        await self.manager.mutate('treatment_gh',{'drops':4,'point':'barrier'},1)
        self.assertEqual(self.manager.data['hardness'],4.9924)

    async def test_failed_measurement_save_does_not_change_journal_or_hardness(self):
        await self.manager.load()
        self.store.fail=True
        with self.assertRaises(OSError):
            await self.manager.mutate('treatment_gh',{'drops':14,'point':'softener','apply_to_filter':True},0)
        self.assertIsNone(self.manager.data['hardness'])
        self.assertEqual(self.manager.revision,0)
        self.assertEqual(self.manager.data['treatment']['gh_history'],[])

    async def test_old_profile_application_preserves_salt_and_filter_records(self):
        await self.manager.load()
        await self.manager.mutate('salt_settings',{'dose':1.5},0)
        await self.manager.mutate('salt_service',{'remaining_kg':0,'added_kg':5},1)
        await self.manager.mutate('treatment_old_profile',{},2)
        self.assertEqual(self.manager.data['salt']['dose'],1)
        self.assertEqual(self.manager.data['salt']['known_kg'],5)
        self.assertEqual(len(self.manager.data['salt']['history']),1)

    async def test_non_admin_cannot_write_any_new_record(self):
        await self.manager.load()
        self.hass.data={'water_treatment':{'filters':self.manager}}
        errors=[]
        connection=SimpleNamespace(user=SimpleNamespace(is_admin=False),send_error=lambda *args:errors.append(args))
        for action in ('salt_service','salt_regeneration','salt_remove','treatment_settings','treatment_gh','treatment_old_profile'):
            await self.adapter.filters_command(self.hass,connection,{'id':1,'action':action})
        self.assertEqual(len(errors),6)
        self.assertTrue(all(item[1]=='unauthorized' for item in errors))
        self.assertEqual(self.manager.revision,0)

class RetrospectiveStoreTests(unittest.IsolatedAsyncioTestCase):
    setUp = FilterStoreTests.setUp

    async def record(self, action, payload, operation_id=None):
        try:
            return await self.manager.mutate(action, payload, self.manager.revision, operation_id=operation_id)
        except ValueError as err:
            self.fail(f'{action} rejected a valid event: {err}')

    async def test_backdated_cycle_survives_snapshot_reload_and_retry_without_double_consumption(self):
        await self.manager.load()
        await self.record('salt_service', {'date': '2026-10-01', 'remaining_kg': 0, 'added_kg': 1})
        await self.record('salt_settings', {'dose': 2})
        await self.record('salt_regeneration', {'date': '2026-10-03', 'completed': True})
        await self.record('salt_topup', {'date': '2026-10-08', 'kg': 5})
        await self.record('salt_settings', {'dose': 1})
        before = deepcopy(self.manager.data)
        payload = {'date': '2026-10-02', 'completed': True, 'result': 'unverified'}

        snapshot = await self.record('salt_regeneration', payload, operation_id='missed-cycle')

        self.assertEqual(snapshot['salt_status']['estimated_remaining_kg'], 5)
        self.assertEqual(snapshot['salt_status']['full_cycles'], 5)
        self.assertIsNone(snapshot['salt_status']['known_remaining_kg'])
        self.assertEqual(snapshot['settings']['salt']['regenerations'], 2)
        self.assertEqual(snapshot['revision'], 6)
        reloaded = self.adapter.FilterStore(self.hass)
        await reloaded.load()
        await reloaded.mutate('salt_regeneration', payload, 5, operation_id='missed-cycle')
        self.assertEqual(reloaded.data, snapshot['settings'])
        self.assertEqual(reloaded.revision, 6)
        self.assertEqual(reloaded.data['salt']['last_ledger_date'], '2026-10-08')
        self.assertEqual(reloaded.data['salt']['last_tank_service'], '2026-10-01')
        self.assertEqual(reloaded.data['salt']['last_added'], '2026-10-08')
        self.assertEqual(reloaded.data['salt']['history'][:-1], before['salt']['history'])
        self.assertEqual(reloaded.data['main'], before['main'])
        self.assertEqual(reloaded.data['cartridges'], before['cartridges'])

    async def test_replay_underflow_leaves_persisted_state_and_operation_id_untouched(self):
        await self.manager.load()
        await self.record('salt_service', {'date': '2026-10-01', 'remaining_kg': 0, 'added_kg': 2})
        await self.record('salt_topup', {'date': '2026-10-08', 'kg': 5})
        before = deepcopy(self.manager.data)
        saved = deepcopy(self.store.saved)
        payload = {'date': '2026-10-02', 'completed': True, 'salt_kg': 3}

        with self.assertRaisesRegex(ValueError, 'Расход больше'):
            await self.manager.mutate('salt_regeneration', payload, 2, operation_id='corrected-cycle')

        self.assertEqual(self.manager.data, before)
        self.assertEqual(self.manager.revision, 2)
        self.assertEqual(self.store.saved, saved)
        payload['salt_kg'] = 1
        await self.record('salt_regeneration', payload, operation_id='corrected-cycle')
        self.assertEqual(self.manager.data['salt']['known_kg'], 6)
        self.assertEqual(self.manager.data['salt']['regenerations'], 1)
        self.assertEqual(self.manager.revision, 3)

    async def test_failed_backdated_save_can_retry_the_same_operation_once(self):
        await self.manager.load()
        await self.record('salt_service', {'date': '2026-10-01', 'remaining_kg': 0, 'added_kg': 5})
        await self.record('salt_topup', {'date': '2026-10-08', 'kg': 5})
        before = deepcopy(self.manager.data)
        saved = deepcopy(self.store.saved)
        payload = {'date': '2026-10-02', 'completed': True}
        self.store.fail = True

        with self.assertRaises(OSError):
            await self.record('salt_regeneration', payload, operation_id='retry-missed-cycle')

        self.assertEqual(self.manager.data, before)
        self.assertEqual(self.manager.revision, 2)
        self.assertEqual(self.store.saved, saved)
        self.store.fail = False
        await self.record('salt_regeneration', payload, operation_id='retry-missed-cycle')
        self.assertEqual(self.manager.data['salt']['estimated_kg'], 9)
        self.assertEqual(self.manager.data['salt']['regenerations'], 1)
        self.assertEqual(len(self.manager.data['salt']['history']), 3)
        self.assertEqual(self.manager.revision, 3)


class RetryTests(unittest.IsolatedAsyncioTestCase):
    setUp = FilterStoreTests.setUp
    async def test_retry_after_reload_does_not_append_again(self):
        await self.manager.load()
        await self.manager.mutate('salt_topup', {'kg': 5}, 0, operation_id='topup-1')
        reloaded = self.adapter.FilterStore(self.hass)
        await reloaded.load()
        await reloaded.mutate('salt_topup', {'kg': 5}, 0, operation_id='topup-1')
        self.assertEqual(len(reloaded.data['salt']['history']), 1)
        self.assertEqual(reloaded.revision, 1)
        with self.assertRaises(ValueError):
            await reloaded.mutate('salt_topup', {'kg': 6}, 1, operation_id='topup-1')

    async def test_new_operation_can_record_same_mass(self):
        await self.manager.load()
        await self.manager.mutate('salt_topup', {'kg': 5}, 0, operation_id='a')
        await self.manager.mutate('salt_topup', {'kg': 5}, 1, operation_id='b')
        self.assertEqual(len(self.manager.data['salt']['history']), 2)

    async def test_failed_persistence_does_not_consume_operation_id(self):
        await self.manager.load()
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.manager.mutate('salt_topup', {'kg':5}, 0, operation_id='retry-disk')
        self.store.fail = False
        await self.manager.mutate('salt_topup', {'kg':5}, 0, operation_id='retry-disk')
        self.assertEqual(len(self.manager.data['salt']['history']), 1)

    async def test_concurrent_retries_commit_once(self):
        await self.manager.load()
        await asyncio.gather(*(self.manager.mutate('salt_topup', {'kg':5}, 0,
                              operation_id='concurrent') for _ in range(2)))
        self.assertEqual(len(self.manager.data['salt']['history']), 1)
        self.assertEqual(self.manager.revision, 1)
