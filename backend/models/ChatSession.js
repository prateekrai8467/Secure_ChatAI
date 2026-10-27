import mongoose from 'mongoose';

const ChatSessionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Session title is required'],
      trim: true,
      default: 'New Conversation',
      maxlength: [120, 'Title cannot exceed 120 characters']
    },
    model: {
      type: String,
      required: true,
      default: 'llama3.2:1b'
    },
    systemPrompt: {
      type: String,
      default: null,
      maxlength: [2000, 'System prompt cannot exceed 2000 characters']
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual to populate messages belonging to this session
ChatSessionSchema.virtual('messages', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'sessionId',
  justOne: false
});

// Index for listing user chats in chronological descending order
ChatSessionSchema.index({ updatedAt: -1 });

export const ChatSession = mongoose.model('ChatSession', ChatSessionSchema);
export default ChatSession;
