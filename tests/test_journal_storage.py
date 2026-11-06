"""Exercise the production storage boundary with real temporary files."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]/'custom_components/water_treatment'


class JournalStorageTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        class Store:
            fail_silently = False
            def __init__(self, hass, version, key, *, atomic_writes=False):
                self.hass, self.version, self.key = hass, version, key
                self.path = str(base/key)
                self.atomic = atomic_writes
            async def async_load(self):
                try:
                    return json.loads(Path(self.path).read_text())['data']
                except json.JSONDecodeError:
                    Path(self.path).rename(self.path+'.corrupt.test')
                    return None  # Actual HA recovery behavior that must be avoided.
                except FileNotFoundError:
                    return None
            async def async_save(self, value):
                if self.fail_silently:
                    return  # Actual Store catches WriteError rather than raising it.
                Path(self.path).write_text(json.dumps({'version':1,'minor_version':1,
                    'key':self.key,'data':value}))
        self.hass = SimpleNamespace(async_add_executor_job=lambda fn,*args: asyncio.to_thread(fn,*args))
        module = ModuleType('homeassistant.helpers.storage')
        module.Store = Store
        with patch.dict(sys.modules, {'homeassistant.helpers.storage':module}):
            path = ROOT/'journal_storage.py'
            spec = importlib.util.spec_from_file_location('_journal_boundary',path)
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.store = self.module.JournalStore(self.hass,1,'water_treatment.filters')

    async def test_atomic_save_is_verified_against_real_disk(self):
        value = {'settings':{'note':'test'},'revision':1}
        await self.store.async_save(value)
        self.assertTrue(self.store.atomic)
        self.assertEqual(await self.store.async_load(),value)
        self.assertEqual(json.loads(Path(self.store.path).read_text())['data'],value)

    async def test_silent_write_failure_never_acknowledges_a_new_revision(self):
        before = {'settings':{},'revision':1}
        await self.store.async_save(before)
        self.store.fail_silently = True
        with self.assertRaises(OSError):
            await self.store.async_save({'settings':{},'revision':2})
        self.assertEqual(await self.store.async_load(), before)

    async def test_corrupt_json_is_preserved_and_never_reported_as_missing(self):
        path = Path(self.store.path)
        path.write_text('{broken')
        for _ in range(2):
            with self.assertRaises(ValueError):
                await self.store.async_load()
        self.assertEqual(path.read_text(),'{broken')
        self.assertFalse(Path(str(path)+'.corrupt.test').exists())

    async def test_orphan_corrupt_backup_blocks_reinitialization(self):
        Path(self.store.path+'.corrupt.earlier').write_text('{broken')
        with self.assertRaises(ValueError):
            await self.store.async_load()
        self.assertFalse(Path(self.store.path).exists())

    async def test_missing_is_distinguished_from_unknown_schema_and_null_data(self):
        self.assertIsNone(await self.store.async_load())
        for content in ({}, {'version':2,'data':{}},
                        {'version':1,'minor_version':99,'data':{}},
                        {'version':1,'data':None}):
            Path(self.store.path).write_text(json.dumps(content))
            with self.assertRaises(ValueError):
                await self.store.async_load()


if __name__ == '__main__': unittest.main()
