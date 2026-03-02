const TOKEN_KEY = 'qb_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(method, url, { body, isUpload } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let fetchBody;
  if (isUpload) {
    // FormData — let the browser set Content-Type with boundary
    fetchBody = body;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: fetchBody });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Request failed');
  }

  return res.json();
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, { body }),
  del: (url) => request('DELETE', url),
  upload: (url, formData) => request('POST', url, { body: formData, isUpload: true }),
  getToken,
  setToken,
  clearToken,
};
