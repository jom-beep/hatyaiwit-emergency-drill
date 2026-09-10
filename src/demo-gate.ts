/**
 * Demo mode is a static walkthrough. It must never skip production Google auth.
 * `/demo` only serves the PWA shell; `/api/*` still requires a real session.
 */
export function isDemoPagePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/demo";
}
