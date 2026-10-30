const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../barcode-rules.js');
const engine = require('../vendor/bwip-js-min.js');
const normalize = (type, text) => rules.normalize(type, text, engine);
const settings = { scale: 3, height: 15, color: '#000000' };

for (const type of Object.keys(rules.types)) {
  for (const text of rules.samples(type)) {
    test(type + ' valid sample ' + text, () => {
      const normalized = normalize(type, text);
      const options = rules.buildOptions(type, normalized, settings);
      const svg = engine.toSVG({ ...options });
      assert.match(svg, /<svg /);
      assert.equal(options.barcolor, '000000');
      if (type === 'gs1datamatrix') {
        const box = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
        assert.equal(box[2], box[3]);
      }
    });
  }
}
test('EAN-13 12 digits become a verified 13-digit code', () => {
  assert.equal(normalize('ean13', '400638133393'), '4006381333931');
  assert.equal(normalize('ean13', '000000000000'), '0000000000000');
});
for (const value of ['4006381333932', '12345678901', '12345678901234', '(01)4006381333931', '４００６３８１３３３９３１', '4006381 33931', '400638133393X']) {
  test('EAN-13 rejects ' + value, () => assert.throws(() => normalize('ean13', value)));
}
test('Code 128 preserves case, symbols and leading/trailing spaces literally', () => {
  const text = ' Abc(01)-^FNC1/123 ';
  assert.equal(normalize('code128', text), text);
  const normal = engine.raw({ bcid: 'code128', text, parsefnc: false });
  const result = engine.raw(rules.buildOptions('code128', text, settings));
  assert.deepEqual(result[0].sbs, normal[0].sbs);
});
for (const value of ['中文', '１２３', 'ABC\n123', 'ABC\t123', 'ABC\x1d123', '', '   ']) {
  test('Code 128 rejects unsupported or empty input ' + JSON.stringify(value), () => assert.throws(() => normalize('code128', value)));
}
test('Code 39 accepts the standard alphabet without altering data', () => {
  const text = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.$/+% ';
  assert.equal(normalize('code39', text), text);
  assert.equal(rules.humanReadable('code39', 'ABC123'), '*ABC123*');
});
test('Code 39 starts and stops are encoded by the engine; Mod 43 is not added', () => {
  const text = normalize('code39', 'CODE39');
  const options = rules.buildOptions('code39', text, settings);
  assert.equal(options.includecheck, false);
  assert.equal(options.validatecheck, false);
  assert.deepEqual(engine.raw(options)[0].sbs, engine.raw({ bcid: 'code39', text })[0].sbs);
  assert.notDeepEqual(engine.raw({ ...options, includecheck: true })[0].sbs, engine.raw(options)[0].sbs);
});
for (const value of ['abc', 'ABCabc', '中文', '１２３', '(01)ABC', 'ABC_123', 'ABC@123', '*ABC*', '*ABC', 'ABC*', 'AB*C', 'ABC\n123', 'ABC\t123', 'ABC\x1d123', '', '   ']) {
  test('Code 39 rejects ' + JSON.stringify(value), () => assert.throws(() => normalize('code39', value)));
}
for (const type of ['gs1-128', 'gs1datamatrix']) {
  test(type + ' accepts compatible fullwidth parentheses and normalizes dates', () => {
    assert.equal(normalize(type, '（01）06972621148642（11）2026-10-22（10）LOT001'), '(01)06972621148642(11)261022(10)LOT001');
  });
  for (const suffix of ['(13)261022', '(15)310500', '(16)310514', '(20)01', '(240)MODEL-A', '(241)CUSTOMER-01', '(21)PRIMARY(250)SERIAL-02', '(251)SOURCE01', '(3103)001250', '(422)156']) {
    test(type + ' expanded AI ' + suffix, () => assert.ok(normalize(type, '(01)06972621148642' + suffix)));
  }
  test(type + ' valid leap day and permitted zero day', () => {
    assert.ok(normalize(type, '(01)06972621148642(17)280229'));
    assert.ok(normalize(type, '(01)06972621148642(17)310200'));
  });
  for (const value of ['(01)06972621148643', '(01)１２３４５６７８９０１２３４', '(01)06972621148642(17)310231', '(01)06972621148642(17)270229', '(01)06972621148642(17)311314', '(01)06972621148642(10)', '(01)06972621148642(10)' + 'A'.repeat(21), '(01)06972621148642(3103)1.250', '(01)06972621148642(9999)123', '(01)06972621148642(10)中文', '(17)310514', '(37)12', '(01)06972621148642(02)06972621148642']) {
    test(type + ' rejects invalid content ' + value, () => assert.throws(() => normalize(type, value)));
  }
}
test('Numeric GS1 data retains significant leading zeros', () => {
  assert.equal(normalize('gs1datamatrix', '(00)106141411234567897(02)06972621148642(37)0012'), '(00)106141411234567897(02)06972621148642(37)0012');
});
test('Matrix ignores linear height and enforces a square output', () => {
  assert.equal(rules.buildOptions('gs1datamatrix', '', { ...settings, height: '' }).format, 'square');
});
test('EAN-13 custom height changes bar height without changing the encoded bars', () => {
  const text = '6901234567892';
  const short = rules.buildOptions('ean13', text, { ...settings, height: 15 });
  const tall = rules.buildOptions('ean13', text, { ...settings, height: 25.4 });
  const box = options => engine.toSVG({ ...options }).match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.equal(short.height, 15);
  assert.equal(tall.height, 25.4);
  assert.equal(box(short)[2], box(tall)[2]);
  assert.ok(box(short)[3] < box(tall)[3]);
  assert.deepEqual(engine.raw(short)[0].sbs, engine.raw(tall)[0].sbs);
});
test('EAN-13 native digit groups can be hidden without changing the encoded bar pattern', () => {
  const text = '6901234567892';
  const shown = rules.buildOptions('ean13', text, { ...settings, includeText: true });
  const hidden = rules.buildOptions('ean13', text, { ...settings, includeText: false });
  assert.equal(shown.includetext, true);
  assert.equal(hidden.includetext, false);
  assert.equal(rules.buildOptions('ean13', text, settings).includetext, true);
  assert.equal(engine.raw(shown)[0].txt.length, 13);
  assert.equal(engine.raw(hidden)[0].txt.length, 0);
  assert.deepEqual(engine.raw(shown)[0].sbs, engine.raw(hidden)[0].sbs);
});
for (const scale of [0, 6, 1.5, NaN]) {
  test('rejects unsupported scale ' + scale, () => assert.throws(() => rules.buildOptions('code128', '', { ...settings, scale })));
}
for (const height of ['', 0, 7, 81, NaN]) {
  test('rejects invalid linear height ' + height, () => assert.throws(() => rules.buildOptions('gs1-128', '', { ...settings, height })));
  test('EAN-13 rejects invalid height ' + height, () => assert.throws(() => rules.buildOptions('ean13', '', { ...settings, height })));
}
