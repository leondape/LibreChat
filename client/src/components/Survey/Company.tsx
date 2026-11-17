import { cn } from '@librechat/client';
import { Check, ChevronRight } from 'lucide-react';
import type { TSurveyCompany } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type CompanyProps = {
  tree: TSurveyCompany[];
  value: string[];
  onChange: (path: string[]) => void;
  labelledBy: string;
};

type Crumb = { id: string; name: string; depth: number };

const isBranch = (node: TSurveyCompany) => (node.children?.length ?? 0) > 0;

/**
 * Follows `path` through its branches. A selected leaf is not part of the trail:
 * it stays a tile on `level`, where the person can see and change it.
 */
function walk(tree: TSurveyCompany[], path: string[]): { trail: Crumb[]; level: TSurveyCompany[] } {
  const trail: Crumb[] = [];
  let level = tree;
  for (let depth = 0; depth < path.length; depth += 1) {
    const node = level.find((candidate) => candidate.id === path[depth]);
    if (!node || !isBranch(node)) {
      break;
    }
    trail.push({ id: node.id, name: node.name, depth });
    level = node.children ?? [];
  }
  return { trail, level };
}

const crumbButton =
  'rounded-md px-1.5 py-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary';

const tile =
  'flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary';

export default function Company({ tree, value, onChange, labelledBy }: CompanyProps) {
  const localize = useLocalize();
  const { trail, level } = walk(tree, value);
  const selected = value.length > trail.length ? value[trail.length] : undefined;
  const base = value.slice(0, trail.length);

  return (
    <div className="flex flex-col gap-3">
      {trail.length > 0 && (
        <nav aria-label={localize('com_survey_company_path')}>
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            <li>
              <button type="button" className={crumbButton} onClick={() => onChange([])}>
                {localize('com_survey_company_all')}
              </button>
            </li>
            {trail.map((crumb, index) => {
              const current = index === trail.length - 1;
              return (
                <li key={crumb.id} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5 text-text-tertiary" aria-hidden="true" />
                  {current ? (
                    <span aria-current="location" className="px-1.5 py-0.5 font-medium">
                      {crumb.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={crumbButton}
                      onClick={() => onChange(value.slice(0, crumb.depth + 1))}
                    >
                      {crumb.name}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div
        role="group"
        aria-labelledby={labelledBy}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {level.map((node) => {
          if (isBranch(node)) {
            return (
              <button
                key={node.id}
                type="button"
                className={cn(tile, 'justify-between border-border-medium hover:bg-surface-hover')}
                onClick={() => onChange([...base, node.id])}
              >
                <span>{node.name}</span>
                <ChevronRight className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              </button>
            );
          }
          const chosen = node.id === selected;
          return (
            <button
              key={node.id}
              type="button"
              aria-pressed={chosen}
              className={cn(
                tile,
                chosen
                  ? 'border-text-primary bg-surface-secondary'
                  : 'border-border-medium hover:border-border-heavy hover:bg-surface-hover',
              )}
              onClick={() => onChange([...base, node.id])}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full border',
                  chosen
                    ? 'border-transparent bg-text-primary text-surface-primary'
                    : 'border-border-heavy',
                )}
              >
                {chosen && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span>{node.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
