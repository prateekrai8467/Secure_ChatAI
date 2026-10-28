/**
 * Security Guardrail Middleware.
 * Inspects incoming prompts via the ML prompt injection detection engine.
 * Blocks adversarial inputs, enforces policy, and records telemetry events.
 */

import mongoose from 'mongoose';
import { detectionClient } from '../services/detectionClient.js';
import { SecurityTelemetry } from '../models/SecurityTelemetry.js';

const isDBConnected = () => mongoose.connection.readyState === 1;

export const securityGuardrail = async (req, res, next) => {
  try {
    const { userMessage, sessionId } = req.validatedInput || {};

    if (!userMessage) {
      return next();
    }

    // Scan user message with detection service (ML Linear SVM + fallback heuristics)
    const scanResult = await detectionClient.scan(userMessage, sessionId);
    req.securityScan = scanResult;

    // Asynchronously persist security telemetry in MongoDB
    if (isDBConnected()) {
      try {
        await SecurityTelemetry.create({
          sessionId: sessionId || null,
          role: 'user',
          promptSnippet: userMessage.length > 500 ? userMessage.substring(0, 500) : userMessage,
          threatScore: Math.min(Math.max(scanResult.threat_score || 0, 0), 1),
          classification: scanResult.classification || 'benign',
          actionTaken: scanResult.action || 'allowed',
          detectedTokens: scanResult.detected_tokens || [],
          latencyMs: scanResult.latency_ms || 0
        });
      } catch (telemetryErr) {
        console.warn('[Telemetry] Failed to persist scan record:', telemetryErr.message);
      }
    }

    // Enforcement Policy: Block high-threat adversarial inputs
    if (scanResult.action === 'blocked') {
      return res.status(403).json({
        success: false,
        blocked: true,
        reason: 'Security Policy Violation: Adversarial prompt injection or jailbreak detected.',
        security: {
          threatScore: scanResult.threat_score,
          classification: scanResult.classification,
          actionTaken: scanResult.action,
          riskLevel: scanResult.risk_level,
          detectedTokens: scanResult.detected_tokens || [],
          explanation: scanResult.explanation || 'Adversarial prompt injection detected and blocked.',
          engine: scanResult.engine || 'ml_linear_svm'
        }
      });
    }

    // Pass through flagged or allowed requests
    next();
  } catch (err) {
    console.error('[Security Guardrail] Error during prompt scanning:', err);
    // Fail-open or fallback to proceed if unexpected middleware crash
    next();
  }
};

export default securityGuardrail;
