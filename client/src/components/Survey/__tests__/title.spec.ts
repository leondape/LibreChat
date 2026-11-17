import { getSurveyTitle } from '../title';

const quiet = {
  agentsCreated: 0,
  agentAudience: 0,
  scheduleRuns: 0,
  agentApiKeys: 0,
  toolsDistinct: 0,
  mcpServers: 0,
  spreadsheetUploads: 0,
  codeRuns: 0,
  activeDays: 0,
  messagesSent: 0,
};

describe('getSurveyTitle', () => {
  it('picks the first rule that fits and falls back to curious explorer', () => {
    expect(getSurveyTitle({ ...quiet, agentsCreated: 2 })).toBe('agent_architect');
    expect(getSurveyTitle({ ...quiet, agentAudience: 3, scheduleRuns: 9 })).toBe('agent_architect');
    expect(getSurveyTitle({ ...quiet, agentApiKeys: 1 })).toBe('automation_pro');
    expect(getSurveyTitle({ ...quiet, mcpServers: 2 })).toBe('tool_explorer');
    expect(getSurveyTitle({ ...quiet, spreadsheetUploads: 3, codeRuns: 2 })).toBe('data_wrangler');
    expect(getSurveyTitle({ ...quiet, activeDays: 15 })).toBe('daily_driver');
    expect(getSurveyTitle({ ...quiet, messagesSent: 150 })).toBe('power_prompter');
    expect(getSurveyTitle(quiet)).toBe('curious_explorer');
  });
});
