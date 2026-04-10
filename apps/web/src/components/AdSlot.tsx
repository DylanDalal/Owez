"use client";

import { useEffect, useRef } from "react";

/**
 * Google AdSense ad unit. Renders an `<ins class="adsbygoogle">` element
 * and pushes to the ad queue on mount.
 *
 * Requires:
 *   - NEXT_PUBLIC_ADSENSE_PUB_ID set in .env.local (e.g. "ca-pub-1234567890")
 *   - The AdSense script loaded in layout.tsx
 *   - An ad-slot ID from your AdSense dashboard
 *
 * If the publisher ID isn't configured, the component renders nothing —
 * so the app works ad-free in dev until you plug in real IDs.
 */
export function AdSlot({
  slot,
  format = "auto",
  responsive = true,
  className,
}: {
  /** Ad unit slot ID from AdSense dashboard (numeric string). */
  slot: string;
  /** AdSense format: "auto", "fluid", "rectangle", etc. */
  format?: string;
  responsive?: boolean;
  className?: string;
}) {
  const pubId = process.env.NEXT_PUBLIC_ADSENSE_PUB_ID;
  const pushed = useRef(false);

  useEffect(() => {
    if (!pubId || pushed.current) return;
    try {
      const adsbygoogle = (window as any).adsbygoogle ?? [];
      adsbygoogle.push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded — ad blocker or script not yet ready.
    }
  }, [pubId]);

  if (!pubId) return null;

  return (
    <ins
      className={`adsbygoogle ${className ?? ""}`}
      style={{ display: "block" }}
      data-ad-client={pubId}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? "true" : "false"}
    />
  );
}
