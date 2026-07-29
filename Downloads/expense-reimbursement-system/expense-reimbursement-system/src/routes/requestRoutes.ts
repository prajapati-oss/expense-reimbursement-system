import { Router } from 'express';
import * as requestController from '../controllers/requestController';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createRequestSchema, reviewRequestSchema, listRequestsQuerySchema } from '../validators/requestValidators';

const router = Router();

router.use(authenticate);

router.post('/', authorize('EMPLOYEE'), validate(createRequestSchema), requestController.submit);
router.get('/', validate(listRequestsQuerySchema, 'query'), requestController.list);
router.get('/:id', requestController.getOne);
router.get('/:id/history', requestController.history);
router.post('/:id/approve', authorize('MANAGER'), validate(reviewRequestSchema), requestController.approve);
router.post('/:id/reject', authorize('MANAGER'), validate(reviewRequestSchema), requestController.reject);

export default router;
