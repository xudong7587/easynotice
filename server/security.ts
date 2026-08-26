const redacted = '[已隐藏]';

function compactKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveKey(value: string): boolean {
  const key = compactKey(value);
  return key === 'key'
    || key === 'pwd'
    || key === 'passwd'
    || key === 'password'
    || key === 'authorization'
    || key === 'cookie'
    || key === 'setcookie'
    || key === 'signature'
    || key === 'sign'
    || key.includes('token')
    || key.includes('secret')
    || key === 'apikey'
    || key === 'accesskey'
    || key === 'privatekey'
    || key === 'botkey'
    || key === 'devicekey'
    || key === 'webhookkey'
    || key === 'webhookurl';
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/(bearer\s+)[a-z0-9._~+\/-]+/gi, `$1${redacted}`)
    .replace(/([?&](?:access_token|api_key|apikey|token|key|secret|signature)=)[^&#\s]+/gi, `$1${redacted}`)
    .replace(/((?:^|[\s,;{[(])(?:access[_-]?token|api[_-]?key|apikey|token|password|passwd|secret|signature|webhook[_-]?key)\s*[:=]\s*)["']?[^"'&,;\s}\]]+/gim, `$1${redacted}`)
    .replace(/(\/bot)\d{5,}:[a-z0-9_-]{16,}/gi, `$1${redacted}`);
}

export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[内容层级过深]';
  if (typeof value === 'string') return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveData(item, depth + 1));
  if (typeof value !== 'object' || value === null) return value;

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? redacted : redactSensitiveData(nested, depth + 1);
  }
  return result;
}
