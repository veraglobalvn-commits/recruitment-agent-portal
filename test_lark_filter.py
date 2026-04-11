import requests
import urllib.parse
import json

app_id = "cli_a79ddc7fa8f8d010"
app_secret = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"
uid = "862ce0b0-fcea-4187-8950-e7fb8a912b84"

# 1. Get Token
res = requests.post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", json={
    "app_id": app_id,
    "app_secret": app_secret
})
token = res.json().get("tenant_access_token")

# 2. Try filter with CurrentValue.[Supabase_ID]
filter_str = f'CurrentValue.[Supabase_ID]="{uid}"'
encoded_filter = urllib.parse.quote(filter_str)
url1 = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNAYG4BefGcJEv/records?filter={encoded_filter}"

res1 = requests.get(url1, headers={"Authorization": f"Bearer {token}"})
print("Result with dot (CurrentValue.[X]):", json.dumps(res1.json(), indent=2))

# 3. Try filter with CurrentValue-[Supabase_ID] (If first fails)
if res1.json().get("code") != 0:
    filter_str = f'CurrentValue-[Supabase_ID]="{uid}"'
    encoded_filter = urllib.parse.quote(filter_str)
    url2 = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNAYG4BefGcJEv/records?filter={encoded_filter}"
    res2 = requests.get(url2, headers={"Authorization": f"Bearer {token}"})
    print("\nResult with hyphen (CurrentValue-[X]):", json.dumps(res2.json(), indent=2))

