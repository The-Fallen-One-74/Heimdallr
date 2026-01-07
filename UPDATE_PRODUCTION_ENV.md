# Update Production Environment Variables

The bot's `.env` file on the DigitalOcean droplet is missing required environment variables for API authentication and webhook security.

## Steps to Update

### 1. SSH into the droplet

```bash
ssh heimdallr@<your-droplet-ip>
# Or if you set up the domain:
ssh heimdallr@heimdallr.kyriestudios.com
```

### 2. Edit the .env file

```bash
cd ~/Heimdallr
nano .env
```

### 3. Add the missing environment variables

Your `.env` file should look like this:

```env
DISCORD_TOKEN=<your-discord-bot-token>
CLIENT_ID=<your-discord-client-id>

# API Server Configuration
API_PORT=3001

# CORS Origins - Allow Electron app and web origins
DESKTOP_APP_ORIGIN=file://,app://,https://heimdallr.kyriestudios.com

# API Key for securing the API (must match desktop app VITE_DISCORD_API_KEY)
API_KEY=381e275ef77cbea322ed1133b69d89396fa6ceeb842f11f6411a906421fbc38b

# Webhook Secret for Supabase webhooks (must match Supabase webhook configuration)
WEBHOOK_SECRET=df10ibbf9ae20bd0G3d07fffd4
```

**Important:** Make sure `WEBHOOK_SECRET` has the capital `G` in the middle: `df10ibbf9ae20bd0G3d07fffd4`

Save and exit (Ctrl+X, Y, Enter)

### 4. Restart the bot

```bash
pm2 restart heimdallr
```

### 5. Verify the bot is running

```bash
pm2 logs heimdallr --lines 50
```

You should see:
- ✓ Heimdallr is watching!
- Heimdallr API server listening on port 3001
- API authentication: enabled

### 6. Test the API

```bash
# Test health endpoint (no auth required)
curl https://heimdallr.kyriestudios.com/health

# Test Discord guilds endpoint (requires API key)
curl -H "X-API-Key: 381e275ef77cbea322ed1133b69d89396fa6ceeb842f11f6411a906421fbc38b" \
  https://heimdallr.kyriestudios.com/api/discord/guilds
```

## What These Variables Do

- **API_KEY**: Secures the Discord API endpoints (`/api/discord/*`). The desktop app sends this key in the `X-API-Key` header to authenticate requests.

- **WEBHOOK_SECRET**: Secures the webhook endpoint (`/api/webhooks/team-events`). Supabase sends this secret in the `x-webhook-secret` header when triggering webhooks.

- **DESKTOP_APP_ORIGIN**: Configures CORS to allow requests from the Electron desktop app (`file://` and `app://` protocols) and the production web URL.

## Troubleshooting

### If you see "401 Unauthorized" errors:
- Verify `API_KEY` matches exactly in both bot `.env` and desktop app `.env`
- Make sure you restarted the bot after updating `.env`

### If webhook authentication fails:
- Verify `WEBHOOK_SECRET` matches exactly in both bot `.env` and Supabase webhook configuration
- Check for typos - the secret has a capital `G` in the middle
- Restart the bot after updating

### If CORS errors occur:
- Verify `DESKTOP_APP_ORIGIN` includes `file://` and `app://` for Electron apps
- For development testing, temporarily add `http://localhost:5173`
- Restart the bot after updating
