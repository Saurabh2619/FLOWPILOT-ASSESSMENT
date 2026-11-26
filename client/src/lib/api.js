let accessToken = null;
let refreshing = null;
const expiryListeners = new Set();

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function send(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: {
        ...(body && { "Content-Type": "application/json" }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: body && JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Cannot reach the server. Check your connection.", 0);
  }
  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const details = Array.isArray(data?.error?.details) ? data.error.details : [];
    const message =
      details.map((detail) => detail.message).join(". ") ||
      data?.error?.message ||
      "The server is not responding. Try again shortly.";
    throw new ApiError(message, response.status, details);
  }
  return data;
}

const withTabLock = (task) =>
  globalThis.navigator?.locks ? navigator.locks.request("fp-refresh", task) : task();

export function refreshSession() {
  refreshing ??= withTabLock(() => send("/auth/refresh", { method: "POST" }))
    .then((data) => {
      accessToken = data.accessToken;
      return data.user;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function onSessionExpired(listener) {
  expiryListeners.add(listener);
  return () => expiryListeners.delete(listener);
}

export async function api(path, options) {
  try {
    return await send(path, options);
  } catch (error) {
    if (error.status !== 401 || !accessToken) throw error;
    try {
      await refreshSession();
    } catch (refreshError) {
      if (refreshError.status === 401) {
        accessToken = null;
        expiryListeners.forEach((listener) => listener());
      }
      throw refreshError;
    }
    return send(path, options);
  }
}

export async function login(credentials) {
  const data = await send("/auth/login", { method: "POST", body: credentials });
  accessToken = data.accessToken;
  return data.user;
}

export async function logout() {
  await withTabLock(() => send("/auth/logout", { method: "POST" }));
  accessToken = null;
}
