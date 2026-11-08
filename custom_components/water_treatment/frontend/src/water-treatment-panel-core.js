/* NikaS Water Treatment — standalone manual-maintenance panel. */
const TREATMENT_APP = Object.freeze({
  title: "Водоподготовка",
  uiVersion: "0.2.0-beta007",
  preferredView: "overview",
  safeReturnRoute: "/home/overview",
  tabs: [
    ["overview", "mdi:view-dashboard-outline", "Обзор"],
    ["filters", "mdi:filter-outline", "Фильтры"],
    ["softener", "mdi:water-sync", "Ёлка"],
    ["quality", "mdi:flask-outline", "Жёсткость"],
    ["settings", "mdi:cog-outline", "Настройки"],
  ],
  entities: Object.freeze({drinking_total:"sensor.schetchik_vody_svd_20_0020989_pokazaniia"}),
});
const TREATMENT_CSS = "__WATER_TREATMENT_CSS__";
const VIEW_STORAGE_KEY = "nikas.water-treatment.view.v1";
const VALID_VIEWS = new Set(TREATMENT_APP.tabs.map(tab => tab[0]));

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeReturnRoute(value) {
  return normalizeNikasBaseRoute(value);
}

function resolveReturnRoute(panel) {
  return captureNikasShellReturnRoute({
    panelId: "water-treatment",
    parentRoute: panel._panel && panel._panel.config
      ? panel._panel.config.parent_route
      : null,
    safeReturnRoute: TREATMENT_APP.safeReturnRoute,
  });
}

function navigateToSource(panel) {
  const route = safeReturnRoute(panel._returnRoute) || TREATMENT_APP.safeReturnRoute;
  navigateNikasShell(route);
}

function numeric(value) {
  if (value == null || BAD_STATES.has(String(value).trim().toLowerCase())) return null;
  const result = Number(String(value).replace(",", "."));
  return Number.isFinite(result) ? result : null;
}

function loadStoredChoice(key, valid, fallback) {
  try {
    const value = localStorage.getItem(key);
    return valid.has(value) ? value : fallback;
  } catch (_error) {
    return fallback;
  }
}

function saveStoredChoice(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_error) {
    // Local persistence is optional.
  }
}


function waterErrorText(error) {
  if (typeof error === 'string') return error;
  const message = error?.message || error?.error?.message;
  if (typeof message === 'string' && message) return message;
  const code = error?.code || error?.error?.code;
  return typeof code === 'string' ? code : 'Неизвестная ошибка связи с Home Assistant';
}

function waterOperationId() {
  return globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
}

class NikaSWaterTreatmentPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pendingWrites = new Map();
    this._loadErrorMessages = new Map();
    this._filterData = null;
    this._filterLoadError = false;
    this._filterDisconnected = false;
    this._filterBusy = false;
    this._filterLoadPromise = null;
    this._saltDraftRevision = 0;
    this._filterControlEdits = new Map();
    this._filterDirtyControls = new Set();
    this._filterDraftBases = new Map();
    this._filterTimer = null;
    this._hass = null;
    this._panel = null;
    this._shellMounted = false;
    this._patchQueued = false;
    this._returnRoute = null;
    this._view = loadStoredChoice(VIEW_STORAGE_KEY, VALID_VIEWS, TREATMENT_APP.preferredView);
    this._views = new Map();
    this._refreshing = false;
    this._refreshToken = 0;
    this._refreshDelayTimer = null;
    this._refreshResultTimer = null;
    this._toastTimer = null;
    this._removeScrollBoundaryGuard = null;
    this._hold = null;
    this._holdFiredUntil = 0;
  }

  set hass(value) {
    const disconnected = value?.connection?.connected === false;
    if (this._filterDisconnected && !disconnected) this._filterData = null;
    this._filterDisconnected = disconnected;
    this._hass = value;
    this._queuePatch();
  }

  get hass() {
    return this._hass;
  }

  set panel(value) {
    this._panel = value;
    const preferred = value && value.config ? value.config.preferred_view : null;
    if (VALID_VIEWS.has(preferred) && !this._shellMounted) this._view = preferred;
    this._queuePatch();
  }

  get panel() {
    return this._panel;
  }

  connectedCallback() {
    this._mountShell();
    this._queuePatch();
  }

  disconnectedCallback() {
    window.clearTimeout(this._filterTimer);
    this._filterTimer = null;
    this._refreshToken += 1;
    this._refreshing = false;
    if (this._refreshDelayTimer !== null) {
      window.clearTimeout(this._refreshDelayTimer.id);
      this._refreshDelayTimer.resolve();
      this._refreshDelayTimer = null;
    }
    if (this._refreshResultTimer !== null) {
      window.clearTimeout(this._refreshResultTimer);
      this._refreshResultTimer = null;
    }
    if (this._toastTimer !== null) {
      window.clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    const previousToast = this.shadowRoot.querySelector(".panel-toast");
    if (previousToast) previousToast.classList.remove("visible");
    if (this._removeScrollBoundaryGuard) {
      this._removeScrollBoundaryGuard();
      this._removeScrollBoundaryGuard = null;
    }
    this._cancelHold();
  }

  _config() {
    const config = this._panel && this._panel.config ? this._panel.config : {};
    const tabs = Array.isArray(config.tabs) && config.tabs.length
      ? config.tabs.slice(0, 5)
      : TREATMENT_APP.tabs;
    return {
      title: config.title || TREATMENT_APP.title,
      uiVersion: /^\d+\.\d+\.\d+$/.test(String(config.ui_version || ""))
        ? String(config.ui_version)
        : TREATMENT_APP.uiVersion,
      tabs: tabs,
      entities: Object.assign({}, TREATMENT_APP.entities, config.entities || {}),
    };
  }

  _mountShell() {
    if (this._shellMounted || !this.isConnected) return;
    if (this._returnRoute == null) this._returnRoute = resolveReturnRoute(this);
    const config = this._config();
    this.shadowRoot.innerHTML = '<style>' + TREATMENT_CSS + nikasShellV2Styles() + '</style>'
      + '<div class="app-shell nikas-shell">'
      + '<header class="app-header nikas-shell__header">'
      + '<button type="button" class="header-action nikas-shell__side-action" id="menu" aria-label="Меню Home Assistant">'
      + '<ha-icon icon="mdi:menu"></ha-icon></button>'
      + '<button type="button" class="header-title nikas-shell__title" id="return-source" aria-label="Вернуться на главную панель">'
      + '<strong>' + escapeHtml(config.title) + '</strong>'
      + '<small>UI v' + escapeHtml(config.uiVersion) + '</small></button>'
      + '<button type="button" class="header-action nikas-shell__side-action nikas-shell__side-action--right" id="refresh" aria-label="Обновить">'
      + '<ha-icon icon="mdi:refresh"></ha-icon></button>'
      + '</header>'
      + '<main class="canvas-viewport nikas-shell__viewport" aria-label="Рабочая область панели">'
      + '<div class="work-canvas nikas-shell__canvas"><div class="work-content nikas-shell__content"></div></div></main>'
      + '<nav class="tabbar nikas-shell__tabs" aria-label="Разделы"></nav>'
      + '<div class="scale-status" role="status" aria-live="polite">Масштаб 100%</div>'
      + '<div class="panel-toast" role="status" aria-live="polite"></div>'
      + '</div>';
    this._removeScrollBoundaryGuard = createNikasShellScrollBoundaryGuard({
      host: this,
      viewport: this.shadowRoot.querySelector(".canvas-viewport"),
    });
    this._bindShellEvents();
    this._renderTabBar();
    VALID_VIEWS.forEach(view => this._ensureView(view));
    this._activateView(this._view, false);
    this._shellMounted = true;
    window.requestAnimationFrame(() => {
      if (this.isConnected) {
        window.NikasPanelZoom && window.NikasPanelZoom.attach
          ? window.NikasPanelZoom.attach(this, { min: 0.75, max: 2.0 })
          : null;
      }
    });
  }

  _bindShellEvents() {
    this.shadowRoot.addEventListener("click", (event) => {
      const button = event.target && event.target.closest ? event.target.closest("button") : null;
      if (!button) return;
      if (Date.now() < this._holdFiredUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (button.id === "menu") {
        this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
      } else if (button.id === "return-source") {
        navigateToSource(this);
      } else if (button.id === "refresh") {
        this._refresh();
      } else if (button.dataset.filterAction) {
        this._filterAction(button);
      } else if (button.dataset.view) {
        this._activateView(button.dataset.view, true);
        if (button.dataset.overviewFilter) this._focusOverviewFilter(button.dataset.overviewFilter);
      }
    });

    this.shadowRoot.addEventListener("input", (event) => {
      if (event.target && event.target.id === "salt-kg") this._saltDraftRevision += 1;
      if (event.target && event.target.id) this._recordFilterEdit(event.target.id);
    });
    this.shadowRoot.addEventListener("change", (event) => {
      if (event.target && event.target.id) this._recordFilterEdit(event.target.id);
      if (event.target.id === "filter-profile") {
        const profile = event.target.value;
        this.shadowRoot.querySelector("#filter-volume").value = profile === "wound" ? 200 : 100;
        this.shadowRoot.querySelector("#filter-months").value = 6;
        this._recordFilterEdit('filter-volume');
        this._recordFilterEdit('filter-months');
      }
    });
    this.shadowRoot.addEventListener("pointerdown", (event) => this._beginHold(event));
    this.shadowRoot.addEventListener("pointermove", (event) => this._moveHold(event));
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
      this.shadowRoot.addEventListener(name, () => this._cancelHold());
    });
  }

  _beginHold(event) {
    const target = event.target && event.target.closest
      ? event.target.closest("[data-entity]")
      : null;
    if (!target || !target.dataset.entity) return;
    this._cancelHold();
    this._hold = {
      target: target,
      entityId: target.dataset.entity,
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        if (!this._hold) return;
        this._holdFiredUntil = Date.now() + 650;
        this.dispatchEvent(new CustomEvent("hass-more-info", {
          detail: { entityId: this._hold.entityId },
          bubbles: true,
          composed: true,
        }));
        this._cancelHold();
      }, 550),
    };
  }

  _moveHold(event) {
    if (!this._hold) return;
    if (Math.hypot(event.clientX - this._hold.x, event.clientY - this._hold.y) > 8) {
      this._cancelHold();
    }
  }

  _cancelHold() {
    if (this._hold && this._hold.timer) window.clearTimeout(this._hold.timer);
    this._hold = null;
  }

  _renderTabBar() {
    const nav = this.shadowRoot.querySelector(".tabbar");
    if (!nav || nav.childElementCount) return;
    const tabs = this._config().tabs;
    nav.style.setProperty("--nikas-shell-tab-count", String(Math.max(1, tabs.length)));
    tabs.forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nikas-shell__tab";
      button.dataset.view = tab[0];
      button.setAttribute("aria-label", tab[2]);
      button.innerHTML = '<ha-icon icon="' + escapeHtml(tab[1]) + '"></ha-icon>'
        + '<small>' + escapeHtml(tab[2]) + '</small>';
      nav.appendChild(button);
    });
  }

  _viewMarkup(view) {
    if (view === "overview") return waterOverviewMarkup(this._config().uiVersion);
    if (view === "softener") return this._saltMarkup() + waterSoftenerMarkup();
    if (view === "quality") return waterQualityMarkup();
    if (view === "settings") return this._settingsMarkup();
    return this._filtersMarkup();
  }

  _ensureView(view) {
    if (this._views.has(view)) return this._views.get(view);
    const root = document.createElement("section");
    root.className = "page page-" + view;
    root.dataset.viewRoot = view;
    root.hidden = true;
    root.innerHTML = this._viewMarkup(view);
    this.shadowRoot.querySelector(".work-content").appendChild(root);
    this._views.set(view, root);
    this._applyEntityTargets(root);
    return root;
  }

  _applyEntityTargets(root) {
    const entities = this._config().entities;
    root.querySelectorAll("[data-entity-role]").forEach((node) => {
      const entityId = entities[node.dataset.entityRole];
      if (entityId) node.dataset.entity = entityId;
      else node.removeAttribute("data-entity");
    });
  }

  _activateView(view, fromUser) {
    const next = VALID_VIEWS.has(view) ? view : TREATMENT_APP.preferredView;
    const root = this._ensureView(next);
    this._views.forEach((node, key) => {
      node.hidden = key !== next;
    });
    this._view = next;
    saveStoredChoice(VIEW_STORAGE_KEY, next);
    this.shadowRoot.querySelectorAll(".tabbar [data-view]").forEach((button) => {
      const active = button.dataset.view === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    if (fromUser) {
      const controller = window.NikasPanelZoom && window.NikasPanelZoom.attach
        ? window.NikasPanelZoom.attach(this)
        : null;
      if (controller && controller.resetPosition) controller.resetPosition();
      else this.shadowRoot.querySelector(".canvas-viewport").scrollTop = 0;
    }
    this._loadFilters();
    this._queuePatch();
  }

  _focusOverviewFilter(key) {
    if (!['main', 'ferrostop', 'softening', 'postcarbon'].includes(key)) return;
    window.requestAnimationFrame(() => {
      if (this._view !== 'filters' || !this.isConnected) return;
      const card = this.shadowRoot.querySelector('[data-filter-card="' + key + '"]');
      const viewport = this.shadowRoot.querySelector('.canvas-viewport');
      if (!card || !viewport) return;
      card.setAttribute('tabindex', '-1');
      card.focus({preventScroll: true});
      viewport.scrollTop += card.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 12;
    });
  }

  _filtersMarkup() {
    const cards = [["main", "Магистральный · профиль BB20"], ["ferrostop", "Профиль ЭКСПЕРТ Ферростоп"],
      ["softening", "ЭКСПЕРТ Смягчение"], ["postcarbon", "ЭКСПЕРТ Посткарбон"]];
    const input = (id, label, type, extra) => '<label>' + label + '<input id="' + id
      + '" type="' + type + '" ' + (extra || '') + '></label>';
    return '<p class="filter-feedback" data-filter-message role="status" aria-live="polite">Загрузка данных…</p>'
      + cards.map(([key, title]) => '<section class="card filter-card" data-filter-card="' + key + '">'
        + '<h2>' + title + '</h2><strong data-filter-status="' + key + '">Нет данных</strong>'
        + waterDetailMarkup(key, [['days', 'Осталось'], ['deadline', 'Замена до'],
          ...(key === 'main' ? [['used', 'После замены'], ['remaining', 'Остаток объёма'], ['percent', 'Ресурс по объёму']] : [])])
        + '<p data-filter-detail="' + key + '"></p>'
        + (key === 'softening' ? '<p data-softening-card-basis></p>' : '')
        + '<div class="filter-form">' + input('date-' + key, 'Дата последней замены', 'date')
        + (key === 'main' ? input('baseline-main', 'Показание при замене, м³', 'number', 'min="0" step="0.001"') : '')
        + '</div><div class="filter-actions"><button type="button" data-filter-action="record" data-filter="' + key + '">Сохранить дату'
        + '</button><button type="button" data-filter-action="replace" data-filter="' + key + '">Картридж заменён</button></div>'
        + '<p class="filter-feedback" data-filter-feedback="' + key + '" role="status" aria-live="polite"></p></section>').join('');
  }

  _settingsMarkup() {
    const input = (id, label, type, extra) => '<label>' + label + '<input id="' + id
      + '" type="' + type + '" ' + (extra || '') + '></label>';
    return '<section class="card filter-settings"><h2>Настройки магистрального фильтра</h2><div class="filter-form">'
      + '<label>Профиль<select id="filter-profile"><option value="mechanical">Механика BB20 · 5 мкм</option>'
      + '<option value="wound">Нитка BB20 · 10 мкм</option></select></label>'
      + input('filter-volume', 'Ресурс, м³', 'number', 'min="0.001" max="10000" step="0.001" required')
      + input('filter-months', 'Срок, месяцев', 'number', 'min="0.5" max="12" step="0.5" required')
      + '<label>Контроль<select id="filter-mode"><option value="volume">По объёму</option><option value="time">По времени</option>'
      + '<option value="both">Что наступит раньше</option></select></label></div>'
      + '<details class="filter-help"><summary>Как считается ресурс</summary>'
      + '<p>Магистральный — по счётчику питьевой воды. Полив не учитывается.</p>'
      + '<p>Профиль BB20 выбран для обслуживания; маркировку установленного картриджа нужно сверить отдельно.</p>'
      + '<p>Профили БАРЬЕР: механика — 100 м³; нитка — 200 м³. Срок 6 месяцев для нитки — начальная настройка, не подтверждённая рекомендация производителя. Объём и срок можно изменить.</p></details></section>'
      + '<section class="card filter-settings"><h2>Настройки ЭКСПЕРТ Комплекс</h2><div class="filter-form">'
      + input('filter-people', 'Количество пользователей', 'number', 'min="1" max="20" step="1" required')
      + input('filter-hardness', 'На входе БАРЬЕР после Ёлки, °Ж (мг-экв/л)', 'number', 'min="0.0001" max="100" step="0.0001"')
      + '</div>' + waterSofteningBasisMarkup() + '<div class="filter-form">'
      + '<label>Срок смягчения<select id="filter-auto"><option value="auto">По таблице БАРЬЕР</option>'
      + '<option value="manual">Задать вручную</option></select></label>'
      + input('months-ferrostop', 'Ферростоп, месяцев', 'number', 'min="0.5" max="12" step="0.5" required')
      + input('months-softening', 'Смягчение вручную, месяцев', 'number', 'min="0.5" max="12" step="0.5"')
      + input('months-postcarbon', 'Посткарбон, месяцев', 'number', 'min="0.5" max="12" step="0.5" required')
      + '</div><p data-softening-form-hint></p><details class="filter-help"><summary>Профиль и сроки обслуживания</summary>'
      + '<p>Профиль ЭКСПЕРТ Комплекс выбран для обслуживания; маркировку установленных картриджей нужно сверить отдельно.</p>'
      + '<p>Расчёт для 1–3 пользователей и жёсткости до 5 мг-экв/л; не более 6 месяцев. Вне таблицы задайте срок вручную. Начальные сроки Ферростопа и Посткарбона — 6 месяцев. Полмесяца = 15 дней.</p></details>'
      + '<button type="button" data-filter-action="settings">Сохранить настройки</button>'
      + '<p data-filter-settings-message role="status" aria-live="polite">Загрузка настроек…</p>'
      + '<p>Настройки не сбрасывают даты и расход. Изменять их может администратор HA.</p></section>';
  }

  _loadFilters(fill) {
    if (this._filterLoadPromise) return this._filterLoadPromise;
    if (this._filterBusy || !this._hass || typeof this._hass.callWS !== "function") return Promise.resolve();
    this._filterLoadPromise = this._readFilters(fill).finally(() => {
      this._filterLoadPromise = null;
      this._scheduleFiltersRefresh();
    });
    return this._filterLoadPromise;
  }

  _scheduleFiltersRefresh() {
    window.clearTimeout(this._filterTimer);
    this._filterTimer = null;
    if (this.isConnected) {
      this._filterTimer = window.setTimeout(() => this._loadFilters(), 30000);
    }
  }

  async _readFilters(fill) {
    const guard = {edits: new Map(this._filterControlEdits), ids: null, preserveDrafts: true};
    try {
      const data = await this._withTimeout(this._hass.callWS({ type: "water_treatment/filters" }), 15000);
      this._filterLoadError = false;
      for (const [selector, message] of this._loadErrorMessages) {
        const node = this.shadowRoot.querySelector(selector);
        if (node?.textContent === message) node.textContent = '';
      }
      this._loadErrorMessages.clear();
      this._filterData = data;
      this._paintFilters(true, guard);
      this._setText("[data-filter-message]", "");
      this._setText("[data-filter-settings-message]", "Данные водоподготовки актуальны");
    } catch (error) {
      this._filterData = null;
      this._filterLoadError = true;
      paintWaterOverview(this);
      this._setText("[data-filter-message]", "Не удалось получить данные: " + waterErrorText(error));
      for (const selector of ['[data-filter-settings-message]', '[data-salt-message]', '[data-cycle-message]', '[data-treatment-message]', '[data-gh-message]']) {
        const message = "Не удалось получить данные: " + waterErrorText(error);
        this._loadErrorMessages.set(selector, message);
        this._setText(selector, message);
      }
      this.shadowRoot.querySelectorAll("[data-filter-status]").forEach(node => { node.textContent = "Нет данных"; });
      this.shadowRoot.querySelectorAll("[data-filter-detail]").forEach(node => { node.textContent = ""; });
      this._setText('[data-salt-status]', 'Нет данных');
      this.shadowRoot.querySelectorAll('[data-detail-value]').forEach(node => { node.textContent = 'Нет данных'; });
      this.shadowRoot.querySelectorAll('[data-detail-note]').forEach(node => { node.textContent = ''; });
      this.shadowRoot.querySelectorAll('[data-filter-card], [data-salt-card]').forEach(node => { node.dataset.status = 'unknown'; });
      this._setText('[data-salt-coverage-note]', 'Нет данных для оценки');
      this._setText('[data-treatment-codes]', '');
      paintWaterGhHistory(this, [], 'Нет данных');
      paintWaterSofteningBasis(this);
    }
  }

  _saltMarkup() {
    return '<section class="card filter-card" data-salt-card><h2>Ёлка — запас соли</h2>'
      + '<div class="device-identity"><span>Кабинетный умягчитель</span><strong>WSC-0,5-Rx-(SC)</strong>'
      + '<span>Клапан <b>Runxin F69A3</b></span></div><strong data-salt-status>Нет данных</strong>'
      + waterDetailMarkup('salt', [['checked', 'Последняя проверка'], ['next', 'До проверки'], ['added', 'Последняя досыпка', true]])
      + '<p>Состояние запаса — по ручной проверке.</p>'
      + '<div class="filter-form"><label>Досыпано, кг<input id="salt-kg" type="number" min="0.1" max="100" step="0.1"></label>'
      + '<label>Запас при проверке<select id="salt-level"><option value="enough">Достаточно</option>'
      + '<option value="low">Мало — досыпать</option><option value="empty">Соль закончилась</option></select></label></div>'
      + '<div class="filter-actions"><button type="button" data-filter-action="salt_topup">Записать досыпку</button>'
      + '<button type="button" data-filter-action="salt_check">Запас проверен</button></div>'
      + '<p data-salt-message role="status" aria-live="polite">Введите массу и нажмите «Записать досыпку».</p>'
      + waterSaltLedgerMarkup()
      + '<details><summary>Настройки и история соли</summary><div class="filter-form">'
      + '<label>Проверять каждые, дней<input id="salt-days" type="number" min="1" max="90" step="1"></label>'
      + '<label>Соль за регенерацию, кг<input id="salt-dose" type="number" min="0.1" max="20" step="0.1"></label>'
      + '<label>Основание дозы<select id="salt-dose-basis"><option value="assumed">Предварительная оценка</option><option value="measured">Измерена при калибровке</option><option value="legacy_unverified">Унаследована, не проверена</option></select></label></div>'
      + '<button type="button" data-filter-action="salt_settings">Сохранить настройки соли</button>'
      + '<p>Настройки меняют дозу и напоминание; досыпку записывает отдельная кнопка выше. Для старой версии 1 кг/цикл предварителен. Современные 1,5 кг автоматически не применяются. Интервал проверки по умолчанию 6 дней.</p>'
      + '<button type="button" data-filter-action="salt_cleanup">Убрать точные повторы</button>'
      + '<p>Очистка объединяет одинаковые проверки и досыпки до последнего обслуживания бака. Исходный журнал сохраняется в архиве.</p>'
      + '<p data-salt-history></p></details></section>';
  }

  _paintSalt(fill, guard) {
    const cfg = this._filterData && this._filterData.settings.salt;
    const state = this._filterData && this._filterData.salt_status;
    if (!cfg || !state) return;
    const labels = {unknown:'Запас ещё не проверен',ok:'По последней проверке: достаточно',check:'Пора проверить соль',low:'Мало соли — досыпать',empty:'Соль закончилась — досыпать'};
    this._setText('[data-salt-status]',labels[state.state]);
    paintWaterDetail(this, 'salt-checked', waterRecordedDate(cfg.last_checked));
    paintWaterDetail(this, 'salt-next', state.days == null ? 'Нет данных'
      : state.days > 0 ? state.days + ' дн.' : state.days === 0 ? 'Сегодня' : 'Просрочена на ' + Math.abs(state.days) + ' дн.');
    paintWaterDetail(this, 'salt-added', cfg.last_added_kg == null ? 'Не записана' : waterCompactNumber(cfg.last_added_kg) + ' кг',
      cfg.last_added ? waterRecordedDate(cfg.last_added) : '');
    this._setText('[data-salt-history]',cfg.history.slice(-30).reverse().map(waterSaltEventText).join(' • ') || 'История пока пуста');
    const card=this.shadowRoot.querySelector('[data-salt-card]');
    if(card) card.dataset.status = state.state === 'ok' ? 'ok' : ['low','empty'].includes(state.state) ? 'due' : state.state === 'check' ? 'warning' : 'unknown';
    if(fill) {
      const values={'salt-days':cfg.check_days,'salt-dose':cfg.dose,'salt-level':cfg.level === 'unknown' ? 'enough' : cfg.level};
      Object.entries(values).forEach(([id,value]) => this._fillFilterControl(id,value,guard));
    }
  }

  _recordFilterEdit(id) {
    this._filterControlEdits.set(id, (this._filterControlEdits.get(id) || 0) + 1);
    this._filterDirtyControls.add(id);
    if (id === 'filter-auto') paintWaterSofteningMode(this);
    const filter = id === 'baseline-main' ? 'main' : id.startsWith('date-') ? id.slice(5) : null;
    if (['main','ferrostop','softening','postcarbon'].includes(filter)) {
      this._setText('[data-filter-feedback="' + filter + '"]', '');
    }
    const section = waterDraftSection(id);
    if (section && this._filterData && !this._filterDraftBases.has(section)) {
      this._filterDraftBases.set(section, {revision: this._filterData.revision,
        fingerprint: waterSettingsFingerprint(this._filterData.settings,section)});
    }
  }

  _filterEditingRevision(action) {
    const base = this._filterDraftBases.get(action);
    if (base && base.fingerprint !== waterSettingsFingerprint(this._filterData?.settings,action)) return base.revision;
    return this._filterData && this._filterData.revision;
  }

  _fillFilterControl(id, value, guard) {
    if (guard && ((guard.ids && !guard.ids.has(id)) || (this._filterControlEdits.get(id) || 0) !== (guard.edits.get(id) || 0))) return;
    if (guard && guard.preserveDrafts) {
      const section = waterDraftSection(id);
      if (this._filterDirtyControls.has(id) || (section && Array.from(this._filterDirtyControls)
        .some(dirty => waterDraftSection(dirty) === section))) return;
    }
    const node = this.shadowRoot.querySelector('#' + id);
    if (!node) return;
    if (typeof value === 'boolean') node.checked = value;
    else node.value = value == null ? '' : value;
  }

  _paintFilters(fill, guard) {
    paintWaterOverview(this);
    const data = this._filterData;
    if (!data || !this._views.has("filters")) return;
    const cfg = data.settings;
    const labels = { unconfigured: "Укажите дату замены", unknown: "Нет данных для расчёта",
      due: "Заменить картридж", warning: "Скоро замена", ok: "Ресурс в норме" };
    Object.entries(data.status).forEach(([key, item]) => {
      this._setText('[data-filter-status="' + key + '"]', labels[item.state]);
      const parts = [];
      paintWaterDetail(this, key + '-days', item.days == null ? 'Нет данных'
        : item.days === 0 ? 'Сегодня' : Math.abs(item.days) + ' дн.', '', item.days < 0 ? 'Просрочено' : 'Осталось');
      paintWaterDetail(this, key + '-deadline', item.deadline ? waterRecordedDate(item.deadline) : 'Нет данных');
      if (key === 'main') {
        paintWaterDetail(this, 'main-used', item.used == null ? 'Нет данных' : waterCompactNumber(item.used, 3) + ' м³');
        paintWaterDetail(this, 'main-remaining', item.remaining == null ? 'Нет данных' : waterCompactNumber(Math.max(0, item.remaining), 3) + ' м³');
        paintWaterDetail(this, 'main-percent', item.percent == null ? 'Нет данных' : Math.round(item.percent) + '%', 'Осталось');
      }
      if (key === 'main' && item.used == null) parts.push('Нет расхода: проверьте счётчик и показание при замене');
      if (key === 'softening' && cfg.softening_auto && cfg.cartridges.softening.months == null) parts.push('Укажите жёсткость или задайте срок вручную');
      this._setText('[data-filter-detail="' + key + '"]', parts.join(' · '));
      const card = this.shadowRoot.querySelector('[data-filter-card="' + key + '"]');
      if (card) card.dataset.status = item.state;
    });
    if (fill) {
      const values = { 'filter-profile': cfg.main.profile, 'filter-volume': cfg.main.volume,
        'filter-months': cfg.main.months, 'filter-mode': cfg.main.mode, 'filter-people': cfg.people,
        'filter-hardness': cfg.hardness, 'filter-auto': cfg.softening_auto ? 'auto' : 'manual',
        'date-main': cfg.main.date, 'baseline-main': cfg.main.baseline };
      Object.entries(cfg.cartridges).forEach(([key, item]) => {
        values['date-' + key] = item.date;
        values['months-' + key] = item.months ?? null;
      });
      Object.entries(values).forEach(([id, value]) => this._fillFilterControl(id,value,guard));
      this._filtersFilled = true;
    }
    this._paintSalt(fill, guard);
    paintWaterTreatment(this, fill, guard);
    paintWaterSofteningBasis(this);
    paintWaterSofteningMode(this);
    if (fill && (!guard || (!guard.ids && !guard.preserveDrafts))) {
      for (const [section,ids] of [['settings',WATER_FILTER_SETTING_IDS],['treatment_settings',WATER_TREATMENT_SETTING_IDS],['salt_settings',['salt-days','salt-dose','salt-dose-basis']]]) {
        if (!guard || ids.every(id=>(this._filterControlEdits.get(id)||0)===(guard.edits.get(id)||0))) this._filterDraftBases.delete(section);
      }
    }
    const admin = this._hass.user && this._hass.user.is_admin;
    this.shadowRoot.querySelectorAll('[data-filter-action]').forEach(button => {
      button.disabled = button.dataset.filterAction !== 'reload' && !admin;
    });
  }

  _filterMessage(message, action, filter) {
    if (action === 'settings') this._setText('[data-filter-settings-message]', message);
    else if (action.startsWith('salt_')) {
      this._setText('[data-salt-message]', message);
      if (action === 'salt_regeneration') this._setText('[data-cycle-message]', message);
    }
    else if (action.startsWith('treatment_')) {
      this._setText('[data-treatment-message]', message);
      if (action === 'treatment_gh') this._setText('[data-gh-message]', message);
    } else if (['main','ferrostop','softening','postcarbon'].includes(filter)) {
      this._setText('[data-filter-feedback="' + filter + '"]', message);
    } else this._setText('[data-filter-message]', message);
  }

  async _filterAction(button) {
    const action = button.dataset.filterAction;
    if (action === 'reload') { this._filtersFilled = false; return this._loadFilters(true); }
    if (this._filterBusy) return;
    const feedback = message => this._filterMessage(message, action, button.dataset.filter);
    const root = this.shadowRoot;
    const editingRevision = this._filterEditingRevision(action);
    const saltDraftRevision = this._saltDraftRevision;
    const value = id => root.querySelector('#' + id).value;
    let payload;
    if (action === 'salt_cleanup') {
      if (!window.confirm('Убрать точные повторы проверок и досыпок до последнего обслуживания? Исходный журнал будет сохранён в архиве; текущий запас не изменится.')) return;
      payload = {};
    } else if (action.startsWith('treatment_') || ['salt_service','salt_remove','salt_regeneration'].includes(action)) {
      try { payload = waterTreatmentPayload(root, action); }
      catch (error) { feedback('Не сохранено: ' + error.message); return; }
      if (payload === null) return;
    } else if (action.startsWith('salt_')) {
      const ids = action === 'salt_settings' ? ['salt-days','salt-dose'] : action === 'salt_topup' ? ['salt-kg'] : [];
      for (const id of ids) { const node=root.querySelector('#'+id); if (!node.value || !node.reportValidity()) { feedback('Заполните параметры соли'); return; } }
      payload = action === 'salt_settings' ? {check_days:Number(value('salt-days')),dose:Number(value('salt-dose'))}
        : action === 'salt_topup' ? {kg:Number(value('salt-kg'))} : {level:value('salt-level')};
      const basis = root.querySelector('#salt-dose-basis');
      if (action === 'salt_settings' && basis) payload.dose_basis = basis.value;
    } else if (action === 'settings') {
      const automatic = value('filter-auto') === 'auto';
      for (const id of WATER_FILTER_SETTING_IDS) {
        if (automatic && id === 'months-softening') continue;
        const node = root.querySelector('#' + id);
        if (!node.reportValidity()) return;
      }
      payload = { main: { profile: value('filter-profile'), volume: Number(value('filter-volume')),
        months: Number(value('filter-months')), mode: value('filter-mode') }, people: Number(value('filter-people')),
        hardness: value('filter-hardness') ? Number(value('filter-hardness')) : null,
        softening_auto: automatic,
        months: Object.fromEntries(['ferrostop', 'softening', 'postcarbon']
          .filter(key => !automatic || key !== 'softening')
          .map(key => [key, Number(value('months-' + key))])) };
    } else {
      payload = { filter: button.dataset.filter };
      if (action === 'record') {
        payload.date = value('date-' + payload.filter);
        if (!payload.date) { feedback('Укажите дату замены'); return; }
        if (payload.filter === 'main') {
          if (!value('baseline-main')) { feedback('Укажите показание при замене'); return; }
          payload.baseline = Number(value('baseline-main'));
        }
      }
      if (action === 'replace' && !window.confirm('Картридж заменён сегодня? Начать новый отсчёт ресурса?')) return;
    }
    const fillGuard = {edits: new Map(this._filterControlEdits), ids: waterFilterFillIds(action,payload)};
    this._filterBusy = true;
    button.disabled = true;
    window.clearTimeout(this._filterTimer);
    feedback('Сохраняю…');
    try {
      // A top-up appends to the current history. Settings edits retain the revision
      // they were based on, so a background read cannot hide another user's edit.
      // The write guard spans this wait so a second press cannot duplicate a top-up.
      if (this._filterLoadPromise) await this._filterLoadPromise;
      if (!this._filterData) throw new Error('Обновите данные фильтров и повторите запись');
      const revision = action === 'salt_topup' || editingRevision == null
        ? this._filterData.revision : editingRevision;
      // Keep the same id after an ambiguous failure, including a panel reload.
      const pendingKey = 'water-treatment:pending:' + (this._hass.user?.id || 'current') + ':' + action;
      const payloadFingerprint = JSON.stringify(payload);
      let pending = this._pendingWrites.get(action);
      if (!pending) {
        try { pending = JSON.parse(sessionStorage.getItem(pendingKey)); } catch (_error) { /* Optional storage. */ }
      }
      if (!pending || pending.fingerprint !== payloadFingerprint) pending = {fingerprint: payloadFingerprint, id: waterOperationId()};
      this._pendingWrites.set(action, pending);
      try { sessionStorage.setItem(pendingKey, JSON.stringify(pending)); } catch (_error) { /* Optional storage. */ }
      this._filterData = await this._withTimeout(this._hass.callWS({ type: 'water_treatment/filters', action,
        payload, revision, operation_id: pending.id }), 15000);
      this._pendingWrites.delete(action);
      try { sessionStorage.removeItem(pendingKey); } catch (_error) { /* Optional storage. */ }
      this._filterLoadError = false;
      this._paintFilters(true, fillGuard);
      for (const id of fillGuard.ids) {
        if ((this._filterControlEdits.get(id) || 0) === (fillGuard.edits.get(id) || 0)) this._filterDirtyControls.delete(id);
      }
      const fingerprint = waterSettingsFingerprint(this._filterData.settings,action);
      if (fingerprint != null) {
        if (Array.from(this._filterDirtyControls).some(id => waterDraftSection(id) === action)) {
          this._filterDraftBases.set(action,{revision:this._filterData.revision,fingerprint});
        } else this._filterDraftBases.delete(action);
      }
      if (action === 'salt_topup') {
        const input = root.querySelector('#salt-kg');
        if (this._saltDraftRevision === saltDraftRevision && Number(input.value) === payload.kg) input.value = '';
      }
      resetWaterTreatmentEvent(this, action, fillGuard);
      const newerCartridgeDraft = ['record','replace'].includes(action) && Array.from(fillGuard.ids)
        .some(id => (this._filterControlEdits.get(id) || 0) !== (fillGuard.edits.get(id) || 0));
      feedback(action === 'salt_topup'
        ? 'Сохранено: досыпано ' + this._formatNumber(payload.kg, 1) + ' кг. Дата и масса показаны выше.'
        : action === 'salt_regeneration' ? 'Сохранено: регенерация за ' + waterRecordedDate(payload.date) + '.'
        : newerCartridgeDraft ? 'Запись сохранена. Новые изменения ещё не сохранены.' : 'Сохранено');
    } catch (error) {
      feedback('Не сохранено: ' + waterErrorText(error));
    } finally {
      this._filterBusy = false;
      button.disabled = false;
      this._scheduleFiltersRefresh();
    }
  }

  _queuePatch() {
    if (this._patchQueued) return;
    this._patchQueued = true;
    const schedule = window.requestAnimationFrame || function (callback) { queueMicrotask(callback); };
    schedule(() => {
      this._patchQueued = false;
      this._patch();
    });
  }

  _patch() {
    this._mountShell();
    if (!this._shellMounted) return;
    const config = this._config();
    this._setText(".header-title strong", config.title);
    this._setText(".header-title small", "UI v" + config.uiVersion);
    paintWaterOverview(this);
    if (!this._filterData && !this._filterLoadPromise && !this._filterBusy) this._loadFilters();
    window.NikasPanelZoom && window.NikasPanelZoom.attach
      ? window.NikasPanelZoom.attach(this, { min: 0.75, max: 2.0 }).bind() : null;
  }

  _setText(selector, value, root) {
    const scope = root || this.shadowRoot;
    const node = scope.querySelector(selector);
    const text = String(value == null ? "" : value);
    if (node && node.textContent !== text) node.textContent = text;
  }

  _formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(this._hass && this._hass.locale
      ? this._hass.locale.language || "ru"
      : "ru", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  _withTimeout(promise, milliseconds) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Recorder timeout")), milliseconds);
      Promise.resolve(promise).then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      }, (error) => {
        window.clearTimeout(timer);
        reject(error);
      });
    });
  }

  _setRefreshVisual(state) {
    const button = this.shadowRoot.querySelector("#refresh");
    if (!button) return;
    const icon = button.querySelector("ha-icon");
    const details = {
      idle: ["mdi:refresh", "Обновить", "var(--primary-color, #03a9d9)"],
      busy: ["mdi:refresh", "Обновление данных", "var(--primary-color, #03a9d9)"],
      success: ["mdi:check", "Данные обновлены", "#43a047"],
      error: ["mdi:alert-circle-outline", "Ошибка обновления", "#e53935"],
    }[state] || ["mdi:refresh", "Обновить", "var(--primary-color, #03a9d9)"];
    button.classList.toggle("busy", state === "busy");
    button.classList.toggle("success", state === "success");
    button.classList.toggle("error", state === "error");
    button.disabled = state === "busy";
    button.setAttribute("aria-label", details[1]);
    button.setAttribute("aria-busy", String(state === "busy"));
    button.style.color = details[2];
    if (icon) icon.setAttribute("icon", details[0]);
  }

  _delay(milliseconds) {
    return new Promise((resolve) => {
      const timer = {
        id: null,
        resolve: resolve,
      };
      timer.id = window.setTimeout(() => {
        if (this._refreshDelayTimer === timer) this._refreshDelayTimer = null;
        resolve();
      }, milliseconds);
      this._refreshDelayTimer = timer;
    });
  }

  async _refresh() {
    if (this._refreshing) return false;
    if (this._refreshResultTimer !== null) {
      window.clearTimeout(this._refreshResultTimer);
      this._refreshResultTimer = null;
    }
    if (this._toastTimer !== null) {
      window.clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    const previousToast = this.shadowRoot.querySelector(".panel-toast");
    if (previousToast) previousToast.classList.remove("visible");
    const token = ++this._refreshToken;
    this._refreshing = true;
    this._setRefreshVisual("busy");
    const startedAt = typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
    const entities = Array.from(new Set(Object.values(this._config().entities).filter(Boolean)));
    let success = false;
    try {
      if (!entities.length || !this._hass || typeof this._hass.callService !== "function") {
        throw new Error("Home Assistant refresh service unavailable");
      }
      await this._hass.callService("homeassistant", "update_entity", { entity_id: entities });
      if (this._filterBusy) throw new Error("Дождитесь завершения записи");
      await this._loadFilters();
      if (!this._filterData) throw new Error("Не удалось получить журнал водоподготовки");
      success = true;
    } catch (_error) {
      success = false;
    }
    const elapsed = (typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now()) - startedAt;
    if (elapsed < 900) await this._delay(900 - elapsed);
    if (token !== this._refreshToken || !this.isConnected) return success;
    this._refreshing = false;
    this._setRefreshVisual(success ? "success" : "error");
    if (!success) this._showToast("Обновить данные не удалось");
    this._queuePatch();
    this._refreshResultTimer = window.setTimeout(() => {
      if (token !== this._refreshToken) return;
      this._refreshResultTimer = null;
      this._setRefreshVisual("idle");
    }, 1400);
    return success;
  }

  _showToast(message) {
    const toast = this.shadowRoot.querySelector(".panel-toast");
    if (!toast) return;
    if (this._toastTimer !== null) window.clearTimeout(this._toastTimer);
    toast.textContent = message;
    toast.classList.add("visible");
    this._toastTimer = window.setTimeout(() => {
      this._toastTimer = null;
      toast.classList.remove("visible");
    }, 1400);
  }
}

if (!customElements.get("nikas-water-treatment-panel")) {
  customElements.define("nikas-water-treatment-panel", NikaSWaterTreatmentPanel);
}
