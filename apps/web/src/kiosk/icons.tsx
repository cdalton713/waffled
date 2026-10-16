import {
  CalendarDays, CalendarCheck, Check as CheckIcon, ChevronLeft, ChevronRight,
  CircleCheck, Clock, Cloud, House, Image, List, Menu, Mic, Package,
  Settings, ShoppingBag, SlidersHorizontal, Sparkles, Star as StarIcon, Target,
  Users, UtensilsCrossed, BookOpen, Plus, X, type LucideProps,
} from 'lucide-react'

const ICONS = {
  home: House, calendar: CalendarDays, tasks: CircleCheck, meals: UtensilsCrossed,
  recipes: BookOpen, lists: List, photos: Image, settings: Settings, goals: Target,
  cloud: Cloud, spark: Sparkles, mic: Mic, plus: Plus, cr: ChevronRight,
  cl: ChevronLeft, filter: SlidersHorizontal, bag: ShoppingBag, clock: Clock,
  family: Users, pantry: Package, planning: CalendarCheck, menu: Menu, close: X,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, ...props }: LucideProps & { name: IconName }) {
  const Symbol = ICONS[name]
  return <Symbol data-slot="icon" aria-hidden="true" {...props} />
}

export function Star({ size = 14 }: { size?: number }) {
  return <StarIcon data-slot="icon" size={size} aria-hidden="true" style={{ fill: 'currentColor' }} />
}

export function Check({ size = 14 }: { size?: number }) {
  return <CheckIcon data-slot="icon" size={size} aria-hidden="true" strokeWidth={3} />
}
