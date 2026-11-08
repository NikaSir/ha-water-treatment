/* Manual treatment records; compiled into the autonomous panel, no runtime imports. */
const WATER_FILTER_SETTING_IDS = ['filter-profile','filter-volume','filter-months','filter-mode','filter-people','filter-hardness','filter-auto','months-ferrostop','months-softening','months-postcarbon'];
const WATER_TREATMENT_SETTING_IDS = ['treatment-resin','treatment-resin-basis','treatment-cycle','treatment-cycle-basis','treatment-max-days','treatment-backwash','treatment-brine','treatment-refill','treatment-rinse','treatment-daily','treatment-resin-year','treatment-resin-date'];
const WATER_EVENT_RESETS = {
  salt_service: {'salt-remaining':'','salt-added':'','salt-removed':'','salt-refill-l':''},
  salt_remove: {'salt-remove-kg':''},
  salt_regeneration: {'cycle-salt':'','cycle-water':'','cycle-refill':'','cycle-result':'unverified','cycle-completed':false},
  treatment_gh: {'gh-drops':'','gh-apply':false},
};

function waterDraftSection(id) {
  if (WATER_FILTER_SETTING_IDS.includes(id)) return 'settings';
  if (WATER_TREATMENT_SETTING_IDS.includes(id)) return 'treatment_settings';
  return ['salt-days','salt-dose','salt-dose-basis'].includes(id) ? 'salt_settings' : null;
}

function waterSettingsFingerprint(settings, action) {
  if (!settings) return null;
  if (action === 'treatment_settings') return JSON.stringify([settings.treatment?.profile,settings.treatment?.resin_since_year,settings.treatment?.resin_replaced]);
  if (action === 'salt_settings') return JSON.stringify([settings.salt?.dose,settings.salt?.dose_basis,settings.salt?.check_days]);
  if (action === 'settings') return JSON.stringify([settings.people,settings.hardness,settings.softening_auto,
    settings.main?.profile,settings.main?.volume,settings.main?.months,settings.main?.mode,
    ...['ferrostop','softening','postcarbon'].map(key=>settings.cartridges?.[key]?.months)]);
  return null;
}

function waterFilterFillIds(action, payload) {
  let ids=Object.keys(WATER_EVENT_RESETS[action] || {});
  if (action === 'settings') ids=WATER_FILTER_SETTING_IDS;
  if (action === 'treatment_settings') ids=WATER_TREATMENT_SETTING_IDS;
  if (action === 'treatment_old_profile') ids=[...WATER_TREATMENT_SETTING_IDS.filter(id=>!['treatment-resin-year','treatment-resin-date'].includes(id)),'salt-dose','salt-dose-basis'];
  if (action === 'salt_settings') ids=['salt-days','salt-dose','salt-dose-basis'];
  if (action === 'salt_check') ids=['salt-level'];
  if (action === 'record' || action === 'replace') ids=['date-'+payload.filter, ...(payload.filter === 'main' ? ['baseline-main'] : [])];
  if (action === 'treatment_gh' && payload.apply_to_filter) ids=[...ids,'filter-hardness','months-softening'];
  return new Set(ids);
}

function resetWaterTreatmentEvent(panel, action, guard) {
  for (const [id,value] of Object.entries(WATER_EVENT_RESETS[action] || {})) panel._fillFilterControl(id,value,guard);
}

function waterInput(id, label, type = 'number', attributes = '') {
  return '<label>' + label + '<input id="' + id + '" type="' + type + '" ' + attributes + '></label>';
}

function waterDetailMarkup(prefix, fields) {
  return '<dl class="detail-metrics">' + fields.map(([key, label, wide]) =>
    '<div class="detail-metric' + (wide ? ' detail-metric-wide' : '') + '">'
    + '<dt data-detail-label="' + prefix + '-' + key + '">' + label + '</dt>'
    + '<dd><span data-detail-value="' + prefix + '-' + key + '">Нет данных</span>'
    + '<small data-detail-note="' + prefix + '-' + key + '"></small></dd></div>').join('') + '</dl>';
}

function paintWaterDetail(panel, key, value, note = '', label) {
  panel._setText('[data-detail-value="' + key + '"]', value);
  panel._setText('[data-detail-note="' + key + '"]', note);
  if (label) panel._setText('[data-detail-label="' + key + '"]', label);
}

function waterCompactNumber(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('ru-RU', {maximumFractionDigits: digits}).format(value) : null;
}

function waterRecordedDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split('-').reverse().join('.') : 'Не записана';
}

function waterGhHistoryMarkup() {
  return '<section class="gh-history-section" aria-label="Последние измерения GH"><h3>Последние измерения</h3>'
    + '<p data-gh-empty>Измерений пока нет</p><ol class="gh-history-list" data-gh-history>'
    + Array.from({length: 10}, (_, index) => '<li class="gh-record" data-gh-row="' + index + '" hidden>'
      + '<div class="gh-record-heading"><time data-gh-date="' + index + '"></time>'
      + '<span data-gh-sample="' + index + '"></span></div>'
      + '<p class="gh-record-point" data-gh-point="' + index + '"></p>'
      + '<div class="gh-record-values"><strong data-gh-drops="' + index + '"></strong>'
      + '<span data-gh-dgh="' + index + '"></span><span data-gh-zh="' + index + '"></span></div></li>').join('')
    + '</ol></section>';
}

function paintWaterGhHistory(panel, items, emptyText = 'Измерений пока нет') {
  const points = {mains: 'До «Ёлки» · водопровод', softener: 'После «Ёлки» · вход БАРЬЕР', barrier: 'После БАРЬЕР'};
  const empty = panel.shadowRoot.querySelector('[data-gh-empty]');
  if (empty && empty.hidden !== !!items.length) empty.hidden = !!items.length;
  panel._setText('[data-gh-empty]', emptyText);
  for (let index = 0; index < 10; index++) {
    const item = items[index];
    const row = panel.shadowRoot.querySelector('[data-gh-row="' + index + '"]');
    if (row && row.hidden !== !item) row.hidden = !item;
    if (!item) continue;
    const set = (name, value) => panel._setText('[data-gh-' + name + '="' + index + '"]', value);
    set('date', waterRecordedDate(item.date));
    const time = panel.shadowRoot.querySelector('[data-gh-date="' + index + '"]');
    if (time && time.dateTime !== item.date) time.dateTime = item.date;
    set('point', points[item.point] || 'Точка не указана');
    set('sample', item.sample_ml != null ? 'Проба ' + waterCompactNumber(item.sample_ml) + ' мл' : '');
    set('drops', waterCompactNumber(item.drops, 0) + ' кап.');
    set('dgh', waterCompactNumber(item.dgh) + ' °dGH');
    set('zh', '≈ ' + waterCompactNumber(item.zh) + ' °Ж');
  }
}

function waterSaltLedgerMarkup() {
  return '<section class="salt-balance-section"><h3>Учёт запаса</h3>'
    + waterDetailMarkup('stock', [['known', 'По записанным массам'], ['estimated', 'Оценка по дозам'], ['cycles', 'Записано циклов']])
    + '<details><summary>Расчёт запаса соли</summary>'
    + waterDetailMarkup('coverage', [['cycles', 'Полных циклов'], ['volume', 'Номинальный объём'], ['days', 'Сценарный срок']])
    + '<p data-salt-coverage-note>Для оценки нужен известный начальный запас.</p></details></section>'
    + '<details><summary>Остаток, очистка бака и регенерации</summary>'
    + '<p>События вводятся вручную. Сброс объёма на дисплее не подтверждает успешную регенерацию.</p>'
    + '<div class="filter-form">' + waterInput('salt-event-date', 'Дата события', 'date') + '</div>'
    + '<h3>Бак обслужен</h3><p>Новый запас = оставлено после очистки + добавлено. Прежний запас не прибавляется.</p>'
    + '<div class="filter-form">'
    + waterInput('salt-remaining', 'Оставлено после очистки, кг', 'number', 'min="0" max="100" step="0.1"')
    + waterInput('salt-added', 'Добавлено, кг', 'number', 'min="0" max="100" step="0.1"')
    + waterInput('salt-removed', 'Удалено соли, кг — если измерено', 'number', 'min="0" max="100" step="0.1"')
    + waterInput('salt-refill-l', 'Внесено воды, л — если измерено', 'number', 'min="0" max="100" step="0.1"') + '</div>'
    + '<button type="button" data-filter-action="salt_service">Записать обслуживание бака</button>'
    + '<h3>Соль удалена отдельно</h3><div class="filter-form">'
    + waterInput('salt-remove-kg', 'Удалено, кг', 'number', 'min="0.1" max="100" step="0.1"') + '</div>'
    + '<button type="button" data-filter-action="salt_remove">Записать удаление соли</button>'
    + '<h3>Полный цикл завершён</h3><div class="filter-form">'
    + waterInput('cycle-salt', 'Соль за этот цикл, кг — если измерено', 'number', 'min="0" max="20" step="0.1"')
    + waterInput('cycle-water', 'Вода на регенерацию, м³ — если измерено', 'number', 'min="0" max="10" step="0.001"')
    + waterInput('cycle-refill', 'Вода наполнения, л — если измерено', 'number', 'min="0" max="100" step="0.1"')
    + '<label>Результат смягчения<select id="cycle-result"><option value="unverified">Ещё не проверен</option>'
    + '<option value="confirmed">Подтверждён проверкой</option><option value="failed">Смягчение не восстановилось</option></select></label>'
    + '<label class="filter-checkbox"><input id="cycle-completed" type="checkbox">Полный цикл действительно завершён</label></div>'
    + '<button type="button" data-filter-action="salt_regeneration">Записать завершённый цикл</button>'
    + '<p>Неизмеренная доза изменяет только оценку запаса. Вода регенерации не вычитается повторно из показаний счётчика.</p></details>';
}

function waterSoftenerMarkup() {
  return '<section class="card filter-settings"><h2>Ёлка — параметры для учёта</h2>'
    + waterDetailMarkup('profile', [['mode', 'Режим клапана'], ['time', 'Запуск регенерации'],
      ['volume', 'Объём между циклами'], ['interval', 'Максимальный интервал'],
      ['resin', 'Объём смолы'], ['stages', 'Длительность стадий']])
    + '<p data-treatment-codes></p><p>Профиль хранит сведения для учёта. Настройки клапана изменяются на самом оборудовании.</p>'
    + '<p data-treatment-message role="status" aria-live="polite"></p>'
    + '<button type="button" data-filter-action="treatment_old_profile">Применить предварительный профиль 8 л / 1 кг</button>'
    + '<details><summary>Заданные параметры и допущения</summary><div class="filter-form">'
    + waterInput('treatment-resin', 'Смола, л', 'number', 'min="0.1" max="100" step="0.1"')
    + '<label>Объём смолы<select id="treatment-resin-basis"><option value="assumed">Предварительно</option><option value="measured">Измерен</option></select></label>'
    + waterInput('treatment-cycle', 'Объём в клапане, м³', 'number', 'min="0.001" max="100" step="0.001"')
    + '<label>Основание объёма<select id="treatment-cycle-basis"><option value="temporary_setting">Временная настройка</option><option value="configured">Проверено в клапане</option></select></label>'
    + waterInput('treatment-max-days', 'Максимальный интервал, дней', 'number', 'min="1" max="90" step="1"')
    + waterInput('treatment-backwash', 'Обратная промывка, мин', 'number', 'min="0" max="300" step="0.1"')
    + waterInput('treatment-brine', 'Забор рассола + медленная промывка, мин', 'number', 'min="0" max="300" step="0.1"')
    + waterInput('treatment-refill', 'Наполнение бака, мин', 'number', 'min="0" max="300" step="0.1"')
    + waterInput('treatment-rinse', 'Быстрая промывка, мин', 'number', 'min="0" max="300" step="0.1"')
    + waterInput('treatment-daily', 'Хозяйственный расход без регенераций, м³/сут — для сценария', 'number', 'min="0.001" max="100" step="0.001"')
    + waterInput('treatment-resin-year', 'Смола эксплуатируется с года — если известен', 'number', 'min="1900" max="2100" step="1"')
    + waterInput('treatment-resin-date', 'Последняя замена смолы — если была', 'date') + '</div>'
    + '<button type="button" data-filter-action="treatment_settings">Сохранить параметры учёта</button>'
    + '<p>8 л и 1 кг/цикл предварительны. 1,20 м³ — временно заданный объём, не измеренная ёмкость смолы. Одна минута наполнения не доказывает расход соли. Максимальный интервал и напоминание проверить соль — разные параметры.</p></details></section>'
    ;
}

function waterQualityMarkup() {
  return '<section class="card filter-settings"><h2>Жёсткость — журнал GH</h2>'
    + '<p>НИЛПА, проба 5 мл: 1 капля = 1 °dGH; °Ж = °dGH × 0,3566. Шаг результата — около 0,36 °Ж; возле 5 °Ж желательно повторить замер.</p>'
    + '<p data-gh-message role="status" aria-live="polite"></p><div class="filter-form">'
    + waterInput('gh-date', 'Дата пробы', 'date')
    + '<label>Точка отбора<select id="gh-point"><option value="softener">После Ёлки / вход БАРЬЕР</option>'
    + '<option value="mains">Водопровод до Ёлки</option><option value="barrier">После БАРЬЕР</option></select></label>'
    + waterInput('gh-drops', 'Капли в пробе 5 мл', 'number', 'min="1" max="100" step="1"')
    + '<label class="filter-checkbox"><input id="gh-apply" type="checkbox">Применить пробу после Ёлки к сроку «Смягчения» БАРЬЕР</label></div>'
    + '<button type="button" data-filter-action="treatment_gh">Записать GH-пробу</button>'
    + waterGhHistoryMarkup() + '</section>';
}

function waterTreatmentPayload(root, action) {
  const value = id => root.querySelector('#' + id)?.value || '';
  const n = (id, required = false) => {
    const node = root.querySelector('#' + id);
    if (!node || node.value === '') {
      if (required) throw new Error('Заполните обязательные поля записи');
      return null;
    }
    const result = Number(node.value);
    if (!Number.isFinite(result) || !node.reportValidity()) throw new Error('Проверьте числовые поля записи');
    return result;
  };
  const date = value('salt-event-date');
  if (action === 'salt_service') {
    const payload = {date, remaining_kg:n('salt-remaining',true),added_kg:n('salt-added',true),removed_kg:n('salt-removed'),refill_l:n('salt-refill-l')};
    return window.confirm('Записать обслуживание? Новый учтённый запас будет равен оставленной и добавленной соли.') ? payload : null;
  }
  if (action === 'salt_remove') return {date,kg:n('salt-remove-kg',true)};
  if (action === 'salt_regeneration') {
    if (!root.querySelector('#cycle-completed')?.checked) throw new Error('Подтвердите завершение полного цикла');
    return {date,completed:true,result:value('cycle-result'),salt_kg:n('cycle-salt'),water_m3:n('cycle-water'),refill_l:n('cycle-refill')};
  }
  if (action === 'treatment_old_profile') {
    return window.confirm('Применить предварительные 8 л смолы, 1 кг соли и 1,20 м³? Настройки профиля будут заменены; события останутся.') ? {} : null;
  }
  if (action === 'treatment_gh') {
    const point=value('gh-point');const apply=!!root.querySelector('#gh-apply')?.checked;
    if (apply && point !== 'softener') throw new Error('Для БАРЬЕР используйте пробу на выходе умягчителя');
    return {date:value('gh-date'),point,drops:n('gh-drops',true),sample_ml:5,apply_to_filter:apply};
  }
  const payload = {resin_basis:value('treatment-resin-basis'),cycle_basis:value('treatment-cycle-basis'),
    daily_service_m3:n('treatment-daily'),resin_since_year:n('treatment-resin-year'),resin_replaced:value('treatment-resin-date') || null};
  for (const [key,id] of Object.entries({resin_l:'treatment-resin',cycle_m3:'treatment-cycle',max_days:'treatment-max-days',
    backwash_min:'treatment-backwash',brine_min:'treatment-brine',refill_min:'treatment-refill',fast_rinse_min:'treatment-rinse'})) payload[key]=n(id,true);
  return payload;
}

function waterSaltEventText(item) {
  const prefix=item.date.split('-').reverse().join('.') + ': ';
  if (item.action === 'topup') return prefix + 'досыпано ' + item.kg + ' кг';
  if (item.action === 'check') return prefix + 'проверка — ' + {enough:'достаточно',low:'мало',empty:'нет соли'}[item.level];
  if (item.action === 'service') return prefix + 'бак обслужен; оставлено ' + item.remaining_kg + ', добавлено ' + item.added_kg + ' кг'
    + (item.removed_kg != null ? '; удалено ' + item.removed_kg + ' кг' : '') + (item.refill_l != null ? '; вода ' + item.refill_l + ' л' : '');
  if (item.action === 'remove') return prefix + 'удалено ' + item.kg + ' кг соли';
  if (item.action === 'regeneration') return prefix + 'полный цикл; ' + {unverified:'результат не проверен',confirmed:'смягчение подтверждено',failed:'смягчение не восстановилось'}[item.result]
    + (item.salt_kg != null ? '; измеренная соль ' + item.salt_kg + ' кг' : item.estimated_salt_kg != null ? '; оценка соли ' + item.estimated_salt_kg + ' кг' : '; доза неизвестна')
    + (item.water_m3 != null ? '; регенерация ' + item.water_m3 + ' м³' : '') + (item.refill_l != null ? '; наполнение ' + item.refill_l + ' л' : '');
  return prefix + 'запись';
}

function paintWaterTreatment(panel, fill, guard) {
  const data=panel._filterData;
  if (!data) return;
  const salt=data.settings.salt;const state=data.salt_status;
  const value = (number, unit, digits = 2) => waterCompactNumber(number, digits) == null
    ? 'Нет данных' : waterCompactNumber(number, digits) + (unit ? ' ' + unit : '');
  paintWaterDetail(panel, 'stock-known', state.known_remaining_kg == null ? 'Нет полных данных' : value(state.known_remaining_kg, 'кг'));
  const doseBasis = {measured: 'доза измерена', assumed: 'доза предварительная', legacy_unverified: 'унаследована, не проверена'};
  const doseNote = value(salt.dose, 'кг/цикл') + ' · ' + (doseBasis[salt.dose_basis] || 'основание дозы неизвестно');
  paintWaterDetail(panel, 'stock-estimated', value(state.estimated_remaining_kg, 'кг'), doseNote);
  paintWaterDetail(panel, 'stock-cycles', value(salt.regenerations, '', 0));
  paintWaterDetail(panel, 'coverage-cycles', value(state.full_cycles, '', 0));
  paintWaterDetail(panel, 'coverage-volume', value(state.nominal_m3, 'м³', 3), 'По заданному объёму в клапане');
  paintWaterDetail(panel, 'coverage-days', state.scenario_days == null ? 'Не рассчитан' : '≈ ' + value(state.scenario_days, 'дн.', 0));
  panel._setText('[data-salt-coverage-note]', (salt.dose_basis === 'legacy_unverified'
    ? 'Унаследованная доза соли не проверена. ' : '')
    + 'Расчёт по дозам и заданному объёму является оценкой. Для него нужен известный начальный запас.');
  const treatment=data.settings.treatment;
  if (!treatment || !data.treatment_status) return;
  const profile=treatment.profile;
  paintWaterDetail(panel, 'profile-mode', profile.mode || 'Нет данных');
  paintWaterDetail(panel, 'profile-time', profile.time || 'Нет данных');
  paintWaterDetail(panel, 'profile-volume', value(profile.cycle_m3, 'м³', 3), profile.cycle_basis === 'configured' ? 'Проверено в клапане' : 'Временная настройка');
  paintWaterDetail(panel, 'profile-interval', value(profile.max_days, 'дн.', 0));
  paintWaterDetail(panel, 'profile-resin', value(profile.resin_l, 'л'), profile.resin_basis === 'measured' ? 'Измерено' : 'Предварительно');
  paintWaterDetail(panel, 'profile-stages', value(data.treatment_status.stage_minutes, 'мин'), 'Плюс переключения');
  panel._setText('[data-treatment-codes]', [profile.volume_unit, profile.backwash_mode, profile.signal].filter(Boolean).join(' · '));
  paintWaterGhHistory(panel, data.treatment_status.latest_gh);
  if (!fill) return;
  const values={'treatment-resin':profile.resin_l,'treatment-resin-basis':profile.resin_basis,'treatment-cycle':profile.cycle_m3,'treatment-cycle-basis':profile.cycle_basis,
    'treatment-max-days':profile.max_days,'treatment-backwash':profile.backwash_min,'treatment-brine':profile.brine_min,'treatment-refill':profile.refill_min,'treatment-rinse':profile.fast_rinse_min,
    'treatment-daily':profile.daily_service_m3,'treatment-resin-year':treatment.resin_since_year,'treatment-resin-date':treatment.resin_replaced,'salt-dose-basis':salt.dose_basis};
  for (const [id,value] of Object.entries(values)) panel._fillFilterControl(id,value,guard);
  for (const id of ['salt-event-date','gh-date']) {const node=panel.shadowRoot.querySelector('#'+id);if(node && !node.value)node.value=data.today;}
}
