import { Router } from 'express';
import {
  listSessions,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  clearMessages
} from '../controllers/sessionController.js';

const router = Router();

router.get('/', listSessions);
router.post('/', createSession);
router.get('/:id', getSession);
router.patch('/:id', updateSession);
router.delete('/:id', deleteSession);
router.delete('/:id/messages', clearMessages);

export default router;
