"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";

/**
 * Thin client-only wrapper so the root layout can stay a Server Component.
 * Any future context providers (theme, toast, etc.) drop in here.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
