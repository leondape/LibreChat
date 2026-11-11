import { Model } from 'mongoose';
import type { ISurveyResponse } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import surveyResponseSchema from '~/schema/surveyResponse';

export function createSurveyResponseModel(
  mongoose: typeof import('mongoose'),
): Model<ISurveyResponse> {
  applyTenantIsolation(surveyResponseSchema);
  return (
    mongoose.models.SurveyResponse ||
    mongoose.model<ISurveyResponse>('SurveyResponse', surveyResponseSchema)
  );
}
