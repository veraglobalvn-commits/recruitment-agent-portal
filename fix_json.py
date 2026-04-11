import json

file_path = "n8n/[Portal API] Upload Passport.json"
with open(file_path, "r") as f:
    data = json.load(f)

for node in data["nodes"]:
    if node.get("name") == "Tìm Agent":
        node["parameters"]["jsCode"] = """const agentId = $('Webhook').item.json.body.agent_id;
let parsedText = $('AI Parse JSON').item.json.text;
const orderId = $('Làm sạch Base64').item.json.body.order_id;

// Xóa markdown code block nếu AI trả về (```json ... ```)
parsedText = parsedText.replace(/```json/g, '').replace(/```/g, '').trim();

const parsed = JSON.parse(parsedText);

return [{
  json: {
    agent_id: agentId,
    order_id: orderId,
    parsed: parsed
  }
}];"""

with open(file_path, "w") as f:
    json.dump(data, f, indent=2)

print("Fixed JSON parse error code!")
