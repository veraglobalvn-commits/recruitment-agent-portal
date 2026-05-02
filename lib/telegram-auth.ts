import { createHmac, timingSafeEqual } from 'crypto';

const CLOCK_TOLERANCE_SECONDS = 300;
const LINK_TTL_SECONDS = 1800; // 30 minutes

/**
 * Lower-level HMAC-SHA256 verification — accepts pre-read params instead of NextRequest.
 * Use this when the request body has already been consumed via req.text().
 *
 * @param rawBody      — Raw request body string (already read)
 * @param timestamp    — Value of x-bridge-timestamp header
 * @param signature    — Value of x-bridge-signature header
 */
export function verifyBridgeSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  try {
    const secret = process.env.TELEGRAM_BRIDGE_SECRET;
    if (!secret) {
      console.error('[TelegramAuth] TELEGRAM_BRIDGE_SECRET is not configured');
      return false;
    }

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return false;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - ts) > CLOCK_TOLERANCE_SECONDS) return false;

    const message = `${timestamp}.${rawBody}`;
    const expectedHmac = createHmac('sha256', secret)
      .update(message, 'utf8')
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    const receivedBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== receivedBuf.length) return false;

    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch (err) {
    console.error('[TelegramAuth] verifyBridgeSignature error:', err);
    return false;
  }
}

/**
 * Generate HMAC signature for L2 bot→portal signed redirect.
 * Pattern: HMAC-SHA256("tg_link:{tg_id}:{ts}", TELEGRAM_BRIDGE_SECRET)
 */
export function signLinkUrl(tgId: number, ts: number): string {
  const secret = process.env.TELEGRAM_BRIDGE_SECRET;
  if (!secret) throw new Error('[TelegramAuth] TELEGRAM_BRIDGE_SECRET not configured');
  const payload = `tg_link:${tgId}:${ts}`;
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Verify L2 bot→portal signed redirect params.
 * Returns true if signature is valid and timestamp is within 30 minutes.
 */
export function verifyLinkSignature(tgId: number, ts: number, sig: string): boolean {
  try {
    const secret = process.env.TELEGRAM_BRIDGE_SECRET;
    if (!secret) {
      console.error('[TelegramAuth] TELEGRAM_BRIDGE_SECRET not configured');
      return false;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - ts) > LINK_TTL_SECONDS) return false;
    const payload = `tg_link:${tgId}:${ts}`;
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(sig, 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch (err) {
    console.error('[TelegramAuth] verifyLinkSignature error:', err);
    return false;
  }
}
