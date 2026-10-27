import mongoose from 'mongoose';
import { ChatSession } from '../models/ChatSession.js';
import { Message } from '../models/Message.js';
import { SecurityTelemetry } from '../models/SecurityTelemetry.js';

const isDBConnected = () => mongoose.connection.readyState === 1;

/**
 * List all active chat sessions sorted by recent activity.
 */
export const listSessions = async (req, res, next) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database storage is temporarily offline. Chat sessions cannot be loaded.'
    });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const sessions = await ChatSession.find({ isActive: true })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select('title model messageCount lastMessageAt createdAt updatedAt')
      .lean();

    return res.status(200).json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Create a new chat session.
 */
export const createSession = async (req, res, next) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database storage is temporarily offline. Cannot create new chat session.'
    });
  }

  try {
    const { title, systemPrompt, model } = req.body || {};

    const newSession = await ChatSession.create({
      title: title?.trim() || 'New Conversation',
      systemPrompt: systemPrompt?.trim() || null,
      model: model || process.env.OLLAMA_MODEL || 'llama3.2:1b'
    });

    return res.status(201).json({
      success: true,
      session: newSession
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get a specific chat session and its full message history.
 */
export const getSession = async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID format.'
    });
  }

  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database storage is temporarily offline.'
    });
  }

  try {
    const session = await ChatSession.findOne({ _id: id, isActive: true });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found.'
      });
    }

    const messages = await Message.find({ sessionId: id })
      .sort({ createdAt: 1 })
      .select('role content model tokens durationMs security createdAt')
      .lean();

    return res.status(200).json({
      success: true,
      session,
      messages
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update session details (e.g., custom title or system prompt).
 */
export const updateSession = async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID format.'
    });
  }

  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database storage is temporarily offline.'
    });
  }

  try {
    const { title, systemPrompt } = req.body || {};
    const updates = {};
    if (typeof title === 'string' && title.trim()) updates.title = title.trim();
    if (typeof systemPrompt === 'string') updates.systemPrompt = systemPrompt.trim();

    const session = await ChatSession.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found.'
      });
    }

    return res.status(200).json({
      success: true,
      session
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a session (soft delete by default, permanent with ?permanent=true).
 */
export const deleteSession = async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID format.'
    });
  }

  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database storage is temporarily offline.'
    });
  }

  try {
    const permanent = req.query.permanent === 'true';

    if (permanent) {
      await Promise.all([
        ChatSession.findByIdAndDelete(id),
        Message.deleteMany({ sessionId: id }),
        SecurityTelemetry.deleteMany({ sessionId: id })
      ]);
    } else {
      await ChatSession.findByIdAndUpdate(id, { isActive: false });
    }

    return res.status(200).json({
      success: true,
      message: 'Chat session deleted successfully.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Clear all messages in a session while retaining the session record.
 */
export const clearMessages = async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID format.'
    });
  }

  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database storage is temporarily offline.'
    });
  }

  try {
    await Message.deleteMany({ sessionId: id });
    await ChatSession.findByIdAndUpdate(id, {
      messageCount: 0,
      lastMessageAt: new Date()
    });

    return res.status(200).json({
      success: true,
      message: 'Message history cleared successfully.'
    });
  } catch (err) {
    next(err);
  }
};
