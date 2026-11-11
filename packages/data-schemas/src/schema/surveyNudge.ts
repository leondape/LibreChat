import { Schema } from 'mongoose';
import type { ISurveyNudge } from '~/types';

const surveyNudgeSchema: Schema<ISurveyNudge> = new Schema<ISurveyNudge>(
  {
    flightId: { type: String, required: true },
    user: { type: String, required: true },
    dismissals: { type: Number, required: true, default: 0 },
    lastReason: { type: String, enum: ['later', 'ignored'], required: true },
    nextAt: { type: Date, required: true },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

/** One cooldown per account and flight. */
surveyNudgeSchema.index({ tenantId: 1, flightId: 1, user: 1 }, { unique: true });

export default surveyNudgeSchema;
