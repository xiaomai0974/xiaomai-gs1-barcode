# 小麦GS1条码生成

用于 Adobe Illustrator 的医疗器械 GS1 码生成脚本，可生成：

- GS1-128 条码
- GS1 DataMatrix 二维码

## 下载与安装

推荐下载仓库中的 `小麦GS1条码生成-20260612.zip`。

安装步骤：

1. 解压 ZIP。
2. 右键 `一键安装.cmd`，选择“以管理员身份运行”。
3. 重启 Adobe Illustrator。
4. 在 Illustrator 菜单中打开：`文件 > 脚本 > 小麦GS1条码生成`。

## 手动安装

如果一键安装不可用，可以手动复制：

1. 打开 Illustrator 脚本目录，例如：
   `C:\Program Files\Adobe\Adobe Illustrator 2025\Presets\zh_CN\脚本`
2. 将 `installer\小麦GS1条码生成.jsx` 复制到该目录。
3. 将 `installer\vendor` 文件夹整体复制到同一目录。
4. 重启 Illustrator。

## 规则说明

- `(01)` GTIN 可以不填。
- 如果填写 `(01)`，必须是 14 位，并会校验 GTIN 校验位。
- 支持 `(10)` 批号、`(11)` 生产日期、`(17)` 失效期、`(21)` 序列号、`(30)` 数量、`(37)` 件数。
- DataMatrix 功能依赖 `vendor` 文件夹，请不要删除。

## 适用环境

- Windows
- Adobe Illustrator 2025 中文版已测试
- DataMatrix 生成依赖 PowerShell / .NET
