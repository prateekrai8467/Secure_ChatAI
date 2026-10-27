import mongoose from 'mongoose';
import { SecurityTelemetry } from '../models/SecurityTelemetry.js';

const isDBConnected = () => mongoose.connection.readyState === 1;

/**
 * Get aggregate security telemetry statistics.
 */
export const getTelemetryStats = async (req, res, next) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database storage is temporarily offline.'
    });
  }

  try {
    const [totalScans, actionCounts, classificationCounts, recentEvents] = await Promise.all([
      SecurityTelemetry.countDocuments(),
      SecurityTelemetry.aggregate([
        { $group: { _id: '$actionTaken', count: { $sum: 1 } } }
      ]),
      SecurityTelemetry.aggregate([
        { $group: { _id: '$classification', count: { $sum: 1 } } }
      ]),
      SecurityTelemetry.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    const actions = { allowed: 0, blocked: 0, flagged: 0, sanitized: 0 };
    actionCounts.forEach(item => {
      if (item._id) actions[item._id] = item.count;
    });

    const classifications = {};
    classificationCounts.forEach(item => {
      if (item._id) classifications[item._id] = item.count;
    });

    return res.status(200).json({
      success: true,
      stats: {
        totalScans,
        actions,
        classifications,
        threatsPrevented: (actions.blocked || 0) + (actions.sanitized || 0),
        recentEvents
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List paginated telemetry event logs with optional category filter.
 */
export const listTelemetryEvents = async (req, res, next) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database storage is temporarily offline.'
    });
  }

  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.action) query.actionTaken = req.query.action;
    if (req.query.classification) query.classification = req.query.classification;
    if (req.query.sessionId && mongoose.Types.ObjectId.isValid(req.query.sessionId)) {
      query.sessionId = req.query.sessionId;
    }

    const [events, total] = await Promise.all([
      SecurityTelemetry.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SecurityTelemetry.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      events
    });
  } catch (err) {
    next(err);
  }
};
