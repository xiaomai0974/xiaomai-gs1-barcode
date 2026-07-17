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
  var lastShowText = false;
  var batchResults = [];
  var currentMode = "single";

  var form = document.getElementById("barcode-form");
  var fullString = document.getElementById("full-string");
  var batchInput = document.getElementById("batch-input");
  var canvas = document.getElementById("barcode-canvas");
  var emptyState = document.getElementById("empty-state");
  var batchGrid = document.getElementById("batch-preview-grid");
  var previewStage = document.getElementById("preview-stage");
  var message = document.getElementById("form-message");
  var details = document.getElementById("result-details");
  var batchDetails = document.getElementById("batch-result-details");
  var resultBadge = document.getElementById("result-badge");
  var encodedText = document.getElementById("encoded-text");
  var colorInput = document.getElementById("color");
  var colorValue = document.getElementById("color-value");
  var heightSetting = document.getElementById("height-setting");
  var textSetting = document.getElementById("text-setting");
  var submitLabel = form.querySelector(".primary-button span");

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

  function getSingleEntries() {
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

  function parseBatchInput() {
    var lines = String(batchInput.value).split(/\r?\n/).map(trim).filter(Boolean);
    if (!lines.length) throw new Error("请粘贴至少一条批量 GS1 内容。");
    if (lines.length > 100) throw new Error("一次最多生成 100 条，请拆分后再操作。");
    return lines.map(function (line, index) {
      try {
        var entries = parseParenthesized(line);
        if (!entries.length) throw new Error("内容为空。");
        return entriesToText(entries);
      } catch (error) {
        throw new Error("第 " + (index + 1) + " 行：" + (error.message || String(error)));
      }
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
      barcolor: color,
      dontlint: true
    };

    if (type === "gs1-128") {
      options.height = Number(document.getElementById("bar-height").value) || 15;
      options.includetext = false;
      options.paddingwidth = 4;
      options.paddingheight = 0;
    } else {
      options.paddingwidth = 0;
      options.paddingheight = 0;
    }
    return options;
  }

  function getArialTextLayout(text, width, scale) {
    var fontSize = 8 * scale;
    var sidePadding = 4 * scale;
    var gap = 1 * scale;
    var bottomPadding = 2 * scale;
    var measureCanvas = document.createElement("canvas");
    var context = measureCanvas.getContext("2d");
    var availableWidth = Math.max(1, width - sidePadding * 2);
    context.font = "400 " + fontSize + "px Arial";
    var measuredWidth = context.measureText(text).width;
    if (measuredWidth > availableWidth) {
      fontSize = fontSize * availableWidth / measuredWidth;
    }
    return {
      fontSize: fontSize,
      gap: gap,
      bottomPadding: bottomPadding,
      lineHeight: fontSize * 1.2
    };
  }

  function renderBarcodeCanvas(targetCanvas, options, text, showText) {
    if (options.bcid !== "gs1-128" || !showText) {
      window.bwipjs.toCanvas(targetCanvas, options);
      return;
    }

    var barsCanvas = document.createElement("canvas");
    window.bwipjs.toCanvas(barsCanvas, options);
    var scale = Number(options.scale) || 1;
    var layout = getArialTextLayout(text, barsCanvas.width, scale);
    targetCanvas.width = barsCanvas.width;
    targetCanvas.height = Math.ceil(barsCanvas.height + layout.gap + layout.lineHeight + layout.bottomPadding);
    var context = targetCanvas.getContext("2d");
    context.fillStyle = "#" + (options.backgroundcolor || "FFFFFF");
    context.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    context.drawImage(barsCanvas, 0, 0);
    context.fillStyle = "#" + (options.barcolor || "000000");
    context.font = "400 " + layout.fontSize + "px Arial";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(text, targetCanvas.width / 2, barsCanvas.height + layout.gap);
  }

  function buildSvgOptions(options) {
    var svgOptions = {};
    Object.keys(options).forEach(function (key) { svgOptions[key] = options[key]; });
    svgOptions.scale = Math.max(5, Number(options.scale) || 5);
    if (svgOptions.bcid === "gs1-128") svgOptions.inkspread = 0.15;
    return svgOptions;
  }

  function formatSvgNumber(value) {
    return String(Math.round(value * 10000) / 10000);
  }

  function convertBarcodeStrokesToRects(svg) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(svg, "image/svg+xml");
    var paths = Array.prototype.slice.call(documentNode.querySelectorAll("path[stroke][stroke-width]"));
    var number = "([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))";
    var segmentPattern = new RegExp("M" + number + "\\s+" + number + "L" + number + "\\s+" + number, "g");

    paths.forEach(function (path) {
      var strokeWidth = Number(path.getAttribute("stroke-width"));
      var fill = path.getAttribute("stroke") || "#000000";
      var data = path.getAttribute("d") || "";
      var segments = [];
      var match;
      if (!(strokeWidth > 0)) return;

      while ((match = segmentPattern.exec(data)) !== null) {
        var x1 = Number(match[1]);
        var y1 = Number(match[2]);
        var x2 = Number(match[3]);
        var y2 = Number(match[4]);
        if (Math.abs(x1 - x2) > 0.0001) return;
        segments.push({ x: x1, y: Math.min(y1, y2), height: Math.abs(y2 - y1) });
      }
      if (!segments.length) return;

      segments.forEach(function (segment) {
        var rect = documentNode.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", formatSvgNumber(segment.x - strokeWidth / 2));
        rect.setAttribute("y", formatSvgNumber(segment.y));
        rect.setAttribute("width", formatSvgNumber(strokeWidth));
        rect.setAttribute("height", formatSvgNumber(segment.height));
        rect.setAttribute("fill", fill);
        path.parentNode.insertBefore(rect, path);
      });
      path.parentNode.removeChild(path);
    });

    return new XMLSerializer().serializeToString(documentNode.documentElement);
  }

  function appendArialTextToSvg(svg, text, options) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(svg, "image/svg+xml");
    var root = documentNode.documentElement;
    var viewBox = (root.getAttribute("viewBox") || "0 0 1 1").split(/\s+/).map(Number);
    var width = viewBox[2];
    var originalHeight = viewBox[3];
    var scale = Number(options.scale) || 1;
    var layout = getArialTextLayout(text, width, scale);
    var textNode = documentNode.createElementNS("http://www.w3.org/2000/svg", "text");
    var newHeight = Math.ceil(originalHeight + layout.gap + layout.lineHeight + layout.bottomPadding);
    root.setAttribute("viewBox", [viewBox[0], viewBox[1], width, newHeight].join(" "));
    textNode.setAttribute("x", formatSvgNumber(width / 2));
    textNode.setAttribute("y", formatSvgNumber(originalHeight + layout.gap + layout.fontSize));
    textNode.setAttribute("fill", "#" + (options.barcolor || "000000"));
    textNode.setAttribute("font-family", "Arial");
    textNode.setAttribute("font-size", formatSvgNumber(layout.fontSize));
    textNode.setAttribute("font-style", "normal");
    textNode.setAttribute("font-weight", "400");
    textNode.setAttribute("text-anchor", "middle");
    textNode.textContent = text;
    root.appendChild(textNode);
    return new XMLSerializer().serializeToString(root);
  }

  function buildSvgMarkup(options, text, showText) {
    var svg = window.bwipjs.toSVG(buildSvgOptions(options));
    if (options.bcid !== "gs1-128") return svg;
    svg = convertBarcodeStrokesToRects(svg);
    return showText ? appendArialTextToSvg(svg, text, buildSvgOptions(options)) : svg;
  }

  function resetPreview() {
    lastOptions = null;
    lastText = "";
    lastShowText = false;
    batchResults = [];
    batchGrid.textContent = "";
    batchGrid.hidden = true;
    previewStage.classList.remove("is-batch");
    canvas.hidden = true;
    emptyState.hidden = false;
    details.hidden = true;
    batchDetails.hidden = true;
    resultBadge.textContent = "等待生成";
    resultBadge.classList.remove("ready");
  }

  function generateSingle() {
    var entries = getSingleEntries();
    var text = entriesToText(entries);
    var options = buildOptions(text);
    var showText = options.bcid === "gs1-128" && document.getElementById("include-text").checked;

    renderBarcodeCanvas(canvas, options, text, showText);
    lastOptions = options;
    lastText = text;
    lastShowText = showText;
    batchResults = [];
    encodedText.textContent = text;
    emptyState.hidden = true;
    batchGrid.hidden = true;
    canvas.hidden = false;
    details.hidden = false;
    batchDetails.hidden = true;
    resultBadge.textContent = currentType() === "gs1-128" ? "GS1-128 已生成" : "DataMatrix 已生成";
    resultBadge.classList.add("ready");
    renderMessage("生成成功，可在右侧下载或打印。", "success");
  }

  function createBatchPreviewItem(result, index) {
    var item = document.createElement("article");
    var number = document.createElement("strong");
    var code = document.createElement("code");
    item.className = "batch-preview-item";
    number.textContent = "NO. " + String(index + 1).padStart(3, "0");
    code.textContent = result.text;
    item.appendChild(result.canvas);
    item.appendChild(number);
    item.appendChild(code);
    return item;
  }

function generateBatch() {
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[char];
      });
    }

    var rawLines = String(batchInput.value).split(/\r?\n/);
    var lines = rawLines
      .map(function (line, index) {
        return {
          value: trim(line),
          lineNumber: index + 1
        };
      })
      .filter(function (item) {
        return Boolean(item.value);
      });

    if (!lines.length) throw new Error("请粘贴至少一条批量 GS1 内容。");
    if (lines.length > 100) throw new Error("一次最多生成 100 条，请拆分后再操作。");

    var fragment = document.createDocumentFragment();
    var results = [];
    var errors = [];

    lines.forEach(function (item) {
      try {
        var entries = parseParenthesized(item.value);
        if (!entries.length) throw new Error("内容为空。");
        var text = entriesToText(entries);
        var itemCanvas = document.createElement("canvas");
        var options = buildOptions(text);
        var showText = options.bcid === "gs1-128" && document.getElementById("include-text").checked;
        renderBarcodeCanvas(itemCanvas, options, text, showText);

        var result = {
          text: text,
          options: options,
          canvas: itemCanvas,
          showText: showText
        };

        results.push(result);
        fragment.appendChild(createBatchPreviewItem(result, results.length - 1));
      } catch (error) {
        errors.push({
          line: item.lineNumber,
          input: item.value,
          message: error.message || String(error)
        });
      }
    });

    batchResults = results;
    lastOptions = null;
    lastText = "";
    lastShowText = false;
    batchGrid.textContent = "";
    batchGrid.appendChild(fragment);

    emptyState.hidden = true;
    canvas.hidden = true;
    details.hidden = true;

    if (results.length > 0) {
      batchGrid.hidden = false;
      batchDetails.hidden = false;
      previewStage.classList.add("is-batch");

      document.getElementById("batch-result-count").textContent =
        "已生成 " + results.length + " 条" + (errors.length ? "（跳过 " + errors.length + " 行错误）" : "");

      resultBadge.textContent = "批量生成完成";
      resultBadge.classList.add("ready");
    } else {
      batchGrid.hidden = true;
      batchDetails.hidden = true;
      previewStage.classList.remove("is-batch");
      emptyState.hidden = false;

      resultBadge.textContent = "生成失败";
      resultBadge.classList.remove("ready");
    }

    if (errors.length === 0) {
      renderMessage("已批量生成 " + results.length + " 条，可下载 ZIP 压缩包。", "success");
    } else {
      var summary = results.length === 0
        ? "全部 " + errors.length + " 行均失败："
        : "批量生成完成：成功 " + results.length + " 条，失败 " + errors.length + " 条";

      var errorLines = errors.map(function (e) {
        return "第 " + e.line + " 行：" + escapeHtml(e.input) + " —— " + escapeHtml(e.message);
      }).join("<br>");

      message.innerHTML = escapeHtml(summary) + "<br>" + errorLines;
      message.className = "form-message is-error";
    }
  }

  function generate() {
    if (!window.bwipjs) throw new Error("条码组件加载失败，请刷新页面后重试。");
    if (currentMode === "batch") generateBatch();
    else generateSingle();
  }

  function downloadBlob(blob, extension, baseName) {
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/T/, "-").substring(0, 15);
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = (baseName || "xiaomai-gs1") + "-" + stamp + "." + extension;
    document.body.appendChild(link);
    link.click();
    link.remove();
    var objectUrl = link.href;
    setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
  }

  function canvasToBlob(targetCanvas) {
    return new Promise(function (resolve, reject) {
      targetCanvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("PNG 文件生成失败。"));
      }, "image/png");
    });
  }

  function clearForm() {
    form.reset();
    fullString.value = "";
    batchInput.value = "";
    defaultOrder.forEach(function (ai) { document.getElementById(fieldMap[ai]).value = ""; });
    document.getElementById("bar-height").value = "15";
    document.getElementById("scale").value = "3";
    colorInput.value = "#111827";
    colorValue.textContent = "#111827";
    resetPreview();
    renderMessage("", "");
    updateTypeSettings(false);
  }

  function updateTypeSettings(regenerate) {
    var isMatrix = currentType() === "gs1datamatrix";
    heightSetting.hidden = isMatrix;
    textSetting.hidden = isMatrix;
    if (regenerate && (lastOptions || batchResults.length)) {
      try { generate(); } catch (error) { renderMessage(error.message || String(error), "error"); }
    }
  }

  function setMode(mode) {
    currentMode = mode;
    var isBatch = mode === "batch";
    document.getElementById("single-data-section").hidden = isBatch;
    document.getElementById("batch-data-section").hidden = !isBatch;
    document.querySelectorAll(".mode-button").forEach(function (button) {
      var active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    submitLabel.textContent = isBatch ? "批量生成 GS1 码" : "生成 GS1 码";
    resetPreview();
    renderMessage("", "");
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
    if (event.target.name === "barcodeType") updateTypeSettings(true);
  });

  document.querySelectorAll(".mode-button").forEach(function (button) {
    button.addEventListener("click", function () { setMode(button.dataset.mode); });
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

  document.getElementById("batch-sample-button").addEventListener("click", function () {
    batchInput.value = [
      "(01)06972621148642(17)310514(10)LOT001",
      "(17)310514(10)LOT002",
      "(37)12"
    ].join("\n");
  });

  document.getElementById("clear-button").addEventListener("click", clearForm);

  document.getElementById("download-png").addEventListener("click", function () {
    if (!lastOptions) return;
    canvasToBlob(canvas).then(function (blob) {
      downloadBlob(blob, "png", "xiaomai-gs1");
    }).catch(function (error) {
      renderMessage(error.message || String(error), "error");
    });
  });

  document.getElementById("download-svg").addEventListener("click", function () {
    if (!lastOptions) return;
    try {
      var svg = buildSvgMarkup(lastOptions, lastText, lastShowText);
      downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "svg", "xiaomai-gs1");
    } catch (error) {
      renderMessage(error.message || String(error), "error");
    }
  });

  document.getElementById("download-batch").addEventListener("click", async function () {
    var button = this;
    if (!batchResults.length) return;
    if (!window.JSZip) {
      renderMessage("ZIP 组件加载失败，请刷新页面后重试。", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "正在打包...";
    try {
      var zip = new window.JSZip();
      var format = document.getElementById("batch-format").value;
      for (var index = 0; index < batchResults.length; index += 1) {
        var number = String(index + 1).padStart(3, "0");
        if (format === "svg") {
          zip.file("xiaomai-gs1-" + number + ".svg", buildSvgMarkup(
            batchResults[index].options,
            batchResults[index].text,
            batchResults[index].showText
          ));
        } else {
          zip.file("xiaomai-gs1-" + number + ".png", await canvasToBlob(batchResults[index].canvas));
        }
      }
      zip.file("编码清单.txt", batchResults.map(function (result, index) {
        return String(index + 1).padStart(3, "0") + "\t" + result.text;
      }).join("\r\n"));
      var blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      downloadBlob(blob, "zip", "xiaomai-gs1-batch");
      renderMessage("批量 ZIP 已生成，共 " + batchResults.length + " 条。", "success");
    } catch (error) {
      renderMessage(error.message || String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = "下载全部 ZIP";
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

  updateTypeSettings(false);
}());
