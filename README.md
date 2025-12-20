# Heimdallr Discord Bot

A Discord bot inspired by Heimdallr, the Norse God who watches over all 9 realms.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file based on `.env.example` and add your Discord bot token and client ID

3. Run the bot:
   ```
   npm start
   ```

## Development

Run in watch mode:
```
npm run dev
```

## Getting Your Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the token and add it to your `.env` file
5. Enable necessary intents (Presence, Server Members, Message Content)
6. Go to OAuth2 > URL Generator, select `bot` and `applications.commands` scopes
7. Select the permissions your bot needs and use the generated URL to invite it
