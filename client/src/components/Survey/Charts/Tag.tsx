import { useLocalize } from '~/hooks';

/** Marks the answer or bar that belongs to the person reading. */
export default function Tag() {
  const localize = useLocalize();
  return (
    <span className="rounded-full bg-surface-highlight px-2 text-[10px] font-semibold leading-4 text-text-on-highlight">
      {localize('com_survey_res_you')}
    </span>
  );
}
