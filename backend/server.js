import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from './config/db.js';
import chatRoutes from './routes/chat.js';
import sessionsRoutes from './routes/sessions.js';
import telemetryRoutes from './routes/telemetry.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Security & Parsing Middleware
app.use(cors({
  origin: CLIENT_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Logging middleware in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Rate limiting protection
app.use('/api', rateLimiter);

// API Routes
app.use('/api', chatRoutes);
app.use('/api/chats', sessionsRoutes);
app.use('/api/telemetry', telemetryRoutes);

// Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Connect to MongoDB (skip during automated tests)
const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
if (!isTest) {
  connectDB();
}

// Only listen if executed directly (not when imported in tests)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain && process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(` SecureChat AI Backend API`);
    console.log(` Port:       http://localhost:${PORT}`);
    console.log(` Env:        ${process.env.NODE_ENV || 'development'}`);
    console.log(` Model:      ${process.env.OLLAMA_MODEL || 'llama3.2:1b'}`);
    console.log(` Ollama:     ${process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}`);
    console.log(` Database:   ${process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/securechat_ai'}`);
    console.log(`========================================`);
  });

  const gracefulShutdown = (signal) => {
    console.log(`\n[${signal}] Signal received. Closing HTTP server gracefully...`);
    server.close(async () => {
      console.log('[Server] HTTP connections closed.');
      try {
        await disconnectDB();
        console.log('[Database] MongoDB connection closed.');
      } catch (err) {
        console.warn('[Database] Error closing connection:', err.message);
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
