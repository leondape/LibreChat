import { getDefaultStore } from 'jotai';
import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TSurveyAnswers } from 'librechat-data-provider';
import type { SurveyStepId } from '../store';
import { answers, flight, resultReady, resultWaiting } from 'test/survey';
import { COMPUTING_LINE_MS, COMPUTING_MIN_MS } from '../Computing';
import { getSurveyKey, surveyDraftAtom } from '../store';
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
    expect(screen.getByText('Question 1 of 14')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group' })).toBeInTheDocument();
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

    await user.click(screen.getByRole('radio', { name: '0 h' }));
    expect(screen.getByText('Question 3 of 14')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '2–5 h' }));
    expect(screen.getByText('Question 3 of 15')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('heading', { name: 'What do you do with the time you gain?' }),
    ).toBeInTheDocument();
  });

  it('turns Exact into an hours field and clears it when a range is chosen', async () => {
    const user = userEvent.setup();
    seed('hours', { ...answers, hoursSaved: undefined });
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Exact…' }));
    await user.type(screen.getByRole('spinbutton', { name: 'hours per week' }), '6');

    expect(screen.getByRole('spinbutton', { name: 'hours per week' })).toHaveValue(6);

    await user.click(screen.getByRole('radio', { name: '2–5 h' }));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '2–5 h' })).toHaveAttribute('aria-checked', 'true');
  });

  it('lets an exclusive letdown replace the others', async () => {
    const user = userEvent.setup();
    seed('letdowns', { ...answers, letdowns: undefined });
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Wrong or made-up answers' }));
    await user.click(screen.getByRole('button', { name: "Nowhere, it doesn't let me down" }));

    expect(screen.getByRole('button', { name: "Nowhere, it doesn't let me down" })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Wrong or made-up answers' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('caps the wishes at two', async () => {
    const user = userEvent.setup();
    seed('wishes', { ...answers, wishes: undefined });
    renderDialog();

    for (const name of ['Training for my kind of work', 'Better answers']) {
      await user.click(screen.getByRole('button', { name }));
    }

    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Something else' })).toBeDisabled();
  });

  it('asks to be reminded later and keeps the draft', async () => {
    const user = userEvent.setup();
    seed('improvement');
    const onLater = jest.fn();
    const onClose = renderDialog(jest.fn(), onLater);

    await user.click(screen.getByRole('button', { name: 'Later' }));

    expect(onLater).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(store.get(surveyDraftAtom)?.step).toBe('improvement');
  });

  async function finish(result: unknown) {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSubmit.mockResolvedValue(result);
    seed('contact');
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await play(COMPUTING_MIN_MS + COMPUTING_LINE_MS * 5);
    return user;
  }

  it('runs the loader, then celebrates with the month and a waiting state for colleagues', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSubmit.mockResolvedValue(resultWaiting);
    seed('contact');
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ flightId: flight.flightId, answers }),
    );
    expect(screen.getByText('Computing your massive workload…')).toBeInTheDocument();
    expect(store.get(surveyDraftAtom)).toBeNull();
    expect(mockConfetti).not.toHaveBeenCalled();

    await play(COMPUTING_MIN_MS + 1000);

    expect(screen.getByRole('heading', { name: "You're a Power Prompter" })).toBeInTheDocument();
    expect(screen.getAllByText('1,234').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Your month' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
    expect(mockConfetti).toHaveBeenCalledWith(
      expect.objectContaining({ disableForReducedMotion: true }),
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Not enough answers yet')).toBeVisible();
    expect(screen.queryByText(/\d+ (people|colleagues)/)).not.toBeInTheDocument();
  });

  it('walks through the three pages and closes on the last one', async () => {
    const user = await finish(resultReady);
    const onClose = jest.fn();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('tab', { name: 'Your time' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('2 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('tab', { name: 'Your month' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: 'Colleagues' }));
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the person next to their colleagues without ever counting them', async () => {
    const user = await finish(resultReady);

    await user.click(screen.getByRole('tab', { name: 'Colleagues' }));

    expect(screen.getByText('Ahead of 82% of colleagues')).toBeVisible();
    expect(screen.getAllByText(/^Ahead of \d+% of colleagues$/)).toHaveLength(1);
    expect(screen.queryByText(/WanGPT average/)).not.toBeInTheDocument();

    expect(screen.getAllByText('Typical').length).toBeGreaterThan(0);
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    expect(screen.getByText('What they use it for most')).toBeVisible();
    expect(screen.queryByText(/\d+ (people|colleagues)/)).toBeNull();
  });

  it('draws an empty month without breaking when nothing was sent', async () => {
    await finish({
      ...resultWaiting,
      activity: resultWaiting.activity.map((day) => ({ ...day, messages: 0 })),
    });

    expect(screen.getByText('No messages in this period.')).toBeVisible();
  });

  it('returns to the last question with the draft intact when the request fails', async () => {
    const user = userEvent.setup();
    mockSubmit.mockRejectedValueOnce(axiosError(500, 'internal_error'));
    mockSubmit.mockResolvedValueOnce(resultWaiting);
    seed('contact');
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Something went wrong/);
    expect(store.get(surveyDraftAtom)?.step).toBe('contact');
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
    seed('contact');
    const onClose = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(store.get(surveyDraftAtom)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores a draft saved before this survey version', () => {
    store.set(surveyDraftAtom, {
      key: `${userId}:${flight.flightId}`,
      step: 'feedback',
      answers,
    });
    renderDialog();

    expect(screen.getByText('Help us improve WanGPT')).toBeInTheDocument();
  });

  it('does not store a draft for another account', () => {
    store.set(surveyDraftAtom, {
      key: getSurveyKey('someone-else', flight.flightId),
      step: 'improvement',
      answers,
    });
    renderDialog();

    expect(screen.getByText('Help us improve WanGPT')).toBeInTheDocument();
  });
});
