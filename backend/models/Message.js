import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatSession',
      required: [true, 'Message must belong to a chat session'],
      index: true
    },
    role: {
      type: String,
      enum: {
        values: ['user', 'assistant', 'system'],
        message: 'Role must be user, assistant, or system'
      },
      required: [true, 'Message role is required']
    },
    content: {
      type: String,
      required: [true, 'Message content cannot be empty'],
      trim: true,
      maxlength: [8000, 'Message content cannot exceed 8000 characters']
    },
    model: {
      type: String,
      default: 'llama3.2:1b'
    },
    tokens: {
      prompt: { type: Number, default: 0 },
      completion: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    durationMs: {
      type: Number,
      default: 0
    },
    security: {
      isFlagged: { type: Boolean, default: false, index: true },
      threatScore: { type: Number, default: 0, min: 0, max: 1 },
      category: {
        type: String,
        enum: ['benign', 'prompt_injection', 'jailbreak', 'leakage', 'anomaly'],
        default: 'benign'
      },
      flagReason: { type: String, default: null }
    }
  },
  {
    timestamps: true
  }
);

// Compound index for querying a session's messages in chronological order
MessageSchema.index({ sessionId: 1, createdAt: 1 });

export const Message = mongoose.model('Message', MessageSchema);
export default Message;
