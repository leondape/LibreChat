import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@librechat/client';
import {
  Blocks,
  Compass,
  CalendarCheck,
  CalendarClock,
  MessageSquare,
  Table,
  Wrench,
} from 'lucide-react';
import type { TSurveyDraftAnswers, TSurveyResult } from 'librechat-data-provider';
import type { LucideIcon } from 'lucide-react';
import type { SurveyTitleId } from './title';
import Colleagues from './Results/Colleagues';
import { getSurveyTitle } from './title';
import { hasTimeStory } from './stats';
import { useLocalize } from '~/hooks';
import Month from './Results/Month';
import { surveyKey } from './Step';
import Time from './Results/Time';

const TITLE_ICON: Record<SurveyTitleId, LucideIcon> = {
  agent_architect: Blocks,
  automation_pro: CalendarClock,
  tool_explorer: Wrench,
  data_wrangler: Table,
  daily_driver: CalendarCheck,
  power_prompter: MessageSquare,
  curious_explorer: Compass,
};

type PageId = 'month' | 'time' | 'colleagues';

function fireConfetti() {
  const base = { disableForReducedMotion: true, zIndex: 1000, ticks: 220 };
  confetti({ ...base, particleCount: 90, spread: 70, origin: { x: 0.2, y: 0.7 }, angle: 60 });
  confetti({ ...base, particleCount: 90, spread: 70, origin: { x: 0.8, y: 0.7 }, angle: 120 });
}

type SuccessProps = {
  result: TSurveyResult;
  answers: TSurveyDraftAnswers;
  onClose: () => void;
};

/** Three short pages instead of one long scroll: the month, the time, the colleagues. */
export default function Success({ result, answers, onClose }: SuccessProps) {
  const localize = useLocalize();
  const { usage, comparison } = result;
  const TitleIcon = TITLE_ICON[getSurveyTitle(usage)];
  const title = localize('com_survey_title_you', {
    0: localize(surveyKey('title', getSurveyTitle(usage))),
  });
  const pages: PageId[] = [
    'month',
    ...(hasTimeStory(answers, comparison.ready ? comparison.gains : undefined)
      ? (['time'] as const)
      : []),
    'colleagues',
  ];
  const [page, setPage] = useState<PageId>('month');
  const previous = useRef(page);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const index = pages.indexOf(page);
  const isLast = index === pages.length - 1;
  const label = (id: PageId) => localize(surveyKey('res', 'tab', id));

  useEffect(() => {
    fireConfetti();
  }, []);

  useEffect(() => {
    if (previous.current !== page) {
      previous.current = page;
      headingRef.current?.focus();
    }
  }, [page]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-highlight text-text-on-highlight">
          <TitleIcon className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 id="survey-success" className="text-xl font-semibold text-text-primary">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {localize('com_survey_success_subtitle', { 0: usage.windowDays })}
          </p>
        </div>
      </div>

      <Tabs value={page} onValueChange={(value) => setPage(value as PageId)}>
        <TabsList
          aria-label={localize('com_survey_res_tabs')}
          className="h-auto w-full justify-start gap-1.5 bg-transparent p-0"
        >
          {pages.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="min-w-0 rounded-full border border-border-medium px-4 py-1.5 data-[state=active]:border-transparent data-[state=active]:bg-surface-inverted data-[state=active]:text-text-inverted data-[state=active]:shadow-none"
            >
              {label(id)}
            </TabsTrigger>
          ))}
        </TabsList>
        {pages.map((id) => (
          <TabsContent key={id} value={id} className="mt-5 min-h-[24rem] rounded-none p-0">
            <h3 ref={headingRef} tabIndex={-1} className="sr-only">
              {label(id)}
            </h3>
            {id === 'month' && <Month result={result} />}
            {id === 'time' && <Time result={result} answers={answers} />}
            {id === 'colleagues' && <Colleagues result={result} answers={answers} />}
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-secondary">
          {localize('com_survey_res_page', { 0: index + 1, 1: pages.length })}
        </span>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button variant="outline" onClick={() => setPage(pages[index - 1])}>
              {localize('com_survey_back')}
            </Button>
          )}
          <Button variant="submit" onClick={isLast ? onClose : () => setPage(pages[index + 1])}>
            {localize(isLast ? 'com_survey_done' : 'com_survey_next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
