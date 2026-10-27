import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

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

// API Routes
app.use('/api', chatRoutes);

// Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

import { fileURLToPath } from 'url';

// Only listen if executed directly (not when imported in tests)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(` SecureChat AI Backend API`);
    console.log(` Port:    http://localhost:${PORT}`);
    console.log(` Env:     ${process.env.NODE_ENV || 'development'}`);
    console.log(` Model:   ${process.env.OLLAMA_MODEL || 'llama3.2:1b'}`);
    console.log(` Ollama:  ${process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}`);
    console.log(`========================================`);
  });
}

export default app;
