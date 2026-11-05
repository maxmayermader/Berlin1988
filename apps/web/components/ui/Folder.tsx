import type { ReactNode } from 'react';

/**
 * A manila folder: the primary panel of the dossier theme. A tab carries the
 * title the way a real file's label does; the body is a grained manila (or
 * paper) sheet with a soft drop shadow off the desk.
 *
 * Game-agnostic (apps/web/components/CLAUDE.md: ui/ never imports the
 * engine or shared types). Server-component safe — no hooks.
 */
export interface FolderProps {
  /** Text on the folder tab. Omit for a tabless sheet. */
  tab?: ReactNode;
  /** Right-aligned content on the tab row (counts, controls). */
  aside?: ReactNode;
  /** 'manila' is the folder board; 'paper' is a typed sheet inside it. */
  surface?: 'manila' | 'paper';
  /** Heading level for the tab text. Purely semantic. */
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  id?: string;
  'aria-label'?: string;
}

export function Folder({
  tab,
  aside,
  surface = 'manila',
  as: Heading = 'h2',
  className = '',
  bodyClassName = '',
  children,
  id,
  'aria-label': ariaLabel,
}: FolderProps) {
  return (
    <section id={id} aria-label={ariaLabel} className={`flex min-w-0 flex-col ${className}`}>
      {tab !== undefined && (
        <div className="flex items-end justify-between gap-3">
          <Heading
            className={`${surface} folder-tab relative -mb-px inline-flex max-w-[75%] items-center gap-2 px-4 pb-1.5 pt-2 font-display text-[15px] leading-none tracking-[0.06em]`}
          >
            {tab}
          </Heading>
          {aside !== undefined && (
            <div className="label-caps pb-1.5 text-on-desk-muted">{aside}</div>
          )}
        </div>
      )}
      <div
        className={`${surface} min-w-0 flex-1 rounded-[4px] ${tab !== undefined ? 'rounded-tl-none' : ''} p-4 shadow-sheet ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}
