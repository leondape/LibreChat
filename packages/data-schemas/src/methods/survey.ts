import {
  SURVEY_DEFAULT_NUDGE_DAYS,
  SURVEY_ID,
  SURVEY_USAGE_KEYS,
  SURVEY_VERSION,
  getSurveyNudgeDelayDays,
} from 'librechat-data-provider';
import type {
  TSurveyComparison,
  TSurveyCompany,
  TSurveyNudgeReason,
  TSurveyUsageValues,
} from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { ISurveyFlight, ISurveyNudge, ISurveyResponse, IMessage, IUser } from '~/types';
import type { SurveyFlightData, SurveyNudgeData, SurveyResponseData } from '~/types';

export type ArmSurveyFlightInput = {
  flightId: string;
  companies: TSurveyCompany[];
  lookbackDays: number;
  minResponses: number;
  nudgeDays?: number[];
  opensAt?: Date;
  closesAt?: Date;
  /** Empty or omitted arms the flight for every user. */
  audience?: string[];
};

export type SurveyNudgeState = { nextAt: Date; dismissals: number };

export type RecordSurveyNudgeInput = {
  flightId: string;
  user: string;
  reason: TSurveyNudgeReason;
  schedule: readonly number[];
  now?: Date;
  tenantId?: string;
};

export type RecordSurveyNudgeResult = SurveyNudgeState & { delayDays: number };

export type CreateSurveyResponseResult =
  | { ok: true; value: { submittedAt: Date } }
  | { ok: false; error: { code: 'already_submitted' } };

export type SurveyStats = { responses: number; accounts: number; activeAccounts: number };

export type SurveyMethods = {
  getArmedSurveyFlight: (now?: Date) => Promise<SurveyFlightData | null>;
  getLatestSurveyFlight: () => Promise<SurveyFlightData | null>;
  armSurveyFlight: (input: ArmSurveyFlightInput) => Promise<SurveyFlightData>;
  closeSurveyFlight: () => Promise<number>;
  hasSurveyResponse: (flightId: string, user: string) => Promise<boolean>;
  createSurveyResponse: (response: SurveyResponseData) => Promise<CreateSurveyResponseResult>;
  getSurveyComparison: (
    flightId: string,
    threshold: number,
    usage: TSurveyUsageValues,
  ) => Promise<TSurveyComparison>;
  getSurveyStats: (flightId: string, activeSince: Date) => Promise<SurveyStats>;
  getSurveyNudge: (
    flightId: string,
    user: string,
    tenantId?: string,
  ) => Promise<SurveyNudgeState | null>;
  recordSurveyNudge: (input: RecordSurveyNudgeInput) => Promise<RecordSurveyNudgeResult>;
};

const DUPLICATE_KEY = 11000;

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: number }).code === DUPLICATE_KEY;

const round = (value: number) => Math.round(value * 10) / 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Flights armed before cooldowns existed have no schedule stored. */
function withNudgeDays(flight: SurveyFlightData): SurveyFlightData {
  return {
    ...flight,
    nudgeDays: flight.nudgeDays?.length ? flight.nudgeDays : [...SURVEY_DEFAULT_NUDGE_DAYS],
  };
}

function nudgeSchedule(schedule: readonly number[]): number[] {
  return schedule.length > 0 ? [...schedule] : [...SURVEY_DEFAULT_NUDGE_DAYS];
}

type ActiveAccountMatch = {
  isCreatedByUser: true;
  isTemporary: { $ne: true };
  createdAt: { $gte: Date };
  user?: { $in: string[] };
};

/** Empty after trim means "everyone", so nothing is stored. */
function normalizeAudience(emails?: string[]): string[] | undefined {
  if (!emails?.length) {
    return undefined;
  }
  const normalized = [
    ...new Set(
      emails.map((email) => email.trim().toLowerCase()).filter((email) => email.length > 0),
    ),
  ];
  return normalized.length > 0 ? normalized : undefined;
}

export function createSurveyMethods(mongoose: typeof import('mongoose')): SurveyMethods {
  const Flight = () => mongoose.models.SurveyFlight as Model<ISurveyFlight>;
  const Response = () => mongoose.models.SurveyResponse as Model<ISurveyResponse>;
  const Nudge = () => mongoose.models.SurveyNudge as Model<ISurveyNudge>;

  async function getArmedSurveyFlight(now: Date = new Date()): Promise<SurveyFlightData | null> {
    const flight = await Flight()
      .findOne({
        status: 'armed',
        opensAt: { $lte: now },
        $or: [{ closesAt: { $exists: false } }, { closesAt: null }, { closesAt: { $gte: now } }],
      })
      .sort({ opensAt: -1, createdAt: -1 })
      .lean<SurveyFlightData>();
    return flight ? withNudgeDays(flight) : null;
  }

  async function getLatestSurveyFlight(): Promise<SurveyFlightData | null> {
    const flight = await Flight().findOne().sort({ createdAt: -1 }).lean<SurveyFlightData>();
    return flight ? withNudgeDays(flight) : null;
  }

  /** The new flight is written first, so a duplicate id leaves the running flight untouched. */
  async function armSurveyFlight(input: ArmSurveyFlightInput): Promise<SurveyFlightData> {
    const audience = normalizeAudience(input.audience);
    const created = await Flight().create({
      flightId: input.flightId,
      surveyId: SURVEY_ID,
      surveyVersion: SURVEY_VERSION,
      status: 'armed',
      opensAt: input.opensAt ?? new Date(),
      closesAt: input.closesAt,
      lookbackDays: input.lookbackDays,
      minResponses: input.minResponses,
      nudgeDays: nudgeSchedule(input.nudgeDays ?? []),
      companies: input.companies,
      ...(audience ? { audience } : {}),
    });
    await Flight().updateMany(
      { status: 'armed', flightId: { $ne: input.flightId } },
      { $set: { status: 'closed' } },
    );
    return created.toObject<SurveyFlightData>();
  }

  async function closeSurveyFlight(): Promise<number> {
    const result = await Flight().updateMany({ status: 'armed' }, { $set: { status: 'closed' } });
    return result.modifiedCount;
  }

  async function hasSurveyResponse(flightId: string, user: string): Promise<boolean> {
    return (await Response().exists({ flightId, user })) != null;
  }

  async function createSurveyResponse(
    response: SurveyResponseData,
  ): Promise<CreateSurveyResponseResult> {
    try {
      const created = await Response().create(response);
      return { ok: true, value: { submittedAt: created.submittedAt } };
    } catch (error) {
      if (isDuplicateKey(error)) {
        return { ok: false, error: { code: 'already_submitted' } };
      }
      throw error;
    }
  }

  /**
   * Averages and percentiles are withheld below the threshold so a small group
   * cannot be read back. A percentile is how many of the other respondents sit
   * strictly below this person.
   */
  async function getSurveyComparison(
    flightId: string,
    threshold: number,
    usage: TSurveyUsageValues,
  ): Promise<TSurveyComparison> {
    const responses = await Response().countDocuments({ flightId });
    if (responses < threshold) {
      return { responses, threshold };
    }
    const group: { _id: null } & Record<string, unknown> = { _id: null };
    for (const key of SURVEY_USAGE_KEYS) {
      group[key] = { $avg: `$usage.${key}` };
      group[`${key}Below`] = {
        $sum: {
          $cond: [{ $lt: [{ $ifNull: [`$usage.${key}`, 0] }, usage[key] ?? 0] }, 1, 0],
        },
      };
    }
    const [row] = await Response().aggregate<Record<string, number>>([
      { $match: { flightId } },
      { $group: group },
    ]);
    const averages = Object.fromEntries(
      SURVEY_USAGE_KEYS.map((key) => [key, round(row?.[key] ?? 0)]),
    ) as TSurveyUsageValues;
    const others = Math.max(responses - 1, 0);
    const percentiles = Object.fromEntries(
      SURVEY_USAGE_KEYS.map((key) => [
        key,
        others === 0 ? 0 : Math.round(((row?.[`${key}Below`] ?? 0) / others) * 100),
      ]),
    ) as TSurveyUsageValues;
    return { responses, threshold, averages, percentiles };
  }

  async function countActiveAccounts(match: ActiveAccountMatch): Promise<number> {
    const Message = mongoose.models.Message as Model<IMessage>;
    const active = await Message.aggregate<{ total: number }>([
      { $match: match },
      { $group: { _id: '$user' } },
      { $count: 'total' },
    ]);
    return active[0]?.total ?? 0;
  }

  async function getSurveyStats(flightId: string, activeSince: Date): Promise<SurveyStats> {
    const User = mongoose.models.User as Model<IUser>;
    const flight = await Flight()
      .findOne({ flightId })
      .select('audience')
      .lean<Pick<SurveyFlightData, 'audience'> | null>();
    const audience = normalizeAudience(flight?.audience);
    const activeMatch: ActiveAccountMatch = {
      isCreatedByUser: true,
      isTemporary: { $ne: true },
      createdAt: { $gte: activeSince },
    };

    if (!audience) {
      const [responses, accounts, activeAccounts] = await Promise.all([
        Response().countDocuments({ flightId }),
        User.countDocuments({}),
        countActiveAccounts(activeMatch),
      ]);
      return { responses, accounts, activeAccounts };
    }

    const [responses, members] = await Promise.all([
      Response().countDocuments({ flightId }),
      User.find({ email: { $in: audience } })
        .select('_id')
        .lean<Array<{ _id: { toString(): string } }>>(),
    ]);
    const ids = members.map((member) => String(member._id));
    const activeAccounts =
      ids.length === 0 ? 0 : await countActiveAccounts({ ...activeMatch, user: { $in: ids } });
    return { responses, accounts: ids.length, activeAccounts };
  }

  function nudgeFilter(flightId: string, user: string, tenantId?: string) {
    return { flightId, user, ...(tenantId !== undefined ? { tenantId } : {}) };
  }

  async function getSurveyNudge(
    flightId: string,
    user: string,
    tenantId?: string,
  ): Promise<SurveyNudgeState | null> {
    const doc = await Nudge()
      .findOne(nudgeFilter(flightId, user, tenantId))
      .select('nextAt dismissals')
      .lean<Pick<SurveyNudgeData, 'nextAt' | 'dismissals'> | null>();
    if (!doc) {
      return null;
    }
    return { nextAt: new Date(doc.nextAt), dismissals: doc.dismissals };
  }

  /**
   * One atomic upsert. The pipeline only moves `nextAt` forward when the stored
   * cooldown has elapsed, so a second tab or a double click cannot skip a step.
   */
  async function recordSurveyNudge(
    input: RecordSurveyNudgeInput,
  ): Promise<RecordSurveyNudgeResult> {
    const now = input.now ?? new Date();
    const schedule = nudgeSchedule(input.schedule);
    const advancing = {
      $or: [{ $lte: ['$nextAt', now] }, { $eq: [{ $ifNull: ['$nextAt', null] }, null] }],
    };
    const prior = { $ifNull: ['$dismissals', 0] };
    const delay = {
      $arrayElemAt: [schedule, { $min: [prior, schedule.length - 1] }],
    };
    const pipeline = [
      {
        $set: {
          flightId: input.flightId,
          user: input.user,
          ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
          lastReason: {
            $cond: [advancing, input.reason, { $ifNull: ['$lastReason', input.reason] }],
          },
          dismissals: { $cond: [advancing, { $add: [prior, 1] }, prior] },
          nextAt: {
            $cond: [advancing, { $add: [now, { $multiply: [delay, DAY_MS] }] }, '$nextAt'],
          },
          createdAt: { $ifNull: ['$createdAt', now] },
          updatedAt: now,
        },
      },
    ];
    const filter = nudgeFilter(input.flightId, input.user, input.tenantId);

    const write = async (attempt: number): Promise<SurveyNudgeData> => {
      try {
        const doc = await Nudge()
          .findOneAndUpdate(filter, pipeline, { new: true, upsert: true })
          .lean<SurveyNudgeData | null>();
        if (!doc) {
          throw new Error('Survey nudge was not stored');
        }
        return doc;
      } catch (error) {
        if (isDuplicateKey(error) && attempt < 1) {
          return write(attempt + 1);
        }
        throw error;
      }
    };

    const stored = await write(0);
    return {
      nextAt: new Date(stored.nextAt),
      dismissals: stored.dismissals,
      delayDays: getSurveyNudgeDelayDays(schedule, Math.max(0, stored.dismissals - 1)),
    };
  }

  return {
    getArmedSurveyFlight,
    getLatestSurveyFlight,
    armSurveyFlight,
    closeSurveyFlight,
    hasSurveyResponse,
    createSurveyResponse,
    getSurveyComparison,
    getSurveyStats,
    getSurveyNudge,
    recordSurveyNudge,
  };
}
