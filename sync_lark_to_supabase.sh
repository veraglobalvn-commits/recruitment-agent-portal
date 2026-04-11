#!/bin/bash
set -e

SUPABASE_URL="https://fpesidoqwxyyutgvalsp.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8"
LARK_APP_ID="cli_a79ddc7fa8f8d010"
LARK_APP_SECRET="V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
BITABLE_ID="CI8CwHwNuinVHskMDQAlN6Elgyf"

echo "=== Step 1: Get Lark Token ==="
LARK_TOKEN=$(curl -s -X POST "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$LARK_APP_ID\",\"app_secret\":\"$LARK_APP_SECRET\"}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['tenant_access_token'])")
echo "Token: ${LARK_TOKEN:0:20}..."

echo "=== Step 2: Sync Agents ==="
AGENTS_RAW=$(curl -s "https://open.larksuite.com/open-apis/bitable/v1/apps/$BITABLE_ID/tables/tblNAYG4BefGcJEv/records" \
  -H "Authorization: Bearer $LARK_TOKEN")

echo "$AGENTS_RAW" | python3 << 'EOF'
import sys, json, urllib.request, urllib.parse

SUPABASE_URL = "https://fpesidoqwxyyutgvalsp.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8"

def getText(val):
    if not val: return None
    if isinstance(val, str): return val
    if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict): return val[0].get('text')
    return None

data = json.load(sys.stdin)
items = data.get('data', {}).get('items', [])
rows = []
for item in items:
    f = item['fields']
    rows.append({
        'id': getText(f.get('ID_AgentBD')),
        'supabase_uid': f.get('Supabase_ID') or None,
        'full_name': f.get('Ten_AgentBD') or None,
        'short_name': f.get('Short Name Agent BD') or None,
    })
rows = [r for r in rows if r['id']]
print(f"Upserting {len(rows)} agents...")
body = json.dumps(rows).encode()
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/agents",
    data=body,
    headers={
        'Authorization': f'Bearer {SERVICE_KEY}',
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    },
    method='POST'
)
try:
    resp = urllib.request.urlopen(req)
    print(f"Agents sync OK: {resp.status}")
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'read'): print(e.read().decode())
EOF

echo "=== Step 3: Sync Summary Stats ==="
SUMMARY_RAW=$(curl -s "https://open.larksuite.com/open-apis/bitable/v1/apps/$BITABLE_ID/tables/tblNhFMClo0Oih3H/records" \
  -H "Authorization: Bearer $LARK_TOKEN")

echo "$SUMMARY_RAW" | python3 << 'EOF'
import sys, json, urllib.request

SUPABASE_URL = "https://fpesidoqwxyyutgvalsp.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8"

data = json.load(sys.stdin)
items = data.get('data', {}).get('items', [])
rows = []
for item in items:
    f = item['fields']
    agent_id = f.get('ID_AgentBD')
    if isinstance(agent_id, list) and len(agent_id) > 0: agent_id = agent_id[0].get('text')
    if not agent_id: continue
    rows.append({
        'agent_id': agent_id,
        'tong_lao_dong': f.get('Tong_Lao_Dong'),
        'trung_tuyen': f.get('Trung_Tuyen'),
        'con_thieu': f.get('Con_Thieu'),
        'tong_tien_can_tt': f.get('Tong_Tien_Can_TT'),
        'tong_tien_da_tt': f.get('Tong_Tien_Da_TT'),
        'tong_tien_chua_tt': f.get('Tong_Tien_Chua_TT'),
    })
print(f"Upserting {len(rows)} stats rows...")
body = json.dumps(rows).encode()
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/recruitment_stats",
    data=body,
    headers={
        'Authorization': f'Bearer {SERVICE_KEY}',
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    },
    method='POST'
)
try:
    resp = urllib.request.urlopen(req)
    print(f"Stats sync OK: {resp.status}")
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'read'): print(e.read().decode())
EOF

echo "=== Step 4: Sync Orders ==="
ORDERS_RAW=$(curl -s "https://open.larksuite.com/open-apis/bitable/v1/apps/$BITABLE_ID/tables/tbl3fyDEBbVkpmiq/records" \
  -H "Authorization: Bearer $LARK_TOKEN")

echo "$ORDERS_RAW" | python3 << 'EOF'
import sys, json, urllib.request

SUPABASE_URL = "https://fpesidoqwxyyutgvalsp.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8"

def getText(val):
    if not val: return None
    if isinstance(val, str): return val
    if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict): return val[0].get('text')
    return None

def getLink(val):
    if not val: return None
    if isinstance(val, dict): return val.get('link')
    if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict): return val[0].get('link')
    return None

data = json.load(sys.stdin)
items = data.get('data', {}).get('items', [])
rows = []
for item in items:
    f = item['fields']
    order_id = getText(f.get('ID_DonHang'))
    agent_id_raw = f.get('ID_AgentBD')
    agent_id = None
    if isinstance(agent_id_raw, list) and len(agent_id_raw) > 0:
        agent_id = agent_id_raw[0].get('text')
    if not order_id or not agent_id: continue
    rows.append({
        'id': order_id,
        'agent_id': agent_id,
        'company_name': getText(f.get('ShortComapnyName')),
        'total_labor': f.get('TongSoLaoDong'),
        'labor_missing': getText(f.get('SoLaoDong_ConThieu')),
        'status': getText(f.get('TrangThai_TuyenDung')),
        'url_demand_letter': getLink(f.get('URL_DL')),
    })
print(f"Upserting {len(rows)} orders...")
body = json.dumps(rows).encode()
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/orders",
    data=body,
    headers={
        'Authorization': f'Bearer {SERVICE_KEY}',
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    },
    method='POST'
)
try:
    resp = urllib.request.urlopen(req)
    print(f"Orders sync OK: {resp.status}")
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'read'): print(e.read().decode())
EOF

echo "=== Step 5: Sync Candidates ==="
CAND_RAW=$(curl -s "https://open.larksuite.com/open-apis/bitable/v1/apps/$BITABLE_ID/tables/tblfz2yYviPS6dBp/records" \
  -H "Authorization: Bearer $LARK_TOKEN")

echo "$CAND_RAW" | python3 << 'EOF'
import sys, json, urllib.request

SUPABASE_URL = "https://fpesidoqwxyyutgvalsp.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8"

def getText(val):
    if not val: return None
    if isinstance(val, str): return val
    if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict): return val[0].get('text')
    return None

def getLink(val):
    if not val: return None
    if isinstance(val, list) and len(val) > 0:
        item = val[0]
        if 'url' in item: return item['url']
        if 'link' in item: return item['link']
        if 'tmp_url' in item: return item['tmp_url']
    if isinstance(val, dict): return val.get('link') or val.get('url')
    return None

data = json.load(sys.stdin)
items = data.get('data', {}).get('items', [])
rows = []
for item in items:
    f = item['fields']
    id_ld = getText(f.get('ID_LD'))
    agent_id = f.get('ID_AgentBD') if isinstance(f.get('ID_AgentBD'), str) else None
    order_id = f.get('Input_ID_DonHang') if isinstance(f.get('Input_ID_DonHang'), str) else None
    if not id_ld: continue
    
    video_link = None
    vl = f.get('Video_Link')
    if isinstance(vl, dict): video_link = vl.get('link')
    elif isinstance(vl, str): video_link = vl

    rows.append({
        'id_ld': id_ld,
        'agent_id': agent_id,
        'order_id': order_id,
        'full_name': f.get('Full Name'),
        'pp_no': f.get('PP No'),
        'dob': f.get('DOB'),
        'pp_doi': f.get('PP DOI'),
        'pp_doe': f.get('PP DOE'),
        'pob': f.get('POB'),
        'address': f.get('Address'),
        'phone': f.get('Phone Number'),
        'visa_status': getText(f.get('TT Visa')),
        'passport_link': getLink(f.get('Upload_Passport')),
        'video_link': video_link,
        'interview_status': getText(f.get('Passed/Failed')),
    })
print(f"Upserting {len(rows)} candidates...")
body = json.dumps(rows).encode()
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/candidates",
    data=body,
    headers={
        'Authorization': f'Bearer {SERVICE_KEY}',
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    },
    method='POST'
)
try:
    resp = urllib.request.urlopen(req)
    print(f"Candidates sync OK: {resp.status}")
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'read'): print(e.read().decode())
EOF

echo ""
echo "=== Verify counts in Supabase ==="
curl -s "https://fpesidoqwxyyutgvalsp.supabase.co/rest/v1/agents?select=count" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8" \
  -H "Prefer: count=exact" -I 2>&1 | grep -i "content-range"

for TABLE in agents recruitment_stats orders candidates; do
  COUNT=$(curl -s "https://fpesidoqwxyyutgvalsp.supabase.co/rest/v1/$TABLE?select=*" \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8" \
    -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'error')")
  echo "  $TABLE: $COUNT rows"
done
