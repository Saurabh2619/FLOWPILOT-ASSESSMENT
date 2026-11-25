export const REFRESH_COOKIE = 'fp_refresh';

// Scoped to the auth routes and never readable by page scripts. SameSite=Strict
// stops other sites from sending it, which covers CSRF on refresh and logout.
function options(config) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  };
}

export function setRefreshCookie(res, token, config) {
  const maxAge = config.auth.refreshTtlDays * 24 * 60 * 60 * 1000;
  res.cookie(REFRESH_COOKIE, token, { ...options(config), maxAge });
}

export function clearRefreshCookie(res, config) {
  res.clearCookie(REFRESH_COOKIE, options(config));
}
