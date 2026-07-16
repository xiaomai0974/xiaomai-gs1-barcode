(function () {
  "use strict";

  var FIXED_LENGTH = { "01": 14, "11": 6, "13": 6, "15": 6, "17": 6 };
  var VARIABLE_MAX = { "10": 20, "21": 20, "30": 8, "37": 8, "240": 30 };
  var fieldMap = {
    "01": "gtin",
    "11": "production-date",
    "17": "expiry-date",
    "10": "lot",
    "30": "quantity",
    "37": "count",
    "21": "serial"
  };
  var defaultOrder = ["01", "11", "17", "10", "30", "37", "21"];
  var lastOptions = null;
  var lastText = "";

  var form = document.getElementById("barcode-form");
  var fullString = document.getElementById("full-string");
  var canvas = document.getElementById("barcode-canvas");
  var emptyState = document.getElementById("empty-state");
  var message = document.getElementById("form-message");
  var details = document.getElementById("result-details");
  var resultBadge = document.getElementById("result-badge");
  var encodedText = document.getElementById("encoded-text");
  var colorInput = document.getElementById("color");
  var colorValue = document.getElementById("color-value");
  var heightSetting = document.getElementById("height-setting");
  var textSetting = document.getElementById("text-setting");

  function trim(value) {
    return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  }

  function computeCheckDigit(value) {
    var sum = 0;
    var multiplier = 3;
    for (var index = value.length - 1; index >= 0; index -= 1) {
      sum += Number(value.charAt(index)) * multiplier;
      multiplier = multiplier === 3 ? 1 : 3;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function normalizeDate(value, label) {
    var text = trim(value);
    if (/^\d{6}$/.test(text)) return text;
    if (/^\d{8}$/.test(text)) return text.substring(2);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.substring(2, 4) + text.substring(5, 7) + text.substring(8, 10);
    throw new Error(label + "必须填写 6 位日期，格式为 YYMMDD。");
  }

  function normalizeEntry(entry) {
    var ai = entry.ai;
    var value = trim(entry.value);

    if (!/^\d{2,4}$/.test(ai)) throw new Error("应用标识符 AI 必须为 2 至 4 位数字。");
    if (!value) throw new Error("AI " + ai + " 的内容不能为空。");
    if (/[\u001d\r\n]/.test(value)) throw new Error("AI " + ai + " 中不能包含换行或分隔符。");

    if (ai === "01") {
      if (!/^\d{14}$/.test(value)) throw new Error("AI 01 / GTIN 必须是 14 位数字。");
      var expected = computeCheckDigit(value.substring(0, 13));
      if (value.charAt(13) !== expected) throw new Error("GTIN 校验位不正确，最后一位应为 " + expected + "。");
    }
    if (ai === "11") value = normalizeDate(value, "生产日期");
    if (ai === "17") value = normalizeDate(value, "失效期");
    if (ai === "30" || ai === "37") {
      if (!/^\d+$/.test(value)) throw new Error("AI " + ai + " 只能填写数字。");
      value = value.replace(/^0+/, "") || "0";
    }
    if (FIXED_LENGTH[ai] && value.length !== FIXED_LENGTH[ai]) {
      throw new Error("AI " + ai + " 必须是 " + FIXED_LENGTH[ai] + " 位。");
    }
    if (VARIABLE_MAX[ai] && value.length > VARIABLE_MAX[ai]) {
      throw new Error("AI " + ai + " 最多允许 " + VARIABLE_MAX[ai] + " 个字符。");
    }
    return { ai: ai, value: value };
  }

  function parseParenthesized(text) {
    var normalized = trim(text).replace(/（/g, "(").replace(/）/g, ")");
    if (!normalized) return [];
    if (normalized.charAt(0) !== "(") throw new Error("整串输入请使用格式：(17)310514(10)LOT001。");

    var entries = [];
    var pattern = /\((\d{2,4})\)([^()]*)/g;
    var match;
    var consumed = "";
    while ((match = pattern.exec(normalized)) !== null) {
      consumed += match[0];
      entries.push(normalizeEntry({ ai: match[1], value: match[2] }));
    }
    if (!entries.length || consumed !== normalized) {
      throw new Error("整串内容格式无法识别，请检查 AI 编号和英文括号。");
    }
    return entries;
  }

  function collectFieldEntries() {
    var entries = [];
    defaultOrder.forEach(function (ai) {
      var value = trim(document.getElementById(fieldMap[ai]).value);
      if (value) entries.push(normalizeEntry({ ai: ai, value: value }));
    });
    if (!entries.length) throw new Error("请至少填写一个业务字段。");
    return entries;
  }

  function getEntries() {
    return trim(fullString.value) ? parseParenthesized(fullString.value) : collectFieldEntries();
  }

  function entriesToText(entries) {
    return entries.map(function (entry) { return "(" + entry.ai + ")" + entry.value; }).join("");
  }

  function updateKnownFields(entries) {
    entries.forEach(function (entry) {
      if (fieldMap[entry.ai]) document.getElementById(fieldMap[entry.ai]).value = entry.value;
    });
  }

  function renderMessage(text, kind) {
    message.textContent = text;
    message.className = "form-message " + (text ? "is-" + kind : "");
  }

  function currentType() {
    return form.elements.barcodeType.value;
  }

  function buildOptions(text) {
    var type = currentType();
    var scale = Number(document.getElementById("scale").value);
    var color = colorInput.value.replace("#", "");
    var options = {
      bcid: type,
      text: text,
      scale: scale,
      backgroundcolor: "FFFFFF",
      barcolor: color
    };

    if (type === "gs1-128") {
      options.height = Number(document.getElementById("bar-height").value) || 20;
      options.includetext = document.getElementById("include-text").checked;
      options.textxalign = "center";
      options.textsize = 10;
      options.paddingwidth = 4;
      options.paddingheight = 3;
    } else {
      options.paddingwidth = 0;
      options.paddingheight = 0;
    }
    return options;
  }

  function generate() {
    if (!window.bwipjs) throw new Error("条码组件加载失败，请刷新页面后重试。");
    var entries = getEntries();
    var text = entriesToText(entries);
    var options = buildOptions(text);

    window.bwipjs.toCanvas(canvas, options);
    lastOptions = options;
    lastText = text;
    encodedText.textContent = text;
    emptyState.hidden = true;
    canvas.hidden = false;
    details.hidden = false;
    resultBadge.textContent = currentType() === "gs1-128" ? "GS1-128 已生成" : "DataMatrix 已生成";
    resultBadge.classList.add("ready");
    renderMessage("生成成功，可在右侧下载或打印。", "success");
  }

  function downloadBlob(blob, extension) {
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/T/, "-").substring(0, 15);
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "xiaomai-gs1-" + stamp + "." + extension;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 500);
  }

  function clearForm() {
    form.reset();
    fullString.value = "";
    defaultOrder.forEach(function (ai) { document.getElementById(fieldMap[ai]).value = ""; });
    document.getElementById("bar-height").value = "20";
    document.getElementById("scale").value = "3";
    colorInput.value = "#111827";
    colorValue.textContent = "#111827";
    canvas.hidden = true;
    emptyState.hidden = false;
    details.hidden = true;
    resultBadge.textContent = "等待生成";
    resultBadge.classList.remove("ready");
    lastOptions = null;
    lastText = "";
    renderMessage("", "");
    updateTypeSettings();
  }

  function updateTypeSettings() {
    var isMatrix = currentType() === "gs1datamatrix";
    heightSetting.hidden = isMatrix;
    textSetting.hidden = isMatrix;
    if (lastOptions) {
      try { generate(); } catch (error) { renderMessage(error.message || String(error), "error"); }
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    try {
      generate();
    } catch (error) {
      renderMessage(error.message || String(error), "error");
    }
  });

  form.addEventListener("change", function (event) {
    if (event.target.name === "barcodeType") updateTypeSettings();
  });

  fullString.addEventListener("blur", function () {
    if (!trim(fullString.value)) return;
    try {
      var entries = parseParenthesized(fullString.value);
      fullString.value = entriesToText(entries);
      updateKnownFields(entries);
      renderMessage("整串内容已识别，可直接生成。", "success");
    } catch (error) {
      renderMessage(error.message || String(error), "error");
    }
  });

  colorInput.addEventListener("input", function () {
    colorValue.textContent = colorInput.value.toUpperCase();
  });

  document.getElementById("sample-button").addEventListener("click", function () {
    fullString.value = "(01)06972621148642(17)310514(10)20260515";
    fullString.dispatchEvent(new Event("blur"));
  });
  document.getElementById("clear-button").addEventListener("click", clearForm);

  document.getElementById("download-png").addEventListener("click", function () {
    if (!lastOptions) return;
    canvas.toBlob(function (blob) { if (blob) downloadBlob(blob, "png"); }, "image/png");
  });

  document.getElementById("download-svg").addEventListener("click", function () {
    if (!lastOptions) return;
    try {
      var svg = window.bwipjs.toSVG(lastOptions);
      downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "svg");
    } catch (error) {
      renderMessage(error.message || String(error), "error");
    }
  });

  document.getElementById("copy-button").addEventListener("click", function () {
    if (!lastText) return;
    navigator.clipboard.writeText(lastText).then(function () {
      renderMessage("编码内容已复制。", "success");
    }).catch(function () {
      renderMessage("浏览器未允许复制，请手动选择编码内容。", "error");
    });
  });

  document.getElementById("print-button").addEventListener("click", function () {
    if (lastOptions) window.print();
  });

  updateTypeSettings();
}());
