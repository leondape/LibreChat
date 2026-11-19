import { SURVEY_DISTRIBUTION_KEYS } from 'librechat-data-provider';
import type { TSurveyDraftAnswers, TSurveyResult } from 'librechat-data-provider';
import { hasSpread, showGain, topShares } from '../stats';
import Histogram from '../Charts/Histogram';
import useFormatNumber from '../format';
import People from '../Charts/People';
import { useLocalize } from '~/hooks';
import { surveyKey } from '../Step';
import Bars from '../Charts/Bars';

const TASKS_SHOWN = 5;

type ColleaguesProps = { result: TSurveyResult; answers: TSurveyDraftAnswers };

/** How the person compares with everyone who answered, and what colleagues get out of WanGPT. */
export default function Colleagues({ result, answers }: ColleaguesProps) {
  const localize = useLocalize();
  const format = useFormatNumber();
  const { comparison, usage } = result;

  if (!comparison.ready) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-dashed border-border-medium p-5">
        <h4 className="text-base font-semibold text-text-primary">
          {localize('com_survey_res_waiting_title')}
        </h4>
        <p className="text-sm text-text-secondary">{localize('com_survey_res_waiting_body')}</p>
      </section>
    );
  }

  const { distributions, percentiles, gains } = comparison;
  const own = answers.bestTask?.kind ? [answers.bestTask.kind] : [];
  const charts = SURVEY_DISTRIBUTION_KEYS.filter((key) => hasSpread(distributions[key].bins));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-text-secondary">{localize('com_survey_res_median_note')}</p>
      {charts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {charts.map((key) => (
            <Histogram
              key={key}
              title={localize(surveyKey('card', key === 'messagesSent' ? 'messages' : key))}
              axis={localize(surveyKey('res', 'axis', key), { 0: usage.windowDays })}
              bins={distributions[key].bins}
              median={distributions[key].median}
              you={usage[key]}
              ahead={percentiles[key]}
            />
          ))}
        </div>
      )}
      <div className="grid items-start gap-6 md:grid-cols-2">
        {showGain(gains.enabled) && (
          <People percent={gains.enabled} label={localize('com_survey_res_enabled')} />
        )}
        <div className="flex flex-col gap-2">
          <div>
            <h5 className="text-sm font-semibold text-text-primary">
              {localize('com_survey_res_tasks_title')}
            </h5>
            <p className="text-xs text-text-secondary">{localize('com_survey_res_tasks_axis')}</p>
          </div>
          <Bars
            neutral
            max={Math.max(1, ...Object.values(gains.tasks))}
            label={localize('com_survey_res_tasks_title')}
            rows={topShares(gains.tasks, TASKS_SHOWN, own, ['other']).map((row) => ({
              key: row.key,
              label: localize(surveyKey('task', row.key)),
              value: row.share,
              display: `${format(row.share)}%`,
              yours: row.yours,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
