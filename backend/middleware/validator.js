/**
 * Request validation middleware for chat endpoints.
 * Validates message formats, whitelists roles, and prevents oversized payloads.
 */

const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTEXT_TURNS = 20;
const ALLOWED_ROLES = new Set(['user', 'assistant']);

export const validateChatRequest = (req, res, next) => {
  const { message, messages } = req.body || {};

  // Case 1: Simple single-message request
  if (message !== undefined) {
    if (typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: "message" must be a string.'
      });
    }

    const trimmed = message.trim();
    if (!trimmed) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: "message" cannot be empty.'
      });
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Message exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`
      });
    }

    req.validatedInput = {
      isMultiTurn: false,
      userMessage: trimmed,
      messages: [{ role: 'user', content: trimmed }]
    };

    return next();
  }

  // Case 2: Multi-turn messages array
  if (messages !== undefined) {
    if (!Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: "messages" must be an array of message objects.'
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: "messages" array cannot be empty.'
      });
    }

    if (messages.length > MAX_CONTEXT_TURNS) {
      return res.status(400).json({
        success: false,
        error: `History length exceeds maximum of ${MAX_CONTEXT_TURNS} messages.`
      });
    }

    const cleanedMessages = [];
    for (let i = 0; i < messages.length; i++) {
      const item = messages[i];
      if (!item || typeof item !== 'object') {
        return res.status(400).json({
          success: false,
          error: `Message at index ${i} must be an object with "role" and "content".`
        });
      }

      if (!ALLOWED_ROLES.has(item.role)) {
        return res.status(400).json({
          success: false,
          error: `Role "${item.role}" at index ${i} is not allowed. Only "user" and "assistant" are accepted.`
        });
      }

      if (typeof item.content !== 'string' || !item.content.trim()) {
        return res.status(400).json({
          success: false,
          error: `Message content at index ${i} must be a non-empty string.`
        });
      }

      const contentTrimmed = item.content.trim();
      if (contentTrimmed.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `Message content at index ${i} exceeds ${MAX_MESSAGE_LENGTH} characters.`
        });
      }

      cleanedMessages.push({
        role: item.role,
        content: contentTrimmed
      });
    }

    const lastMessage = cleanedMessages[cleanedMessages.length - 1];
    if (lastMessage.role !== 'user') {
      return res.status(400).json({
        success: false,
        error: 'The final message in the conversation history must be from the "user".'
      });
    }

    req.validatedInput = {
      isMultiTurn: true,
      userMessage: lastMessage.content,
      messages: cleanedMessages
    };

    return next();
  }

  // Neither provided
  return res.status(400).json({
    success: false,
    error: 'Invalid request: Either "message" (string) or "messages" (array) must be provided.'
  });
};
