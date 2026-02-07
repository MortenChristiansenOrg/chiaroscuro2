#!/bin/bash
# Build in WSL, run natively on Windows
set -e

WIN_USER=$(powershell.exe -NoProfile -Command '[System.Environment]::UserName' | tr -d '\r')
WIN_DIR="/mnt/c/Users/${WIN_USER}/.chiaroscuro-dev"
WIN_PATH="C:\\Users\\${WIN_USER}\\.chiaroscuro-dev"

mkdir -p "$WIN_DIR"

echo "Building..."
bunx electron-vite build

echo "Syncing to Windows..."
rsync -a --delete out/ "$WIN_DIR/out/"
rsync -a --delete resources/ "$WIN_DIR/resources/"
cp package.json "$WIN_DIR/"

# One-time: install electron on Windows side
if [ ! -d "$WIN_DIR/node_modules/electron" ]; then
  echo "First run: installing Electron on Windows (one-time)..."
  powershell.exe -NoProfile -Command "cd '$WIN_PATH'; npm install --save-dev electron"
fi

echo "Launching..."
powershell.exe -NoProfile -Command "cd '$WIN_PATH'; npx electron ."
