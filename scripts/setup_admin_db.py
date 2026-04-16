#!/usr/bin/env python3
import subprocess, json, urllib.request

PAT = "sbp_bfdf6d03f10cef2934f914f0e42aa3e978fa083c"
PROJECT = "fpesidoqwxyyutgvalsp"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZXNpZG9xd3h5eXV0Z3ZhbHNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NDkzNywiZXhwIjoyMDkxMjUwOTM3fQ.X9s9a_rSNefhdd7UEsTulNB1xct4JK_QZe2UzIubPg8"
SUPABASE_URL = "https://fpesidoqwxyyutgvalsp.supabase.co"

def db(sql):
    payload = json.dumps({"query": sql})
    result = subprocess.run([
        "curl", "-s", "-X", "POST",
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        "-H", f"Authorization: Bearer {PAT}",
        "-H", "Content-Type: application/json",
        "--data-raw", payload
    ], capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except:
        return {"raw": result.stdout[:200]}

def supabase_upsert(table, rows):
    if not rows: return "no rows"
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}", data=body,
        headers={"Authorization": f"Bearer {SERVICE_KEY}", "apikey": SERVICE_KEY,
                 "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as r: return f"HTTP {r.status}"
    except urllib.error.HTTPError as e: return f"ERROR {e.code}: {e.read().decode()[:200]}"

statements = [
    ("""CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lark_record_id TEXT UNIQUE,
  id_congty TEXT UNIQUE,
  company_name TEXT NOT NULL,
  short_name TEXT,
  tax_code TEXT,
  business_reg_authority TEXT,
  business_reg_date TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  legal_rep TEXT,
  legal_rep_title TEXT,
  business_type TEXT,
  industry TEXT,
  url_profile TEXT,
  business_reg_img TEXT,
  en_company_name TEXT,
  en_legal_rep TEXT,
  en_address TEXT,
  en_title TEXT,
  en_industry TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
)""", "Create companies table"),
    ("ALTER TABLE agents ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent'", "agents.role"),
    ("ALTER TABLE agents ADD COLUMN IF NOT EXISTS lark_record_id TEXT", "agents.lark_record_id"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS lark_record_id TEXT", "orders.lark_record_id"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_id UUID", "orders.company_id"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS working_hours NUMERIC", "orders.working_hours"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS salary_vnd NUMERIC", "orders.salary_vnd"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS probation_months NUMERIC", "orders.probation_months"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS probation_salary TEXT", "orders.probation_salary"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS meal TEXT", "orders.meal"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS meal_en TEXT", "orders.meal_en"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS contract_date TIMESTAMPTZ", "orders.contract_date"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS legal_status TEXT", "orders.legal_status"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status_vn TEXT", "orders.payment_status_vn"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status_bd TEXT", "orders.payment_status_bd"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee_per_person NUMERIC", "orders.service_fee_per_person"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_fee_vn NUMERIC", "orders.total_fee_vn"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS url_contract TEXT", "orders.url_contract"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS job_type_en TEXT", "orders.job_type_en"),
    ("ALTER TABLE orders ADD COLUMN IF NOT EXISTS en_company_name TEXT", "orders.en_company_name"),
    ("ALTER TABLE companies ENABLE ROW LEVEL SECURITY", "RLS companies"),
    ("DROP POLICY IF EXISTS admin_read_companies ON companies", "drop policy companies"),
    ("""CREATE POLICY admin_read_companies ON companies FOR ALL USING (auth.uid() IN (SELECT supabase_uid FROM agents WHERE role = 'admin'))""", "policy companies"),
    ("DROP POLICY IF EXISTS admin_all_candidates ON candidates", "drop policy candidates"),
    ("""CREATE POLICY admin_all_candidates ON candidates FOR SELECT USING (auth.uid() IN (SELECT supabase_uid FROM agents WHERE role = 'admin'))""", "policy candidates"),
    ("DROP POLICY IF EXISTS admin_all_orders ON orders", "drop policy orders"),
    ("""CREATE POLICY admin_all_orders ON orders FOR SELECT USING (auth.uid() IN (SELECT supabase_uid FROM agents WHERE role = 'admin'))""", "policy orders"),
    ("DROP POLICY IF EXISTS admin_read_agents ON agents", "drop policy agents"),
    ("""CREATE POLICY admin_read_agents ON agents FOR SELECT USING (auth.uid() IN (SELECT supabase_uid FROM agents WHERE role = 'admin'))""", "policy agents"),
    ("""SELECT column_name, table_name FROM information_schema.columns WHERE table_name IN ('companies','agents','orders') AND column_name IN ('role','lark_record_id','company_id','total_fee_vn','id_congty','tax_code') ORDER BY table_name, column_name""", "VERIFY"),
]

print("Running DB setup via curl...")
for sql, label in statements:
    result = db(sql)
    if isinstance(result, list) and label == "VERIFY":
        print(f"\n✅ VERIFY — columns found:")
        for row in result: print(f"   {row['table_name']}.{row['column_name']}")
    elif isinstance(result, dict) and "error" in result:
        print(f"  ❌ {label}: {result['error'][:80]}")
    else:
        print(f"  ✅ {label}")

# Sync companies from Lark
print("\nSyncing companies from Lark...")
LARK_APP_ID = "cli_a79ddc7fa8f8d010"
LARK_APP_SECRET = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
BITABLE_ID = "CI8CwHwNuinVHskMDQAlN6Elgyf"

def lark_req(url, token=None, method="GET", body=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(r) as resp: return json.loads(resp.read())

t = lark_req("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
             method="POST", body={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET})["tenant_access_token"]

def getText(v):
    if not v: return None
    if isinstance(v, str): return v
    if isinstance(v, list) and v and isinstance(v[0], dict): return v[0].get("text")
    return None
def getLink(v):
    if not v: return None
    if isinstance(v, dict): return v.get("link") or v.get("url")
    return None
def getNum(v): return v if isinstance(v, (int, float)) else None

# Companies
c_items = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/tblYLlsr8Db5Q5V9/records?page_size=100", t).get("data",{}).get("items",[])
c_rows = []
for item in c_items:
    f = item["fields"]
    if not f.get("TenCongTy"): continue
    c_rows.append({
        "lark_record_id": item["record_id"],
        "id_congty": getText(f.get("ID_CongTy")),
        "company_name": f.get("TenCongTy"),
        "short_name": f.get("ShortCompanyName"),
        "tax_code": f.get("MST"),
        "business_reg_authority": f.get("CoQuanDKKD"),
        "business_reg_date": f.get("ThoiGianDKKD"),
        "address": f.get("DiaChiCongTy"),
        "phone": f.get("SDTCongTy"),
        "email": f.get("EmailCongTy") if isinstance(f.get("EmailCongTy"), str) else None,
        "legal_rep": f.get("NguoiDaiDien"),
        "legal_rep_title": f.get("ChucVu"),
        "business_type": f.get("LoaiHinhDN") if isinstance(f.get("LoaiHinhDN"), str) else None,
        "industry": f.get("NganhNghe"),
        "url_profile": getLink(f.get("URL_CompanyProfile")),
        "en_company_name": f.get("EN_TenCongTy"),
        "en_legal_rep": f.get("EN_NguoiDaiDien"),
        "en_address": f.get("EN_DiaChiCongTy"),
        "en_title": f.get("EN_ChucVu"),
        "en_industry": f.get("EN_NganhNghe"),
    })
print(f"  {len(c_rows)} companies → {supabase_upsert('companies', c_rows)}")

# Orders full resync
o_items = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/tbl3fyDEBbVkpmiq/records?page_size=500", t).get("data",{}).get("items",[])
o_rows = []
for item in o_items:
    f = item["fields"]
    order_id = getText(f.get("ID_DonHang"))
    if not order_id: continue
    agent_id = None
    if isinstance(f.get("ID_AgentBD"), list) and f["ID_AgentBD"]: agent_id = f["ID_AgentBD"][0].get("text")
    o_rows.append({
        "id": order_id, "agent_id": agent_id,
        "lark_record_id": item["record_id"],
        "company_name": getText(f.get("ShortComapnyName")),
        "total_labor": getNum(f.get("TongSoLaoDongFinal")) or getNum(f.get("TongSoLaoDong")),
        "status": getText(f.get("TrangThai_TuyenDung")),
        "url_demand_letter": getLink(f.get("URL_DL")),
        "job_type": getText(f.get("ViTriTuyen")),
        "job_type_en": f.get("EN_ViTriTuyen"),
        "salary_usd": getNum(f.get("TotalMonthlySalaryUSD")),
        "salary_vnd": getNum(f.get("TotalMonthlySalaryVND")),
        "working_hours": getNum(f.get("WorkingHours")),
        "probation_months": getNum(f.get("ThoiGianThuViec")),
        "probation_salary": f.get("LuongThuViec"),
        "meal": getText(f.get("HoTroBuaAn")),
        "meal_en": getText(f.get("EN_HoTroBuaAn")),
        "legal_status": getText(f.get("Trang Thai Phap Ly")),
        "payment_status_vn": getText(f.get("Trang Thai TT VN")),
        "payment_status_bd": getText(f.get("Trang Thai TT BD")),
        "service_fee_per_person": getNum(f.get("PhiDVVN_Nguoi")),
        "total_fee_vn": getNum(f.get("TongPhiDVVN")),
        "url_contract": getLink(f.get("URL_HĐ")),
        "url_order": getLink(f.get("URL_DonHang")),
        "en_company_name": f.get("EN_TenCongTy"),
    })
o_rows = list({r["id"]: r for r in o_rows if r["id"]}.values())
print(f"  {len(o_rows)} orders → {supabase_upsert('orders', o_rows)}")

oa_rows = []
for o in o_rows:
    agent_id = o.get("agent_id")
    if agent_id and o.get("id"):
        oa_rows.append({
            "order_id": o["id"],
            "agent_id": agent_id,
            "assigned_labor_number": int(float(o.get("total_labor", 0) or 0)),
        })
if oa_rows:
    print(f"  {len(oa_rows)} order_agents → {supabase_upsert('order_agents', oa_rows)}")

print("\n✅ Done!")
