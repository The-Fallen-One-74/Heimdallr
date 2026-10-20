-- Step 1: link codes, connections and reports
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

-- Creating a code needs org.settings
SET test.uid = '11111111-1111-1111-1111-111111111111'; SET test.perm = 'no';
SET ROLE authenticated;
SELECT t_fails('SELECT public.create_discord_link_code()', '%permission required%', 'code needs org.settings');
SELECT t_fails('SELECT public.redeem_discord_link_code(''x'',''123456789012345678'',''g'',''1'')', '%permission denied%', 'signed-in users cannot redeem');
RESET ROLE;
SET ROLE anon;
SELECT t_fails('SELECT public.create_discord_link_code()', '%permission denied%', 'anon cannot create codes');
RESET ROLE;

SET test.perm = 'yes';
SET ROLE authenticated;
SELECT public.create_discord_link_code() ->> 'code' AS code \gset
RESET ROLE;
SELECT t_assert(:'code' ~ '^BFR-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$', 'code format');
SELECT t_assert((SELECT count(*) = 1 FROM discord_link_codes WHERE length(code_hash) = 64), 'only the hash is stored');

SET ROLE service_role;
SELECT t_assert(public.redeem_discord_link_code('BFR-ZZZZ-ZZZZ', '123456789012345678', 'Kyrie', '400000000000000001') ->> 'error' = 'invalid_code', 'wrong code is refused');
SELECT public.redeem_discord_link_code(lower(:'code'), '123456789012345678', 'Kyrie', '400000000000000001', '555', 'Europe/London') AS redeemed \gset
SELECT t_assert((:'redeemed'::jsonb ->> 'ok')::boolean AND (:'redeemed'::jsonb ->> 'organization_name') = 'Kyrie', 'right code links the org, any case and dashes');
SELECT t_assert(public.redeem_discord_link_code(:'code', '123456789012345678', 'Kyrie', '400000000000000001') ->> 'error' = 'invalid_code', 'code works once');
RESET ROLE;

SELECT id AS cid FROM discord_connections WHERE revoked_at IS NULL \gset
SELECT t_assert((SELECT timezone = 'Europe/London' AND linked_by = '11111111-1111-1111-1111-111111111111' FROM discord_connections WHERE id = :'cid'), 'connection records timezone and code creator');

-- Expired codes
UPDATE discord_link_codes SET expires_at = now() - interval '1 minute', used_at = NULL;
SET ROLE service_role;
SELECT t_assert(public.redeem_discord_link_code(:'code', '123456789012345679', 'X', '400000000000000001') ->> 'error' = 'invalid_code', 'expired code is refused');
RESET ROLE;
UPDATE discord_link_codes SET used_at = now();

-- Reports
SET ROLE service_role;
SELECT public.discord_submit_report(:'cid', 'bug', 'Crash on save', 'desc', 'high', 'blocker', '1. open', 'brian') ->> 'task_id' AS bug_id \gset
SELECT public.discord_submit_report(:'cid', 'feature', 'Dark mode', NULL, 'weird', NULL, NULL, 'brian') ->> 'task_id' AS feature_id \gset
SELECT t_fails(format('SELECT public.discord_set_report_project(%L, 2)', :'cid'), '%not in this organization%', 'report project must be in the org');
SELECT public.discord_set_report_project(:'cid', 3);
SELECT public.discord_submit_report(:'cid', 'feature', 'Into Game', NULL, 'low', NULL, NULL, 'x') ->> 'task_id' AS game_id \gset
SELECT t_fails(format('SELECT public.discord_submit_report(%L, ''task'', ''nope'')', :'cid'), '%Invalid report type%', 'only bugs and features');
RESET ROLE;
SELECT t_assert((SELECT column_id = 'product-backlog' AND severity = 'blocker' AND tags = ARRAY['discord'] AND reported_by = 'Discord: brian' FROM tasks WHERE id = :bug_id), 'bug lands in the backlog');
SELECT t_assert((SELECT column_id = 'submitted' AND priority = 'medium' AND severity IS NULL AND project_id = 1 FROM tasks WHERE id = :feature_id), 'feature lands in Submitted on the first project');
SELECT t_assert((SELECT project_id = 3 FROM tasks WHERE id = :game_id), 'chosen report project is used');

-- Who can see connections
SET test.uid = '22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SELECT t_assert((SELECT count(*) = 0 FROM discord_connections), 'other org cannot see the connection');
SELECT t_fails(format('SELECT public.revoke_discord_connection(%L)', :'cid'), '%Connection not found%', 'other org cannot revoke');
RESET ROLE;
SET test.uid = '11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SELECT t_assert((SELECT count(*) = 1 FROM discord_connections), 'own org can see the connection');
SELECT t_fails('SELECT count(*) FROM discord_link_codes', '%permission denied%', 'codes are unreadable');
SELECT public.create_discord_link_code() ->> 'code' AS code2 \gset
RESET ROLE;

-- A new code replaces the old link
SET ROLE service_role;
SELECT public.redeem_discord_link_code(:'code2', '123456789012345678', 'Kyrie', '400000000000000001') ->> 'connection_id' AS cid2 \gset
RESET ROLE;
SELECT t_assert((SELECT revoked_at IS NOT NULL FROM discord_connections WHERE id = :'cid'), 're-link revokes the old connection');
SET ROLE service_role;
SELECT t_fails(format('SELECT public.discord_submit_report(%L, ''bug'', ''x'')', :'cid'), '%revoked%', 'revoked connection cannot report');
RESET ROLE;

-- Rate limit: 10 failed tries per server per 10 minutes
SET ROLE service_role;
SELECT t_assert((SELECT bool_and(public.redeem_discord_link_code('AAAAAAAA', '223456789012345678', 'g', '1') ->> 'error' = 'invalid_code') FROM generate_series(1, 10)), 'first 10 failures are invalid_code');
SELECT t_assert(public.redeem_discord_link_code('AAAAAAAA', '223456789012345678', 'g', '1') ->> 'error' = 'rate_limited', '11th try is rate limited');
RESET ROLE;
