import type { CSSProperties } from 'react'
import {
  Apple, Baby, Beef, Bike, Bird, BookOpen, Brain, BrushCleaning, CalendarDays,
  Camera, Car, Carrot, Cat, Check, Circle, ClipboardList, Clock, Cloud, CloudRain,
  CloudSun, Coffee, Cookie, Dog, Dumbbell, Egg, Fish, Flag, Flame, Flower2,
  Footprints, Gift, GraduationCap, HandHelping, Heart, House, Image, Landmark,
  Leaf, ListChecks, MapPin, Medal, Moon, Mountain, Music, Package, Palette,
  PartyPopper, PawPrint, Pizza, Plane, Rabbit, Refrigerator, Repeat, Search,
  Shield, ShoppingBag, ShoppingCart, Snowflake, Sofa, Soup, Sparkles, Star,
  Sun, Target, Tent, TreePine, Trophy, Turtle, Tv, Umbrella, UserRound, Users,
  UtensilsCrossed, Waves, Wine, Wrench, X, Plus, ChevronLeft, ChevronRight,
  ArrowLeft, ArrowRight, RotateCw, RotateCcw, Grip, Delete, type LucideIcon, type LucideProps,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type SymbolKind = 'general' | 'person' | 'goal' | 'meal' | 'pantry' | 'chore' | 'list' | 'reward' | 'photo' | 'weather' | 'rhythm' | 'calendar'
export interface SymbolOption { value: string; label: string; icon: LucideIcon }

export const SYMBOL_OPTIONS: readonly SymbolOption[] = [
  { value: '🙂', label: 'Person', icon: UserRound },
  { value: '👪', label: 'Family', icon: Users },
  { value: '🐢', label: 'Turtle', icon: Turtle },
  { value: '🐻', label: 'Animal', icon: PawPrint },
  { value: '🐱', label: 'Cat', icon: Cat },
  { value: '🐶', label: 'Dog', icon: Dog },
  { value: '🐰', label: 'Rabbit', icon: Rabbit },
  { value: '🐦', label: 'Bird', icon: Bird },
  { value: '👶', label: 'Baby', icon: Baby },
  { value: '🎯', label: 'Goal', icon: Target },
  { value: '📚', label: 'Reading', icon: BookOpen },
  { value: '🧠', label: 'Learning', icon: Brain },
  { value: '🎓', label: 'School', icon: GraduationCap },
  { value: '🎨', label: 'Creative', icon: Palette },
  { value: '🧘', label: 'Wellbeing', icon: Heart },
  { value: '🤝', label: 'Helping', icon: HandHelping },
  { value: '🏃', label: 'Activity', icon: Footprints },
  { value: '🚲', label: 'Cycling', icon: Bike },
  { value: '💪', label: 'Exercise', icon: Dumbbell },
  { value: '🎵', label: 'Music', icon: Music },
  { value: '🏆', label: 'Achievement', icon: Trophy },
  { value: '🎖️', label: 'Milestone', icon: Medal },
  { value: '⛳', label: 'Progress', icon: Flag },
  { value: '⭐', label: 'Star', icon: Star },
  { value: '🔥', label: 'Streak', icon: Flame },
  { value: '🎁', label: 'Reward', icon: Gift },
  { value: '🎉', label: 'Celebration', icon: PartyPopper },
  { value: '🍽️', label: 'Cooking', icon: UtensilsCrossed },
  { value: '🍕', label: 'Pizza', icon: Pizza },
  { value: '🍲', label: 'Soup', icon: Soup },
  { value: '🥩', label: 'Meat', icon: Beef },
  { value: '🐟', label: 'Fish', icon: Fish },
  { value: '🥚', label: 'Egg', icon: Egg },
  { value: '🥕', label: 'Vegetables', icon: Carrot },
  { value: '🍎', label: 'Fruit', icon: Apple },
  { value: '🍪', label: 'Treat', icon: Cookie },
  { value: '☕', label: 'Coffee', icon: Coffee },
  { value: '🍷', label: 'Drink', icon: Wine },
  { value: '🥫', label: 'Pantry', icon: Package },
  { value: '🧊', label: 'Cold storage', icon: Refrigerator },
  { value: '🛒', label: 'Groceries', icon: ShoppingCart },
  { value: '🛍️', label: 'Shopping', icon: ShoppingBag },
  { value: '🧹', label: 'Cleaning', icon: BrushCleaning },
  { value: '✅', label: 'Complete', icon: Check },
  { value: '📋', label: 'Tasks', icon: ClipboardList },
  { value: '📝', label: 'List', icon: ListChecks },
  { value: '🔁', label: 'Routine', icon: Repeat },
  { value: '📅', label: 'Calendar', icon: CalendarDays },
  { value: '⏱️', label: 'Timer', icon: Clock },
  { value: '🏠', label: 'Home', icon: House },
  { value: '🛋️', label: 'Rest', icon: Sofa },
  { value: '📺', label: 'Screen time', icon: Tv },
  { value: '🔧', label: 'Maintenance', icon: Wrench },
  { value: '🛡️', label: 'Safety', icon: Shield },
  { value: '📍', label: 'Location', icon: MapPin },
  { value: '🚗', label: 'Travel', icon: Car },
  { value: '✈️', label: 'Flight', icon: Plane },
  { value: '🏕️', label: 'Camping', icon: Tent },
  { value: '🏔️', label: 'Outdoors', icon: Mountain },
  { value: '🌳', label: 'Nature', icon: TreePine },
  { value: '🌱', label: 'Growing', icon: Leaf },
  { value: '🌸', label: 'Flower', icon: Flower2 },
  { value: '🏛️', label: 'Places', icon: Landmark },
  { value: '🏖️', label: 'Beach', icon: Waves },
  { value: '🖼️', label: 'Photo', icon: Image },
  { value: '📷', label: 'Camera', icon: Camera },
  { value: '☀️', label: 'Sun', icon: Sun },
  { value: '🌙', label: 'Night', icon: Moon },
  { value: '☁️', label: 'Cloud', icon: Cloud },
  { value: '🌤️', label: 'Partly cloudy', icon: CloudSun },
  { value: '🌧️', label: 'Rain', icon: CloudRain },
  { value: '❄️', label: 'Snow', icon: Snowflake },
  { value: '☂️', label: 'Umbrella', icon: Umbrella },
  { value: '✨', label: 'AI', icon: Sparkles },
  { value: '🔎', label: 'Search', icon: Search },
]

function normalize(value: string) {
  return value.replace(/[\uFE0F\uFE0E\u200D]|[\u{1F3FB}-\u{1F3FF}]/gu, '')
}

const symbols = new Map(SYMBOL_OPTIONS.map((option) => [normalize(option.value), option.icon]))
for (const [value, icon] of [
  ['×', X], ['＋', Plus], ['›', ChevronRight], ['→', ArrowRight], ['←', ArrowLeft],
  ['↻', RotateCw], ['↺', RotateCcw], ['⠿', Grip], ['⌫', Delete], ['‹', ChevronLeft],
  ['★', Star], ['☆', Star], ['✦', Sparkles],
] as const) symbols.set(value, icon)
for (const [aliases, icon] of [
  ['👨 👩 👦 👧 👤 🧑 👨‍🍳 👩‍🍳', UserRound],
  ['🐻 🦊 🦄 🐾', PawPrint],
  ['💛 💚 💜 ❤️ 💖 💑', Heart],
  ['🍝 🍴 🥘 🌮 🍔 🥗 🥪 🍛 🥐', UtensilsCrossed],
  ['🥦 🥬 🥑 🫛', Leaf],
  ['📖 📕 📘 📗', BookOpen],
  ['🌟 💫', Star],
  ['🎊 🥳', PartyPopper],
  ['🥇 🥈 🥉', Medal],
  ['📆 🗓️', CalendarDays],
  ['⏰ 🕒 🕐', Clock],
  ['☃️ 🌨️', Snowflake],
  ['✓ ✔️', Check],
] as const) {
  for (const value of aliases.split(' ')) symbols.set(normalize(value), icon)
}

const fallbacks: Record<SymbolKind, LucideIcon> = {
  general: Circle, person: UserRound, goal: Target, meal: UtensilsCrossed,
  pantry: Package, chore: ListChecks, list: ClipboardList, reward: Gift,
  photo: Image, weather: CloudSun, rhythm: Repeat, calendar: CalendarDays,
}

export function DataIcon({ value, kind = 'general', label, className, style, ...props }: Omit<LucideProps, 'ref'> & { value?: string | null; kind?: SymbolKind; label?: string; style?: CSSProperties }) {
  const Symbol = (value ? symbols.get(normalize(value)) : undefined) ?? fallbacks[kind]
  return <Symbol data-slot="icon" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} width="1em" height="1em" className={cn('inline-block shrink-0 align-[-0.125em]', className)} style={style} {...props} />
}
