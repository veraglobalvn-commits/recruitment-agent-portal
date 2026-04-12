#!/usr/bin/env python3
import urllib.request, json

LARK_APP_ID = "cli_a79ddc7fa8f8d010"
LARK_APP_SECRET = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
BITABLE_ID = "CI8CwHwNuinVHskMDQAlN6Elgyf"

def lark_req(url, token=None, method="GET", body=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r: return json.loads(r.read())

r = lark_req("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
             method="POST", body={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET})
token = r["tenant_access_token"]

tables_res = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables", token)
tables = tables_res.get("data", {}).get("items", [])
print(f"\nTOTAL: {len(tables)} tables\n")
for t in tables:
    print(f"  {t['table_id']}  {t['name']}")

# Get fields for the company/client table (tblYLlsr8Db5Q5V9 - seen in orders relation)
print("\n\n=== COMPANY TABLE (tblYLlsr8Db5Q5V9) ===")
fields_res = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/tblYLlsr8Db5Q5V9/fields", token)
fields = fields_res.get("data",{}).get("items",[])
TYPE_MAP = {1:"Text",2:"Number",3:"Select",4:"MultiSelect",5:"Date",7:"Checkbox",11:"Person",13:"Phone",15:"URL",17:"Attachment",18:"SingleLink",19:"Lookup",20:"Formula",21:"DualLink",3001:"Button"}
for f in fields:
    ftype = TYPE_MAP.get(f["type"], f"type:{f['type']}")
    print(f"  {f['field_name']:40} | {ftype}")

sample = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/tblYLlsr8Db5Q5V9/records?page_size=1", token)
items = sample.get("data",{}).get("items",[])
if items:
    print("\n  SAMPLE RECORD:")
    for k, v in items[0]["fields"].items():
        print(f"    {k}: {str(v)[:100]}")

# Also get fields for Data_AgentBD table
print("\n\n=== AGENT TABLE (tblNAYG4BefGcJEv) ===")
fields_res2 = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/tblNAYG4BefGcJEv/fields", token)
fields2 = fields_res2.get("data",{}).get("items",[])
for f in fields2:
    ftype = TYPE_MAP.get(f["type"], f"type:{f['type']}")
    print(f"  {f['field_name']:40} | {ftype}")

sample2 = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/tblNAYG4BefGcJEv/records?page_size=1", token)
items2 = sample2.get("data",{}).get("items",[])
if items2:
    print("\n  SAMPLE RECORD:")
    for k, v in items2[0]["fields"].items():
        print(f"    {k}: {str(v)[:100]}")
