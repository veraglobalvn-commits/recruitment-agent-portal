#!/usr/bin/env python3
import urllib.request, urllib.parse, json, sys

SUPABASE_URL = "https://fpesidoqwxyyutgvalsp.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8"
LARK_APP_ID = "cli_a79ddc7fa8f8d010"
LARK_APP_SECRET = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
BITABLE_ID = "CI8CwHwNuinVHskMDQAlN6Elgyf"

def lark_request(url, token=None, method="GET", body=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def supabase_upsert(table, rows):
    if not rows:
        print(f"  No rows for {table}, skipping.")
        return
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}",
        data=body,
        headers={
            "Authorization": f"Bearer {SERVICE_KEY}",
            "apikey": SERVICE_KEY,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as r:
            print(f"  {table}: upserted {len(rows)} rows — HTTP {r.status}")
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  {table} ERROR: {e.code} — {err}")

def getText(val):
    if not val: return None
    if isinstance(val, str): return val
    if isinstance(val, list) and val and isinstance(val[0], dict): return val[0].get("text")
    return None

def getLink(val):
    if not val: return None
    if isinstance(val, dict): return val.get("link") or val.get("url")
    if isinstance(val, list) and val:
        item = val[0]
        return item.get("link") or item.get("url") or item.get("tmp_url")
    return None

def lark_get_all(table_id, token):
    url = f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/{table_id}/records?page_size=500"
    r = lark_request(url, token)
    return r.get("data", {}).get("items", [])

# ── STEP 1: Lark Token ──
print("Step 1: Getting Lark token...")
res = lark_request(
    "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    method="POST",
    body={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET}
)
token = res["tenant_access_token"]
print(f"  Token: {token[:20]}...")

# ── STEP 2: Sync Agents ──
print("\nStep 2: Syncing Agents...")
items = lark_get_all("tblNAYG4BefGcJEv", token)
rows = []
for item in items:
    f = item["fields"]
    agent_id = getText(f.get("ID_AgentBD"))
    if not agent_id: continue
    rows.append({
        "id": agent_id,
        "supabase_uid": f.get("Supabase_ID") or None,
        "full_name": f.get("Ten_AgentBD") or None,
        "short_name": f.get("Short Name Agent BD") or None,
    })
supabase_upsert("agents", rows)

# ── STEP 3: Sync Stats ──
print("\nStep 3: Syncing Recruitment Stats...")
items = lark_get_all("tblNhFMClo0Oih3H", token)
rows = []
for item in items:
    f = item["fields"]
    agent_id = f.get("ID_AgentBD")
    if isinstance(agent_id, list) and agent_id: agent_id = agent_id[0].get("text")
    if not agent_id: continue
    rows.append({
        "agent_id": agent_id,
        "tong_lao_dong": f.get("Tong_Lao_Dong"),
        "trung_tuyen": f.get("Trung_Tuyen"),
        "con_thieu": f.get("Con_Thieu"),
        "tong_tien_can_tt": f.get("Tong_Tien_Can_TT"),
        "tong_tien_da_tt": f.get("Tong_Tien_Da_TT"),
        "tong_tien_chua_tt": f.get("Tong_Tien_Chua_TT"),
    })
supabase_upsert("recruitment_stats", rows)

# ── STEP 4: Sync Orders ──
print("\nStep 4: Syncing Orders...")
items = lark_get_all("tbl3fyDEBbVkpmiq", token)
rows = []
for item in items:
    f = item["fields"]
    order_id = getText(f.get("ID_DonHang"))
    agent_id_raw = f.get("ID_AgentBD")
    agent_id = None
    if isinstance(agent_id_raw, list) and agent_id_raw:
        agent_id = agent_id_raw[0].get("text")
    if not order_id or not agent_id: continue
    missing = f.get("SoLaoDong_ConThieu")
    if isinstance(missing, str):
        try: missing = float(missing)
        except: missing = None
    elif isinstance(missing, list): missing = None
    rows.append({
        "id": order_id,
        "agent_id": agent_id,
        "company_name": getText(f.get("ShortComapnyName")),
        "total_labor": f.get("TongSoLaoDong"),
        "labor_missing": missing,
        "status": getText(f.get("TrangThai_TuyenDung")),
        "url_demand_letter": getLink(f.get("URL_DL")),
    })
supabase_upsert("orders", rows)

# ── STEP 5: Sync Candidates ──
print("\nStep 5: Syncing Candidates...")
items = lark_get_all("tblfz2yYviPS6dBp", token)
rows = []
for item in items:
    f = item["fields"]
    id_ld = getText(f.get("ID_LD"))
    if not id_ld: continue
    agent_id = f.get("ID_AgentBD") if isinstance(f.get("ID_AgentBD"), str) else None
    order_id = f.get("Input_ID_DonHang") if isinstance(f.get("Input_ID_DonHang"), str) else None
    vl = f.get("Video_Link")
    video_link = None
    if isinstance(vl, dict): video_link = vl.get("link")
    elif isinstance(vl, str): video_link = vl
    rows.append({
        "id_ld": id_ld,
        "agent_id": agent_id,
        "order_id": order_id,
        "full_name": f.get("Full Name"),
        "pp_no": f.get("PP No"),
        "dob": f.get("DOB"),
        "pp_doi": f.get("PP DOI"),
        "pp_doe": f.get("PP DOE"),
        "pob": f.get("POB"),
        "address": f.get("Address"),
        "phone": f.get("Phone Number"),
        "visa_status": getText(f.get("TT Visa")),
        "passport_link": getLink(f.get("Upload_Passport")),
        "video_link": video_link,
        "interview_status": getText(f.get("Passed/Failed")),
    })
supabase_upsert("candidates", list({r["id_ld"]: r for r in rows}.values()))

# ── STEP 6: Verify ──
print("\nStep 6: Verifying row counts...")
col_map = {"agents": "id", "recruitment_stats": "agent_id", "orders": "id", "candidates": "id_ld"}
for table, col in col_map.items():
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?select={col}",
        headers={"Authorization": f"Bearer {SERVICE_KEY}", "apikey": SERVICE_KEY}
    )
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
            print(f"  {table}: {len(data)} rows ✅")
    except Exception as e:
        print(f"  {table}: error — {e}")

print("\n✅ Sync complete!")
