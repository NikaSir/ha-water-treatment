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
