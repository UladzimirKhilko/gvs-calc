/**
 * app.js — связывает чистые модули (calc.js, units.js, solver.js, validate.js,
 * scheme.js, format.js) с DOM: состояние формы, обработчики событий, рендер
 * входных полей/таблиц/схемы. Сам не содержит формул — вся логика расчёта
 * в calc.js и соседних модулях, это только «проводка».
 */
(function () {
  'use strict';

  var GVS = window.GVS;

  var state = {
    qGvs: 120, qOt: 419.1,
    t1Winter: 120, t2Winter: 70,
    t1Break: 60, t2Break: 36,
    tCold: 5, tHot: 55,
    e14: 34, y14: 30,
    mode: 'manual',
    targetU14: 30, y14Auto: 30,
    scheme: 'separate',
    animate: true,
    powerUnit: 'Mcal_h',
    flowUnit: 't_h'
  };

  function toDisplayPower(mcal) { return GVS.units.fromMcal(mcal, state.powerUnit); }
  function powerUnitLabel() { return GVS.units.powerUnitLabel(state.powerUnit); }
  function toMcal(v, unit) { return GVS.units.toMcal(v, unit); }
  function toDisplayFlow(tph) { return GVS.units.fromTph(tph, state.flowUnit); }
  function flowUnitLabel() { return GVS.units.flowUnitLabel(state.flowUnit); }
  function numForInput(n) { if (!isFinite(n)) return ''; return (Math.round(n * 1000) / 1000).toString(); }

  var fmt = GVS.format.fmt, fmtPower = GVS.format.fmtPower, fmtFlow = GVS.format.fmtFlow;
  function cellVal(v, kind) {
    if (kind === 'power') return fmtPower(toDisplayPower(v));
    if (kind === 'flow') return fmtFlow(toDisplayFlow(v));
    return fmt(v);
  }

  // fieldDefs: kind 'power' — значение хранится в state в канонических Мкал/ч и
  // вводится/показывается в текущей выбранной единице; kind 'temp' — обычная
  // температура, единицы не меняются.
  var fieldDefs = [
    { key: 'qOt', prefix: 'Qот — нагрузка отопления', group: 'heating', kind: 'power', layout: 'row' },
    { key: 't1Winter', label: 'T1 зима — подача из ТС, °C', group: 'heating', kind: 'temp', layout: 'row' },
    { key: 't2Winter', label: 'T2 зима — обратка в ТС, °C', group: 'heating', kind: 'temp', layout: 'row' },

    { key: 'qGvs', prefix: 'Qгвс — нагрузка ГВС', group: 'gvs-top', kind: 'power', layout: 'row' },

    { key: 't1Break', label: "T1' точка излома — подача, °C", group: 'gvs-hot', kind: 'temp', layout: 'col' },
    { key: 't2Break', label: "T2' точка излома — обратка СО, °C", group: 'gvs-hot', kind: 'temp', layout: 'col' },

    { key: 'tCold', label: 'tх.в. — холодная вода, °C', group: 'gvs-cold', kind: 'temp', layout: 'col' },
    { key: 'tHot', label: 'tг.в. — требуемая ГВС, °C', group: 'gvs-cold', kind: 'temp', layout: 'col' }
  ];
  var fieldByKey = {};
  fieldDefs.forEach(function (f) { fieldByKey[f.key] = f; });

  var groupContainers = {
    heating: document.getElementById('inputs-heating'),
    'gvs-top': document.getElementById('inputs-gvs-top'),
    'gvs-hot': document.getElementById('inputs-gvs-hot'),
    'gvs-cold': document.getElementById('inputs-gvs-cold')
  };
  fieldDefs.forEach(function (f) {
    var row = document.createElement('div');
    row.className = f.layout === 'col' ? 'field-col' : 'field-row';
    var labelHtml, valueAttr;
    if (f.kind === 'power') {
      labelHtml = '<label for="in-' + f.key + '">' + f.prefix + ', <span id="unit-' + f.key + '">' + powerUnitLabel() + '</span></label>';
      valueAttr = numForInput(toDisplayPower(state[f.key]));
    } else {
      labelHtml = '<label for="in-' + f.key + '">' + f.label + '</label>';
      valueAttr = state[f.key];
    }
    row.innerHTML = labelHtml + '<input type="text" id="in-' + f.key + '" data-field="' + f.key + '" value="' + valueAttr + '">';
    groupContainers[f.group].appendChild(row);
  });

  function refreshPowerFieldDisplay() {
    ['qOt', 'qGvs'].forEach(function (key) {
      var input = document.getElementById('in-' + key);
      if (input) input.value = numForInput(toDisplayPower(state[key]));
      var unitEl = document.getElementById('unit-' + key);
      if (unitEl) unitEl.textContent = powerUnitLabel();
    });
  }

  // подсветка полей с ошибками валидации (validate.js) — не блокирует ввод/расчёт,
  // только предупреждает; сам расчёт (calc.js) устойчив к некорректным данным
  // (не бросает исключений), поэтому таблица и схема продолжают обновляться.
  function applyValidation(v) {
    fieldDefs.forEach(function (f) {
      var input = document.getElementById('in-' + f.key);
      if (input) input.classList.remove('field-error');
    });
    var panel = document.getElementById('input-errors');
    var list = document.getElementById('input-errors-list');
    if (v.errors.length === 0) {
      panel.hidden = true;
      list.innerHTML = '';
      return;
    }
    v.errors.forEach(function (e) {
      var input = document.getElementById('in-' + e.field);
      if (input) input.classList.add('field-error');
    });
    list.innerHTML = v.errors.map(function (e) { return '<li>' + e.message + '</li>'; }).join('');
    panel.hidden = false;
  }

  function render() {
    var c = GVS.calculate(state);
    var v = GVS.validate(state);
    applyValidation(v);

    // Сводная таблица ГВС: строки — показатели, столбцы — II/I ступень × Греющая/Нагреваемая.
    // Q общая для обеих сред одной ступени (тепловой баланс), поэтому дублируется в паре столбцов.
    var pctII = c.g14 / state.qGvs * 100, pctI = c.w14 / state.qGvs * 100;
    var gvsRows = [
      { label: 'Тепловая нагрузка Q', kind: 'power', iiHot: c.g14, iiCold: c.g14, iHot: c.w14, iCold: c.w14 },
      { label: 'Температура на входе, °C', kind: 'temp', iiHot: state.t1Break, iiCold: state.y14, iHot: c.t14, iCold: state.tCold },
      { label: 'Температура на выходе, °C', kind: 'temp', iiHot: state.e14, iiCold: state.tHot, iHot: c.u14, iCold: state.y14 },
      { label: 'Расход, ' + flowUnitLabel(), kind: 'flow', iiHot: c.f14, iiCold: c.z14, iHot: c.v14, iCold: c.z14 }
    ];
    document.getElementById('results-body').innerHTML = gvsRows.map(function (r) {
      // тепловая нагрузка одинакова для греющей и нагреваемой сред одной ступени (тепловой баланс) —
      // показываем одной объединённой ячейкой на ступень, вместе с долей ступени в общей нагрузке ГВС
      if (r.kind === 'power') {
        var iiText = cellVal(r.iiHot, 'power') + ' ' + powerUnitLabel() + ' · ' + fmt(pctII) + ' %';
        var iText = cellVal(r.iHot, 'power') + ' ' + powerUnitLabel() + ' · ' + fmt(pctI) + ' %';
        return '<tr><td class="name">' + r.label + '</td>' +
          '<td class="num col-stage" colspan="2">' + iiText + '</td>' +
          '<td class="num col-stage" colspan="2">' + iText + '</td></tr>';
      }
      return '<tr><td class="name">' + r.label + '</td>' +
        '<td class="num col-hot">' + cellVal(r.iiHot, r.kind) + '</td>' +
        '<td class="num col-cold">' + cellVal(r.iiCold, r.kind) + '</td>' +
        '<td class="num col-hot">' + cellVal(r.iHot, r.kind) + '</td>' +
        '<td class="num col-cold">' + cellVal(r.iCold, r.kind) + '</td></tr>';
    }).join('');

    // Справочная таблица «Отопление» — те же 4 показателя, но по режимам (зимний период / точка излома).
    var heatRows = [
      { label: 'Тепловая нагрузка Q, ' + powerUnitLabel(), kind: 'power', winter: state.qOt, breakPt: c.o14 },
      { label: 'Температура на входе, °C', kind: 'temp', winter: state.t1Winter, breakPt: state.t1Break },
      { label: 'Температура на выходе, °C', kind: 'temp', winter: state.t2Winter, breakPt: state.t2Break },
      { label: 'Расход, ' + flowUnitLabel(), kind: 'flow', winter: c.n14, breakPt: c.r14 }
    ];
    document.getElementById('heating-results-body').innerHTML = heatRows.map(function (r) {
      return '<tr><td class="name">' + r.label + '</td>' +
        '<td class="num col-heat">' + cellVal(r.winter, r.kind) + '</td>' +
        '<td class="num col-heat">' + cellVal(r.breakPt, r.kind) + '</td></tr>';
    }).join('');

    // статус-бейдж — берём предупреждение о типовом диапазоне E14 из validate.js,
    // чтобы не дублировать одну и ту же проверку в двух местах
    var badge = document.getElementById('range-badge');
    var e14Warn = v.warnings.some(function (w) { return w.field === 'e14'; });
    if (!e14Warn) {
      badge.className = 'badge ok'; badge.textContent = 'Т после II ступени в норме (32–38 °C) · возврат в сеть ≈ ' + fmt(c.u14) + ' °C';
    } else {
      badge.className = 'badge warn'; badge.textContent = 'Т после II ступени вне типового диапазона · возврат в сеть ≈ ' + fmt(c.u14) + ' °C';
    }

    var fig = document.getElementById('scheme-figure');
    fig.innerHTML = GVS.scheme.renderScheme(state, c);
    fig.querySelector('svg').classList.toggle('flowing', state.animate);
  }

  // ---- ввод исходных данных ----
  fieldDefs.forEach(function (f) {
    document.getElementById('in-' + f.key).addEventListener('input', function (e) {
      // запятая или точка — не важно, что вводит пользователь: parseFloat всегда даёт число с точкой внутри
      var v = parseFloat(e.target.value.replace(',', '.'));
      if (isNaN(v)) return;
      state[f.key] = f.kind === 'power' ? toMcal(v, state.powerUnit) : v;
      render();
    });
  });

  document.getElementById('power-unit-select').addEventListener('change', function (e) {
    state.powerUnit = e.target.value;
    refreshPowerFieldDisplay();
    render();
  });
  document.getElementById('flow-unit-select').addEventListener('change', function (e) {
    state.flowUnit = e.target.value;
    render();
  });

  function syncSlider(id, outId, key) {
    var el = document.getElementById(id), out = document.getElementById(outId);
    el.addEventListener('input', function () {
      state[key] = parseFloat(el.value);
      out.textContent = state[key].toFixed(1);
      render();
    });
  }
  syncSlider('e14', 'e14-val', 'e14');
  syncSlider('y14', 'y14-val', 'y14');

  document.getElementById('tab-manual').addEventListener('click', function () {
    state.mode = 'manual';
    this.setAttribute('aria-selected', 'true');
    document.getElementById('tab-auto').setAttribute('aria-selected', 'false');
    document.getElementById('manual-controls').hidden = false;
    document.getElementById('auto-controls').hidden = true;
  });
  document.getElementById('tab-auto').addEventListener('click', function () {
    state.mode = 'auto';
    this.setAttribute('aria-selected', 'true');
    document.getElementById('tab-manual').setAttribute('aria-selected', 'false');
    document.getElementById('manual-controls').hidden = true;
    document.getElementById('auto-controls').hidden = false;
  });

  document.getElementById('solve-btn').addEventListener('click', function () {
    var target = parseFloat(document.getElementById('target-u14').value.replace(',', '.'));
    var y = parseFloat(document.getElementById('y14-auto').value.replace(',', '.'));
    var status = document.getElementById('solve-status');
    if (isNaN(target) || isNaN(y)) { status.textContent = 'Заполните оба поля.'; return; }
    state.y14 = y;
    var solved = GVS.solveE14(state, target);
    if (solved === null) { status.textContent = 'Цель недостижима в диапазоне 15–55 °C — измените целевую температуру возврата или промежуточную температуру ГВС.'; return; }
    state.e14 = solved;
    document.getElementById('e14').value = solved;
    document.getElementById('e14-val').textContent = solved.toFixed(1);
    document.getElementById('y14').value = y;
    document.getElementById('y14-val').textContent = y.toFixed(1);
    status.textContent = 'Подобрано: Т после II ступени = ' + solved.toFixed(1) + ' °C.';
    render();
  });

  document.getElementById('anim-toggle').addEventListener('change', function (e) {
    state.animate = e.target.checked;
    var svg = document.querySelector('#scheme-figure svg');
    if (svg) svg.classList.toggle('flowing', state.animate);
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name=scheme]'), function (r) {
    r.addEventListener('change', function () { state.scheme = this.value; render(); });
  });

  // ---- печать (PDF через диалог печати браузера) ----
  // <details> «Сведения о заказчике» на печати должен быть раскрыт, даже если
  // на экране свёрнут — иначе в распечатке нет ни заказчика, ни объекта.
  var customerDetails = document.getElementById('customer-details');
  var wasOpenBeforePrint = null;
  window.addEventListener('beforeprint', function () {
    wasOpenBeforePrint = customerDetails.open;
    customerDetails.open = true;
  });
  window.addEventListener('afterprint', function () {
    if (wasOpenBeforePrint !== null) customerDetails.open = wasOpenBeforePrint;
    wasOpenBeforePrint = null;
  });
  document.getElementById('print-btn').addEventListener('click', function () {
    window.print();
  });

  // ---- экспорт в DOCX (export-docx.js собирает XML, zip.js упаковывает в .docx) ----
  // Числа берутся отформатированными теми же функциями, что и HTML-таблица на экране,
  // чтобы отчёт в Word никогда не разошёлся с тем, что видно в браузере.
  document.getElementById('docx-btn').addEventListener('click', function () {
    try {
      var c = GVS.calculate(state);
      var pctII = c.g14 / state.qGvs * 100, pctI = c.w14 / state.qGvs * 100;
      var cust = {
        name: document.getElementById('cust-name').value,
        contact: document.getElementById('cust-contact').value,
        object: document.getElementById('cust-object').value
      };
      var model = {
        title: 'Разбивка тепловой нагрузки ГВС',
        subtitle: 'Двухступенчатая смешанная схема',
        customer: cust,
        inputs: [
          { label: 'Qгвс — нагрузка ГВС', value: fmtPower(toDisplayPower(state.qGvs)) + ' ' + powerUnitLabel() },
          { label: 'Qот — нагрузка отопления', value: fmtPower(toDisplayPower(state.qOt)) + ' ' + powerUnitLabel() },
          { label: 'T1 зима — подача из ТС, °C', value: fmt(state.t1Winter) },
          { label: 'T2 зима — обратка в ТС, °C', value: fmt(state.t2Winter) },
          { label: "T1' точка излома — подача, °C", value: fmt(state.t1Break) },
          { label: "T2' точка излома — обратка СО, °C", value: fmt(state.t2Break) },
          { label: 'tх.в. — холодная вода, °C', value: fmt(state.tCold) },
          { label: 'tг.в. — требуемая ГВС, °C', value: fmt(state.tHot) },
          { label: 'Т сетевой воды после II ступени (E14), °C', value: fmt(state.e14) },
          { label: 'Т воды ГВС после I ступени (Y14), °C', value: fmt(state.y14) }
        ],
        summaryHeaders: ['Показатель', 'II ст. — Греющая', 'II ст. — Нагреваемая', 'I ст. — Греющая', 'I ст. — Нагреваемая'],
        summaryRows: [
          ['Тепловая нагрузка Q, ' + powerUnitLabel(),
            fmtPower(toDisplayPower(c.g14)) + ' (' + fmt(pctII) + '%)', fmtPower(toDisplayPower(c.g14)) + ' (' + fmt(pctII) + '%)',
            fmtPower(toDisplayPower(c.w14)) + ' (' + fmt(pctI) + '%)', fmtPower(toDisplayPower(c.w14)) + ' (' + fmt(pctI) + '%)'],
          ['Температура на входе, °C', fmt(state.t1Break), fmt(state.y14), fmt(c.t14), fmt(state.tCold)],
          ['Температура на выходе, °C', fmt(state.e14), fmt(state.tHot), fmt(c.u14), fmt(state.y14)],
          ['Расход, ' + flowUnitLabel(), fmtFlow(toDisplayFlow(c.f14)), fmtFlow(toDisplayFlow(c.z14)), fmtFlow(toDisplayFlow(c.v14)), fmtFlow(toDisplayFlow(c.z14))]
        ],
        heatingRows: [
          ['Тепловая нагрузка Q, ' + powerUnitLabel(), fmtPower(toDisplayPower(state.qOt)), fmtPower(toDisplayPower(c.o14))],
          ['Температура на входе, °C', fmt(state.t1Winter), fmt(state.t1Break)],
          ['Температура на выходе, °C', fmt(state.t2Winter), fmt(state.t2Break)],
          ['Расход, ' + flowUnitLabel(), fmtFlow(toDisplayFlow(c.n14)), fmtFlow(toDisplayFlow(c.r14))]
        ],
        badgeText: document.getElementById('range-badge').textContent,
        generatedAt: new Date().toLocaleString('ru-RU')
      };
      var bytes = GVS.docx.build(model);
      var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      var objectSuffix = cust.object ? '_' + cust.object.replace(/[^\wа-яА-ЯёЁ-]+/g, '_') : '';
      a.download = 'gvs-razbivka' + objectSuffix + '.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    } catch (err) {
      console.error(err);
      alert('Не удалось сформировать DOCX: ' + err.message);
    }
  });

  render();
})();
