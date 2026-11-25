export function notFound(req, res) {
  res.status(404).json({ error: { message: 'Not found' } });
}

export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      message: status >= 500 ? 'Internal server error' : err.message,
      ...(status < 500 && err.details ? { details: err.details } : {}),
    },
  });
}
