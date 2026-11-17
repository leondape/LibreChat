import { SURVEY_VERSION } from 'librechat-data-provider';
import type { TSurveyAnswers, TSurveyUsage } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import {
  createSurveyNudgeHandler,
  createSurveyStatusHandler,
  createSurveySubmitHandler,
} from './handlers';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

const flight = {
  flightId: 'f1',
  surveyId: 'wangpt-kpi',
  surveyVersion: SURVEY_VERSION,
  status: 'armed' as const,
  opensAt: new Date(),
  lookbackDays: 30,
  minResponses: 50,
  companies: [{ id: 'a', name: 'A' }],
};

const answers: TSurveyAnswers = {
  company: ['a'],
  jobFunction: 'legal',
  bestTask: {
    kind: 'write',
    note: 'Weekly pitch deck',
    durationWithout: 'one_two_h',
    durationWith: 'thirty_60',
    frequency: 'weekly',
  },
  hoursSaved: { range: 'none' },
  improvement: 3,
  enabled: false,
  replaced: ['nothing'],
  disappointment: 'not',
  letdowns: ['nowhere'],
  wishes: ['training'],
  culture: 'never',
  satisfaction: 5,
  contact: false,
};

const usage = { version: 1, windowDays: 30, messagesSent: 7 } as TSurveyUsage;

const createResponse = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { response: { status, json } as Partial<Response> as Response, status, json };
};

const request = (
  body: unknown = {},
  config: unknown = {},
  user: { email?: string } = {},
): ServerRequest =>
  ({
    body,
    config,
    user: { id: 'user-1', tenantId: 'tenant-a', ...user },
  }) as unknown as ServerRequest;

const nextAt = new Date('2026-06-16T12:00:00.000Z');

const deps = () => ({
  getArmedSurveyFlight: jest.fn().mockResolvedValue(flight),
  hasSurveyResponse: jest.fn().mockResolvedValue(false),
  getSurveyNudge: jest.fn().mockResolvedValue(null),
  recordSurveyNudge: jest.fn().mockResolvedValue({ nextAt, delayDays: 1, dismissals: 1 }),
  createSurveyResponse: jest
    .fn()
    .mockResolvedValue({ ok: true, value: { submittedAt: new Date() } }),
  getSurveyComparison: jest.fn().mockResolvedValue({ responses: 3, threshold: 50 }),
  getUserUsageSnapshot: jest.fn().mockResolvedValue(usage),
});

describe('survey status handler', () => {
  it('returns the armed flight and whether this user already answered', async () => {
    const d = deps();
    d.hasSurveyResponse.mockResolvedValue(true);
    const { response, json } = createResponse();
    await createSurveyStatusHandler(d)(request(), response);

    expect(d.hasSurveyResponse).toHaveBeenCalledWith('f1', 'user-1');
    expect(json).toHaveBeenCalledWith({
      flight: {
        flightId: 'f1',
        surveyVersion: SURVEY_VERSION,
        lookbackDays: 30,
        minResponses: 50,
        companies: flight.companies,
      },
      submitted: true,
      nextNudgeAt: null,
    });
  });

  it('reads the answer and the cooldown together', async () => {
    const d = deps();
    let releaseAnswer: (value: boolean) => void = () => undefined;
    let releaseNudge: (value: { nextAt: Date; dismissals: number } | null) => void = () =>
      undefined;
    d.hasSurveyResponse.mockReturnValue(
      new Promise((resolve) => {
        releaseAnswer = resolve;
      }),
    );
    d.getSurveyNudge.mockReturnValue(
      new Promise((resolve) => {
        releaseNudge = resolve;
      }),
    );
    const { response, json } = createResponse();
    const pending = createSurveyStatusHandler(d)(request(), response);
    await Promise.resolve();

    expect(d.hasSurveyResponse).toHaveBeenCalledWith('f1', 'user-1');
    expect(d.getSurveyNudge).toHaveBeenCalledWith('f1', 'user-1', 'tenant-a');
    releaseAnswer(false);
    releaseNudge({ nextAt, dismissals: 1 });
    await pending;

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ nextNudgeAt: nextAt.toISOString() }),
    );
  });

  it('returns no flight when none is armed', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue(null);
    const { response, json } = createResponse();
    await createSurveyStatusHandler(d)(request(), response);
    expect(json).toHaveBeenCalledWith({ flight: null, submitted: false, nextNudgeAt: null });
    expect(d.hasSurveyResponse).not.toHaveBeenCalled();
    expect(d.getSurveyNudge).not.toHaveBeenCalled();
  });

  it('returns no flight when the deployment switched the survey off', async () => {
    const d = deps();
    const { response, json } = createResponse();
    await createSurveyStatusHandler(d)(
      request({}, { interfaceConfig: { survey: false } }),
      response,
    );
    expect(json).toHaveBeenCalledWith({ flight: null, submitted: false, nextNudgeAt: null });
    expect(d.getArmedSurveyFlight).not.toHaveBeenCalled();
  });

  it('answers a database failure with a generic 500', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockRejectedValue(new Error('mongo://secret-host down'));
    const { response, status, json } = createResponse();
    await createSurveyStatusHandler(d)(request(), response);
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-host');
  });
});

describe('survey submit handler', () => {
  const body = { flightId: 'f1', locale: 'de', durationSeconds: 120, answers };

  it('stores the response with a snapshot and returns usage and comparison', async () => {
    const d = deps();
    const { response, status, json } = createResponse();
    await createSurveySubmitHandler(d)(request(body), response);

    expect(d.getUserUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', windowDays: 30 }),
    );
    expect(d.createSurveyResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        flightId: 'f1',
        user: 'user-1',
        company: ['a'],
        jobFunction: 'legal',
        usage,
        tenantId: 'tenant-a',
      }),
    );
    expect(d.getSurveyComparison).toHaveBeenCalledWith('f1', 50, usage);
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({ usage, comparison: { responses: 3, threshold: 50 } });
  });

  it('treats a flight from another survey version as closed', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue({ ...flight, surveyVersion: SURVEY_VERSION - 1 });
    const { response: statusResponse, json } = createResponse();
    await createSurveyStatusHandler(d)(request(), statusResponse);
    expect(json).toHaveBeenCalledWith({ flight: null, submitted: false, nextNudgeAt: null });

    const { response, status } = createResponse();
    await createSurveySubmitHandler(d)(request(body), response);
    expect(status).toHaveBeenCalledWith(409);
    expect(d.getUserUsageSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing flight', null, 'survey_closed'],
    ['a different flight', { ...flight, flightId: 'f2' }, 'survey_closed'],
  ])('rejects %s with 409 before mining usage', async (_label, armed, code) => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue(armed);
    const { response, status, json } = createResponse();
    await createSurveySubmitHandler(d)(request(body), response);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code }));
    expect(d.getUserUsageSnapshot).not.toHaveBeenCalled();
  });

  it('rejects invalid answers with field names but never the values', async () => {
    const d = deps();
    const { response, status, json } = createResponse();
    await createSurveySubmitHandler(d)(
      request({ ...body, answers: { ...answers, jobFunction: 'secret-value' } }),
      response,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'invalid_answers', fields: ['jobFunction'] }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-value');
    expect(d.getUserUsageSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a malformed envelope', async () => {
    const d = deps();
    const { response, status } = createResponse();
    await createSurveySubmitHandler(d)(request({ answers, extra: true }), response);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('rejects a second submission without mining usage', async () => {
    const d = deps();
    d.hasSurveyResponse.mockResolvedValue(true);
    const { response, status, json } = createResponse();
    await createSurveySubmitHandler(d)(request(body), response);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'already_submitted' }));
    expect(d.getUserUsageSnapshot).not.toHaveBeenCalled();
  });

  it('maps a lost race on the unique index to 409', async () => {
    const d = deps();
    d.createSurveyResponse.mockResolvedValue({ ok: false, error: { code: 'already_submitted' } });
    const { response, status, json } = createResponse();
    await createSurveySubmitHandler(d)(request(body), response);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'already_submitted' }));
    expect(d.getSurveyComparison).not.toHaveBeenCalled();
  });

  it('closed by configuration, even while a flight is armed', async () => {
    const d = deps();
    const { response, status } = createResponse();
    await createSurveySubmitHandler(d)(
      request(body, { interfaceConfig: { survey: false } }),
      response,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(d.getArmedSurveyFlight).not.toHaveBeenCalled();
  });

  it('answers an unexpected failure with a generic 500', async () => {
    const d = deps();
    d.getUserUsageSnapshot.mockRejectedValue(new Error('secret-value leaked'));
    const { response, status, json } = createResponse();
    await createSurveySubmitHandler(d)(request(body), response);

    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-value');
    expect(d.createSurveyResponse).not.toHaveBeenCalled();
  });
});

describe('survey nudge handler', () => {
  it('records a dismissal and returns when the fish may return', async () => {
    const d = deps();
    const { response, json } = createResponse();
    await createSurveyNudgeHandler(d)(request({ flightId: 'f1', reason: 'later' }), response);

    expect(d.recordSurveyNudge).toHaveBeenCalledWith(
      expect.objectContaining({
        flightId: 'f1',
        user: 'user-1',
        reason: 'later',
        tenantId: 'tenant-a',
        schedule: [1, 2, 4, 7],
      }),
    );
    expect(json).toHaveBeenCalledWith({ nextNudgeAt: nextAt.toISOString(), delayDays: 1 });
  });

  it('uses the flight schedule when one is stored', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue({ ...flight, nudgeDays: [3, 9] });
    const { response } = createResponse();
    await createSurveyNudgeHandler(d)(request({ flightId: 'f1', reason: 'ignored' }), response);

    expect(d.recordSurveyNudge).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: [3, 9], reason: 'ignored' }),
    );
  });

  it('rejects a malformed nudge without echoing the body', async () => {
    const d = deps();
    const { response, status, json } = createResponse();
    await createSurveyNudgeHandler(d)(
      request({ flightId: 'f1', reason: 'never', note: 'secret-value' }),
      response,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid_nudge' }));
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-value');
    expect(d.recordSurveyNudge).not.toHaveBeenCalled();
  });

  it.each([
    ['no armed flight', null],
    ['a different flight', { ...flight, flightId: 'f2' }],
  ])('rejects %s with 409', async (_label, armed) => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue(armed);
    const { response, status, json } = createResponse();
    await createSurveyNudgeHandler(d)(request({ flightId: 'f1', reason: 'later' }), response);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'survey_closed' }));
    expect(d.recordSurveyNudge).not.toHaveBeenCalled();
  });

  it('rejects a person who already answered', async () => {
    const d = deps();
    d.hasSurveyResponse.mockResolvedValue(true);
    const { response, status, json } = createResponse();
    await createSurveyNudgeHandler(d)(request({ flightId: 'f1', reason: 'later' }), response);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'already_submitted' }));
    expect(d.recordSurveyNudge).not.toHaveBeenCalled();
  });

  it('rejects the nudge when the deployment switched the survey off', async () => {
    const d = deps();
    const { response, status } = createResponse();
    await createSurveyNudgeHandler(d)(
      request({ flightId: 'f1', reason: 'later' }, { interfaceConfig: { survey: false } }),
      response,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(d.getArmedSurveyFlight).not.toHaveBeenCalled();
  });

  it('answers an unexpected failure with a generic 500', async () => {
    const d = deps();
    d.recordSurveyNudge.mockRejectedValue(new Error('mongo://secret-host down'));
    const { response, status, json } = createResponse();
    await createSurveyNudgeHandler(d)(request({ flightId: 'f1', reason: 'later' }), response);

    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-host');
  });
});

describe('survey audience', () => {
  const listed = { ...flight, audience: ['alice@acme.com'] };
  const body = { flightId: 'f1', locale: 'de', durationSeconds: 120, answers };

  it('shows the flight to a listed email regardless of case, without the list', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue(listed);
    const { response, json } = createResponse();
    await createSurveyStatusHandler(d)(request({}, {}, { email: 'Alice@Acme.com' }), response);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ flight: expect.objectContaining({ flightId: 'f1' }) }),
    );
    expect(json.mock.calls[0][0].flight).not.toHaveProperty('audience');
    expect(JSON.stringify(json.mock.calls)).not.toContain('alice@acme.com');
  });

  it.each([
    ['a different email', { email: 'other@acme.com' }],
    ['no email', {}],
  ])('hides the flight from %s', async (_label, user) => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue(listed);
    const { response, json } = createResponse();
    await createSurveyStatusHandler(d)(request({}, {}, user), response);

    expect(json).toHaveBeenCalledWith({ flight: null, submitted: false, nextNudgeAt: null });
    expect(d.hasSurveyResponse).not.toHaveBeenCalled();
  });

  it('treats an empty audience as every user', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue({ ...flight, audience: [] });
    const { response, json } = createResponse();
    await createSurveyStatusHandler(d)(request({}, {}, { email: 'anyone@acme.com' }), response);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ flight: expect.objectContaining({ flightId: 'f1' }) }),
    );
  });

  it('rejects a submission from someone outside the audience', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue(listed);
    const { response, status, json } = createResponse();
    await createSurveySubmitHandler(d)(request(body, {}, { email: 'other@acme.com' }), response);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'survey_closed' }));
    expect(d.getUserUsageSnapshot).not.toHaveBeenCalled();
  });

  it('accepts a submission from a listed email', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue(listed);
    const { response, status } = createResponse();
    await createSurveySubmitHandler(d)(request(body, {}, { email: 'alice@acme.com' }), response);

    expect(status).toHaveBeenCalledWith(201);
  });

  it('rejects a nudge from someone outside the audience', async () => {
    const d = deps();
    d.getArmedSurveyFlight.mockResolvedValue(listed);
    const { response, status, json } = createResponse();
    await createSurveyNudgeHandler(d)(
      request({ flightId: 'f1', reason: 'later' }, {}, { email: 'other@acme.com' }),
      response,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'survey_closed' }));
    expect(d.recordSurveyNudge).not.toHaveBeenCalled();
  });
});
