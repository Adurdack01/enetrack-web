param(
  [switch]$Upload,
  [string]$Port,
  [switch]$EraseFirst,
  [switch]$FullFlash
)

$ErrorActionPreference = "Stop"

$arduinoCli = "C:\arduino-cli_1.4.1_Windows_64bit\arduino-cli.exe"
$esptool = "C:\Users\USER\AppData\Local\Arduino15\packages\esp32\tools\esptool_py\5.2.0\esptool.exe"
$fqbn = "esp32:esp32:esp32:PartitionScheme=huge_app"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sketchPath = $scriptRoot
$buildPath = Join-Path $scriptRoot ".arduino-build\enertrack-esp32-huge"
$mergedBin = Join-Path $buildPath "enertrack-esp32.ino.merged.bin"

if (!(Test-Path $arduinoCli)) {
  throw "Arduino CLI was not found at $arduinoCli"
}

Write-Host "[1/3] Compiling firmware with huge_app partition..." -ForegroundColor Cyan
& $arduinoCli compile --clean --build-path $buildPath --fqbn $fqbn $sketchPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (!$Upload) {
  Write-Host "Compile finished." -ForegroundColor Green
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Port)) {
  throw "Provide -Port COMx when using -Upload."
}

if ($EraseFirst -or $FullFlash) {
  if (!(Test-Path $esptool)) {
    throw "esptool was not found at $esptool"
  }
}

if ($EraseFirst) {
  Write-Host "[2/3] Erasing ESP32 flash on $Port..." -ForegroundColor Yellow
  & $esptool --chip esp32 --port $Port erase-flash
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if ($FullFlash) {
  if (!(Test-Path $mergedBin)) {
    throw "Merged firmware image was not found at $mergedBin"
  }

  Write-Host "[3/3] Writing full merged firmware image to $Port..." -ForegroundColor Yellow
  & $esptool --chip esp32 --port $Port --baud 921600 write-flash 0x0 $mergedBin
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Full flash completed." -ForegroundColor Green
  }
  exit $LASTEXITCODE
}

Write-Host "[2/2] Uploading sketch image to $Port..." -ForegroundColor Yellow
& $arduinoCli upload --input-dir $buildPath -p $Port --fqbn $fqbn
if ($LASTEXITCODE -eq 0) {
  Write-Host "Upload completed." -ForegroundColor Green
}
exit $LASTEXITCODE
