import { logger } from '@librechat/data-schemas';
import {
  SURVEY_DEFAULT_NUDGE_DAYS,
  SURVEY_VERSION,
  parseSurveyAnswers,
  surveyNudgeSchema,
  surveySubmissionSchema,
} from 'librechat-data-provider';
import type { TSurveyNudgeResult, TSurveyResult, TSurveyStatus } from 'librechat-data-provider';
import type { SurveyMethods, SurveyUsageMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { getSafeErrorMetadata } from '~/utils/errors';

type SurveyHandlerDeps = Pick<
  SurveyMethods,
  | 'getArmedSurveyFlight'
  | 'hasSurveyResponse'
  | 'createSurveyResponse'
  | 'getSurveyComparison'
  | 'getSurveyNudge'
  | 'recordSurveyNudge'
> &
  Pick<SurveyUsageMethods, 'getUserUsageSnapshot'>;

const dayMs = 24 * 60 * 60 * 1000;

/** `interface.survey: false` hides the survey even while a flight is armed. */
const isSurveyEnabled = (req: ServerRequest) => req.config?.interfaceConfig?.survey !== false;

const error = (res: Response, status: number, code: string, message: string, fields?: string[]) =>
  res.status(status).json({ code, message, ...(fields ? { fields } : {}) });

const closedStatus = { flight: null, submitted: false, nextNudgeAt: null } satisfies TSurveyStatus;

const nudgeSchedule = (days?: number[]) => (days?.length ? days : [...SURVEY_DEFAULT_NUDGE_DAYS]);

/** A flight written by an older build asks questions this build no longer accepts. */
function isCurrentSurvey(flight: { surveyVersion: number }): boolean {
  return flight.surveyVersion === SURVEY_VERSION;
}

/** An empty or missing audience is the whole deployment. Stored emails are lowercase. */
function isInSurveyAudience(flight: { audience?: string[] }, email?: string): boolean {
  if (!flight.audience?.length) {
    return true;
  }
  return email != null && flight.audience.includes(email.toLowerCase());
}

export function createSurveyStatusHandler({
  getArmedSurveyFlight,
  hasSurveyResponse,
  getSurveyNudge,
}: Pick<SurveyHandlerDeps, 'getArmedSurveyFlight' | 'hasSurveyResponse' | 'getSurveyNudge'>) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        error(res, 401, 'unauthenticated', 'Authentication required');
        return;
      }
      if (!isSurveyEnabled(req)) {
        res.json(closedStatus);
        return;
      }
      const flight = await getArmedSurveyFlight();
      if (!flight || !isCurrentSurvey(flight) || !isInSurveyAudience(flight, req.user.email)) {
        res.json(closedStatus);
        return;
      }
      const [submitted, nudge] = await Promise.all([
        hasSurveyResponse(flight.flightId, req.user.id),
        getSurveyNudge(flight.flightId, req.user.id, req.user.tenantId),
      ]);
      res.json({
        flight: {
          flightId: flight.flightId,
          surveyVersion: flight.surveyVersion,
          lookbackDays: flight.lookbackDays,
          minResponses: flight.minResponses,
          companies: flight.companies,
        },
        submitted,
        nextNudgeAt: nudge ? nudge.nextAt.toISOString() : null,
      } satisfies TSurveyStatus);
    } catch (err) {
      logger.error('[Survey] Failed to load survey status', getSafeErrorMetadata(err));
      error(res, 500, 'internal_error', 'Failed to load the survey');
    }
  };
}

export function createSurveySubmitHandler({
  getArmedSurveyFlight,
  hasSurveyResponse,
  createSurveyResponse,
  getSurveyComparison,
  getUserUsageSnapshot,
}: Omit<SurveyHandlerDeps, 'getSurveyNudge' | 'recordSurveyNudge'>) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        error(res, 401, 'unauthenticated', 'Authentication required');
        return;
      }
      const userId = req.user.id;
      const submission = surveySubmissionSchema.safeParse(req.body);
      if (!submission.success) {
        error(res, 400, 'invalid_answers', 'Invalid survey submission');
        return;
      }
      const flight = isSurveyEnabled(req) ? await getArmedSurveyFlight() : null;
      if (
        !flight ||
        !isCurrentSurvey(flight) ||
        flight.flightId !== submission.data.flightId ||
        !isInSurveyAudience(flight, req.user.email)
      ) {
        error(res, 409, 'survey_closed', 'This survey is closed');
        return;
      }
      const parsed = parseSurveyAnswers(submission.data.answers, flight.companies);
      if (!parsed.ok) {
        error(res, 400, 'invalid_answers', 'Invalid survey answers', parsed.error.fields);
        return;
      }
      if (await hasSurveyResponse(flight.flightId, userId)) {
        error(res, 409, 'already_submitted', 'You have already submitted this survey');
        return;
      }

      const to = new Date();
      const { usage, activity } = await getUserUsageSnapshot({
        userId,
        from: new Date(to.getTime() - flight.lookbackDays * dayMs),
        to,
        windowDays: flight.lookbackDays,
      });
      const created = await createSurveyResponse({
        flightId: flight.flightId,
        user: userId,
        surveyVersion: flight.surveyVersion,
        locale: submission.data.locale,
        durationSeconds: submission.data.durationSeconds,
        company: parsed.value.company,
        jobFunction: parsed.value.jobFunction,
        answers: parsed.value,
        usage,
        submittedAt: to,
        tenantId: req.user.tenantId,
      });
      if (!created.ok) {
        error(res, 409, created.error.code, 'You have already submitted this survey');
        return;
      }

      const comparison = await getSurveyComparison(flight.flightId, flight.minResponses, usage);
      res.status(201).json({ usage, activity, comparison } satisfies TSurveyResult);
    } catch (err) {
      logger.error('[Survey] Failed to submit survey', getSafeErrorMetadata(err));
      error(res, 500, 'internal_error', 'Failed to submit the survey');
    }
  };
}

export function createSurveyNudgeHandler({
  getArmedSurveyFlight,
  hasSurveyResponse,
  recordSurveyNudge,
}: Pick<SurveyHandlerDeps, 'getArmedSurveyFlight' | 'hasSurveyResponse' | 'recordSurveyNudge'>) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        error(res, 401, 'unauthenticated', 'Authentication required');
        return;
      }
      const nudge = surveyNudgeSchema.safeParse(req.body);
      if (!nudge.success) {
        error(res, 400, 'invalid_nudge', 'Invalid survey nudge');
        return;
      }
      const flight = isSurveyEnabled(req) ? await getArmedSurveyFlight() : null;
      if (
        !flight ||
        !isCurrentSurvey(flight) ||
        flight.flightId !== nudge.data.flightId ||
        !isInSurveyAudience(flight, req.user.email)
      ) {
        error(res, 409, 'survey_closed', 'This survey is closed');
        return;
      }
      if (await hasSurveyResponse(flight.flightId, req.user.id)) {
        error(res, 409, 'already_submitted', 'You have already submitted this survey');
        return;
      }
      const recorded = await recordSurveyNudge({
        flightId: flight.flightId,
        user: req.user.id,
        reason: nudge.data.reason,
        schedule: nudgeSchedule(flight.nudgeDays),
        tenantId: req.user.tenantId,
      });
      res.json({
        nextNudgeAt: recorded.nextAt.toISOString(),
        delayDays: recorded.delayDays,
      } satisfies TSurveyNudgeResult);
    } catch (err) {
      logger.error('[Survey] Failed to record survey nudge', getSafeErrorMetadata(err));
      error(res, 500, 'internal_error', 'Failed to record the survey nudge');
    }
  };
}
