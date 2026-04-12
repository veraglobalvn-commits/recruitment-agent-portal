import requests
import urllib.parse
import json

app_id = "cli_a79ddc7fa8f8d010"
app_secret = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
agent_bd = "GTA 2026"

res = requests.post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", json={
    "app_id": app_id,
    "app_secret": app_secret
})
token = res.json().get("tenant_access_token")

filter_str = f'CurrentValue.[ID_AgentBD]="{agent_bd}"'
encoded_filter = urllib.parse.quote(filter_str)

url_summary = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNhFMClo0Oih3H/records?filter={encoded_filter}"
res_summary = requests.get(url_summary, headers={"Authorization": f"Bearer {token}"})

url_orders = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tbl3fyDEBbVkpmiq/records?filter={encoded_filter}"
res_orders = requests.get(url_orders, headers={"Authorization": f"Bearer {token}"})

print("Summary Total:", res_summary.json().get("data", {}).get("total"))
print("Orders Total:", res_orders.json().get("data", {}).get("total"))

