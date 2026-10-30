(function (root, factory) {
  "use strict";
  var rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  else root.BarcodeRules = rules;
}(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var types = {
    "gs1-128": { name: "GS1-128", gs1: true },
    "gs1datamatrix": { name: "GS1 DataMatrix", gs1: true, matrix: true },
    "ean13": { name: "EAN-13", ean: true, input: "ean-input" },
    "code128": { name: "Code 128", input: "code128-input" },
    "code39": { name: "Code 39", input: "code39-input" }
  };
  var samples = {
    "gs1-128": [
      "(01)06972621148642(17)310514(10)LOT001",
      "(01)06972621148642(15)310500(240)MODEL-A",
      "(00)106141411234567897(02)06972621148642(37)12"
    ],
    "ean13": ["6901234567892", "4006381333931", "5901234123457"],
    "code128": ["XM-20261022-001", "ABC123456789", "LOT(2026)-A/01"],
    "code39": ["XM-20261022-001", "CODE39/ABC+123", "LOT 2026-A.01"]
  };

  function typeInfo(type) {
    if (!types[type]) throw new Error("请选择支持的条码类型。");
    return types[type];
  }
  function checkDigit(value) {
    var sum = 0;
    for (var i = value.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) {
      sum += Number(value.charAt(i)) * weight;
    }
    return String((10 - sum % 10) % 10);
  }
  function normalizeDate(value, label) {
    if (/^\d{6}$/.test(value)) return value;
    if (/^\d{8}$/.test(value)) return value.slice(2);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(2, 4) + value.slice(5, 7) + value.slice(8, 10);
    throw new Error(label + "必须使用 YYMMDD 格式，例如 261022。");
  }
  function parseGs1(value) {
    var text = String(value).trim().replace(/（/g, "(").replace(/）/g, ")");
    if (!text) throw new Error("请填写 GS1 内容或至少一个业务字段。");
    var pattern = /\((\d{2,4})\)([^()]*)/g;
    var entries = [], consumed = "", match;
    while ((match = pattern.exec(text))) {
      consumed += match[0];
      var ai = match[1], data = match[2].trim();
      if (!data) throw new Error("AI " + ai + " 的内容不能为空。");
      if (/[^\x20-\x7e]/.test(data)) throw new Error("AI " + ai + " 请使用半角数字、英文字母及该 AI 允许的符号，不能包含中文或控制字符。");
      if (/^(11|12|13|15|16|17)$/.test(ai)) data = normalizeDate(data, "AI " + ai + " 日期");
      entries.push({ ai: ai, value: data });
    }
    if (!entries.length || consumed !== text) throw new Error("整串格式应为 (01)编号(17)日期(10)批号；AI 编号使用半角数字和英文括号 ()。");
    return entries;
  }
  function entriesToText(entries) {
    return entries.map(function (entry) { return "(" + entry.ai + ")" + entry.value; }).join("");
  }
  function friendlyError(error) {
    var text = error.message || String(error);
    var ai = text.match(/AI\s*\(?([0-9]{2,4})\)?/);
    var label = ai ? "AI " + ai[1] + "：" : "";
    if (/GS1missingAIs/.test(text)) return "GS1 字段组合缺少必需的关联字段。" + text.replace(/^.*?:\s*/, "");
    if (/GS1exclusiveAIs/.test(text)) return "GS1 字段组合存在互斥字段。" + text.replace(/^.*?:\s*/, "");
    if (/GS1badCheckDigit|GS1badChecksum/.test(text)) return label + "校验位不正确。" + text.replace(/^.*?:\s*/, "");
    if (/GS1badDay|GS1badMonth|GS1badDate/.test(text)) return label + "日期无效，请检查月份、天数及闰年。";
    if (/GS1unknownAI/.test(text)) return "无法识别或当前引擎尚不支持该 AI。" + text.replace(/^.*?:\s*/, "");
    if (/^bwipp\./.test(text)) return "编码校验失败：" + text.replace(/^.*?:\s*/, "");
    return text;
  }
  function normalize(type, value, engine) {
    var info = typeInfo(type), text;
    if (info.gs1) {
      text = entriesToText(parseGs1(value));
    } else if (info.ean) {
      text = String(value).trim();
      if (!/^\d{12,13}$/.test(text)) throw new Error("EAN-13 请输入 12 位或 13 位半角数字，不带括号、空格或字母。");
      var expected = checkDigit(text.slice(0, 12));
      if (text.length === 12) text += expected;
      else if (text.charAt(12) !== expected) throw new Error("EAN-13 校验位不正确，最后一位应为 " + expected + "。");
    } else if (type === "code39") {
      text = String(value);
      if (!text.length || !text.trim()) throw new Error("请填写 Code 39 内容。");
      if (text.indexOf("*") !== -1) throw new Error("Code 39 的起止符 * 会自动添加，请只输入实际内容，不要手动输入星号。");
      if (!/^[0-9A-Z .$\/+%-]+$/.test(text)) throw new Error("Code 39 仅支持半角数字 0–9、大写字母 A–Z、空格及 - . $ / + %；不支持小写字母、中文、括号或其他符号。");
    } else {
      text = String(value);
      if (!text.length || !text.trim()) throw new Error("请填写 Code 128 内容。");
      if (/[^\x20-\x7e]/.test(text)) throw new Error("Code 128 输入框支持半角数字、英文字母、空格和可打印 ASCII 符号，不支持中文、全角字符或换行。");
    }
    if (!engine || typeof engine.raw !== "function") throw new Error("条码组件加载失败，请刷新页面后重试。");
    try {
      // Enable the engine's GS1 Syntax Dictionary checks, including AI associations.
      var options = { bcid: type, text: text, dontlint: false, lintreqs: true, parse: false, parsefnc: false };
      if (info.matrix) options.format = "square";
      if (type === "code39") options.includecheck = options.validatecheck = false;
      engine.raw(options);
    } catch (error) { throw new Error(friendlyError(error)); }
    return text;
  }
  function buildOptions(type, text, settings) {
    var info = typeInfo(type), scale = Number(settings.scale), height = Number(settings.height);
    if (!Number.isInteger(scale) || scale < 1 || scale > 5) throw new Error("清晰度必须为 1×～5×。");
    if (!info.matrix && (!Number.isFinite(height) || height < 8 || height > 80)) throw new Error("条码高度必须为 8～80 mm。");
    if (!/^#[0-9a-f]{6}$/i.test(settings.color)) throw new Error("请选择有效的条码颜色。");
    var options = {
      bcid: type, text: text, scale: scale,
      backgroundcolor: "FFFFFF", barcolor: settings.color.slice(1), textcolor: settings.color.slice(1),
      dontlint: false, lintreqs: true, parse: false, parsefnc: false,
      paddingtop: 2, paddingbottom: 2,
      paddingleft: info.matrix ? 2 : info.ean ? 11 : 10,
      paddingright: info.matrix ? 2 : info.ean ? 7 : 10,
      includetext: Boolean(info.ean && settings.includeText !== false)
    };
    if (info.matrix) options.format = "square";
    else options.height = height;
    // Standard Code 39: the encoder adds start/stop; the optional Mod 43 check is off.
    if (type === "code39") options.includecheck = options.validatecheck = false;
    // EAN-13 retains the encoder's native guard bars and optional digit groups.
    return options;
  }
  function getSamples(type) { return (samples[typeInfo(type).gs1 ? "gs1-128" : type]).slice(); }
  function humanReadable(type, text) { return type === "code39" ? "*" + text + "*" : text; }

  return { types: types, typeInfo: typeInfo, checkDigit: checkDigit, parseGs1: parseGs1, entriesToText: entriesToText, normalize: normalize, buildOptions: buildOptions, friendlyError: friendlyError, samples: getSamples, humanReadable: humanReadable };
}));
