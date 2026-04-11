import time
import requests
import urllib.parse
import json

app_id = "cli_a79ddc7fa8f8d010"
app_secret = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
uid = "862ce0b0-fcea-4187-8950-e7fb8a912b84"

start = time.time()
res = requests.post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", json={"app_id": app_id,"app_secret": app_secret})
token = res.json().get("tenant_access_token")
print(f"Token latency: {time.time() - start:.3f}s")

# 1 row
start = time.time()
filter_str = f'CurrentValue.[Supabase_ID]="{uid}"'
encoded_filter = urllib.parse.quote(filter_str)
url1 = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNAYG4BefGcJEv/records?filter={encoded_filter}"
requests.get(url1, headers={"Authorization": f"Bearer {token}"})
print(f"Agent latency (Filter): {time.time() - start:.3f}s")

# All rows
start = time.time()
url2 = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNAYG4BefGcJEv/records"
requests.get(url2, headers={"Authorization": f"Bearer {token}"})
print(f"Agent latency (ALL): {time.time() - start:.3f}s")

