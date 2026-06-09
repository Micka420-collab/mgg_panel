#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  MGG Panel — full uninstall.
#  Wipes the ENTIRE installation off this VM: the whole docker-compose stack
#  (panel, daemon, postgres, caddy, edge-proxy), every managed game container
#  and its volumes, the Postgres database, and ALL data/worlds/backups under
#  the data dir. IRREVERSIBLE. Run as root:  sudo bash deploy/uninstall.sh
#  (or `make destroy`). Set PURGE_IMAGES=1 to also delete the built images.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="${COMPOSE:-docker compose}"
PROJECT="mgg"
PREFIX="mgg"
DATA_DIR="${MGG_DATA_DIR:-/var/lib/mgg}"

cat <<EOF

⚠️  This will PERMANENTLY DELETE the entire MGG installation from this VM:
      • the whole stack (panel, daemon, postgres, caddy, edge-proxy) + its volumes
      • every managed game server container ($PREFIX\_*)
      • the Postgres database
      • ALL data, worlds, files and backups under $DATA_DIR

    This CANNOT be undone.

EOF

read -r -p 'Type DELETE to confirm: ' answer
if [ "${answer:-}" != "DELETE" ]; then
  echo "Aborted — nothing was deleted."
  exit 1
fi

echo "→ Stopping & removing the stack (with volumes)…"
$COMPOSE down -v --remove-orphans || true

echo "→ Removing managed game containers (${PREFIX}_*)…"
docker ps -aq --filter "name=${PREFIX}_" | xargs -r docker rm -f || true

echo "→ Removing project volumes…"
docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT}" | xargs -r docker volume rm -f || true

echo "→ Wiping data dir ${DATA_DIR}…"
rm -rf "${DATA_DIR:?}/"* "${DATA_DIR:?}/".[!.]* 2>/dev/null || true

if [ "${PURGE_IMAGES:-0}" = "1" ]; then
  echo "→ Removing built images…"
  docker image rm -f "${PREFIX}-panel" "${PREFIX}-daemon" 2>/dev/null || true
fi

cat <<EOF

✓ MGG has been removed from this VM.
  The cloned repo at $ROOT_DIR is left in place — delete it manually if you want it gone too:
      rm -rf "$ROOT_DIR"
EOF
