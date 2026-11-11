import { Model } from 'mongoose';
import type { ISurveyNudge } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import surveyNudgeSchema from '~/schema/surveyNudge';

export function createSurveyNudgeModel(mongoose: typeof import('mongoose')): Model<ISurveyNudge> {
  applyTenantIsolation(surveyNudgeSchema);
  return (
    mongoose.models.SurveyNudge || mongoose.model<ISurveyNudge>('SurveyNudge', surveyNudgeSchema)
  );
}
