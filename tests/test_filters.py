import runpy
import unittest
from datetime import date
from pathlib import Path

MODEL = Path(__file__).resolve().parents[1] / 'custom_components/water_treatment/filter_model.py'

class FilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = runpy.run_path(str(MODEL))

    def test_profiles_and_hardness(self):
        self.assertEqual(self.m['PROFILES']['mechanical']['volume'], 100)
        self.assertEqual(self.m['PROFILES']['wound']['volume'], 200)
        self.assertEqual(self.m['softening_months'](2, 3.7), 2.5)
        self.assertEqual(self.m['softening_months'](1, 2), 6)
        self.assertIsNone(self.m['softening_months'](4, 3))
        self.assertIsNone(self.m['softening_months'](2, 6))

    def test_initial_household_calculation_uses_three_people(self):
        initial = self.m['defaults']()
        configured = self.m['update_settings'](initial, {'hardness': 3})
        self.assertEqual(configured['cartridges']['softening']['months'], 2)

    def test_softening_basis_explains_low_hardness_without_extrapolation(self):
        for hardness in (0.7132, 1.4264, 3):
            with self.subTest(hardness=hardness):
                cfg = self.m['update_settings'](self.m['defaults'](), {'hardness': hardness})
                basis = self.m['softening_basis'](cfg)
                self.assertEqual(basis['mode'], 'table')
                self.assertEqual(basis['reason'], 'table')
                self.assertEqual(basis['band_max'], 3)
                self.assertEqual(basis['table_months'], 2)
                self.assertEqual(basis['applied_months'], 2)
                self.assertEqual(basis['hardness'], hardness)

    def test_softening_basis_preserves_exact_thresholds_and_cap(self):
        for hardness, band, months in ((3.0001, 4, 1.5), (4, 4, 1.5),
                                      (4.0001, 5, 1), (4.9924, 5, 1), (5, 5, 1)):
            with self.subTest(hardness=hardness):
                cfg = self.m['update_settings'](self.m['defaults'](), {'hardness': hardness})
                basis = self.m['softening_basis'](cfg)
                self.assertEqual(basis['band_max'], band)
                self.assertEqual(basis['recommended_months'], months)
                self.assertEqual(basis['applied_months'], months)
        cfg = self.m['update_settings'](self.m['defaults'](), {'people': 1, 'hardness': 2})
        basis = self.m['softening_basis'](cfg)
        self.assertEqual(basis['table_months'], 7)
        self.assertEqual(basis['recommended_months'], 6)
        self.assertTrue(basis['capped'])

    def test_softening_basis_reports_missing_and_out_of_table_inputs(self):
        for settings, reason in (({'hardness': None}, 'missing_hardness'),
                                 ({'hardness': 5.349}, 'hardness_out_of_range'),
                                 ({'hardness': 2, 'people': 4}, 'people_out_of_range')):
            with self.subTest(settings=settings):
                cfg = self.m['update_settings'](self.m['defaults'](), settings)
                basis = self.m['softening_basis'](cfg)
                self.assertEqual(basis['reason'], reason)
                self.assertIsNone(basis['recommended_months'])
                self.assertIsNone(basis['applied_months'])

    def test_manual_interval_and_other_cartridges_are_independent_of_hardness(self):
        cfg = self.m['update_settings'](self.m['defaults'](), {
            'softening_auto': False, 'hardness': 0.7132,
            'months': {'ferrostop': 4, 'softening': 5, 'postcarbon': 6}})
        basis = self.m['softening_basis'](cfg)
        self.assertEqual(basis['mode'], 'manual')
        self.assertEqual(basis['applied_months'], 5)
        self.assertEqual(basis['recommended_months'], 2)
        updated = self.m['update_settings'](cfg, {'hardness': 4.9924})
        self.assertEqual(updated['cartridges'], cfg['cartridges'])
        automatic = self.m['update_settings'](updated, {'softening_auto': True})
        self.assertEqual(automatic['cartridges']['softening']['months'], 1)
        self.assertEqual(automatic['cartridges']['ferrostop']['months'], 4)
        self.assertEqual(automatic['cartridges']['postcarbon']['months'], 6)

    def test_existing_household_choice_is_preserved(self):
        configured = self.m['defaults']()
        configured['people'] = 2
        updated = self.m['update_settings'](configured, {'hardness': 3})
        self.assertEqual(updated['cartridges']['softening']['months'], 3.5)

    def test_calendar_and_overdue(self):
        self.assertEqual(self.m['deadline']('2026-08-31', 6), date(2027, 2, 28))
        s = self.m['status']({'date':'2026-01-01','months':6}, date(2026,7,2))
        self.assertEqual(s['days'], -1)
        self.assertEqual(s['state'], 'due')

    def test_unknown_reset_and_drinking_only(self):
        cfg = {'date':'2026-01-01','months':6,'volume':100,'baseline':350,'mode':'volume'}
        self.assertEqual(self.m['status'](cfg, date(2026,2,1), 360)['used'], 10)
        self.assertEqual(self.m['status'](cfg, date(2026,2,1), None)['state'], 'unknown')
        self.assertEqual(self.m['status'](cfg, date(2026,2,1), 1)['state'], 'unknown')
        self.assertEqual(self.m['status']({}, date(2026,2,1))['state'], 'unconfigured')
        self.assertEqual(self.m['status']({**cfg,'mode':'both'}, date(2026,7,2), None)['state'], 'due')

    def test_settings_preserve_replacement(self):
        old = self.m['defaults']()
        old['main'].update(date='2026-01-01',baseline=350)
        new = self.m['update_settings'](old, {'main': {'profile':'wound','volume':200,'months':6,'mode':'both'},'people':2,'hardness':4,'softening_auto':True,'months':{'ferrostop':6,'softening':6,'postcarbon':6}})
        self.assertEqual(new['main']['baseline'], 350)
        self.assertEqual(new['main']['date'], '2026-01-01')
        self.assertEqual(new['cartridges']['softening']['months'], 2.5)
        with self.assertRaises(ValueError):
            self.m['update_settings'](old, {'main': {'volume':0}})
