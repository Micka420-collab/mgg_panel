#!/bin/bash
# Repare l'install Mindcraft : installe les libs systeme pour canvas + gl, puis recompile.
export DEBIAN_FRONTEND=noninteractive
echo "[A] kill install bloque..."
pkill -9 -f "npm install" 2>/dev/null
pkill -9 -f "node-gyp" 2>/dev/null
pkill -9 -f "prebuild-install" 2>/dev/null
sleep 2
echo "[B] baisse priorite Ollama pendant le build..."
for p in $(pgrep -f llama-server); do renice +15 -p "$p" >/dev/null 2>&1; done
echo "[C] apt: libs de build canvas (Cairo/Pango/JPEG) + gl (Mesa/X11)..."
apt-get update -qq
apt-get install -y -qq pkg-config python3 \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev \
  libgl1-mesa-dev libglu1-mesa-dev libxi-dev libxext-dev >/dev/null 2>&1 || echo ERR_LIBS
echo "libs ok"
echo "[D] npm install (finalise)..."
cd /opt/mindcraft && npm install 2>&1 | tail -6
echo "[E] rebuild force canvas + gl avec les libs..."
npm rebuild canvas 2>&1 | tail -4
RC_CANVAS=$?
npm rebuild gl 2>&1 | tail -4
RC_GL=$?
echo "[F] test imports natifs..."
node -e "require('canvas'); console.log('canvas OK')" 2>&1 | tail -2
node -e "require('gl'); console.log('gl OK')" 2>&1 | tail -2
echo "MINDCRAFT2_DONE canvas=$RC_CANVAS gl=$RC_GL"
