import { Schema } from 'mongoose';
import type { ISurveyFlight } from '~/types';

const surveyFlightSchema: Schema<ISurveyFlight> = new Schema<ISurveyFlight>(
  {
    flightId: { type: String, required: true },
    surveyId: { type: String, required: true },
    surveyVersion: { type: Number, required: true },
    status: { type: String, enum: ['armed', 'closed'], default: 'armed', required: true },
    opensAt: { type: Date, required: true, default: Date.now },
    closesAt: { type: Date },
    lookbackDays: { type: Number, required: true },
    minResponses: { type: Number, required: true },
    nudgeDays: { type: [Number], required: true, default: () => [1, 2, 4, 7] },
    companies: { type: Schema.Types.Mixed, required: true },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

surveyFlightSchema.index({ flightId: 1, tenantId: 1 }, { unique: true });
surveyFlightSchema.index({ tenantId: 1, status: 1, opensAt: -1 });

export default surveyFlightSchema;
