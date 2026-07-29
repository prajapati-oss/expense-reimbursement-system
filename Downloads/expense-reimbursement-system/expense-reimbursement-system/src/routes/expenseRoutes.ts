import { Router } from 'express';
import * as expenseController from '../controllers/expenseController';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createExpenseSchema, updateExpenseSchema, listExpensesQuerySchema } from '../validators/expenseValidators';
import { receiptUpload } from '../middleware/upload';

const router = Router();

router.use(authenticate);

// Managers can view but not create/edit/delete expenses (they belong to employees).
router.post('/', authorize('EMPLOYEE'), validate(createExpenseSchema), expenseController.create);
router.get('/', validate(listExpensesQuerySchema, 'query'), expenseController.list);
router.get('/:id', expenseController.getOne);
router.patch('/:id', authorize('EMPLOYEE'), validate(updateExpenseSchema), expenseController.update);
router.delete('/:id', authorize('EMPLOYEE'), expenseController.remove);
router.post('/:id/receipt', authorize('EMPLOYEE'), receiptUpload, expenseController.uploadReceipt);
router.get('/:id/history', expenseController.history);

export default router;
