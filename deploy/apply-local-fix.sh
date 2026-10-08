#!/usr/bin/env bash
# Apply a reviewed patch to an existing single-host installation. No world,
# database, credentials or game-server limits are changed by this installer.
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then
  echo 'Run this installer with sudo: /opt/mgg and Docker are administrator-owned.' >&2
  exit 1
fi
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo 'Usage: apply-local-fix.sh PATCH_FILE [INSTALLATION_PATH]' >&2
  exit 1
fi
patch_file=$(realpath -- "$1")
installation=$(realpath -- "${2:-/opt/mgg}")
[[ -f "$patch_file" && -d "$installation/.git" && -f "$installation/docker-compose.yml" ]]
cd "$installation"
if [[ -n $(git status --porcelain) ]]; then
  echo 'Installation has local source changes; review them before applying this patch.' >&2
  exit 1
fi
git apply --check -- "$patch_file"
backup_dir=$(mktemp -d /var/backups/mgg-local-fix.XXXXXX)
chmod 700 "$backup_dir"
cp -- "$patch_file" "$backup_dir/source.patch"
git rev-parse HEAD > "$backup_dir/base-commit.txt"
git apply -- "$patch_file"
echo "Source patch saved for rollback in $backup_dir/source.patch"
# A failed build leaves the current containers running. Only these two services
# are recreated; database, edge proxy and game-world volumes are preserved.
docker compose build panel daemon
docker compose up -d --no-deps panel daemon
docker compose ps panel daemon
echo 'Update applied. In the stopped test server Settings, reduce Server RAM to 4096 MB, then Start.'
