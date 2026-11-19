import { useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import type { TSurveyFlight, TSurveyNudgeReason } from 'librechat-data-provider';
import { getSurveyKey, surveyOpenAtom } from './store';
import SurveyDialog from './Dialog';
import useSurvey from './useSurvey';
import Fish from './Fish';

const IDLE_TIMEOUT_MS = 3000;
const IDLE_FALLBACK_MS = 500;
/** The fish waits until the app has been quiet, then a moment longer. */
const FISH_ARRIVAL_MS = 3000;

/** True once the browser has had a quiet moment after first paint. */
function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback !== 'function') {
      const id = setTimeout(() => setIdle(true), IDLE_FALLBACK_MS);
      return () => clearTimeout(id);
    }
    const id = window.requestIdleCallback(() => setIdle(true), { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }, []);
  return idle;
}

function useVisible() {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  return visible;
}

/**
 * Brings the feedback fish in once per visit when a survey is due. The dialog
 * opens only when the fish is caught or the account menu is used.
 */
export default function Survey() {
  const idle = useIdle();
  const visible = useVisible();
  const { flight, due, userId, snooze } = useSurvey({ fetch: idle });
  const [open, setOpen] = useAtom(surveyOpenAtom);
  const offered = useRef<string>();
  const [visiting, setVisiting] = useState(false);
  /** The questionnaire was paused, so the fish should say goodbye and leave. */
  const [farewell, setFarewell] = useState(false);
  /** Kept while open, so closing the flight mid-dialog cannot pull the success page away. */
  const [shown, setShown] = useState<TSurveyFlight | null>(null);

  useEffect(() => {
    if (!due || !flight || !visible) {
      return undefined;
    }
    const key = getSurveyKey(userId, flight.flightId);
    if (offered.current === key) {
      return undefined;
    }
    const id = window.setTimeout(() => {
      if (offered.current === key) {
        return;
      }
      offered.current = key;
      setVisiting(true);
    }, FISH_ARRIVAL_MS);
    return () => window.clearTimeout(id);
  }, [due, flight, userId, visible]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (flight) {
      offered.current = getSurveyKey(userId, flight.flightId);
    }
    setVisiting(false);
    setFarewell(false);
  }, [open, flight, userId]);

  useEffect(() => {
    if (!open) {
      setShown(null);
      return;
    }
    if (flight && !shown) {
      setShown(flight);
    }
  }, [open, flight, shown]);

  const dismiss = (reason: TSurveyNudgeReason) =>
    snooze(reason)
      .then((result) => result?.delayDays)
      .catch(() => undefined);

  if (open && shown) {
    return (
      <SurveyDialog
        flight={shown}
        userId={userId}
        onClose={() => setOpen(false)}
        onLater={() => setFarewell(true)}
      />
    );
  }

  if ((visiting || farewell) && !open) {
    return (
      <Fish
        departing={farewell}
        onYes={() => {
          if (flight) {
            setShown(flight);
          }
          setOpen(true);
        }}
        onSnooze={dismiss}
        onGone={() => {
          setVisiting(false);
          setFarewell(false);
        }}
      />
    );
  }

  return null;
}
