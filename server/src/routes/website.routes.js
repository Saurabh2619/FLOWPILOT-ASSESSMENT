import { Router } from 'express';
import { z } from 'zod';
import { SCHEDULE_NAMES } from '../config/plans.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import * as websiteService from '../services/website.service.js';

const createSchema = z.object({
  url: z.string().trim().min(1, 'Enter a website URL').max(2000),
  schedule: z.enum(SCHEDULE_NAMES).default('daily'),
});
const updateSchema = z
  .object({ schedule: z.enum(SCHEDULE_NAMES).optional(), active: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

export function createWebsiteRouter(config, { fetcher }) {
  const router = Router();
  router.use(requireAuth(config));

  router.get('/', async (req, res) => {
    const websites = await websiteService.listWebsites(req.user);
    res.json({ websites: websites.map((website) => website.toPublic()) });
  });

  // Adding a site makes an outbound request, so it is rate limited.
  router.post(
    '/',
    createRateLimiter(config.websiteRateLimit),
    validateBody(createSchema),
    async (req, res) => {
      const website = await websiteService.addWebsite(req.user, req.body, { fetcher });
      res.status(201).json({ website: website.toPublic() });
    },
  );

  router.get('/:id', async (req, res) => {
    const website = await websiteService.getWebsite(req.user, req.params.id);
    res.json({ website: website.toPublic() });
  });

  router.patch('/:id', validateBody(updateSchema), async (req, res) => {
    const website = await websiteService.updateWebsite(req.user, req.params.id, req.body);
    res.json({ website: website.toPublic() });
  });

  router.delete('/:id', async (req, res) => {
    await websiteService.deleteWebsite(req.user, req.params.id);
    res.status(204).end();
  });

  return router;
}
