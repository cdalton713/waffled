import type { IconName } from './icons'
import type { ModuleKey } from '../lib/modules'

// The rail's primary nav. `path` drives both the route and the active state.
// `module` (optional) gates the entry behind an enabled optional module.
export interface Screen {
  path: string
  label: string
  icon: IconName
  module?: ModuleKey
}

export const SCREENS: Screen[] = [
  { path: '/', label: 'Today', icon: 'home' },
  { path: '/calendar', label: 'Calendar', icon: 'calendar' },
  { path: '/tasks', label: 'Tasks', icon: 'tasks', module: 'chores' },
  { path: '/goals', label: 'Goals', icon: 'goals', module: 'goals' },
  { path: '/family', label: 'Family', icon: 'family' },
  { path: '/meals', label: 'Meals', icon: 'meals', module: 'meals' },
  { path: '/lists', label: 'Lists', icon: 'lists', module: 'lists' },
  { path: '/pantry', label: 'Pantry', icon: 'pantry', module: 'pantry' },
  { path: '/rhythms', label: 'Rhythms', icon: 'clock', module: 'rhythms' },
  { path: '/planning', label: 'Planning', icon: 'planning', module: 'weeklyPlanning' },
  { path: '/photos', label: 'Photos', icon: 'photos' },
]

export const SETTINGS: Screen = { path: '/settings', label: 'Settings', icon: 'settings' }

// Detail routes that live under a nav screen without sharing its path prefix.
const PARENT: Record<string, string> = { '/person': '/family' }

/** The nav screen a pathname belongs to (longest path wins). */
export function activeScreen(pathname: string): Screen | undefined {
  const prefix = Object.keys(PARENT).find((p) => pathname.startsWith(`${p}/`))
  const path = prefix ? PARENT[prefix] : pathname
  return [...SCREENS, SETTINGS]
    .filter((screen) => (screen.path === '/' ? path === '/' : path.startsWith(screen.path)))
    .sort((a, b) => b.path.length - a.path.length)[0]
}
