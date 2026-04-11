import json

with open("n8n/[Portal API] Upload Passport.json", "r") as f:
    up_data = json.load(f)

nodes = up_data["nodes"]

# 1. Create 'Lấy Agent ID' node
agent_id_node = {
  "parameters": {
    "url": "https://open.larksuite.com/open-apis/bitable/v1/apps/CI8CwHwNuinVHskMDQAlN6Elgyf/tables/tblNAYG4BefGcJEv/records",
    "sendHeaders": True,
    "headerParameters": {
      "parameters": [
        {
          "name": "Authorization",
          "value": "=Bearer {{ $json.tenant_access_token }}"
        }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [ -750, -240 ],
  "id": "bbb33333-new-agent-http",
  "name": "Lấy Agent ID"
}

# 2. Create 'Tìm Agent' Code Node
find_agent_code_node = {
  "parameters": {
    "jsCode": """const uid = $('Webhook').first().json.body.supabase_user_id;
const agentsData = $('Lấy Agent ID').first().json.data.items || [];
const parsedText = $json.text;

const getText = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && val.length > 0 && val[0].text) return val[0].text;
  return '';
};

let agentId = '';
for (let a of agentsData) {
  if (a.fields.Supabase_ID === uid) {
    agentId = getText(a.fields.ID_AgentBD);
    break;
  }
}

let parsed = {};
try {
  parsed = JSON.parse(parsedText);
} catch (e) {
  parsed = { Full_Name: "", PP_No: "" };
}

return [{
  json: {
    agent_id: agentId,
    order_id: $('Webhook').first().json.body.order_id,
    parsed: parsed
  }
}];"""
  },
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [ 160, -240 ],
  "id": "ccc44444-new-agent-code",
  "name": "Tìm Agent"
}

# Remove old versions if they exist
nodes = [n for n in nodes if n["name"] not in ["Lấy Agent ID", "Tìm Agent"]]
nodes.append(agent_id_node)
nodes.append(find_agent_code_node)

# 3. Update 'Save to Lark' to use variables from Tìm Agent ($json...)
for node in nodes:
    if node["name"] == "Save to Lark":
        node["parameters"]["jsonBody"] = """={
  "fields": {
    "Input_ID_DonHang": "{{ $json.order_id }}",
    "ID_AgentBD": "{{ $json.agent_id }}",
    "ID_LD": "{{ $json.parsed.PP_No }}_{{ $json.parsed.Full_Name }}",
    "Full Name": "{{ $json.parsed.Full_Name }}",
    "PP No": "{{ $json.parsed.PP_No }}",
    "DOB": "{{ $json.parsed.DOB }}",
    "PP DOI": "{{ $json.parsed.PP_DOI }}",
    "PP DOE": "{{ $json.parsed.PP_DOE }}",
    "POB": "{{ $json.parsed.POB }}",
    "Address": "{{ $json.parsed.Address }}",
    "Phone Number": "{{ $json.parsed.Phone_Number }}"
  }
}"""
# Also make sure Authorization header uses .first() safely (just in case)
        if "headerParameters" in node["parameters"]:
            for p in node["parameters"]["headerParameters"].get("parameters", []):
                if p["name"] == "Authorization":
                    p["value"] = "=Bearer {{ $('Get Lark Token').first().json.tenant_access_token }}"


up_data["nodes"] = nodes

# 4. Patch Connections
conns = up_data["connections"]

# Hook up: Get Lark Token -> Lấy Agent ID -> Làm sạch Base64
if "Get Lark Token" in conns:
    conns["Get Lark Token"]["main"] = [[{"node": "Lấy Agent ID", "type": "main", "index": 0}]]

conns["Lấy Agent ID"] = {
    "main": [[{"node": "Làm sạch Base64", "type": "main", "index": 0}]]
}

# Hook up: AI Parse JSON -> Tìm Agent -> Save to Lark
if "AI Parse JSON" in conns and "main" in conns["AI Parse JSON"]:
    conns["AI Parse JSON"]["main"] = [[{"node": "Tìm Agent", "type": "main", "index": 0}]]

conns["Tìm Agent"] = {
    "main": [[{"node": "Save to Lark", "type": "main", "index": 0}]]
}

up_data["connections"] = conns

with open("n8n/[Portal API] Upload Passport.json", "w") as f:
    json.dump(up_data, f, indent=2)

print("Backend Agent lookup completely restored!")
