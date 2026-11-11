import { getDefaultStore } from 'jotai';
import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TSurveyAnswers } from 'librechat-data-provider';
import type { SurveyStepId } from '../store';
import { answers, flight, resultWithAverages, resultWithoutAverages } from 'test/survey';
import { getSurveyKey, surveyDraftAtom } from '../store';
import { COMPUTING_MIN_MS } from '../Computing';
import SurveyDialog from '../Dialog';

const mockSubmit = jest.fn();
const mockConfetti = jest.fn();

jest.mock('canvas-confetti', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockConfetti(...args),
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      submitSurvey: (...args: unknown[]) => mockSubmit(...args),
    },
  };
});

const store = getDefaultStore();
const userId = 'user-1';
const key = getSurveyKey(userId, flight.flightId);

const seed = (step: SurveyStepId, partial: Partial<TSurveyAnswers> = answers) =>
  store.set(surveyDraftAtom, { key, step, answers: partial });

const axiosError = (status: number, code: string) =>
  Object.assign(new Error(code), { isAxiosError: true, response: { status, data: { code } } });

function renderDialog(onClose = jest.fn(), onLater = jest.fn()) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
    /** Failed submissions are expected here; the dialog's own error state is what is asserted. */
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });
  render(
    <QueryClientProvider client={client}>
      <SurveyDialog flight={flight} userId={userId} onClose={onClose} onLater={onLater} />
    </QueryClientProvider>,
  );
  return onClose;
}

/** Advances in small steps so state set by resolved requests renders between them. */
async function play(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 250) {
    await act(async () => void jest.advanceTimersByTime(250));
  }
}

describe('SurveyDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    store.set(surveyDraftAtom, null);
  });

  afterEach(() => jest.useRealTimers());

  it('opens on the intro with the confidentiality promise and starts at the first question', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText('Help us improve WanGPT')).toBeInTheDocument();
    expect(screen.getByText(/treated confidentially/)).toHaveTextContent(
      'groups of at least 5 people',
    );
    expect(screen.getByText(/treated confidentially/)).toHaveTextContent('last 30 days');
    expect(screen.getByText(/treated confidentially/)).not.toHaveTextContent(/anonym/i);

    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByRole('heading', { name: 'Where do you work?' })).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 13')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Company level 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('only enables Next once the question is answered', async () => {
    const user = userEvent.setup();
    seed('job', {});
    renderDialog();

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Legal' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('asks where the time goes only when time is gained', async () => {
    const user = userEvent.setup();
    seed('hours', { ...answers, hoursSaved: undefined });
    renderDialog();

    await user.click(screen.getByRole('radio', { name: 'None' }));
    expect(screen.getByText('Question 5 of 13')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '2–5 hours' }));
    expect(screen.getByText('Question 5 of 14')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('heading', { name: 'What do you do with the time you gain?' }),
    ).toBeInTheDocument();
  });

  it('prefers the typed hours over a range', async () => {
    const user = userEvent.setup();
    seed('hours', { ...answers, hoursSaved: undefined });
    renderDialog();

    await user.click(screen.getByRole('radio', { name: '2–5 hours' }));
    await user.type(screen.getByRole('spinbutton'), '6');

    expect(screen.getByRole('spinbutton')).toHaveValue(6);
    expect(screen.getByRole('radio', { name: '2–5 hours' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('lets an exclusive tools answer replace the others', async () => {
    const user = userEvent.setup();
    seed('tools', { ...answers, tools: undefined });
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'ChatGPT' }));
    await user.click(screen.getByRole('button', { name: 'None' }));

    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'ChatGPT' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('caps the help choices at three', async () => {
    const user = userEvent.setup();
    seed('help', { ...answers, help: undefined });
    renderDialog();

    for (const name of ['Training', 'Better answer quality', 'Clearer rules for use']) {
      await user.click(screen.getByRole('button', { name }));
    }

    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Something else' })).toBeDisabled();
  });

  it('asks to be reminded later and keeps the draft', async () => {
    const user = userEvent.setup();
    seed('quality');
    const onLater = jest.fn();
    const onClose = renderDialog(jest.fn(), onLater);

    await user.click(screen.getByRole('button', { name: 'Later' }));

    expect(onLater).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(store.get(surveyDraftAtom)?.step).toBe('quality');
  });

  it('runs the loader, then celebrates with the usage overview and no comparison yet', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSubmit.mockResolvedValue(resultWithoutAverages);
    seed('feedback');
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ flightId: flight.flightId, answers }),
    );
    expect(screen.getByText('Computing your massive workload…')).toBeInTheDocument();
    expect(store.get(surveyDraftAtom)).toBeNull();
    expect(mockConfetti).not.toHaveBeenCalled();

    await play(COMPUTING_MIN_MS + 1000);

    expect(
      screen.getByRole('heading', {
        name: /Awesome, you did it!|Success!|Amazing, thank you!|You're amazing!/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(
      screen.getByText(/comparison with your colleagues unlocks once 50 people/),
    ).toBeVisible();
    expect(screen.queryByText(/WanGPT average/)).not.toBeInTheDocument();
    expect(mockConfetti).toHaveBeenCalledWith(
      expect.objectContaining({ disableForReducedMotion: true }),
    );
  });

  it('shows the company averages next to the figures once enough people answered', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSubmit.mockResolvedValue(resultWithAverages);
    seed('feedback');
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await play(COMPUTING_MIN_MS + 2000);

    expect(screen.getByText('WanGPT average: 321')).toBeInTheDocument();
    expect(screen.queryByText(/unlocks once/)).not.toBeInTheDocument();
  });

  it('returns to the last question with the draft intact when the request fails', async () => {
    const user = userEvent.setup();
    mockSubmit.mockRejectedValueOnce(axiosError(500, 'internal_error'));
    mockSubmit.mockResolvedValueOnce(resultWithoutAverages);
    seed('feedback');
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Something went wrong/);
    expect(store.get(surveyDraftAtom)?.step).toBe('feedback');
    expect(screen.queryByText('Computing your massive workload…')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Computing your massive workload…')).toBeInTheDocument();
  });

  it.each([
    ['already_submitted', /already answered/],
    ['survey_closed', /just closed/],
  ])('explains a %s response and drops the draft', async (code, message) => {
    const user = userEvent.setup();
    mockSubmit.mockRejectedValueOnce(axiosError(409, code));
    seed('feedback');
    const onClose = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(store.get(surveyDraftAtom)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not store a draft for another account', () => {
    store.set(surveyDraftAtom, {
      key: getSurveyKey('someone-else', flight.flightId),
      step: 'quality',
      answers,
    });
    renderDialog();

    expect(screen.getByText('Help us improve WanGPT')).toBeInTheDocument();
  });
});
