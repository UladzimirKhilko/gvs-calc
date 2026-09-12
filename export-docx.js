/**
 * export-docx.js — сборка .docx (OOXML/WordprocessingML) из уже готовых,
 * отформатированных строк (см. модель ниже). Ничего не знает про state,
 * calc.js или единицы измерения — все числа ему подаёт app.js такими же
 * форматированными строками, что идут в HTML-таблицы (fmt/fmtPower/fmtFlow),
 * чтобы отчёт в Word и таблица на экране никогда не разъезжались.
 *
 * .docx собирается вручную (см. zip.js) — без vendor-библиотек: реестр npm
 * недоступен из этого окружения, а для нескольких простых XML-файлов внутри
 * ZIP внешняя библиотека и не нужна.
 *
 * @typedef {object} DocxModel
 * @property {string} title
 * @property {string} [subtitle]
 * @property {{name:string,contact:string,object:string}} [customer]
 * @property {Array<{label:string,value:string}>} inputs
 * @property {Array<object>} summaryRows - строки сводной таблицы ГВС: либо
 *   {label, merged:true, ii, i} — тепловая нагрузка, одно значение на ступень
 *   (Греющая и Нагреваемая объединены в одну ячейку, как в самой программе —
 *   у них одно и то же значение, это не два разных числа), либо
 *   {label, merged:false, iiHot, iiCold, iHot, iCold} — обычная строка
 *   с отдельным значением на каждую сторону.
 * @property {string[][]} heatingRows - строки по 3 ячейки (Показатель/Зима/Излом)
 * @property {string} [badgeText]
 * @property {string} [generatedAt]
 */
(function (root) {
  'use strict';

  var GVS = root.GVS = root.GVS || {};

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function run(text, opts) {
    opts = opts || {};
    var rPr = '';
    if (opts.bold) rPr += '<w:b/>';
    if (opts.color) rPr += '<w:color w:val="' + opts.color + '"/>';
    if (opts.size) rPr += '<w:sz w:val="' + opts.size + '"/><w:szCs w:val="' + opts.size + '"/>';
    var rPrXml = rPr ? '<w:rPr>' + rPr + '</w:rPr>' : '';
    return '<w:r>' + rPrXml + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
  }

  function paragraph(text, opts) {
    opts = opts || {};
    var pPr = '';
    if (opts.align) pPr += '<w:jc w:val="' + opts.align + '"/>';
    if (opts.spacingAfter !== undefined) pPr += '<w:spacing w:after="' + opts.spacingAfter + '"/>';
    var pPrXml = pPr ? '<w:pPr>' + pPr + '</w:pPr>' : '';
    return '<w:p>' + pPrXml + run(text, opts) + '</w:p>';
  }

  /**
   * Ячейка таблицы. opts.gridSpan объединяет соседние столбцы в этой строке
   * (аналог colspan) — используется для «Тепловая нагрузка Q»: одно значение
   * на ступень, а не два одинаковых числа в Греющей и Нагреваемой отдельно.
   * opts.vMerge объединяет со строкой сверху (аналог rowspan) — 'restart' на
   * первой строке объединения (с содержимым), 'continue' на второй (без
   * содержимого — по спецификации OOXML оно там игнорируется).
   */
  function tc(text, opts) {
    opts = opts || {};
    var props = '';
    if (opts.width) props += '<w:tcW w:w="' + opts.width + '" w:type="dxa"/>';
    if (opts.gridSpan) props += '<w:gridSpan w:val="' + opts.gridSpan + '"/>';
    if (opts.vMerge === 'restart') props += '<w:vMerge w:val="restart"/>';
    else if (opts.vMerge === 'continue') props += '<w:vMerge/>';
    if (opts.shade) props += '<w:shd w:val="clear" w:fill="' + opts.shade + '"/>';
    if (opts.valign) props += '<w:vAlign w:val="' + opts.valign + '"/>';
    var tcPr = '<w:tcPr>' + props + '</w:tcPr>';
    // содержимое continue-ячейки (второй половины объединения по вертикали) не отображается —
    // но валидный XML всё равно требует хотя бы пустой параграф
    var content = opts.vMerge === 'continue' ? '<w:p/>' : paragraph(text, { bold: opts.bold, align: opts.align, color: opts.color });
    return '<w:tc>' + tcPr + content + '</w:tc>';
  }

  function tr(cells) { return '<w:tr>' + cells.join('') + '</w:tr>'; }

  function table(colWidths, rows) {
    var grid = '<w:tblGrid>' + colWidths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
    var edges = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
    var borders = '<w:tblBorders>' + edges.map(function (edge) {
      return '<w:' + edge + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>';
    }).join('') + '</w:tblBorders>';
    var tblPr = '<w:tblPr><w:tblW w:w="0" w:type="auto"/>' + borders + '</w:tblPr>';
    return '<w:tbl>' + tblPr + grid + rows.join('') + '</w:tbl>';
  }

  function dataTable(colWidths, headers, rows) {
    var headerRow = tr(headers.map(function (h, i) {
      return tc(h, { width: colWidths[i], align: 'center', bold: true, shade: 'F2F2F2' });
    }));
    var bodyRows = rows.map(function (r) {
      return tr(r.map(function (cell, i) {
        return tc(cell, { width: colWidths[i], align: i === 0 ? 'left' : 'center' });
      }));
    });
    return table(colWidths, [headerRow].concat(bodyRows));
  }

  /**
   * Сводная таблица ГВС — та же структура заголовков и то же объединение
   * ячеек тепловой нагрузки по ступени, что и в самой программе (см. таблицу
   * #results-body в app.js): «Показатель» растянут на обе строки заголовка
   * (vMerge), «II ступень»/«I ступень» растянуты на два столбца (gridSpan),
   * а в строке «Тепловая нагрузка Q» Греющая и Нагреваемая одной ступени —
   * одна объединённая ячейка (это одно и то же число по тепловому балансу,
   * а не два разных), с долей ступени от общей нагрузки ГВС.
   */
  function summaryTableXml(rows) {
    var w = [2600, 1600, 1600, 1600, 1600];
    var headShade = 'F2F2F2';
    var stageShade = 'E4EEEA'; // лёгкий акцентный оттенок — как col-stage на экране

    var headerRow1 = tr([
      tc('Показатель', { width: w[0], bold: true, align: 'center', shade: headShade, vMerge: 'restart', valign: 'center' }),
      tc('II ступень', { width: w[1] + w[2], bold: true, align: 'center', shade: headShade, gridSpan: 2 }),
      tc('I ступень', { width: w[3] + w[4], bold: true, align: 'center', shade: headShade, gridSpan: 2 })
    ]);
    var headerRow2 = tr([
      tc('', { width: w[0], vMerge: 'continue' }),
      tc('Греющая', { width: w[1], bold: true, align: 'center', shade: headShade }),
      tc('Нагреваемая', { width: w[2], bold: true, align: 'center', shade: headShade }),
      tc('Греющая', { width: w[3], bold: true, align: 'center', shade: headShade }),
      tc('Нагреваемая', { width: w[4], bold: true, align: 'center', shade: headShade })
    ]);

    var bodyRows = rows.map(function (r) {
      if (r.merged) {
        return tr([
          tc(r.label, { width: w[0], align: 'left' }),
          tc(r.ii, { width: w[1] + w[2], align: 'center', gridSpan: 2, shade: stageShade, bold: true, color: '2F6E62' }),
          tc(r.i, { width: w[3] + w[4], align: 'center', gridSpan: 2, shade: stageShade, bold: true, color: '2F6E62' })
        ]);
      }
      return tr([
        tc(r.label, { width: w[0], align: 'left' }),
        tc(r.iiHot, { width: w[1], align: 'center' }),
        tc(r.iiCold, { width: w[2], align: 'center' }),
        tc(r.iHot, { width: w[3], align: 'center' }),
        tc(r.iCold, { width: w[4], align: 'center' })
      ]);
    });

    var edges = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
    var borders = '<w:tblBorders>' + edges.map(function (edge) {
      return '<w:' + edge + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>';
    }).join('') + '</w:tblBorders>';
    var tblPr = '<w:tblPr><w:tblW w:w="0" w:type="auto"/>' + borders + '</w:tblPr>';
    var grid = '<w:tblGrid>' + w.map(function (cw) { return '<w:gridCol w:w="' + cw + '"/>'; }).join('') + '</w:tblGrid>';

    return '<w:tbl>' + tblPr + grid + headerRow1 + headerRow2 + bodyRows.join('') + '</w:tbl>';
  }

  /** @param {DocxModel} model */
  function buildDocumentXml(model) {
    var body = '';
    body += paragraph(model.title, { bold: true, size: 32, align: 'center', spacingAfter: 120 });
    if (model.subtitle) body += paragraph(model.subtitle, { size: 18, align: 'center', spacingAfter: 200 });

    var cust = model.customer || {};
    if (cust.name || cust.contact || cust.object) {
      body += paragraph('Заказчик', { bold: true, size: 22, spacingAfter: 60 });
      if (cust.name) body += paragraph('Наименование: ' + cust.name);
      if (cust.object) body += paragraph('Объект: ' + cust.object);
      if (cust.contact) body += paragraph('Контактное лицо: ' + cust.contact);
      body += paragraph('', { spacingAfter: 120 });
    }

    body += paragraph('Исходные данные', { bold: true, size: 24, spacingAfter: 80 });
    (model.inputs || []).forEach(function (row) { body += paragraph(row.label + ': ' + row.value); });
    body += paragraph('', { spacingAfter: 160 });

    body += paragraph('Сводная таблица ГВС', { bold: true, size: 24, spacingAfter: 80 });
    body += summaryTableXml(model.summaryRows);
    if (model.badgeText) body += paragraph(model.badgeText, { size: 18, spacingAfter: 160 });
    else body += paragraph('', { spacingAfter: 160 });

    body += paragraph('Справочно: Отопление', { bold: true, size: 24, spacingAfter: 80 });
    body += dataTable([3400, 2600, 2600], ['Показатель', 'Зимний период', 'Точка излома'], model.heatingRows);

    if (model.generatedAt) {
      body += paragraph('', { spacingAfter: 160 });
      body += paragraph('Документ сформирован автоматически расчётным инструментом ОАО «БПА БЕЛСТРОЙИНДУСТРИЯ» (' + model.generatedAt + ').', { size: 16 });
    }

    var sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body + sectPr + '</w:body></w:document>';
  }

  /**
   * @param {DocxModel} model
   * @returns {Uint8Array} готовый .docx как байты
   */
  function build(model) {
    var documentXml = buildDocumentXml(model);

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>';

    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';

    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>' +
      '</w:styles>';

    var zip = GVS.zip;
    var files = [
      { name: '[Content_Types].xml', data: zip.utf8Bytes(contentTypes) },
      { name: '_rels/.rels', data: zip.utf8Bytes(rootRels) },
      { name: 'word/document.xml', data: zip.utf8Bytes(documentXml) },
      { name: 'word/_rels/document.xml.rels', data: zip.utf8Bytes(docRels) },
      { name: 'word/styles.xml', data: zip.utf8Bytes(stylesXml) }
    ];
    return zip.makeZip(files);
  }

  GVS.docx = { build: build };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { build: build };
  }
})(typeof window !== 'undefined' ? window : globalThis);
