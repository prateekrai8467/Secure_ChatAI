import { Router } from 'express';
import { handleChat, handleHealthCheck } from '../controllers/chatController.js';
import { validateChatRequest } from '../middleware/validator.js';

const router = Router();

// Chat endpoint (validates payload before passing to controller)
router.post('/chat', validateChatRequest, handleChat);

// Health check endpoint
router.get('/health', handleHealthCheck);

export default router;
