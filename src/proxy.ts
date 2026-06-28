import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: the former `middleware` convention is now `proxy`.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except Next internals (incl. _next/webpack-hmr), static
    // assets and image files, so auth cookies refresh on real navigations without
    // the proxy intercepting the HMR channel. Route protection lives in (app)/layout.tsx.
    "/((?!_next/|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
