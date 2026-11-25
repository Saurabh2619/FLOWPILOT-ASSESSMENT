export const REFRESH_COOKIE = 'fp_refresh';

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
