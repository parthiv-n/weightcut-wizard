-- Force PostgREST to reload its schema cache. The previous rich-announcements
-- migration changed the my_announcements return type — if the cache didn't
-- pick it up, RPC calls 404 silently and the section renders empty.
SELECT pg_notify('pgrst', 'reload schema');
NOTIFY pgrst, 'reload schema';
