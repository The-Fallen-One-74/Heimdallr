# Heimdallr API Server Setup

## Overview

Heimdallr now includes an Express API server that provides endpoints for the Bifröst desktop app to fetch Discord data (guilds and roles).

## Installation

Install the new dependencies:

```bash
cd ~/bots/Heimdallr
npm install
```

This will install:
- `express` - Web framework for the API server
- `cors` - CORS middleware for cross-origin requests

## Configuration

Add these environment variables to your `.env` file:

```env
# API Server Configuration
API_PORT=3001
API_KEY=your_secure_api_key_here
DESKTOP_APP_ORIGIN=http://localhost:5173
```

### Environment Variables:

- **API_PORT** (optional, default: 3001)
  - Port the API server will listen on
  
- **API_KEY** (optional, recommended for production)
  - Secure API key for authentication
  - If not set, API runs in development mode without authentication
  - Generate a secure key: `openssl rand -hex 32`
  
- **DESKTOP_APP_ORIGIN** (optional, default: http://localhost:5173)
  - Origin URL of the desktop app for CORS
  - Update this to your desktop app's URL

## API Endpoints

### Health Check
```
GET /health
```
Returns bot status and uptime. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "bot": "Heimdallr#9538",
  "guilds": 2,
  "uptime": 12345.67
}
```

### Get Guilds
```
GET /api/discord/guilds
```
Returns all Discord servers (guilds) the bot is in.

**Headers:**
```
X-API-Key: your_api_key_here
```

**Response:**
```json
[
  {
    "id": "1450149089542148251",
    "name": "Kyrie Studios",
    "icon": "a1b2c3d4e5f6",
    "memberCount": 42
  }
]
```

### Get Roles
```
GET /api/discord/guilds/:guildId/roles
```
Returns all roles for a specific guild (excluding @everyone).

**Headers:**
```
X-API-Key: your_api_key_here
```

**Response:**
```json
[
  {
    "id": "1234567890",
    "name": "Admin",
    "color": 16711680,
    "position": 5,
    "mentionable": true
  },
  {
    "id": "0987654321",
    "name": "Member",
    "color": 0,
    "position": 1,
    "mentionable": false
  }
]
```

## Starting the Server

The API server starts automatically when Heimdallr starts:

```bash
npm start
```

You should see:
```
[info]: Heimdallr API server listening on port 3001
[info]: CORS enabled for origin: http://localhost:5173
[info]: API authentication: enabled
```

## Testing the API

### Test Health Endpoint
```bash
curl http://localhost:3001/health
```

### Test Guilds Endpoint
```bash
curl -H "X-API-Key: your_api_key_here" http://localhost:3001/api/discord/guilds
```

### Test Roles Endpoint
```bash
curl -H "X-API-Key: your_api_key_here" http://localhost:3001/api/discord/guilds/1450149089542148251/roles
```

## Security

### API Key Authentication

- All `/api/*` endpoints require the `X-API-Key` header
- If `API_KEY` is not set in `.env`, authentication is disabled (development mode)
- **Always set API_KEY in production!**

### CORS

- Only the configured `DESKTOP_APP_ORIGIN` can access the API
- Prevents unauthorized web apps from accessing the API

### Recommended Production Setup

1. **Generate a secure API key:**
   ```bash
   openssl rand -hex 32
   ```

2. **Add to `.env`:**
   ```env
   API_KEY=your_generated_key_here
   DESKTOP_APP_ORIGIN=https://your-desktop-app-url
   ```

3. **Restart Heimdallr:**
   ```bash
   pm2 restart heimdallr
   ```

## Troubleshooting

### API server not starting

Check logs:
```bash
pm2 logs heimdallr
```

Common issues:
- Port 3001 already in use → Change `API_PORT` in `.env`
- Missing dependencies → Run `npm install`

### CORS errors

If the desktop app gets CORS errors:
- Verify `DESKTOP_APP_ORIGIN` matches the desktop app's URL
- Check browser console for the exact origin being used
- Update `.env` and restart Heimdallr

### 401 Unauthorized

- Verify `X-API-Key` header is being sent
- Verify the API key matches the one in `.env`
- Check Heimdallr logs for authentication errors

### 503 Discord bot not ready

- Wait a few seconds for the bot to fully connect to Discord
- Check bot status with `/health` endpoint
- Verify bot is online in Discord

## Deployment on Raspberry Pi

After pulling the latest code:

```bash
cd ~/bots/Heimdallr
git pull
npm install
pm2 restart heimdallr
pm2 logs heimdallr
```

Verify the API is running:
```bash
curl http://localhost:3001/health
```

## Next Steps

After setting up the API:
1. Configure the desktop app to use the API
2. Add `VITE_DISCORD_API_URL` and `VITE_DISCORD_API_KEY` to desktop app `.env`
3. Test event creation with Discord integration
