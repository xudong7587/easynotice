import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easynotice-app-security-'));
process.env.EASYNOTICE_DATA_DIR = testDir;
process.env.EASYNOTICE_SECRET = 'app-security-test-secret-with-enough-entropy';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof supertest>;
let closeDatabase: (() => void) | undefined;

beforeAll(async () => {
  const [{ createApp }, { db }] = await Promise.all([import('./app.js'), import('./db.js')]);
  client = supertest(createApp());
  closeDatabase = () => db.close();
});

afterAll(() => {
  closeDatabase?.();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('HTTP 局域网访问安全头', () => {
  it('不强制把同源脚本和样式升级到 HTTPS', async () => {
    const response = await client
      .get('/health')
      .set('Host', '192.168.11.239:18088')
      .expect(200);

    const policy = String(response.headers['content-security-policy'] || '');
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('继续保留其他关键浏览器防护', async () => {
    const response = await client.get('/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toContain("object-src 'none'");
  });

  it('提供浏览器标签页图标', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/favicon.svg"');
    expect(fs.existsSync(path.resolve(process.cwd(), 'public/favicon.svg'))).toBe(true);
  });
});
