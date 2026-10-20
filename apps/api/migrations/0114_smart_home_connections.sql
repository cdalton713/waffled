-- Up Migration
-- Credentials stay outside households.settings, which PowerSync sends to clients.
create table smart_home_connections (
  household_id uuid primary key references households(id) on delete cascade,
  bridge_id text not null unique,
  home_id text not null,
  port integer not null check (port between 1024 and 65535),
  token_enc text not null,
  selected_device_ids jsonb not null default '[]'::jsonb,
  temperature_unit text not null default 'F' check (temperature_unit in ('F', 'C')),
  updated_at timestamptz not null default now()
);

-- Down Migration
drop table smart_home_connections;
