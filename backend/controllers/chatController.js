import { ollamaService } from '../services/ollamaService.js';

/**
 * Handle chat requests from clients.
 */
export const handleChat = async (req, res, next) => {
  try {
    const { messages, userMessage, isMultiTurn } = req.validatedInput;

    const result = await ollamaService.chat(messages);

    return res.status(200).json({
      success: true,
      answer: result.answer,
      metadata: {
        model: result.model,
        durationMs: result.durationMs,
        tokens: {
          prompt: result.promptTokens,
          completion: result.evalTokens
        },
        multiTurn: isMultiTurn
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Health-check endpoint returning system and SLM status.
 */
export const handleHealthCheck = async (req, res) => {
  const ollamaHealth = await ollamaService.checkHealth();

  const statusCode = ollamaHealth.isRunning ? 200 : 503;

  return res.status(statusCode).json({
    status: ollamaHealth.isRunning ? 'healthy' : 'degraded',
    service: 'SecureChat AI Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    ollama: {
      connected: ollamaHealth.isRunning,
      models: ollamaHealth.models || [],
      error: ollamaHealth.error || null
    }
  });
};
