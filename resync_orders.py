import urllib.request, json

SUPABASE_URL = "https://fpesidoqwxyyutgvalsp.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8"
LARK_APP_ID = "cli_a79ddc7fa8f8d010"; LARK_APP_SECRET = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
BITABLE_ID = "CI8CwHwNuinVHskMDQAlN6Elgyf"

def lark_req(url, token=None, method="GET", body=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r: return json.loads(r.read())

def getText(val):
    if not val: return None
    if isinstance(val, str): return val
    if isinstance(val, list) and val and isinstance(val[0], dict): return val[0].get("text")
    return None

def getLink(val):
    if not val: return None
    if isinstance(val, dict): return val.get("link") or val.get("url")
    if isinstance(val, list) and val:
        return val[0].get("link") or val[0].get("url")
    return None

token_res = lark_req("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", method="POST", body={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET})
token = token_res["tenant_access_token"]

items = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/tbl3fyDEBbVkpmiq/records?page_size=500", token).get("data", {}).get("items", [])

rows = []
for item in items:
    f = item["fields"]
    order_id = getText(f.get("ID_DonHang"))
    agent_id_raw = f.get("ID_AgentBD")
    agent_id = None
    if isinstance(agent_id_raw, list) and agent_id_raw: agent_id = agent_id_raw[0].get("text")
    if not order_id or not agent_id: continue
    missing = f.get("SoLaoDong_ConThieu")
    if isinstance(missing, (str, list)): missing = None
    salary = f.get("TotalMonthlySalaryUSD")
    rows.append({
        "id": order_id, "agent_id": agent_id,
        "company_name": getText(f.get("ShortComapnyName")),
        "total_labor": f.get("TongSoLaoDong"),
        "labor_missing": missing,
        "status": getText(f.get("TrangThai_TuyenDung")),
        "url_demand_letter": getLink(f.get("URL_DL")),
        "job_type": getText(f.get("ViTriTuyen")) or getText(f.get("EN_ViTriTuyen")),
        "salary_usd": salary if isinstance(salary, (int, float)) else None,
        "url_order": getLink(f.get("URL_DonHang")),
    })

body = json.dumps(rows).encode()
req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/orders", data=body,
    headers={"Authorization": f"Bearer {SERVICE_KEY}", "apikey": SERVICE_KEY,
             "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}, method="POST")
with urllib.request.urlopen(req) as r:
    print(f"Orders re-synced: {len(rows)} rows — HTTP {r.status}")
