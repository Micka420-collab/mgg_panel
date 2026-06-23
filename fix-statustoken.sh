#!/bin/bash
# Panel is crash-looping because `prisma db push` refuses to add the @unique
# constraint on Server.statusToken (data-loss guard). Create the column + unique
# index manually so the DB matches the schema → db push becomes a no-op → panel boots.
docker exec -i mgg-postgres-1 psql -U mgg -d mgg <<'SQL'
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "statusToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Server_statusToken_key" ON "Server"("statusToken");
SQL
echo "--- column present? ---"
docker exec mgg-postgres-1 psql -U mgg -d mgg -tAc \
  "SELECT column_name FROM information_schema.columns WHERE table_name='Server' AND column_name='statusToken'"
echo "--- restarting panel ---"
docker restart mgg-panel-1 >/dev/null && echo "panel restarted"
