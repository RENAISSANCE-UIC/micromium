# Micromium Windows production build — produces an NSIS installer.
# Run from the project root in PowerShell:  .\build\build-windows.ps1
# Requires: Go, Node.js 20+
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "==> Installing frontend deps..."
Set-Location frontend
npm ci --silent
Set-Location $root

Write-Host "==> Building renderer + Electron main..."
Set-Location frontend
npm run build
Set-Location $root

Write-Host "==> Building Go server (embeds frontend/dist)..."
$env:GOOS   = 'windows'
$env:GOARCH = 'amd64'
go build -o micromiumserver.exe ./cmd/micromium/

Write-Host "==> Packaging with electron-builder..."
Set-Location frontend
npx electron-builder --win --x64

Write-Host ""
Write-Host "==> Done. Installer is in frontend\dist-electron\"
