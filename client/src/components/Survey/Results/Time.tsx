import { SURVEY_GAIN_RANGES, getSurveyGainRange } from 'librechat-data-provider';
import type { TSurveyDraftAnswers, TSurveyGainUse, TSurveyResult } from 'librechat-data-provider';
import {
  colleagueTask,
  hoursSaved,
  showGain,
  taskSaving,
  topShares,
  workDaysPerYear,
} from '../stats';
import Duration from '../Charts/Duration';
import useFormatNumber from '../format';
import People from '../Charts/People';
import { useLocalize } from '~/hooks';
import { surveyKey } from '../Step';
import Bars from '../Charts/Bars';

type TimeProps = { result: TSurveyResult; answers: TSurveyDraftAnswers };

/** What the person gains in time, with colleagues' gains alongside once there are enough. */
export default function Time({ result, answers }: TimeProps) {
  const localize = useLocalize();
  const format = useFormatNumber();
  const { comparison } = result;
  const gains = comparison.ready ? comparison.gains : undefined;
  const hours = hoursSaved(answers);
  const task = taskSaving(answers.bestTask);
  const others = colleagueTask(gains);
  const scale = Math.max(task?.without ?? 0, others?.without ?? 0, 1);
  const ownRange = getSurveyGainRange(hours);
  const ownUses = (answers.timeUses ?? []).filter(
    (use): use is TSurveyGainUse => use !== 'evaporates',
  );
  const percent = (share: number) => `${share}%`;

  return (
    <div className="flex flex-col gap-6">
      {(hours !== undefined || task) && (
        <div
          className={
            hours !== undefined && task
              ? 'grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]'
              : 'flex flex-col gap-5'
          }
        >
          {hours !== undefined && (
            <section className="flex flex-col gap-1 rounded-xl border border-border-light bg-surface-secondary p-4">
              <p className="text-xs text-text-secondary">{localize('com_survey_res_save_lead')}</p>
              <p className="text-2xl font-semibold text-text-primary">
                {localize('com_survey_res_save_value', { 0: format(hours) })}
              </p>
              <p className="text-sm text-text-secondary">
                {localize('com_survey_res_save_year', { 0: workDaysPerYear(hours) })}
              </p>
            </section>
          )}
          {task && answers.bestTask?.kind && (
            <section className="flex flex-col gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">
                  {localize('com_survey_res_task_title', {
                    0: localize(surveyKey('task', answers.bestTask.kind)),
                  })}
                </h4>
                <p className="text-xs text-text-secondary">
                  {localize('com_survey_res_task_caption')}
                </p>
              </div>
              <Duration
                title={localize('com_survey_res_you_once')}
                without={task.without}
                with={task.with}
                max={scale}
                yours
              />
              {others && (
                <Duration
                  title={localize('com_survey_res_typical_once')}
                  without={others.without}
                  with={others.with}
                  max={scale}
                />
              )}
              <p className="text-sm text-text-primary">
                {task.hoursPerMonth >= 0.5
                  ? localize('com_survey_res_task_saved_month', {
                      0: task.saved,
                      1: format(task.hoursPerMonth),
                    })
                  : localize('com_survey_res_task_saved', { 0: task.saved })}
              </p>
            </section>
          )}
        </div>
      )}

      {gains && showGain(gains.savers) && (
        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-text-primary">
            {localize('com_survey_res_colleagues_time')}
          </h4>
          <div className="grid items-start gap-6 md:grid-cols-3">
            <People
              percent={gains.savers}
              label={localize('com_survey_res_savers')}
              detail={
                gains.medianHours > 0
                  ? localize('com_survey_res_typical_saving', { 0: format(gains.medianHours) })
                  : undefined
              }
            />
            <div className="flex flex-col gap-2">
              <div>
                <h5 className="text-sm font-semibold text-text-primary">
                  {localize('com_survey_res_hours_title')}
                </h5>
                <p className="text-xs text-text-secondary">
                  {localize('com_survey_res_hours_axis')}
                </p>
              </div>
              <Bars
                neutral
                max={Math.max(1, ...SURVEY_GAIN_RANGES.map((range) => gains.hours[range]))}
                label={localize('com_survey_res_hours_title')}
                rows={SURVEY_GAIN_RANGES.map((range) => ({
                  key: range,
                  label: localize(surveyKey('hours', range)),
                  value: gains.hours[range],
                  display: percent(gains.hours[range]),
                  yours: range === ownRange,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <h5 className="text-sm font-semibold text-text-primary">
                  {localize('com_survey_res_uses_title')}
                </h5>
                <p className="text-xs text-text-secondary">
                  {localize('com_survey_res_uses_axis')}
                </p>
              </div>
              <Bars
                neutral
                max={Math.max(1, ...Object.values(gains.uses))}
                label={localize('com_survey_res_uses_title')}
                rows={topShares(gains.uses, 5, ownUses).map((row) => ({
                  key: row.key,
                  label: localize(surveyKey('timeuse', row.key)),
                  value: row.share,
                  display: percent(row.share),
                  yours: row.yours,
                }))}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
