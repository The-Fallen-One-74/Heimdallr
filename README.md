# Heimdallr Discord Bot

A Discord bot inspired by Heimdallr, the Norse God who watches over all 9 realms. This bot connects Discord servers to their existing Bifröst project management instances.

Each Discord server is linked to a Bifröst organization. Heimdallr then posts new calendar events to a notification channel, sends reminders before they start, tracks RSVPs through reactions, and lets members file bugs and feature requests straight into Bifröst.

## Features

- **Meetings** — schedule, reschedule, cancel and list Bifröst calendar events from Discord
- **Notifications** — new calendar events are announced in the configured channel (via Supabase webhook)
- **Reminders** — configurable reminders per event type (meetings, work sessions, social, training)
- **RSVPs** — members react ✅ / ❌ / ❓ on event notifications; `/attendees` shows the tally
- **Reports** — `/bug` and `/feature` create tasks in the organization's Bifröst backlog
- **API** — a small HTTP API for the Bifröst desktop app to read Discord data

## Commands

| Command | Description |
| --- | --- |
| `/ping` | Health check |
| `/about` | About Heimdallr |
| `/help` | List available commands |
| `/setup` | **[Admin]** Link this server to a Bifröst organization, notification channel and timezone |
| `/config` | **[Admin]** View the current configuration |
| `/reminders` | **[Admin]** Set reminder times for an event type |
| `/schedule` | Schedule a meeting |
| `/reschedule` | Change a meeting's date or time |
| `/cancel` | Cancel a meeting |
| `/meetings` | List upcoming meetings |
| `/attendees` | View RSVPs for a meeting notification |
| `/bug` | Report a bug in Bifröst |
| `/feature` | Submit a feature request |

## Getting Started

Requires Node.js 18 or newer.

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
| `GUILD_ID` | No | Default server for `npm run deploy:guild` |
| `LOG_LEVEL` | No | Winston log level (default `info`) |

### Webhooks

To announce new events, add a Supabase database webhook on `calendar_events` INSERT that posts to:

```
POST https://<your-host>/api/webhooks/calendar-events
x-webhook-secret: <WEBHOOK_SECRET>
```

The legacy `/api/webhooks/team-events` path is still accepted.

### Local state

Server configuration, sent reminders and event-to-message links are stored as JSON files under `config/` (git-ignored). Back this folder up when moving the bot to a new host. RSVPs are currently kept in memory only and reset when the bot restarts.

## Deployment

- [DigitalOcean](DIGITALOCEAN_DEPLOYMENT.md)
- [Raspberry Pi](RASPBERRY_PI_SETUP.md)

## Project Structure

```
src/
  index.js            Bot entry point
  commands/           Slash commands (meetings/, reports/)
  events/             Discord event handlers (reactions, interactions)
  services/           Bifröst client, config, events, reminders, RSVPs
  api/                Express API server and webhooks
  utils/              Logger and embed helpers
```

## License

MIT
