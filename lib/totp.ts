import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Time-based one-time codes (RFC 6238, the six-digit codes of Google Authenticator, Microsoft
// Authenticator, 1Password and similar apps), for two-step sign-in to the console.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeAt(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

// Accepts the current code and the ones just before and after, for clock drift.
export function verifyTotp(secret: string, code: string): boolean {
  const given = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  const now = Math.floor(Date.now() / 30_000);
  for (const step of [0, -1, 1]) {
    const expected = codeAt(secret, now + step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return true;
  }
  return false;
}

export function otpauthUri(username: string, secret: string): string {
  const label = encodeURIComponent(`Aya console:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Aya console')}&algorithm=SHA1&digits=6&period=30`;
}
