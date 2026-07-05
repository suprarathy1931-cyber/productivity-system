#!/bin/bash
# Smoke test: POST a minimal valid body to every module's create endpoint
# and confirm 201. This exists specifically to catch schema/column
# mismatches between schema.sql and each route file's hasUpdatedAt/
# hasSyncStatus config — the class of bug found manually in
# roadmap_domains, which turned out to affect 6 more tables.
#
# Three endpoints (language-activity, roadmap/phases, roadmap/milestones)
# need a real foreign-key value to succeed, since their schema enforces
# REFERENCES constraints. This script creates the parent rows first
# and threads the real IDs through — testing that FKs are enforced
# AND that a correctly-linked create actually succeeds, not just that
# an incomplete one correctly fails.

set -e
BASE_URL="http://localhost:8787"
KEY="local-dev-test-key-12345"

FAIL=0

test_create() {
  local endpoint="$1"
  local body="$2"
  local status
  status=$(curl -s -o /tmp/resp_body.json -w "%{http_code}" \
    -H "x-api-key: $KEY" -H "Content-Type: application/json" \
    -X POST "$BASE_URL/$endpoint" -d "$body")

  if [ "$status" == "201" ]; then
    echo "OK   [$status] POST /$endpoint"
  else
    echo "FAIL [$status] POST /$endpoint -> $(cat /tmp/resp_body.json)"
    FAIL=1
  fi
}

# Separate from test_create: hits GET /<endpoint> (the list route) and
# confirms it returns a JSON ARRAY, not an error object. This exists
# specifically because POST can succeed while GET list fails for a
# reason POST never exercises (e.g. list()'s default ORDER BY entry_date
# breaking on a table that has no entry_date column — a real bug found
# during manual testing that the original create-only smoke test missed
# entirely, since len() on a JSON object with 2 error keys silently
# returned "2" instead of failing loudly).
test_list() {
  local endpoint="$1"
  local status
  status=$(curl -s -o /tmp/resp_list.json -w "%{http_code}" \
    -H "x-api-key: $KEY" "$BASE_URL/$endpoint")

  # Use python to actually validate it's a list, not just check the
  # HTTP status — a 200 with an error object shaped like {"a":1,"b":2}
  # would pass a naive status-code-only check.
  is_valid_array=$(python3 -c "
import json
try:
    with open('/tmp/resp_list.json') as f:
        data = json.load(f)
    print('yes' if isinstance(data, list) else 'no')
except Exception:
    print('no')
")

  if [ "$status" == "200" ] && [ "$is_valid_array" == "yes" ]; then
    echo "OK   [$status] GET  /$endpoint (returned valid array)"
  else
    echo "FAIL [$status] GET  /$endpoint -> $(cat /tmp/resp_list.json)"
    FAIL=1
  fi
}

extract_id() {
  python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
}

test_create "breath-sessions" '{"entry_date":"2026-07-01"}'
test_create "workout-sessions" '{"entry_date":"2026-07-01","session_type":"swim"}'
test_create "body-metrics" '{"entry_date":"2026-07-01","weight_kg":100}'
test_create "meal-entries" '{"entry_date":"2026-07-01","meal_slot":"lunch"}'
test_create "water-intake" '{"entry_date":"2026-07-01","liters":0.5}'
test_create "languages" '{"name":"TestLang_XYZ"}'

# language-activity needs a REAL language_id (FK constraint) —
# create a language first, then reference its actual id.
LANG_ID=$(curl -s -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -X POST "$BASE_URL/languages" -d '{"name":"TestLang_ForActivity_XYZ"}' | extract_id)
test_create "language-activity" "{\"language_id\":\"$LANG_ID\",\"entry_date\":\"2026-07-01\",\"activity_type\":\"anki\"}"

test_create "work-log" '{"entry_date":"2026-07-01"}'
test_create "engineering-activity" '{"entry_date":"2026-07-01","activity_type":"leetcode"}'
test_create "hobby-sessions" '{"entry_date":"2026-07-01","hobby_type":"morse"}'
test_create "roadmap/domains" '{"name":"TestDomain_XYZ"}'

# roadmap/phases and roadmap/milestones both need a REAL domain_id
# (NOT NULL REFERENCES constraint) — create a domain first.
DOMAIN_ID=$(curl -s -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -X POST "$BASE_URL/roadmap/domains" -d '{"name":"TestDomain_ForPhase_XYZ"}' | extract_id)
test_create "roadmap/phases" "{\"domain_id\":\"$DOMAIN_ID\",\"name\":\"TestPhase_XYZ\"}"
test_create "roadmap/milestones" "{\"domain_id\":\"$DOMAIN_ID\",\"name\":\"TestMilestone_XYZ\"}"

test_create "focus-sessions" '{"entry_date":"2026-07-01","started_at":"2026-07-01T10:00:00Z"}'

echo ""
if [ "$FAIL" == "0" ]; then
  echo "=== ALL CREATE ENDPOINTS PASSED ==="
else
  echo "=== SOME ENDPOINTS FAILED — see above ==="
fi

# GET /list for every module — run after all creates above, so there's
# at least one real row per table to actually list.
echo ""
echo "=== Testing GET (list) on every module ==="
test_list "breath-sessions"
test_list "workout-sessions"
test_list "body-metrics"
test_list "meal-entries"
test_list "water-intake"
test_list "languages"
test_list "language-activity"
test_list "work-log"
test_list "engineering-activity"
test_list "hobby-sessions"
test_list "roadmap/domains"
test_list "roadmap/phases"
test_list "roadmap/milestones"
test_list "focus-sessions"

# Also explicitly verify the FK constraint itself is enforced (negative
# test) — send a bogus language_id and confirm it's correctly REJECTED,
# not silently accepted. A silently-accepted bad FK would itself be a bug.
echo ""
echo "=== Negative test: confirm FK constraint rejects a bogus language_id ==="
status=$(curl -s -o /tmp/resp_body.json -w "%{http_code}" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -X POST "$BASE_URL/language-activity" \
  -d '{"language_id":"this-id-does-not-exist","entry_date":"2026-07-01","activity_type":"anki"}')
if [ "$status" == "500" ] && grep -q "FOREIGN KEY constraint failed" /tmp/resp_body.json; then
  echo "OK   FK constraint correctly rejected invalid language_id"
else
  echo "FAIL Expected FK rejection, got [$status] $(cat /tmp/resp_body.json)"
  FAIL=1
fi

echo ""
if [ "$FAIL" == "0" ]; then
  echo "=== FULL SUITE PASSED (creates + lists + FK negative test) ==="
  exit 0
else
  echo "=== FULL SUITE HAS FAILURES — see above ==="
  exit 1
fi

