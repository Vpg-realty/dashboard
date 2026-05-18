// Tiny base32 encoder (RFC 4648, no padding). Used to encode case-sensitive
// GHL location IDs into GitHub Secret names — which only allow [A-Z0-9_] and
// are case-insensitive. base32 fits cleanly inside that alphabet.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function encodeBase32(input) {
  const bytes = new TextEncoder().encode(String(input));
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

// GitHub secret name for a given GHL location ID.
export const pitSecretName = (locationId) => `PIT_${encodeBase32(locationId)}`;
