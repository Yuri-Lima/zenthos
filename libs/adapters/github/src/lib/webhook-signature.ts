import { createHmac, timingSafeEqual } from 'node:crypto';

/** GitHub signs each delivery with HMAC-SHA256 over the raw body and sends it as `sha256=<hex>`. */
export const signPayload = (secret: string, rawBody: string): string => `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

export function verifySignature(secret: string, rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPayload(secret, rawBody));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
