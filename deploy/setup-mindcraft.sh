#!/bin/bash
# Installe Mindcraft-CE (corps Minecraft de l'agent) dans le conteneur IA.
# Repo approuve par l'user : github.com/mindcraft-ce/mindcraft-ce
export DEBIAN_FRONTEND=noninteractive
echo "[1/4] apt deps..."
apt-get update -qq
apt-get install -y -qq git curl ca-certificates >/dev/null 2>&1 || { echo ERR_APT; exit 11; }
echo "[2/4] node 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
apt-get install -y -qq nodejs >/dev/null 2>&1 || { echo ERR_NODE; exit 12; }
echo "node $(node -v)  npm $(npm -v)"
echo "[3/4] clone mindcraft-ce..."
cd /opt && git clone --depth 1 https://github.com/mindcraft-ce/mindcraft-ce.git mindcraft 2>&1 | tail -2 || { echo ERR_CLONE; exit 13; }
echo "[4/4] npm install (long)..."
cd /opt/mindcraft && npm install 2>&1 | tail -5 || { echo ERR_NPM; exit 14; }
echo "MINDCRAFT_SETUP_DONE"
