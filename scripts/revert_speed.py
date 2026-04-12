import json

def revert_dashboard():
    with open("n8n/[Portal API] Get Dashboard Data.json", "r") as f:
        data = json.load(f)
    for node in data["nodes"]:
        if node["name"] == "Lấy Agents":
            node["parameters"]["url"] = "=https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNAYG4BefGcJEv/records"
        elif node["name"] == "Lấy Summary":
            node["parameters"]["url"] = "=https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNhFMClo0Oih3H/records"
        elif node["name"] == "Lấy Đơn hàng":
            node["parameters"]["url"] = "=https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tbl3fyDEBbVkpmiq/records"
    with open("n8n/[Portal API] Get Dashboard Data.json", "w") as f:
        json.dump(data, f, indent=2)

def revert_candidates():
    with open("n8n/[Portal API] Get Candidates by Order.json", "r") as f:
        data = json.load(f)
    for node in data["nodes"]:
        if node["name"] == "Lấy Tất Cả Ứng Viên":
            node["parameters"]["url"] = "=https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblfz2yYviPS6dBp/records"
    with open("n8n/[Portal API] Get Candidates by Order.json", "w") as f:
        json.dump(data, f, indent=2)

revert_dashboard()
revert_candidates()
print("Reverted to raw get lists due to Bitable engine latency.")
