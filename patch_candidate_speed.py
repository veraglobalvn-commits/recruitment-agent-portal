import json

file_path = "n8n/[Portal API] Get Candidates by Order.json"
with open(file_path, "r") as f:
    data = json.load(f)

for node in data["nodes"]:
    if node["name"] == "Lấy Tất Cả Ứng Viên":
        node["parameters"]["url"] = "=https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblfz2yYviPS6dBp/records?filter={{ encodeURIComponent(`CurrentValue.[Input_ID_DonHang]="${$('Webhook').first().json.body.order_id}"`) }}"

with open(file_path, "w") as f:
    json.dump(data, f, indent=2)

print("Candidate Data patched for ultra-fast loading!")
