import { Select, SelectItem, SelectValue, SelectTrigger, SelectContent } from '@librechat/client';
import type { TSurveyCompany } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type CompanyProps = {
  tree: TSurveyCompany[];
  value: string[];
  onChange: (path: string[]) => void;
  labelledBy: string;
};

type Level = { options: TSurveyCompany[]; selected: string };

/** One level per node on the way down, ending once a node has no children. */
function getLevels(tree: TSurveyCompany[], path: string[]): Level[] {
  const levels: Level[] = [];
  let options = tree;
  for (let depth = 0; options.length > 0; depth++) {
    const selected = path[depth] ?? '';
    levels.push({ options, selected });
    options = options.find((node) => node.id === selected)?.children ?? [];
  }
  return levels;
}

export default function Company({ tree, value, onChange, labelledBy }: CompanyProps) {
  const localize = useLocalize();
  const levels = getLevels(tree, value);

  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-col gap-3">
      {levels.map((level, depth) => (
        <Select
          key={depth}
          value={level.selected}
          /** Changing a level clears everything below it. */
          onValueChange={(id) => onChange([...value.slice(0, depth), id])}
        >
          <SelectTrigger
            aria-label={localize('com_survey_company_level', { 0: depth + 1 })}
            data-testid={`survey-company-${depth}`}
          >
            <SelectValue placeholder={localize('com_survey_select')} />
          </SelectTrigger>
          <SelectContent>
            {level.options.map((node) => (
              <SelectItem key={node.id} value={node.id}>
                {node.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}
