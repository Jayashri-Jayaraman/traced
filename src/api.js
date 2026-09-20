const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const TOKEN_KEY = 'traced-auth-token';
const USER_KEY = 'traced-auth-user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(auth) {
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(USER_KEY, JSON.stringify({ email: auth.email, displayName: auth.displayName }));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // response had no JSON body
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function signup(email, password, displayName) {
  const auth = await request('/api/auth/signup', { method: 'POST', body: { email, password, displayName } });
  storeSession(auth);
  return auth;
}

export async function login(email, password) {
  const auth = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  storeSession(auth);
  return auth;
}

export function listDesigns() {
  return request('/api/designs', { auth: true });
}

export function getDesign(id) {
  return request(`/api/designs/${id}`, { auth: true });
}

export function createDesign(payload) {
  return request('/api/designs', { method: 'POST', body: payload, auth: true });
}

export function updateDesign(id, payload) {
  return request(`/api/designs/${id}`, { method: 'PUT', body: payload, auth: true });
}

export function deleteDesign(id) {
  return request(`/api/designs/${id}`, { method: 'DELETE', auth: true });
}
