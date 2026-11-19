import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { FISH_LEAVE_MS } from '../swim';
import Fish from '../Fish';

const matchMedia = window.matchMedia;

function renderFish(props?: Partial<ComponentProps<typeof Fish>>) {
  const onYes = jest.fn();
  const onSnooze = jest.fn().mockResolvedValue(1);
  const onGone = jest.fn();
  render(<Fish onYes={onYes} onSnooze={onSnooze} onGone={onGone} {...props} />);
  return { onYes, onSnooze, onGone };
}

describe('Fish', () => {
  afterEach(() => {
    window.matchMedia = matchMedia;
    jest.useRealTimers();
  });

  it('taunts, then opens the invitation when caught', async () => {
    const user = userEvent.setup();
    const { onYes, onSnooze } = renderFish();

    expect(screen.getByText('Catch me if you can!')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('swam in');
    expect(screen.getByTestId('survey-fish-bubbles')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Feedback fish' }));

    expect(screen.getByText(/feedback fish/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Yes, let's go" })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: "Yes, let's go" }));

    expect(onYes).toHaveBeenCalled();
    expect(onSnooze).not.toHaveBeenCalled();
  });

  it('can be caught from the keyboard', async () => {
    const user = userEvent.setup();
    renderFish();

    screen.getByRole('button', { name: 'Feedback fish' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: "Yes, let's go" })).toHaveFocus();
  });

  it('says goodbye for the delay the server returns', async () => {
    const user = userEvent.setup();
    const { onSnooze } = renderFish();
    onSnooze.mockResolvedValue(2);
    await user.click(screen.getByRole('button', { name: 'Feedback fish' }));

    await user.click(screen.getByRole('button', { name: 'Not now' }));

    expect(onSnooze).toHaveBeenCalledWith('later');
    expect(await screen.findByText(/couple of days/)).toBeInTheDocument();
  });

  it('treats Escape as not now', async () => {
    const user = userEvent.setup();
    const { onSnooze } = renderFish();
    onSnooze.mockResolvedValue(7);
    await user.click(screen.getByRole('button', { name: 'Feedback fish' }));

    await user.keyboard('{Escape}');

    expect(onSnooze).toHaveBeenCalledWith('later');
    expect(await screen.findByText(/next week/)).toBeInTheDocument();
  });

  it('stays until it is caught, however long nobody does', async () => {
    jest.useFakeTimers();
    const onSnooze = jest.fn();
    const onGone = jest.fn();
    render(<Fish onYes={jest.fn()} onSnooze={onSnooze} onGone={onGone} />);

    await act(async () => {
      jest.advanceTimersByTime(30 * 60_000);
    });

    expect(onSnooze).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Feedback fish' })).toBeEnabled();
  });

  it('reads out the goodbye before it swims away', async () => {
    jest.useFakeTimers();
    const onSnooze = jest.fn().mockResolvedValue(7);
    const onGone = jest.fn();
    render(<Fish onYes={jest.fn()} onSnooze={onSnooze} onGone={onGone} />);

    fireEvent.click(screen.getByRole('button', { name: 'Feedback fish' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    });

    expect(onSnooze).toHaveBeenCalledWith('later');
    expect(screen.getByText(/next week/)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(FISH_LEAVE_MS - 1);
    });
    expect(screen.getByText(/next week/)).toBeInTheDocument();
    expect(onGone).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onGone).toHaveBeenCalled();
  });

  it('says goodbye and swims off when the questionnaire is paused', async () => {
    jest.useFakeTimers();
    const onSnooze = jest.fn().mockResolvedValue(2);
    const onGone = jest.fn();
    render(<Fish departing onYes={jest.fn()} onSnooze={onSnooze} onGone={onGone} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(onSnooze).toHaveBeenCalledWith('later');
    expect(screen.getByText(/couple of days/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Yes, let's go" })).not.toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(FISH_LEAVE_MS - 1);
    });
    expect(screen.getByText(/couple of days/)).toBeInTheDocument();
    expect(onGone).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('opens the invitation in place when motion is reduced', () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: String(query).includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    renderFish();

    expect(screen.queryByText('Catch me if you can!')).not.toBeInTheDocument();
    expect(screen.queryByTestId('survey-fish-bubbles')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Yes, let's go" })).toBeInTheDocument();
  });
});
