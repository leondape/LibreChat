import { act, render, screen } from '@testing-library/react';
import Computing, { COMPUTING_LINE_MS, COMPUTING_MIN_MS, getRealLines } from '../Computing';
import { resultWithAverages, resultWithoutAverages, usage } from 'test/survey';

const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

describe('Computing', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rotates generic lines while the request is still running', () => {
    const onComplete = jest.fn();
    render(<Computing windowDays={30} onComplete={onComplete} />);

    expect(screen.getByText('Computing your massive workload…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Crunching 30 days of brilliance…');

    tick(COMPUTING_LINE_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Consulting the usage oracle…');

    tick(60_000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('switches to the real numbers once they arrive and waits out the minimum time', () => {
    const onComplete = jest.fn();
    const { rerender } = render(<Computing windowDays={30} onComplete={onComplete} />);

    rerender(<Computing windowDays={30} result={resultWithoutAverages} onComplete={onComplete} />);
    expect(screen.getByRole('status')).toHaveTextContent('Counting your 1,234 messages…');

    tick(COMPUTING_LINE_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Weighing 2.5M tokens…');

    tick(COMPUTING_LINE_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Interviewing your 3 agents…');

    tick(COMPUTING_LINE_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Polishing the confetti…');
    expect(onComplete).not.toHaveBeenCalled();

    tick(COMPUTING_MIN_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('never finishes before the minimum duration, even for an instant answer', () => {
    const onComplete = jest.fn();
    render(<Computing windowDays={30} result={resultWithoutAverages} onComplete={onComplete} />);

    tick(COMPUTING_MIN_MS - 1);
    expect(onComplete).not.toHaveBeenCalled();

    tick(COMPUTING_LINE_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('skips the agent line for someone without agents and the comparison below the threshold', () => {
    const noAgents = {
      ...resultWithoutAverages,
      usage: { ...usage, agentsOwned: 0, agentsUsedOthers: 0, version: 1, windowDays: 30 },
    };
    expect(getRealLines(noAgents).map((line) => line.key)).toEqual([
      'messages',
      'tokens',
      'polish',
    ]);
  });

  it('adds the colleagues line only when the comparison is unlocked', () => {
    const keys = getRealLines(resultWithAverages).map((line) => line.key);
    expect(keys).toEqual(['messages', 'tokens', 'agents', 'compare', 'polish']);
    expect(getRealLines(resultWithAverages)[3].count).toBe(79);
  });
});
