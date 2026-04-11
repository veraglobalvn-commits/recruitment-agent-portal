const testCases = [
  `
CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Hộ chiếu / Passport
P
VNM
Nguyễn Văn A
12/05/1990
Nơi sinh / Place of birth
HÀ NỘI
C1234567
Ngày cấp / Date of issue
01/01/2020
Có giá trị đến / Date of expiry
01/01/2030

P<VNMNguyen<<Van<A<<<<<<<<<<<<<<<<<<<<<<
C1234567<1VNM9005125M3001015123456789<<<<<42
  `,
  `
Some garbled OCR text
Passport No. B7654321
Date of birth
15/08/1995
02/10/2022
02/10/2032
P<VNMTRA<<THI<MAI<<<<<<<<<<<<<<<<<
B7654321<5VNM9508151F3210023<<<<<<<<<<<<<<<<
  `
];

for (let text of testCases) {
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

  // 1. PP No
  const ppMatch = text.match(/\b([A-Z]\d{7})\b/);
  if (ppMatch) parsed.PP_No = ppMatch[1];

  // 2. Dates
  const dates = [...text.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map(m => m[1]);
  if (dates.length >= 1) parsed.DOB = dates[0];
  if (dates.length >= 2) parsed.PP_DOI = dates[1];
  if (dates.length >= 3) parsed.PP_DOE = dates[2];

  // 3. MRZ Line 1 (Name)
  // Look for P<VNM followed by chars
  const mrzLine1 = text.match(/P<VNM([A-Z<]+)/i);
  if (mrzLine1) {
    let namePart = mrzLine1[1].replace(/<+$/, '');
    let parts = namePart.split('<<');
    if (parts.length === 2) {
      parsed.Full_Name = (parts[0].replace(/</g, ' ') + " " + parts[1].replace(/</g, ' ')).trim().toUpperCase();
    } else {
      parsed.Full_Name = namePart.replace(/</g, ' ').trim().toUpperCase();
    }
  }

  // Fallback PP_No from MRZ Line 2
  if (!parsed.PP_No) {
    const mrzLine2 = text.match(/([A-Z0-9<>]{9})\d[A-Z]{3}(\d{6})\d[MFX]/i);
    if (mrzLine2) parsed.PP_No = mrzLine2[1].replace(/</g, '');
  }
  
  console.log(JSON.stringify(parsed, null, 2));
}

