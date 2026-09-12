/**
 * scheme.js — отрисовка SVG-схемы двухступенчатой смешанной подачи ГВС.
 *
 * Возвращает готовую разметку (SVG + figcaption) в виде строки — ничего не
 * знает про DOM (не трогает document, не вешает обработчики). app.js сам
 * вставляет результат в контейнер (fig.innerHTML = ...) и переключает класс
 * .flowing по состоянию анимации.
 *
 * Геометрия трубопроводов и «зигзагов» внутри теплообменников подобрана
 * вручную так, чтобы концы труб совпадали по высоте с концами зигзагов
 * (см. историю правок прототипа) — не пересчитывается автоматически.
 *
 * Зависит от calc.js (передаётся результат расчёта c), units.js и format.js
 * (конвертация единиц и форматирование подписей на схеме).
 */
(function (root) {
  'use strict';

  var GVS = root.GVS = root.GVS || {};

  /** Текстовая подпись. */
  function lbl(x, y, text, cls, anchor) {
    return '<text x="' + x + '" y="' + y + '" class="' + (cls || 'lbl') + '" text-anchor="' + (anchor || 'middle') + '">' + text + '</text>';
  }

  /** «Окошко» значения: подпись слева, прямоугольник со значением, единица справа. */
  function field(x, y, label, value, unit, kind) {
    var bw = 56, bh = 22;
    return lbl(x - 6, y + bh / 2 + 4, label, 'lbl-muted', 'end') +
      '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="4" class="field-box ' + kind + '"/>' +
      '<text x="' + (x + bw / 2) + '" y="' + (y + bh / 2 + 4) + '" text-anchor="middle" class="field-val">' + value + '</text>' +
      lbl(x + bw + 6, y + bh / 2 + 4, unit, 'lbl-muted', 'start');
  }

  /** Путь по точкам с мягко скруглёнными углами (радиус r) вместо резких прямых поворотов. */
  function rp(pts, r) {
    if (pts.length < 3) return 'M' + pts[0][0] + ',' + pts[0][1] + ' L' + pts[1][0] + ',' + pts[1][1];
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      var d1x = p0[0] - p1[0], d1y = p0[1] - p1[1], len1 = Math.hypot(d1x, d1y);
      var d2x = p2[0] - p1[0], d2y = p2[1] - p1[1], len2 = Math.hypot(d2x, d2y);
      var rr = Math.min(r, len1 / 2, len2 / 2);
      var a1x = p1[0] + d1x / len1 * rr, a1y = p1[1] + d1y / len1 * rr;
      var a2x = p1[0] + d2x / len2 * rr, a2y = p1[1] + d2y / len2 * rr;
      d += ' L' + a1x + ',' + a1y + ' Q' + p1[0] + ',' + p1[1] + ' ' + a2x + ',' + a2y;
    }
    var last = pts[pts.length - 1];
    d += ' L' + last[0] + ',' + last[1];
    return d;
  }

  /**
   * @param {object} state - состояние приложения: поля calc.js (qGvs, qOt, t1Winter, ...)
   *   плюс scheme ('separate'|'monoblock'), powerUnit, flowUnit (см. units.js)
   * @param {object} c - результат GVS.calculate(state)
   * @returns {string} HTML-разметка: <svg>...</svg><figcaption>...</figcaption>
   */
  function renderScheme(state, c) {
    var units = GVS.units;
    var format = GVS.format;

    var toDisplayPower = function (mcal) { return units.fromMcal(mcal, state.powerUnit); };
    var powerUnitLabel = function () { return units.powerUnitLabel(state.powerUnit); };
    var toDisplayFlow = function (tph) { return units.fromTph(tph, state.flowUnit); };
    var flowUnitLabel = function () { return units.flowUnitLabel(state.flowUnit); };

    // доля каждой ступени в общей нагрузке ГВС (проценты и Мкал/ч) — не зависит от компоновки
    // (раздельные теплообменники / моноблок отличаются только физическим корпусом)
    var pctII = c.g14 / state.qGvs * 100, pctI = c.w14 / state.qGvs * 100;
    var subII = format.fmtPower(toDisplayPower(c.g14)) + ' ' + powerUnitLabel() + ' · ' + format.fmt(pctII) + ' %';
    var subI = format.fmtPower(toDisplayPower(c.w14)) + ' ' + powerUnitLabel() + ' · ' + format.fmt(pctI) + ' %';

    // общая тепловая нагрузка ГВС — окошко на одном уровне с заголовками сторон (между ними),
    // не выше их, как раньше; заголовки сторон при этом раздвинуты дальше влево/вправо,
    // чтобы освободить место в середине строки под это окошко
    var totalGvsBox = '' +
      '<rect x="240" y="34" width="200" height="40" rx="10" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.5"/>' +
      '<text x="340" y="48" text-anchor="middle" class="lbl-muted" style="font-size:9.5px; letter-spacing:.05em; text-transform:uppercase;">ГВС — общая нагрузка</text>' +
      '<text x="340" y="66" text-anchor="middle" style="font-family:&quot;PT Mono&quot;,monospace; font-weight:700; font-size:15px; fill:var(--accent);">' +
        format.fmtPower(toDisplayPower(state.qGvs)) + ' ' + powerUnitLabel() +
      '</text>';

    var svg = '' +
    '<svg viewBox="0 0 680 582" role="img" aria-label="Схема двухступенчатой смешанной подачи ГВС с температурами и расходами">' +
      '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker></defs>' +

      totalGvsBox +
      '<text x="110" y="60" text-anchor="middle" class="side-title" style="fill:var(--flow-hot)">ГРЕЮЩАЯ СТОРОНА</text>' +
      '<text x="570" y="60" text-anchor="middle" class="side-title" style="fill:var(--flow-cold)">НАГРЕВАЕМАЯ СТОРОНА</text>' +
      // всё остальное сдвинуто вниз чуть больше, чем раньше (82 вместо 70) — окошко общей нагрузки ГВС
      // теперь ниже (на уровне заголовков сторон), и без этого запаса подпись «МОНОБЛОК» оказывалась
      // впритык под окошком
      '<g transform="translate(0,82)">' +
      (state.scheme === 'monoblock' ?
        '<rect class="monoblock-box" x="276" y="10" width="168" height="464" rx="10"/>' +
        '<rect x="317" y="3" width="86" height="14" fill="var(--surface)"/>' +
        '<text x="360" y="14" text-anchor="middle" class="side-title" style="fill:var(--text-muted); font-size:11px;">МОНОБЛОК</text>'
        : '') +

      // теплообменники — подпись ступени не зависит от компоновки (раздельно/моноблок),
      // под названием — доля нагрузки ГВС и мощность этой ступени
      '<rect class="hx-box" x="290" y="56" width="140" height="88" rx="6"/>' +
      lbl(360, 36, 'II СТУПЕНЬ', 'lbl-title') +
      lbl(360, 48, subII, 'lbl-accent') +
      '<path d="M306,74 L326,88 L306,102 L326,116 L306,128" fill="none" stroke="var(--flow-hot)" stroke-width="1.6" opacity=".55"/>' +
      '<path d="M414,74 L394,88 L414,102 L394,116 L414,128" fill="none" stroke="var(--flow-cold)" stroke-width="1.6" opacity=".55"/>' +

      '<rect class="hx-box" x="290" y="376" width="140" height="88" rx="6"/>' +
      lbl(360, 356, 'I СТУПЕНЬ', 'lbl-title') +
      lbl(360, 368, subI, 'lbl-accent') +
      '<path d="M306,394 L326,408 L306,422 L326,436 L306,448" fill="none" stroke="var(--flow-hot)" stroke-width="1.6" opacity=".55"/>' +
      '<path d="M414,394 L394,408 L414,422 L394,436 L414,448" fill="none" stroke="var(--flow-cold)" stroke-width="1.6" opacity=".55"/>' +

      // RED — тепловая сеть (греющая сторона): T1/G1 вход в II ступень, T11 выход II ступени,
      // Tсо/Gсо — возврат от системы отопления (подмес), T21 — смесь на входе I ступени, T2/G2 — выход в ТС.
      // Трубы подходят к блоку на той же высоте, где заканчивается зигзаг (74/128 у II ступени, 394/448 у I
      // ступени); там, где по пути стоит окошко поля (T1, T2, T3, B1), труба идёт коротким скруглённым
      // уступом у самого блока, а дальше — на прежней высоте, чтобы не задевать текст в окошках.
      '<path class="pipe pipe-hot flow" marker-end="url(#arrow)" d="' + rp([[0, 93], [250, 93], [250, 74], [290, 74]], 10) + '"/>' +
      field(38, 64, 'T1', state.t1Break.toFixed(1), '°C', 'hot') +
      field(38, 100, 'G1', format.fmtFlow(toDisplayFlow(c.f14)), flowUnitLabel(), 'hot') +

      '<path class="pipe pipe-hot flow" d="' + rp([[290, 128], [230, 128], [230, 263]], 12) + '"/>' +
      field(110, 159, 'T11', state.e14.toFixed(1), '°C', 'hot') +

      '<path class="pipe pipe-hot flow" marker-end="url(#arrow)" d="' + rp([[0, 263], [230, 263]], 10) + '"/>' +
      field(38, 234, 'Tсо', state.t2Break.toFixed(1), '°C', 'hot') +
      field(38, 270, 'Gсо', format.fmtFlow(toDisplayFlow(c.r14)), flowUnitLabel(), 'hot') +
      '<circle class="node-dot" cx="230" cy="263" r="4"/>' +

      '<path class="pipe pipe-hot flow" marker-end="url(#arrow)" d="' + rp([[230, 263], [230, 394], [290, 394]], 12) + '"/>' +
      field(110, 319, 'T21', c.t14.toFixed(1), '°C', 'hot') +

      '<path class="pipe pipe-hot flow" marker-end="url(#arrow)" d="' + rp([[290, 448], [250, 448], [250, 429], [0, 429]], 10) + '"/>' +
      field(38, 400, 'T2', c.u14.toFixed(1), '°C', 'hot') +
      field(38, 436, 'G2', format.fmtFlow(toDisplayFlow(c.v14)), flowUnitLabel(), 'hot') +

      // BLUE — ГВС (нагреваемая сторона): B1/GГВС вход в I ступень, B11 — между ступенями, T3 — выход к потребителю
      '<path class="pipe pipe-cold flow" marker-end="url(#arrow)" d="' + rp([[680, 429], [470, 429], [470, 448], [430, 448]], 10) + '"/>' +
      field(586, 400, 'B1', state.tCold.toFixed(1), '°C', 'cold') +
      field(586, 436, 'GГВС', format.fmtFlow(toDisplayFlow(c.z14)), flowUnitLabel(), 'cold') +

      '<path class="pipe pipe-cold flow" marker-end="url(#arrow)" d="' + rp([[430, 394], [490, 394], [490, 128], [430, 128]], 12) + '"/>' +
      field(545, 252, 'B11', state.y14.toFixed(1), '°C', 'cold') +

      '<path class="pipe pipe-cold flow" marker-end="url(#arrow)" d="' + rp([[430, 74], [470, 74], [470, 95], [680, 95]], 10) + '"/>' +
      field(586, 64, 'T3', state.tHot.toFixed(1), '°C', 'cold') +
      '</g>' +

    '</svg>';

    return svg + '<figcaption>Красным — сетевая (греющая) вода, синим — вода ГВС. Tсо/Gсо — возврат от системы отопления, подмешиваемый перед I ступенью. Значения обновляются вместе с расчётом.</figcaption>';
  }

  GVS.scheme = { renderScheme: renderScheme };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderScheme: renderScheme };
  }
})(typeof window !== 'undefined' ? window : globalThis);
