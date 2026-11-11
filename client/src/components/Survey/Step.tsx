import { Input, Textarea } from '@librechat/client';
import {
  SURVEY_HELP,
  SURVEY_TOOLS,
  SURVEY_HELP_MAX,
  SURVEY_EXCLUSIVE,
  SURVEY_NOTE_MAX,
  SURVEY_HOURS_MAX,
  SURVEY_USE_CASES,
  SURVEY_TIME_USES,
  SURVEY_TIME_COSTS,
  SURVEY_FEEDBACK_MAX,
  SURVEY_JOB_FUNCTIONS,
  SURVEY_HOURS_RANGES,
  SURVEY_QUALITY_MAX,
  SURVEY_SATISFACTION_MAX,
} from 'librechat-data-provider';
import type { TSurveyStepId, TSurveyCompany, TSurveyAnswers } from 'librechat-data-provider';
import type { SurveyDraftAnswers } from './answers';
import type { TranslationKeys } from '~/hooks';
import { parseHours, toggleChoice } from './answers';
import { useLocalize } from '~/hooks';
import Company from './Company';
import Pills from './Pills';

type StepProps = {
  step: TSurveyStepId;
  answers: SurveyDraftAnswers;
  companies: TSurveyCompany[];
  /** Id of the heading, which labels the controls below it. */
  labelId: string;
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
  onChange,
}: {
  id: string;
  value?: string;
  label: string;
  max?: number;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-1">
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

export default function Step({ step, answers, companies, labelId, onChange }: StepProps) {
  const localize = useLocalize();

  const options = (prefix: string, values: readonly string[]) =>
    values.map((value) => ({ value, label: localize(surveyKey(prefix, value)) }));

  const jobs = options('job', SURVEY_JOB_FUNCTIONS);
  const useCases = options('usecase', SURVEY_USE_CASES);
  const ranges = options('hours', SURVEY_HOURS_RANGES);
  const timeUses = options('timeuse', SURVEY_TIME_USES);
  const timeCosts = options('timecost', SURVEY_TIME_COSTS);
  const help = options('help', SURVEY_HELP);
  const tools = options('tool', SURVEY_TOOLS);
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
    <K extends keyof TSurveyAnswers>(field: K) =>
    (value: string) =>
      onChange({ [field]: value } as SurveyDraftAnswers);
  const toggle =
    (field: 'useCases' | 'timeUses' | 'timeCosts' | 'help' | 'tools') => (value: string) => {
      const exclusive =
        field === 'timeCosts' || field === 'tools' ? SURVEY_EXCLUSIVE[field] : undefined;
      onChange({
        [field]: toggleChoice(answers[field], value, exclusive),
      } as SurveyDraftAnswers);
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
    case 'useCases':
      return (
        <Pills
          multiple
          options={useCases}
          value={answers.useCases ?? []}
          labelledBy={labelId}
          onToggle={toggle('useCases')}
        />
      );
    case 'topUseCase':
      return (
        <>
          <Pills
            options={useCases.filter((option) =>
              answers.useCases?.some((item) => item === option.value),
            )}
            value={answers.topUseCase ? [answers.topUseCase] : []}
            labelledBy={labelId}
            onToggle={choose('topUseCase')}
          />
          <Note
            id="survey-top-note"
            label={localize('com_survey_note_optional')}
            value={answers.topUseCaseNote}
            onChange={(topUseCaseNote) => onChange({ topUseCaseNote })}
          />
        </>
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
    case 'quality':
      return (
        <Scale
          options={scale(SURVEY_QUALITY_MAX)}
          value={answers.quality}
          labelledBy={labelId}
          low={localize('com_survey_quality_low')}
          high={localize('com_survey_quality_high')}
          onSelect={(quality) => onChange({ quality })}
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
    case 'timeCosts':
      return (
        <Pills
          multiple
          options={timeCosts}
          value={answers.timeCosts ?? []}
          labelledBy={labelId}
          onToggle={toggle('timeCosts')}
        />
      );
    case 'help': {
      const full = (answers.help?.length ?? 0) >= SURVEY_HELP_MAX;
      return (
        <>
          <Pills
            multiple
            options={help}
            value={answers.help ?? []}
            labelledBy={labelId}
            isDisabled={() => full}
            onToggle={toggle('help')}
          />
          <p className="mt-3 text-sm text-text-secondary" aria-live="polite">
            {localize('com_survey_help_count', {
              0: answers.help?.length ?? 0,
              1: SURVEY_HELP_MAX,
            })}
          </p>
        </>
      );
    }
    case 'trained':
      return (
        <Pills
          options={yesNo}
          value={asText(answers.trained)}
          labelledBy={labelId}
          onToggle={(value) => onChange({ trained: value === 'yes' })}
        />
      );
    case 'tools':
      return (
        <Pills
          multiple
          options={tools}
          value={answers.tools ?? []}
          labelledBy={labelId}
          onToggle={toggle('tools')}
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
