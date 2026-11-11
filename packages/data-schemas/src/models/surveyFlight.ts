import { Model } from 'mongoose';
import type { ISurveyFlight } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import surveyFlightSchema from '~/schema/surveyFlight';

export function createSurveyFlightModel(mongoose: typeof import('mongoose')): Model<ISurveyFlight> {
  applyTenantIsolation(surveyFlightSchema);
  return (
    mongoose.models.SurveyFlight ||
    mongoose.model<ISurveyFlight>('SurveyFlight', surveyFlightSchema)
  );
}
