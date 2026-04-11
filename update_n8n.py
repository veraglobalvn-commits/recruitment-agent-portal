import json

file_path = "n8n/[Portal API] Upload Passport.json"
with open(file_path, "r") as f:
    data = json.load(f)

# Update nodes
new_nodes = []
for node in data["nodes"]:
    if node.get("name") == "Lấy Agent ID":
        continue
    
    if node.get("name") == "Tìm Agent":
        node["parameters"]["jsCode"] = """const agentId = $('Webhook').item.json.body.agent_id;
const parsedText = $('AI Parse JSON').item.json.text;
const orderId = $('Làm sạch Base64').item.json.body.order_id;

const parsed = JSON.parse(parsedText);

return [{
  json: {
    agent_id: agentId,
    order_id: orderId,
    parsed: parsed
  }
}];"""
        new_nodes.append(node)
    else:
        new_nodes.append(node)

data["nodes"] = new_nodes

# Update connections
conns = data.get("connections", {})
if "Lấy Agent ID" in conns:
    del conns["Lấy Agent ID"]

if "Get Lark Token" in conns:
    conns["Get Lark Token"]["main"] = [[{ "node": "Làm sạch Base64", "type": "main", "index": 0 }]]

data["connections"] = conns

with open(file_path, "w") as f:
    json.dump(data, f, indent=2)

print("Updated JSON successfully!")
