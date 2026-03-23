#!/usr/bin/env bash
# Micromium dev launcher: builds frontend first (go:embed needs dist/), then Go server, then Electron.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing frontend deps..."
cd frontend
npm install --silent

echo "==> Building renderer + Electron main..."
npm run build
cd ..

echo "==> Building Go server (embeds frontend/dist)..."
go build -o micromiumserver ./cmd/micromium/

echo "==> Launching Electron..."
cd frontend
./node_modules/.bin/electron . --no-sandbox
