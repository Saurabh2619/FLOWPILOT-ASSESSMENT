export function notFound(req, res) {
  res.status(404).json({ error: { message: 'Not found' } });
}

// Express recognises error handlers by their four arguments.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  // Internal error details are never sent to the client.
  res.status(status).json({
    error: { message: status >= 500 ? 'Internal server error' : err.message },
  });
}
