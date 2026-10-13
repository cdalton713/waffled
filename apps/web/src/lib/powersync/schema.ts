// PowerSync client schema — the local SQLite mirror of the tables we replicate
// (see infra/compose/powersync/sync-config.yaml). PowerSync downloads only tables
// declared here; `id` is an implicit text primary key, so it's never listed.
// Columns are stored loosely (text / integer); this is the foundation other
// screens can read from directly later. Today we use it to drive realtime refresh.
import { column, Schema, Table } from '@powersync/web'

const events = new Table({
  household_id: column.text,
  calendar_id: column.text,
  title: column.text,
  description: column.text,
  location: column.text,
  starts_at: column.text,
  ends_at: column.text,
  all_day: column.integer,
  is_countdown: column.integer,
  timezone: column.text,
  status: column.text,
  person_id: column.text,
  goal_id: column.text,
  goal_step_id: column.text,
  // Set by the rhythm booking flow over REST, read here so the calendar can mark which
  // events are somebody's rhythm. Declared but never written locally: the server treats an
  // absent rhythm_id on an upload as "leave it alone", so a client that only reads it can
  // never accidentally un-book a period.
  rhythm_id: column.text,
  origin: column.text,
  origin_ref_id: column.text,
  rrule: column.text, // non-null marks a recurring master (its occurrences render instead)
  visibility: column.text, // 'family' | 'personal' (personal shows only to owner_person_id)
  owner_person_id: column.text,
  updated_at: column.text,
})

const event_participants = new Table({
  household_id: column.text,
  event_id: column.text,
  person_id: column.text,
})

// Materialized occurrences of a recurring master (event_id). Clients render these
// as plain dated rows; the server worker keeps them in sync.
const event_occurrences = new Table({
  household_id: column.text,
  event_id: column.text,
  override_id: column.text,
  original_start: column.text,
  person_id: column.text,
  title: column.text,
  location: column.text,
  starts_at: column.text,
  ends_at: column.text,
  all_day: column.integer,
  starts_on: column.text,
  visibility: column.text,
  owner_person_id: column.text,
})

const persons = new Table({
  household_id: column.text,
  name: column.text,
  color_hex: column.text,
  avatar_emoji: column.text,
  member_type: column.text,
  sort_order: column.integer,
  created_at: column.text,
})

const households = new Table({
  name: column.text,
  timezone: column.text,
  week_start: column.text,
})

// Lists are read and edited offline (lists-local.ts); writes upload to /api/powersync/crud.
const lists = new Table({
  household_id: column.text,
  name: column.text,
  emoji: column.text,
  list_type: column.text,
  is_auto_built: column.integer,
  sort_mode: column.text,
  sort_order: column.integer,
  source_template_id: column.text,
  created_at: column.text,
  updated_at: column.text,
})

const list_items = new Table({
  household_id: column.text,
  list_id: column.text,
  name: column.text,
  quantity: column.text,
  note: column.text,
  checked: column.integer,
  checked_at: column.text,
  checked_by: column.text,
  category: column.text,
  store: column.text,
  priority: column.integer,
  source: column.text,
  source_recipe_ids: column.text,
  source_meal_ids: column.text,
  assigned_to: column.text,
  sort_order: column.integer,
  week_start: column.text,
  created_by: column.text,
  created_at: column.text,
  updated_at: column.text,
})

export const AppSchema = new Schema({ events, event_participants, event_occurrences, persons, households, lists, list_items })
