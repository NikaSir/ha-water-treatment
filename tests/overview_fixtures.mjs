// Synthetic maintenance snapshots for automated tests; never production readings.
export function overviewFixture() {
  return {
    revision: 4, today: '2026-11-07', meter: 112,
    settings: {
      people: 3, hardness: 1.4264, softening_auto: true,
      main: {profile: 'mechanical', volume: 100, months: 6, mode: 'volume', date: '2026-10-01', baseline: 100},
      cartridges: {
        ferrostop: {months: 6, date: '2026-10-01'},
        softening: {months: 2, date: '2026-10-01'},
        postcarbon: {months: 6, date: '2026-10-01'},
      },
      salt: {schema: 2, model: 'Ёлка WSC-0,5-Rx-(SC)', dose: 1, dose_basis: 'assumed',
        check_days: 6, level: 'enough', last_checked: '2026-11-06', last_added: '2026-11-04',
        last_added_kg: 5, known_kg: null, estimated_kg: 4, last_ledger_date: '2026-11-04',
        last_tank_service: '2026-11-01', regenerations: 1,
        history: [{action: 'service', date: '2026-11-01', remaining_kg: 0, added_kg: 5},
          {action: 'regeneration', date: '2026-11-04', result: 'confirmed', salt_kg: null, estimated_salt_kg: 1},
          {action: 'check', date: '2026-11-06', level: 'enough'}]},
      treatment: {profile: {resin_l: 8, resin_basis: 'assumed', cycle_m3: 1.2,
        cycle_basis: 'temporary_setting', max_days: 6, mode: 'A-01', time: '03:00',
        volume_unit: 'HU-01', backwash_mode: 'F-00', signal: 'b-01', backwash_min: 10,
        brine_min: 75, refill_min: 1, fast_rinse_min: 6, daily_service_m3: null},
        resin_since_year: null, resin_replaced: null,
        gh_history: [{date: '2026-11-05', point: 'softener', sample_ml: 5, drops: 4, dgh: 4, zh: 1.4264}]},
    },
    salt_status: {state: 'ok', days: 5, known_remaining_kg: null, estimated_remaining_kg: 4,
      full_cycles: 4, nominal_m3: 4.8, scenario_days: null},
    treatment_status: {stage_minutes: 92, latest_gh: [
      {date: '2026-11-05', point: 'softener', sample_ml: 5, drops: 4, dgh: 4, zh: 1.4264}]},
    softening_basis: {mode: 'table', people: 3, hardness: 1.4264, reason: 'table',
      band_max: 3, table_months: 2, recommended_months: 2, applied_months: 2,
      limit_months: 6, capped: false,
      source_url: 'https://www.barrier.ru/images/manuals/BARRIER_EXPERT_instruction.pdf'},
    status: {
      main: {state: 'ok', days: 145, deadline: '2027-04-01', used: 12, remaining: 88, percent: 88},
      ferrostop: {state: 'ok', days: 145, deadline: '2027-04-01', used: null, remaining: null, percent: null},
      softening: {state: 'ok', days: 24, deadline: '2026-12-01', used: null, remaining: null, percent: null},
      postcarbon: {state: 'ok', days: 145, deadline: '2027-04-01', used: null, remaining: null, percent: null},
    },
  };
}

export function emptyOverviewFixture() {
  const data = overviewFixture();
  Object.assign(data.settings.main, {date: null, baseline: null});
  Object.values(data.settings.cartridges).forEach(item => { item.date = null; });
  Object.assign(data.settings.salt, {level: 'unknown', last_checked: null, last_added: null,
    last_added_kg: null, known_kg: null, estimated_kg: null, last_ledger_date: null,
    last_tank_service: null, regenerations: 0, history: []});
  data.settings.treatment.gh_history = [];
  data.treatment_status.latest_gh = [];
  data.salt_status = {state: 'unknown', days: null, known_remaining_kg: null,
    estimated_remaining_kg: null, full_cycles: null, nominal_m3: null, scenario_days: null};
  data.settings.hardness = null;
  data.settings.cartridges.softening.months = null;
  Object.assign(data.softening_basis, {hardness: null, reason: 'missing_hardness',
    band_max: null, table_months: null, recommended_months: null, applied_months: null});
  for (const key of Object.keys(data.status)) data.status[key] = {
    state: 'unconfigured', days: null, used: null, remaining: null, percent: null};
  return data;
}
