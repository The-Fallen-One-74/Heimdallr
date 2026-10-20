# Bifröst changes for Heimdallr

Heimdallr's bot features are built ahead of Bifröst. This is the list of what Bifröst needs so they work end to end. Nothing here has been applied to Bifröst. It all waits until the release gate is done.

The SQL files are drafts for `bifrost-v2/supabase/migrations/`. `tests/run.sh` applies them to a throwaway local Postgres with a small stand-in schema and runs their checks:

```bash
PGHOST=/var/run/postgresql PGUSER=postgres docs/bifrost/tests/run.sh
```

## Step 1: link and reports

Bot side: done (`/setup code:`, `/bug`, `/feature`, `/reports`). The bot also reads `discord_connections.revoked_at` before it posts to a server, and unlinks the server when it was disconnected in Bifröst. Until the table exists it keeps posting as before.

- [ ] Apply [`20261020_discord_link_step1.sql`](20261020_discord_link_step1.sql) Part A: link codes, connections, `redeem_discord_link_code`, `discord_submit_report`, `discord_set_report_project`, `revoke_discord_connection`
- [ ] Apply Part B, the dedicated owner role and `enforce_work_item_insert` branch, fitted to the task-boundary migration. Without it, `/bug` and `/feature` fail once that migration ships
- [ ] Org Settings → Discord panel: **Connect Discord** (calls `create_discord_link_code`, shows the code once), the list of linked servers, **Disconnect**
- [ ] Remove the old Organization ID box and its "use this ID for the Heimdallr Discord bot" hint from Org Settings

## Report status replies

Bot side: done (`POST /api/webhooks/tasks`). No migration needed.

- [ ] Supabase database webhook on `tasks`, UPDATE, to `https://<bot-host>/api/webhooks/tasks` with header `x-webhook-secret`

## Step 2: events and sign-ups

Bot side: sign-up buttons are built and keep answers in `config/signups.json`. Switching them to Bifröst is a follow-up bot change.

- [ ] Apply [`20261020_discord_link_step2.sql`](20261020_discord_link_step2.sql): `calendar_event_signups`, `discord_event_posts`, `discord_set_signup`, `discord_list_signups`, `discord_create/update/delete_event`, `discord_record_event_post`
- [ ] Show sign-ups on the event in the Bifröst calendar (read `calendar_event_signups`)
- [ ] Supabase database webhooks on `calendar_events` UPDATE and DELETE (INSERT already exists), if reschedules and cancels made in Bifröst should update Discord
- [ ] Bot follow-up: buttons, `/attendees` and reminders call the step 2 functions instead of the local file; `/schedule`, `/reschedule` and `/cancel` use `discord_*_event`

## Step 3: department roles and Discord accounts

Bot side: `/departments` works today from the bot's local config. Linking accounts needs a new bot command.

- [ ] Apply [`20261020_discord_link_step3.sql`](20261020_discord_link_step3.sql): `discord_role_mappings`, `set_discord_role_mapping`, `discord_list_role_mappings`, `users.discord_user_id`, account link codes
- [ ] Org Settings → Discord: department → role picker (roles come from the bot's `GET /api/discord/guilds/:id/roles`)
- [ ] Profile → **Connect Discord**: calls `create_discord_account_link_code` and shows a code such as `ME-7K2Q-M9XD`; **Disconnect** calls `unlink_my_discord_account`
- [ ] Bot follow-up: a `/linkme code:` command that calls `redeem_discord_account_link_code`, and `/departments` reading `discord_list_role_mappings`

## Open questions

- Is `org.settings` the right permission to create link codes, or Owner only?
- Should the role mapping live in Org Settings, as drafted, or stay in `/departments`?
- On a public server, can anyone file `/bug` and `/feature`, or only members with a chosen role?
- Is the Discord integration on every plan, or tied to a tier?
