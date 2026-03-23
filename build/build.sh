#!/usr/bin/env bash
# Micromium production build — produces a distributable AppImage.
# Order matters: npm build first (go:embed needs dist/), then go build, then electron-builder.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing frontend deps..."
cd frontend
npm ci --silent
cd ..

echo "==> Building renderer + Electron main..."
cd frontend
npm run build
cd ..

echo "==> Building Go server (embeds frontend/dist)..."
go build -o micromiumserver ./cmd/micromium/
chmod +x micromiumserver

echo "==> Packaging with electron-builder..."
cd frontend
npm run electron:build

echo ""
echo "==> Done. AppImage is in frontend/dist-electron/"
