import mongoose, { Schema, Document } from 'mongoose';

export interface IAnalyticsLog extends Document {
  event: 'meeting_created' | 'meeting_joined' | 'meeting_left' | 'user_login' | 'meeting_ended';
  userId?: mongoose.Types.ObjectId;
  meetingId?: mongoose.Types.ObjectId;
  meetingCode?: string;
  duration?: number; // in seconds
  timestamp: Date;
}

const AnalyticsLogSchema: Schema = new Schema({
  event: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting' },
  meetingCode: { type: String },
  duration: { type: Number },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model<IAnalyticsLog>('AnalyticsLog', AnalyticsLogSchema);
