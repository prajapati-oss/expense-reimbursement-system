import { Router } from 'express';
import * as categoryController from '../controllers/categoryController';
import { authenticate } from '../middleware/auth';

const router = Router();
router.get('/', authenticate, categoryController.list);
export default router;
