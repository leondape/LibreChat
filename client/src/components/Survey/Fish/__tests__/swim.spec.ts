import {
  FISH_HEIGHT,
  FISH_WIDTH,
  bubblePlacement,
  centerOf,
  fishGoodbyeKey,
  firstPoint,
  measureStage,
  pickWaypoint,
  rest,
  stopSwim,
  swimDuration,
} from '../swim';

describe('fishGoodbyeKey', () => {
  it('follows the delay the server reports', () => {
    expect(fishGoodbyeKey(1)).toBe('com_survey_fish_bye_tomorrow');
    expect(fishGoodbyeKey(2)).toBe('com_survey_fish_bye_days');
    expect(fishGoodbyeKey(4)).toBe('com_survey_fish_bye_days');
    expect(fishGoodbyeKey(7)).toBe('com_survey_fish_bye_week');
    expect(fishGoodbyeKey(undefined)).toBe('com_survey_fish_bye_days');
  });
});

describe('swim stage', () => {
  it('enters from the bottom when the account button is not on screen', () => {
    const stage = measureStage();

    expect(stage.originLeft).toBe(0);
    expect(stage.entry.y).toBe(window.innerHeight);
    expect(firstPoint(stage).y).toBeLessThan(stage.entry.y);
  });

  it('keeps a waypoint inside the visible area and away from where it is', () => {
    const stage = {
      originLeft: 0,
      width: 800,
      height: 600,
      cover: 0,
      entry: { x: 0, y: 0 },
      rest: { x: 0, y: 0 },
    };
    const from = { x: 20, y: 20 };
    const point = pickWaypoint(stage, from, () => 0.9);

    expect(point.x).toBeGreaterThanOrEqual(8);
    expect(point.y).toBeGreaterThanOrEqual(8);
    expect(point.x).toBeLessThanOrEqual(stage.width - FISH_WIDTH);
    expect(point.y).toBeLessThanOrEqual(stage.height - FISH_HEIGHT);
    expect(Math.hypot(point.x - from.x, point.y - from.y)).toBeGreaterThanOrEqual(72);
    expect(Math.hypot(point.x - from.x, point.y - from.y)).toBeLessThanOrEqual(360);
    expect(centerOf(stage).y).toBeGreaterThanOrEqual(8);
  });

  it('swims out of the corner it entered from', () => {
    const stage = {
      originLeft: 0,
      width: 1200,
      height: 900,
      cover: 0,
      entry: { x: 0, y: 0 },
      rest: { x: 0, y: 0 },
    };
    const corner = { x: 88, y: 860 };
    const point = pickWaypoint(stage, corner, () => 0.5);

    expect(point.x).toBeGreaterThan(corner.x + 100);
    expect(point.y).toBeLessThan(corner.y - 100);
  });

  it('swims slowly, and slower still while the pointer is near', () => {
    const from = { x: 0, y: 0 };
    const near = { x: 40, y: 0 };
    const far = { x: 240, y: 0 };

    expect(swimDuration(from, near)).toBe(3_000);
    expect(swimDuration(from, far)).toBe(6_000);
    expect(swimDuration(from, far, true)).toBe(12_000);
  });
});

describe('expanded sidebar', () => {
  const stage = {
    originLeft: 60,
    width: 1300,
    height: 900,
    cover: 340,
    entry: { x: 340 - FISH_WIDTH, y: 800 },
    rest: { x: 0, y: 0 },
  };

  it('swims over the chat, never behind the sidebar', () => {
    const from = { x: 400, y: 400 };
    for (const value of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(pickWaypoint(stage, from, () => value).x).toBeGreaterThanOrEqual(stage.cover);
    }
    expect(firstPoint(stage).x).toBeGreaterThan(stage.cover);
  });

  it('is caught in the middle of the chat area', () => {
    const center = centerOf(stage);

    expect(center.x + FISH_WIDTH / 2).toBe(stage.cover + (stage.width - stage.cover) / 2);
  });

  it('keeps the speech bubble out from under the sidebar', () => {
    const placement = bubblePlacement({
      face: -1,
      fishLeft: 360,
      bubbleWidth: 240,
      stageWidth: stage.width,
      cover: stage.cover,
    });

    expect(360 + placement.left).toBe(stage.cover + 8);
  });
});

describe('bubblePlacement', () => {
  it('points the tail at the mouth on whichever side the fish faces', () => {
    const right = bubblePlacement({ face: 1, fishLeft: 400, bubbleWidth: 200, stageWidth: 1200 });
    const left = bubblePlacement({ face: -1, fishLeft: 400, bubbleWidth: 200, stageWidth: 1200 });

    expect(right.left + right.tail).toBe(FISH_WIDTH - 8);
    expect(left.left + left.tail).toBe(8);
  });

  it('keeps the bubble on screen near an edge and still aims the tail at the mouth', () => {
    const placement = bubblePlacement({
      face: -1,
      fishLeft: 20,
      bubbleWidth: 240,
      stageWidth: 1200,
    });

    expect(20 + placement.left).toBe(8);
    expect(placement.left + placement.tail).toBe(8);
  });
});

describe('rest', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ends early when the swim is stopped, so a catch is answered at once', async () => {
    const done = jest.fn();
    void rest(3_000).then(done);

    stopSwim();
    await Promise.resolve();

    expect(done).toHaveBeenCalled();
  });

  it('ends by itself after the pause', async () => {
    const done = jest.fn();
    void rest(3_000).then(done);

    jest.advanceTimersByTime(3_000);
    await Promise.resolve();

    expect(done).toHaveBeenCalled();
  });
});
