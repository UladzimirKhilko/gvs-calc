/**
 * solver.js — автоматический подбор E14 (режим «Автоматический»).
 *
 * Задача: при фиксированном Y14 найти E14, при котором U14 (температура
 * возврата в тепловую сеть) равен заданной пользователем цели targetU14.
 * Функция U14(E14) монотонна в практическом диапазоне (проверено на данных
 * методики), поэтому применяется простой и надёжный метод бисекции —
 * без библиотек численной оптимизации.
 *
 * Зависит только от calc.js (GVS.calculate), сам не трогает DOM.
 */
(function (root) {
  'use strict';

  var GVS = root.GVS = root.GVS || {};

  /**
   * @param {object} s - состояние расчёта (см. calc.js); e14 в нём переопределяется на каждой итерации
   * @param {number} targetU14 - целевая температура возврата в тепловую сеть, °C
   * @param {number} [lo=15] - нижняя граница поиска E14, °C
   * @param {number} [hi] - верхняя граница поиска E14, °C. По умолчанию — чуть ниже
   *   T1' (точки излома подачи) самого объекта: f14 = g14/(t1Break-e14), поэтому при
   *   e14→t1Break расход неограниченно растёт (деление на 0 в пределе). Раньше здесь
   *   была зашита константа 54.9 °C, рассчитанная на демонстрационный T1'=60 — на
   *   объектах, где нужная E14 выше 55 °C (например, T1' повыше или T2' в точке
   *   излома далеко от 30-36 °C), это ошибочно объявляло достижимую цель
   *   недостижимой. Теперь граница считается от фактического T1' объекта.
   * @param {number} [iters=50] - число итераций бисекции
   * @returns {number|null} найденное E14, либо null, если цель недостижима в [lo, hi]
   */
  function solveE14(s, targetU14, lo, hi, iters) {
    lo = lo === undefined ? 15 : lo;
    hi = hi === undefined ? Math.max(lo + 0.1, s.t1Break - 0.1) : hi;
    iters = iters === undefined ? 50 : iters;

    function f(e14) {
      var trial = {};
      for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) trial[k] = s[k]; }
      trial.e14 = e14;
      return GVS.calculate(trial).u14 - targetU14;
    }

    var a = lo, b = hi, fa = f(a), fb = f(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return null; // цель недостижима в этом диапазоне

    for (var i = 0; i < iters; i++) {
      var mid = (a + b) / 2, fm = f(mid);
      if (fa * fm <= 0) { b = mid; fb = fm; } else { a = mid; fa = fm; }
    }
    return (a + b) / 2;
  }

  GVS.solveE14 = solveE14;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { solveE14: solveE14 };
  }
})(typeof window !== 'undefined' ? window : globalThis);
