import json

file_path = "n8n/[Portal API] Upload Passport.json"
with open(file_path, "r") as f:
    data = json.load(f)

for node in data["nodes"]:
    # Save to Lark token issue
    if node.get("name") == "Save to Lark":
        for param in node.get("parameters", {}).get("headerParameters", {}).get("parameters", []):
            if param.get("name") == "Authorization":
                param["value"] = "=Bearer {{ $('Get Lark Token').first().json.tenant_access_token }}"
                
    # Fix jsCode in Tìm Agent
    if node.get("name") == "Tìm Agent":
        node["parameters"]["jsCode"] = """const webhookBody = $('Webhook').first().json.body || {};
const agentId = webhookBody.agent_id;
const orderId = webhookBody.order_id;

let parsedText = $json.text || "{}";

// Remove markdown backticks if AI returns them
if (typeof parsedText === 'string') {
  parsedText = parsedText.replace(/```json/g, '').replace(/```/g, '').trim();
}

let parsed = {};
try {
  parsed = JSON.parse(parsedText);
} catch (e) {
  parsed = { "error": "Cannot parse JSON", "raw": parsedText };
}

return [{
  json: {
    agent_id: agentId,
    order_id: orderId,
    parsed: parsed
  }
}];"""

    # Fix code in Làm sạch Base64 to be safer too
    if node.get("name") == "Làm sạch Base64":
        node["parameters"]["jsCode"] = """const body = $('Webhook').first().json.body || {};
const rawData = body.image_base64 || '';
if (!rawData) return [{ json: { error: 'No image found', clean_base64: '', body: {} } }];

const cleanBase64 = rawData.replace(/[\\s\\n]+/g, '');
return [{ json: { clean_base64: cleanBase64, body: body } }];"""

    # Fix AI Parse JSON
    if node.get("name") == "AI Parse JSON":
        # Make sure hasOutputParser is false to prevent hanging if no parser is connected!
        if "hasOutputParser" in node["parameters"]:
            node["parameters"]["hasOutputParser"] = False
            
        # Also fix .item to .first if needed
        # It's an expression
        if "text" in node["parameters"]:
            text = node["parameters"]["text"]
            text = text.replace("$('Google Vision OCR').item", "$('Google Vision OCR').first()")
            node["parameters"]["text"] = text

with open(file_path, "w") as f:
    json.dump(data, f, indent=2)

print("Fixed n8n hanging issues!")
