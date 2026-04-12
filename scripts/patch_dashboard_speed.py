import json

file_path = "n8n/[Portal API] Get Dashboard Data.json"
with open(file_path, "r") as f:
    data = json.load(f)

for node in data["nodes"]:
    if node["name"] == "Lấy Agents":
        node["parameters"]["url"] = "=https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNAYG4BefGcJEv/records?filter={{ encodeURIComponent(`CurrentValue.[Supabase_ID]=\"${$('Webhook').first().json.body.supabase_user_id}\"`) }}"
    elif node["name"] == "Lấy Summary":
        node["parameters"]["url"] = "=https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNhFMClo0Oih3H/records?filter={{ encodeURIComponent(`CurrentValue.[ID_AgentBD]=\"${$('Lấy Agents').first().json.data.items[0]?.fields?.ID_AgentBD[0]?.text || ''}\"`) }}"
    elif node["name"] == "Lấy Đơn hàng":
        node["parameters"]["url"] = "=https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tbl3fyDEBbVkpmiq/records?filter={{ encodeURIComponent(`CurrentValue.[ID_AgentBD]=\"${$('Lấy Agents').first().json.data.items[0]?.fields?.ID_AgentBD[0]?.text || ''}\"`) }}"

with open(file_path, "w") as f:
    json.dump(data, f, indent=2)

print("Dashboard Data patched for ultra-fast loading!")
