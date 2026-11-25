import express, { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { handleWebhook } from '../services/webhook.service.js';

export function createWebhookRouter({ billingProvider }) {
  const router = Router();

  router.post('/billing', express.raw({ type: '*/*', limit: '100kb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'Empty webhook body');
    await handleWebhook({ rawBody: req.body, headers: req.headers }, billingProvider);
    res.json({ received: true });
  });

  return router;
}
