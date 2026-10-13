-- Up Migration
-- Which external record (e.g. an AnyList item) each imported Waffled row came from, so
-- re-running an import adds only what is new.
create table import_links (
  household_id uuid not null references households(id) on delete cascade,
  source text not null,
  kind text not null,
  external_id text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (household_id, source, kind, external_id)
);

-- Down Migration
drop table import_links;
