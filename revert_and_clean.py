import json

with open("n8n/Scan passport & Fill thông tin.json", "r") as f:
    ref_data = json.load(f)

with open("n8n/[Portal API] Upload Passport.json", "r") as f:
    up_data = json.load(f)

# Extract reference AI nodes
ai_node = next(n for n in ref_data["nodes"] if n["name"] == "AI Parse JSON")
ai_node["name"] = "AI Parse JSON"
ai_model = next(n for n in ref_data["nodes"] if n["name"] == "Google Gemini Chat Model")

# Construct the new nodes list for Upload Passport
new_nodes = []

# Keep these verbatim
for name in ["Webhook", "Get Lark Token", "Làm sạch Base64", "Google Vision OCR"]:
    node = next(n for n in up_data["nodes"] if n["name"] == name)
    # Ensure connections match linearly via id? We use names for logic, id is internal
    new_nodes.append(node)

# Add AI nodes
new_nodes.append(ai_node)
new_nodes.append(ai_model)

# Overwrite Save to Lark
save_node = next(n for n in up_data["nodes"] if n["name"] == "Save to Lark")
save_node["parameters"]["jsonBody"] = """={
  "fields": {
    "Input_ID_DonHang": "{{ $('Webhook').first().json.body.order_id }}",
    "ID_AgentBD": "{{ $('Webhook').first().json.body.agent_id }}",
    "ID_LD": "{{ JSON.parse($json.text).PP_No }}_{{ JSON.parse($json.text).Full_Name }}",
    "Full Name": "{{ JSON.parse($json.text).Full_Name }}",
    "PP No": "{{ JSON.parse($json.text).PP_No }}",
    "DOB": "{{ JSON.parse($json.text).DOB }}",
    "PP DOI": "{{ JSON.parse($json.text).PP_DOI }}",
    "PP DOE": "{{ JSON.parse($json.text).PP_DOE }}",
    "POB": "{{ JSON.parse($json.text).POB }}",
    "Address": "{{ JSON.parse($json.text).Address }}",
    "Phone Number": "{{ JSON.parse($json.text).Phone_Number }}"
  }
}"""
new_nodes.append(save_node)

# Trả về cho Web
web_node = next(n for n in up_data["nodes"] if n["name"] == "Trả về cho Web")
new_nodes.append(web_node)

# Now fix connections
new_connections = {
    "Webhook": { "main": [[{ "node": "Get Lark Token", "type": "main", "index": 0 }]] },
    "Get Lark Token": { "main": [[{ "node": "Làm sạch Base64", "type": "main", "index": 0 }]] },
    "Làm sạch Base64": { "main": [[{ "node": "Google Vision OCR", "type": "main", "index": 0 }]] },
    "Google Vision OCR": { "main": [[{ "node": "AI Parse JSON", "type": "main", "index": 0 }]] },
    "Google Gemini Chat Model": { "ai_languageModel": [[{ "node": "AI Parse JSON", "type": "ai_languageModel", "index": 0 }]] },
    "AI Parse JSON": { "main": [[{ "node": "Save to Lark", "type": "main", "index": 0 }]] },
    "Save to Lark": { "main": [[{ "node": "Trả về cho Web", "type": "main", "index": 0 }]] }
}

up_data["nodes"] = new_nodes
up_data["connections"] = new_connections

# Save
with open("n8n/[Portal API] Upload Passport.json", "w") as f:
    json.dump(up_data, f, indent=2)

print("Rewritten JSON correctly!")
