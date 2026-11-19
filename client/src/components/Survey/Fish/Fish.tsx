import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, useMediaQuery } from '@librechat/client';
import type { TSurveyNudgeReason } from 'librechat-data-provider';
import type { Stage } from './swim';
import {
  FISH_ARRIVE_MS,
  FISH_ENTER_MS,
  FISH_EXIT_MS,
  FISH_LEAVE_MS,
  FISH_SETTLE_MS,
  FISH_TAUNT_MS,
  bubblePlacement,
  canSwim,
  centerOf,
  exitPoint,
  firstPoint,
  fishGoodbyeKey,
  measureCover,
  measureStage,
  pickWaypoint,
  place,
  readPoint,
  rest,
  restDuration,
  setSwimPace,
  sidebarElement,
  stopSwim,
  swim,
  swimDuration,
} from './swim';
import { useLocalize } from '~/hooks';
import Bubble from './Bubble';
import Sprite from './Sprite';
import { cn } from '~/utils';

type Phase = 'entering' | 'wandering' | 'asking' | 'leaving' | 'gone';
type Motion = Phase | 'catching';

/** Reads the phase without keeping a narrowed assignment from earlier in the function. */
function readPhase(ref: { readonly current: Motion }): Motion {
  return ref.current;
}

type Speech = 'taunt' | 'invite' | 'goodbye';

function speechFor(phase: Phase, taunting: boolean): Speech | null {
  if (taunting) {
    return 'taunt';
  }
  if (phase === 'asking') {
    return 'invite';
  }
  if (phase === 'leaving') {
    return 'goodbye';
  }
  return null;
}

type FishProps = {
  onYes: () => void;
  /** Resolves with the server's delay, in days. Undefined when the request fails. */
  onSnooze: (reason: TSurveyNudgeReason) => Promise<number | undefined>;
  onGone: () => void;
  /** Already caught. Shows the goodbye and swims off without roaming. */
  departing?: boolean;
};

/** Offset from the mouth, size and start delay, so the bubbles rise unevenly. */
const BUBBLES = [
  { offset: 0, size: 6, delay: 0 },
  { offset: 7, size: 9, delay: 1.1 },
  { offset: 2, size: 5, delay: 2.0 },
  { offset: 10, size: 7, delay: 2.9 },
  { offset: 4, size: 4, delay: 3.7 },
];

function Bubbles({ face }: { face: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute top-3 h-0 w-4',
        face === 1 ? '-right-1' : '-left-1',
      )}
      data-testid="survey-fish-bubbles"
    >
      {BUBBLES.map((bubble, index) => (
        <span
          key={index}
          className="survey-fish-bubble absolute bottom-0 rounded-full border border-border-heavy bg-surface-primary"
          style={{
            [face === 1 ? 'left' : 'right']: bubble.offset,
            width: bubble.size,
            height: bubble.size,
            animationDelay: `${bubble.delay}s`,
          }}
        />
      ))}
    </span>
  );
}

export default function Fish({ onYes, onSnooze, onGone, departing = false }: FishProps) {
  const localize = useLocalize();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const mover = useRef<HTMLDivElement>(null);
  const stageBox = useRef<HTMLDivElement>(null);
  const speechRef = useRef<HTMLDivElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const phaseRef = useRef<Motion>('entering');
  const loopRef = useRef(false);
  const reducedRef = useRef(reduced);
  const calmRef = useRef(false);
  const leaveRef = useRef<(reason: TSurveyNudgeReason) => Promise<void>>(async () => undefined);
  const arriveRef = useRef<() => Promise<void>>(async () => undefined);
  reducedRef.current = reduced;

  const [phase, setPhase] = useState<Phase>('entering');
  const [origin, setOrigin] = useState(0);
  const [face, setFace] = useState(1);
  const [taunt, setTaunt] = useState(false);
  const [goodbye, setGoodbye] = useState(fishGoodbyeKey());
  const [placement, setPlacement] = useState<{ left: number; tail: number } | null>(null);

  const leave = async (reason: TSurveyNudgeReason) => {
    if (phaseRef.current === 'leaving' || phaseRef.current === 'gone') {
      return;
    }
    phaseRef.current = 'leaving';
    stopSwim();
    let delayDays: number | undefined;
    try {
      delayDays = await onSnooze(reason);
    } catch {
      delayDays = undefined;
    }
    if (phaseRef.current !== 'leaving') {
      return;
    }
    const node = mover.current;
    const stage = stageRef.current;
    const swims = node != null && stage != null && canSwim(node, reducedRef.current);
    if (swims) {
      const from = readPoint(node);
      setFace(exitPoint(stage, from).x < from.x ? -1 : 1);
    }
    setGoodbye(fishGoodbyeKey(delayDays));
    setPhase('leaving');
    await new Promise((resolve) => window.setTimeout(resolve, FISH_LEAVE_MS));
    if (phaseRef.current !== 'leaving') {
      return;
    }
    if (swims) {
      await swim(node, exitPoint(stage, readPoint(node)), {
        duration: FISH_EXIT_MS,
        reduced: false,
      });
    }
    if (phaseRef.current !== 'leaving') {
      return;
    }
    phaseRef.current = 'gone';
    setPhase('gone');
    onGone();
  };
  leaveRef.current = leave;

  useLayoutEffect(() => {
    const node = mover.current;
    if (!node) {
      return undefined;
    }
    const stage = measureStage();
    stageRef.current = stage;
    setOrigin(stage.originLeft);

    if (departing) {
      if (phaseRef.current === 'entering') {
        place(node, centerOf(stage));
      }
      return () => {
        stopSwim();
      };
    }

    let cancelled = false;

    const finishArrive = async () => {
      if (canSwim(node, reduced)) {
        setFace(1);
        await swim(node, centerOf(stage), { duration: FISH_ARRIVE_MS, reduced: false });
      } else {
        place(node, centerOf(stage));
      }
      if (cancelled || phaseRef.current !== 'catching') {
        return;
      }
      phaseRef.current = 'asking';
      setPhase('asking');
    };
    arriveRef.current = finishArrive;

    if (phaseRef.current === 'catching') {
      void finishArrive();
      return undefined;
    }

    if (!canSwim(node, reduced)) {
      loopRef.current = false;
      place(node, reduced ? stage.rest : firstPoint(stage));
      phaseRef.current = reduced ? 'asking' : 'wandering';
      setPhase(phaseRef.current);
      setTaunt(!reduced);
      return undefined;
    }

    place(node, stage.entry);
    loopRef.current = true;
    const run = async () => {
      await swim(node, firstPoint(stage), { duration: FISH_ENTER_MS, reduced: false });
      if (cancelled) {
        return;
      }
      if (phaseRef.current === 'catching') {
        await finishArrive();
        return;
      }
      phaseRef.current = 'wandering';
      setPhase('wandering');
      setTaunt(true);
      await rest(FISH_SETTLE_MS);
      while (!cancelled && phaseRef.current === 'wandering') {
        const from = readPoint(node);
        const next = pickWaypoint(stage, from);
        if (Math.abs(next.x - from.x) > 24) {
          setFace(next.x < from.x ? -1 : 1);
        }
        await swim(node, next, {
          duration: swimDuration(from, next, calmRef.current),
          reduced: false,
        });
        if (cancelled || readPhase(phaseRef) !== 'wandering') {
          break;
        }
        await rest(restDuration());
      }
      if (!cancelled && readPhase(phaseRef) === 'catching') {
        await finishArrive();
      }
    };
    void run().finally(() => {
      loopRef.current = false;
    });

    return () => {
      cancelled = true;
      loopRef.current = false;
      stopSwim();
    };
  }, [departing, reduced]);

  useEffect(() => {
    if (!departing) {
      return undefined;
    }
    void leaveRef.current('later');
    return undefined;
  }, [departing]);

  useLayoutEffect(() => {
    const box = stageBox.current;
    const sidebar = sidebarElement();
    const applyCover = () => {
      const stage = stageRef.current;
      if (!stage || !box) {
        return;
      }
      stage.cover = measureCover(stage.originLeft);
      box.style.clipPath = stage.cover > 0 ? `inset(0 0 0 ${stage.cover}px)` : '';
    };
    applyCover();
    if (!sidebar || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(applyCover);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (phase !== 'wandering' || !taunt) {
      return undefined;
    }
    const id = window.setTimeout(() => setTaunt(false), FISH_TAUNT_MS);
    return () => window.clearTimeout(id);
  }, [phase, taunt]);

  useEffect(() => {
    if (phase === 'asking') {
      yesRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'asking') {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      void leaveRef.current('later');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase]);

  const catchFish = () => {
    if (phaseRef.current !== 'wandering' && phaseRef.current !== 'entering') {
      return;
    }
    phaseRef.current = 'catching';
    setTaunt(false);
    if (loopRef.current) {
      stopSwim();
      return;
    }
    void arriveRef.current();
  };

  const setCalmness = (value: boolean) => {
    calmRef.current = value;
    setSwimPace(value ? 0.3 : 1);
  };

  const swimming = !departing && (phase === 'entering' || phase === 'wandering');
  const speech = speechFor(phase, swimming && taunt);

  useLayoutEffect(() => {
    const node = mover.current;
    const box = speechRef.current;
    const stage = stageRef.current;
    if (!speech || !node || !box || !stage) {
      return;
    }
    setPlacement(
      bubblePlacement({
        face,
        fishLeft: node.getBoundingClientRect().left - stage.originLeft,
        bubbleWidth: box.offsetWidth,
        stageWidth: stage.width,
        cover: stage.cover,
      }),
    );
  }, [speech, face, goodbye]);

  if (phase === 'gone') {
    return null;
  }

  const inviteId = 'survey-fish-invite';

  return (
    /* The fish is absolutely positioned, so this box has to span the viewport.
       A bottom-only fixed box collapses and the overflow clip hides the fish. */
    <div
      ref={stageBox}
      className="pointer-events-none fixed inset-y-0 right-0 z-40 overflow-hidden"
      style={{ left: origin }}
      data-testid="survey-fish-stage"
    >
      <div
        ref={mover}
        className={cn('pointer-events-auto absolute left-0 top-0', reduced && 'survey-fish-fade')}
      >
        <div className={cn('relative', !reduced && 'survey-fish-bob')}>
          {speech && (
            <div
              ref={speechRef}
              className={cn('absolute bottom-full z-10', speech === 'invite' ? 'mb-4' : 'mb-3')}
              style={{ left: placement?.left ?? 0 }}
            >
              {speech === 'invite' ? (
                <Bubble size="lg" tail={placement?.tail}>
                  <p id={inviteId}>{localize('com_survey_fish_invite')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      ref={yesRef}
                      variant="submit"
                      size="sm"
                      aria-describedby={inviteId}
                      onClick={() => {
                        phaseRef.current = 'gone';
                        stopSwim();
                        onYes();
                      }}
                    >
                      {localize('com_survey_fish_yes')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void leave('later')}>
                      {localize('com_survey_fish_later')}
                    </Button>
                  </div>
                </Bubble>
              ) : (
                <Bubble size="sm" tail={placement?.tail}>
                  {localize(speech === 'taunt' ? 'com_survey_fish_taunt' : goodbye)}
                </Bubble>
              )}
            </div>
          )}
          <button
            type="button"
            aria-label={localize('com_survey_fish_label')}
            disabled={!swimming}
            className={cn(
              '-m-3 block rounded-lg p-3 transition-transform duration-700 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default motion-reduce:transition-none',
              phase === 'asking' && !reduced && 'origin-center scale-110',
            )}
            onClick={catchFish}
            onMouseEnter={() => setCalmness(true)}
            onMouseLeave={() => setCalmness(false)}
            onFocus={() => setCalmness(true)}
            onBlur={() => setCalmness(false)}
          >
            <span className="block" style={{ transform: `scaleX(${face})` }}>
              <Sprite />
            </span>
          </button>
          {!reduced && <Bubbles face={face} />}
        </div>
      </div>
      <div role="status" className="sr-only">
        {localize('com_survey_fish_arrived')}
      </div>
    </div>
  );
}
