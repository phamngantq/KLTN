/**
 * Password hashing — see docs/ADR_AUTH.md.
 * Encoded format (self-describing, versioned): `pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>`.
 */
import { base64UrlToBytes, bytesToBase64Url, timingSafeEqual } from '../../lib/crypto';

const ALGORITHM = 'pbkdf2-sha256';
/** Cloudflare Workers' WebCrypto rejects PBKDF2 above 100k iterations. */
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const encoder = new TextEncoder();

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return [ALGORITHM, PBKDF2_ITERATIONS, bytesToBase64Url(salt), bytesToBase64Url(hash)].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, hashText] = encoded.split('$');
  const iterations = Number(iterationsText);
  if (
    algorithm !== ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > PBKDF2_ITERATIONS ||
    !saltText ||
    !hashText
  ) {
    return false;
  }
  const expected = base64UrlToBytes(hashText);
  const actual = await derive(password, base64UrlToBytes(saltText), iterations);
  return timingSafeEqual(actual, expected);
}

/** Fixed hash used to spend equal time when the account does not exist (limits user enumeration by timing). */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
}
