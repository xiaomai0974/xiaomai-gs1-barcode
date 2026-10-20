# 小麦 GS1 条码生成器

一个直接在浏览器中使用的医疗器械 GS1 条码工具。无需安装软件，业务数据只在当前浏览器中处理。

## 在线使用

[打开小麦 GS1 条码生成器](https://xiaomai0974.github.io/xiaomai-gs1-barcode/)

网页支持：

- 生成 `GS1-128` 线性条码。
- 生成正方形 `GS1 DataMatrix` 二维码。
- 下载 PNG 图片和 PDF 矢量文件。
- 每行一条批量生成，最多 100 条，并将 PDF 或 PNG 打包为 ZIP 下载。
- PDF 导出保留矢量条码和文字；GS1-128 条纹为无描边的独立填充矩形，便于在 Illustrator 中按比例缩放。每条条码独立导出为一个 PDF，条纹尺寸与同倍率 PNG 一致，页面尺寸随条码自动适配。
- PDF 保留白色底板和扫描留白：GS1-128 左右至少 10 个模块，DataMatrix 四周至少 1 个模块，放入排版稿件时可避免相邻图文干扰扫码。导入 Illustrator 后请等比例缩放。
- 打印当前条码、复制编码内容。
- 电脑和手机浏览器自适应使用。

## GS1 字段规则

- `(01)` GTIN 可以不填；填写时必须是 14 位数字，并校验 GTIN 校验位。
- `(11)` 生产日期和 `(17)` 失效期使用 `YYMMDD` 格式。
- `(10)` 批号和 `(21)` 序列号最多 20 个字符。
- `(30)` 数量和 `(37)` 件数只能填写数字，最多 8 位。
- 任一字段可单独生成，也可粘贴完整的括号格式 GS1 内容，例如 `(17)310514(10)LOT001`。
- 整串输入支持其他合法 GS1 AI，最终格式由条码引擎继续校验。

## 本地运行

这是纯静态网站。下载仓库后，用任意静态文件服务器打开根目录即可；不能直接双击 `index.html` 时，可使用 VS Code Live Server 等工具。

## Illustrator 版本

仓库中的 `installer` 文件夹和 ZIP 是原 Adobe Illustrator 脚本版本，网页版不依赖这些文件。

正式用于印刷前，请使用实际扫码设备验证编码内容、尺寸和识读效果。

## 开源组件

条码生成使用 [bwip-js](https://github.com/metafloor/bwip-js)，批量压缩使用 [JSZip](https://stuk.github.io/jszip/)，PDF 矢量导出使用 [jsPDF](https://github.com/parallax/jsPDF) 和 [svg2pdf.js](https://github.com/yWorks/svg2pdf.js)。所有组件随网站本地加载，无需外部 CDN，许可信息见 `THIRD-PARTY-NOTICES.md`。
