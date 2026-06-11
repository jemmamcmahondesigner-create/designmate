'use client';

import { useEffect, useState } from 'react';
import {
  formatDistanceToNow,
  formatDistanceToNowShort,
} from '@/lib/formatDistanceToNow';

/** Relative time safe for SSR — empty until after mount, then updates periodically. */
export function useClientRelativeTime(
  iso: string | null | undefined,
  options?: { addSuffix?: boolean; short?: boolean },
): string {
  const addSuffix = options?.addSuffix ?? true;
  const short = options?.short ?? false;
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!iso) {
      setLabel('');
      return;
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      setLabel('');
      return;
    }
    const update = () => {
      setLabel(
        short
          ? formatDistanceToNowShort(date)
          : formatDistanceToNow(date, { addSuffix }),
      );
    };
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [iso, addSuffix, short]);

  return label;
}
