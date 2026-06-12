#targetengine "xiaomai_gs1_generator_panel"

(function () {
    var SCRIPT_TITLE = "\u5c0f\u9ea6GS1\u6761\u7801\u751f\u6210";
    var UI_VERSION = "2026-06-08-top-position-01";
    var MM_TO_PT = 72 / 25.4;
    var GS = String.fromCharCode(29);

    var CODE128_PATTERNS = [
        "212222", "222122", "222221", "121223", "121322", "131222", "122213",
        "122312", "132212", "221213", "221312", "231212", "112232", "122132",
        "122231", "113222", "123122", "123221", "223211", "221132", "221231",
        "213212", "223112", "312131", "311222", "321122", "321221", "312212",
        "322112", "322211", "212123", "212321", "232121", "111323", "131123",
        "131321", "112313", "132113", "132311", "211313", "231113", "231311",
        "112133", "112331", "132131", "113123", "113321", "133121", "313121",
        "211331", "231131", "213113", "213311", "213131", "311123", "311321",
        "331121", "312113", "312311", "332111", "314111", "221411", "431111",
        "111224", "111422", "121124", "121421", "141122", "141221", "112214",
        "112412", "122114", "122411", "142112", "142211", "241211", "221114",
        "413111", "241112", "134111", "111242", "121142", "121241", "114212",
        "124112", "124211", "411212", "421112", "421211", "212141", "214121",
        "412121", "111143", "111341", "131141", "114113", "114311", "411113",
        "411311", "113141", "114131", "311141", "411131", "211412", "211214",
        "211232", "2331112"
    ];

    var START_CODES = { B: 104, C: 105 };
    var SWITCH_CODES = { B: 100, C: 99 };
    var FNC1 = 102;
    var STOP = 106;

    var FIXED_LENGTH_AIS = {
        "00": 18,
        "01": 14,
        "11": 6,
        "13": 6,
        "15": 6,
        "17": 6
    };

    var VARIABLE_LENGTH_MAX = {
        "10": 20,
        "21": 20,
        "30": 8,
        "37": 8,
        "240": 30
    };

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function mmToPt(value) {
        return Number(value) * MM_TO_PT;
    }

    function createCmykBlack() {
        var color = new CMYKColor();
        color.cyan = 0;
        color.magenta = 0;
        color.yellow = 0;
        color.black = 100;
        return color;
    }

    function createCodeColor(options) {
        var hex = trim(options.colorHex || "#000000").replace(/^#/, "");
        var color;
        if (/^[0-9a-fA-F]{3}$/.test(hex)) {
            hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
        }
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
            hex = "000000";
        }
        color = new RGBColor();
        color.red = parseInt(hex.substring(0, 2), 16);
        color.green = parseInt(hex.substring(2, 4), 16);
        color.blue = parseInt(hex.substring(4, 6), 16);
        return color;
    }

    function computeMod10CheckDigit(value) {
        var digits = String(value).split("");
        var sum = 0;
        var multiplier = 3;
        var i;
        for (i = digits.length - 1; i >= 0; i -= 1) {
            sum += Number(digits[i]) * multiplier;
            multiplier = multiplier === 3 ? 1 : 3;
        }
        return String((10 - (sum % 10)) % 10);
    }

    function normalizeGTIN(value) {
        var digits = String(value).replace(/\D/g, "");
        var expected;
        if (digits.length !== 14) {
            throw new Error("AI 01 / GTIN must be exactly 14 digits.");
        }
        expected = computeMod10CheckDigit(digits.substring(0, 13));
        if (digits.charAt(13) !== expected) {
            throw new Error("GTIN check digit is invalid. Expected the last digit to be " + expected + ".");
        }
        return digits;
    }

    function normalizeDate(value, fieldName) {
        var text = trim(value);
        if (/^\d{6}$/.test(text)) {
            return text;
        }
        if (/^\d{8}$/.test(text)) {
            return text.substring(2, 8);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            return text.substring(2, 4) + text.substring(5, 7) + text.substring(8, 10);
        }
        throw new Error(fieldName + " must be YYMMDD, YYYYMMDD, or YYYY-MM-DD.");
    }

    function normalizeQuantity(value) {
        var text = trim(value);
        if (text === "") {
            return "";
        }
        if (!/^\d+$/.test(text)) {
            throw new Error("AI 30 / Quantity must contain digits only.");
        }
        text = text.replace(/^0+/, "");
        return text === "" ? "0" : text;
    }

    function normalizeNumericAi(value, aiLabel) {
        var text = trim(value);
        if (text === "") {
            return "";
        }
        if (!/^\d+$/.test(text)) {
            throw new Error("AI " + aiLabel + " must contain digits only.");
        }
        text = text.replace(/^0+/, "");
        return text === "" ? "0" : text;
    }

    function pushIfPresent(entries, ai, value) {
        var text = trim(value);
        if (text !== "") {
            entries.push({ ai: ai, value: text });
        }
    }

    function buildEntries(formData) {
        var entries = [];
        if (formData.customEntries && formData.customEntries.length) {
            validateEntries(formData.customEntries);
            return formData.customEntries;
        }
        var values = {
            "01": trim(formData.gtin) !== "" ? normalizeGTIN(formData.gtin) : "",
            "11": formData.productionDate ? normalizeDate(formData.productionDate, "Production Date") : "",
            "17": formData.expiry ? normalizeDate(formData.expiry, "Expiry") : "",
            "10": trim(formData.lot),
            "30": formData.quantity ? normalizeQuantity(formData.quantity) : "",
            "21": trim(formData.serial),
            "37": formData.count37 ? normalizeNumericAi(formData.count37, "37") : "",
            "240": trim(formData.ai240)
        };
        var order = formData.aiOrder && formData.aiOrder.length ? formData.aiOrder : ["01", "11", "17", "10", "30", "37", "21", "240"];
        var used = {};
        var i;
        var ai;

        for (i = 0; i < order.length; i += 1) {
            ai = order[i];
            if (!used[ai] && values[ai] !== undefined && trim(values[ai]) !== "") {
                entries.push({ ai: ai, value: values[ai] });
                used[ai] = true;
            }
        }
        order = ["01", "11", "17", "10", "30", "37", "21", "240"];
        for (i = 0; i < order.length; i += 1) {
            ai = order[i];
            if (!used[ai] && values[ai] !== undefined && trim(values[ai]) !== "") {
                entries.push({ ai: ai, value: values[ai] });
                used[ai] = true;
            }
        }
        validateEntries(entries);
        return entries;
    }

    function validateEntries(entries) {
        var i;
        var entry;
        var value;
        if (!entries.length) {
            throw new Error("Please enter at least one AI field, for example (17), (10), (21), or (01).");
        }
        for (i = 0; i < entries.length; i += 1) {
            entry = entries[i];
            value = entry.value;
            if (value.indexOf(GS) >= 0) {
                throw new Error("AI " + entry.ai + " cannot contain the GS separator.");
            }
            if (entry.ai === "01") {
                entry.value = normalizeGTIN(value);
                value = entry.value;
            }
            if (entry.ai === "30" || entry.ai === "37") {
                entry.value = normalizeNumericAi(value, entry.ai);
                value = entry.value;
            }
            if (FIXED_LENGTH_AIS[entry.ai] && value.length !== FIXED_LENGTH_AIS[entry.ai]) {
                throw new Error("AI " + entry.ai + " must be exactly " + FIXED_LENGTH_AIS[entry.ai] + " characters.");
            }
            if (VARIABLE_LENGTH_MAX[entry.ai] && value.length > VARIABLE_LENGTH_MAX[entry.ai]) {
                throw new Error("AI " + entry.ai + " cannot exceed " + VARIABLE_LENGTH_MAX[entry.ai] + " characters.");
            }
        }
    }

    function buildGS1Strings(entries) {
        var raw = "";
        var humanReadable = "";
        var i;
        var entry;
        var nextExists;
        for (i = 0; i < entries.length; i += 1) {
            entry = entries[i];
            nextExists = i < entries.length - 1;
            raw += entry.ai + entry.value;
            humanReadable += "(" + entry.ai + ")" + entry.value;
            if (!FIXED_LENGTH_AIS[entry.ai] && nextExists) {
                raw += GS;
            }
        }
        return {
            raw: raw,
            humanReadable: humanReadable
        };
    }

    function rememberAiOrder(result, ai) {
        if (!result.__seenOrder) {
            result.__seenOrder = {};
        }
        if (!result.__order) {
            result.__order = [];
        }
        if (!result.__seenOrder[ai]) {
            result.__order.push(ai);
            result.__seenOrder[ai] = true;
        }
    }

    function parseParenthesizedGs1(text) {
        var result = { __order: [], __seenOrder: {}, __entries: [] };
        var pattern = /\((\d{2,4})\)([^\(]*)/g;
        var match;
        while ((match = pattern.exec(text)) !== null) {
            rememberAiOrder(result, match[1]);
            result[match[1]] = trim(match[2]);
            result.__entries.push({ ai: match[1], value: trim(match[2]) });
        }
        return result;
    }

    function parseRawGs1(text) {
        var result = { __order: [], __seenOrder: {}, __entries: [] };
        var index = 0;
        var ai;
        var knownVariable = ["10", "21", "30", "37", "240"];
        var knownFixed = { "01": 14, "11": 6, "17": 6 };
        var next;
        var nextPos;
        var i;
        text = String(text).replace(/\s+/g, "");
        while (index < text.length) {
            ai = text.substring(index, index + 2);
            index += 2;
            if (knownFixed[ai]) {
                rememberAiOrder(result, ai);
                result[ai] = text.substring(index, index + knownFixed[ai]);
                result.__entries.push({ ai: ai, value: result[ai] });
                index += knownFixed[ai];
                continue;
            }
            if (ai === "24" && text.charAt(index) === "0") {
                ai = "240";
                index += 1;
            }
            if (ai === "10" || ai === "21" || ai === "30" || ai === "37" || ai === "240") {
                nextPos = text.length;
                for (i = 0; i < knownVariable.length; i += 1) {
                    next = text.indexOf(knownVariable[i], index);
                    if (next >= 0 && next < nextPos) {
                        nextPos = next;
                    }
                }
                if (text.indexOf("11", index) >= 0 && text.indexOf("11", index) < nextPos) {
                    nextPos = text.indexOf("11", index);
                }
                if (text.indexOf("17", index) >= 0 && text.indexOf("17", index) < nextPos) {
                    nextPos = text.indexOf("17", index);
                }
                rememberAiOrder(result, ai);
                result[ai] = text.substring(index, nextPos);
                result.__entries.push({ ai: ai, value: result[ai] });
                index = nextPos;
                continue;
            }
            break;
        }
        return result;
    }

    function parseGs1LongText(text) {
        text = trim(text);
        if (!text) {
            return null;
        }
        if (text.indexOf("\uff08") >= 0 || text.indexOf("\uff09") >= 0) {
            throw new Error("\u6574\u4e32\u8f93\u5165\u8bf7\u4f7f\u7528\u82f1\u6587\u534a\u89d2\u62ec\u53f7 ()\uff0c\u4e0d\u8981\u4f7f\u7528\u4e2d\u6587\u5168\u89d2\u62ec\u53f7\uff08\uff09\u3002");
        }
        if (text.indexOf("(") >= 0) {
            return parseParenthesizedGs1(text);
        }
        return parseRawGs1(text);
    }

    function applyParsedGs1ToFormData(formData, parsed) {
        if (!parsed) {
            return formData;
        }
        formData.gtin = parsed["01"] || formData.gtin;
        formData.productionDate = parsed["11"] || formData.productionDate;
        formData.expiry = parsed["17"] || formData.expiry;
        formData.lot = parsed["10"] || formData.lot;
        formData.quantity = parsed["30"] || formData.quantity;
        formData.serial = parsed["21"] || formData.serial;
        formData.count37 = parsed["37"] || formData.count37;
        formData.ai240 = parsed["240"] || formData.ai240;
        formData.aiOrder = parsed.__order && parsed.__order.length ? parsed.__order : null;
        formData.customEntries = parsed.__entries && parsed.__entries.length ? parsed.__entries : null;
        return formData;
    }

    function digitRunLength(data, index) {
        var end = index;
        while (end < data.length && /\d/.test(data.charAt(end))) {
            end += 1;
        }
        return end - index;
    }

    function chooseStartSet(data) {
        return digitRunLength(data, 0) >= 2 ? "C" : "B";
    }

    function encodeCode128Values(data) {
        var codes = [];
        var position = 0;
        var currentSet = chooseStartSet(data);
        var run;
        var checksum;
        var i;
        var code;
        var chr;

        codes.push(START_CODES[currentSet]);
        codes.push(FNC1);

        while (position < data.length) {
            chr = data.charAt(position);

            if (chr === GS) {
                codes.push(FNC1);
                position += 1;
                continue;
            }

            if (currentSet === "C") {
                if (
                    position + 1 < data.length &&
                    /\d/.test(data.charAt(position)) &&
                    /\d/.test(data.charAt(position + 1))
                ) {
                    codes.push(Number(data.substring(position, position + 2)));
                    position += 2;
                    continue;
                }
                currentSet = "B";
                codes.push(SWITCH_CODES.B);
                continue;
            }

            run = digitRunLength(data, position);
            if (run >= 4) {
                currentSet = "C";
                codes.push(SWITCH_CODES.C);
                continue;
            }

            code = data.charCodeAt(position) - 32;
            if (code < 0 || code > 95) {
                throw new Error("Unsupported character in Code 128 Set B: " + chr);
            }
            codes.push(code);
            position += 1;
        }

        checksum = codes[0];
        for (i = 1; i < codes.length; i += 1) {
            checksum += codes[i] * i;
        }
        checksum = checksum % 103;
        codes.push(checksum);
        codes.push(STOP);
        return codes;
    }

    function getActiveDocumentInfo() {
        var info = { name: "", fullName: "" };
        var doc;
        try {
            doc = app.activeDocument;
            info.name = doc.name || "";
            try {
                info.fullName = doc.fullName ? doc.fullName.fsName : "";
            } catch (ignoreFullName) {
                info.fullName = "";
            }
        } catch (ignoreActiveDocInfo) {}
        return info;
    }

    function normalizeFsName(value) {
        return String(value || "").replace(/\\/g, "/").toLowerCase();
    }

    function findOpenDocumentByInfo(formData) {
        var targetFullName = normalizeFsName(formData.targetDocumentFullName);
        var targetName = String(formData.targetDocumentName || "");
        var i;
        var doc;
        var docFullName;

        if (!targetFullName && !targetName) {
            return null;
        }

        try {
            for (i = 0; i < app.documents.length; i += 1) {
                doc = app.documents[i];
                docFullName = "";
                try {
                    docFullName = doc.fullName ? normalizeFsName(doc.fullName.fsName) : "";
                } catch (ignoreDocFullName) {}
                if (targetFullName && docFullName === targetFullName) {
                    return doc;
                }
            }
        } catch (ignoreFullNameSearch) {}

        try {
            for (i = 0; i < app.documents.length; i += 1) {
                doc = app.documents[i];
                if (targetName && doc.name === targetName) {
                    return doc;
                }
            }
        } catch (ignoreNameSearch) {}

        return null;
    }

    function activateDocumentSafely(doc) {
        if (!doc) {
            return doc;
        }
        try {
            if (doc.activate) {
                doc.activate();
            }
        } catch (ignoreActivateDocument) {}
        return doc;
    }

    function getOrCreateDocument(formData) {
        var doc;
        doc = findOpenDocumentByInfo(formData || {});
        if (doc) {
            return activateDocumentSafely(doc);
        }

        try {
            doc = app.activeDocument;
            if (doc) {
                return activateDocumentSafely(doc);
            }
        } catch (ignoreActiveDocument) {}

        try {
            if (app.documents.length > 0) {
                return activateDocumentSafely(app.documents[0]);
            }
        } catch (ignoreDocumentCount) {
            // Illustrator can throw "there is no document" instead of returning 0.
        }
        doc = app.documents.add(DocumentColorSpace.CMYK);
        try {
            app.redraw();
        } catch (ignoreRedraw) {}
        return doc;
    }

    function getCurrentArtboardRect(doc) {
        try {
            return doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
        } catch (ignoreActiveArtboard) {
            return doc.artboards[0].artboardRect;
        }
    }

    function ensureLayer(doc) {
        return doc.activeLayer || doc.layers[0];
    }

    function setTextFont(textRange) {
        var candidates = ["ArialMT", "MicrosoftYaHei", "SimHei", "Arial-BoldMT"];
        var i;
        for (i = 0; i < candidates.length; i += 1) {
            try {
                textRange.characterAttributes.textFont = app.textFonts.getByName(candidates[i]);
                return;
            } catch (ignore) {}
        }
    }

    function addCenteredLabel(group, x, y, text, fontSizePt, black) {
        var label = group.textFrames.add();
        label.contents = text;
        label.position = [x, y];
        label.textRange.characterAttributes.size = fontSizePt;
        label.textRange.characterAttributes.fillColor = black;
        label.textRange.paragraphAttributes.justification = Justification.CENTER;
        setTextFont(label.textRange);
        return label;
    }

    function addFilledRect(group, left, top, width, height, fillColor) {
        var item = group.pathItems.add();
        item.setEntirePath([
            [left, top],
            [left + width, top],
            [left + width, top - height],
            [left, top - height]
        ]);
        item.closed = true;
        item.stroked = false;
        item.filled = true;
        item.fillColor = fillColor;
        return item;
    }

    function drawCode128(doc, options) {
        var artboardRect = getCurrentArtboardRect(doc);
        var layer = ensureLayer(doc);
        var group = layer.groupItems.add();
        var black = createCodeColor(options);
        var codes = encodeCode128Values(options.rawData);
        var moduleWidthPt = mmToPt(options.moduleSizeMm);
        var barHeightPt = mmToPt(options.barHeightMm);
        var quietZonePt = mmToPt(options.quietZoneMm);
        var marginPt = mmToPt(options.marginMm);
        var textGapPt = mmToPt(options.textGapMm);
        var fontSizePt = Number(options.fontSizePt);
        var artboardWidth = artboardRect[2] - artboardRect[0];
        var artboardHeight = artboardRect[1] - artboardRect[3];
        var totalWidthPt = 0;
        var totalHeightPt = barHeightPt + textGapPt + fontSizePt;
        var minX = artboardRect[0] + marginPt + quietZonePt;
        var maxX;
        var startX;
        var topY;
        var x;
        var i;
        var j;
        var pattern;
        var widthPt;
        var bar;
        var labelX;
        var labelY;

        for (i = 0; i < codes.length; i += 1) {
            pattern = CODE128_PATTERNS[codes[i]];
            for (j = 0; j < pattern.length; j += 1) {
                totalWidthPt += Number(pattern.charAt(j)) * moduleWidthPt;
            }
        }

        maxX = artboardRect[2] - marginPt - quietZonePt - totalWidthPt;
        startX = artboardRect[0] + (artboardWidth - totalWidthPt) / 2;
        if (startX < minX) {
            startX = minX;
        }
        if (startX > maxX) {
            startX = Math.max(minX, maxX);
        }
        topY = artboardRect[3] + (artboardHeight + totalHeightPt) / 2;
        if (topY > artboardRect[1] - marginPt) {
            topY = artboardRect[1] - marginPt;
        }
        if (topY - totalHeightPt < artboardRect[3] + marginPt) {
            topY = artboardRect[3] + marginPt + totalHeightPt;
        }
        x = startX;

        for (i = 0; i < codes.length; i += 1) {
            pattern = CODE128_PATTERNS[codes[i]];
            for (j = 0; j < pattern.length; j += 1) {
                widthPt = Number(pattern.charAt(j)) * moduleWidthPt;
                if (j % 2 === 0) {
                    bar = addFilledRect(group, x, topY, widthPt, barHeightPt, black);
                }
                x += widthPt;
            }
        }

        labelX = startX + (x - startX) / 2;
        labelY = topY - barHeightPt - textGapPt;
        addCenteredLabel(group, labelX, labelY, options.humanReadable, fontSizePt, black);

        group.name = "GS1-128 " + options.humanReadable;
        try {
            group.note = "GS1-128: " + options.humanReadable + "\rRaw: " + options.rawData;
        } catch (ignoreNote1) {}
        return group;
    }

    function waitForFile(fileObj, timeoutMs) {
        var start = (new Date()).getTime();
        while (((new Date()).getTime() - start) < timeoutMs) {
            if (fileObj.exists) {
                return true;
            }
            $.sleep(200);
        }
        return fileObj.exists;
    }

    function callPowerShell(scriptPath, inputFile, outputFile) {
        var command = 'powershell -NoProfile -ExecutionPolicy Bypass -File "' +
            scriptPath + '" -InputFile "' + inputFile + '" -OutputFile "' + outputFile + '"';
        var runnerFile;
        var responseFile;
        var batchText;
        var runnerExecuted;

        try {
            if (typeof system !== "undefined" && system.callSystem) {
                return system.callSystem(command);
            }
        } catch (ignoreSystem) {}

        try {
            runnerFile = new File(Folder.temp.fsName + "/gs1-datamatrix-runner.cmd");
            responseFile = new File(Folder.temp.fsName + "/gs1-datamatrix-runner.log");

            if (responseFile.exists) {
                try { responseFile.remove(); } catch (ignoreLogRemove) {}
            }

            batchText = '@echo off\r\n' +
                command + ' > "' + responseFile.fsName + '" 2>&1\r\n';

            runnerFile.encoding = "UTF-8";
            runnerFile.open("w");
            runnerFile.write(batchText);
            runnerFile.close();

            runnerExecuted = runnerFile.execute();
            if (!runnerExecuted) {
                throw new Error("Runner command file could not be started.");
            }

            return responseFile;
        } catch (fallbackError) {
            throw new Error("Unable to call PowerShell from Illustrator: " + fallbackError.message);
        }
    }

    function parseDataMatrixResponse(text) {
        var cleaned = String(text).replace(/^\uFEFF/, "");
        var lines = cleaned.split(/\r?\n/);
        var header;
        var dims;
        var width;
        var height;
        var cells = [];
        var i;
        var parts;

        while (lines.length && trim(lines[lines.length - 1]) === "") {
            lines.pop();
        }
        if (!lines.length) {
            throw new Error("Empty DataMatrix response.");
        }

        header = trim(lines[0]);
        dims = header.split(",");
        if (dims.length !== 2) {
            throw new Error("Invalid DataMatrix header: " + header);
        }
        width = Number(dims[0]);
        height = Number(dims[1]);

        for (i = 1; i < lines.length; i += 1) {
            if (trim(lines[i]) === "") {
                continue;
            }
            parts = trim(lines[i]).split(",");
            if (parts.length === 2) {
                cells.push([Number(parts[0]), Number(parts[1])]);
            }
        }

        return {
            width: width,
            height: height,
            cells: cells
        };
    }

    function resolveHelperScriptFile() {
        var mainFile = File($.fileName);
        var scriptDir = mainFile.parent;
        var baseName = decodeURI(mainFile.name).replace(/\.jsx$/i, "");
        var direct = new File(scriptDir.fsName + "/generate-gs1-datamatrix.ps1");
        var vendorDirect = new File(scriptDir.fsName + "/vendor/generate-gs1-datamatrix.ps1");
        var nested = new File(scriptDir.fsName + "/" + baseName + "/generate-gs1-datamatrix.ps1");
        var nestedVendor = new File(scriptDir.fsName + "/" + baseName + "/vendor/generate-gs1-datamatrix.ps1");
        var legacy = new File(scriptDir.fsName + "/医疗器械GS1码生成器/generate-gs1-datamatrix.ps1");
        var legacyVendor = new File(scriptDir.fsName + "/医疗器械GS1码生成器/vendor/generate-gs1-datamatrix.ps1");
        var aiPresetVendor = new File("C:/Program Files/Adobe/Adobe Illustrator 2025/Presets/zh_CN/脚本/vendor/generate-gs1-datamatrix.ps1");
        var aiPresetDirect = new File("C:/Program Files/Adobe/Adobe Illustrator 2025/Presets/zh_CN/脚本/generate-gs1-datamatrix.ps1");
        var sourceHelper = new File("D:/Ai2025/plugins/medical-gs1-128-barcode/scripts/generate-gs1-datamatrix.ps1");

        if (direct.exists) {
            return direct;
        }
        if (vendorDirect.exists) {
            return vendorDirect;
        }
        if (nested.exists) {
            return nested;
        }
        if (nestedVendor.exists) {
            return nestedVendor;
        }
        if (legacy.exists) {
            return legacy;
        }
        if (legacyVendor.exists) {
            return legacyVendor;
        }
        if (aiPresetVendor.exists) {
            return aiPresetVendor;
        }
        if (aiPresetDirect.exists) {
            return aiPresetDirect;
        }
        if (sourceHelper.exists) {
            return sourceHelper;
        }
        return direct;
    }

    function resolveHelperDllFile(scriptFile) {
        var candidates = [
            new File(scriptFile.parent.fsName + "/zxing.dll"),
            new File(scriptFile.parent.fsName + "/vendor/zxing-net/lib/net40/zxing.dll"),
            new File(scriptFile.parent.fsName + "/医疗器械GS1码生成器/vendor/zxing-net/lib/net40/zxing.dll"),
            new File("C:/Program Files/Adobe/Adobe Illustrator 2025/Presets/zh_CN/脚本/vendor/zxing-net/lib/net40/zxing.dll"),
            new File("D:/Ai2025/plugins/medical-gs1-128-barcode/vendor/zxing-net/lib/net40/zxing.dll"),
            new File(Folder.desktop.fsName + "/zxing.dll"),
            new File(Folder.desktop.fsName + "/vendor/zxing-net/lib/net40/zxing.dll"),
            new File("D:/Ai2025/plugins/medical-gs1-128-barcode/vendor/zxing-net/lib/net40/zxing.dll")
        ];
        var i;

        for (i = 0; i < candidates.length; i += 1) {
            if (candidates[i].exists) {
                return candidates[i];
            }
        }
        return candidates[1];
    }

    function ensureFolder(folderObj) {
        if (!folderObj.exists) {
            folderObj.create();
        }
        return folderObj.exists;
    }

    function copyFileTo(fileObj, destinationPath) {
        var target = new File(destinationPath);
        if (target.exists) {
            try { target.remove(); } catch (ignoreRemoveTarget) {}
        }
        if (!fileObj.copy(target.fsName)) {
            throw new Error("Unable to copy file to temp runtime: " + fileObj.fsName);
        }
        return target;
    }

    function prepareAsciiRuntime(scriptFile) {
        var dllFile = resolveHelperDllFile(scriptFile);
        var tempRoot = new Folder(Folder.temp.fsName + "/gs1-helper-runtime");
        var vendorDir = new Folder(tempRoot.fsName + "/vendor/zxing-net/lib/net40");
        var helperCopy;
        var dllCopy;
        var xmlSource;

        if (!scriptFile.exists) {
            throw new Error("DataMatrix helper script was not found: " + scriptFile.fsName);
        }
        if (!dllFile.exists) {
            throw new Error("ZXing library was not found next to helper script.");
        }

        ensureFolder(tempRoot);
        ensureFolder(new Folder(tempRoot.fsName + "/vendor"));
        ensureFolder(new Folder(tempRoot.fsName + "/vendor/zxing-net"));
        ensureFolder(new Folder(tempRoot.fsName + "/vendor/zxing-net/lib"));
        ensureFolder(vendorDir);

        helperCopy = copyFileTo(scriptFile, tempRoot.fsName + "/generate-gs1-datamatrix.ps1");
        dllCopy = copyFileTo(dllFile, vendorDir.fsName + "/zxing.dll");

        xmlSource = new File(dllFile.parent.fsName + "/zxing.XML");
        if (xmlSource.exists) {
            copyFileTo(xmlSource, vendorDir.fsName + "/zxing.XML");
        }

        return {
            scriptFile: helperCopy,
            dllFile: dllCopy
        };
    }

    function generateDataMatrixMatrix(rawData) {
        var sourceScriptFile = resolveHelperScriptFile();
        var runtime;
        var scriptFile;
        var tempDir = Folder.temp;
        var inputFile = new File(tempDir.fsName + "/gs1-datamatrix-input.json");
        var outputFile = new File(tempDir.fsName + "/gs1-datamatrix-output.json");
        var response;
        var text;
        var responseFile;

        runtime = prepareAsciiRuntime(sourceScriptFile);
        scriptFile = runtime.scriptFile;

        inputFile.encoding = "UTF-8";
        inputFile.open("w");
        inputFile.write(rawData);
        inputFile.close();

        if (outputFile.exists) {
            try { outputFile.remove(); } catch (ignoreRemove) {}
        }

        response = callPowerShell(scriptFile.fsName, inputFile.fsName, outputFile.fsName);

        if (!outputFile.exists) {
            if (response && response instanceof File) {
                responseFile = response;
                waitForFile(responseFile, 15000);
            }
            waitForFile(outputFile, 15000);
        }

        if (!outputFile.exists) {
            if (responseFile && responseFile.exists) {
                responseFile.encoding = "UTF-8";
                responseFile.open("r");
                text = responseFile.read();
                responseFile.close();
                throw new Error("Failed to generate DataMatrix.\r\n" + text);
            }
            throw new Error("Failed to generate DataMatrix.");
        }

        outputFile.encoding = "UTF-8";
        outputFile.open("r");
        text = outputFile.read();
        outputFile.close();
        return parseDataMatrixResponse(text);
    }

    function drawDataMatrix(doc, options) {
        var matrix = generateDataMatrixMatrix(options.rawData);
        var artboardRect = getCurrentArtboardRect(doc);
        var layer = ensureLayer(doc);
        var group = layer.groupItems.add();
        var black = createCodeColor(options);
        var moduleSizePt = mmToPt(options.moduleSizeMm);
        var quietZonePt = mmToPt(options.quietZoneMm);
        var marginPt = mmToPt(options.marginMm);
        var textGapPt = mmToPt(options.textGapMm);
        var fontSizePt = Number(options.fontSizePt);
        var artboardWidth = artboardRect[2] - artboardRect[0];
        var artboardHeight = artboardRect[1] - artboardRect[3];
        var symbolWidthPt = matrix.width * moduleSizePt;
        var symbolHeightPt = matrix.height * moduleSizePt;
        var totalHeightPt = symbolHeightPt + (options.showHumanReadable ? textGapPt + fontSizePt : 0);
        var startX = artboardRect[0] + (artboardWidth - symbolWidthPt) / 2;
        var topY = artboardRect[3] + (artboardHeight + totalHeightPt) / 2;
        var minX = artboardRect[0] + marginPt + quietZonePt;
        var maxX = artboardRect[2] - marginPt - quietZonePt - symbolWidthPt;
        var cells = matrix.cells;
        var i;
        var cell;
        var x;
        var y;
        var labelX;
        var labelY;

        if (startX < minX) {
            startX = minX;
        }
        if (startX > maxX) {
            startX = Math.max(minX, maxX);
        }
        if (topY > artboardRect[1] - marginPt - quietZonePt) {
            topY = artboardRect[1] - marginPt - quietZonePt;
        }
        if (topY - totalHeightPt < artboardRect[3] + marginPt + quietZonePt) {
            topY = artboardRect[3] + marginPt + quietZonePt + totalHeightPt;
        }

        for (i = 0; i < cells.length; i += 1) {
            cell = cells[i];
            x = startX + Number(cell[0]) * moduleSizePt;
            y = topY - Number(cell[1]) * moduleSizePt;
            addFilledRect(group, x, y, moduleSizePt, moduleSizePt, black);
        }

        if (options.showHumanReadable) {
            labelX = startX + (matrix.width * moduleSizePt) / 2;
            labelY = topY - (matrix.height * moduleSizePt) - textGapPt;
            addCenteredLabel(group, labelX, labelY, options.humanReadable, fontSizePt, black);
        }

        group.name = "GS1 DataMatrix " + options.humanReadable;
        try {
            group.note = "GS1 DataMatrix: " + options.humanReadable + "\rRaw: " + options.rawData;
        } catch (ignoreNote2) {}
        return group;
    }

    function createDefaultFormState() {
        return {
            kind: "GS1-128 条码",
            gtin: "",
            productionDate: "",
            expiry: "",
            lot: "",
            quantity: "",
            count37: "",
            serial: "",
            moduleSizeMm: "0.45",
            barHeightMm: "20",
            quietZoneMm: "2.5",
            marginMm: "10",
            textGapMm: "4",
            fontSizePt: "8",
            colorHex: "#000000"
        };
    }

    function showToolPalette(defaults) {
        if ($.global.__xiaomaiGS1Window) {
            try {
                if ($.global.__xiaomaiGS1Version === UI_VERSION) {
                    $.global.__xiaomaiGS1Window.show();
                    return;
                }
                $.global.__xiaomaiGS1Window.close();
            } catch (ignoreOldWindow) {}
            $.global.__xiaomaiGS1Window = null;
        }

        var initial = defaults || createDefaultFormState();
        var dialog = new Window("palette", SCRIPT_TITLE, [130, 190, 570, 970]);
        var controls = [];
        var fields = {};
        var result = null;
        var expandButton = dialog.add("radiobutton", [12, 10, 42, 30], "+");
        var collapseButton = dialog.add("radiobutton", [46, 10, 76, 30], "-");
        var titleText = dialog.add("statictext", [96, 10, 400, 32], "\u5c0f\u9ea6GS1\u6761\u7801\u751f\u6210");
        var hintText = dialog.add("statictext", [28, 42, 410, 44], "");
        var typePanel = dialog.add("panel", [16, 48, 424, 122], "\u751f\u6210\u7c7b\u578b");
        var longTextPanel = dialog.add("panel", [16, 132, 424, 212], "\u6574\u4e32\u8f93\u5165");
        var fieldPanel = dialog.add("panel", [16, 222, 424, 524], "\u4e1a\u52a1\u5b57\u6bb5");
        var advancedToggle = dialog.add("checkbox", [0, 0, 0, 0], "");
        var drawPanel = dialog.add("panel", [16, 534, 424, 680], "\u7ed8\u5236\u53c2\u6570");
        var statusText = dialog.add("statictext", [22, 690, 418, 718], "\u53ef\u76f4\u63a5\u7c98\u8d34\u5b8c\u6574 GS1 \u5185\u5bb9\u751f\u6210\u3002", { multiline: true });
        var okButton = dialog.add("button", [92, 728, 224, 760], "\u751f\u6210 GS1 \u7801");
        var closeButton = dialog.add("button", [246, 728, 378, 760], "\u5173\u95ed\u5de5\u5177");
        var ruleText;
        var geometryHelp;

        controls = [titleText, hintText, typePanel, longTextPanel, fieldPanel, drawPanel, statusText, okButton, closeButton];
        expandButton.value = true;

        try {
            titleText.graphics.font = ScriptUI.newFont(titleText.graphics.font.name, "BOLD", 14);
        } catch (ignoreFont) {}

        fields.kindBarcode = typePanel.add("radiobutton", [18, 18, 160, 40], "GS1-128 \u6761\u7801");
        fields.kindMatrix = typePanel.add("radiobutton", [178, 18, 390, 40], "DataMatrix \u4e8c\u7ef4\u7801");
        ruleText = typePanel.add("statictext", [18, 40, 390, 58], "\u9002\u5408\u5305\u88c5\u6807\u7b7e\u4e0e\u6253\u5370\u573a\u666f\u3002");
        fields.kindBarcode.value = true;

        fields.longText = longTextPanel.add("edittext", [16, 20, 392, 54], "", { multiline: true, scrolling: true });
        longTextPanel.add("statictext", [16, 56, 392, 74], "\u53ef\u7c98\u8d34\uff1a(17)...(10)...(37)...");

        function addFixedField(parent, x, y, width, label, hint, defaultValue, characters) {
            var labelText = parent.add("statictext", [x, y, x + width, y + 20], label);
            var hintText = { text: hint };
            var input = parent.add("edittext", [x, y + 22, x + width, y + 46], defaultValue);
            input.labelRef = labelText;
            input.hintRef = hintText;
            input.characters = characters || 20;
            return input;
        }

        fields.gtin = addFixedField(fieldPanel, 16, 20, 376, "01 GTIN", "\u5fc5\u987b 14 \u4f4d", initial.gtin, 24);
        fields.productionDate = addFixedField(fieldPanel, 16, 75, 176, "11 \u751f\u4ea7\u65e5\u671f", "YYMMDD", initial.productionDate, 12);
        fields.expiry = addFixedField(fieldPanel, 216, 75, 176, "17 \u5931\u6548\u671f", "YYMMDD", initial.expiry, 12);
        fields.lot = addFixedField(fieldPanel, 16, 130, 376, "10 \u6279\u53f7", "LOT / Batch", initial.lot, 24);
        fields.quantity = addFixedField(fieldPanel, 16, 185, 176, "30 \u6570\u91cf", "\u6570\u5b57", initial.quantity, 12);
        fields.count37 = addFixedField(fieldPanel, 216, 185, 176, "37 \u4ef6\u6570", "\u6570\u5b57", initial.count37, 12);
        fields.serial = addFixedField(fieldPanel, 16, 240, 376, "21 \u5e8f\u5217\u53f7", "\u53ef\u9009", initial.serial, 24);

        function addCompactParam(parent, x, y, label, defaultValue) {
            parent.add("statictext", [x, y, x + 120, y + 18], label);
            return parent.add("edittext", [x, y + 18, x + 162, y + 42], defaultValue);
        }

        function addColorParam(parent, x, y, label, defaultValue) {
            parent.add("statictext", [x, y, x + 34, y + 18], label);
            return parent.add("edittext", [x, y + 18, x + 52, y + 42], defaultValue);
        }

        fields.moduleSizeMm = { text: String(initial.moduleSizeMm) };
        fields.quietZoneMm = { text: String(initial.quietZoneMm) };
        fields.barHeightMm = addCompactParam(drawPanel, 16, 20, "\u6761\u9ad8 mm", initial.barHeightMm);
        fields.fontSizePt = addCompactParam(drawPanel, 216, 20, "\u5b57\u53f7 pt", initial.fontSizePt);
        fields.marginMm = addCompactParam(drawPanel, 16, 64, "\u753b\u677f\u8fb9\u8ddd mm", initial.marginMm);
        fields.textGapMm = { text: String(initial.textGapMm) };
        drawPanel.add("statictext", [216, 64, 336, 82], "\u989c\u8272 HEX");
        fields.colorHex = drawPanel.add("edittext", [216, 82, 378, 106], initial.colorHex || "#000000");
        geometryHelp = drawPanel.add("statictext", [16, 118, 392, 140], "\u9ed8\u8ba4 #000000\uff0c\u652f\u6301 #FF0000 \u6216 000000\u3002", { multiline: true });

        function roundDisplay(value) {
            return String(Math.round(Number(value) * 100) / 100);
        }

        function setCollapsed(isCollapsed) {
            var i;
            for (i = 0; i < controls.length; i += 1) {
                controls[i].visible = !isCollapsed;
            }
            expandButton.value = !isCollapsed;
            collapseButton.value = isCollapsed;
            dialog.bounds = isCollapsed ? [130, 190, 216, 232] : [130, 190, 570, 970];
        }

        function setActionArea(expanded) {
            if (expanded) {
                statusText.visible = true;
                statusText.bounds = [22, 690, 418, 718];
                okButton.bounds = [92, 728, 224, 760];
                closeButton.bounds = [246, 728, 378, 760];
                dialog.bounds = [130, 190, 570, 970];
            } else {
                statusText.visible = true;
                statusText.bounds = [22, 690, 418, 718];
                okButton.bounds = [92, 728, 224, 760];
                closeButton.bounds = [246, 728, 378, 760];
                dialog.bounds = [130, 190, 570, 970];
            }
        }

        function updateModeUI() {
            var isMatrix = fields.kindMatrix.value === true;
            fields.barHeightMm.enabled = !isMatrix;
            fields.textGapMm.enabled = !isMatrix;
            fields.fontSizePt.enabled = !isMatrix;
            ruleText.text = isMatrix ?
                "\u5f3a\u5236\u6b63\u65b9\u5f62\uff0c\u9ed8\u8ba4\u4e0d\u5e26\u4e0b\u65b9\u6570\u5b57\u3002" :
                "\u9002\u5408\u5305\u88c5\u6807\u7b7e\u4e0e\u6253\u5370\u573a\u666f\u3002";
            geometryHelp.text = isMatrix ?
                "DataMatrix \u5efa\u8bae\u6a21\u5757 0.35-0.40 mm\u3002" :
                "GS1-128 \u9ed8\u8ba4\u7a0d\u5927\uff0c\u6253\u5370\u66f4\u6e05\u6670\u3002";
        }

        if (initial.kind && initial.kind.indexOf("DataMatrix") >= 0) {
            fields.kindMatrix.value = true;
            fields.kindBarcode.value = false;
        }

        function readFormData() {
            var activeDocInfo = getActiveDocumentInfo();
            var formData = {
                kind: fields.kindMatrix.value ? "GS1 DataMatrix \u4e8c\u7ef4\u7801" : "GS1-128 \u6761\u7801",
                gtin: fields.gtin.text,
                productionDate: fields.productionDate.text,
                expiry: fields.expiry.text,
                lot: fields.lot.text,
                quantity: fields.quantity.text,
                count37: fields.count37.text,
                serial: fields.serial.text,
                moduleSizeMm: Number(fields.moduleSizeMm.text),
                barHeightMm: Number(fields.barHeightMm.text),
                quietZoneMm: Number(fields.quietZoneMm.text),
                marginMm: Number(fields.marginMm.text),
                textGapMm: Number(fields.textGapMm.text),
                fontSizePt: Number(fields.fontSizePt.text),
                colorHex: fields.colorHex.text,
                targetDocumentName: activeDocInfo.name,
                targetDocumentFullName: activeDocInfo.fullName
            };
            return applyParsedGs1ToFormData(formData, parseGs1LongText(fields.longText.text));
        }

        fields.kindBarcode.onClick = updateModeUI;
        fields.kindMatrix.onClick = updateModeUI;
        expandButton.onClick = function () { setCollapsed(false); };
        collapseButton.onClick = function () { setCollapsed(true); };
        advancedToggle.value = true;
        advancedToggle.visible = false;
        drawPanel.visible = true;
        setActionArea(true);
        advancedToggle.onClick = function () {
            advancedToggle.value = true;
            drawPanel.visible = true;
            setActionArea(true);
        };
        okButton.onClick = function () {
            sendPanelWorker(readFormData(), statusText);
        };
        closeButton.onClick = function () {
            result = { action: "close" };
            dialog.close();
        };
        dialog.onClose = function () {
            $.global.__xiaomaiGS1Window = null;
        };

        updateModeUI();
        $.global.__xiaomaiGS1Version = UI_VERSION;
        dialog.show();

        if (result && result.action !== "close") {
            try {
                $.global.__xiaomaiGS1State = generateFromFormData(result, false);
                try { app.redraw(); } catch (ignoreStableRedraw) {}
            } catch (error) {
                $.global.__xiaomaiGS1State = saveFormState(result);
                alert(SCRIPT_TITLE + "\r\r" + error.message);
            }
            showToolPalette($.global.__xiaomaiGS1State || saveFormState(result));
        }
    }

    function addField(parent, label, hint, defaultValue, characters) {
        var wrapper = parent.add("group");
        var labelRow;
        var text;
        var hintText;
        var input;

        wrapper.orientation = "column";
        wrapper.alignChildren = "fill";
        wrapper.spacing = 3;

        labelRow = wrapper.add("group");
        labelRow.orientation = "row";
        labelRow.alignChildren = ["left", "center"];

        text = labelRow.add("statictext", undefined, label);
        text.characters = 14;

        hintText = labelRow.add("statictext", undefined, hint);
        hintText.characters = 14;

        input = wrapper.add("edittext", undefined, defaultValue);
        input.characters = characters;
        input.labelRef = text;
        input.hintRef = hintText;
        return input;
    }

    function validateNumericSettings(options) {
        if (!(options.moduleSizeMm > 0)) {
            throw new Error("Module Size must be greater than 0.");
        }
        if (!(options.barHeightMm > 0)) {
            throw new Error("Barcode Height must be greater than 0.");
        }
        if (!(options.quietZoneMm >= 0)) {
            throw new Error("Quiet Zone cannot be negative.");
        }
        if (!(options.marginMm >= 0)) {
            throw new Error("Margin cannot be negative.");
        }
        if (!(options.textGapMm >= 0)) {
            throw new Error("Text Gap cannot be negative.");
        }
        if (!(options.fontSizePt > 0)) {
            throw new Error("Text Size must be greater than 0.");
        }
    }

    function saveFormState(formData) {
        return {
            kind: formData.kind,
            gtin: formData.gtin,
            productionDate: formData.productionDate,
            expiry: formData.expiry,
            lot: formData.lot,
            quantity: formData.quantity,
            count37: formData.count37,
            serial: formData.serial,
            moduleSizeMm: String(formData.moduleSizeMm),
            barHeightMm: String(formData.barHeightMm),
            quietZoneMm: String(formData.quietZoneMm),
            marginMm: String(formData.marginMm),
            textGapMm: String(formData.textGapMm),
            fontSizePt: String(formData.fontSizePt),
            colorHex: String(formData.colorHex || "#000000")
        };
    }

    function generateFromFormData(formData, showAlert) {
        var entries;
        var data;
        var doc;
        var group;
        validateNumericSettings(formData);
        entries = buildEntries(formData);
        data = buildGS1Strings(entries);
        doc = getOrCreateDocument(formData);

        if (formData.kind.indexOf("DataMatrix") >= 0) {
            group = drawDataMatrix(doc, {
                rawData: data.raw,
                humanReadable: data.humanReadable,
                moduleSizeMm: formData.moduleSizeMm,
                quietZoneMm: formData.quietZoneMm,
                marginMm: formData.marginMm,
                textGapMm: formData.textGapMm,
                fontSizePt: formData.fontSizePt,
                colorHex: formData.colorHex,
                    showHumanReadable: false
                });
        } else {
            group = drawCode128(doc, {
                rawData: data.raw,
                humanReadable: data.humanReadable,
                moduleSizeMm: formData.moduleSizeMm,
                barHeightMm: formData.barHeightMm,
                quietZoneMm: formData.quietZoneMm,
                marginMm: formData.marginMm,
                textGapMm: formData.textGapMm,
                fontSizePt: formData.fontSizePt,
                colorHex: formData.colorHex
            });
        }

        try {
            doc.selection = null;
            group.selected = true;
        } catch (ignoreSelection) {}

        if (showAlert !== false) {
            alert(
                "\u5df2\u751f\u6210 " + formData.kind + "\u3002\r\r" +
                "\u4eba\u773c\u53ef\u8bfb: " + data.humanReadable + "\r" +
                "\u539f\u59cb\u6570\u636e: " + data.raw
            );
        }

        return saveFormState(formData);
    }

    function createBridgeTalkTarget() {
        var bit = 64;
        var version = "29";
        try {
            version = app.version.split(".")[0];
        } catch (ignoreVersion) {}
        return "illustrator-" + version + ".0" + bit;
    }

    function createBridgeTalkTargets() {
        var version = "29";
        try {
            version = app.version.split(".")[0];
        } catch (ignoreVersion) {}
        return [
            "illustrator-" + version + ".064",
            "illustrator-" + version + ".032",
            "illustrator-" + version,
            "illustrator"
        ];
    }

    function generateFromPendingBridgeData() {
        var formData = $.global.__xiaomaiGS1PendingData;
        if (!formData) {
            alert(SCRIPT_TITLE + "\r\rNo pending GS1 data.");
            return;
        }
        try {
            $.global.__xiaomaiGS1State = generateFromFormData(formData, false);
            $.global.__xiaomaiGS1LastStatus = "\u5df2\u751f\u6210\uff1a" + formData.kind + "\u3002";
            try { app.redraw(); } catch (ignoreBridgeRedraw) {}
        } catch (error) {
            $.global.__xiaomaiGS1State = saveFormState(formData);
            $.global.__xiaomaiGS1LastStatus = "\u751f\u6210\u5931\u8d25\uff1a" + error.message;
            alert(SCRIPT_TITLE + "\r\r" + error.message);
        }
    }

    function dispatchGeneration(formData, statusText) {
        var bt;
        var targets;
        var targetIndex = 0;
        $.global.__xiaomaiGS1PendingData = formData;
        $.global.__xiaomaiGS1LastStatus = "\u6b63\u5728\u751f\u6210\uff0c\u8bf7\u7a0d\u5019...";
        statusText.text = $.global.__xiaomaiGS1LastStatus;

        try {
            $.global.__xiaomaiGS1State = generateFromFormData(formData, false);
            $.global.__xiaomaiGS1LastStatus = "\u5df2\u751f\u6210\uff1a" + formData.kind + "\u3002";
            statusText.text = $.global.__xiaomaiGS1LastStatus;
            try { app.redraw(); } catch (ignoreDirectRedraw) {}
            return;
        } catch (directError) {
            $.global.__xiaomaiGS1LastStatus = "\u76f4\u63a5\u751f\u6210\u5931\u8d25\uff1a" + directError.message;
        }

        try {
            if (app.scheduleTask) {
                app.scheduleTask('$.global.__xiaomaiGS1GeneratePending();', 100, false);
                return;
            }
        } catch (ignoreScheduleDispatch) {}

        function sendBridgeTalk() {
            var targetName;
            if (targetIndex >= targets.length) {
                statusText.text = "\u751f\u6210\u5931\u8d25\uff1aBridgeTalk \u5168\u90e8\u76ee\u6807\u5931\u8d25";
                alert(SCRIPT_TITLE + "\r\rBridgeTalk failed for all targets.");
                return;
            }
            targetName = targets[targetIndex];
            targetIndex += 1;
            bt = new BridgeTalk();
            bt.target = targetName;
            bt.body = '#targetengine "xiaomai_gs1_generator_panel"\r$.global.__xiaomaiGS1GeneratePending();';
            bt.onResult = function () {
                statusText.text = $.global.__xiaomaiGS1LastStatus || "\u5df2\u751f\u6210\u3002";
            };
            bt.onError = function (error) {
                statusText.text = "\u751f\u6210\u5931\u8d25\uff1aBridgeTalk " + targetName + " \u5931\u8d25";
                sendBridgeTalk();
            };
            bt.send();
        }

        try {
            if (typeof BridgeTalk !== "undefined") {
                targets = createBridgeTalkTargets();
                sendBridgeTalk();
                return;
            }
        } catch (bridgeError) {
            statusText.text = "\u751f\u6210\u5931\u8d25\uff1a" + bridgeError.message;
            alert(SCRIPT_TITLE + "\r\r" + bridgeError.message);
            return;
        }

        generateFromPendingBridgeData();
        statusText.text = $.global.__xiaomaiGS1LastStatus || "\u5df2\u751f\u6210\u3002";
    }

    function generateAfterPanelClose(formData) {
        try {
            $.sleep(120);
        } catch (ignoreSleep) {}

        try {
            $.global.__xiaomaiGS1State = generateFromFormData(formData, false);
            $.global.__xiaomaiGS1LastStatus = "\u5df2\u751f\u6210\uff1a" + formData.kind + "\u3002";
            try { app.redraw(); } catch (ignoreRedrawAfterClose) {}
        } catch (error) {
            $.global.__xiaomaiGS1State = saveFormState(formData);
            $.global.__xiaomaiGS1LastStatus = "\u751f\u6210\u5931\u8d25\uff1a" + error.message;
            alert(SCRIPT_TITLE + "\r\r" + error.message);
        }

        try {
            showToolPalette($.global.__xiaomaiGS1State || saveFormState(formData));
        } catch (reopenError) {
            alert(SCRIPT_TITLE + "\r\r\u751f\u6210\u540e\u91cd\u65b0\u6253\u5f00\u9762\u677f\u5931\u8d25\uff1a" + reopenError.message);
        }
    }

    function quoteForJs(value) {
        return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"';
    }

    function arrayToJsLiteral(items) {
        var parts = [];
        var i;
        if (!items || !items.length) {
            return "null";
        }
        for (i = 0; i < items.length; i += 1) {
            parts.push(quoteForJs(items[i]));
        }
        return "[" + parts.join(",") + "]";
    }

    function entriesToJsLiteral(entries) {
        var parts = [];
        var i;
        if (!entries || !entries.length) {
            return "null";
        }
        for (i = 0; i < entries.length; i += 1) {
            parts.push("{ai:" + quoteForJs(entries[i].ai) + ",value:" + quoteForJs(entries[i].value) + "}");
        }
        return "[" + parts.join(",") + "]";
    }

    function formDataToLiteral(formData) {
        return "{" +
            "kind:" + quoteForJs(formData.kind) + "," +
            "gtin:" + quoteForJs(formData.gtin) + "," +
            "productionDate:" + quoteForJs(formData.productionDate) + "," +
            "expiry:" + quoteForJs(formData.expiry) + "," +
            "lot:" + quoteForJs(formData.lot) + "," +
            "quantity:" + quoteForJs(formData.quantity) + "," +
            "count37:" + quoteForJs(formData.count37 || "") + "," +
            "serial:" + quoteForJs(formData.serial) + "," +
            "ai240:" + quoteForJs(formData.ai240 || "") + "," +
            "moduleSizeMm:" + Number(formData.moduleSizeMm) + "," +
            "barHeightMm:" + Number(formData.barHeightMm) + "," +
            "quietZoneMm:" + Number(formData.quietZoneMm) + "," +
            "marginMm:" + Number(formData.marginMm) + "," +
            "textGapMm:" + Number(formData.textGapMm) + "," +
            "fontSizePt:" + Number(formData.fontSizePt) + "," +
            "aiOrder:" + arrayToJsLiteral(formData.aiOrder) + "," +
            "customEntries:" + entriesToJsLiteral(formData.customEntries) + "," +
            "colorHex:" + quoteForJs(formData.colorHex || "#000000") + "," +
            "targetDocumentName:" + quoteForJs(formData.targetDocumentName || "") + "," +
            "targetDocumentFullName:" + quoteForJs(formData.targetDocumentFullName || "") +
        "}";
    }

    function resolveBridgeTalkTargetName() {
        var targetName = "";
        try {
            if (typeof BridgeTalk !== "undefined" && BridgeTalk.getSpecifier) {
                targetName = BridgeTalk.getSpecifier("illustrator");
            }
        } catch (ignoreSpecifier) {}
        if (targetName) {
            return targetName;
        }
        return createBridgeTalkTarget();
    }

    function sendPanelWorker(formData, statusText) {
        var bt;
        var scriptPath = File($.fileName).fsName.replace(/\\/g, "/");
        var body = '#targetengine "xiaomai_gs1_generator_panel"\r' +
            '$.global.__xiaomaiGS1WorkerMode = true;\r' +
            '$.evalFile(File(' + quoteForJs(scriptPath) + '));\r' +
            '$.global.__xiaomaiGS1WorkerGenerate(' + formDataToLiteral(formData) + ');\r';

        statusText.visible = true;
        statusText.text = "\u6b63\u5728\u53d1\u9001\u751f\u6210\u4efb\u52a1...";
        try {
            if (typeof BridgeTalk === "undefined") {
                throw new Error("BridgeTalk is undefined.");
            }
            bt = new BridgeTalk();
            bt.target = resolveBridgeTalkTargetName();
            bt.body = body;
            bt.onResult = function () {
                statusText.text = "\u5df2\u53d1\u9001\u5e76\u5b8c\u6210\u751f\u6210\u4efb\u52a1\u3002";
                $.global.__xiaomaiGS1State = saveFormState(formData);
            };
            bt.onError = function (error) {
                var detail = error && error.body ? error.body : "\u672a\u8fd4\u56de\u8be6\u7ec6\u9519\u8bef";
                statusText.text = "\u9762\u677f\u6d4b\u8bd5\u5931\u8d25\uff1a" + detail;
                alert(SCRIPT_TITLE + "\r\r" + detail);
            };
            bt.send();
        } catch (error) {
            statusText.text = "\u9762\u677f\u6d4b\u8bd5\u5931\u8d25\uff1a" + error.message;
            alert(SCRIPT_TITLE + "\r\r" + error.message);
        }
    }

    function main() {
        showToolPalette($.global.__xiaomaiGS1State || createDefaultFormState());
    }

    $.global.__xiaomaiGS1Run = main;
    $.global.__xiaomaiGS1GeneratePending = generateFromPendingBridgeData;
    $.global.__xiaomaiGS1WorkerGenerate = function (formData) {
        $.global.__xiaomaiGS1State = generateFromFormData(formData, false);
        try { app.redraw(); } catch (ignoreWorkerRedraw) {}
        return "OK";
    };

    if (!$.global.__xiaomaiGS1WorkerMode) {
        try {
            main();
        } catch (error) {
            alert(SCRIPT_TITLE + "\r\r" + error.message);
        }
    } else {
        $.global.__xiaomaiGS1WorkerMode = false;
    }
}());
