// Tiny fetch wrapper used by both frontends.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createApiClient({ baseUrl = '', getToken, onUnauthorized } = {}) {
  async function request(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) onUnauthorized?.();
      const err = data.error || {};
      throw new ApiError(res.status, err.code || 'generic', err.message, err.details);
    }
    return data;
  }

  return {
    get: (p) => request('GET', p),
    post: (p, b = {}) => request('POST', p, b),
    patch: (p, b = {}) => request('PATCH', p, b),
  };
}

/** Map an ApiError to a translated message. */
export function errorMessage(t, err) {
  if (!(err instanceof ApiError)) return t('err_generic');
  const key = `err_${err.code}`;
  const msg = t(key, err.details);
  return msg === key ? t('err_generic') : msg;
}

/** "" -> same origin; "https://api.samouna.iq" -> "wss://api.samouna.iq/ws" */
export function wsUrlFrom(baseUrl) {
  const origin = baseUrl || window.location.origin;
  return `${origin.replace(/^http/, 'ws')}/ws`;
}
