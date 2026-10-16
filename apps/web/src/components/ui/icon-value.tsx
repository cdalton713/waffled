import { DataIcon, type SymbolKind } from './data-icon'

// Currency symbols can be text (XP, $, £) as well as stored pictograms.
export function IconValue({
  value,
  kind = 'reward',
}: {
  value?: string | null
  kind?: SymbolKind
}) {
  if (!value) return null
  return /[\u{1F000}-\u{1FAFF}\u2300-\u27BF\u2B00-\u2BFF]/u.test(value) ? (
    <DataIcon value={value} kind={kind} />
  ) : (
    <>{value}</>
  )
}
