/**
 * calc.test.js — модульные тесты расчётного модуля.
 *
 * Без внешнего фреймворка (Jest и т. п.) — маленький самодостаточный
 * раннер поверх встроенного в Node модуля assert, чтобй у проекта не было
 * ни одной внешней зависимости для тестов. Запуск: `node calc.test.js`.
 *
 * Порядок require важен: calc.js должен загрузиться раньше solver.js,
 * т.к. solver.js на глобальном объекте GVS ищет GVS.calculate.
 */
'use strict';
var assert = require('assert');

var calc = require('./calc.js');
var units = require('./units.js');
var solver = require('./solver.js');
var validateMod = require('./validate.js');
var format = require('./format.js');
var scheme = require('./scheme.js'); // требует GVS.units/GVS.format на глобальном объекте — грузится последним
var zip = require('./zip.js');
var docx = require('./export-docx.js'); // требует GVS.zip на глобальном объекте — грузится после zip.js

// ---- минимальный ZIP-читатель для проверки zip.js/export-docx.js (без внешних библиотек,
// см. комментарий в zip.js — почему тут вообще ручной ZIP) ----
function readU32(bytes, off) { return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0; }
function readZipEntries(bytes) {
  var i = bytes.length - 22;
  while (i >= 0 && !(bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06)) i--;
  assert.ok(i >= 0, 'не найдена сигнатура конца центрального каталога (EOCD)');
  var totalEntries = bytes[i + 10] | (bytes[i + 11] << 8);
  var centralOffset = readU32(bytes, i + 16);
  var entries = [];
  var pos = centralOffset;
  for (var e = 0; e < totalEntries; e++) {
    var nameLen = bytes[pos + 28] | (bytes[pos + 29] << 8);
    var extraLen = bytes[pos + 30] | (bytes[pos + 31] << 8);
    var commentLen = bytes[pos + 32] | (bytes[pos + 33] << 8);
    var localOffset = readU32(bytes, pos + 42);
    var name = Buffer.from(bytes.slice(pos + 46, pos + 46 + nameLen)).toString('utf8');
    entries.push({ name: name, localOffset: localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  entries.forEach(function (en) {
    var p = en.localOffset;
    var nameLen = bytes[p + 26] | (bytes[p + 27] << 8);
    var extraLen = bytes[p + 28] | (bytes[p + 29] << 8);
    var size = readU32(bytes, p + 18);
    var dataStart = p + 30 + nameLen + extraLen;
    en.data = bytes.slice(dataStart, dataStart + size);
  });
  return entries;
}

var passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL  ' + name);
    console.log('      ' + e.message);
  }
}

// базовый пример из «Анализ_методики_ГВС.docx» / прототипа:
// Qгвс=120, Qот=419.1, T1зима=120, T2зима=70, T1'=60, T2'=36, tхв=5, tгв=55, E14=34, Y14=30
var BASE_STATE = {
  qGvs: 120, qOt: 419.1,
  t1Winter: 120, t2Winter: 70,
  t1Break: 60, t2Break: 36,
  tCold: 5, tHot: 55,
  e14: 34, y14: 30
};

test('(а) базовый пример из Excel даёт U14 ≈ 29.96 °C', function () {
  var r = calc.calculate(BASE_STATE);
  assert.ok(Math.abs(r.u14 - 29.96) < 0.05, 'u14=' + r.u14 + ', ожидали ≈29.96');
  assert.ok(Math.abs(r.z14 - 2.4) < 0.001, 'z14=' + r.z14 + ', ожидали 2.4');
  assert.ok(Math.abs(r.g14 - 60) < 0.01, 'g14=' + r.g14 + ', ожидали 60 (50% нагрузки ГВС)');
  assert.ok(Math.abs(r.w14 - 60) < 0.01, 'w14=' + r.w14 + ', ожидали 60 (50% нагрузки ГВС)');
});

test('(б) T1зима=T2зима → деление на 0 не бросает исключение, даёт не-конечное значение', function () {
  var s = Object.assign({}, BASE_STATE, { t2Winter: BASE_STATE.t1Winter });
  var r;
  assert.doesNotThrow(function () { r = calc.calculate(s); });
  assert.strictEqual(isFinite(r.n14), false, 'n14 должно быть Infinity при делении на 0, получили ' + r.n14);
});

test('(в) E14 почти равен T1\' (точка излома) — большой, но конечный расход, без исключения', function () {
  var s = Object.assign({}, BASE_STATE, { e14: BASE_STATE.t1Break - 0.001 });
  var r;
  assert.doesNotThrow(function () { r = calc.calculate(s); });
  assert.ok(isFinite(r.f14), 'f14 должно остаться конечным числом, получили ' + r.f14);
  assert.ok(r.f14 > 1e4, 'f14 должно резко вырасти при E14→T1\', получили ' + r.f14);
});

test('units: конвертация мощности и расхода туда-обратно даёт исходное число', function () {
  var kw = 250;
  var mcal = units.toMcal(kw, 'kW');
  var back = units.fromMcal(mcal, 'kW');
  assert.ok(Math.abs(back - kw) < 1e-9, 'round-trip kW дал ' + back);

  var ls = 3.6;
  var tph = units.toTph(ls, 'l_s');
  var back2 = units.fromTph(tph, 'l_s');
  assert.ok(Math.abs(back2 - ls) < 1e-9, 'round-trip л/с дал ' + back2);

  assert.strictEqual(units.powerUnitLabel('Gcal_h'), 'Гкал/ч');
  assert.strictEqual(units.flowUnitLabel('t_h'), 'т/ч');
});

test('solver: solveE14 подбирает E14, дающее заданную целевую U14', function () {
  var target = 32; // произвольная достижимая цель, отличная от базового примера
  var e14 = solver.solveE14(BASE_STATE, target);
  assert.notStrictEqual(e14, null, 'цель должна быть достижима в диапазоне 15–54.9 °C');
  var r = calc.calculate(Object.assign({}, BASE_STATE, { e14: e14 }));
  assert.ok(Math.abs(r.u14 - target) < 0.05, 'после подбора U14=' + r.u14 + ', ожидали ' + target);
});

test('solver: физически недостижимая цель возвращает null, а не NaN/исключение', function () {
  var e14;
  assert.doesNotThrow(function () { e14 = solver.solveE14(BASE_STATE, 1000); });
  assert.strictEqual(e14, null);
});

test('solver: цель, требующая E14 > 55 °C, достижима, если это ниже T1\' объекта (регрессия)', function () {
  // Раньше верхняя граница поиска была зашита константой 54.9 °C (годилась только
  // для демонстрационного T1'=60 с «удобными» целями). На реальных объектах, где
  // T2' в точке излома далёк от 30-36 °C, нужная E14 может быть и выше 55 °C, но
  // всё ещё ниже фактического T1' — такая цель обязана находиться, а не считаться
  // «недостижимой».
  var s = { qGvs: 830, qOt: 685, t1Winter: 120, t2Winter: 90, t1Break: 60, t2Break: 52, tCold: 5, tHot: 55, y14: 35 };
  var target = 52;
  var e14 = solver.solveE14(s, target);
  assert.notStrictEqual(e14, null, 'цель U14=52 при T1\'=60 должна быть достижима (нужна E14 > 55 °C)');
  assert.ok(e14 > 55, 'ожидали, что подобранная E14 > 55 °C, получили ' + e14);
  var r = calc.calculate(Object.assign({}, s, { e14: e14 }));
  assert.ok(Math.abs(r.u14 - target) < 0.05, 'после подбора U14=' + r.u14 + ', ожидали ' + target);
});

test('validate: корректные исходные данные не дают ошибок', function () {
  var res = validateMod.validate(BASE_STATE);
  assert.deepStrictEqual(res.errors, []);
});

test('validate: обратка выше подачи — ошибка на верном поле', function () {
  var s = Object.assign({}, BASE_STATE, { t2Winter: 130 }); // выше t1Winter=120
  var res = validateMod.validate(s);
  assert.ok(res.errors.some(function (e) { return e.field === 't2Winter'; }), 'ожидали ошибку на t2Winter');
});

test('validate: предупреждение сверяет U14 с графиком Т2\', а не с фиксированным диапазоном', function () {
  // Т2'=45 — далеко за пределами старого «типового» 32–38 °C, но это законное
  // значение графика точки излома, и E14 подобран так, чтобы U14 ему
  // соответствовал → предупреждения быть не должно, несмотря на T2'=45.
  var solved = solver.solveE14(Object.assign({}, BASE_STATE, { t2Break: 45 }), 45);
  assert.notStrictEqual(solved, null, 'цель U14=45 должна быть достижима');
  var sGood = Object.assign({}, BASE_STATE, { t2Break: 45, e14: solved });
  var resGood = validateMod.validate(sGood);
  assert.ok(!resGood.warnings.some(function (w) { return w.field === 'e14'; }),
    'при U14≈Т2\' предупреждения быть не должно, даже если Т2\' вне старого диапазона 32–38');

  // а вот BASE_STATE (E14=34, Y14=30, T2'=36) даёт U14≈29.96 — заметно отличается
  // от T2'=36, и это должно быть предупреждением именно по новой логике.
  var resMismatch = validateMod.validate(BASE_STATE);
  assert.ok(resMismatch.warnings.some(function (w) { return w.field === 'e14'; }),
    'при U14, заметно отличающейся от T2\', предупреждение должно появиться');
});

test('format: fmtPower/fmtFlow дают фиксированное число знаков, разделитель — точка', function () {
  assert.strictEqual(format.fmtPower(60), '60.000');
  assert.strictEqual(format.fmtFlow(2.4), '2.40');
  assert.strictEqual(format.fmt(50), '50.0'); // убирается только один хвостовой ноль, не оба
  assert.strictEqual(format.fmt(29.955), '29.96'); // округление, не банковское
  assert.ok(format.fmtPower(1).indexOf(',') === -1, 'в тепловой нагрузке не должно быть запятой');
});

test('scheme: renderScheme не бросает исключение и включает обе стороны схемы', function () {
  var r = calc.calculate(BASE_STATE);
  var stateWithScheme = Object.assign({}, BASE_STATE, {
    scheme: 'separate', powerUnit: 'Mcal_h', flowUnit: 't_h'
  });
  var html;
  assert.doesNotThrow(function () { html = scheme.renderScheme(stateWithScheme, r); });
  assert.ok(html.indexOf('<svg') !== -1, 'должен вернуться SVG');
  assert.ok(html.indexOf('ГРЕЮЩАЯ СТОРОНА') !== -1);
  assert.ok(html.indexOf('НАГРЕВАЕМАЯ СТОРОНА') !== -1);
  assert.ok(html.indexOf('II СТУПЕНЬ') !== -1 && html.indexOf('I СТУПЕНЬ') !== -1);

  var monoblockState = Object.assign({}, stateWithScheme, { scheme: 'monoblock' });
  var htmlMono;
  assert.doesNotThrow(function () { htmlMono = scheme.renderScheme(monoblockState, r); });
  assert.ok(htmlMono.indexOf('МОНОБЛОК') !== -1);
});

test('zip: makeZip даёт корректный архив — файлы читаются обратно с тем же содержимым', function () {
  var files = [
    { name: 'a.txt', data: zip.utf8Bytes('привет мир') },
    { name: 'dir/b.txt', data: zip.utf8Bytes('a&b<c>"d"') }
  ];
  var bytes = zip.makeZip(files);
  assert.strictEqual(bytes[0], 0x50); assert.strictEqual(bytes[1], 0x4b); // сигнатура 'PK'
  var entries = readZipEntries(bytes);
  assert.strictEqual(entries.length, 2);
  var a = entries.filter(function (e) { return e.name === 'a.txt'; })[0];
  var b = entries.filter(function (e) { return e.name === 'dir/b.txt'; })[0];
  assert.ok(a && b, 'оба файла должны найтись в центральном каталоге');
  assert.strictEqual(Buffer.from(a.data).toString('utf8'), 'привет мир');
  assert.strictEqual(Buffer.from(b.data).toString('utf8'), 'a&b<c>"d"');
});

test('export-docx: build() даёт валидный .docx с ожидаемыми частями и текстом', function () {
  var model = {
    title: 'Разбивка тепловой нагрузки ГВС',
    customer: { name: 'ОДО "Ромашка" & Ко', contact: 'Иванов И.И.', object: 'Котельная №3' },
    inputs: [{ label: 'Qгвс', value: '120.000 Мкал/ч' }],
    summaryRows: [
      { label: 'Тепловая нагрузка Q, Мкал/ч', merged: true, ii: '60.000 (50.0%)', i: '60.000 (50.0%)' },
      { label: 'Расход, т/ч', merged: false, iiHot: '2.32', iiCold: '2.40', iHot: '10.71', iCold: '2.40' }
    ],
    heatingRows: [['Тепловая нагрузка Q', '419.100', '251.460']],
    badgeText: 'Т после II ступени в норме',
    generatedAt: '12.09.2026 12:00'
  };
  var bytes = docx.build(model);
  var entries = readZipEntries(bytes);
  var names = entries.map(function (e) { return e.name; });
  ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml']
    .forEach(function (n) { assert.ok(names.indexOf(n) !== -1, 'должен быть файл ' + n); });

  var docXml = Buffer.from(entries.filter(function (e) { return e.name === 'word/document.xml'; })[0].data).toString('utf8');
  assert.ok(docXml.indexOf('Разбивка тепловой нагрузки ГВС') !== -1);
  assert.ok(docXml.indexOf('Котельная №3') !== -1);
  assert.ok(docXml.indexOf('&amp;') !== -1, 'амперсанд в имени заказчика должен быть экранирован');
  assert.ok(docXml.indexOf('ОДО "Ромашка" & Ко</w:t>') === -1, 'неэкранированный амперсанд не должен попасть в XML как есть');

  // тепловая нагрузка объединена по ступени (gridSpan), а не повторена в Греющей и Нагреваемой отдельно —
  // именно это и просил пользователь после первой версии экспорта
  assert.ok(docXml.indexOf('<w:gridSpan w:val="2"/>') !== -1, 'ячейки тепловой нагрузки должны быть объединены (gridSpan)');
  assert.ok(docXml.indexOf('<w:vMerge') !== -1, 'заголовок «Показатель» должен объединяться по вертикали (vMerge)');
  var occurrences = docXml.split('60.000 (50.0%)').length - 1;
  assert.strictEqual(occurrences, 2, 'значение нагрузки должно встретиться дважды (по разу на ступень), а не четыре раза');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed > 0 ? 1 : 0;
