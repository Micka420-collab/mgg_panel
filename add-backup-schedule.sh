#!/bin/bash
# Add a daily automatic backup schedule for the Icarus server (fires immediately
# once as a safety net, then every day at 03:30 in the server's timezone).
ID=cmqcuwx4g00073rvcrhsljpwl

# Don't create a duplicate if one already exists.
EXISTS=$(docker exec mgg-postgres-1 psql -U mgg -d mgg -tAc \
  "SELECT count(*) FROM \"Schedule\" s JOIN \"Task\" t ON t.\"scheduleId\"=s.id WHERE s.\"serverId\"='$ID' AND t.action='BACKUP'")
if [ "${EXISTS:-0}" -gt 0 ]; then echo "BACKUP_SCHEDULE_ALREADY_EXISTS=$EXISTS"; exit 0; fi

docker exec -i mgg-postgres-1 psql -U mgg -d mgg <<SQL
WITH s AS (
  INSERT INTO "Schedule" (id,"serverId",name,cron,timezone,active,"nextRunAt","createdAt")
  VALUES (md5(random()::text||clock_timestamp()::text),'$ID','Sauvegarde quotidienne','30 3 * * *',
          COALESCE((SELECT timezone FROM "Schedule" WHERE "serverId"='$ID' LIMIT 1),'UTC'),true,now(),now())
  RETURNING id
)
INSERT INTO "Task" (id,"scheduleId",action,payload,"offsetSeconds",sequence,"continueOnFailure")
SELECT md5(random()::text||clock_timestamp()::text), id, 'BACKUP'::"TaskAction", '', 0, 0, true FROM s;
SQL

echo "--- schedules now ---"
docker exec mgg-postgres-1 psql -U mgg -d mgg -tAc \
  "SELECT s.name,s.cron,s.active,t.action FROM \"Schedule\" s JOIN \"Task\" t ON t.\"scheduleId\"=s.id WHERE s.\"serverId\"='$ID'"
