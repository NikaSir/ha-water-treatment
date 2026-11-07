/* Static overview DOM; snapshot updates only patch text and state attributes. */
function waterOverviewMarkup(version) {
  const asset = name => '/water_treatment_panel/assets/' + name + '?v=' + encodeURIComponent(version);
  const image = (name, kind) => '<span class="overview-illustration overview-illustration--' + kind + '">'
    + '<img src="' + asset(name) + '" alt="" width="110" height="140" decoding="async" draggable="false"></span>';
  const resource = (key, label) => '<span class="overview-resource" data-overview-resource="' + key
    + '" data-known="false" role="progressbar" aria-label="' + label + '" aria-valuemin="0" aria-valuemax="100">'
    + '<span data-overview-progress="' + key + '"></span></span>';
  const head = (key, title, subtitle) => '<span class="overview-card-heading">'
    + '<span class="overview-card-title">' + title + '</span><ha-icon icon="mdi:chevron-right"></ha-icon>'
    + '<span class="overview-card-subtitle">' + subtitle + '</span>'
    + '<span class="overview-badge" data-overview="' + key + '-status">Нет данных</span></span>';
  return '<header class="overview-heading"><h1>Обзор</h1><p>Состояние и обслуживание</p></header>'
    + '<button type="button" class="overview-notice" data-overview-notice hidden>'
    + '<ha-icon data-overview-notice-icon icon="mdi:information-outline"></ha-icon>'
    + '<span class="overview-notice-copy"><strong data-overview="notice-title"></strong>'
    + '<span data-overview="notice-detail"></span></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>'
    + '<button type="button" class="card overview-card" data-overview-card="main" data-status="unknown"'
    + ' data-view="filters" data-overview-filter="main">'
    + head('main', 'Магистральный', 'Механический фильтр')
    + '<span class="overview-card-body">' + image('main-filter.png', 'main')
    + '<span class="overview-details"><span class="overview-field-label">После замены</span>'
    + '<strong class="overview-value" data-overview="main-used">— м³</strong>'
    + '<span class="overview-field-label overview-resource-label" data-overview="main-resource-label">Ресурс по объёму</span>'
    + resource('main', 'Оставшийся ресурс магистрального фильтра')
    + '<span class="overview-detail" data-overview="main-detail">Нет данных для расчёта</span>'
    + '</span></span></button>'
    + '<button type="button" class="card overview-card" data-overview-card="softener" data-status="unknown"'
    + ' data-view="softener">'
    + head('softener', 'Ёлка', 'Умягчитель')
    + '<span class="overview-card-body">' + image('elka-cabinet.png', 'softener')
    + '<span class="overview-details"><span class="overview-field-label">Последняя регенерация</span>'
    + '<strong class="overview-date" data-overview="regeneration-date">—</strong>'
    + '<span class="overview-detail" data-overview="regeneration-detail">По журналу</span>'
    + '<span class="overview-field-label overview-salt-label" data-overview="salt-label">Соль · расчётный остаток</span>'
    + '<strong class="overview-value" data-overview="salt-value">— кг</strong>'
    + '<span class="overview-detail" data-overview="salt-detail">Нет данных для расчёта</span>'
    + '<span class="overview-detail" data-overview-salt-next-check hidden></span></span></span>'
    + '<span class="overview-gh"><span>GH после «Ёлки»</span><span data-overview="gh-value">Замеров пока нет</span></span></button>'
    + '<button type="button" class="card overview-card" data-overview-card="barrier" data-status="unknown"'
    + ' data-view="filters" data-overview-filter="ferrostop">'
    + head('barrier', 'БАРЬЕР', 'Три ступени · по сроку')
    + '<span class="overview-card-body">' + image('barrier-three-stage.png', 'barrier')
    + '<span class="overview-details overview-cartridges">'
    + WATER_OVERVIEW_CARTRIDGES.map(([key, name], index) => '<span class="overview-cartridge" data-overview-cartridge="' + key + '" data-status="unknown">'
      + '<span class="overview-cartridge-number overview-cartridge-number--' + key + '">' + (index + 1) + '</span>'
      + '<span><strong>' + name + '</strong><span class="overview-cartridge-status" data-overview="' + key + '-deadline">Нет данных</span>'
      + resource(key, 'Оставшийся срок: ' + name) + '</span></span>').join('')
    + '</span></span></button>';
}

function paintWaterOverview(panel) {
  const root = panel._views.get('overview');
  if (!root) return;
  const model = waterOverviewModel(panel._filterData, {
    error: panel._filterLoadError,
    loading: !panel._filterData && !panel._filterLoadError,
    connected: panel._hass?.connection?.connected !== false,
  });
  const text = (key, value) => panel._setText('[data-overview="' + key + '"]', value, root);
  const status = (node, value) => {if (node && node.dataset.status !== value) node.dataset.status = value;};
  const resource = (key, percent, byTime = false) => {
    const progress = root.querySelector('[data-overview-resource="' + key + '"]');
    const fill = progress?.querySelector('[data-overview-progress]');
    if (!progress || !fill) return;
    const width = (percent === null ? 0 : percent) + '%';
    if (fill.style.width !== width) fill.style.width = width;
    progress.dataset.known = String(percent !== null);
    if (percent === null) {
      progress.removeAttribute('aria-valuenow');
      progress.setAttribute('aria-valuetext', byTime ? 'Срок неизвестен' : 'Ресурс неизвестен');
    } else {
      progress.setAttribute('aria-valuenow', String(Math.round(percent)));
      progress.setAttribute('aria-valuetext', 'Осталось ' + waterOverviewNumber(percent, 0) + '%' + (byTime ? ' срока' : ''));
    }
  };
  for (const key of ['main', 'softener', 'barrier']) {
    status(root.querySelector('[data-overview-card="' + key + '"]'), model[key].tone);
    text(key + '-status', model[key].label);
  }
  text('main-used', waterOverviewNumber(model.main.used) + ' м³');
  text('main-resource-label', model.main.resourceLabel);
  text('main-detail', model.main.detail);
  resource('main', model.main.percent);
  text('regeneration-date', waterOverviewDateText(model.softener.regenerationDate));
  text('regeneration-detail', model.softener.regenerationDetail);
  text('salt-label', model.softener.saltLabel);
  text('salt-value', waterOverviewNumber(model.softener.saltKg) + ' кг');
  text('salt-detail', model.softener.saltDetail);
  const nextCheck = root.querySelector('[data-overview-salt-next-check]');
  if (nextCheck) {
    panel._setText('[data-overview-salt-next-check]', model.softener.nextSaltCheck, root);
    nextCheck.hidden = !model.softener.nextSaltCheck;
  }
  text('gh-value', model.softener.ghText);
  for (const row of model.barrier.rows) {
    status(root.querySelector('[data-overview-cartridge="' + row.key + '"]'), row.tone);
    text(row.key + '-deadline', row.text);
    resource(row.key, row.percent, true);
  }
  const barrier = root.querySelector('[data-overview-card="barrier"]');
  if (barrier) barrier.dataset.overviewFilter = (model.barrier.rows.find(row => row.tone === model.barrier.tone) || model.barrier.rows[0]).key;

  const banner = root.querySelector('[data-overview-notice]');
  if (!banner) return;
  banner.hidden = !model.notice;
  if (model.notice) {
    const item = model.notice;
    status(banner, item.tone);
    text('notice-title', item.title);
    text('notice-detail', item.detail);
    for (const [key, value] of Object.entries({view: item.view, overviewFilter: item.filter, filterAction: item.action})) {
      if (value) banner.dataset[key] = value;
      else delete banner.dataset[key];
    }
    const icon = root.querySelector('[data-overview-notice-icon]');
    const name = item.view === 'quality' ? 'mdi:flask-outline' : item.action === 'reload' ? 'mdi:refresh'
      : item.tone === 'due' ? 'mdi:alert-circle-outline' : 'mdi:information-outline';
    if (icon?.getAttribute('icon') !== name) icon?.setAttribute('icon', name);
  }
}
