import { createClient } from '@supabase/supabase-js'

// Thêm ' || '' ' để lỡ không có key thì tạm để trống, tránh lỗi lúc Vercel đang đóng gói
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
