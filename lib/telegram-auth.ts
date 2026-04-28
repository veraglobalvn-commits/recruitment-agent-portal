import { createHmac, timingSafeEqual } from 'crypto';

const CLOCK_TOLERANCE_SECONDS = 300;

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
