'use client';

import { Icon } from './Icon';
import styles from './ShowAccordion.module.css';

export type ShowAccordionState = 'more' | 'less' | 'view-all';

export interface ShowAccordionProps {
  state?: ShowAccordionState;
  onClick?: () => void;
  className?: string;
  showLines?: boolean;
}

const LABELS: Record<ShowAccordionState, string> = {
  more: 'Show more',
  less: 'Show less',
  'view-all': 'View all',
};

export function ShowAccordion({
  state = 'more',
  onClick,
  className,
  showLines = true,
}: ShowAccordionProps) {
  const rootClass = [
  styles.root,
  !showLines ? styles.rootNoLines : '',
  className ?? '',
].filter(Boolean).join(' ');

  const leadingIconName =
    state === 'more' ? 'chevron-down' : state === 'less' ? 'chevron-up' : null;

  const trailingIcon = state === 'view-all' ? 'chevron-right' : null;

  return (
    <div className={rootClass}>
      {showLines ? <span className={styles.line} aria-hidden="true" /> : null}

      <button
        type="button"
        className={styles.btn}
        onClick={onClick}
        aria-expanded={state === 'more' ? false : state === 'less' ? true : undefined}
      >
        {leadingIconName && (
          <Icon name={leadingIconName} size={14} />
        )}
        <span className={styles.label}>{LABELS[state]}</span>
        {trailingIcon && (
          <Icon name={trailingIcon} size={14} />
        )}
      </button>

      {showLines ? <span className={styles.line} aria-hidden="true" /> : null}
    </div>
  );
}
