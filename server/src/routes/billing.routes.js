import { Router } from 'express';
import { z } from 'zod';
import { PAID_PLAN_NAMES } from '../config/plans.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as billingService from '../services/billing.service.js';

const checkoutSchema = z.object({ plan: z.enum(PAID_PLAN_NAMES) });
const mockCompleteSchema = z.object({
  subscriptionId: z.string().min(1).max(200),
  outcome: z.enum(['success', 'failure']),
});

export function createBillingRouter(config, { billingProvider }) {
  const router = Router();
  const auth = requireAuth(config);

  router.get('/plans', (req, res) => {
    res.json({ plans: billingService.listPlans() });
  });

  router.get('/subscription', auth, async (req, res) => {
    res.json(await billingService.getOverview(req.user));
  });

  router.post('/checkout', auth, validateBody(checkoutSchema), async (req, res) => {
    const checkout = await billingService.startCheckout(req.user, req.body.plan, billingProvider);
    res.status(201).json(checkout);
  });

  router.post('/cancel', auth, async (req, res) => {
    res.json(await billingService.cancelSubscription(req.user, billingProvider));
  });

  // Stands in for the gateway's checkout page. Absent with a real provider.
  if (billingProvider.simulatePayment) {
    router.post('/mock/complete', auth, validateBody(mockCompleteSchema), async (req, res) => {
      res.json(await billingService.completeMockCheckout(req.user, req.body, billingProvider));
    });
  }

  return router;
}
