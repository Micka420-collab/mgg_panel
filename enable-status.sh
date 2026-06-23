#!/bin/bash
# End-to-end test: enable the public status page for the Icarus server + fetch it.
ID=cmqcuwx4g00073rvcrhsljpwl
TOK=$(openssl rand -base64 9 | tr -dc 'A-Za-z0-9' | cut -c1-12)
docker exec -i mgg-postgres-1 psql -U mgg -d mgg <<SQL
UPDATE "Server" SET "statusToken"='$TOK' WHERE id='$ID';
SQL
echo "TOKEN=$TOK"
echo -n "public page HTTP: "; curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1/status/$TOK"; echo
echo "--- rendered extract ---"
curl -s --max-time 8 "http://127.0.0.1/status/$TOK" | grep -oE "ZARN[^<]{0,40}|En ligne|Hors ligne|[0-9]+/[0-9]+|Adresse" | head -6
