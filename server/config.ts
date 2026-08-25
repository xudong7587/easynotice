import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
export const dataDir = path.resolve(process.env.EASYNOTICE_DATA_DIR || path.join(rootDir, 'data'));
export const uploadDir = path.join(dataDir, 'uploads');
export const dbPath = path.join(dataDir, 'easynotice.db');
export const host = process.env.HOST?.trim() || '0.0.0.0';
export const port = Number(process.env.PORT || 18088);
export const isProduction = process.env.NODE_ENV === 'production';

fs.mkdirSync(uploadDir, { recursive: true });

function loadInstallationSecret(): string {
  if (process.env.EASYNOTICE_SECRET) return process.env.EASYNOTICE_SECRET;

  const secretPath = path.join(dataDir, '.installation-secret');
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();

  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

export const installationSecret = loadInstallationSecret();

export const sessionCookie = 'easynotice_session';
export const maxJsonBody = '2mb';
export const maxUploadBytes = 4 * 1024 * 1024;
