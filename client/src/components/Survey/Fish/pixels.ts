/** Pixel grid for the feedback fish, a red goldfish facing right. `.` is empty. */
export const FISH_COLORS: Record<string, string> = {
  o: '#4a1518',
  r: '#e8473f',
  l: '#ff7a5c',
  d: '#b3262d',
  y: '#ffd3a8',
  f: '#ff9a7a',
  t: '#ff6a55',
  w: '#ffffff',
  p: '#2b0f12',
  s: '#ffe3d6',
  k: '#ff8fa0',
};

export const FRAME_WIDTH = 24;
export const FRAME_HEIGHT = 14;

/** Columns 6 to 23: fins, body, eye and mouth. */
const BODY = [
  '..................',
  '.....ooo..........',
  '....offfo.........',
  '..oofffffooooo....',
  'oolllllrrrrrrro...',
  'rllllllrrrdwprro..',
  'rrlslrrrrdrpprrro.',
  'rrrrrrsrrdrrkkrdo.',
  'drryyffyyyyyrrro..',
  'ddryfffyyyyrrdo...',
  'ooddrryyyyrrdo....',
  '..ooffffooooo.....',
  '....oooo..........',
  '..................',
];

/** Columns 0 to 5: the tail, which fans open and closed. */
const NEUTRAL = [
  '......',
  '......',
  'oo....',
  'odo...',
  'otdo..',
  '.ottto',
  '..ottd',
  '...otd',
  '..ottd',
  '.ottto',
  'otdo..',
  'odo...',
  'oo....',
  '......',
];

const OPEN = [
  '......',
  'oo....',
  'odo...',
  'otdo..',
  'ottto.',
  '.ottto',
  '..ottd',
  '...otd',
  '..ottd',
  '.ottto',
  'ottto.',
  'otdo..',
  'odo...',
  'oo....',
];

const CLOSED = [
  '......',
  '......',
  '......',
  '.oo...',
  '.odo..',
  '..otdo',
  '..ottd',
  '...otd',
  '..ottd',
  '..otdo',
  '.odo..',
  '.oo...',
  '......',
  '......',
];

function compose(tail: readonly string[], index: number): string[] {
  const rows = tail.map((part, y) => part + (BODY[y] ?? ''));
  if (rows.length !== FRAME_HEIGHT || rows.some((row) => row.length !== FRAME_WIDTH)) {
    throw new Error(`Fish frame ${index} must be ${FRAME_WIDTH} by ${FRAME_HEIGHT}`);
  }
  return rows;
}

export const FISH_FRAMES: readonly string[][] = [NEUTRAL, OPEN, NEUTRAL, CLOSED].map(compose);

/** One horizontal run of same-colored pixels. */
export type FishRun = { x: number; y: number; width: number; fill: string };

export function fishRuns(frame: readonly string[], offsetX = 0): FishRun[] {
  const runs: FishRun[] = [];
  frame.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const pixel = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === pixel) {
        end += 1;
      }
      const fill = FISH_COLORS[pixel];
      if (fill) {
        runs.push({ x: x + offsetX, y, width: end - x, fill });
      }
      x = end;
    }
  });
  return runs;
}

/**
 * Empty columns after each frame. Without them, the next frame's tail outline bleeds into the
 * window as a thin dark line while the fish sits at fractional positions.
 */
export const FRAME_GUTTER = 2;
export const FRAME_CELL = FRAME_WIDTH + FRAME_GUTTER;

/**
 * All frames side by side as one SVG image. Drawn as a single image, the fish has no seams
 * between pixels at fractional positions, and stepping the strip never shows an empty frame.
 */
export function fishSheetUrl(): string {
  const width = FRAME_CELL * FISH_FRAMES.length;
  const rects = FISH_FRAMES.flatMap((frame, index) => fishRuns(frame, index * FRAME_CELL))
    .map(
      (run) =>
        `<rect x="${run.x}" y="${run.y}" width="${run.width}" height="1" fill="${run.fill}"/>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${FRAME_HEIGHT}" shape-rendering="crispEdges">${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
