import { Router } from 'express';
import * as reportController from '../controllers/reportController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate, authorize('MANAGER'));

router.get('/department-summary', reportController.departmentSummary);
router.get('/approved-reimbursements', reportController.approvedReimbursements);

export default router;
