#!/bin/bash
# ZARN Icarus self-heal — keeps the dedicated server answering A2S queries so it
# stays visible/joinable. Safe by design: starts the container if stopped, and
# only restarts a *running* one if A2S has been dead past the boot window, with a
# 30-min cooldown so it can never restart-loop during Icarus's ~7-min Wine boot.
set -u
IC=mgg_cmqcuwx4g00073rvcrhsljpwl
QPORT=27017
PP=/home/icarus/.local/lib/python3.12/site-packages
LOG=/home/eliot/icarus-heal.log
STAMP=/tmp/icarus-heal-last-restart
ts() { date '+%F %T'; }

# 1) Container must exist.
if ! docker ps -a --format '{{.Names}}' | grep -qx "$IC"; then
  echo "$(ts) container $IC missing — nothing to heal" >> "$LOG"; exit 0
fi

# 2) If not running, start it (covers a clean stop / crash that didn't auto-restart).
state=$(docker inspect -f '{{.State.Status}}' "$IC" 2>/dev/null)
if [ "$state" != "running" ]; then
  echo "$(ts) state=$state -> docker start" >> "$LOG"
  docker start "$IC" >> "$LOG" 2>&1
  exit 0
fi

# 3) Boot guard: skip the A2S check while it is still booting (< 12 min uptime).
started=$(docker inspect -f '{{.State.StartedAt}}' "$IC")
up=$(( $(date +%s) - $(date -d "$started" +%s) ))
if [ "$up" -lt 720 ]; then
  echo "$(ts) booting (${up}s) — skip A2S check" >> "$LOG"; exit 0
fi

# 4) A2S check (3 tries).
ok=0
for i in 1 2 3; do
  if docker exec -e PYTHONPATH="$PP" "$IC" python3 -c "import a2s; a2s.info(('127.0.0.1',$QPORT),timeout=6)" >/dev/null 2>&1; then
    ok=1; break
  fi
  sleep 5
done
if [ "$ok" -eq 1 ]; then
  echo "$(ts) A2S OK" >> "$LOG"; exit 0
fi

# 5) Cooldown: never restart more than once / 30 min.
now=$(date +%s); last=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $(( now - last )) -lt 1800 ]; then
  echo "$(ts) A2S dead but within cooldown — wait" >> "$LOG"; exit 0
fi

echo "$(ts) A2S unresponsive ${up}s uptime -> docker restart" >> "$LOG"
echo "$now" > "$STAMP"
docker restart "$IC" >> "$LOG" 2>&1
