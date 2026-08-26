import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
process.umask(0o077);
export const dataDir = path.resolve(process.env.EASYNOTICE_DATA_DIR || path.join(rootDir, 'data'));
export const uploadDir = path.join(dataDir, 'uploads');
export const dbPath = path.join(dataDir, 'easynotice.db');
export const host = process.env.HOST?.trim() || '0.0.0.0';
export const port = Number(process.env.PORT || 18088);
export const isProduction = process.env.NODE_ENV === 'production';

fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
for (const directory of [dataDir, uploadDir]) {
  try { fs.chmodSync(directory, 0o700); } catch { /* Some NAS filesystems do not expose POSIX modes. */ }
}

function validateInstallationSecret(value: string, source: string): string {
  const secret = value.trim();
  if (secret.length < 32) throw new Error(`${source} 至少需要 32 个字符`);
  return secret;
}

function loadInstallationSecret(): string {
  const secretFile = process.env.EASYNOTICE_SECRET_FILE?.trim();
  if (secretFile) {
    return validateInstallationSecret(fs.readFileSync(path.resolve(secretFile), 'utf8'), 'EASYNOTICE_SECRET_FILE 中的主密钥');
  }
  if (process.env.EASYNOTICE_SECRET) {
    return validateInstallationSecret(process.env.EASYNOTICE_SECRET, 'EASYNOTICE_SECRET');
  }

  const secretPath = path.join(dataDir, '.installation-secret');
  if (fs.existsSync(secretPath)) {
    try { fs.chmodSync(secretPath, 0o600); } catch { /* Best effort on non-POSIX mounts. */ }
    return validateInstallationSecret(fs.readFileSync(secretPath, 'utf8'), '.installation-secret');
  }

  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

export const installationSecret = loadInstallationSecret();

export const sessionCookie = 'easynotice_session';
export const maxJsonBody = '2mb';
export const maxUploadBytes = 4 * 1024 * 1024;
