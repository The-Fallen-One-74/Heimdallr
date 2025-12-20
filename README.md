# Heimdallr Discord Bot

A Discord bot inspired by Heimdallr, the Norse God who watches over all 9 realms. This bot connects Discord servers to their existing Bifröst project management instances.

## Architecture

**Multi-Tenant Design**: Heimdallr is a standalone bot that can be used by multiple Discord servers, each connecting to their own existing Bifröst Supabase workspace.

```
Discord Server A → Heimdallr Bot → Bifröst Supabase A
Discord Server B → Heimdallr Bot → Bifröst Supabase B
Discord Server C → Heimdallr Bot → Bifröst Supabase C
```

Guild configurations are stored locally in `config/guilds.json`.

## Setup for Bot Owners

### 1. Create Your Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application named "Heimdallr"
3. Go to the "Bot" section and create a bot
4. Copy the token and add it to your `.env` file
5. Enable necessary intents (Presence, Server Members, Message Content)
6. Go to OAuth2 > URL Generator, select `bot` and `applications.commands` scopes
7. Select the permissions your bot needs and use the generated URL to invite it

### 2. Install and Run

```bash
npm install
node src/deploy-commands.js
npm start
```

That's it! No central database needed - each guild connects to their own existing Bifröst Supabase instance.

## Setup for Discord Server Admins

**Prerequisites**: You must already have Bifröst set up with a Supabase project.

Once Heimdallr is invited to your server:

### 1. Get Your Bifröst Credentials

From your existing Bifröst Supabase project:
- Your Supabase URL (e.g., `https://xxxxx.supabase.co`)
- Your Supabase anon key

### 2. Configure Heimdallr

Run the setup command in Discord:

```
/setup
  supabase_url: https://your-project.supabase.co
  supabase_key: your-anon-key
  notification_channel: #notifications
  timezone: America/New_York
```

### 3. Verify Configuration

```
/config
```

That's it! Heimdallr will now watch your existing Bifröst workspace and send notifications to your Discord server.

## Commands

### For Everyone
- `/ping` - Check if Heimdallr is watching
- `/about` - Learn about Heimdallr
- `/help` - Show available commands

### For Admins
- `/setup` - Configure Heimdallr to connect to your Bifröst instance
- `/config` - View current configuration

## Features (Coming Soon)

- Meeting notifications and reminders
- Sprint event notifications
- Holiday announcements
- Time tracking integration
- Task notifications

## Development

Run in watch mode:
```bash
npm run dev
```

## Environment Variables

```env
# Required
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id

# Optional
LOG_LEVEL=info
```

## Security Notes

- Each guild's Bifröst credentials are stored locally in `config/guilds.json`
- Keep `config/guilds.json` secure and never commit it to git
- Credentials are never exposed in Discord messages
- Only server administrators can configure the bot
- Each guild can only access their own Bifröst data
