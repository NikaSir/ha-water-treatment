import ast
import json
from pathlib import Path
import runpy
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
C = ROOT/'custom_components/water_treatment'


class ContractTests(unittest.TestCase):
    def test_metadata_identity_versions_and_dependencies(self):
        constants = runpy.run_path(str(C/'const.py'))
        manifest = json.loads((C/'manifest.json').read_text())
        panel = json.loads((C/'panel_manifest.json').read_text())
        contract = json.loads((ROOT/'panel_contract.json').read_text())
        profile = json.loads((ROOT/'.nikas-ui-standard.json').read_text())
        package = json.loads((ROOT/'package.json').read_text())
        self.assertEqual(manifest['domain'], 'water_treatment')
        self.assertEqual(manifest['dependencies'], ['http','panel_custom','websocket_api'])
        self.assertEqual({constants['UI_VERSION'], constants['INTEGRATION_VERSION'],
            manifest['version'], panel['ui_version'], contract['ui_version'], profile['ui_version'],
            package['version']}, {'0.2.0-beta008'})
        self.assertEqual(panel['panel_root'], '/dashboard-water-treatment')
        self.assertEqual(contract['entry_route'], panel['panel_root'])
        self.assertEqual(contract['tabs'], ['overview','filters','softener','quality','settings'])
        registration = ast.parse((C/'panel.py').read_text())
        metadata = next(node.value for node in registration.body if isinstance(node, ast.Assign)
                        and any(isinstance(target, ast.Name) and target.id == 'PANEL_METADATA' for target in node.targets))
        registered_tabs = ast.literal_eval(next(value for key, value in zip(metadata.keys, metadata.values)
                                               if isinstance(key, ast.Constant) and key.value == 'tabs'))
        self.assertEqual([tab[0] for tab in registered_tabs], contract['tabs'])
        self.assertEqual(registered_tabs[-1], ['settings', 'mdi:cog-outline', 'Настройки'])
        self.assertEqual(panel['preferred_view'], 'overview')
        self.assertEqual(constants['ENTITY_MAP'], contract['entities'])
        self.assertEqual(len(constants['ENTITY_MAP']), 1)
        self.assertEqual(panel['owner'], 'water_treatment')

    def test_configuration_and_locales_are_independent(self):
        for name in ['strings.json','translations/ru.json','translations/en.json']:
            data = json.loads((C/name).read_text())
            self.assertIn('user', data['config']['step'])
        flow = (C/'config_flow.py').read_text()
        self.assertIn('Водоподготовка', flow)
        self.assertNotIn('water_accounting', flow)

    def test_python_and_json_parse_and_brand_survives_extraction(self):
        for path in C.rglob('*.py'):
            ast.parse(path.read_text(), filename=str(path))
        for path in ROOT.rglob('*.json'):
            json.loads(path.read_text())
        icon = (C/'brand/icon.png').read_bytes()
        self.assertTrue(icon.startswith(b'\x89PNG\r\n\x1a\n'))
        self.assertEqual(struct.unpack('>II',icon[16:24]), (256,256))

    def test_route_registered_before_store_load_and_retry_keeps_it(self):
        setup = (C/'__init__.py').read_text()
        self.assertLess(setup.index('await async_register_panel(hass)'),setup.index('await async_setup_filters(hass)'))
        self.assertIn('raise ConfigEntryNotReady', setup)
        self.assertNotIn('async_unregister_panel(hass)', setup.split('async def async_unload_entry')[0])
