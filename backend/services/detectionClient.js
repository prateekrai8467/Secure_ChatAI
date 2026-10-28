/**
 * Detection Service Client.
 * Connects to the Python Machine Learning Prompt Injection Detection Microservice
 * with fast timeout and transparent fallback to heuristic guardrails.
 */

import { fallbackScan } from './fallbackGuardrail.js';

const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL || 'http://127.0.0.1:8000';
const DETECTION_TIMEOUT_MS = parseInt(process.env.DETECTION_TIMEOUT_MS, 10) || 1500;

export const detectionClient = {
  /**
   * Scan prompt text for adversarial injections and threat metrics.
   *
   * @param {string} text - User prompt to scan
   * @param {string|null} sessionId - Associated session ID
   * @returns {Promise<Object>} Scan results
   */
  async scan(text, sessionId = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DETECTION_TIMEOUT_MS);

    try {
      const response = await fetch(`${DETECTION_SERVICE_URL}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Detection service responded with status ${response.status}`);
      }

      const data = await response.json();
      return {
        ...data,
        engine: 'ml_linear_svm'
      };
    } catch (err) {
      clearTimeout(timeoutId);
      // Graceful fallback: log and use embedded heuristic scanner
      return fallbackScan(text);
    }
  },

  /**
   * Check connection to detection service.
   */
  async checkHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    try {
      const response = await fetch(`${DETECTION_SERVICE_URL}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        return {
          connected: true,
          modelLoaded: data.model_loaded,
          metadata: data.metadata || null
        };
      }
      return { connected: false, error: `Status ${response.status}` };
    } catch (err) {
      clearTimeout(timeoutId);
      return { connected: false, error: err.message };
    }
  }
};

export default detectionClient;
