import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { createClient } from '@supabase/supabase-js';

// Hardcoded translations for fixed dropdown values
const MEAL_EN_MAP: Record<string, string> = {
  '1 bữa chính, 1 bữa tăng ca': '1 main meal, 1 overtime meal',
  '2 bữa chính, 1 bữa tăng ca': '2 main meals, 1 overtime meal',
  '3 bữa chính': '3 main meals',
};

const DORMITORY_EN_MAP: Record<string, string> = {
  'Miễn phí': 'Free of charge',
  'Có phí': 'Paid accommodation',
  'Không hỗ trợ': 'Not provided',
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const auth = await getAdminUser(req);
  if (!auth) return unauthorizedResponse('Admin access required');

  let body: {
    company_id?: string;
    job_type?: string;
    meal?: string;
    dormitory?: string;
    recruitment_info?: string;
    probation?: string;
    probation_months?: number | null;
    probation_salary_pct?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Fetch company data if company_id provided
  let company: Record<string, string | null> = {};
  if (body.company_id) {
    const { data } = await supabase
      .from('companies')
      .select('company_name, industry, business_type, address, legal_rep, legal_rep_title')
      .eq('id', body.company_id)
      .single();
    if (data) company = data as Record<string, string | null>;
  }

  // Hardcode meal/dormitory translations
  const meal_en = body.meal ? (MEAL_EN_MAP[body.meal] ?? body.meal) : null;
  const dormitory_en = body.dormitory ? (DORMITORY_EN_MAP[body.dormitory] ?? body.dormitory) : null;

  // Build probation info string for translation
  let probation_info = '';
  if (body.probation === 'Có' && body.probation_months) {
    probation_info = `${body.probation_months} tháng, ${body.probation_salary_pct ?? 100}% lương`;
  }

  // Fields that need AI translation
  const needsTranslation = {
    company_name: company.company_name || '',
    industry: company.industry || '',
    business_type: company.business_type || '',
    address: company.address || '',
    legal_rep: company.legal_rep || '',
    legal_rep_title: company.legal_rep_title || '',
    job_type: body.job_type || '',
    recruitment_info: body.recruitment_info || '',
    probation_info,
  };

  const hasContent = Object.values(needsTranslation).some((v) => v.trim() !== '');
  let translations: Record<string, string> = {};

  if (hasContent) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    const prompt = `Translate these Vietnamese business fields to English. Return ONLY a valid JSON object, no markdown, no extra text.
Input:
- company_name: "${needsTranslation.company_name}"
- industry: "${needsTranslation.industry}"
- business_type: "${needsTranslation.business_type}"
- address: "${needsTranslation.address}"
- legal_rep: "${needsTranslation.legal_rep}"
- legal_rep_title: "${needsTranslation.legal_rep_title}"
- job_type: "${needsTranslation.job_type}"
- recruitment_info: "${needsTranslation.recruitment_info}"
- probation_info: "${needsTranslation.probation_info}"

Return JSON with exactly these keys:
{"en_company_name":"","en_industry":"","en_business_type":"","en_address":"","en_legal_rep":"","en_title":"","job_type_en":"","recruitment_info_en":"","probation_info_en":""}`;

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
          'X-Title': 'Vera Global Recruitment Portal',
        },
        body: JSON.stringify({
          model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('OpenRouter error:', errText);
        return NextResponse.json({ error: `OpenRouter API error: ${res.status}` }, { status: 502 });
      }

      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? '';

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          translations = JSON.parse(jsonMatch[0]) as Record<string, string>;
        } catch {
          console.error('Failed to parse translation JSON:', content);
          return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 });
        }
      }
    } catch (err) {
      console.error('Translation fetch error:', err);
      return NextResponse.json({ error: 'Translation service unavailable' }, { status: 502 });
    }
  }

  // Update company EN fields in DB if company_id provided
  if (body.company_id && Object.keys(translations).length > 0) {
    const companyUpdates: Record<string, string | null> = {};
    if (translations.en_company_name) companyUpdates.en_company_name = translations.en_company_name;
    if (translations.en_industry) companyUpdates.en_industry = translations.en_industry;
    if (translations.en_business_type) companyUpdates.en_business_type = translations.en_business_type;
    if (translations.en_address) companyUpdates.en_address = translations.en_address;
    if (translations.en_legal_rep) companyUpdates.en_legal_rep = translations.en_legal_rep;
    if (translations.en_title) companyUpdates.en_title = translations.en_title;

    if (Object.keys(companyUpdates).length > 0) {
      await supabase.from('companies').update(companyUpdates).eq('id', body.company_id);
    }
  }

  return NextResponse.json({
    meal_en,
    dormitory_en,
    job_type_en: translations.job_type_en ?? null,
    recruitment_info_en: translations.recruitment_info_en ?? null,
    probation_info_en: translations.probation_info_en ?? null,
    en_company_name: translations.en_company_name ?? null,
    en_industry: translations.en_industry ?? null,
    en_business_type: translations.en_business_type ?? null,
    en_address: translations.en_address ?? null,
    en_legal_rep: translations.en_legal_rep ?? null,
    en_title: translations.en_title ?? null,
  });
}
