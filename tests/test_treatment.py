"""Water-treatment calculations and provenance, independent of HA."""
from datetime import date
from pathlib import Path
import runpy
import unittest

PATH = Path(__file__).resolve().parents[1] / 'custom_components/water_treatment/treatment_model.py'


class TreatmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = runpy.run_path(str(PATH)) if PATH.exists() else {}

    def function(self, name):
        fn = self.m.get(name)
        self.assertTrue(callable(fn), f'{name} is not implemented')
        return fn

    def test_nilpa_five_ml_conversion_and_source_points(self):
        measure = self.function('gh_measurement')
        for drops, expected in [(16, 5.7056), (7, 2.4962), (4, 1.4264), (12, 4.2792), (14, 4.9924)]:
            item = measure({'drops': drops, 'sample_ml': 5, 'point': 'softener', 'date': '2026-01-02'}, date(2026, 1, 3))
            self.assertEqual(item['zh'], expected)
            self.assertEqual(item['dgh'], drops)
            self.assertEqual(item['drops'], drops)
        for payload in [{'drops': True}, {'drops': 1.5}, {'drops': 0}, {'drops': float('nan')}, {'sample_ml': 10}, {'point': 'invented'}, {'date': '2027-01-01'}]:
            with self.assertRaises(ValueError):
                measure({'drops': 14, 'sample_ml': 5, 'point': 'softener', **payload}, date(2026, 1, 3))

    def test_old_profile_stage_duration_is_not_a_salt_dose(self):
        defaults = self.function('treatment_defaults')()
        summarize = self.function('treatment_status')
        self.assertEqual(summarize(defaults)['stage_minutes'], 92)
        self.assertEqual(defaults['profile']['resin_l'], 8)
        self.assertEqual(defaults['profile']['cycle_m3'], 1.2)
        self.assertEqual(defaults['profile']['refill_min'], 1)
        self.assertEqual(defaults['gh_history'], [])
        updated = self.function('treatment_action')(defaults, 'settings', {'refill_min': 2}, date(2026, 1, 3))
        self.assertEqual(summarize(updated)['stage_minutes'], 93)
        self.assertNotIn('dose', updated['profile'])

    def test_measurement_journal_retains_raw_and_does_not_imply_effectiveness(self):
        cfg = self.function('treatment_defaults')()
        updated = self.function('treatment_action')(cfg, 'gh', {'drops':14,'sample_ml':5,'point':'barrier'}, date(2026,1,3))
        self.assertEqual(updated['gh_history'][0]['point'], 'barrier')
        self.assertEqual(updated['gh_history'][0]['zh'], 4.9924)
        self.assertEqual(cfg['gh_history'], [])

    def test_resin_dates_are_separate_and_not_inferred(self):
        cfg = self.function('treatment_defaults')()
        self.assertIsNone(cfg['resin_since_year'])
        self.assertIsNone(cfg['resin_replaced'])
        updated = self.function('treatment_action')(cfg,'settings',{'resin_since_year':2018,'resin_replaced':None},date(2026,1,3))
        self.assertEqual(updated['resin_since_year'],2018)
        self.assertIsNone(updated['resin_replaced'])
        with self.assertRaises(ValueError):
            self.m['treatment_action'](cfg,'settings',{'resin_replaced':'2027-01-01'},date(2026,1,3))

    def test_latest_measurements_order_same_day_records_newest_first(self):
        cfg=self.function('treatment_defaults')()
        for drops in (7,12,14):
            cfg=self.function('treatment_action')(cfg,'gh',{'drops':drops,'point':'softener','date':'2026-01-03'},date(2026,1,3))
        cfg=self.m['treatment_action'](cfg,'gh',{'drops':16,'point':'mains','date':'2026-01-02'},date(2026,1,3))
        latest=self.function('treatment_status')(cfg)['latest_gh']
        self.assertEqual([item['drops'] for item in latest],[14,12,7,16])
