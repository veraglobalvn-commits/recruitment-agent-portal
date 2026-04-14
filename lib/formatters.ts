// Utility formatters for monetary values
export const fmtVND = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return ''
  // Vietnamese format uses '.' as thousand separator
  return n.toLocaleString('vi-VN').replace(/,/g, '.')
}

export const fmtUSD = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return ''
  // English format uses ',' as thousand separator
  return n.toLocaleString('en-US')
}
