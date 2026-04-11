TOKEN=$(curl -s -X POST "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"cli_a79ddc7fa8f8d010","app_secret":"V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['tenant_access_token'])")

for TABLE in "agents:tblNAYG4BefGcJEv" "summary:tblNhFMClo0Oih3H" "orders:tbl3fyDEBbVkpmiq" "candidates:tblfz2yYviPS6dBp"; do
  NAME=${TABLE%:*}; ID=${TABLE#*:}
  echo -e "\n=== $NAME ($ID) ==="
  curl -s "https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/$ID/fields" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; [print(f\"  {f['field_name']:35} | type:{f['type']}\") for f in json.load(sys.stdin).get('data',{}).get('items',[])]"
done
