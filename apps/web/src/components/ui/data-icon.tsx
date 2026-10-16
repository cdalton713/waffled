import type { CSSProperties } from 'react'
import type { LucideProps } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveSymbol, type SymbolKind } from './icon-symbols'
export type { SymbolKind } from './icon-symbols'

export function DataIcon({
  value,
  kind = 'general',
  label,
  className,
  style,
  ...props
}: Omit<LucideProps, 'ref'> & {
  value?: string | null
  kind?: SymbolKind
  label?: string
  style?: CSSProperties
}) {
  const Symbol = resolveSymbol(value, kind)
  const signal =
    value === '🔴'
      ? 'var(--danger)'
      : value === '🟡'
        ? 'var(--warn)'
        : value === '🟢'
          ? 'var(--success)'
          : undefined
  return (
    <Symbol
      data-slot="icon"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      width="1em"
      height="1em"
      className={cn('inline-block shrink-0 align-[-0.125em]', className)}
      style={{ ...(signal ? { color: signal, fill: signal } : {}), ...style }}
      {...props}
    />
  )
}
