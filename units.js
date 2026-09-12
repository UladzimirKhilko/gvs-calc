/**
 * units.js — конвертация единиц измерения мощности и расхода.
 *
 * Расчёт в calc.js всегда работает в канонических единицах методики —
 * Мкал/ч (мощность) и т/ч (расход). Это отдельный слой поверх calc.js:
 * пользователь может вводить/смотреть значения в любых единицах из списка,
 * а под капотом всё конвертируется в канонические и обратно.
 *
 * Факторы заданы как «сколько канонических единиц в одной единице списка»
 * (value_канон = value_в_единице * factor), поэтому конвертация в обе
 * стороны — простое умножение/деление на один и тот же фактор.
 *
 * 1 Гкал/ч = 1.163 МВт — стандартный коэффициент теплоснабжения, отсюда
 * выведены факторы для Вт/кВт/МВт. Расход переведён из предположения
 * плотности воды ≈ 1000 кг/м³ (т/ч ≈ м³/ч численно).
 */
(function (root) {
  'use strict';

  var POWER_UNITS = [
    ['W', 'Вт', 1 / 1163],
    ['kW', 'кВт', 1000 / 1163],
    ['MW', 'МВт', 1000000 / 1163],
    ['kcal_h', 'ккал/ч', 0.001],
    ['Mcal_h', 'Мкал/ч', 1],
    ['Gcal_h', 'Гкал/ч', 1000]
  ];

  var FLOW_UNITS = [
    ['kg_s', 'кг/с', 3.6],
    ['t_h', 'т/ч', 1],
    ['m3_h', 'м³/ч', 1],
    ['l_h', 'л/ч', 0.001],
    ['l_s', 'л/с', 3.6]
  ];

  var POWER_FACTOR = {}, POWER_LABEL = {};
  POWER_UNITS.forEach(function (u) { POWER_FACTOR[u[0]] = u[2]; POWER_LABEL[u[0]] = u[1]; });
  var FLOW_FACTOR = {}, FLOW_LABEL = {};
  FLOW_UNITS.forEach(function (u) { FLOW_FACTOR[u[0]] = u[2]; FLOW_LABEL[u[0]] = u[1]; });

  function toMcal(value, unit) { return value * POWER_FACTOR[unit]; }
  function fromMcal(mcal, unit) { return mcal / POWER_FACTOR[unit]; }
  function powerUnitLabel(unit) { return POWER_LABEL[unit]; }

  function toTph(value, unit) { return value * FLOW_FACTOR[unit]; }
  function fromTph(tph, unit) { return tph / FLOW_FACTOR[unit]; }
  function flowUnitLabel(unit) { return FLOW_LABEL[unit]; }

  var units = {
    POWER_UNITS: POWER_UNITS,
    FLOW_UNITS: FLOW_UNITS,
    toMcal: toMcal,
    fromMcal: fromMcal,
    powerUnitLabel: powerUnitLabel,
    toTph: toTph,
    fromTph: fromTph,
    flowUnitLabel: flowUnitLabel
  };

  var GVS = root.GVS = root.GVS || {};
  GVS.units = units;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = units;
  }
})(typeof window !== 'undefined' ? window : globalThis);
