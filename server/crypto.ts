import crypto from 'node:crypto';
import { installationSecret } from './config.js';
import { redactSensitiveData } from './security.js';

const key = crypto.scryptSync(installationSecret, 'easynotice:v1', 32);

export function encryptSecret(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret<T>(payload: string): T {
  const [version, ivPart, tagPart, dataPart] = payload.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
    throw new Error('无法读取加密配置');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

export function isEncryptedPayload(payload: string): boolean {
  return /^v1\.[^.]+\.[^.]+\.[^.]+$/.test(payload);
}

export function encryptStoredData(value: unknown): string {
  return encryptSecret(redactSensitiveData(value));
}

export function decryptStoredData<T>(payload: string): T {
  if (isEncryptedPayload(payload)) return decryptSecret<T>(payload);
  return JSON.parse(payload) as T;
}

export function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function safeEqualHash(expectedHash: string, rawValue: string): boolean {
  const actual = Buffer.from(hashToken(rawValue), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
