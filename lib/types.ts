export interface DashboardStats {
  Tong_Lao_Dong: number | string;
  Trung_Tuyen: number | string;
  Con_Thieu: number | string;
  Tong_Tien_Can_TT: number | string;
  Tong_Tien_Da_TT: number | string;
  Tong_Tien_Chua_TT: number | string;
  [key: string]: unknown;
}

export interface Order {
  order_id: string;
  company: string | null;
  company_id: string | null;
  total_labor: number | string;
  missing: number | string;
  status: string;
  url_demand_letter: string | null;
  job_type: string | null;
  job_type_en: string | null;
  salary_usd: number | null;
  url_order: string | null;
  meal: string | null;
  dormitory: string | null;
  recruitment_info: string | null;
  probation: string | null;
  probation_months?: number | null;
  probation_salary_pct: number | null;
  agent_order_status: string | null;
  created_at?: string | null;
}

export interface Candidate {
  id_ld: string;
  order_id: string | null;
  agent_id: string | null;
  full_name: string | null;
  pp_no: string | null;
  dob: string | null;
  pp_doi: string | null;
  pp_doe: string | null;
  pob: string | null;
  address: string | null;
  phone: string | null;
  visa_status: string | null;
  passport_link: string | null;
  video_link: string | null;
  photo_link: string | null;
  height_ft: number | null;
  weight_kg: number | null;
  pcc_link: string | null;
  health_cert_link: string | null;
  interview_status: string | null;
  created_at?: string | null;
}

export interface DashboardData {
  agent_id?: string;
  agent_name: string;
  stats: DashboardStats | null;
  orders: Order[];
  error?: string;
}

export interface CandidatesResponse {
  candidates: Candidate[];
  order_id: string;
  error?: string;
}

export interface DocLink {
  name: string;
  url: string;
  type: 'pdf' | 'image' | 'doc' | 'other';
  uploaded_at: string;
}

export interface Company {
  id: string;
  company_name: string;
  short_name: string | null;
  tax_code: string | null;
  legal_rep: string | null;
  legal_rep_title: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  business_type: string | null;
  business_reg_authority: string | null;
  business_reg_date: string | null;
  business_reg_img: string | null;
  company_media: string[];
  avatar_url: string | null;
  factory_video_url: string | null;
  job_video_url: string | null;
  doc_links: DocLink[];
  bct_bh_links: DocLink[];
  en_company_name: string | null;
  en_legal_rep: string | null;
  en_address: string | null;
  en_title: string | null;
  en_industry: string | null;
  en_business_type: string | null;
  created_at: string;
}

export interface CompanyOrderStat {
  id: string;
  company_id: string | null;
  job_type: string | null;
  total_labor: number | null;
  labor_missing: number | null;
  status: string | null;
  total_fee_vn: number | null;
  payment_status_vn: string | null;
  service_fee_per_person: number | null;
}

export interface AdminOrder {
  id: string;
  company_id: string | null;
  company_name: string | null;
  job_type: string | null;
  job_type_en: string | null;
  total_labor: number | null;
  labor_missing: number | null;
  status: string | null;
  total_fee_vn: number | null;
  payment_status_vn: string | null;
  service_fee_per_person: number | null;
  service_fee_bd_per_person: number | null;
  total_fee_bd: number | null;
  agent_ids: string[] | null;
  salary_usd: number | null;
  url_order: string | null;
  meal: string | null;
  meal_en: string | null;
  dormitory: string | null;
  dormitory_en: string | null;
  dormitory_note: string | null;
  probation: string | null;
  probation_months?: number | null;
  probation_salary_pct: number | null;
  agent_order_status: string | null;
  created_at: string;
}

export interface OrderHandover {
  id: string;
  order_id: string;
  batch_no: number;
  candidate_ids: string[];
  labor_count: number;
  fee_vnd: number | null;
  departure_status: 'Chưa xuất cảnh' | 'Đã xuất cảnh' | 'Đã bàn giao';
  payment_status: 'Chưa TT' | 'Đã TT';
  payment_date: string | null;
  note: string | null;
  created_at: string;
}

export interface AgentOption {
  id: string;
  full_name: string | null;
  short_name: string | null;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  payment_party: 'company' | 'agent';
  payment_type: string;
  agent_id: string | null;
  handover_id: string | null;
  amount: number;
  currency: 'VND' | 'USD';
  payment_date: string | null;
  note: string | null;
  created_at: string;
}

export interface Agent {
  id: string;
  supabase_uid: string | null;
  full_name: string | null;
  short_name: string | null;
  role: string | null;
  avatar_url: string | null;
  labor_percentage: number | null;
  company_name: string | null;
  company_address: string | null;
  legal_rep: string | null;
  legal_rep_title: string | null;
  license_no: string | null;
  doc_links: DocLink[];
  created_at?: string | null;
}
