import json

file_path = "n8n/[Portal API] Upload Passport.json"
with open(file_path, "r") as f:
    data = json.load(f)

# Delete Google Gemini node
nodes = [n for n in data["nodes"] if n.get("name") != "Google Gemini Model"]

for node in nodes:
    if node.get("name") == "AI Parse JSON":
        # Convert it to a JS Code Node
        node["type"] = "n8n-nodes-base.code"
        node["typeVersion"] = 2
        
        js_code = """const text = $('Google Vision OCR').first().json.responses[0]?.textAnnotations[0]?.description || "";

let parsed = {
  Full_Name: "",
  PP_No: "",
  DOB: "",
  PP_DOI: "",
  PP_DOE: "",
  POB: "",
  Address: "",
  Phone_Number: ""
};

// 1. Số Hộ Chiếu
const ppMatch = text.match(/\\b([A-Z]\\d{7})\\b/);
if (ppMatch) parsed.PP_No = ppMatch[1];

// 2. Các Ngày Tháng
const dates = [...text.matchAll(/\\b(\\d{2}\\/\\d{2}\\/\\d{4})\\b/g)].map(m => m[1]);
if (dates.length >= 1) parsed.DOB = dates[0];
if (dates.length >= 2) parsed.PP_DOI = dates[1];
if (dates.length >= 3) parsed.PP_DOE = dates[2];

// 3. Tên từ dòng MRZ
const mrzLine1 = text.match(/P<VNM([a-zA-Z<]+)/i);
if (mrzLine1) {
  let namePart = mrzLine1[1].replace(/<+$/, '');
  let parts = namePart.split('<<');
  if (parts.length === 2) {
    let last = parts[0].replace(/</g, ' ').trim();
    let first = parts[1].replace(/</g, ' ').trim();
    parsed.Full_Name = (last + " " + first).toUpperCase();
  } else {
    parsed.Full_Name = namePart.replace(/</g, ' ').trim().toUpperCase();
  }
}

return [{ json: { text: JSON.stringify(parsed) } }];"""
        
        node["parameters"] = {
            "jsCode": js_code
        }

data["nodes"] = nodes

# Remove Gemini connection
conns = data.get("connections", {})
if "Google Gemini Model" in conns:
    del conns["Google Gemini Model"]

data["connections"] = conns

with open(file_path, "w") as f:
    json.dump(data, f, indent=2)

print("Updated AI Parse Node to JS Code Node!")
