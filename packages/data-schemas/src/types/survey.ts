import type {
  TSurveyAnswers,
  TSurveyCompany,
  TSurveyNudgeReason,
  TSurveyUsage,
} from 'librechat-data-provider';
import type { Document } from 'mongoose';

export interface SurveyFlightData {
  flightId: string;
  surveyId: string;
  surveyVersion: number;
  status: 'armed' | 'closed';
  opensAt: Date;
  closesAt?: Date;
  lookbackDays: number;
  minResponses: number;
  /** Absent on flights armed before cooldowns existed; readers fill in the default. */
  nudgeDays?: number[];
  companies: TSurveyCompany[];
  /** Absent or empty means every user. Stored emails are trimmed and lowercased. */
  audience?: string[];
  tenantId?: string;
}

export interface ISurveyFlight extends SurveyFlightData, Document {}

export interface SurveyResponseData {
  flightId: string;
  user: string;
  surveyVersion: number;
  locale?: string;
  durationSeconds?: number;
  company: string[];
  jobFunction: string;
  answers: TSurveyAnswers;
  usage: TSurveyUsage;
  submittedAt: Date;
  tenantId?: string;
}

export interface ISurveyResponse extends SurveyResponseData, Document {}

export interface SurveyNudgeData {
  flightId: string;
  user: string;
  dismissals: number;
  lastReason: TSurveyNudgeReason;
  nextAt: Date;
  tenantId?: string;
}

export interface ISurveyNudge extends SurveyNudgeData, Document {}
