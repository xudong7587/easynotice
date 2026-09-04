import crypto from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptUgreenRsa, fetchUgreenRawMessages, normalizeUgreenBaseUrl, normalizeUgreenMessage } from './ugreen.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const encodedPublicKey = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
let server: http.Server;
let baseUrl = '';

function decrypt(value: string): string {
  return crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(value, 'base64'),
  ).toString('utf8');
}

beforeAll(async () => {
  server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      response.setHeader('Content-Type', 'application/json');
      if (request.url?.startsWith('/ugreen/v1/verify/check')) {
        expect(body.username).toBe('sunny');
        response.setHeader('X-Rsa-Token', encodedPublicKey);
        response.end(JSON.stringify({ code: 200 }));
        return;
      }
      if (request.url === '/ugreen/v1/verify/login') {
        expect(decrypt(String(body.password))).toBe('nas-password');
        response.end(JSON.stringify({ code: 200, data: { public_key: encodedPublicKey, token: 'session-token', token_id: 'token-id' } }));
        return;
      }
      if (request.url === '/ugreen/v1/desktop/message/list') {
        expect(request.headers['x-ugreen-security-key']).toBe('token-id');
        expect(decrypt(String(request.headers['x-ugreen-token']))).toBe('session-token');
        response.end(JSON.stringify({ code: 200, data: { List: [{ id: 1, level: 'important', time: 1_780_000_000, body: '磁盘温度较高' }] } }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ code: 404 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('UGREEN client', () => {
  it('completes the RSA login flow and reads the message list', async () => {
    const result = await fetchUgreenRawMessages({ baseUrl, username: 'sunny', password: 'nas-password', allowSelfSigned: false });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ body: '磁盘温度较高', level: 'important' });
  });

  it('accepts UGOS public keys whose PEM label does not match the SPKI payload', () => {
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const body = spkiDer.toString('base64').match(/.{1,64}/g)?.join('\n');
    const mislabeledPem = `-----BEGIN RSA PUBLIC KEY-----\n${body}\n-----END RSA PUBLIC KEY-----`;
    const encoded = Buffer.from(mislabeledPem).toString('base64');
    expect(decrypt(encryptUgreenRsa(encoded, '兼容登录密码'))).toBe('兼容登录密码');
  });

  it('normalizes UGREEN messages for the EasyNotice routing pipeline', () => {
    const result = normalizeUgreenMessage({ id: 9, level: 'warning', time: 1_780_000_000, body: '<b>存储池异常</b><br>请立即检查' }, 'http://nas.local:9999');
    expect(result.notice).toMatchObject({
      title: '绿联 NAS 系统告警',
      body: '存储池异常\n请立即检查',
      eventType: 'ugreen_warning',
      severity: 'warning',
      linkUrl: 'http://nas.local:9999',
    });
    expect(result.fingerprint).toHaveLength(64);
  });

  it('accepts only a bare HTTP or HTTPS management origin', () => {
    expect(normalizeUgreenBaseUrl('http://192.168.11.239:9999')).toBe('http://192.168.11.239:9999');
    expect(() => normalizeUgreenBaseUrl('http://nas.local:9999/ugreen/v1')).toThrow('不要附加路径');
    expect(() => normalizeUgreenBaseUrl('ftp://nas.local')).toThrow('只支持 HTTP 或 HTTPS');
  });
});
