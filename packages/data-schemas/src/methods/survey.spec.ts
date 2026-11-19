import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  SURVEY_DEFAULT_NUDGE_DAYS,
  SURVEY_USAGE_KEYS,
  SURVEY_USAGE_VERSION,
  SURVEY_VERSION,
} from 'librechat-data-provider';
import type { TSurveyAnswers, TSurveyUsage } from 'librechat-data-provider';
import { createSurveyUsageMethods } from './surveyUsage';
import { createSurveyMethods } from './survey';
import { createModels } from '../models';

let mongoServer: MongoMemoryServer;
const survey = () => createSurveyMethods(mongoose);
const usageMethods = () => createSurveyUsageMethods(mongoose);

const dayMs = 24 * 60 * 60 * 1000;
const now = new Date('2026-06-15T12:00:00.000Z');
const ago = (days: number) => new Date(now.getTime() - days * dayMs);
const window = (userId: string) => ({ userId, from: ago(30), to: now, windowDays: 30 });

const collection = (name: string) => mongoose.connection.collection(name);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const models = createModels(mongoose);
  await Promise.all([
    models.SurveyFlight.init(),
    models.SurveyResponse.init(),
    models.SurveyNudge.init(),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

const zeroUsage = (overrides: Partial<TSurveyUsage> = {}): TSurveyUsage => ({
  ...(Object.fromEntries(SURVEY_USAGE_KEYS.map((key) => [key, 0])) as Record<
    (typeof SURVEY_USAGE_KEYS)[number],
    number
  >),
  version: SURVEY_USAGE_VERSION,
  windowDays: 30,
  topTools: [],
  ...overrides,
});

describe('getUserUsageSnapshot', () => {
  const author = new Types.ObjectId();
  const other = new Types.ObjectId();
  const stranger = new Types.ObjectId();
  const u = author.toString();

  async function seed() {
    const message = (fields: Record<string, unknown>) => ({
      messageId: new Types.ObjectId().toString(),
      user: u,
      isCreatedByUser: true,
      createdAt: now,
      ...fields,
    });
    await collection('messages').insertMany([
      message({ conversationId: 'c1', createdAt: ago(0), tokenCount: 10 }),
      message({ conversationId: 'c1', createdAt: ago(0), tokenCount: 10 }),
      message({ conversationId: 'c2', createdAt: ago(10), tokenCount: 10 }),
      // excluded: outside the window, temporary, someone else's
      message({ conversationId: 'c1', createdAt: ago(40), tokenCount: 999 }),
      message({ conversationId: 'c1', createdAt: ago(1), tokenCount: 999, isTemporary: true }),
      message({ conversationId: 'c9', user: other.toString(), tokenCount: 999 }),
      // assistant replies: two to the same parent (one regeneration), one with an error
      message({
        isCreatedByUser: false,
        parentMessageId: 'p1',
        tokenCount: 20,
        feedback: { rating: 'thumbsUp', tag: 'accurate_correct' },
      }),
      message({ isCreatedByUser: false, parentMessageId: 'p1', tokenCount: 20, error: true }),
      message({
        isCreatedByUser: false,
        parentMessageId: 'p2',
        tokenCount: 5,
        content: [
          { type: 'tool_call', tool_call: { name: 'execute_code' } },
          { type: 'text', text: 'done' },
          { type: 'tool_call', tool_call: { name: 'execute_code' } },
          { type: 'tool_call', tool_call: { name: 'web_search' } },
          { type: 'tool_call', tool_call: { name: 'lookup_mcp_docs' } },
          { type: 'tool_call', tool_call: { name: '' } },
        ],
      }),
    ]);

    const convo = (fields: Record<string, unknown>) => ({
      conversationId: new Types.ObjectId().toString(),
      user: u,
      createdAt: now,
      updatedAt: now,
      ...fields,
    });
    await collection('conversations').insertMany([
      convo({ agent_id: 'agent_mine' }),
      convo({ agent_id: 'agent_theirs' }),
      convo({ isTemporary: true, agent_id: 'agent_theirs2' }),
      convo({ subagentThread: { rootConversationId: 'x' }, agent_id: 'agent_theirs3' }),
      convo({ createdAt: ago(40), updatedAt: ago(40), agent_id: 'agent_old_use' }),
      convo({ user: other.toString(), agent_id: 'agent_mine' }),
      convo({ user: other.toString(), agent_id: 'agent_mine' }),
      convo({ user: stranger.toString(), agent_id: 'agent_mine', createdAt: ago(40) }),
      convo({ user: u, agent_id: undefined }),
    ]);

    const [mine, old] = [new Types.ObjectId(), new Types.ObjectId()];
    await collection('agents').insertMany([
      { _id: mine, id: 'agent_mine', author, createdAt: ago(2) },
      { _id: old, id: 'agent_old', author, createdAt: ago(60) },
      { _id: new Types.ObjectId(), id: 'agent_theirs', author: other, createdAt: ago(5) },
    ]);
    await collection('aclentries').insertMany([
      { resourceType: 'agent', resourceId: mine, principalType: 'user', principalId: author },
      { resourceType: 'agent', resourceId: mine, principalType: 'role', principalId: 'USER' },
      { resourceType: 'agent', resourceId: old, principalType: 'user', principalId: author },
    ]);

    const [promptA, promptB] = [new Types.ObjectId(), new Types.ObjectId()];
    await collection('promptgroups').insertMany([
      { _id: promptA, author, name: 'a' },
      { _id: promptB, author, name: 'b' },
    ]);
    await collection('aclentries').insertOne({
      resourceType: 'promptGroup',
      resourceId: promptA,
      principalType: 'group',
      principalId: new Types.ObjectId(),
    });

    await collection('skills').insertOne({ author, name: 's' });
    await collection('agentapikeys').insertOne({ userId: author, name: 'k' });
    await collection('schedules').insertMany([
      { user: author, enabled: true },
      { user: author, enabled: false },
    ]);
    await collection('scheduleruns').insertMany([
      { user: author, createdAt: ago(3), scheduleId: 's1', scheduledFor: ago(3) },
      { user: author, createdAt: ago(50), scheduleId: 's1', scheduledFor: ago(50) },
    ]);
    await collection('files').insertMany([
      { user: author, createdAt: ago(1), filename: 'data.csv', type: 'text/plain' },
      { user: author, createdAt: ago(1), filename: 'x.pdf', type: 'application/pdf' },
      { user: author, createdAt: ago(1), filename: 'sheet', type: 'application/vnd.ms-excel' },
      { user: author, createdAt: ago(90), filename: 'old.xlsx', type: 'x' },
      { user: other, createdAt: ago(1), filename: 'other.csv', type: 'text/csv' },
    ]);
    await collection('users').insertOne({ _id: author, createdAt: ago(100) });
  }

  it('mines every metric inside the window for that user only', async () => {
    await seed();
    const { usage } = await usageMethods().getUserUsageSnapshot(window(u));

    expect(usage).toEqual({
      version: SURVEY_USAGE_VERSION,
      windowDays: 30,
      messagesSent: 3,
      responsesReceived: 3,
      activeDays: 2,
      activeWeeks: 2,
      conversations: 3,
      medianMessagesPerConversation: 1.5,
      daysSinceFirstUse: 100,
      tokensInput: 30,
      tokensOutput: 45,
      tokensTotal: 75,
      agentsOwned: 2,
      agentsCreated: 1,
      agentsShared: 1,
      agentsUsedOwn: 1,
      agentsUsedOthers: 1,
      agentAudience: 1,
      skillsOwned: 1,
      schedulesActive: 1,
      scheduleRuns: 1,
      agentApiKeys: 1,
      promptsOwned: 2,
      promptsShared: 1,
      filesUploaded: 3,
      codeRuns: 2,
      toolCalls: 4,
      toolsDistinct: 3,
      mcpToolCalls: 1,
      mcpServers: 1,
      spreadsheetUploads: 2,
      regenerations: 1,
      failedResponses: 1,
      feedbackUp: 1,
      feedbackDown: 0,
      topTools: [
        { name: 'execute_code', calls: 2 },
        { name: 'lookup_mcp_docs', calls: 1 },
        { name: 'web_search', calls: 1 },
      ],
    });
  });

  it('returns zeros for an account with no activity', async () => {
    const { usage, activity } = await usageMethods().getUserUsageSnapshot(
      window(new Types.ObjectId().toString()),
    );
    expect(usage).toEqual(zeroUsage());
    expect(activity.every((day) => day.messages === 0)).toBe(true);
  });

  it('returns one entry per UTC day, with quiet days at zero', async () => {
    await seed();
    const { usage, activity } = await usageMethods().getUserUsageSnapshot(window(u));

    expect(activity).toHaveLength(31);
    expect(activity[0]).toEqual({ date: '2026-05-16', messages: 0 });
    expect(activity[activity.length - 1]).toEqual({ date: '2026-06-15', messages: 2 });
    expect(activity.find((day) => day.date === '2026-06-05')?.messages).toBe(1);
    expect(activity.filter((day) => day.messages > 0)).toHaveLength(usage.activeDays);
    expect(activity.reduce((total, day) => total + day.messages, 0)).toBe(usage.messagesSent);
  });

  it('reports every key the comparison measures', async () => {
    await seed();
    const { usage } = await usageMethods().getUserUsageSnapshot(window(u));
    for (const key of SURVEY_USAGE_KEYS) {
      expect(typeof usage[key]).toBe('number');
    }
  });
});

describe('flights', () => {
  const input = (flightId: string, overrides = {}) => ({
    flightId,
    companies: [{ id: 'a', name: 'A' }],
    lookbackDays: 30,
    minResponses: 50,
    ...overrides,
  });

  it('arming a flight closes the one that was running', async () => {
    await survey().armSurveyFlight(input('first'));
    const second = await survey().armSurveyFlight(input('second'));

    expect(second).toMatchObject({
      flightId: 'second',
      status: 'armed',
      surveyVersion: SURVEY_VERSION,
    });
    expect((await survey().getArmedSurveyFlight())?.flightId).toBe('second');
    const closed = await mongoose.models.SurveyFlight.countDocuments({ status: 'closed' });
    expect(closed).toBe(1);
  });

  it('keeps the running flight when the new id is a duplicate', async () => {
    await survey().armSurveyFlight(input('first'));
    await expect(survey().armSurveyFlight(input('first'))).rejects.toThrow();
    expect((await survey().getArmedSurveyFlight())?.flightId).toBe('first');
  });

  it('only returns a flight inside its open window', async () => {
    await survey().armSurveyFlight(input('timed', { opensAt: ago(-2), closesAt: ago(-4) }));
    expect(await survey().getArmedSurveyFlight(now)).toBeNull();
    await survey().armSurveyFlight(input('open', { opensAt: ago(1), closesAt: ago(-1) }));
    expect((await survey().getArmedSurveyFlight(now))?.flightId).toBe('open');
    expect(await survey().getArmedSurveyFlight(ago(-2))).toBeNull();
    expect((await survey().getLatestSurveyFlight())?.flightId).toBe('open');
  });

  it('fills in the default cooldown when an older flight has none stored', async () => {
    await mongoose.models.SurveyFlight.collection.insertOne({
      flightId: 'legacy',
      surveyId: 'wangpt-kpi',
      surveyVersion: SURVEY_VERSION,
      status: 'armed',
      opensAt: ago(1),
      lookbackDays: 30,
      minResponses: 50,
      companies: [{ id: 'a', name: 'A' }],
    });

    expect((await survey().getArmedSurveyFlight(now))?.nudgeDays).toEqual([
      ...SURVEY_DEFAULT_NUDGE_DAYS,
    ]);
  });

  it('closes the armed flight', async () => {
    await survey().armSurveyFlight(input('first'));
    expect(await survey().closeSurveyFlight()).toBe(1);
    expect(await survey().getArmedSurveyFlight()).toBeNull();
    expect(await survey().closeSurveyFlight()).toBe(0);
  });

  it('stores a normalized audience and omits it when none is given', async () => {
    const targeted = await survey().armSurveyFlight(
      input('targeted', {
        audience: [' Alice@Acme.com ', 'alice@acme.com', 'bob@acme.com', ''],
      }),
    );
    expect(targeted.audience).toEqual(['alice@acme.com', 'bob@acme.com']);

    await survey().armSurveyFlight(input('everyone', { audience: ['  ', ''] }));
    const stored = await mongoose.models.SurveyFlight.findOne({ flightId: 'everyone' }).lean<{
      audience?: string[];
    } | null>();
    expect(stored?.audience).toBeUndefined();
  });
});

describe('responses', () => {
  const response = (user: string, usage = zeroUsage(), flightId = 'f1') => ({
    flightId,
    user,
    surveyVersion: SURVEY_VERSION,
    company: ['a'],
    jobFunction: 'legal',
    answers: {} as TSurveyAnswers,
    usage,
    submittedAt: now,
  });

  it('accepts one response per account and flight', async () => {
    const first = await survey().createSurveyResponse(response('u1'));
    const again = await survey().createSurveyResponse(response('u1'));
    const otherFlight = await survey().createSurveyResponse(response('u1', zeroUsage(), 'f2'));

    expect(first.ok).toBe(true);
    expect(again).toEqual({ ok: false, error: { code: 'already_submitted' } });
    expect(otherFlight.ok).toBe(true);
    expect(await survey().hasSurveyResponse('f1', 'u1')).toBe(true);
    expect(await survey().hasSurveyResponse('f1', 'u2')).toBe(false);
  });

  it('rethrows failures that are not a duplicate', async () => {
    await expect(
      survey().createSurveyResponse({ ...response('u1'), jobFunction: undefined } as never),
    ).rejects.toThrow();
  });

  it('answers ready: false and nothing else below the threshold', async () => {
    for (const [index, messages] of [10, 20, 30].entries()) {
      await survey().createSurveyResponse(
        response(`u${index}`, zeroUsage({ messagesSent: messages })),
      );
    }
    await survey().createSurveyResponse(
      response('elsewhere', zeroUsage({ messagesSent: 999 }), 'f2'),
    );

    expect(await survey().getSurveyComparison('f1', 4, zeroUsage())).toEqual({ ready: false });
  });

  it('returns percentiles and distributions at the threshold', async () => {
    for (const [index, messages] of [10, 20, 30].entries()) {
      await survey().createSurveyResponse(
        response(`u${index}`, zeroUsage({ messagesSent: messages })),
      );
    }

    const top = await survey().getSurveyComparison('f1', 3, zeroUsage({ messagesSent: 30 }));
    if (!top.ready) {
      throw new Error('expected the comparison to be ready');
    }
    expect(top.percentiles.messagesSent).toBe(100);
    expect(top.percentiles.tokensTotal).toBe(0);
    expect(top.distributions.messagesSent.median).toBe(20);
    expect(
      top.distributions.messagesSent.bins.reduce((sum, bin) => sum + bin.share, 0),
    ).toBeGreaterThan(98);
    expect(Object.keys(top).sort()).toEqual(['distributions', 'gains', 'percentiles', 'ready']);

    const middle = await survey().getSurveyComparison('f1', 3, zeroUsage({ messagesSent: 20 }));
    expect(middle.ready && middle.percentiles.messagesSent).toBe(50);
  });

  it('turns the positive answers into shares', async () => {
    const answer = (
      hoursSaved: TSurveyAnswers['hoursSaved'],
      kind: 'email' | 'write',
      extra: Partial<TSurveyAnswers> = {},
    ) =>
      ({
        hoursSaved,
        enabled: true,
        bestTask: {
          kind,
          note: 'x',
          durationWithout: 'thirty_60',
          durationWith: 'five_15',
          frequency: 'weekly',
        },
        ...extra,
      }) as TSurveyAnswers;
    const people = [
      answer({ hours: 3 }, 'email', { timeUses: ['less_pressure', 'evaporates'] }),
      answer({ range: 'five_ten' }, 'email', { timeUses: ['less_pressure'] }),
      answer({ range: 'none' }, 'write'),
      answer({ range: 'cant_say' }, 'write', { enabled: false }),
    ];
    for (const [index, answers] of people.entries()) {
      await survey().createSurveyResponse({ ...response(`u${index}`), answers });
    }

    const result = await survey().getSurveyComparison('f1', 4, zeroUsage());
    if (!result.ready) {
      throw new Error('expected the comparison to be ready');
    }
    const { gains } = result;
    expect(gains.savers).toBe(67);
    expect(gains.medianHours).toBe(5.3);
    expect(gains.hours.two_five).toBe(50);
    expect(gains.hours.five_ten).toBe(50);
    expect(gains.uses.less_pressure).toBe(100);
    expect(gains.uses).not.toHaveProperty('evaporates');
    expect(gains.tasks.email).toBe(50);
    expect(gains.taskMinutes).toEqual({ without: 45, with: 10 });
    expect(gains.enabled).toBe(75);
  });

  it('counts accounts, responses and accounts active in the last seven days', async () => {
    await survey().createSurveyResponse(response('u1'));
    await collection('users').insertMany(
      ['a', 'b', 'c'].map((name) => ({ name, email: `${name}@example.com` })),
    );
    await collection('messages').insertMany([
      { messageId: 'a1', user: 'a', isCreatedByUser: true, createdAt: ago(1) },
      { messageId: 'a2', user: 'a', isCreatedByUser: true, createdAt: ago(2) },
      { messageId: 'b1', user: 'b', isCreatedByUser: true, createdAt: ago(20) },
      { messageId: 'c1', user: 'c', isCreatedByUser: false, createdAt: ago(1) },
    ]);

    expect(await survey().getSurveyStats('f1', ago(7))).toEqual({
      responses: 1,
      accounts: 3,
      activeAccounts: 1,
    });
  });

  it('limits the account counts to the flight audience', async () => {
    const listed = new Types.ObjectId();
    const other = new Types.ObjectId();
    await survey().armSurveyFlight({
      flightId: 'f1',
      companies: [{ id: 'a', name: 'A' }],
      lookbackDays: 30,
      minResponses: 50,
      audience: ['listed@example.com', 'later@example.com'],
    });
    await survey().createSurveyResponse(response('u1'));
    await collection('users').insertMany([
      { _id: listed, email: 'listed@example.com' },
      { _id: other, email: 'other@example.com' },
    ]);
    await collection('messages').insertMany([
      { user: listed.toString(), isCreatedByUser: true, createdAt: ago(1) },
      { user: other.toString(), isCreatedByUser: true, createdAt: ago(1) },
    ]);

    expect(await survey().getSurveyStats('f1', ago(7))).toEqual({
      responses: 1,
      accounts: 1,
      activeAccounts: 1,
    });
  });
});

describe('nudges', () => {
  const schedule = [1, 2, 4, 7];
  const start = new Date('2026-06-15T12:00:00.000Z');
  const nudge = (
    now: Date,
    overrides: {
      flightId?: string;
      user?: string;
      tenantId?: string;
      reason?: 'later' | 'ignored';
    } = {},
  ) =>
    survey().recordSurveyNudge({
      flightId: overrides.flightId ?? 'f1',
      user: overrides.user ?? 'u1',
      reason: overrides.reason ?? 'later',
      schedule,
      now,
      tenantId: overrides.tenantId ?? 'tenant-a',
    });

  it('waits 1, 2, 4 and 7 days, then a week, and ignores a nudge during the cooldown', async () => {
    let now = start;
    const delays: number[] = [];
    for (let step = 0; step < 5; step += 1) {
      const recorded = await nudge(now);
      const again = await nudge(now, { reason: 'ignored' });
      delays.push(recorded.delayDays);
      expect(again.nextAt.toISOString()).toBe(recorded.nextAt.toISOString());
      expect(again.delayDays).toBe(recorded.delayDays);
      expect(recorded.nextAt.getTime()).toBe(now.getTime() + recorded.delayDays * dayMs);
      const stored = await survey().getSurveyNudge('f1', 'u1', 'tenant-a');
      expect(stored?.dismissals).toBe(step + 1);
      now = new Date(recorded.nextAt.getTime() + 1000);
    }

    expect(delays).toEqual([1, 2, 4, 7, 7]);
    expect(await survey().getSurveyNudge('f1', 'nobody', 'tenant-a')).toBeNull();
  });

  it('keeps flights and tenants on their own cooldowns', async () => {
    await nudge(start, { flightId: 'f1', tenantId: 'tenant-a' });
    await nudge(start, { flightId: 'f2', tenantId: 'tenant-a' });
    await nudge(start, { flightId: 'f1', tenantId: 'tenant-b' });
    await nudge(new Date(start.getTime() + 2 * dayMs), { flightId: 'f1', tenantId: 'tenant-a' });

    expect((await survey().getSurveyNudge('f1', 'u1', 'tenant-a'))?.dismissals).toBe(2);
    expect((await survey().getSurveyNudge('f2', 'u1', 'tenant-a'))?.dismissals).toBe(1);
    expect((await survey().getSurveyNudge('f1', 'u1', 'tenant-b'))?.dismissals).toBe(1);
  });
});
