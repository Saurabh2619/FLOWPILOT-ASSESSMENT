const DEFAULT_PORT = 4000;

export function loadConfig(source = process.env) {
  const port = Number(source.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${source.PORT}"`);
  }

  const corsOrigins = (source.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return { nodeEnv: source.NODE_ENV ?? 'development', port, corsOrigins };
}
