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

// Compact shorthand: 1,9 tỷ | 394,6 tr | full VN format for smaller values. No ₫ suffix — add by caller.
export const fmtVndShort = (val: number | null | undefined): string => {
  if (val == null || isNaN(val)) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')} tr`;
  return val.toLocaleString('vi-VN');
}

// Compact USD: $12,5K | $1,2M | $850. No $ prefix — add by caller.
export const fmtUsdShort = (val: number | null | undefined): string => {
  if (val == null || isNaN(val)) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace('.', ',')}K`;
  return val.toLocaleString('en-US');
}
