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

# Get token
r = lark_req("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
             method="POST", body={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET})
token = r["tenant_access_token"]

# Get ALL tables in Bitable
tables_res = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables", token)
tables = tables_res.get("data", {}).get("items", [])

print("\n" + "="*60)
print(f"TOTAL TABLES IN BITABLE: {len(tables)}")
print("="*60)
for t in tables:
    print(f"  [{t['table_id']}] {t['name']}")

# Field type map
TYPE_MAP = {
    1:"Text", 2:"Number", 3:"Select", 4:"MultiSelect", 5:"Date", 7:"Checkbox",
    11:"Person", 13:"Phone", 15:"URL", 17:"Attachment", 18:"SingleLink",
    19:"Lookup", 20:"Formula", 21:"DualLink", 3001:"Button"
}

# For each table, get fields AND 1 sample record
for t in tables:
    tid = t["table_id"]
    tname = t["name"]
    print(f"\n\n{'='*60}")
    print(f"TABLE: {tname} ({tid})")
    print("="*60)
    
    # Fields
    fields_res = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/{tid}/fields", token)
    fields = fields_res.get("data", {}).get("items", [])
    
    for f in fields:
        ftype = TYPE_MAP.get(f["type"], f"type:{f['type']}")
        extra = ""
        # Show select options
        if f["type"] in (3, 4):
            opts = f.get("property", {}).get("options", [])
            extra = f" = [{', '.join(o['name'] for o in opts[:8])}]"
        print(f"  {f['field_name']:40} | {ftype}{extra}")

    # Sample record
    sample_res = lark_req(f"https://open.larksuite.com/open-apis/bitable/v1/apps/{BITABLE_ID}/tables/{tid}/records?page_size=1", token)
    sample_items = sample_res.get("data", {}).get("items", [])
    if sample_items:
        print(f"\n  SAMPLE RECORD:")
        for k, v in sample_items[0]["fields"].items():
            val_str = str(v)[:80]
            print(f"    {k}: {val_str}")

