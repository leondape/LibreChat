import type { TSurveyUsage } from 'librechat-data-provider';

export type SurveyTitleId =
  | 'agent_architect'
  | 'automation_pro'
  | 'tool_explorer'
  | 'data_wrangler'
  | 'daily_driver'
  | 'power_prompter'
  | 'curious_explorer';

type UsageTitle = Pick<
  TSurveyUsage,
  | 'agentsCreated'
  | 'agentAudience'
  | 'scheduleRuns'
  | 'agentApiKeys'
  | 'toolsDistinct'
  | 'mcpServers'
  | 'spreadsheetUploads'
  | 'codeRuns'
  | 'activeDays'
  | 'messagesSent'
>;

/** The first rule that fits. The last one is everyone else. */
export function getSurveyTitle(usage: UsageTitle): SurveyTitleId {
  if (usage.agentsCreated >= 2 || usage.agentAudience >= 3) {
    return 'agent_architect';
  }
  if (usage.scheduleRuns >= 4 || usage.agentApiKeys >= 1) {
    return 'automation_pro';
  }
  if (usage.toolsDistinct >= 5 || usage.mcpServers >= 2) {
    return 'tool_explorer';
  }
  if (usage.spreadsheetUploads + usage.codeRuns >= 5) {
    return 'data_wrangler';
  }
  if (usage.activeDays >= 15) {
    return 'daily_driver';
  }
  if (usage.messagesSent >= 150) {
    return 'power_prompter';
  }
  return 'curious_explorer';
}
