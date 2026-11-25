import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as adminService from '../services/admin.service.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
});
const updateUserSchema = z.object({ disabled: z.boolean() });

export function createAdminRouter(config) {
  const router = Router();
  router.use(requireAuth(config), requireRole('admin'));

  router.get('/users', async (req, res) => {
    res.json(await adminService.listUsers(pageSchema.parse(req.query)));
  });

  router.patch('/users/:id', validateBody(updateUserSchema), async (req, res) => {
    const user = await adminService.setUserDisabled({
      actorId: req.user.id,
      userId: req.params.id,
      disabled: req.body.disabled,
    });
    res.json({ user: user.toPublic() });
  });

  return router;
}
