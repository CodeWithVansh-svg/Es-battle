/* ==========================================================
   API CLIENT
   Talks to Vercel serverless routes + Neon.
   Falls back gracefully when API is unavailable.
========================================================== */

const TOKEN_KEY = "es-battle-token";
const SESSION_KEY = "logged-in-user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function setSessionUser(user) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}

export function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Returns true if /api/health reports database configured. */
export async function isRemoteApiAvailable() {
  try {
    const data = await request("/api/health", { auth: false });
    return !!(data && data.ok && data.database);
  } catch {
    return false;
  }
}

export async function apiLogin(email, password) {
  const data = await request("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  setToken(data.token);
  setSessionUser({
    username: data.user.username,
    email: data.user.email,
    phone: data.user.phone,
    ffUid: data.user.ff_uid,
    role: data.user.role,
  });
  return data;
}

export async function apiRegister({ username, email, password, phone, ffUid }) {
  const data = await request("/api/auth/register", {
    method: "POST",
    auth: false,
    body: { username, email, password, phone, ffUid },
  });
  setToken(data.token);
  setSessionUser({
    username: data.user.username,
    email: data.user.email,
    phone: data.user.phone,
    ffUid: data.user.ff_uid,
    role: data.user.role,
  });
  return data;
}

export async function apiMe() {
  return request("/api/auth/me");
}

export async function apiAdminUsers() {
  return request("/api/admin/users");
}

export async function apiAdminRecharges(status = "pending") {
  return request(`/api/admin/recharges?status=${encodeURIComponent(status)}`);
}

export async function apiAdminWithdraws(status = "pending") {
  return request(`/api/admin/withdraws?status=${encodeURIComponent(status)}`);
}

export async function apiCreateRecharge(amount, utr) {
  return request("/api/admin/recharges", {
    method: "POST",
    body: { amount, utr },
  });
}

export async function apiPatchRecharge(id, action, reason = "") {
  return request("/api/admin/recharges", {
    method: "PATCH",
    body: { id, action, reason },
  });
}

export async function apiCreateWithdraw(amount, upi) {
  return request("/api/admin/withdraws", {
    method: "POST",
    body: { amount, upi },
  });
}

export async function apiPatchWithdraw(id, action, reason = "") {
  return request("/api/admin/withdraws", {
    method: "PATCH",
    body: { id, action, reason },
  });
}

export async function apiGetRoom(matchId) {
  return request(`/api/rooms?matchId=${encodeURIComponent(matchId)}`, { auth: false });
}

export async function apiSaveRoom(matchId, payload) {
  return request(`/api/rooms?matchId=${encodeURIComponent(matchId)}`, {
    method: "PUT",
    body: payload,
  });
}

export async function apiJoinMatch(matchId) {
  return request("/api/matches/join", {
    method: "POST",
    body: { matchId },
  });
}

export async function apiMatchStatus(matchId) {
  return request(`/api/matches/status?matchId=${encodeURIComponent(matchId)}`);
}

export function apiLogout() {
  setToken("");
  setSessionUser(null);
}
