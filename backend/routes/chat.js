import { Router } from 'express';
import { handleChat, handleHealthCheck } from '../controllers/chatController.js';
import { validateChatRequest } from '../middleware/validator.js';
import { securityGuardrail } from '../middleware/securityGuardrail.js';

const router = Router();

// Chat endpoint (validates payload and scans for prompt injections before processing)
router.post('/chat', validateChatRequest, securityGuardrail, handleChat);

// Health check endpoint
router.get('/health', handleHealthCheck);

export default router;
