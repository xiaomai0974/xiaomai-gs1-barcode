param(
    [Parameter(Mandatory = $true)]
    [string]$InputFile,

    [Parameter(Mandatory = $true)]
    [string]$OutputFile
)

$ErrorActionPreference = "Stop"

function Get-BlackCells {
    param(
        [object]$Matrix
    )

    $cells = New-Object System.Collections.ArrayList
    for ($y = 0; $y -lt $Matrix.Height; $y++) {
        for ($x = 0; $x -lt $Matrix.Width; $x++) {
            if ($Matrix[$x, $y]) {
                [void]$cells.Add(@($x, $y))
            }
        }
    }
    return $cells
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dllCandidates = @(
    [System.IO.Path]::GetFullPath((Join-Path $scriptDir "zxing.dll")),
    [System.IO.Path]::GetFullPath((Join-Path $scriptDir "vendor\\zxing-net\\lib\\net40\\zxing.dll")),
    [System.IO.Path]::GetFullPath("C:\\Users\\Administrator\\Desktop\\zxing.dll"),
    [System.IO.Path]::GetFullPath("C:\\Users\\Administrator\\Desktop\\vendor\\zxing-net\\lib\\net40\\zxing.dll"),
    [System.IO.Path]::GetFullPath("D:\\Ai2025\\plugins\\medical-gs1-128-barcode\\vendor\\zxing-net\\lib\\net40\\zxing.dll")
)

$dllPath = $null
foreach ($candidate in $dllCandidates) {
    if (Test-Path -LiteralPath $candidate) {
        $dllPath = $candidate
        break
    }
}

if (-not (Test-Path -LiteralPath $dllPath)) {
    throw "ZXing library not found: $dllPath"
}

Add-Type -Path $dllPath

$rawData = Get-Content -LiteralPath $InputFile -Raw
$rawData = $rawData.Trim()

$writer = New-Object ZXing.Datamatrix.DataMatrixWriter
$hints = New-Object 'System.Collections.Generic.Dictionary[ZXing.EncodeHintType,System.Object]'
$hints[[ZXing.EncodeHintType]::GS1_FORMAT] = $true
$hints[[ZXing.EncodeHintType]::MARGIN] = 0
$hints[[ZXing.EncodeHintType]::DATA_MATRIX_COMPACT] = $true
$hints[[ZXing.EncodeHintType]::DATA_MATRIX_SHAPE] = [ZXing.Datamatrix.Encoder.SymbolShapeHint]::FORCE_SQUARE

$matrix = $writer.encode(
    [string]$rawData,
    [ZXing.BarcodeFormat]::DATA_MATRIX,
    1,
    1,
    $hints
)

$lines = New-Object System.Collections.ArrayList
[void]$lines.Add(($matrix.Width.ToString() + "," + $matrix.Height.ToString()))

$cells = Get-BlackCells -Matrix $matrix
foreach ($cell in $cells) {
    [void]$lines.Add(($cell[0].ToString() + "," + $cell[1].ToString()))
}

[System.IO.File]::WriteAllLines($OutputFile, $lines, [System.Text.Encoding]::UTF8)
