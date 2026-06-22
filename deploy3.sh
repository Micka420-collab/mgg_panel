#!/bin/bash
# Chained deploy: wait for build #2 to finish, then build+deploy the panel
# (glow/light effect — panel-only, no daemon change).
for i in $(seq 1 180); do
  if grep -qE "ALLDONE_OK|ALLDONE_FAIL" /tmp/mgg-build2.log 2>/dev/null; then break; fi
  sleep 5
done
echo "build2 done, extracting glow files..."
tar -xzf /home/eliot/deploy3.tgz -C /opt/mgg
cd /opt/mgg || exit 1
DOCKER_BUILDKIT=0 docker compose build panel && docker compose up -d panel && echo ALLDONE_OK || echo ALLDONE_FAIL
