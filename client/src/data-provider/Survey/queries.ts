import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type {
  TSurveyNudge,
  TSurveyNudgeResult,
  TSurveyResult,
  TSurveyStatus,
  TSurveySubmission,
} from 'librechat-data-provider';
import type {
  UseQueryOptions,
  UseMutationOptions,
  QueryObserverResult,
} from '@tanstack/react-query';

export const useSurveyQuery = (
  config?: UseQueryOptions<TSurveyStatus>,
): QueryObserverResult<TSurveyStatus> => {
  return useQuery<TSurveyStatus>([QueryKeys.survey], () => dataService.getSurvey(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useSubmitSurveyMutation = (
  options?: UseMutationOptions<TSurveyResult, Error, TSurveySubmission>,
) => {
  const queryClient = useQueryClient();
  return useMutation<TSurveyResult, Error, TSurveySubmission>(
    [MutationKeys.submitSurvey],
    (submission: TSurveySubmission) => dataService.submitSurvey(submission),
    {
      ...options,
      onSuccess: (...params) => {
        queryClient.invalidateQueries([QueryKeys.survey]);
        options?.onSuccess?.(...params);
      },
    },
  );
};

/** Records a dismissal and keeps this session's status in step without another GET. */
export const useSnoozeSurveyMutation = (
  options?: UseMutationOptions<TSurveyNudgeResult, Error, TSurveyNudge>,
) => {
  const queryClient = useQueryClient();
  return useMutation<TSurveyNudgeResult, Error, TSurveyNudge>(
    [MutationKeys.snoozeSurvey],
    (nudge: TSurveyNudge) => dataService.snoozeSurvey(nudge),
    {
      ...options,
      onSuccess: (result, ...params) => {
        queryClient.setQueryData<TSurveyStatus>([QueryKeys.survey], (current) =>
          current ? { ...current, nextNudgeAt: result.nextNudgeAt } : current,
        );
        options?.onSuccess?.(result, ...params);
      },
    },
  );
};
