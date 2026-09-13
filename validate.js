/**
 * validate.js — правила валидации исходных данных.
 *
 * Проверяет физическую осмысленность введённых значений (а не просто
 * «это число») — например, что подача горячее обратки, что требуемая
 * температура ГВС выше температуры холодной воды и т. п. Формирует два
 * списка: errors (расчёт даст NaN/деление на 0 или бессмысленный результат —
 * ввод нужно поправить) и warnings (расчёт возможен, но результат
 * подозрительный — расчётная температура возврата в сеть U14 заметно
 * отличается от температуры графика в точке излома Т2', заданной в исходных
 * данных, а не от какого-то одного «типового» диапазона — у каждого объекта
 * график свой).
 *
 * Ничего не знает про DOM — принимает объект state и возвращает данные,
 * а как их показать (подсветка поля, текст под полем) решает app.js.
 */
(function (root) {
  'use strict';

  var GVS = root.GVS = root.GVS || {};

  var REQUIRED_FIELDS = [
    'qGvs', 'qOt', 't1Winter', 't2Winter', 't1Break', 't2Break', 'tCold', 'tHot', 'e14', 'y14'
  ];

  /**
   * @param {object} s - состояние расчёта (см. calc.js)
   * @returns {{errors: Array<{field:string,message:string}>, warnings: Array<{field:string,message:string}>}}
   */
  function validate(s) {
    var errors = [];
    var warnings = [];

    REQUIRED_FIELDS.forEach(function (key) {
      var v = s[key];
      if (typeof v !== 'number' || !isFinite(v)) {
        errors.push({ field: key, message: 'Введите число' });
      }
    });
    // дальше проверяем только то, что уже прошло базовую проверку на число —
    // иначе одна и та же причина попадёт в errors дважды разными формулировками
    var bad = {};
    errors.forEach(function (e) { bad[e.field] = true; });

    if (!bad.qGvs && s.qGvs <= 0) {
      errors.push({ field: 'qGvs', message: 'Нагрузка ГВС должна быть больше 0' });
    }
    if (!bad.qOt && s.qOt <= 0) {
      errors.push({ field: 'qOt', message: 'Нагрузка отопления должна быть больше 0' });
    }
    if (!bad.t1Winter && !bad.t2Winter && s.t1Winter <= s.t2Winter) {
      errors.push({ field: 't2Winter', message: 'Т2 зима (обратка) должна быть ниже Т1 зима (подача)' });
    }
    if (!bad.t1Break && !bad.t2Break && s.t1Break <= s.t2Break) {
      errors.push({ field: 't2Break', message: 'Т2 точка излома (обратка) должна быть ниже Т1 точка излома (подача)' });
    }
    if (!bad.tCold && !bad.tHot && s.tHot <= s.tCold) {
      errors.push({ field: 'tHot', message: 'Требуемая температура ГВС должна быть выше температуры холодной воды' });
    }
    if (!bad.e14 && !bad.t1Break && s.e14 >= s.t1Break) {
      errors.push({ field: 'e14', message: 'Т после II ступени должна быть ниже Т1 точка излома (иначе II ступень не греет)' });
    }
    if (!bad.y14 && !bad.tCold && !bad.tHot && (s.y14 <= s.tCold || s.y14 >= s.tHot)) {
      errors.push({ field: 'y14', message: 'Промежуточная Т ГВС должна быть между холодной водой и требуемой ГВС' });
    }

    // Предупреждение о «нетиповом» случае раньше сверялось с зашитым диапазоном
    // 32–38 °C. Это было неверно: температурный график в точке излома у каждого
    // объекта свой (Т2' может быть и 30, и 40, и 52 °C — это входные данные, а не
    // константа), поэтому единого «типового» диапазона для E14 не существует.
    // Правильная проверка — сравнить РЕЗУЛЬТАТ расчёта (расчётную температуру
    // возврата в сеть U14) с тем, что задано в исходных данных как Т2' точки
    // излома: смысл подбора E14/Y14 в том, чтобы сложение потоков I и II ступени
    // давало на выходе именно эту температуру графика. Если расчётная U14 от неё
    // заметно отличается — сочетание E14/Y14 подобрано некорректно (или цель в
    // «Автоматическом» режиме недостижима и взято ближайшее значение).
    if (errors.length === 0) {
      var c = GVS.calculate(s);
      var TOL = 0.5; // °C — допуск на округления, не более
      if (isFinite(c.u14) && Math.abs(c.u14 - s.t2Break) > TOL) {
        warnings.push({
          field: 'e14',
          message: 'Расчётная Т возврата в сеть (' + c.u14.toFixed(1) + ' °C) отличается от температуры графика в точке излома Т2\' (' + s.t2Break.toFixed(1) + ' °C) — проверьте подбор Т после II ступени и промежуточной Т ГВС'
        });
      }
    }

    return { errors: errors, warnings: warnings };
  }

  GVS.validate = validate;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validate: validate };
  }
})(typeof window !== 'undefined' ? window : globalThis);
