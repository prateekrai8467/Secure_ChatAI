import mongoose from 'mongoose';

const SecurityTelemetrySchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatSession',
      default: null,
      index: true
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      default: 'user'
    },
    promptSnippet: {
      type: String,
      required: true,
      maxlength: [500, 'Prompt snippet cannot exceed 500 characters']
    },
    threatScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      index: true
    },
    classification: {
      type: String,
      enum: ['benign', 'direct_injection', 'indirect_injection', 'jailbreak', 'system_leak'],
      default: 'benign',
      index: true
    },
    actionTaken: {
      type: String,
      enum: ['allowed', 'blocked', 'flagged', 'sanitized'],
      default: 'allowed',
      index: true
    },
    detectedTokens: {
      type: [String],
      default: []
    },
    latencyMs: {
      type: Number,
      default: 0
    },
    ipAddress: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

SecurityTelemetrySchema.index({ createdAt: -1 });

export const SecurityTelemetry = mongoose.model('SecurityTelemetry', SecurityTelemetrySchema);
export default SecurityTelemetry;
