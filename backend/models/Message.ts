import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  meetingId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  text: string;
  type: 'text' | 'file';
  fileUrl?: string;
  reactions: { user: mongoose.Types.ObjectId; emoji: string }[];
}

const MessageSchema: Schema = new Schema({
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  type: { type: String, enum: ['text', 'file'], default: 'text' },
  fileUrl: { type: String },
  reactions: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String }
  }]
}, { timestamps: true });

export default mongoose.model<IMessage>('Message', MessageSchema);
