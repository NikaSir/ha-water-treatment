"""Exercise migration with independent persistent keys, not a single fake slot."""
import importlib.util
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / 'custom_components/water_treatment'
SOURCE = 'water_accounting.filters'
TARGET = 'water_treatment.filters'


def adapter():
    modules = {}
    def module(name, **attrs):
        mod = ModuleType(name)
        mod.__dict__.update(attrs)
        modules[name] = mod
        return mod
    class Store:
        disk = {}
        writes = []
        fail = False
        def __init__(self, hass, version, key): self.key = key
        async def async_load(self): return deepcopy(self.disk.get(self.key))
        async def async_save(self, value):
            if self.fail: raise OSError('disk full')
            self.disk[self.key] = deepcopy(value)
            self.writes.append(self.key)
    class Field:
        def __init__(self, *args, **kwargs): pass
    module('voluptuous', Required=Field, Optional=Field, In=lambda x: x)
    module('homeassistant')
    module('homeassistant.components', websocket_api=SimpleNamespace(
        websocket_command=lambda schema: lambda fn: fn, async_response=lambda fn: fn,
        async_register_command=lambda *args: None))
    module('homeassistant.exceptions', HomeAssistantError=RuntimeError)
    module('homeassistant.helpers')
    module('homeassistant.helpers.storage', Store=Store)
    module('homeassistant.util', dt=SimpleNamespace(now=lambda: datetime(2026, 11, 6, tzinfo=timezone.utc)))
    name = '_migration_package'
    package = module(name)
    package.__path__ = [str(ROOT)]
    with patch.dict(sys.modules, modules):
        spec = importlib.util.spec_from_file_location(name+'.filters', ROOT/'filters.py')
        loaded = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(loaded)
    loaded.Store = Store
    loaded.load_envelope.__globals__['Store'] = Store
    return loaded, Store


class MigrationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.module, self.store = adapter()
        self.hass = SimpleNamespace(data={}, states=SimpleNamespace(get=lambda _: None),
            config_entries=SimpleNamespace(async_entries=lambda _: []))

    def legacy(self):
        cfg = self.module.defaults()
        cfg.update(people=2, hardness=4.9924)
        cfg['main'].update(date='2026-10-01', baseline=345.678)
        cfg['salt'] = self.module.migrate_salt({})
        cfg['salt'] = self.module.salt_action(cfg['salt'], 'service',
            {'remaining_kg':0, 'added_kg':5}, datetime(2026,10,27).date())
        cfg['salt'] = self.module.salt_action(cfg['salt'], 'regeneration',
            {'completed':True, 'result':'unverified', 'water_m3':0.39}, datetime(2026,11,4).date())
        cfg['treatment'] = self.module.treatment_defaults()
        cfg['treatment'] = self.module.treatment_action(cfg['treatment'], 'gh',
            {'point':'softener', 'drops':4}, datetime(2026,11,4).date())
        return {'revision':17, 'settings':cfg, 'future_extra':{'keep':True}}

    async def test_import_preserves_all_records_revision_and_source(self):
        original = self.legacy()
        self.store.disk[SOURCE] = deepcopy(original)
        manager = self.module.FilterStore(self.hass)
        await manager.load()
        self.assertEqual(manager.data, original['settings'])
        self.assertEqual(manager.revision, 17)
        self.assertEqual(self.store.disk[SOURCE], original)
        target = self.store.disk[TARGET]
        self.assertEqual(target['migration']['source_snapshot'], original)
        self.assertEqual(target['future_extra'], original['future_extra'])
        self.assertEqual(self.store.writes, [TARGET])
        await manager.mutate('salt_topup', {'kg':2}, 17)
        self.assertEqual(self.store.disk[TARGET]['migration'], target['migration'])
        self.assertEqual(self.store.disk[SOURCE], original)
        self.assertEqual(manager.revision, 18)

    async def test_target_wins_and_restarts_never_reimport_archive(self):
        self.store.disk[SOURCE] = self.legacy()
        first = self.module.FilterStore(self.hass)
        await first.load()
        await first.mutate('salt_topup', {'kg':2}, 17)
        self.store.disk[SOURCE]['revision'] = 999
        again = self.module.FilterStore(self.hass)
        await again.load()
        self.assertEqual(again.revision, 18)
        self.assertEqual(again.data['salt']['last_added_kg'], 2)
        self.assertEqual(len(self.store.writes), 2)

    async def test_new_install_is_independent_and_persists_before_use(self):
        manager = self.module.FilterStore(self.hass)
        await manager.load()
        self.assertEqual(manager.revision, 0)
        self.assertEqual(self.store.writes, [TARGET])
        self.assertEqual(manager.data['people'], 3)
        self.assertNotIn(SOURCE, self.store.disk)

    async def test_import_waits_for_configured_accounting_handoff(self):
        self.store.disk[SOURCE] = self.legacy()
        self.hass.config_entries.async_entries = lambda _: [object()]
        with self.assertRaises((ValueError, RuntimeError)):
            await self.module.FilterStore(self.hass).load()
        self.assertNotIn(TARGET, self.store.disk)
        self.hass.data['water_accounting'] = {'treatment_split_ready':True}
        await self.module.FilterStore(self.hass).load()
        self.assertIn(TARGET, self.store.disk)

    async def test_active_legacy_writer_blocks_load_and_later_writes(self):
        self.store.disk[SOURCE] = self.legacy()
        self.hass.data['water_accounting'] = {'filters':object(), 'treatment_split_ready':True}
        with self.assertRaises((ValueError, RuntimeError)):
            await self.module.FilterStore(self.hass).load()
        self.assertNotIn(TARGET, self.store.disk)
        del self.hass.data['water_accounting']['filters']
        manager = self.module.FilterStore(self.hass)
        await manager.load()
        before = deepcopy(self.store.disk[TARGET])
        self.hass.data['water_accounting']['filters'] = object()
        with self.assertRaises((ValueError, RuntimeError)):
            await manager.mutate('salt_topup', {'kg':2}, 17)
        self.assertEqual(self.store.disk[TARGET], before)

    async def test_disk_failure_does_not_change_source_or_publish_manager(self):
        original = self.legacy()
        self.store.disk[SOURCE] = deepcopy(original)
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.module.async_setup_filters(self.hass)
        self.assertEqual(self.store.disk[SOURCE], original)
        self.assertNotIn(TARGET, self.store.disk)
        self.assertNotIn('filters', self.hass.data.get('water_treatment', {}))

    async def test_corrupt_source_or_target_never_become_empty_defaults(self):
        for key in (SOURCE, TARGET):
            for value in ({}, {'settings':[]}, {'settings':{}, 'revision':1},
                          {'settings':self.legacy()['settings'], 'revision':True}):
                with self.subTest(key=key, value=value):
                    self.store.disk.clear()
                    self.store.disk[key] = deepcopy(value)
                    before = deepcopy(self.store.disk)
                    with self.assertRaises((ValueError, TypeError)):
                        await self.module.FilterStore(self.hass).load()
                    self.assertEqual(self.store.disk, before)


if __name__ == '__main__': unittest.main()
