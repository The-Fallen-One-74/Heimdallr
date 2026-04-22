# Heimdallr Bifrost-V2 Rework

## Overview
Rework Heimdallr Discord bot to use Bifrost-V2's single Supabase database with organization-scoped queries instead of per-guild Supabase instances.

## Architecture
- Single Supabase connection (URL + service role key in `.env`)
- Each Discord guild maps to a Bifrost `organization_id` via `/setup`
- Guild configs stored in `config/guilds.json` (guild_id → organization_id + notification_channel_id + timezone)
- All queries filter by the guild's linked organization_id

## Bifrost-V2 Schema (relevant tables)
- `organizations` — id, name
- `projects` — id, name, organization_id
- `calendar_events` — id, title, type, event_date, event_time, organization_id, department_id
- `sprints` — id, name, start_date, end_date, project_id
- `users` — id, first_name, last_name, organization_id
- `notifications` — id, user_id, type, message, read

## Commands to Keep
1. `/ping` — health check
2. `/about` — bot info
3. `/help` — command list
4. `/setup` — link guild to Bifrost org (admin only): org_id, notification_channel, timezone
5. `/config` — view current config (admin only)
6. `/schedule` — create a calendar event
7. `/cancel` — cancel a calendar event
8. `/reschedule` — change date/time of an event
9. `/meetings` — list upcoming meetings
10. `/attendees` — view who's attending (placeholder for signup feature)
11. `/reminders` — configure reminder times (admin only)

## Commands to Remove
- `/today`, `/week`, `/month` — calendar views (not needed for v1)
- `/holidays` — holidays are computed in Bifrost, not in DB
- `/sprint` — sprint info (not needed for v1)
- `/digest` — event digest (not needed for v1)

## Services to Rework
- `bifrostClient.js` → single client from `.env`, no per-guild clients
- `configManager.js` → store organization_id instead of supabase_url/key
- `eventManager.js` → query calendar_events by organization_id
- `notificationService.js` → use single supabase client
- `reminderScheduler.js` → query calendar_events instead of team_events

## Services/Files to Remove
- `supabase.js` — dead stub
- `realtimeListener.js` — disabled, using webhooks
- `rsvpTracker.js` — will be rebuilt for signup feature later
- `reminderTracker.js` — keep (tracks sent reminders)

## Webhook Rework
- Webhook endpoint stays at `/api/webhooks/team-events`
- Rename to `/api/webhooks/calendar-events`
- Trigger on `calendar_events` INSERT instead of `team_events`
- Filter by organization_id → find matching guild → send notification
