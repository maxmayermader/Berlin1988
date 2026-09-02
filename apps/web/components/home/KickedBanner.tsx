'use client';

import { useEffect, useState } from 'react';
import { KICKED_BANNER_COPY, consumeKicked } from '../../lib/kicked.js';
import { Banner } from '../ui/Banner.js';

/**
 * The one small client island the home page needs (page.tsx stays an RSC
 * otherwise). Reads the one-shot kicked flag in a mount effect, never
 * during render, so a Next.js server render never touches sessionStorage —
 * the same SSR-safe hydration discipline loadoutStore.ts already follows.
 * Renders nothing when the flag was never set, or once it's been dismissed.
 */
export function KickedBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(consumeKicked());
  }, []);

  if (!visible) return null;

  return <Banner onDismiss={() => setVisible(false)}>{KICKED_BANNER_COPY}</Banner>;
}
