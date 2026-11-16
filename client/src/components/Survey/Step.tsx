import { Input, Textarea } from '@librechat/client';
import {
  SURVEY_CULTURE,
  SURVEY_WISHES,
  SURVEY_EXCLUSIVE,
  SURVEY_LETDOWNS,
  SURVEY_NOTE_MAX,
  SURVEY_REPLACED,
  SURVEY_TIME_USES,
  SURVEY_WISHES_MAX,
  SURVEY_HOURS_MAX,
  SURVEY_TASK_KINDS,
  SURVEY_FEEDBACK_MAX,
  SURVEY_HOURS_RANGES,
  SURVEY_JOB_FUNCTIONS,
  SURVEY_MINUTES_MAX,
  SURVEY_DISAPPOINTMENT,
  SURVEY_IMPROVEMENT_MAX,
  SURVEY_SATISFACTION_MAX,
  SURVEY_TASK_FREQUENCIES,
} from 'librechat-data-provider';
import type { TSurveyBestTask, TSurveyCompany, TSurveyStepId } from 'librechat-data-provider';
import type { SurveyDraftAnswers } from './answers';
import type { TranslationKeys } from '~/hooks';
import { parseHours, parseMinutes, shuffleOptions, toggleChoice } from './answers';
import { useLocalize } from '~/hooks';
import Company from './Company';
import Pills from './Pills';

type StepProps = {
  step: TSurveyStepId;
  answers: SurveyDraftAnswers;
  companies: TSurveyCompany[];
  /** Id of the heading, which labels the controls below it. */
  labelId: string;
  /** Keeps shuffled option order stable for this person. */
  seed: string;
  onChange: (patch: SurveyDraftAnswers) => void;
};

/** Survey keys are built from the option ids, so they are checked by the locale files' own tests. */
export const surveyKey = (...parts: string[]) => `com_survey_${parts.join('_')}` as TranslationKeys;

const asText = (value: boolean | undefined) => (value === undefined ? [] : [value ? 'yes' : 'no']);

function Note({
  id,
  value,
  label,
  max = SURVEY_NOTE_MAX,
  rows = 3,
  spaced = true,
  onChange,
}: {
  id: string;
  value?: string;
  label: string;
  max?: number;
  rows?: number;
  /** False when the parent already separates this field from the one above it. */
  spaced?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={spaced ? 'mt-4 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label htmlFor={id} className="text-sm text-text-secondary">
        {label}
      </label>
      <Textarea
        id={id}
        rows={rows}
        value={value ?? ''}
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Minutes({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value?: number;
  onChange: (input: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-text-secondary">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={SURVEY_MINUTES_MAX}
        step={1}
        className="w-28"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default function Step({ step, answers, companies, labelId, seed, onChange }: StepProps) {
  const localize = useLocalize();

  const options = (prefix: string, values: readonly string[]) =>
    values.map((value) => ({ value, label: localize(surveyKey(prefix, value)) }));

  const ordered = (values: readonly string[], pinned: readonly string[] = []) =>
    shuffleOptions(values, seed, pinned);

  const jobs = options('job', SURVEY_JOB_FUNCTIONS);
  const taskKinds = options('task', SURVEY_TASK_KINDS);
  const frequencies = options('frequency', SURVEY_TASK_FREQUENCIES);
  const ranges = options('hours', SURVEY_HOURS_RANGES);
  const timeUses = options('timeuse', ordered(SURVEY_TIME_USES));
  const replaced = options('replaced', ordered(SURVEY_REPLACED, [SURVEY_EXCLUSIVE.replaced]));
  const disappointment = options('disappointment', SURVEY_DISAPPOINTMENT);
  const letdowns = options('letdown', ordered(SURVEY_LETDOWNS, [SURVEY_EXCLUSIVE.letdowns]));
  const wishes = options('wish', ordered(SURVEY_WISHES, ['other']));
  const culture = options('culture', SURVEY_CULTURE);
  const improvement = Array.from({ length: SURVEY_IMPROVEMENT_MAX }, (_, index) => {
    const value = String(index + 1);
    return { value, label: localize(surveyKey('improvement', value)) };
  });
  const yesNo = [
    { value: 'yes', label: localize('com_survey_yes') },
    { value: 'no', label: localize('com_survey_no') },
  ];
  const scale = (max: number) =>
    Array.from({ length: max }, (_, index) => ({
      value: String(index + 1),
      label: String(index + 1),
    }));

  const choose =
    <K extends keyof SurveyDraftAnswers>(field: K) =>
    (value: string) =>
      onChange({ [field]: value } as SurveyDraftAnswers);
  const toggle = (field: 'timeUses' | 'replaced' | 'letdowns' | 'wishes') => (value: string) => {
    const exclusive =
      field === 'replaced' || field === 'letdowns' ? SURVEY_EXCLUSIVE[field] : undefined;
    onChange({
      [field]: toggleChoice(answers[field], value, exclusive),
    } as SurveyDraftAnswers);
  };

  const task = answers.bestTask ?? {};
  const setTask = (patch: Partial<TSurveyBestTask>) =>
    onChange({ bestTask: { ...task, ...patch } });
  const setMinutes = (field: 'minutesWithout' | 'minutesWith') => (input: string) => {
    const minutes = parseMinutes(input);
    const next: Partial<TSurveyBestTask> = { ...task };
    if (minutes === undefined) {
      delete next[field];
    } else {
      next[field] = minutes;
    }
    onChange({ bestTask: next });
  };

  switch (step) {
    case 'company':
      return (
        <Company
          tree={companies}
          value={answers.company ?? []}
          labelledBy={labelId}
          onChange={(company) => onChange({ company })}
        />
      );
    case 'job':
      return (
        <>
          <Pills
            options={jobs}
            value={answers.jobFunction ? [answers.jobFunction] : []}
            labelledBy={labelId}
            onToggle={choose('jobFunction')}
          />
          {answers.jobFunction === 'other' && (
            <div className="mt-4 flex flex-col gap-1">
              <label htmlFor="survey-job-other" className="text-sm text-text-secondary">
                {localize('com_survey_job_other_label')}
              </label>
              <Input
                id="survey-job-other"
                value={answers.jobOther ?? ''}
                maxLength={100}
                onChange={(event) => onChange({ jobOther: event.target.value })}
              />
            </div>
          )}
        </>
      );
    case 'bestTask':
      return (
        <div className="flex flex-col gap-4">
          <Pills
            options={taskKinds}
            value={task.kind ? [task.kind] : []}
            labelledBy={labelId}
            onToggle={(kind) => setTask({ kind: kind as TSurveyBestTask['kind'] })}
          />
          <Note
            id="survey-best-note"
            spaced={false}
            label={localize('com_survey_best_task_note')}
            value={task.note}
            onChange={(note) => setTask({ note })}
          />
          <div className="flex flex-wrap gap-4">
            <Minutes
              id="survey-minutes-without"
              label={localize('com_survey_best_task_without')}
              value={task.minutesWithout}
              onChange={setMinutes('minutesWithout')}
            />
            <Minutes
              id="survey-minutes-with"
              label={localize('com_survey_best_task_with')}
              value={task.minutesWith}
              onChange={setMinutes('minutesWith')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p id="survey-best-often" className="text-sm text-text-secondary">
              {localize('com_survey_best_task_often')}
            </p>
            <Pills
              options={frequencies}
              value={task.frequency ? [task.frequency] : []}
              labelledBy="survey-best-often"
              onToggle={(frequency) =>
                setTask({ frequency: frequency as TSurveyBestTask['frequency'] })
              }
            />
          </div>
        </div>
      );
    case 'hours':
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Input
              id="survey-hours"
              type="number"
              inputMode="decimal"
              min={0}
              max={SURVEY_HOURS_MAX}
              step={0.5}
              className="w-28"
              aria-labelledby={labelId}
              value={answers.hoursSaved?.hours ?? ''}
              onChange={(event) => {
                const hours = parseHours(event.target.value);
                onChange({ hoursSaved: hours === undefined ? undefined : { hours } });
              }}
            />
            <label htmlFor="survey-hours" className="text-sm text-text-secondary">
              {localize('com_survey_hours_unit')}
            </label>
          </div>
          <p id="survey-hours-or" className="text-sm text-text-secondary">
            {localize('com_survey_hours_or')}
          </p>
          <Pills
            options={ranges}
            value={answers.hoursSaved?.range ? [answers.hoursSaved.range] : []}
            labelledBy="survey-hours-or"
            onToggle={(range) =>
              onChange({ hoursSaved: { range: range as (typeof SURVEY_HOURS_RANGES)[number] } })
            }
          />
        </div>
      );
    case 'timeUses':
      return (
        <Pills
          multiple
          options={timeUses}
          value={answers.timeUses ?? []}
          labelledBy={labelId}
          onToggle={toggle('timeUses')}
        />
      );
    case 'improvement':
      return (
        <Pills
          options={improvement}
          value={answers.improvement === undefined ? [] : [String(answers.improvement)]}
          labelledBy={labelId}
          onToggle={(value) => onChange({ improvement: Number(value) })}
        />
      );
    case 'enabled':
      return (
        <>
          <Pills
            options={yesNo}
            value={asText(answers.enabled)}
            labelledBy={labelId}
            onToggle={(value) => onChange({ enabled: value === 'yes' })}
          />
          {answers.enabled === true && (
            <Note
              id="survey-enabled-note"
              label={localize('com_survey_enabled_note')}
              value={answers.enabledNote}
              onChange={(enabledNote) => onChange({ enabledNote })}
            />
          )}
        </>
      );
    case 'replaced':
      return (
        <Pills
          multiple
          options={replaced}
          value={answers.replaced ?? []}
          labelledBy={labelId}
          onToggle={toggle('replaced')}
        />
      );
    case 'disappointment':
      return (
        <Pills
          options={disappointment}
          value={answers.disappointment ? [answers.disappointment] : []}
          labelledBy={labelId}
          onToggle={choose('disappointment')}
        />
      );
    case 'letdowns':
      return (
        <>
          <Pills
            multiple
            options={letdowns}
            value={answers.letdowns ?? []}
            labelledBy={labelId}
            onToggle={toggle('letdowns')}
          />
          <Note
            id="survey-letdown-note"
            label={localize('com_survey_letdown_note')}
            value={answers.letdownNote}
            onChange={(letdownNote) => onChange({ letdownNote })}
          />
        </>
      );
    case 'wishes': {
      const full = (answers.wishes?.length ?? 0) >= SURVEY_WISHES_MAX;
      return (
        <>
          <Pills
            multiple
            options={wishes}
            value={answers.wishes ?? []}
            labelledBy={labelId}
            isDisabled={() => full}
            onToggle={toggle('wishes')}
          />
          <p className="mt-3 text-sm text-text-secondary" aria-live="polite">
            {localize('com_survey_selected_count', {
              0: answers.wishes?.length ?? 0,
              1: SURVEY_WISHES_MAX,
            })}
          </p>
          <Note
            id="survey-wish-task"
            label={localize('com_survey_wish_task')}
            value={answers.wishTask}
            onChange={(wishTask) => onChange({ wishTask })}
          />
        </>
      );
    }
    case 'culture':
      return (
        <Pills
          options={culture}
          value={answers.culture ? [answers.culture] : []}
          labelledBy={labelId}
          onToggle={choose('culture')}
        />
      );
    case 'satisfaction':
      return (
        <Scale
          options={scale(SURVEY_SATISFACTION_MAX)}
          value={answers.satisfaction}
          labelledBy={labelId}
          low={localize('com_survey_satisfaction_low')}
          high={localize('com_survey_satisfaction_high')}
          onSelect={(satisfaction) => onChange({ satisfaction })}
        />
      );
    case 'feedback':
      return (
        <Textarea
          rows={6}
          aria-labelledby={labelId}
          value={answers.feedback ?? ''}
          maxLength={SURVEY_FEEDBACK_MAX}
          onChange={(event) => onChange({ feedback: event.target.value })}
        />
      );
  }
}

function Scale({
  options,
  value,
  labelledBy,
  low,
  high,
  onSelect,
}: {
  options: { value: string; label: string }[];
  value?: number;
  labelledBy: string;
  low: string;
  high: string;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Pills
        options={options}
        value={value === undefined ? [] : [String(value)]}
        labelledBy={labelledBy}
        className="justify-center"
        onToggle={(next) => onSelect(Number(next))}
      />
      <div className="flex justify-between text-xs text-text-secondary">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
