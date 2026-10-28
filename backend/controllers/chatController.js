import mongoose from 'mongoose';
import { ollamaService } from '../services/ollamaService.js';
import { detectionClient } from '../services/detectionClient.js';
import { getDBStatus } from '../config/db.js';
import { ChatSession } from '../models/ChatSession.js';
import { Message } from '../models/Message.js';

/**
 * Handle chat requests from clients.
 * Supports stateless chat as well as persistent multi-turn storage when sessionId is provided.
 */
export const handleChat = async (req, res, next) => {
  try {
    const { messages, userMessage, isMultiTurn, sessionId } = req.validatedInput;
    const dbStatus = getDBStatus();

    let session = null;
    let customSystemPrompt = null;

    // Check or auto-create session in MongoDB when DB is online
    if (dbStatus.connected) {
      if (sessionId) {
        session = await ChatSession.findOne({ _id: sessionId, isActive: true });
        if (!session) {
          return res.status(404).json({
            success: false,
            error: `Chat session ${sessionId} not found or has been closed.`
          });
        }
      } else {
        try {
          const autoTitle = userMessage.length > 36
            ? `${userMessage.substring(0, 36).trim()}...`
            : userMessage.trim();
          session = await ChatSession.create({
            title: autoTitle,
            model: process.env.OLLAMA_MODEL || 'llama3.2:1b'
          });
        } catch (dbErr) {
          console.warn('[Database] Failed to auto-create session:', dbErr.message);
        }
      }

      if (session && session.systemPrompt) {
        customSystemPrompt = session.systemPrompt;
      }
    }

    // Call Ollama inference service
    const options = {};
    if (customSystemPrompt) {
      options.systemPrompt = customSystemPrompt;
    }

    const result = await ollamaService.chat(messages, options);

    // Save messages to MongoDB if persistent session is active
    let savedUserMsgId = null;
    let savedAssistantMsgId = null;

    if (session && dbStatus.connected) {
      try {
        const [savedUser, savedAssistant] = await Promise.all([
          Message.create({
            sessionId: session._id,
            role: 'user',
            content: userMessage,
            model: result.model
          }),
          Message.create({
            sessionId: session._id,
            role: 'assistant',
            content: result.answer,
            model: result.model,
            tokens: {
              prompt: result.promptTokens,
              completion: result.evalTokens,
              total: result.promptTokens + result.evalTokens
            },
            durationMs: result.durationMs
          })
        ]);

        savedUserMsgId = savedUser._id;
        savedAssistantMsgId = savedAssistant._id;

        // Auto-generate title if session is brand new
        const sessionUpdates = {
          $inc: { messageCount: 2 },
          lastMessageAt: new Date()
        };

        if (session.title === 'New Conversation' && session.messageCount === 0) {
          sessionUpdates.title = userMessage.length > 42
            ? `${userMessage.substring(0, 42).trim()}...`
            : userMessage.trim();
        }

        await ChatSession.findByIdAndUpdate(session._id, sessionUpdates);
      } catch (dbErr) {
        // Log DB save error without failing the inference response to the user
        console.error('[Database] Failed to persist messages:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      answer: result.answer,
      sessionId: session ? session._id : null,
      messageIds: savedAssistantMsgId ? { user: savedUserMsgId, assistant: savedAssistantMsgId } : null,
      security: req.securityScan ? {
        threatScore: req.securityScan.threat_score,
        classification: req.securityScan.classification,
        actionTaken: req.securityScan.action,
        riskLevel: req.securityScan.risk_level,
        detectedTokens: req.securityScan.detected_tokens || [],
        latencyMs: req.securityScan.latency_ms || 0,
        engine: req.securityScan.engine || 'ml_linear_svm'
      } : null,
      metadata: {
        model: result.model,
        durationMs: result.durationMs,
        tokens: {
          prompt: result.promptTokens,
          completion: result.evalTokens
        },
        multiTurn: isMultiTurn,
        persisted: Boolean(session && savedAssistantMsgId)
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Health-check endpoint returning system, SLM, detection microservice, and MongoDB status.
 */
export const handleHealthCheck = async (req, res) => {
  const [ollamaHealth, detectionHealth] = await Promise.all([
    ollamaService.checkHealth(),
    detectionClient.checkHealth()
  ]);
  const dbHealth = getDBStatus();

  const isHealthy = ollamaHealth.isRunning && dbHealth.connected;
  const isPartiallyAvailable = ollamaHealth.isRunning || dbHealth.connected || detectionHealth.connected;

  return res.status(isPartiallyAvailable ? 200 : 503).json({
    status: isHealthy ? 'healthy' : isPartiallyAvailable ? 'degraded' : 'unhealthy',
    service: 'SecureChat AI Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    ollama: {
      connected: ollamaHealth.isRunning,
      models: ollamaHealth.models || [],
      error: ollamaHealth.error || null
    },
    detectionService: {
      connected: detectionHealth.connected,
      modelLoaded: detectionHealth.modelLoaded || false,
      algorithm: detectionHealth.metadata?.algorithm || 'Linear SVM (Calibrated Sigmoid) + TF-IDF'
    },
    database: {
      connected: dbHealth.connected,
      state: dbHealth.state,
      name: dbHealth.name
    }
  });
};
