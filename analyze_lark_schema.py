import requests, json, urllib.parse

app_id = "cli_a79ddc7fa8f8d010"
app_secret = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"

res = requests.post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    json={"app_id": app_id, "app_secret": app_secret})
token = res.json().get("tenant_access_token")
headers = {"Authorization": f"Bearer {token}"}

tables = {
    "agents":     "tblNAYG4BefGcJEv",
    "summary":    "tblNhFMClo0Oih3H",
    "orders":     "tbl3fyDEBbVkpmiq",
    "candidates": "tblfz2yYviPS6dBp",
}

for name, table_id in tables.items():
    url = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/{table_id}/fields"
    r = requests.get(url, headers=headers)
    fields = r.json().get("data", {}).get("items", [])
    print(f"\n=== {name.upper()} ({table_id}) ===")
    for f in fields:
        print(f"  {f['field_name']:35} | type: {f['type']}")
