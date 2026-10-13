-- Up Migration
-- Stream lists + list_items to clients so lists can be read and edited offline (writes
-- come back through /api/powersync/crud). REPLICA IDENTITY FULL so updates/deletes carry
-- the old row PowerSync needs for bucket state, as for events in 0027.
alter table lists replica identity full;
alter table list_items replica identity full;
alter publication powersync add table lists, list_items;

-- Down Migration
alter publication powersync drop table lists, list_items;
alter table list_items replica identity default;
alter table lists replica identity default;
