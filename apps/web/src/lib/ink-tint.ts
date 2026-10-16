/** A data-driven colour (e.g. a currency's) made safe to use as text in either theme. */
export function inkTint(color: string | null | undefined): string {
  return color ? `color-mix(in srgb, ${color} 60%, var(--ink))` : 'var(--ink)'
}
