import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalSetting extends Document {
  chatEnabled: boolean;
  screenShareEnabled: boolean;
  waitingRoomEnabled: boolean;
  reactionsEnabled: boolean;
  mediaEnabled: boolean;
}

const GlobalSettingSchema: Schema = new Schema({
  chatEnabled: { type: Boolean, default: true },
  screenShareEnabled: { type: Boolean, default: true },
  waitingRoomEnabled: { type: Boolean, default: false },
  reactionsEnabled: { type: Boolean, default: true },
  mediaEnabled: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model<IGlobalSetting>('GlobalSetting', GlobalSettingSchema);
