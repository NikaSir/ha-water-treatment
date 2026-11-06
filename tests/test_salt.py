import runpy
import unittest
from datetime import date
from pathlib import Path

class SaltTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'custom_components/water_treatment/salt_model.py'))
    def test_unknown_not_inferred_from_topup(self):
        cfg=self.m['salt_defaults']()
        updated=self.m['salt_action'](cfg,'topup',{'kg':25},date(2026,10,12))
        self.assertEqual(updated['last_added_kg'],25)
        self.assertEqual(self.m['salt_status'](updated,date(2026,10,12))['state'],'unknown')
    def test_checked_and_overdue(self):
        cfg=self.m['salt_action'](self.m['salt_defaults'](),'check',{'level':'enough'},date(2026,10,12))
        self.assertEqual(self.m['salt_status'](cfg,date(2026,10,13))['state'],'ok')
        self.assertEqual(self.m['salt_status'](cfg,date(2026,10,18))['state'],'check')
        cfg=self.m['salt_action'](cfg,'check',{'level':'low'},date(2026,10,18))
        self.assertEqual(self.m['salt_status'](cfg,date(2026,10,18))['state'],'low')
    def test_settings_preserve_history_and_validate(self):
        cfg=self.m['salt_action'](self.m['salt_defaults'](),'topup',{'kg':25},date(2026,10,12))
        updated=self.m['salt_action'](cfg,'settings',{'dose':1.6,'check_days':7},date(2026,10,12))
        self.assertEqual(updated['last_added_kg'],25)
        with self.assertRaises(ValueError):self.m['salt_action'](cfg,'topup',{'kg':-1},date(2026,10,12))

    def action(self, cfg, action, payload):
        try:
            return self.m['salt_action'](cfg, action, payload, date(2026,10,27))
        except ValueError as err:
            self.fail(f'{action} rejected a valid event: {err}')

    def test_legacy_dose_retained_but_not_used_as_confirmed_consumption(self):
        migrate = self.m.get('migrate_salt')
        self.assertTrue(callable(migrate), 'migration is not implemented')
        cfg = migrate({'dose':1.5,'check_days':6,'history':[],'level':'unknown'})
        self.assertEqual(cfg['dose'],1.5)
        self.assertEqual(cfg['dose_basis'],'legacy_unverified')
        self.assertIsNone(cfg['known_kg'])
        self.assertEqual(self.m['salt_defaults']()['dose'],1)

    def test_tank_cleaning_sets_new_opening_stock_instead_of_adding_old(self):
        cfg=self.action(self.m['salt_defaults'](),'service',{'remaining_kg':2,'added_kg':8,'removed_kg':0,'refill_l':3})
        cfg=self.action(cfg,'service',{'remaining_kg':0,'added_kg':5,'removed_kg':10})
        self.assertEqual(cfg['known_kg'],5)
        self.assertEqual(cfg['estimated_kg'],5)
        self.assertEqual(cfg['last_tank_service'],'2026-10-27')
        self.assertEqual(cfg['history'][-1]['removed_kg'],10)
        self.assertEqual(cfg['regenerations'],0)
        cfg=self.action(cfg,'remove',{'kg':1})
        self.assertEqual(cfg['known_kg'],4)
        self.assertEqual(cfg['regenerations'],0)

    def test_unmeasured_cycle_has_only_an_estimate_and_separate_effectiveness(self):
        cfg=self.action(self.m['salt_defaults'](),'service',{'remaining_kg':0,'added_kg':5})
        cfg=self.action(cfg,'regeneration',{'completed':True,'result':'unverified','water_m3':0.39,'refill_l':3})
        self.assertIsNone(cfg['known_kg'])
        self.assertEqual(cfg['estimated_kg'],4)
        self.assertEqual(cfg['regenerations'],1)
        self.assertEqual(cfg['history'][-1]['result'],'unverified')
        self.assertEqual(cfg['history'][-1]['estimated_salt_kg'],1)
        self.assertEqual(cfg['level'],'unknown')
        cfg=self.action(cfg,'settings',{'dose':2})
        self.assertEqual(cfg['estimated_kg'],4)  # past assumptions are not retroactively rewritten

    def test_measured_cycle_and_nominal_coverage(self):
        cfg=self.action(self.m['salt_defaults'](),'service',{'remaining_kg':0,'added_kg':5})
        state=self.m['salt_status'](cfg,date(2026,10,27),{'cycle_m3':1.2,'max_days':6,'daily_service_m3':0.49})
        self.assertEqual(state['full_cycles'],5)
        self.assertEqual(state['nominal_m3'],6)
        self.assertAlmostEqual(state['scenario_days'],12.244898,places=5)
        cfg=self.action(cfg,'regeneration',{'completed':True,'result':'confirmed','salt_kg':0.8})
        self.assertEqual(cfg['known_kg'],4.2)
        self.assertEqual(cfg['estimated_kg'],4.2)

    def test_missing_or_invalid_stock_events_never_create_a_balance(self):
        cfg=self.action(self.m['salt_defaults'](),'topup',{'kg':5})
        self.assertIsNone(cfg.get('known_kg'))
        for action,payload in [('service',{'remaining_kg':None,'added_kg':5}),('service',{'remaining_kg':-1,'added_kg':5}),('regeneration',{'completed':False}),('regeneration',{'completed':True,'result':'invented'}),('remove',{'kg':float('nan')}),('topup',{'kg':True}),('service',{'remaining_kg':0,'added_kg':5,'date':'2027-01-01'})]:
            with self.assertRaises(ValueError):
                self.m['salt_action'](cfg,action,payload,date(2026,10,27))
