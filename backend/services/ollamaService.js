import { ollamaConfig } from '../config/ollama.js';

/**
 * Service to interact with the local Ollama Small Language Model instance.
 */
class OllamaService {
  constructor(config = ollamaConfig) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.defaultSystemPrompt = config.defaultSystemPrompt;
  }

  /**
   * Check whether Ollama daemon is reachable and responding.
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        return { isRunning: false, error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      return {
        isRunning: true,
        models: data.models || []
      };
    } catch (err) {
      return {
        isRunning: false,
        error: err.message
      };
    }
  }

  /**
   * Send a conversation history to Ollama and get an assistant response.
   * Prepends the secure system prompt while keeping client messages bounded.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options]
   * @returns {Promise<{answer: string, model: string, durationMs: number, promptTokens: number, evalTokens: number}>}
   */
  async chat(messages, options = {}) {
    const targetModel = options.model || this.model;
    const systemPrompt = options.systemPrompt || this.defaultSystemPrompt;

    // Build the payload with the system prompt securely placed at turn 0
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const startTime = Date.now();
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          messages: fullMessages,
          stream: false,
          options: {
            temperature: 0.7,
            num_ctx: 2048 // Keep context window bounded for CPU inference
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama returned status ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const durationMs = Date.now() - startTime;

      return {
        answer: data.message?.content || '',
        model: data.model || targetModel,
        durationMs,
        promptTokens: data.prompt_eval_count || 0,
        evalTokens: data.eval_count || 0
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutError = new Error(`Ollama inference timed out after ${this.timeoutMs}ms.`);
        timeoutError.statusCode = 504;
        throw timeoutError;
      }
      throw err;
    }
  }
}

export const ollamaService = new OllamaService();
export { OllamaService };
