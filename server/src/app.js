import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errors.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createBillingProvider } from './providers/billing/index.js';
import { createConsoleEmailProvider } from './providers/email/console.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createBillingRouter } from './routes/billing.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createWebhookRouter } from './routes/webhook.routes.js';

// Builds the app without listening, so tests can use it directly.
export function createApp(
  config,
  {
    emailProvider = createConsoleEmailProvider(),
    billingProvider = createBillingProvider(config),
  } = {},
) {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Mounted before the JSON parser, which would consume the raw body.
  app.use('/api/webhooks', createWebhookRouter({ billingProvider }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/health', healthRouter);
  app.use('/api/auth', createAuthRouter(config, { emailProvider }));
  app.use('/api/admin', createAdminRouter(config));
  app.use('/api/billing', createBillingRouter(config, { billingProvider }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
