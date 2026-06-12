小麦GS1条码生成 - Illustrator 脚本安装说明

适用环境：
1. Windows 系统。
2. Adobe Illustrator，已测试 Illustrator 2025 中文版。
3. 需要能运行 PowerShell，用于生成 GS1 DataMatrix 二维码。

一键安装：
1. 解压整个压缩包，不要只单独拿出 JSX 文件。
2. 右键“一键安装.cmd”，选择“以管理员身份运行”。
3. 安装完成后，重启 Adobe Illustrator。
4. 在 Illustrator 菜单中打开：文件 > 脚本 > 小麦GS1条码生成。

手动安装：
1. 找到 Illustrator 脚本目录，常见位置：
   C:\Program Files\Adobe\Adobe Illustrator 2025\Presets\zh_CN\脚本
2. 把“小麦GS1条码生成.jsx”复制进去。
3. 把“vendor”文件夹整个复制进去，必须和 JSX 文件在同一级目录。
4. 重启 Illustrator。

注意：
1. 不要删除 vendor 文件夹，否则 DataMatrix 二维码功能无法使用。
2. 如果只生成 GS1-128 条码，JSX 本体即可工作；如果要生成 DataMatrix，必须保留 vendor。
3. (01) GTIN 可不填；但只要填写 (01)，必须是 14 位并符合校验位规则。
4. 本工具生成的是 Illustrator 矢量对象，生成后可在 AI 中继续编辑、缩放和排版。
