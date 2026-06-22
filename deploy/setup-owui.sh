#!/bin/bash
# Setup Open WebUI (interface chat) dans le LXC gemma-ai, branche sur Ollama local.
export DEBIAN_FRONTEND=noninteractive
echo "[1/4] apt deps..."
apt-get update -qq
apt-get install -y python3 python3-venv python3-pip build-essential python3-dev || { echo "ERR_APT"; exit 11; }
echo "[2/4] venv..."
python3 -m venv --clear /opt/openwebui || { echo "ERR_VENV"; exit 12; }
echo "[3/4] upgrade pip..."
/opt/openwebui/bin/pip install --upgrade pip wheel || { echo "ERR_PIP"; exit 13; }
echo "[4/4] install open-webui (long)..."
/opt/openwebui/bin/pip install open-webui || { echo "ERR_OWUI"; exit 14; }
echo "SETUP_DONE_OK"
