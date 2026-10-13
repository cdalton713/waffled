// AnyList's public item catalog (the data behind its own add-item autocomplete) and the
// matcher that ranks it behind what the household already buys. The catalog is a static
// ~650 KB file served without auth, so one copy is shared by every household; if it is
// unreachable, suggestions fall back to the household's own history.
import { config } from '../../platform/config'

const CATALOG_PATH = '/static/webapp/data/tag_data.json'
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000

interface TagData {
  tags?: Record<string, { displayName?: string; rootCategory?: string }>
  autocompleteKeywords?: Record<string, Record<string, Array<[string, number, ...unknown[]]>>>
}
interface CatalogItem { name: string; popularity: number; category: string | null }

export interface Suggestion { name: string; source: 'history' | 'catalog' }

let cached: { items: CatalogItem[]; expires: number } | null = null
let inflight: Promise<CatalogItem[]> | null = null

function parse(data: TagData): CatalogItem[] {
  const popularity = new Map<string, number>()
  for (const byWord of Object.values(data.autocompleteKeywords ?? {})) {
    for (const entries of Object.values(byWord)) {
      for (const [name, score] of entries) popularity.set(name, Math.max(popularity.get(name) ?? 0, Number(score) || 0))
    }
  }
  return Object.values(data.tags ?? {})
    .map((t) => ({ name: t.displayName?.trim() ?? '', category: t.rootCategory ?? null }))
    .filter((t) => !!t.name)
    .map((t) => ({ ...t, popularity: popularity.get(t.name) ?? 0 }))
}

async function load(): Promise<CatalogItem[]> {
  try {
    const res = await fetch(config.anylist.baseUrl + CATALOG_PATH, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const items = parse((await res.json()) as TagData)
    cached = { items, expires: Date.now() + CATALOG_TTL_MS }
    return items
  } catch {
    // Suggestions are a convenience: degrade to history-only and retry later.
    cached = { items: cached?.items ?? [], expires: Date.now() + RETRY_AFTER_FAILURE_MS }
    return cached.items
  }
}

export async function catalogItems(): Promise<CatalogItem[]> {
  if (cached && cached.expires > Date.now()) return cached.items
  inflight ??= load().finally(() => { inflight = null })
  return inflight
}

// The catalog's grocery category key ("produce", "snacks") for an item name, if listed.
export async function catalogCategory(name: string): Promise<string | null> {
  const n = fold(name)
  return (await catalogItems()).find((c) => fold(c.name) === n)?.category ?? null
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
const words = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean)

// 0 = the name starts with the text, 1 = every typed word starts some word, null = no match.
function matchRank(name: string, query: string): 0 | 1 | null {
  const n = fold(name)
  if (n.startsWith(query)) return 0
  const nameWords = words(n)
  return words(query).every((q) => nameWords.some((w) => w.startsWith(q))) ? 1 : null
}

// `history` carries how often the household has added each name, so its favourites lead.
export function rankSuggestions(query: string, history: Array<{ name: string; popularity: number }>, catalog: CatalogItem[], limit = 8): Suggestion[] {
  const q = fold(query)
  if (!q) return []
  const seen = new Set<string>()
  const pick = (items: Array<{ name: string; popularity: number }>, source: Suggestion['source']) =>
    items
      .map((item) => ({ ...item, rank: matchRank(item.name, q) }))
      .filter((m) => m.rank !== null)
      .sort((a, b) => a.rank! - b.rank! || b.popularity - a.popularity || a.name.localeCompare(b.name))
      .filter((m) => !seen.has(fold(m.name)) && seen.add(fold(m.name)))
      .map((m): Suggestion => ({ name: m.name, source }))
  return [...pick(history, 'history'), ...pick(catalog, 'catalog')].slice(0, limit)
}
