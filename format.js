/**
 * format.js — форматирование чисел для вывода (таблица, схема, статус-строка).
 *
 * Разделитель дробной части — всегда точка: используется toFixed(), а не
 * toLocaleString(), поэтому результат не зависит ни от локали браузера,
 * ни от того, что вводил пользователь (запятую или точку — это уже
 * нормализуется на входе, см. app.js).
 *
 * Правило числа знаков после точки (см. «Анализ_методики_ГВС.docx»):
 *   - тепловая нагрузка (Q) — всегда 3 знака;
 *   - расход — всегда 2 знака;
 *   - всё остальное (температуры, проценты) — 1–2 знака, без лишнего
 *     хвостового нуля.
 *
 * Ничего не знает про DOM. Работает и в браузере (GVS.format), и в Node
 * (module.exports) — для тестов.
 */
(function (root) {
  'use strict';

  /** Общий формат: 1–2 знака после точки, без лишнего хвостового нуля. */
  function fmt(n) {
    if (!isFinite(n)) return '—';
    var s = (Math.round(n * 100) / 100).toFixed(2);
    if (s.slice(-1) === '0') s = s.slice(0, -1);
    return s;
  }

  /** Тепловая нагрузка — всегда 3 знака после точки. */
  function fmtPower(n) {
    if (!isFinite(n)) return '—';
    return n.toFixed(3);
  }

  /** Расход — всегда 2 знака после точки. */
  function fmtFlow(n) {
    if (!isFinite(n)) return '—';
    return n.toFixed(2);
  }

  var format = {
    fmt: fmt,
    fmtPower: fmtPower,
    fmtFlow: fmtFlow
  };

  var GVS = root.GVS = root.GVS || {};
  GVS.format = format;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = format;
  }
})(typeof window !== 'undefined' ? window : globalThis);
