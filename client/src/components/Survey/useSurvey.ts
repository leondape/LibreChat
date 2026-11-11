import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import type { TSurveyNudgeReason, TSurveyNudgeResult } from 'librechat-data-provider';
import { useGetStartupConfig, useSnoozeSurveyMutation, useSurveyQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { surveyOpenAtom } from './store';

/**
 * The armed survey for this account. `fetch` lets the app shell hold the request
 * back until the browser is idle; without it the hook only reads what is cached.
 */
export default function useSurvey({ fetch = true }: { fetch?: boolean } = {}) {
  const { user, isAuthenticated } = useAuthContext();
  const { data: config } = useGetStartupConfig();
  const setOpen = useSetAtom(surveyOpenAtom);
  const snoozeMutation = useSnoozeSurveyMutation();
  const enabled =
    fetch && isAuthenticated && config !== undefined && config.interface?.survey !== false;
  const { data, isError, refetch } = useSurveyQuery({ enabled });

  const flight = data?.flight ?? null;
  const available = flight !== null && data?.submitted !== true;
  const due =
    available && (data?.nextNudgeAt == null || Date.parse(data.nextNudgeAt) <= Date.now());
  const open = useCallback(() => setOpen(true), [setOpen]);
  const snooze = useCallback(
    (reason: TSurveyNudgeReason): Promise<TSurveyNudgeResult | undefined> => {
      if (!flight) {
        return Promise.resolve(undefined);
      }
      return snoozeMutation.mutateAsync({ flightId: flight.flightId, reason });
    },
    [flight, snoozeMutation],
  );

  return {
    flight,
    userId: user?.id,
    isError,
    refetch,
    /** There is a survey this person has not answered yet. */
    available,
    /** The fish may visit: available, and no cooldown is still running. */
    due,
    open,
    snooze,
  };
}
