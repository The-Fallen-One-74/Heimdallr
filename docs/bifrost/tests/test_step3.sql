-- Step 3: department roles and Discord accounts (run after test_step2.sql)
\set ON_ERROR_STOP 1
SELECT id AS cid FROM discord_connections WHERE revoked_at IS NULL AND organization_id = 1 \gset

-- Role mapping from Org Settings
SET test.uid = '11111111-1111-1111-1111-111111111111'; SET test.perm = 'yes';
SET ROLE authenticated;
SELECT public.set_discord_role_mapping(:'cid', 1, '700000000000000001');
SELECT public.set_discord_role_mapping(:'cid', 1, '700000000000000002');
SELECT t_fails(format('SELECT public.set_discord_role_mapping(%L, 2, ''700000000000000003'')', :'cid'), '%not in this organization%', 'department must be in the org');
SELECT t_assert((SELECT count(*) = 1 FROM discord_role_mappings), 'admin sees the mapping');
RESET ROLE;
SET test.perm = 'no';
SET ROLE authenticated;
SELECT t_fails(format('SELECT public.set_discord_role_mapping(%L, 1, NULL)', :'cid'), '%Connection not found%', 'mapping needs org.settings');
RESET ROLE;
SET ROLE service_role;
SELECT t_assert((SELECT discord_role_id = '700000000000000002' FROM public.discord_list_role_mappings(:'cid') WHERE department_id = 1), 'bot reads the latest mapping');
RESET ROLE;

-- Mia answered in Bifröst first, then links Discord
SET ROLE service_role;
SELECT public.discord_set_signup(:'cid', 1, '400000000000000009', 'maybe');
RESET ROLE;
SET test.uid = '33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
SELECT public.create_discord_account_link_code() ->> 'code' AS mcode \gset
RESET ROLE;
SELECT t_assert(:'mcode' ~ '^ME-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$', 'account code format');
SET ROLE service_role;
SELECT t_assert(public.redeem_discord_account_link_code(:'cid', 'ME-ZZZZ-ZZZZ', '400000000000000009') ->> 'error' = 'invalid_code', 'wrong account code is refused');
SELECT t_assert((public.redeem_discord_account_link_code(:'cid', :'mcode', '400000000000000009') ->> 'ok')::boolean, 'account code links Discord');
SELECT t_assert(public.redeem_discord_account_link_code(:'cid', :'mcode', '400000000000000009') ->> 'error' = 'invalid_code', 'account code works once');
RESET ROLE;
SELECT t_assert((SELECT discord_user_id = '400000000000000009' FROM users WHERE id = '33333333-3333-3333-3333-333333333333'), 'Discord ID saved on the user');
SELECT t_assert((SELECT user_id = '33333333-3333-3333-3333-333333333333' FROM calendar_event_signups WHERE discord_user_id = '400000000000000009'), 'earlier sign-up now shows as the user');

-- New sign-ups fill user_id; Eve (other org) linking does not attach Kyrie sign-ups
SET ROLE service_role;
SELECT public.discord_set_signup(:'cid', 1, '400000000000000009', 'going');
RESET ROLE;
SELECT t_assert((SELECT status = 'going' AND user_id IS NOT NULL FROM calendar_event_signups WHERE discord_user_id = '400000000000000009'), 'sign-up keeps the linked user');

SET ROLE service_role;
SELECT public.discord_set_signup(:'cid', 1, '400000000000000008', 'going');
RESET ROLE;
SET test.uid = '22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SELECT public.create_discord_account_link_code() ->> 'code' AS ecode \gset
RESET ROLE;
SET ROLE service_role;
SELECT public.redeem_discord_account_link_code(:'cid', :'ecode', '400000000000000008');
RESET ROLE;
SELECT t_assert((SELECT user_id IS NULL FROM calendar_event_signups WHERE discord_user_id = '400000000000000008'), 'sign-ups in orgs the user is not in stay unlinked');

-- Unlinking
SET test.uid = '33333333-3333-3333-3333-333333333333';
SET ROLE authenticated;
SELECT public.unlink_my_discord_account();
RESET ROLE;
SELECT t_assert((SELECT discord_user_id IS NULL FROM users WHERE id = '33333333-3333-3333-3333-333333333333'), 'unlink clears the Discord ID');
SELECT t_assert((SELECT user_id IS NULL FROM calendar_event_signups WHERE discord_user_id = '400000000000000009'), 'unlink detaches Discord sign-ups');
