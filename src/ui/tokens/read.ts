/**
 * Reads a design token off the document root. Canvas and WebGL cannot use CSS
 * custom properties directly, so anything drawn imperatively resolves its
 * colours through here.
 *
 * Deliberately no fallback parameter: a literal fallback is a second source of
 * truth, and a second source of truth drifts. theme.css is imported before the
 * app mounts, so a miss means the token is missing, which is a bug worth
 * hearing about rather than papering over.
 */
const cache = new Map<string, string>();

export function token(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') return '';

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) {
    if (import.meta.env.DEV) {
      console.warn(`[tokens] "${name}" is not defined in theme.css`);
    }
    return '';
  }
  cache.set(name, value);
  return value;
}

/** Token as an { r, g, b } triple in 0–1, for WebGL uniforms. */
export function tokenRGB(name: string): [number, number, number] {
  const hex = token(name).replace('#', '');
  if (hex.length < 3) return [0, 0, 0];
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const int = Number.parseInt(full.slice(0, 6), 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

/** Invalidate after a theme change (a colour-blind remap, for instance). */
export function clearTokenCache(): void {
  cache.clear();
}
