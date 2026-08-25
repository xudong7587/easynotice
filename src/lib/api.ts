export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || '服务返回了无法识别的内容' };
  }
  if (!response.ok) {
    const message = (payload as { error?: string }).error || `请求失败 (${response.status})`;
    if (response.status === 401) window.dispatchEvent(new CustomEvent('easynotice:unauthorized'));
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}
