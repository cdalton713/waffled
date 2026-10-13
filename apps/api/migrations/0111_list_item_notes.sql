-- Up Migration
alter table list_items add column note text;

-- Down Migration
alter table list_items drop column note;
