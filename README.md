# Heimdallr Discord Bot

A Discord bot inspired by Heimdallr, the Norse God who watches over all 9 realms. This bot connects Discord servers to their existing Bifröst project management instances.

Each Discord server is linked to a Bifröst organization. Heimdallr then posts new calendar events to a notification channel, sends reminders before they start, collects sign-ups with buttons, and lets members file bugs and feature requests straight into Bifröst.

## Features

- **Meetings** — schedule, reschedule, cancel and list Bifröst calendar events from Discord. Times are entered in the server timezone set in `/setup` and shown to each member in their own timezone
- **Notifications** — new calendar events are announced in the configured channel (via Supabase webhook)
- **Reminders** — configurable reminders per event type (meeting, company, retrospective, holiday, other)
- **Discord Events** — timed meetings also appear in the server's Events tab, and members who click Interested are tagged in reminders. Needs the bot's Manage Events permission; turn off with `/setup discord_events:false`
- **Announcements** — Bifröst announcements are posted to the notification channel (via Supabase webhook)
- **Sprint updates** — a post when a sprint starts (goal, dates, task count) and when it completes (done vs. not finished)
- **Department roles** — `/departments` maps a Bifröst department to a Discord role, which is tagged on that department's meetings, reminders and milestones. The role must be mentionable, or the bot needs the Mention @everyone permission
- **Daily post** — each morning, milestones due in the next 3 days and (optional) who has approved time off. Names only, never the type or reason. Configure with `/daily`
- **Sign-ups** — event posts and reminders have Join, Maybe and Can't buttons. Reminders tag everyone who chose Join or Maybe, and `/attendees` lists the answers. Holidays have no buttons
- **Reports** — `/bug` and `/feature` create tasks on the project chosen with `/reports`. Bugs start in the backlog and features in Submitted, tagged `discord`. When a report moves on the board (fixed, approved, shipped, declined and so on), the bot replies under the original post and tags the reporter
- **API** — a small HTTP API for the Bifröst desktop app to read Discord data

## Commands

| Command | Description |
| --- | --- |
| `/ping` | Health check |
| `/about` | About Heimdallr |
| `/help` | List available commands |
| `/setup` | **[Admin]** Link this server to a Bifröst organization with a link code, and set the notification channel and timezone |
| `/config` | **[Admin]** View the current configuration |
| `/reminders` | **[Admin]** Set reminder times for an event type |
| `/departments` | **[Admin]** Tag a Discord role for a Bifröst department |
| `/daily` | **[Admin]** Configure the daily post (hour, out today, milestones, preview) |
| `/reports` | **[Admin]** Choose the Bifröst project that receives `/bug` and `/feature` reports |
| `/schedule` | Schedule a meeting |
| `/reschedule` | Change a meeting's date or time |
| `/cancel` | Cancel a meeting |
| `/meetings` | List upcoming meetings |
| `/attendees` | See who signed up for an event |
| `/bug` | Report a bug in Bifröst |
| `/feature` | Submit a feature request |

## Getting Started

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run deploy         # register slash commands globally
npm start
```

For development, `npm run dev` restarts on file changes, and `npm run deploy:guild <guild_id>` registers commands to a single server instantly (global commands can take up to an hour to appear).

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `CLIENT_ID` | Yes | Discord application ID |
| `SUPABASE_URL` | Yes | Bifröst Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `API_PORT` | No | API server port (default `3001`) |
| `API_KEY` | No | Key required in `x-api-key` for `/api/discord` routes. If unset, the API is unauthenticated |
| `WEBHOOK_SECRET` | No | Secret expected in `x-webhook-secret` for webhooks. If unset, webhooks are disabled |
| `DESKTOP_APP_ORIGIN` | No | Comma-separated CORS origins (default `http://localhost:5173`) |
| `BOT_USER_ID` | No | Bifröst user recorded as the creator of meetings made with `/schedule`. Defaults to the organization's Owner |
| `GUILD_ID` | No | Default server for `npm run deploy:guild` |
| `LOG_LEVEL` | No | Winston log level (default `info`) |

### Linking a server

In Bifröst, **Org Settings → Discord → Connect Discord** shows a one-time code such as `BFR-7K2Q-M9XD`. A server admin then runs:

```
/setup notification_channel:#announcements code:BFR-7K2Q-M9XD timezone:Eastern
```

Bifröst checks the code and records the link, and `/bug`, `/feature` and `/reports` go through that link. Running `/setup` again without a code only changes the channel, timezone and Discord Events setting.

Servers set up earlier with an organization ID need `/setup` again with a code. The Bifröst side is drafted in [`docs/bifrost/20261020_discord_link_step1.sql`](docs/bifrost/20261020_discord_link_step1.sql) and is not applied yet, so linking works only once that ships.

### Webhooks

Add Supabase database webhooks that post to the bot with header `x-webhook-secret: <WEBHOOK_SECRET>`:

| Table | Events | URL |
| --- | --- | --- |
| `calendar_events` | INSERT | `https://<your-host>/api/webhooks/calendar-events` |
| `announcements` | INSERT | `https://<your-host>/api/webhooks/announcements` |
| `sprints` | INSERT, UPDATE | `https://<your-host>/api/webhooks/sprints` |
| `tasks` | UPDATE | `https://<your-host>/api/webhooks/tasks` |

The legacy `/api/webhooks/team-events` path is still accepted.

### Local state

Server configuration, sent reminders, sign-ups, report posts and Discord event links are stored as JSON files under `config/` (git-ignored), or under `HEIMDALLR_STATE_DIR` when set. Back this folder up when moving the bot to a new host.

## Deployment

- [DigitalOcean](DIGITALOCEAN_DEPLOYMENT.md)
- [Raspberry Pi](RASPBERRY_PI_SETUP.md)

## Project Structure

```
src/
  index.js            Bot entry point
  commands/           Slash commands (meetings/, reports/)
  events/             Discord event handlers (reactions, interactions)
  services/           Bifröst client, config, events, reminders, sign-ups
  interactions/       Button handlers
  api/                Express API server and webhooks
  utils/              Logger and embed helpers
```

## License

MIT
