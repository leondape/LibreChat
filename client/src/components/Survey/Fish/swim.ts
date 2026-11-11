import { FRAME_HEIGHT, FRAME_WIDTH } from './pixels';

const PIXEL = 4;

export const FISH_WIDTH = FRAME_WIDTH * PIXEL;
export const FISH_HEIGHT = FRAME_HEIGHT * PIXEL;
export const FISH_TAUNT_MS = 6_000;
/** How long the goodbye stays readable before the fish starts to swim off. */
export const FISH_LEAVE_MS = 3_500;
export const FISH_ENTER_MS = 4_000;
export const FISH_ARRIVE_MS = 2_400;
export const FISH_EXIT_MS = 7_000;
/** The fish drifts in place for a while between swims. */
export const FISH_REST_MIN_MS = 1_000;
export const FISH_REST_MAX_MS = 2_500;

export type Point = { x: number; y: number };

export type Stage = {
  originLeft: number;
  width: number;
  height: number;
  /** Pixels from the stage's left edge hidden behind the expanded sidebar. */
  cover: number;
  entry: Point;
  rest: Point;
};

export type FishGoodbyeKey =
  | 'com_survey_fish_bye_tomorrow'
  | 'com_survey_fish_bye_days'
  | 'com_survey_fish_bye_week';

type ActiveSwim = {
  animation: Animation;
  element: HTMLElement;
  from: Point;
  to: Point;
};

let active: ActiveSwim | null = null;
let resting: { id: number; resolve: () => void } | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function fishGoodbyeKey(delayDays?: number): FishGoodbyeKey {
  if (delayDays === 1) {
    return 'com_survey_fish_bye_tomorrow';
  }
  if (delayDays != null && delayDays >= 7) {
    return 'com_survey_fish_bye_week';
  }
  return 'com_survey_fish_bye_days';
}

export function canSwim(element: HTMLElement, reduced: boolean): boolean {
  return !reduced && typeof element.animate === 'function';
}

export function place(element: HTMLElement, point: Point) {
  element.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

export function readPoint(element: HTMLElement): Point {
  const match = /translate\(([-\d.]+)px,\s*([-.\d]+)px\)/.exec(element.style.transform);
  if (!match) {
    return { x: 0, y: 0 };
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

function wake() {
  if (!resting) {
    return;
  }
  window.clearTimeout(resting.id);
  const { resolve } = resting;
  resting = null;
  resolve();
}

/** Waits in place. `stopSwim` ends the wait early, so a catch is answered at once. */
export function rest(ms: number): Promise<void> {
  wake();
  return new Promise((resolve) => {
    const id = window.setTimeout(() => {
      resting = null;
      resolve();
    }, ms);
    resting = { id, resolve };
  });
}

export function restDuration(random: () => number = Math.random): number {
  return FISH_REST_MIN_MS + random() * (FISH_REST_MAX_MS - FISH_REST_MIN_MS);
}

/** Sample the in-flight swim and drop it, so the next swim starts where the fish is. */
export function stopSwim() {
  wake();
  if (!active) {
    return;
  }
  const { animation, element, from, to } = active;
  const progress = Number(animation.effect?.getComputedTiming?.().progress ?? 0);
  const done = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
  animation.cancel();
  place(element, {
    x: from.x + (to.x - from.x) * done,
    y: from.y + (to.y - from.y) * done,
  });
  active = null;
}

export function setSwimPace(rate: number) {
  active?.animation.updatePlaybackRate?.(rate);
}

/** About 40 pixels a second: slow enough to read as drifting and easy to catch. */
export function swimDuration(from: Point, to: Point, calm = false): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = clamp(distance * 25, 3_000, 9_000);
  return calm ? duration * 2 : duration;
}

/**
 * Moves the element to `to`. Without a Web Animations API, or with reduced motion,
 * it jumps and resolves immediately so tests stay deterministic.
 */
export function swim(
  element: HTMLElement,
  to: Point,
  options?: { duration?: number; reduced?: boolean },
): Promise<void> {
  if (options?.reduced || typeof element.animate !== 'function') {
    place(element, to);
    return Promise.resolve();
  }
  stopSwim();
  const from = readPoint(element);
  const animation = element.animate(
    [
      { transform: `translate(${from.x}px, ${from.y}px)` },
      { transform: `translate(${to.x}px, ${to.y}px)` },
    ],
    { duration: options?.duration ?? 1800, easing: 'ease-in-out', fill: 'forwards' },
  );
  active = { animation, element, from, to };
  return animation.finished.then(
    () => {
      if (active?.animation !== animation) {
        return;
      }
      place(element, to);
      animation.cancel();
      active = null;
    },
    () => undefined,
  );
}

/** The expanded sidebar's element, which the fish hides behind. */
export function sidebarElement(): HTMLElement | null {
  return document.querySelector('[data-testid="nav-user"]')?.closest('aside') ?? null;
}

/** How much of the stage, from its left edge, the sidebar covers right now. */
export function measureCover(originLeft: number): number {
  const sidebar = sidebarElement();
  if (!sidebar) {
    return 0;
  }
  return Math.max(0, sidebar.getBoundingClientRect().right - originLeft);
}

export function measureStage(): Stage {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const button = document.querySelector('[data-testid="nav-user"]');
  const rect = button instanceof HTMLElement ? button.getBoundingClientRect() : null;
  const onRail =
    rect != null &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left >= 0 &&
    rect.left < 200 &&
    rect.bottom > 0 &&
    rect.top < height;

  if (onRail && rect) {
    const cover = measureCover(rect.right);
    return {
      originLeft: rect.right,
      width: Math.max(0, width - rect.right),
      height,
      cover,
      entry: {
        x: cover - FISH_WIDTH,
        y: clamp(rect.top, 8, Math.max(8, height - FISH_HEIGHT - 8)),
      },
      rest: {
        x: cover + 12,
        y: clamp(rect.top - FISH_HEIGHT - 16, 8, Math.max(8, height - FISH_HEIGHT - 8)),
      },
    };
  }

  return {
    originLeft: 0,
    width,
    height,
    cover: 0,
    entry: { x: 28, y: height },
    rest: { x: 16, y: Math.max(16, height - FISH_HEIGHT - 96) },
  };
}

/** Keeps a 16rem speech bubble, centered over the fish, inside the stage. */
const SIDE_MARGIN = 88;
/** The longest single swim, so the fish crosses the screen in a few calm legs. */
const MAX_LEG = 360;

/** The visible chat area the fish roams, inside the margins. */
function roamBounds(stage: Stage) {
  const left = stage.cover;
  const room = Math.max(0, stage.width - left - FISH_WIDTH);
  const margin = Math.min(SIDE_MARGIN, room / 2);
  const minX = left + margin;
  const minY = Math.min(72, Math.max(8, stage.height - FISH_HEIGHT - 8));
  return {
    minX,
    minY,
    maxX: Math.max(minX, stage.width - FISH_WIDTH - margin),
    maxY: Math.max(minY, stage.height - FISH_HEIGHT - 96),
  };
}

/** First point inside the visible area, just past the edge the fish enters from. */
export function firstPoint(stage: Stage): Point {
  const { minX } = roamBounds(stage);
  if (stage.entry.y >= stage.height - 1) {
    return { x: minX, y: Math.max(16, stage.height - 180) };
  }
  return { x: minX, y: stage.entry.y };
}

/** The middle of the visible chat area. */
export function centerOf(stage: Stage): Point {
  const left = stage.cover;
  return {
    x: clamp(
      left + (stage.width - left) / 2 - FISH_WIDTH / 2,
      left + 8,
      Math.max(left + 8, stage.width - FISH_WIDTH - 8),
    ),
    y: clamp(Math.max(200, stage.height / 2 - 20), 8, Math.max(8, stage.height - FISH_HEIGHT - 8)),
  };
}

/** Distance from the sprite's front edge to the mouth. */
const MOUTH_INSET = 8;
const BUBBLE_EDGE = 8;
const TAIL_INSET = 16;

/**
 * Places a speech bubble so its tail points at the mouth while the bubble stays on screen.
 * `left` is relative to the fish, `tail` to the bubble.
 */
export function bubblePlacement({
  face,
  fishLeft,
  bubbleWidth,
  stageWidth,
  cover = 0,
}: {
  face: number;
  fishLeft: number;
  bubbleWidth: number;
  stageWidth: number;
  cover?: number;
}): { left: number; tail: number } {
  const mouth = face === 1 ? FISH_WIDTH - MOUTH_INSET : MOUTH_INSET;
  const lowest = cover + BUBBLE_EDGE - fishLeft;
  const highest = stageWidth - BUBBLE_EDGE - fishLeft - bubbleWidth;
  const left = clamp(mouth - bubbleWidth / 2, lowest, Math.max(lowest, highest));
  const tail = clamp(mouth - left, TAIL_INSET, Math.max(TAIL_INSET, bubbleWidth - TAIL_INSET));
  return { left, tail };
}

export function exitPoint(stage: Stage, from: Point): Point {
  return { x: stage.width + FISH_WIDTH, y: from.y };
}

/**
 * Heads toward a spot in the chat area, at most one leg at a time. Targets cluster around the
 * middle, so the fish mostly swims over the conversation and drifts out of corners.
 */
export function pickWaypoint(stage: Stage, from: Point, random: () => number = Math.random): Point {
  const { minX, minY, maxX, maxY } = roamBounds(stage);
  const middle = () => (random() + random()) / 2;
  let best = { x: clamp(from.x, minX, maxX), y: clamp(from.y, minY, maxY) };
  let bestDistance = -1;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const target = {
      x: minX + middle() * (maxX - minX),
      y: minY + middle() * (maxY - minY),
    };
    const distance = Math.hypot(target.x - from.x, target.y - from.y);
    const scale = distance > MAX_LEG ? MAX_LEG / distance : 1;
    const point = {
      x: clamp(from.x + (target.x - from.x) * scale, minX, maxX),
      y: clamp(from.y + (target.y - from.y) * scale, minY, maxY),
    };
    const moved = Math.hypot(point.x - from.x, point.y - from.y);
    if (moved >= 72) {
      return point;
    }
    if (moved > bestDistance) {
      best = point;
      bestDistance = moved;
    }
  }
  return best;
}
