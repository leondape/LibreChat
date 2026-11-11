import { getDefaultStore } from 'jotai';
import userEvent from '@testing-library/user-event';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TSurveyStatus } from 'librechat-data-provider';
import { surveyDraftAtom, surveyOpenAtom } from '../store';
import { flight } from 'test/survey';
import Survey from '../Survey';

const mockGetSurvey = jest.fn();
const mockSnooze = jest.fn();
let mockStartupConfig: { interface?: { survey?: boolean } } = {};

jest.mock('canvas-confetti', () => ({ __esModule: true, default: jest.fn() }));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getSurvey: (...args: unknown[]) => mockGetSurvey(...args),
      snoozeSurvey: (...args: unknown[]) => mockSnooze(...args),
    },
  };
});

jest.mock('~/hooks/AuthContext', () => ({
  ...jest.requireActual('~/hooks/AuthContext'),
  useAuthContext: () => ({ user: { id: 'user-1' }, isAuthenticated: true }),
}));

jest.mock('~/data-provider/Endpoints', () => ({
  ...jest.requireActual('~/data-provider/Endpoints'),
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

const store = getDefaultStore();

async function mount(status: TSurveyStatus) {
  mockGetSurvey.mockResolvedValue(status);
  const client = new QueryClient({
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });
  render(
    <QueryClientProvider client={client}>
      <Survey />
    </QueryClientProvider>,
  );
  /** The request waits for idle, then the fish waits a few seconds. */
  await act(async () => void jest.advanceTimersByTime(600));
  await act(async () => void jest.advanceTimersByTime(0));
  await act(async () => void jest.advanceTimersByTime(3000));
}

describe('Survey', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    mockStartupConfig = {};
    mockSnooze.mockReset();
    store.set(surveyOpenAtom, false);
    store.set(surveyDraftAtom, null);
  });

  afterEach(() => jest.useRealTimers());

  it('sends the fish when a survey is due', async () => {
    await mount({ flight, submitted: false, nextNudgeAt: null });

    expect(screen.getByRole('button', { name: 'Feedback fish' })).toBeInTheDocument();
    expect(screen.getByText('Catch me if you can!')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the survey from the fish and posts a nudge when the dialog says later', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSnooze.mockResolvedValue({
      nextNudgeAt: new Date(Date.now() + 86_400_000).toISOString(),
      delayDays: 1,
    });
    await mount({ flight, submitted: false, nextNudgeAt: null });

    await user.click(screen.getByRole('button', { name: 'Feedback fish' }));
    await user.click(screen.getByRole('button', { name: "Yes, let's go" }));
    expect(screen.getByText('Help us improve WanGPT')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(mockSnooze).toHaveBeenCalledWith({ flightId: flight.flightId, reason: 'later' });
  });

  it('stays away for someone who already answered', async () => {
    await mount({ flight, submitted: true, nextNudgeAt: null });

    expect(screen.queryByRole('button', { name: 'Feedback fish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays away when no survey is armed', async () => {
    await mount({ flight: null, submitted: false, nextNudgeAt: null });

    expect(screen.queryByRole('button', { name: 'Feedback fish' })).not.toBeInTheDocument();
  });

  it('stays away while a cooldown is still running', async () => {
    await mount({
      flight,
      submitted: false,
      nextNudgeAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(screen.queryByRole('button', { name: 'Feedback fish' })).not.toBeInTheDocument();
  });

  it('comes back once the cooldown has passed', async () => {
    await mount({
      flight,
      submitted: false,
      nextNudgeAt: new Date(Date.now() - 1000).toISOString(),
    });

    expect(screen.getByRole('button', { name: 'Feedback fish' })).toBeInTheDocument();
  });

  it('stays away until the tab is visible', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      await mount({ flight, submitted: false, nextNudgeAt: null });
      expect(screen.queryByRole('button', { name: 'Feedback fish' })).not.toBeInTheDocument();

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => void jest.advanceTimersByTime(3000));

      expect(screen.getByRole('button', { name: 'Feedback fish' })).toBeInTheDocument();
    } finally {
      if (descriptor) {
        Object.defineProperty(document, 'visibilityState', descriptor);
      } else {
        delete (document as { visibilityState?: string }).visibilityState;
      }
    }
  });

  it('never requests the survey when the interface switches it off', async () => {
    mockStartupConfig = { interface: { survey: false } };
    await mount({ flight, submitted: false, nextNudgeAt: null });

    expect(mockGetSurvey).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
