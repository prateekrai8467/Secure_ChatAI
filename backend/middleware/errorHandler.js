/**
 * Centralized error handler middleware.
 * Ensures security by sanitizing internal system errors and logging appropriately.
 */

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
};

export const errorHandler = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  
  // Safe console logging for developers
  console.error(`[Error] ${err.name || 'ApplicationError'}: ${err.message}`);
  if (isDev && err.stack) {
    console.error(err.stack);
  }

  // Handle JSON parse errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload in request body.'
    });
  }

  // Handle Ollama connection refusal
  if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
    return res.status(503).json({
      success: false,
      error: 'AI Model service is temporarily unavailable. Ensure Ollama is running.'
    });
  }

  // Handle timeouts
  if (err.name === 'AbortError' || err.code === 'ETIMEDOUT') {
    return res.status(504).json({
      success: false,
      error: 'AI Model inference timed out. The model took too long to respond.'
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: isDev ? err.message : 'An unexpected internal server error occurred.'
  });
};
