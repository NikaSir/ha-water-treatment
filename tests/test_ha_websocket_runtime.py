"""Smoke the schema as executed by an installed Home Assistant runtime."""
import importlib.util
import unittest


@unittest.skipUnless(importlib.util.find_spec('homeassistant'), 'Home Assistant runtime not installed')
class ActualHomeAssistantWebSocketTests(unittest.TestCase):
    def test_schema_defaults_and_invalid_message_use_runtime_exception(self):
        # Import HA first so its runtime can install its voluptuous compatibility alias.
        import homeassistant  # noqa: F401
        import probatio
        from custom_components.water_treatment.filters import filters_command
        schema = filters_command._ws_schema
        result = schema({'id': 1, 'type': 'water_treatment/filters'})
        self.assertEqual(result['action'], 'get')
        self.assertEqual(result['payload'], {})
        with self.assertRaises(probatio.Invalid):
            schema({'id': 2, 'type': 'water_treatment/filters', 'action': 'invalid'})


@unittest.skipUnless(importlib.util.find_spec('homeassistant'), 'Home Assistant runtime not installed')
class ActualHomeAssistantSetupTests(unittest.IsolatedAsyncioTestCase):
    async def test_setup_verifies_loaded_build_and_unload_cleans_publisher(self):
        from types import SimpleNamespace
        from tempfile import TemporaryDirectory
        from unittest.mock import patch
        from homeassistant.core import HomeAssistant
        import custom_components.water_treatment as component
        with TemporaryDirectory() as directory:
            hass = HomeAssistant(directory)
            class Manager:
                publisher = None
                envelope = {'notifications': {'lifecycle_seq': 0, 'transitions': [], 'observations': {}}}
                async def refresh_notifications(self): pass
            manager = Manager()
            async def setup_filters(hass): hass.data.setdefault('water_treatment', {})['filters'] = manager
            async def register_panel(hass): pass
            with patch.object(component, 'async_setup_filters', setup_filters), \
                 patch.object(component, 'async_register_panel', register_panel), \
                 patch.object(component, 'async_unregister_panel'):
                await component.async_setup_entry(hass, SimpleNamespace(entry_id='test-entry'))
                publisher = hass.data['water_treatment']['notification_publisher']
                self.assertTrue(publisher.runtime['verified'])
                self.assertEqual(publisher.runtime['fingerprint'], component.IMPORTED_FINGERPRINT)
                self.assertEqual(publisher.runtime['load_generation'], publisher.session)
                self.assertEqual(publisher.runtime['process_session'], hass.data['nikas_notifications_process_session'])
                await component.async_unload_entry(hass, SimpleNamespace(entry_id='test-entry'))
                self.assertTrue(publisher.stopped)
                self.assertNotIn('filters', hass.data['water_treatment'])
            await hass.async_stop(force=True)
