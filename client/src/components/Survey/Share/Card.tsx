import { forwardRef } from 'react';

export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1350;

export type ShareStat = { label: string; value: string; detail?: string };
export type ShareTool = { name: string; width: number };

type CardProps = {
  mark: string;
  title: string;
  period: string;
  hours?: string;
  stats: ShareStat[];
  toolsLabel: string;
  tools: ShareTool[];
  emptyTools: string;
  footer: string;
};

/** A fixed portrait card. It is rendered off-screen and captured, never shown. */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { mark, title, period, hours, stats, toolsLabel, tools, emptyTools, footer },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{ width: SHARE_WIDTH, height: SHARE_HEIGHT }}
      className="flex flex-col justify-between bg-surface-highlight p-16 text-text-on-highlight"
    >
      <div className="flex flex-col gap-10">
        <div className="flex items-center justify-between text-3xl font-semibold">
          <span>{mark}</span>
          <span className="text-2xl font-medium opacity-80">{period}</span>
        </div>
        <div className="flex flex-col gap-6">
          <h2 className="text-7xl font-semibold leading-tight">{title}</h2>
          {hours && (
            <span className="w-fit rounded-full border border-text-on-highlight/40 px-6 py-3 text-3xl">
              {hours}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-3xl bg-surface-primary p-8 text-text-primary">
              <p className="text-2xl text-text-secondary">{stat.label}</p>
              <p className="mt-2 text-6xl font-semibold">{stat.value}</p>
              {stat.detail && <p className="mt-3 text-2xl text-text-secondary">{stat.detail}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <div className="rounded-3xl bg-surface-primary p-8 text-text-primary">
          <p className="text-2xl text-text-secondary">{toolsLabel}</p>
          {tools.length === 0 ? (
            <p className="mt-4 text-3xl">{emptyTools}</p>
          ) : (
            <ul className="mt-6 flex flex-col gap-4">
              {tools.map((tool) => (
                <li key={tool.name} className="flex items-center gap-4">
                  <span className="w-64 shrink-0 truncate text-3xl">{tool.name}</span>
                  <span className="h-4 flex-1 overflow-hidden rounded-full bg-surface-tertiary">
                    <span
                      className="block h-full rounded-full bg-surface-highlight"
                      style={{ width: `${tool.width}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-2xl opacity-80">{footer}</p>
      </div>
    </div>
  );
});

export default Card;
