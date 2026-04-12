import re
import json

test_texts = [
    """
CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
P<VNMNguyen<<Van<A<<<<<<<<<<<<<<<<<<<<<<
C1234567<1VNM9005125M3001015123456789<<<<<42
12/05/1990
01/01/2020
01/01/2030
    """,
    """
P<VNMTRA<<THI<MAI<<<<<<<<<<<<<<<<<
B7654321<5VNM9508151F3210023<<<<<<<<<<<<<<<<
15/08/1995
02/10/2022
02/10/2032
    """
]

for text in test_texts:
    parsed = {
        "Full_Name": "",
        "PP_No": "",
        "DOB": "",
        "PP_DOI": "",
        "PP_DOE": "",
        "POB": "",
        "Address": "",
        "Phone_Number": ""
    }
    
    # 1. PP_No
    pp_match = re.search(r'\b([A-Z]\d{7})\b', text)
    if pp_match:
        parsed["PP_No"] = pp_match.group(1)
        
    # 2. Dates
    dates = re.findall(r'\b(\d{2}/\d{2}/\d{4})\b', text)
    if len(dates) >= 1: parsed["DOB"] = dates[0]
    if len(dates) >= 2: parsed["PP_DOI"] = dates[1]
    if len(dates) >= 3: parsed["PP_DOE"] = dates[2]

    # 3. Name from MRZ
    mrz_name = re.search(r'P<VNM([a-zA-Z<]+)', text, re.IGNORECASE)
    if mrz_name:
        name_part = mrz_name.group(1).rstrip('<')
        parts = name_part.split('<<')
        if len(parts) == 2:
            last = parts[0].replace('<', ' ').strip()
            first = parts[1].replace('<', ' ').strip()
            parsed["Full_Name"] = f"{last} {first}".strip().upper()
        else:
            parsed["Full_Name"] = name_part.replace('<', ' ').strip().upper()

    print(json.dumps(parsed, indent=2))
