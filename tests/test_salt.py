import runpy
import unittest
from copy import deepcopy
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

class RetrospectiveSaltTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'custom_components/water_treatment/salt_model.py'))

    def record(self, cfg, action, stamp, **payload):
        try:
            return self.m['salt_action'](cfg, action, {'date': stamp, **payload}, date(2026, 11, 8))
        except ValueError as err:
            self.fail(f'{action} on {stamp} rejected a valid event: {err}')

    def opening(self, kg):
        return self.record(self.m['salt_defaults'](), 'service', '2026-10-27', remaining_kg=0, added_kg=kg)

    def test_backdated_measured_cycle_preserves_metadata_and_append_only_history(self):
        cfg = self.record(self.m['salt_defaults'](), 'service', '2026-10-24', remaining_kg=0, added_kg=25)
        cfg = self.record(cfg, 'regeneration', '2026-10-25', completed=True)
        cfg = self.record(cfg, 'service', '2026-10-27', remaining_kg=0, added_kg=5)
        cfg = self.record(cfg, 'regeneration', '2026-11-01', completed=True, salt_kg=1)
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=5)
        cfg = self.record(cfg, 'check', '2026-11-04', level='low')
        before = deepcopy(cfg)

        updated = self.record(cfg, 'regeneration', '2026-10-30', completed=True, salt_kg=0.75,
                              result='confirmed', water_m3=0.39, refill_l=3)

        self.assertEqual(updated['known_kg'], 8.25)
        self.assertEqual(updated['estimated_kg'], 8.25)
        self.assertEqual(updated['regenerations'], 3)  # Includes the cycle before the stock reset.
        self.assertEqual(updated['history'][:-1], before['history'])
        self.assertEqual(updated['history'][-1]['date'], '2026-10-30')
        self.assertEqual(updated['history'][-1]['water_m3'], 0.39)
        self.assertEqual(updated['history'][-1]['refill_l'], 3)
        for key in ('last_ledger_date', 'last_tank_service', 'last_added', 'last_added_kg',
                    'last_checked', 'level', 'dose', 'dose_basis', 'check_days'):
            self.assertEqual(updated[key], before[key], key)
        self.assertEqual(cfg, before)

    def test_zero_clamped_estimate_does_not_subtract_missed_cycle_from_later_topup(self):
        cfg = self.opening(1)
        cfg = self.record(cfg, 'settings', '2026-10-27', dose=2)
        cfg = self.record(cfg, 'regeneration', '2026-10-31', completed=True)
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=5)
        cfg = self.record(cfg, 'settings', '2026-11-04', dose=1)

        updated = self.record(cfg, 'regeneration', '2026-10-29', completed=True)

        self.assertEqual(updated['estimated_kg'], 5)
        self.assertIsNone(updated['known_kg'])
        self.assertEqual(updated['last_ledger_date'], '2026-11-03')

    def test_replay_uses_saved_estimates_across_settings_changes_and_multiple_insertions(self):
        cfg = self.opening(10)
        cfg = self.record(cfg, 'settings', '2026-10-27', dose=1.5)
        cfg = self.record(cfg, 'regeneration', '2026-10-31', completed=True)
        cfg = self.record(cfg, 'settings', '2026-11-01', dose=2.25)

        updated = self.record(cfg, 'regeneration', '2026-10-29', completed=True)
        self.assertEqual(updated['estimated_kg'], 6.25)
        self.assertEqual(updated['history'][1]['estimated_salt_kg'], 1.5)
        self.assertEqual(updated['history'][-1]['estimated_salt_kg'], 2.25)

        updated = self.record(updated, 'settings', '2026-11-02', dose=5)
        updated = self.record(updated, 'regeneration', '2026-10-28', completed=True)
        self.assertEqual(updated['estimated_kg'], 1.25)
        self.assertEqual(updated['regenerations'], 3)
        self.assertEqual(updated['last_ledger_date'], '2026-10-31')

    def test_unknown_historical_dose_stays_unknown_after_replay_and_topup(self):
        cfg = self.opening(5)
        cfg = self.record(cfg, 'settings', '2026-10-27', dose=1.5, dose_basis='legacy_unverified')
        cfg = self.record(cfg, 'regeneration', '2026-10-31', completed=True)
        cfg = self.record(cfg, 'settings', '2026-11-01', dose=2, dose_basis='assumed')
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=2)

        updated = self.record(cfg, 'regeneration', '2026-10-29', completed=True, salt_kg=1)

        self.assertIsNone(updated['known_kg'])
        self.assertIsNone(updated['estimated_kg'])
        self.assertIsNone(updated['history'][1]['estimated_salt_kg'])

    def test_intervening_removal_and_zero_measured_consumption_replay_as_measured(self):
        cfg = self.opening(5)
        cfg = self.record(cfg, 'regeneration', '2026-10-31', completed=True, salt_kg=0)
        cfg = self.record(cfg, 'remove', '2026-11-01', kg=1.25)
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=2)

        updated = self.record(cfg, 'regeneration', '2026-10-29', completed=True, salt_kg=0.75)

        self.assertEqual(updated['known_kg'], 5)
        self.assertEqual(updated['estimated_kg'], 5)
        self.assertEqual(updated['history'][1]['salt_kg'], 0)

    def test_measured_cycle_cannot_spend_a_future_topup(self):
        cfg = self.opening(2)
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=5)
        before = deepcopy(cfg)

        with self.assertRaisesRegex(ValueError, 'Расход больше'):
            self.m['salt_action'](cfg, 'regeneration',
                {'date': '2026-10-29', 'completed': True, 'salt_kg': 3}, date(2026, 11, 8))

        self.assertEqual(cfg, before)

    def test_replay_rejects_underflow_in_a_later_measured_event_atomically(self):
        for action, payload in (('remove', {'kg': 4}),
                                ('regeneration', {'completed': True, 'salt_kg': 4})):
            with self.subTest(action=action):
                cfg = self.opening(5)
                cfg = self.record(cfg, action, '2026-10-31', **payload)
                cfg = self.record(cfg, 'topup', '2026-11-03', kg=5)
                before = deepcopy(cfg)

                with self.assertRaisesRegex(ValueError, 'Расход больше'):
                    self.m['salt_action'](cfg, 'regeneration',
                        {'date': '2026-10-29', 'completed': True, 'salt_kg': 2}, date(2026, 11, 8))

                self.assertEqual(cfg, before)

    def test_same_day_cycle_follows_service_and_existing_same_day_events(self):
        cfg = self.opening(1)
        cfg = self.record(cfg, 'settings', '2026-10-27', dose=2)
        cfg = self.record(cfg, 'regeneration', '2026-10-27', completed=True)
        cfg = self.record(cfg, 'topup', '2026-10-27', kg=5)
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=1)
        cfg = self.record(cfg, 'settings', '2026-11-04', dose=1)

        updated = self.record(cfg, 'regeneration', '2026-10-27', completed=True)

        self.assertEqual(updated['estimated_kg'], 5)
        self.assertEqual(updated['last_tank_service'], '2026-10-27')
        self.assertEqual(updated['last_ledger_date'], '2026-11-03')

    def test_cycle_before_latest_service_is_rejected_without_changing_history(self):
        cfg = self.opening(5)
        cfg = self.record(cfg, 'regeneration', '2026-10-29', completed=True)
        cfg = self.record(cfg, 'service', '2026-11-01', remaining_kg=0, added_kg=3)
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=2)
        before = deepcopy(cfg)

        with self.assertRaises(ValueError):
            self.m['salt_action'](cfg, 'regeneration',
                {'date': '2026-10-30', 'completed': True}, date(2026, 11, 8))

        self.assertEqual(cfg, before)

    def test_no_service_rejects_retrospective_cycle_but_keeps_new_unknown_stock_cycles(self):
        cfg = self.record(self.m['salt_defaults'](), 'topup', '2026-11-03', kg=5)
        before = deepcopy(cfg)
        with self.assertRaises(ValueError):
            self.m['salt_action'](cfg, 'regeneration',
                {'date': '2026-10-30', 'completed': True}, date(2026, 11, 8))
        self.assertEqual(cfg, before)

        updated = self.record(cfg, 'regeneration', '2026-11-04', completed=True)
        self.assertIsNone(updated['known_kg'])
        self.assertIsNone(updated['estimated_kg'])
        self.assertEqual(updated['regenerations'], 1)
        self.assertEqual(updated['last_ledger_date'], '2026-11-04')

    def test_other_stock_actions_remain_chronological(self):
        cfg = self.opening(5)
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=2)
        before = deepcopy(cfg)
        for action, payload in (('topup', {'kg': 1}), ('remove', {'kg': 1}),
                                ('service', {'remaining_kg': 0, 'added_kg': 3})):
            with self.subTest(action=action), self.assertRaises(ValueError):
                self.m['salt_action'](cfg, action, {'date': '2026-10-30', **payload}, date(2026, 11, 8))
        self.assertEqual(cfg, before)

    def test_cleanup_preserves_retrospective_cycle_and_replayed_balance(self):
        cfg = self.opening(5)
        cfg = self.record(cfg, 'topup', '2026-11-03', kg=2)
        for _ in range(2):
            cfg = self.record(cfg, 'check', '2026-11-04', level='enough')
        cfg = self.record(cfg, 'regeneration', '2026-10-30', completed=True)
        original = deepcopy(cfg)

        cleaned = self.record(cfg, 'cleanup', '2026-11-08')

        self.assertEqual(len(cleaned['history']), len(original['history']) - 1)
        self.assertEqual(cleaned['history'][-1], original['history'][-1])
        self.assertEqual(cleaned['history_archive'][-1]['history'], original['history'])
        self.assertEqual(cleaned['estimated_kg'], 6)
        self.assertEqual(cleaned['regenerations'], 1)


class CleanupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'custom_components/water_treatment/salt_model.py'))
    def test_cleanup_archives_only_safe_exact_duplicates(self):
        act = self.m['salt_action']
        today = date(2026,11,8)
        cfg = self.m['salt_defaults']()
        for _ in range(2):
            cfg = act(cfg, 'topup', {'date':'2026-10-27','kg':5}, today)
        cfg = act(cfg, 'service', {'date':'2026-10-28','remaining_kg':0,'added_kg':5}, today)
        for _ in range(2):
            cfg = act(cfg, 'topup', {'date':'2026-11-01','kg':5}, today)
        for _ in range(2):
            cfg = act(cfg, 'check', {'level':'enough'}, today)
        original = cfg['history'][:]
        cleaned = act(cfg, 'cleanup', {}, today)
        self.assertEqual(len(cleaned['history']), len(original)-2)
        self.assertEqual(cleaned['history_archive'][-1]['history'], original)
        self.assertEqual(cleaned['estimated_kg'], cfg['estimated_kg'])
        self.assertEqual(cleaned['known_kg'], cfg['known_kg'])
        self.assertEqual(sum(e['action']=='topup' and e['date']=='2026-11-01' for e in cleaned['history']), 2)
        again = act(cleaned, 'cleanup', {}, today)
        self.assertEqual(again, cleaned)
