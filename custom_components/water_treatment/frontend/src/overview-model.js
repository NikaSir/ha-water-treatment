/* Read-only presentation of the existing maintenance snapshot. */
const WATER_OVERVIEW_CARTRIDGES = [
  ['ferrostop', 'Ферростоп'], ['softening', 'Смягчение'], ['postcarbon', 'Посткарбон'],
];

function waterOverviewNumber(value, digits = 3) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat('ru', {maximumFractionDigits: digits}).format(value) : '—';
}

function waterOverviewDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

function waterOverviewDateText(value) {
  const date = waterOverviewDate(value);
  return date ? date.split('-').reverse().join('.') : '—';
}

function waterOverviewDays(days) {
  const count = Math.abs(days);
  const tens = count % 100;
  const last = count % 10;
  const unit = tens >= 11 && tens <= 14 ? 'дней' : last === 1 ? 'день' : last >= 2 && last <= 4 ? 'дня' : 'дней';
  return waterOverviewNumber(count, 0) + ' ' + unit;
}

function waterOverviewDeadline(days) {
  if (!Number.isFinite(days)) return null;
  if (days < 0) return 'Просрочено на ' + waterOverviewDays(days);
  return days === 0 ? 'Заменить сегодня' : 'Ещё ' + waterOverviewDays(days);
}

function waterOverviewTone(state) {
  return ['ok', 'warning', 'due'].includes(state) ? state : 'unknown';
}

function waterOverviewTimePercent(installedValue, deadlineValue, days) {
  const installed = waterOverviewDate(installedValue);
  const deadline = waterOverviewDate(deadlineValue);
  const duration = installed && deadline ? (Date.parse(deadline) - Date.parse(installed)) / 86400000 : null;
  return duration > 0 && Number.isFinite(days)
    ? Math.max(0, Math.min(100, 100 * days / duration)) : null;
}

function waterOverviewLatest(history, predicate, today) {
  let latest = null;
  for (const item of Array.isArray(history) ? history : []) {
    if (!item || !predicate(item) || !waterOverviewDate(item.date) || (today && item.date > today)) continue;
    // Later appended entries win on the same date without reordering the journal.
    if (!latest || item.date >= latest.date) latest = item;
  }
  return latest;
}

function waterOverviewModel(snapshot, options = {}) {
  const unavailable = options.error || options.connected === false;
  const data = !unavailable && snapshot && snapshot.settings && snapshot.status ? snapshot : null;
  const settings = data?.settings || {};
  const status = data?.status || {};
  const today = waterOverviewDate(data?.today);
  const notices = [];
  const notice = (priority, title, detail, view, tone = 'warning', filter = null, action = null, days = null) => {
    notices.push({priority, title, detail, view, tone, filter, action,
      days: Number.isFinite(days) ? days : null});
  };

  const mainCfg = settings.main || {};
  const mainStatus = status.main || {};
  const mode = ['time', 'both'].includes(mainCfg.mode) ? mainCfg.mode : 'volume';
  const used = Number.isFinite(mainStatus.used) && mainStatus.used >= 0 ? mainStatus.used : null;
  const volumePercent = used !== null && Number.isFinite(mainStatus.remaining) && Number.isFinite(mainStatus.percent)
    ? Math.max(0, Math.min(100, mainStatus.percent)) : null;
  const installed = waterOverviewDate(mainCfg.date);
  const timePercent = waterOverviewTimePercent(installed, mainStatus.deadline, mainStatus.days);
  const percent = mode === 'volume' ? volumePercent : mode === 'time' ? timePercent
    : volumePercent !== null && timePercent !== null ? Math.min(volumePercent, timePercent) : null;
  const mainTone = waterOverviewTone(mainStatus.state);
  const mainDays = mode !== 'volume' && Number.isFinite(mainStatus.days) ? mainStatus.days : null;
  const mainParts = [];
  if (mode !== 'time' && used !== null && Number.isFinite(mainStatus.remaining)) {
    mainParts.push(mainStatus.remaining <= 0 ? 'Ресурс по объёму исчерпан'
      : 'Осталось ' + waterOverviewNumber(mainStatus.remaining) + ' м³');
  }
  if (mode !== 'volume' && Number.isFinite(mainStatus.days)) mainParts.push(waterOverviewDeadline(mainStatus.days));
  if (!installed) mainParts.push('Нужна запись о замене');
  else if (used === null && mode !== 'time') mainParts.push('Проверьте водомер и начальный отсчёт');
  const main = {
    tone: mainTone,
    label: {ok: 'Ресурс есть', warning: 'Скоро замена', due: 'Нужна замена', unknown: 'Нет данных'}[mainTone],
    used, percent,
    resourceLabel: {volume: 'Ресурс по объёму', time: 'Ресурс по сроку', both: 'По объёму и сроку'}[mode],
    detail: mainParts.join(' · ') || 'Нет данных для расчёта',
  };
  if (mainTone === 'due') notice(80, 'Заменить картридж', 'Магистральный · ' + main.detail, 'filters', 'due', 'main', null, mainDays);
  else if (mainTone === 'warning') notice(60, 'Подготовить картридж', 'Магистральный · ' + main.detail, 'filters', 'warning', 'main', null, mainDays);
  else if (mainTone === 'unknown') notice(30, installed ? 'Проверить данные фильтра' : 'Записать замену фильтра', main.detail, 'filters', 'unknown', 'main');

  const rows = WATER_OVERVIEW_CARTRIDGES.map(([key, name], index) => {
    const item = status[key] || {};
    const cfg = settings.cartridges?.[key] || {};
    const tone = waterOverviewTone(item.state);
    const percent = tone === 'unknown' ? null : waterOverviewTimePercent(cfg.date, item.deadline, item.days);
    let text = waterOverviewDeadline(item.days);
    if (!waterOverviewDate(cfg.date)) text = 'Дата замены не задана';
    else if (!text) text = key === 'softening' && settings.softening_auto ? 'Нужна жёсткость или срок' : 'Срок не задан';
    if (tone === 'due') notice(80, 'Заменить картридж', 'БАРЬЕР · ' + name + ' · ' + text, 'filters', 'due', key, null, item.days);
    else if (tone === 'warning') notice(60, 'Подготовить картридж', 'БАРЬЕР · ' + name + ' · ' + text, 'filters', 'warning', key, null, item.days);
    else if (tone === 'unknown') notice(29, 'Уточнить сроки БАРЬЕР', name + ' · ' + text, 'filters', 'unknown', key);
    return {key, name, number: index + 1, tone, text, percent, deadline: waterOverviewDate(item.deadline)};
  });
  const barrierTone = ['due', 'warning', 'unknown', 'ok'].find(tone => rows.some(row => row.tone === tone));
  const barrier = {tone: barrierTone, rows,
    label: {due: 'Нужна замена', warning: 'Скоро замена', unknown: 'Нет данных', ok: 'В срок'}[barrierTone]};

  const salt = settings.salt || {};
  const saltStatus = data?.salt_status || {};
  const regeneration = waterOverviewLatest(salt.history, item => item.action === 'regeneration', today);
  const gh = waterOverviewLatest(settings.treatment?.gh_history,
    item => item.point === 'softener' && item.sample_ml === 5 && Number.isFinite(item.drops) && item.drops > 0, today);
  const saltKg = Number.isFinite(saltStatus.estimated_remaining_kg) && saltStatus.estimated_remaining_kg >= 0
    ? saltStatus.estimated_remaining_kg : null;
  const needsGh = !gh || !!(regeneration && gh.date < regeneration.date);
  const ambiguousCycle = regeneration?.result === 'unverified' && (!gh || gh.date <= regeneration.date);
  const regenerationDetail = !regeneration ? 'Цикл ещё не записан'
    : 'По журналу · ' + ({confirmed: 'результат подтверждён', failed: 'умягчение не восстановилось',
      unverified: 'результат не проверен'}[regeneration.result] || 'результат не проверен');
  let softenerTone = 'unknown';
  let softenerLabel = 'По журналу';
  if (saltStatus.state === 'empty') {
    softenerTone = 'due'; softenerLabel = 'Нет соли';
    notice(95, 'Досыпать соль', 'По последней ручной проверке бак пуст', 'softener', 'due');
  } else if (regeneration?.result === 'failed') {
    softenerTone = 'due'; softenerLabel = 'Проверить умягчение';
    notice(90, 'Проверить умягчение', 'Последний цикл записан без восстановления смягчения', 'softener', 'due');
  } else if (saltStatus.state === 'low') {
    softenerTone = 'warning'; softenerLabel = 'Мало соли';
    notice(75, 'Досыпать соль', 'По последней ручной проверке соли мало', 'softener');
  } else if (saltStatus.state === 'check') {
    softenerTone = 'warning'; softenerLabel = 'Проверить соль';
    notice(55, 'Проверить запас соли', 'Наступил срок ручной проверки', 'softener');
  } else if (saltKg === 0) {
    softenerTone = 'warning'; softenerLabel = 'Проверить соль';
    notice(55, 'Проверить запас соли', 'Расчётный остаток исчерпан · проверьте фактический запас', 'softener');
  } else if (needsGh || ambiguousCycle) {
    softenerTone = 'warning'; softenerLabel = 'Контроль GH';
  } else if (saltStatus.state === 'ok') {
    // This badge describes the salt check, not the effectiveness of the softener.
    softenerLabel = 'Соль проверена';
  }
  if (needsGh) notice(50, 'Проверить жёсткость', 'После «Ёлки» · внести результат', 'quality');
  else if (ambiguousCycle) notice(49, 'Уточнить результат цикла', 'Проба и цикл в один день · порядок не указан', 'quality');
  if (saltStatus.state === 'unknown') notice(35, 'Проверить запас соли', 'Нужна ручная проверка и запись остатка', 'softener', 'unknown');
  const softener = {
    tone: softenerTone, label: softenerLabel,
    regenerationDate: regeneration?.date || null, regenerationDetail,
    saltKg, saltLabel: 'Соль · расчётный остаток',
    saltDetail: saltKg === null ? 'Нет данных для расчёта'
      : saltKg === 0 ? 'Оценка исчерпана · проверьте запас'
      : saltStatus.state === 'ok' && waterOverviewDate(salt.last_checked)
        ? 'Проверка ' + waterOverviewDateText(salt.last_checked) : 'Оценка по записанным дозам',
    nextSaltCheck: saltStatus.state === 'ok' && saltKg !== 0 && Number.isFinite(saltStatus.days) && saltStatus.days > 0
      ? 'Следующая проверка через ' + waterOverviewDays(saltStatus.days) : '',
    gh: gh ? {date: gh.date, drops: gh.drops, zh: Number.isFinite(gh.zh) ? gh.zh : null} : null,
    ghText: gh ? waterOverviewNumber(gh.drops, 0) + ' кап. · ' + waterOverviewDateText(gh.date) : 'Замеров пока нет',
  };

  if (!data) {
    main.tone = barrier.tone = softener.tone = 'unknown';
    main.label = barrier.label = softener.label = options.loading && !unavailable ? 'Загрузка…' : 'Нет данных';
    main.detail = unavailable ? 'Данные временно недоступны' : 'Ожидаем данные журнала';
    rows.forEach(row => { row.text = 'Нет данных'; });
    notices.length = 0;
    if (unavailable) notice(100, 'Обновить данные', options.connected === false
      ? 'Связь с Home Assistant потеряна' : 'Не удалось получить журнал водоподготовки', null, 'unknown', null, 'reload');
  }
  notices.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    // Compare known calendar deadlines only; volume consumption provides no ETA.
    if (a.days === null) return b.days === null ? 0 : 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });
  return {main, softener, barrier, notice: notices[0] || null};
}
