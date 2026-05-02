import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { verifyBridgeSignature, verifyLinkSignature } from '@/lib/telegram-auth';

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ---------------------------------------------------------------------------
// POST /api/telegram/link
// Unified endpoint for all Telegram self-link actions.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action as string | undefined;

  // Bridge actions (called by n8n) — use HMAC bridge auth
  if (action === 'connect' || action === 'verify-otp') {
    const ts = req.headers.get('x-bridge-timestamp') ?? '';
    const sig = req.headers.get('x-bridge-signature') ?? '';
    if (!verifyBridgeSignature(rawBody, ts, sig)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (action === 'connect') return handleConnect(body);
    return handleVerifyOtp(body);
  }

  // Portal actions (called by authenticated portal user) — use Bearer token
  const authResult = await getAuthenticatedUser(req);
  if (!authResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminSupabase();
  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('supabase_uid', authResult.user.id)
    .maybeSingle();

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (action === 'generate-token') return handleGenerateToken(dbUser.id);
  if (action === 'confirm-l2')    return handleConfirmL2(dbUser.id, body);
  if (action === 'generate-otp')  return handleGenerateOtp(dbUser.id);

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ---------------------------------------------------------------------------
// L1 — Generate deep-link token (portal → bot)
// Returns: { deep_link, expires_in_minutes }
// ---------------------------------------------------------------------------
async function handleGenerateToken(userId: string) {
  const token = 'LINK_' + randomBytes(6).toString('hex'); // e.g. LINK_a3f9k280
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from('users')
    .update({ tg_link_token: token, tg_link_token_expires_at: expiresAt })
    .eq('id', userId);

  if (error) {
    console.error('[telegram/link] generate-token DB error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'Bangladesh_Recruitment_Bot';
  const deepLink = `https://t.me/${botUsername}?start=${token}`;

  return NextResponse.json({ deep_link: deepLink, expires_in_minutes: 30 });
}

// ---------------------------------------------------------------------------
// L1 — Connect (n8n bridge): verify token + set telegram_user_id
// Body: { action, token, telegram_user_id }
// ---------------------------------------------------------------------------
async function handleConnect(body: Record<string, unknown>) {
  const token = body.token as string | undefined;
  const telegramUserId = body.telegram_user_id as number | undefined;

  if (!token || !telegramUserId) {
    return NextResponse.json({ error: 'Missing token or telegram_user_id' }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data: dbUser } = await supabase
    .from('users')
    .select('id, tg_link_token_expires_at')
    .eq('tg_link_token', token)
    .eq('status', 'active')
    .maybeSingle();

  if (!dbUser) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 404 });
  }

  if (dbUser.tg_link_token_expires_at && new Date(dbUser.tg_link_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'EXPIRED_TOKEN' }, { status: 410 });
  }

  const { error } = await supabase
    .from('users')
    .update({
      telegram_user_id: telegramUserId,
      tg_link_token: null,
      tg_link_token_expires_at: null,
    })
    .eq('id', dbUser.id);

  if (error) {
    console.error('[telegram/link] connect DB error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// L2 — Confirm signed redirect (portal page → API)
// Body: { action, tg_id, ts, sig }
// ---------------------------------------------------------------------------
async function handleConfirmL2(userId: string, body: Record<string, unknown>) {
  const tgId = Number(body.tg_id);
  const ts = Number(body.ts);
  const sig = body.sig as string | undefined;

  if (!tgId || !ts || !sig) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  if (!verifyLinkSignature(tgId, ts, sig)) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 403 });
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from('users')
    .update({ telegram_user_id: tgId })
    .eq('id', userId);

  if (error) {
    console.error('[telegram/link] confirm-l2 DB error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// L3 — Generate OTP (portal → agent types /link XXXXXX in bot)
// Returns: { otp, expires_in_minutes }
// ---------------------------------------------------------------------------
async function handleGenerateOtp(userId: string) {
  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from('users')
    .update({ tg_link_otp: otp, tg_link_otp_expires_at: expiresAt })
    .eq('id', userId);

  if (error) {
    console.error('[telegram/link] generate-otp DB error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ otp, expires_in_minutes: 15 });
}

// ---------------------------------------------------------------------------
// L3 — Verify OTP (n8n bridge): verify otp + set telegram_user_id
// Body: { action, otp, telegram_user_id }
// ---------------------------------------------------------------------------
async function handleVerifyOtp(body: Record<string, unknown>) {
  const otp = body.otp as string | undefined;
  const telegramUserId = body.telegram_user_id as number | undefined;

  if (!otp || !telegramUserId) {
    return NextResponse.json({ error: 'Missing otp or telegram_user_id' }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data: dbUser } = await supabase
    .from('users')
    .select('id, tg_link_otp_expires_at')
    .eq('tg_link_otp', otp)
    .eq('status', 'active')
    .maybeSingle();

  if (!dbUser) {
    return NextResponse.json({ error: 'INVALID_OTP' }, { status: 404 });
  }

  if (dbUser.tg_link_otp_expires_at && new Date(dbUser.tg_link_otp_expires_at) < new Date()) {
    return NextResponse.json({ error: 'EXPIRED_OTP' }, { status: 410 });
  }

  const { error } = await supabase
    .from('users')
    .update({
      telegram_user_id: telegramUserId,
      tg_link_otp: null,
      tg_link_otp_expires_at: null,
    })
    .eq('id', dbUser.id);

  if (error) {
    console.error('[telegram/link] verify-otp DB error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
