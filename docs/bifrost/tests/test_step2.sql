-- Step 2: events and sign-ups (run after test_step1.sql)
\set ON_ERROR_STOP 1
SELECT id AS cid FROM discord_connections WHERE revoked_at IS NULL AND organization_id = 1 \gset

SET ROLE service_role;
SELECT public.discord_set_signup(:'cid', 1, '400000000000000001', 'going');
SELECT public.discord_set_signup(:'cid', 1, '400000000000000002', 'maybe');
SELECT public.discord_set_signup(:'cid', 1, '400000000000000002', 'not_going');
SELECT t_assert((SELECT count(*) = 2 FROM public.discord_list_signups(:'cid', 1)), 'one answer per member');
SELECT t_assert((SELECT status = 'not_going' FROM public.discord_list_signups(:'cid', 1) WHERE discord_user_id = '400000000000000002'), 'changing an answer replaces it');
SELECT t_fails(format('SELECT public.discord_set_signup(%L, 2, ''400000000000000001'', ''going'')', :'cid'), '%Event not found%', 'cannot sign up for another org''s event');
SELECT t_fails(format('SELECT public.discord_set_signup(%L, 1, ''400000000000000001'', ''yes'')', :'cid'), '%Invalid sign-up status%', 'status is checked');
SELECT t_fails(format('SELECT * FROM public.discord_list_signups(%L, 2)', :'cid'), '%Event not found%', 'cannot list another org''s sign-ups');

SELECT public.discord_create_event(:'cid', 'Retro', 'retrospective', '2026-11-05', '18:30', 1) AS eid \gset
SELECT t_fails(format('SELECT public.discord_create_event(%L, ''X'', ''party'', ''2026-11-05'')', :'cid'), '%Invalid event type%', 'event type is checked');
SELECT t_fails(format('SELECT public.discord_create_event(%L, ''X'', ''meeting'', ''2026-11-05'', ''25:00'')', :'cid'), '%Invalid event time%', 'event time is checked');
SELECT t_fails(format('SELECT public.discord_create_event(%L, ''X'', ''meeting'', ''2026-11-05'', NULL, 2)', :'cid'), '%Department is not in this organization%', 'department must be in the org');
SELECT public.discord_update_event(:'cid', :eid, NULL, '2026-11-06', '19:00');
SELECT public.discord_record_event_post(:'cid', :eid, '555', '900000000000000001');
SELECT public.discord_record_event_post(:'cid', :eid, '555', '900000000000000002');
SELECT t_fails(format('SELECT public.discord_update_event(%L, 2, ''hijack'')', :'cid'), '%Event not found%', 'cannot edit another org''s event');
SELECT t_fails(format('SELECT public.discord_delete_event(%L, 2)', :'cid'), '%Event not found%', 'cannot delete another org''s event');
RESET ROLE;
SELECT t_assert((SELECT title = 'Retro' AND event_date = '2026-11-06' AND event_time = '19:00' AND organization_id = 1
                   AND created_by = '11111111-1111-1111-1111-111111111111' FROM calendar_events WHERE id = :eid), 'event created and moved, credited to the code creator');
SELECT t_assert((SELECT message_id = '900000000000000002' FROM discord_event_posts WHERE event_id = :eid), 'event post is recorded once per server');

-- Members read sign-ups for their org only
SET test.uid = '33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
SELECT t_assert((SELECT count(*) = 2 FROM calendar_event_signups), 'org member sees sign-ups');
SELECT t_fails('INSERT INTO calendar_event_signups (event_id, organization_id, discord_user_id, status) VALUES (1, 1, ''1'', ''going'')', '%permission denied%', 'members cannot write sign-ups directly');
SELECT t_fails(format('SELECT public.discord_set_signup(%L, 1, ''400000000000000003'', ''going'')', :'cid'), '%permission denied%', 'members cannot call bot functions');
RESET ROLE;
SET test.uid = '22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SELECT t_assert((SELECT count(*) = 0 FROM calendar_event_signups), 'other org sees no sign-ups');
RESET ROLE;

SET ROLE service_role;
SELECT public.discord_delete_event(:'cid', :eid);
RESET ROLE;
SELECT t_assert(NOT EXISTS (SELECT 1 FROM calendar_events WHERE id = :eid), 'event deleted');
