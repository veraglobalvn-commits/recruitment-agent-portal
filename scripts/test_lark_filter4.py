import requests
import json

app_id = "cli_a79ddc7fa8f8d010"
app_secret = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
res = requests.post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", json={"app_id": app_id,"app_secret": app_secret})
token = res.json().get("tenant_access_token")

url = "https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblfz2yYviPS6dBp/records?page_size=1"
res = requests.get(url, headers={"Authorization": f"Bearer {token}"})
print(json.dumps(res.json(), indent=2))
