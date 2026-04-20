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

// Compact shorthand: 1.2B ₫, 500M ₫, or full VN format for smaller values
export const fmtVndShort = (val: number | null | undefined): string => {
  if (!val) return '—';
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B ₫`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(0)}M ₫`;
  return val.toLocaleString('vi-VN') + ' ₫';
}
