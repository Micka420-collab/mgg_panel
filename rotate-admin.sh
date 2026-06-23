#!/bin/bash
# Rotate the Icarus admin password durably (only if the server is empty).
# Updates the daemon spec (recreates the container with the new env) + the panel DB.
ID=cmqcuwx4g00073rvcrhsljpwl
LOG=/var/lib/mgg/volumes/$ID/drive_c/icarus/Saved/Logs/Icarus.log
SPEC=/var/lib/mgg/volumes/$ID/.mgg/spec.json

ONLINE=$(awk '
/ServerTryCompletePlayerInitialisation - PlayerCharacterID:/ { if (match($0,/[0-9]{17}/)) { id=substr($0,RSTART,17); st[id]="in" } }
/UNetConnection::Close:.*RemoteAddr: [0-9]{17}/ { if (match($0,/RemoteAddr: [0-9]{17}/)) { id=substr($0,RSTART+12,17); st[id]="out" } }
END { n=0; for (i in st) if (st[i]=="in") n++; print n }' "$LOG" 2>/dev/null)
echo "ONLINE=${ONLINE:-0}"
if [ "${ONLINE:-0}" -gt 0 ]; then echo "ABORT: players online, not recreating"; exit 0; fi

NEWPW=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | cut -c1-20)
TOKEN=$(docker inspect mgg-daemon-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DAEMON_TOKEN=' | cut -d= -f2-)
if [ -z "$TOKEN" ]; then echo "NO_TOKEN"; exit 1; fi

python3 - "$SPEC" "$NEWPW" "$TOKEN" <<'PY'
import json, sys, urllib.request
spec_path, pw, token = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(spec_path))
d.setdefault('environment', {})['SERVER_ADMIN_PASSWORD'] = pw
body = json.dumps(d).encode()
req = urllib.request.Request('http://127.0.0.1:8080/api/servers?rebuild=1', data=body,
    headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method='POST')
print('daemon_resp:', urllib.request.urlopen(req, timeout=25).read().decode())
PY

echo -n "db_update: "
docker exec mgg-postgres-1 psql -U mgg -d mgg -tAc \
  "UPDATE \"Server\" SET environment = jsonb_set(environment::jsonb,'{SERVER_ADMIN_PASSWORD}',to_jsonb('$NEWPW'::text)) WHERE id='$ID';" 2>&1 | head -1
echo "NEW_ADMIN_PASSWORD=$NEWPW"
