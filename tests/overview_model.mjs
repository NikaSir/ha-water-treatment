import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {overviewFixture, emptyOverviewFixture} from './overview_fixtures.mjs';

const scope = vm.createContext({Intl, Date});
const source = await readFile(new URL('../custom_components/water_treatment/frontend/src/overview-model.js', import.meta.url), 'utf8').catch(() => '');
vm.runInContext(source, scope);
function model(data, options) {
  assert.equal(typeof scope.waterOverviewModel, 'function', 'The overview snapshot model must exist');
  return scope.waterOverviewModel(data, options);
}

test('empty journal keeps resource and salt unknown instead of showing zero or green', () => {
  const view = model(emptyOverviewFixture());
  assert.equal(view.main.used, null);
  assert.equal(view.main.percent, null);
  assert.equal(view.main.tone, 'unknown');
  assert.equal(view.softener.saltKg, null);
  assert.equal(view.softener.regenerationDate, null);
  assert.ok(view.barrier.rows.every(row => row.tone === 'unknown'));
  assert.ok(view.barrier.rows.every(row => row.percent === null));
});

test('zero used volume is shown as zero, and exhausted volume is due', () => {
  const data = overviewFixture();
  Object.assign(data.status.main, {used: 0, remaining: 100, percent: 100});
  assert.equal(model(data).main.used, 0);
  Object.assign(data.status.main, {state: 'due', used: 100, remaining: 0, percent: 0});
  const view = model(data);
  assert.equal(view.main.percent, 0);
  assert.equal(view.main.tone, 'due');
  assert.equal(view.notice.view, 'filters');
  assert.equal(view.notice.filter, 'main');
});

test('missing or reset meter does not fabricate main resource', () => {
  const data = overviewFixture();
  Object.assign(data.status.main, {state: 'unknown', used: null, remaining: null, percent: null});
  data.meter = null;
  assert.equal(model(data).main.percent, null);
  assert.equal(model(data).main.tone, 'unknown');
  data.meter = 0;
  assert.equal(model(data).main.used, null);
});

test('time and combined control honor the configured rule without changing it', () => {
  const data = overviewFixture();
  data.settings.main.mode = 'time';
  data.settings.main.date = '2026-11-01';
  Object.assign(data.status.main, {state: 'ok', days: 4, deadline: '2026-11-11', percent: 88});
  assert.equal(model(data).main.percent, 40);
  assert.match(model(data).main.resourceLabel, /срок/);
  data.settings.main.mode = 'both';
  assert.equal(model(data).main.percent, 40);
  assert.match(model(data).main.resourceLabel, /объёму.*сроку/);
  assert.equal(data.settings.main.mode, 'both');
});

test('time control keeps used volume without claiming its inactive resource is exhausted', () => {
  const data = overviewFixture();
  data.settings.main.mode = 'time';
  Object.assign(data.status.main, {state: 'ok', used: 110, remaining: -10, percent: 0});
  const view = model(data);
  assert.equal(view.main.used, 110);
  assert.equal(view.main.tone, 'ok');
  assert.ok(view.main.percent > 0);
  assert.match(view.main.detail, /145 дней/);
  assert.doesNotMatch(view.main.detail, /исчерпан|м³/);
});

test('an expired calendar rule remains due even if the meter is unavailable', () => {
  const data = overviewFixture();
  data.settings.main.mode = 'both';
  Object.assign(data.status.main, {state: 'due', days: -3, used: null, remaining: null, percent: null});
  const view = model(data);
  assert.equal(view.main.tone, 'due');
  assert.equal(view.main.percent, null);
  assert.match(view.main.detail, /3/);
});

test('BARRIER shows each deadline and prioritizes its overdue cartridge', () => {
  const data = overviewFixture();
  Object.assign(data.status.softening, {state: 'due', days: -3, deadline: '2026-11-04'});
  const view = model(data);
  assert.match(view.barrier.rows[1].text, /Просрочено.*3/);
  assert.equal(view.barrier.rows[0].tone, 'ok');
  assert.equal(view.barrier.rows[2].tone, 'ok');
  assert.equal(view.barrier.tone, 'due');
  assert.equal(view.notice.filter, 'softening');
  data.status.softening.days = 0;
  assert.match(model(data).barrier.rows[1].text, /сегодня/);
});

test('BARRIER remaining resource follows each actual calendar interval independently', () => {
  const data = overviewFixture();
  const rows = model(data).barrier.rows;
  assert.equal(rows[0].percent, 100 * 145 / 182);
  assert.equal(rows[1].percent, 100 * 24 / 61);
  assert.equal(rows[2].percent, 100 * 145 / 182);
  Object.assign(data.status.main, {percent: 1, remaining: 1});
  assert.deepEqual(Array.from(model(data).barrier.rows, row => row.percent), Array.from(rows, row => row.percent));
});

test('BARRIER uses actual short-month and fractional-month deadlines', () => {
  const data = overviewFixture();
  data.today = '2024-02-14';
  data.settings.cartridges.ferrostop.date = '2024-01-31';
  Object.assign(data.status.ferrostop, {days: 15, deadline: '2024-02-29'});
  data.settings.cartridges.softening.date = '2024-02-07';
  Object.assign(data.status.softening, {days: 8, deadline: '2024-02-22'});
  const rows = model(data).barrier.rows;
  assert.equal(rows[0].percent, 100 * 15 / 29);
  assert.equal(rows[1].percent, 100 * 8 / 15);
});

test('BARRIER distinguishes full, due and overdue resource while retaining individual status colors', () => {
  const data = overviewFixture();
  Object.assign(data.status.ferrostop, {state: 'ok', days: 182});
  Object.assign(data.status.softening, {state: 'warning', days: 14});
  Object.assign(data.status.postcarbon, {state: 'due', days: 0});
  const rows = model(data).barrier.rows;
  assert.deepEqual(Array.from(rows, row => row.tone), ['ok', 'warning', 'due']);
  assert.deepEqual(Array.from(rows, row => row.percent), [100, 100 * 14 / 61, 0]);
  data.status.postcarbon.days = -3;
  data.status.ferrostop.days = 200;
  assert.equal(model(data).barrier.rows[2].percent, 0);
  assert.equal(model(data).barrier.rows[0].percent, 100);
});

test('BARRIER missing or invalid calendar data and unavailable snapshots keep resource unknown', () => {
  for (const change of [
    data => {data.settings.cartridges.softening.date = null;},
    data => {data.settings.cartridges.softening.date = '2026-02-30';},
    data => {data.status.softening.deadline = null;},
    data => {data.status.softening.deadline = '2026-02-30';},
    data => {data.status.softening.deadline = data.settings.cartridges.softening.date;},
    data => {data.status.softening.deadline = '2026-09-30';},
    data => {data.status.softening.days = null;},
    data => {data.status.softening.days = '24';},
    data => {data.status.softening.state = 'unknown';},
  ]) {
    const data = overviewFixture();change(data);
    const rows = model(data).barrier.rows;
    assert.equal(rows[1].percent, null);
    assert.ok(rows[0].percent > 0);
    assert.ok(rows[2].percent > 0);
  }
  for (const options of [{error: true}, {connected: false}]) {
    assert.ok(model(overviewFixture(), options).barrier.rows.every(row => row.percent === null));
  }
});

test('equally urgent replacement warnings select the nearest calendar deadline', () => {
  const data = overviewFixture();
  data.settings.main.mode = 'both';
  Object.assign(data.status.main, {state: 'warning', days: 14, deadline: '2026-11-21'});
  Object.assign(data.status.ferrostop, {state: 'warning', days: 7, deadline: '2026-11-14'});
  Object.assign(data.status.postcarbon, {state: 'warning', days: 1, deadline: '2026-11-08'});
  const view = model(data);
  assert.equal(view.notice.filter, 'postcarbon');
  assert.equal(view.notice.tone, 'warning');
});

test('equally urgent overdue replacements select the earliest missed deadline', () => {
  const data = overviewFixture();
  data.settings.main.mode = 'both';
  Object.assign(data.status.main, {state: 'due', days: -1, deadline: '2026-11-06'});
  Object.assign(data.status.postcarbon, {state: 'due', days: -10, deadline: '2026-10-28'});
  const view = model(data);
  assert.equal(view.notice.filter, 'postcarbon');
  assert.equal(view.notice.tone, 'due');
});

test('healthy future maintenance stays on the cards without an action banner', () => {
  for (const [mode, mainDays, saltDays] of [
    ['both', 30, 5],
    ['time', 20, 30],
    ['both', 30, 40],
  ]) {
    const data = overviewFixture();
    data.settings.main.mode = mode;
    data.status.main.days = mainDays;
    data.salt_status.days = saltDays;
    const view = model(data);
    assert.equal(view.notice, null, 'A future healthy-state deadline is not an action needed now');
    assert.match(view.main.detail, new RegExp(String(mainDays)));
    assert.match(view.barrier.rows[1].text, /24 дня/);
    assert.match(view.softener.nextSaltCheck, new RegExp(String(saltDays)));
  }
});

test('volume control never promotes its inactive calendar deadline to a warning', () => {
  const data = overviewFixture();
  Object.assign(data.status.main, {days: 1, deadline: '2026-11-08'});
  const view = model(data);
  assert.equal(view.notice, null);
  assert.doesNotMatch(view.main.detail, /день|дня|дней/);
});

test('a volume warning keeps its urgency without borrowing the inactive deadline', () => {
  const data = overviewFixture();
  Object.assign(data.status.main, {state: 'warning', used: 95, remaining: 5, percent: 5,
    days: -10, deadline: '2026-10-28'});
  Object.assign(data.status.postcarbon, {state: 'warning', days: 1, deadline: '2026-11-08'});
  assert.equal(model(data).notice.filter, 'postcarbon');
  Object.assign(data.status.postcarbon, {state: 'ok', days: 40, deadline: '2026-12-17'});
  const view = model(data);
  assert.equal(view.notice.filter, 'main');
  assert.equal(view.notice.tone, 'warning');
  assert.doesNotMatch(view.notice.detail, /день|дня|дней/);
});

test('uncertainty and overdue work still request attention with healthy future dates', () => {
  const data = overviewFixture();
  Object.assign(data.status.main, {state: 'unknown', used: null, remaining: null, percent: null});
  assert.equal(model(data).notice.filter, 'main');
  Object.assign(data.status.postcarbon, {state: 'due', days: -1, deadline: '2026-11-06'});
  assert.equal(model(data).notice.filter, 'postcarbon');
  data.salt_status.state = 'empty';
  assert.equal(model(data).notice.view, 'softener');
});

test('unknown softening interval is not hidden by two healthy cartridges', () => {
  const data = overviewFixture();
  data.settings.cartridges.softening.months = null;
  Object.assign(data.status.softening, {state: 'unknown', days: null});
  const view = model(data);
  assert.equal(view.barrier.tone, 'unknown');
  assert.match(view.barrier.rows[1].text, /жёсткость|срок/i);
});

test('topup alone never becomes a known salt balance and zero estimate stays zero', () => {
  const data = emptyOverviewFixture();
  Object.assign(data.settings.salt, {last_added_kg: 5, last_added: '2026-11-07'});
  data.settings.salt.history.push({action: 'topup', date: '2026-11-07', kg: 5});
  assert.equal(model(data).softener.saltKg, null);
  data.salt_status.estimated_remaining_kg = 0;
  assert.equal(model(data).softener.saltKg, 0);
  assert.match(model(data).softener.saltLabel, /расчёт/i);
});

test('checking salt today clears the banner and keeps the next check on the softener card', () => {
  const data = overviewFixture();
  data.settings.salt.last_checked = data.today;
  data.settings.salt.check_days = 12;
  data.salt_status.days = 12;
  const view = model(data);
  assert.equal(view.notice, null);
  assert.equal(view.softener.label, 'Соль проверена');
  assert.equal(view.softener.saltDetail, 'Проверка 07.11.2026');
  assert.equal(view.softener.nextSaltCheck, 'Следующая проверка через 12 дней');
});

test('a current manual inspection can have a next check without inventing an unknown salt estimate', () => {
  const data = overviewFixture();
  data.salt_status.estimated_remaining_kg = null;
  const view = model(data);
  assert.equal(view.softener.saltKg, null);
  assert.equal(view.softener.saltDetail, 'Нет данных для расчёта');
  assert.equal(view.softener.nextSaltCheck, 'Следующая проверка через 5 дней');
  assert.equal(view.notice, null);
});

test('due, low, empty and unknown inspections never display a future-check reassurance', () => {
  for (const state of ['check', 'low', 'empty', 'unknown']) {
    const data = overviewFixture();
    Object.assign(data.salt_status, {state, days: state === 'check' ? 0 : 5});
    const view = model(data);
    assert.equal(view.softener.nextSaltCheck, '');
    assert.equal(view.notice.view, 'softener');
    assert.match(view.notice.title, /соли|соль/);
  }
});

test('zero estimated salt requests a stock check even after a recent enough-level check', () => {
  const data = overviewFixture();
  data.settings.salt.estimated_kg = 0;
  Object.assign(data.salt_status, {estimated_remaining_kg: 0, full_cycles: 0, nominal_m3: 0});
  const view = model(data);
  assert.equal(view.softener.saltKg, 0);
  assert.equal(view.softener.tone, 'warning');
  assert.equal(view.softener.nextSaltCheck, '');
  assert.match(view.softener.label, /проверить/i);
  assert.equal(view.notice.view, 'softener');
  assert.equal(view.notice.tone, 'warning');
  assert.match(view.notice.title, /проверить.*соли/i);
  assert.match(view.notice.detail, /расчёт/i);
  assert.doesNotMatch(view.notice.title + ' ' + view.notice.detail, /бак пуст|нет соли|досыпать/i);
});

test('manual empty salt and explicitly failed regeneration request attention', () => {
  const data = overviewFixture();
  data.salt_status.estimated_remaining_kg = 0;
  data.salt_status.state = 'empty';
  let view = model(data);
  assert.equal(view.softener.tone, 'due');
  assert.equal(view.notice.view, 'softener');
  assert.match(view.notice.title, /соль/i);
  data.salt_status.state = 'ok';
  data.settings.salt.history[1].result = 'failed';
  view = model(data);
  assert.equal(view.softener.tone, 'due');
  assert.match(view.notice.title, /умягчение/i);
});

test('backfilled cycles do not replace the most recent regeneration or its result', () => {
  for (const result of ['confirmed', 'failed']) {
    const data = overviewFixture();
    data.settings.salt.history[1].result = result;
    const before = model(data);
    data.settings.salt.history.push({action:'regeneration',date:'2026-11-02',
      result:result === 'failed' ? 'confirmed' : 'failed',salt_kg:null,estimated_salt_kg:1});
    const journal = JSON.stringify(data.settings.salt.history);
    const after = model(data);
    assert.equal(after.softener.regenerationDate, '2026-11-04');
    assert.equal(after.softener.regenerationDetail, before.softener.regenerationDetail);
    assert.equal(after.softener.tone, before.softener.tone);
    assert.equal(JSON.stringify(data.settings.salt.history), journal, 'Reading the overview preserves audit order');
  }
});

test('GH comes from the outlet even when ten newer inlet/BARRIER records exist', () => {
  const data = overviewFixture();
  for (let i = 0; i < 12; i++) data.settings.treatment.gh_history.push({
    date: '2026-11-06', point: i % 2 ? 'mains' : 'barrier', sample_ml: 5, drops: 16, dgh: 16, zh: 5.7056});
  data.treatment_status.latest_gh = data.settings.treatment.gh_history.slice(-10).reverse();
  const view = model(data);
  assert.equal(view.softener.gh.drops, 4);
  assert.equal(view.softener.gh.date, '2026-11-05');
});

test('latest same-day outlet sample uses append order and a later inlet cannot replace it', () => {
  const data = overviewFixture();
  data.settings.treatment.gh_history.push({date: '2026-11-05', point: 'softener', sample_ml: 5, drops: 3, dgh: 3, zh: 1.0698});
  assert.equal(model(data).softener.gh.drops, 3);
  data.settings.treatment.gh_history = [{date: '2026-11-06', point: 'barrier', sample_ml: 5, drops: 3, dgh: 3, zh: 1.0698}];
  assert.equal(model(data).softener.gh, null);
  assert.equal(model(data).notice.view, 'quality');
});

test('unverified cycle and a same-day GH sample do not claim confirmed softening', () => {
  const data = overviewFixture();
  data.settings.salt.history[1].result = 'unverified';
  data.settings.treatment.gh_history[0].date = '2026-11-04';
  const view = model(data);
  assert.notEqual(view.softener.tone, 'ok');
  assert.match(view.softener.regenerationDetail, /не проверен/);
  assert.ok(view.notice);
  assert.equal(view.softener.regenerationDate, '2026-11-04');
});

test('missing outlet measurement before the last cycle becomes a GH follow-up', () => {
  const data = overviewFixture();
  data.settings.treatment.gh_history[0].date = '2026-11-03';
  const view = model(data);
  assert.equal(view.notice.view, 'quality');
  assert.match(view.notice.title, /жёсткость/i);
});

test('read failure and disconnect clear stale values, recovery restores them', () => {
  const data = overviewFixture();
  for (const options of [{error: true}, {connected: false}]) {
    const view = model(data, options);
    assert.equal(view.main.used, null);
    assert.equal(view.softener.saltKg, null);
    assert.equal(view.softener.nextSaltCheck, '');
    assert.notEqual(view.main.tone, 'ok');
    assert.equal(view.notice.action, 'reload');
  }
  assert.equal(model(data).main.used, 12);
  assert.equal(model(data).softener.saltKg, 4);
  assert.equal(model(data).softener.nextSaltCheck, 'Следующая проверка через 5 дней');
});

test('overview building does not mutate settings, history order or statuses', () => {
  const data = overviewFixture();
  const before = JSON.stringify(data);
  model(data);
  assert.equal(JSON.stringify(data), before);
});
