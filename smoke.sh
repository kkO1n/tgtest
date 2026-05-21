#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-changeme}"
CHAT_ID="${CHAT_ID:-1}"
EVENT_ID="${EVENT_ID:-$(cat /proc/sys/kernel/random/uuid)}"

echo "[1/3] Unauthorized request (expected 401)"
curl -sS -o /tmp/smoke_unauth_body.txt -w "status=%{http_code}\n" \
  -X POST "${BASE_URL}/v1/events" \
  -H "content-type: application/json" \
  -d '{"eventType":"order.created","chatId":"'"${CHAT_ID}"'","payload":{"orderId":"42"}}'
cat /tmp/smoke_unauth_body.txt
echo

echo "[2/3] Authorized request (expected 202)"
curl -sS -o /tmp/smoke_auth_body.txt -w "status=%{http_code}\n" \
  -X POST "${BASE_URL}/v1/events" \
  -H "x-api-key: ${API_KEY}" \
  -H "content-type: application/json" \
  -d '{"eventId":"'"${EVENT_ID}"'","eventType":"order.created","chatId":"'"${CHAT_ID}"'","payload":{"orderId":"42"}}'
cat /tmp/smoke_auth_body.txt
echo

echo "[3/3] Duplicate eventId request (expected 202, dedup handled downstream)"
curl -sS -o /tmp/smoke_dup_body.txt -w "status=%{http_code}\n" \
  -X POST "${BASE_URL}/v1/events" \
  -H "x-api-key: ${API_KEY}" \
  -H "content-type: application/json" \
  -d '{"eventId":"'"${EVENT_ID}"'","eventType":"order.created","chatId":"'"${CHAT_ID}"'","payload":{"orderId":"42"}}'
cat /tmp/smoke_dup_body.txt
echo

echo "Done. Check logs for processing:"
echo "Use terminal output from 'npm run start:all' (or each start:dev:* process)."
