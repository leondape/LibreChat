import { Schema } from 'mongoose';
import type { ISurveyResponse } from '~/types';

const surveyResponseSchema: Schema<ISurveyResponse> = new Schema<ISurveyResponse>(
  {
    flightId: { type: String, required: true },
    user: { type: String, required: true },
    surveyVersion: { type: Number, required: true },
    locale: { type: String },
    durationSeconds: { type: Number },
    company: { type: [String], required: true },
    jobFunction: { type: String, required: true },
    answers: { type: Schema.Types.Mixed, required: true },
    usage: { type: Schema.Types.Mixed, required: true },
    submittedAt: { type: Date, required: true, default: Date.now },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

/** One response per account and flight; also serves the per-flight response count. */
surveyResponseSchema.index({ tenantId: 1, flightId: 1, user: 1 }, { unique: true });

export default surveyResponseSchema;
