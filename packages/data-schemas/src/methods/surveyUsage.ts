import {
  Constants,
  PrincipalType,
  ResourceType,
  SURVEY_TOP_TOOLS,
  SURVEY_USAGE_VERSION,
} from 'librechat-data-provider';
import type { TSurveyDay, TSurveyToolUse, TSurveyUsage } from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type {
  IAclEntry,
  IAgent,
  IAgentApiKey,
  IConversation,
  IMessage,
  IMongoFile,
  IPromptGroup,
  ISchedule,
  IScheduleRun,
  ISkill,
  IUser,
} from '~/types';

export type SurveyUsageWindow = { userId: string; from: Date; to: Date; windowDays: number };

export type SurveyUsageSnapshot = {
  usage: TSurveyUsage;
  /** One entry per UTC day from `from` to `to`, quiet days included. Not stored. */
  activity: TSurveyDay[];
};

export type SurveyUsageMethods = {
  getUserUsageSnapshot: (window: SurveyUsageWindow) => Promise<SurveyUsageSnapshot>;
};

type DayRow = { _id: string; messages: number; tokens: number; first: Date };
type ReceivedRow = {
  responses: number;
  tokens: number;
  failed: number;
  up: number;
  down: number;
};
type ToolRow = { _id: string; calls: number };
type IdRow<T> = { _id: T };
type OwnedAgent = { _id: unknown; id: string; createdAt?: Date };
type UsedAgent = { id: string; author: { toString(): string } };

const dayMs = 24 * 60 * 60 * 1000;
const weekMs = 7 * dayMs;
const CODE_TOOL_NAMES = ['execute_code', 'run_tools_with_code'];
const SPREADSHEET_TYPE = /csv|spreadsheet|excel/i;
const SPREADSHEET_NAME = /\.(csv|tsv|xlsx?|xlsm|ods)$/i;

/** Counts, distinct tools, MCP usage and the few tools worth naming, from one grouping. */
function summarizeTools(rows: ToolRow[]): {
  toolCalls: number;
  toolsDistinct: number;
  mcpToolCalls: number;
  mcpServers: number;
  codeRuns: number;
  topTools: TSurveyToolUse[];
} {
  const marker = Constants.mcp_delimiter;
  const servers = new Set<string>();
  let toolCalls = 0;
  let mcpToolCalls = 0;
  let codeRuns = 0;
  const named = rows.filter((row) => row._id.length > 0 && row.calls > 0);
  for (const row of named) {
    toolCalls += row.calls;
    if ((CODE_TOOL_NAMES as readonly string[]).includes(row._id)) {
      codeRuns += row.calls;
    }
    const split = row._id.lastIndexOf(marker);
    if (split > 0) {
      mcpToolCalls += row.calls;
      servers.add(row._id.slice(split + marker.length));
    }
  }
  const topTools = [...named]
    .sort((a, b) => b.calls - a.calls || a._id.localeCompare(b._id))
    .slice(0, SURVEY_TOP_TOOLS)
    .map((row) => ({ name: row._id, calls: row.calls }));
  return {
    toolCalls,
    toolsDistinct: named.length,
    mcpToolCalls,
    mcpServers: servers.size,
    codeRuns,
    topTools,
  };
}

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

/** Every UTC day in the window, with the messages sent on it. */
function fillActivity(rows: DayRow[], from: Date, to: Date): TSurveyDay[] {
  const sent = new Map(rows.map((row) => [row._id, row.messages]));
  const last = Date.parse(utcDay(to));
  const days: TSurveyDay[] = [];
  for (let time = Date.parse(utcDay(from)); time <= last; time += dayMs) {
    const date = utcDay(new Date(time));
    days.push({ date, messages: sent.get(date) ?? 0 });
  }
  return days;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Per-person usage counts for the survey window. Every read runs in parallel; the
 * only chained reads are the ones that need an id list from an earlier read.
 * Temporary chats and subagent threads are excluded, matching the insights dashboard.
 */
export function createSurveyUsageMethods(mongoose: typeof import('mongoose')): SurveyUsageMethods {
  async function getUserUsageSnapshot({
    userId,
    from,
    to,
    windowDays,
  }: SurveyUsageWindow): Promise<SurveyUsageSnapshot> {
    const Message = mongoose.models.Message as Model<IMessage>;
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const Agent = mongoose.models.Agent as Model<IAgent>;
    const AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
    const Skill = mongoose.models.Skill as Model<ISkill>;
    const Schedule = mongoose.models.Schedule as Model<ISchedule>;
    const ScheduleRun = mongoose.models.ScheduleRun as Model<IScheduleRun>;
    const AgentApiKey = mongoose.models.AgentApiKey as Model<IAgentApiKey>;
    const PromptGroup = mongoose.models.PromptGroup as Model<IPromptGroup>;
    const File = mongoose.models.File as Model<IMongoFile>;
    const User = mongoose.models.User as Model<IUser>;

    const author = new mongoose.Types.ObjectId(userId);
    const inWindow = { $gte: from, $lte: to };
    const sent = {
      user: userId,
      isCreatedByUser: true,
      isTemporary: { $ne: true },
      createdAt: inWindow,
    };
    const received = { ...sent, isCreatedByUser: false };
    const ownConversation = {
      user: userId,
      isTemporary: { $ne: true },
      subagentThread: { $exists: false },
    };

    /** Owned resources first, then who they were shared with and who used them. */
    const ownedAgentUsage = async () => {
      const owned = await Agent.find({ author }).select('_id id createdAt').lean<OwnedAgent[]>();
      const resourceIds = owned.map((agent) => agent._id);
      const agentIds = owned.map((agent) => agent.id);
      const [shared, audience] =
        owned.length === 0
          ? [[], []]
          : await Promise.all([
              AclEntry.distinct('resourceId', {
                resourceType: ResourceType.AGENT,
                resourceId: { $in: resourceIds },
                $or: [
                  { principalType: { $ne: PrincipalType.USER } },
                  { principalType: PrincipalType.USER, principalId: { $ne: author } },
                ],
              }),
              Conversation.distinct('user', {
                ...ownConversation,
                user: { $ne: userId, $nin: [null, ''] },
                createdAt: inWindow,
                $or: [
                  { initial_agent_id: { $in: agentIds } },
                  { initial_agent_id: { $exists: false }, agent_id: { $in: agentIds } },
                ],
              }),
            ]);
      return {
        owned: owned.length,
        created: owned.filter((agent) => agent.createdAt && agent.createdAt >= from).length,
        shared: shared.length,
        audience: audience.length,
      };
    };

    const usedAgents = async () => {
      const rows = await Conversation.aggregate<IdRow<string>>([
        {
          $match: {
            ...ownConversation,
            updatedAt: inWindow,
            $or: [
              { initial_agent_id: { $exists: true, $nin: [null, ''] } },
              {
                initial_agent_id: { $exists: false },
                agent_id: { $exists: true, $nin: [null, ''] },
              },
            ],
          },
        },
        { $group: { _id: { $ifNull: ['$initial_agent_id', '$agent_id'] } } },
      ]);
      const ids = rows.map((row) => row._id);
      if (ids.length === 0) {
        return { own: 0, others: 0 };
      }
      const agents = await Agent.find({ id: { $in: ids } })
        .select('id author')
        .lean<UsedAgent[]>();
      const own = agents.filter((agent) => agent.author.toString() === userId).length;
      return { own, others: agents.length - own };
    };

    const ownedPromptUsage = async () => {
      const groups = await PromptGroup.find({ author }).select('_id').lean<IdRow<unknown>[]>();
      if (groups.length === 0) {
        return { owned: 0, shared: 0 };
      }
      const shared = await AclEntry.distinct('resourceId', {
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: { $in: groups.map((group) => group._id) },
        $or: [
          { principalType: { $ne: PrincipalType.USER } },
          { principalType: PrincipalType.USER, principalId: { $ne: author } },
        ],
      });
      return { owned: groups.length, shared: shared.length };
    };

    const [
      dayRows,
      receivedRows,
      regenerationRows,
      conversationRows,
      conversations,
      used,
      agents,
      skillsOwned,
      schedulesActive,
      scheduleRuns,
      agentApiKeys,
      prompts,
      filesUploaded,
      spreadsheetUploads,
      toolRows,
      account,
    ] = await Promise.all([
      Message.aggregate<DayRow>([
        { $match: sent },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
            messages: { $sum: 1 },
            tokens: { $sum: { $ifNull: ['$tokenCount', 0] } },
            first: { $min: '$createdAt' },
          },
        },
      ]),
      Message.aggregate<ReceivedRow>([
        { $match: received },
        {
          $group: {
            _id: null,
            responses: { $sum: 1 },
            tokens: { $sum: { $ifNull: ['$tokenCount', 0] } },
            failed: {
              $sum: {
                $cond: [{ $or: [{ $eq: ['$error', true] }, { $eq: ['$unfinished', true] }] }, 1, 0],
              },
            },
            up: { $sum: { $cond: [{ $eq: ['$feedback.rating', 'thumbsUp'] }, 1, 0] } },
            down: { $sum: { $cond: [{ $eq: ['$feedback.rating', 'thumbsDown'] }, 1, 0] } },
          },
        },
      ]),
      Message.aggregate<{ extra: number }>([
        { $match: received },
        { $group: { _id: '$parentMessageId', responses: { $sum: 1 } } },
        { $match: { responses: { $gt: 1 } } },
        { $group: { _id: null, extra: { $sum: { $subtract: ['$responses', 1] } } } },
      ]),
      Message.aggregate<{ _id: string; messages: number }>([
        { $match: sent },
        { $group: { _id: '$conversationId', messages: { $sum: 1 } } },
      ]),
      Conversation.countDocuments({ ...ownConversation, createdAt: inWindow }),
      usedAgents(),
      ownedAgentUsage(),
      Skill.countDocuments({ author }),
      Schedule.countDocuments({ user: author, enabled: true }),
      ScheduleRun.countDocuments({ user: author, createdAt: inWindow }),
      AgentApiKey.countDocuments({ userId: author }),
      ownedPromptUsage(),
      File.countDocuments({ user: author, createdAt: inWindow }),
      File.countDocuments({
        user: author,
        createdAt: inWindow,
        $or: [{ type: SPREADSHEET_TYPE }, { filename: SPREADSHEET_NAME }],
      }),
      Message.aggregate<ToolRow>([
        { $match: received },
        { $unwind: '$content' },
        {
          $match: {
            'content.type': 'tool_call',
            'content.tool_call.name': { $type: 'string', $ne: '' },
          },
        },
        { $group: { _id: '$content.tool_call.name', calls: { $sum: 1 } } },
      ]),
      User.findById(userId).select('createdAt').lean<{ createdAt?: Date }>(),
    ]);

    const weeks = new Set(
      dayRows.map((row) => Math.floor((to.getTime() - row.first.getTime()) / weekMs)),
    );
    const reply = receivedRows[0];
    const tokensInput = dayRows.reduce((total, row) => total + row.tokens, 0);
    const tokensOutput = reply?.tokens ?? 0;
    const tools = summarizeTools(toolRows);

    const usage: TSurveyUsage = {
      version: SURVEY_USAGE_VERSION,
      windowDays,
      messagesSent: dayRows.reduce((total, row) => total + row.messages, 0),
      responsesReceived: reply?.responses ?? 0,
      activeDays: dayRows.length,
      activeWeeks: weeks.size,
      conversations,
      medianMessagesPerConversation: median(conversationRows.map((row) => row.messages)),
      daysSinceFirstUse: account?.createdAt
        ? Math.max(0, Math.floor((to.getTime() - account.createdAt.getTime()) / dayMs))
        : 0,
      tokensInput,
      tokensOutput,
      tokensTotal: tokensInput + tokensOutput,
      agentsOwned: agents.owned,
      agentsCreated: agents.created,
      agentsShared: agents.shared,
      agentsUsedOwn: used.own,
      agentsUsedOthers: used.others,
      agentAudience: agents.audience,
      skillsOwned,
      schedulesActive,
      scheduleRuns,
      agentApiKeys,
      promptsOwned: prompts.owned,
      promptsShared: prompts.shared,
      filesUploaded,
      codeRuns: tools.codeRuns,
      toolCalls: tools.toolCalls,
      toolsDistinct: tools.toolsDistinct,
      mcpToolCalls: tools.mcpToolCalls,
      mcpServers: tools.mcpServers,
      spreadsheetUploads,
      regenerations: regenerationRows[0]?.extra ?? 0,
      failedResponses: reply?.failed ?? 0,
      feedbackUp: reply?.up ?? 0,
      feedbackDown: reply?.down ?? 0,
      topTools: tools.topTools,
    };
    return { usage, activity: fillActivity(dayRows, from, to) };
  }

  return { getUserUsageSnapshot };
}
