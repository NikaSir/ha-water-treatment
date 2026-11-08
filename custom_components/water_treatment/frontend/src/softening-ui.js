/* Read-only explanation of the backend's saved BARRIER calculation. */
function waterSofteningBasisMarkup() {
  return '<section class="softening-basis" aria-label="Расчёт срока Смягчения">'
    + '<div class="softening-basis-heading"><span>Сохранённый срок «Смягчения»</span>'
    + '<strong data-softening-interval>Нет данных</strong></div>'
    + '<dl class="softening-basis-inputs"><div><dt>На входе</dt><dd data-softening-input>—</dd></div>'
    + '<div><dt>Пользователей</dt><dd data-softening-people>—</dd></div>'
    + '<div><dt>Основание</dt><dd data-softening-band>—</dd></div></dl>'
    + '<p data-softening-explanation></p>'
    + '<details><summary>Как жёсткость влияет на срок</summary>'
    + '<p>Меньше солей жёсткости на входе — меньше нагрузка на смолу. Таблица БАРЬЕР задаёт сроки по диапазонам; внутри одного диапазона срок одинаковый.</p>'
    + '<p>После «Ёлки» жёсткость может меняться в течение цикла. Одна проба сразу после регенерации не описывает весь период работы картриджа.</p>'
    + '<p>Проба применяется только по вашей отметке в журнале GH. Пересчёт срока не означает восстановления уже использованного картриджа.</p>'
    + '<p>В автоматическом режиме срок ограничен 6 месяцами. Жёсткость не меняет заданные сроки «Ферростопа» и «Посткарбона».</p>'
    + '<a href="https://www.barrier.ru/images/manuals/BARRIER_EXPERT_instruction.pdf" target="_blank" rel="noopener noreferrer">Таблица БАРЬЕР · стр. 11</a>'
    + '</details></section>';
}

function paintWaterSofteningMode(panel) {
  const mode = panel.shadowRoot.querySelector('#filter-auto');
  const input = panel.shadowRoot.querySelector('#months-softening');
  if (!mode || !input) return;
  const automatic = mode.value === 'auto';
  if (input.disabled !== automatic) input.disabled = automatic;
  if (input.required !== !automatic) input.required = !automatic;
  const field = input.parentElement;
  if (field && field.hidden !== automatic) field.hidden = automatic;
  panel._setText('[data-softening-form-hint]', automatic
    ? 'Срок по новым значениям жёсткости и числа пользователей появится после сохранения.'
    : 'Вручную заданный срок не зависит от поля жёсткости.');
}

function paintWaterSofteningBasis(panel) {
  const basis = panel._filterData?.softening_basis;
  if (!basis) {
    panel._setText('[data-softening-interval]', 'Нет данных');
    for (const name of ['input', 'people', 'band']) panel._setText('[data-softening-' + name + ']', 'Нет данных');
    panel._setText('[data-softening-card-basis]', 'Нет данных для расчёта срока');
    panel._setText('[data-softening-explanation]', 'Основание расчёта пока не загружено.');
    return;
  }
  const number = (value, digits = 2) => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: digits}).format(value);
  const known = value => typeof value === 'number' && Number.isFinite(value);
  const interval = known(basis.applied_months) ? number(basis.applied_months) + ' мес.' : 'Не определён';
  const hardness = known(basis.hardness) ? number(basis.hardness, 4) + ' °Ж' : 'Не указана';
  const band = basis.band_max === 3 ? 'До 3 °Ж'
    : basis.band_max === 4 ? 'Свыше 3 до 4 °Ж'
    : basis.band_max === 5 ? 'Свыше 4 до 5 °Ж' : 'Вне таблицы';
  panel._setText('[data-softening-interval]', interval);
  panel._setText('[data-softening-input]', hardness);
  panel._setText('[data-softening-people]', known(basis.people) ? String(basis.people) : 'Не указано');
  panel._setText('[data-softening-band]', basis.mode === 'manual' ? 'Вручную' : band);
  let explanation;
  if (basis.mode === 'manual') {
    explanation = 'Применяется заданный вручную срок. Жёсткость сама по себе его не меняет.';
  } else if (basis.reason === 'missing_hardness') {
    explanation = 'Укажите жёсткость на выходе «Ёлки» — это вход БАРЬЕР.';
  } else if (basis.reason === 'hardness_out_of_range') {
    explanation = 'Для этой жёсткости табличный срок не определён. Проверьте значение или задайте срок вручную.';
  } else if (basis.reason === 'people_out_of_range') {
    explanation = 'В таблице есть сроки для 1–3 пользователей. Для другого количества задайте срок вручную.';
  } else {
    explanation = 'Срок выбран по таблице БАРЬЕР. Снижение жёсткости внутри этого диапазона не увеличивает табличный срок.';
    if (basis.capped) explanation += ' В таблице ' + number(basis.table_months) + ' мес.; применён предел 6 мес.';
  }
  panel._setText('[data-softening-explanation]', explanation);
  panel._setText('[data-softening-card-basis]', basis.mode === 'manual'
    ? 'Срок задан вручную: ' + interval + '.'
    : basis.reason === 'table'
      ? 'По таблице БАРЬЕР: ' + hardness + ' на входе, ' + basis.people + ' чел. Срок — ' + interval + '.'
      : explanation);
}
