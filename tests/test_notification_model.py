"""Conservative notification evidence and ordered lifecycle tests."""
import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]/'custom_components/water_treatment'


class NotificationModelTests(unittest.TestCase):
    def setUp(self):
        path = ROOT/'notification_model.py'
        self.assertTrue(path.exists(), 'notification model is missing')
        spec = importlib.util.spec_from_file_location('_notification_model_test', path)
        self.model = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.model)
        self.now = datetime(2026, 10, 12, 12, tzinfo=timezone.utc)

    def test_settings_only_cannot_resolve_and_replacement_can(self):
        initial = self.model.initial_state()
        active = self.model.assess(initial, 'ferrostop', 'due', None, 1, self.now)
        uncertain = self.model.assess(active, 'ferrostop', 'ok', None, 2, self.now)
        self.assertEqual(uncertain['observations']['ferrostop']['state'], 'unknown')
        evidence = {'kind': 'filter_replaced', 'evidence_id': 'op1', 'subject_id': 'ferrostop',
                    'source_revision': 3, 'evaluated_at': self.now.isoformat(), 'details': {}}
        resolved = self.model.assess(uncertain, 'ferrostop', 'ok', evidence, 3, self.now)
        self.assertEqual(resolved['observations']['ferrostop']['state'], 'inactive')
        self.assertEqual([x['lifecycle_seq'] for x in resolved['transitions']], [1, 2, 3])

    def test_salt_old_day_or_same_day_without_instant_cannot_resolve(self):
        proof = {'date': '2026-10-12', 'performed_at': None, 'level': 'enough'}
        low = {'date': '2026-10-12', 'performed_at': None, 'level': 'low'}
        self.assertFalse(self.model.salt_check_after(proof, low))
        proof['date'] = '2026-10-11'
        self.assertFalse(self.model.salt_check_after(proof, low))
        proof['date'] = '2026-10-13'
        self.assertTrue(self.model.salt_check_after(proof, low))
        proof.update(date='2026-10-12', performed_at='2026-10-12T12:00:00+00:00')
        low['performed_at'] = '2026-10-12T11:00:00+00:00'
        self.assertTrue(self.model.salt_check_after(proof, low))

    def test_volume_requires_confirmed_baseline_and_later_sample(self):
        evidence = {'baseline_confirmed': True, 'recorded_at': self.now.isoformat(), 'baseline': 20.0}
        self.assertFalse(self.model.volume_verified(evidence, 21, None))
        self.assertFalse(self.model.volume_verified(evidence, 19, self.now.isoformat()))
        self.assertFalse(self.model.volume_verified({**evidence, 'baseline_confirmed': False}, 21, self.now.isoformat()))
        self.assertTrue(self.model.volume_verified(evidence, 21, self.now.isoformat()))

    def test_transition_limit_preserves_maintenance_and_marks_overflow(self):
        state = self.model.initial_state()
        state['lifecycle_seq'] = 4096
        result = self.model.assess(state, 'main', 'due', None, 9, self.now)
        self.assertTrue(result['overflow'])
        self.assertEqual(result['lifecycle_seq'], 4096)
        self.assertEqual(result['transitions'], [])
