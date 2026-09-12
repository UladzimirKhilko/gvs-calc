/**
 * zip.js — минимальный писатель ZIP-архивов (метод STORED, без сжатия).
 *
 * Нужен только для одной вещи: .docx — это ZIP-архив с XML-файлами внутри
 * (OOXML). Внешние библиотеки (JSZip и т.п.) сознательно не используются —
 * тут нет ни доступа к npm-реестру из этого окружения, ни, что важнее,
 * необходимости: формат ZIP для нескольких маленьких несжатых файлов — это
 * десяток простых бинарных структур (см. функции ниже), а не повод тянуть
 * зависимость в проект, который сознательно держится без единой внешней
 * библиотеки (см. calc.js/units.js и т. д.).
 *
 * Работает и в браузере (GVS.zip), и в Node (module.exports) — для тестов.
 */
(function (root) {
  'use strict';

  // ---- CRC-32 (стандартный полином IEEE 802.3, таблица считается один раз) ----
  var CRC_TABLE = (function () {
    var table = new Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /** UTF-8 кодирование строки в массив байт (без TextEncoder — работает и в старых средах). */
  function utf8Bytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.codePointAt(i);
      if (code > 0xFFFF) i++; // суррогатная пара — codePointAt уже учёл оба слова
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code < 0x10000) {
        bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        bytes.push(
          0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F),
          0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F)
        );
      }
    }
    return bytes;
  }

  /** Простой накопитель байт с little-endian helper'ами. */
  function ByteWriter() {
    this.bytes = [];
  }
  ByteWriter.prototype.u8 = function (n) { this.bytes.push(n & 0xFF); };
  ByteWriter.prototype.u16 = function (n) { this.bytes.push(n & 0xFF, (n >>> 8) & 0xFF); };
  ByteWriter.prototype.u32 = function (n) { this.bytes.push(n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF); };
  ByteWriter.prototype.raw = function (arr) { for (var i = 0; i < arr.length; i++) this.bytes.push(arr[i]); };

  // фиксированная дата/время в DOS-формате: 1 января 1980 — содержимое архива
  // не датируется отдельно, воспроизводимая сборка не должна зависеть от текущего времени
  var DOS_TIME = 0;
  var DOS_DATE = 0x0021;

  /**
   * @param {Array<{name:string, data:(Array<number>|Uint8Array)}>} files - имя внутри
   *   архива (например "word/document.xml") и содержимое как байты (не строка!) —
   *   строку в байты переводит utf8Bytes выше.
   * @returns {Uint8Array} готовый .zip/.docx как байты
   */
  function makeZip(files) {
    var w = new ByteWriter();
    var centralEntries = [];

    files.forEach(function (file) {
      var nameBytes = utf8Bytes(file.name);
      var data = file.data;
      var crc = crc32(data);
      var offset = w.bytes.length;

      w.u32(0x04034b50); // local file header signature
      w.u16(20);          // version needed to extract
      w.u16(0);           // general purpose bit flag
      w.u16(0);           // compression method: 0 = stored
      w.u16(DOS_TIME);
      w.u16(DOS_DATE);
      w.u32(crc);
      w.u32(data.length); // compressed size == uncompressed (stored)
      w.u32(data.length);
      w.u16(nameBytes.length);
      w.u16(0);            // extra field length
      w.raw(nameBytes);
      w.raw(data);

      centralEntries.push({ nameBytes: nameBytes, crc: crc, size: data.length, offset: offset });
    });

    var centralStart = w.bytes.length;
    centralEntries.forEach(function (e) {
      w.u32(0x02014b50); // central directory file header signature
      w.u16(20);          // version made by
      w.u16(20);          // version needed to extract
      w.u16(0);           // general purpose bit flag
      w.u16(0);           // compression method
      w.u16(DOS_TIME);
      w.u16(DOS_DATE);
      w.u32(e.crc);
      w.u32(e.size);
      w.u32(e.size);
      w.u16(e.nameBytes.length);
      w.u16(0); // extra field length
      w.u16(0); // file comment length
      w.u16(0); // disk number start
      w.u16(0); // internal file attributes
      w.u32(0); // external file attributes
      w.u32(e.offset);
      w.raw(e.nameBytes);
    });
    var centralSize = w.bytes.length - centralStart;

    w.u32(0x06054b50); // end of central directory signature
    w.u16(0);           // number of this disk
    w.u16(0);           // disk where central directory starts
    w.u16(centralEntries.length); // records on this disk
    w.u16(centralEntries.length); // total records
    w.u32(centralSize);
    w.u32(centralStart);
    w.u16(0); // comment length

    return new Uint8Array(w.bytes);
  }

  var zip = { makeZip: makeZip, utf8Bytes: utf8Bytes, crc32: crc32 };

  var GVS = root.GVS = root.GVS || {};
  GVS.zip = zip;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = zip;
  }
})(typeof window !== 'undefined' ? window : globalThis);
