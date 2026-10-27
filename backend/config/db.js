import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/securechat_ai';

let isConnected = false;

/**
 * Connect to MongoDB with resilient fallback.
 * Prevents server crash if local MongoDB is offline.
 */
export const connectDB = async () => {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000, // Quick timeout for graceful degradation
      connectTimeoutMS: 5000
    });

    isConnected = conn.connection.readyState === 1;
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    isConnected = false;
    console.warn(`[Database] MongoDB connection failed: ${err.message}`);
    console.warn('[Database] Running in stateless / degraded storage mode.');
  }

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[Database] MongoDB disconnected.');
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    console.log('[Database] MongoDB reconnected.');
  });
};

/**
 * Get current database status.
 */
export const getDBStatus = () => {
  const readyState = mongoose.connection.readyState;
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return {
    connected: readyState === 1,
    state: ['disconnected', 'connected', 'connecting', 'disconnecting'][readyState] || 'unknown',
    uri: MONGODB_URI.replace(/\/\/[^@]+@/, '//***@'), // Redact credentials if any
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
};

export default connectDB;
