import requests
import urllib.parse
import json

app_id = "cli_a79ddc7fa8f8d010"
app_secret = "V8DaC5mUwBdDcJcYo7q7mcpJobjgk3C6"

res = requests.post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", json={
    "app_id": app_id,
    "app_secret": app_secret
})
token = res.json().get("tenant_access_token")

order_id = "VERA 42026"

# test exactly equal
try: 
    filter_str = f'CurrentValue.[Input_ID_DonHang]="{order_id}"'
    encoded_filter = urllib.parse.quote(filter_str)
    url_cand = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblfz2yYviPS6dBp/records?filter={encoded_filter}"
    res_cand = requests.get(url_cand, headers={"Authorization": f"Bearer {token}"})
    print("Exact Match:", res_cand.json().get("data", {}).get("total"))
except: pass

# test contains
try: 
    filter_str = f'CurrentValue.[Input_ID_DonHang].contains("{order_id}")'
    encoded_filter = urllib.parse.quote(filter_str)
    url_cand = f"https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblfz2yYviPS6dBp/records?filter={encoded_filter}"
    res_cand = requests.get(url_cand, headers={"Authorization": f"Bearer {token}"})
    print("Contains:", res_cand.json().get("data", {}).get("total"))
except: pass
