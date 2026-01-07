# Heimdallr DigitalOcean Deployment Guide

This guide walks you through deploying Heimdallr bot to a DigitalOcean droplet for production use.

## Prerequisites

- DigitalOcean account
- Domain name (e.g., `kyriestudios.com`)
- Discord bot token
- SSH client

## Step 1: Create DigitalOcean Droplet

1. **Log into DigitalOcean** and click "Create" → "Droplets"

2. **Choose Configuration:**
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic
   - **CPU Options**: Regular (Disk type: SSD)
   - **Size**: $6/month (1 GB RAM, 1 vCPU, 25 GB SSD)
   - **Datacenter**: Choose closest to your users
   - **Authentication**: SSH Key (recommended) or Password
   - **Hostname**: `heimdallr-bot` or similar

3. **Click "Create Droplet"** and wait for it to provision (~60 seconds)

4. **Note your droplet's IP address** (e.g., `123.45.67.89`)

## Step 2: Configure Domain DNS

1. **Go to your domain registrar** (Namecheap, GoDaddy, etc.)

2. **Add an A record:**
   - **Type**: A
   - **Host**: `api` (or `heimdallr`)
   - **Value**: Your droplet IP address
   - **TTL**: Automatic or 300

3. **Result**: `api.kyriestudios.com` → `123.45.67.89`

4. **Wait for DNS propagation** (5-30 minutes)
   - Test with: `ping api.kyriestudios.com`

## Step 3: Initial Server Setup

SSH into your droplet:

```bash
ssh root@123.45.67.89
```

### Update system packages:

```bash
apt update && apt upgrade -y
```

### Install Node.js 20.x:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version  # Should show v20.x.x
npm --version
```

### Install PM2 (process manager):

```bash
npm install -g pm2
```

### Install Git:

```bash
apt install -y git
```

### Create a non-root user (recommended):

```bash
adduser heimdallr
usermod -aG sudo heimdallr
su - heimdallr
```

## Step 4: Clone and Setup Heimdallr

```bash
cd ~
git clone https://github.com/The-Fallen-One-74/Heimdallr.git
cd Heimdallr
npm install
```

### Create .env file:

```bash
nano .env
```

Add the following (replace with your values):

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here

# API Server Configuration
API_PORT=3001

# CORS Origins - Allow Electron app and web origins
# For production: Use file:// and app:// for Electron apps
# For development: Add http://localhost:5173 for testing
DESKTOP_APP_ORIGIN=file://,app://,https://app.kyriestudios.com

# API Key for securing the API
API_KEY=generate_a_secure_random_key_here

# Note: Supabase credentials are per-guild via /setup command
# Each organization configures their own Supabase database through Discord
```

**Generate a secure API key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Important Notes:**
- `file://` and `app://` allow packaged Electron apps to connect
- Remove `http://localhost` origins in production (only for development)
- Each organization uses their own Supabase database (configured via `/setup`)
- This is a **multi-tenant** setup - one bot serves multiple organizations

Save and exit (Ctrl+X, Y, Enter)

## Step 5: Start Bot with PM2

```bash
pm2 start src/index.js --name heimdallr
pm2 save
pm2 startup
```

Copy and run the command that PM2 outputs (it will look like):
```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u heimdallr --hp /home/heimdallr
```

### Check bot status:

```bash
pm2 status
pm2 logs heimdallr
```

You should see:
- ✓ Heimdallr is watching!
- Heimdallr API server listening on port 3001

## Step 6: Install and Configure Nginx

### Install Nginx:

```bash
sudo apt install -y nginx
```

### Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/heimdallr
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name api.kyriestudios.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/heimdallr /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

### Test HTTP access:

```bash
curl http://api.kyriestudios.com/health
```

Should return: `{"status":"ok","bot":"Heimdallr#9538",...}`

## Step 7: Setup SSL with Let's Encrypt

### Install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Get SSL certificate:

```bash
sudo certbot --nginx -d api.kyriestudios.com
```

Follow the prompts:
- Enter email address
- Agree to terms
- Choose to redirect HTTP to HTTPS (option 2)

### Test SSL:

```bash
curl https://api.kyriestudios.com/health
```

### Auto-renewal is configured automatically. Test it:

```bash
sudo certbot renew --dry-run
```

## Step 8: Configure Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## Step 9: Update Desktop App Configuration

### For Production Builds:

In your desktop app repository, update `.env.production`:

```env
VITE_DISCORD_API_URL=https://api.kyriestudios.com
VITE_DISCORD_API_KEY=your_api_key_from_step_4
```

### For Development:

Keep a separate `.env.development` for local testing:

```env
VITE_DISCORD_API_URL=http://localhost:3001
VITE_DISCORD_API_KEY=your_dev_api_key
```

### For Distribution:

When packaging the desktop app for users, the production URL will be hardcoded. All users will connect to your centralized bot at `https://api.kyriestudios.com`.

**Multi-Tenant Architecture:**
- ✅ One bot instance serves all organizations
- ✅ Each organization configures their own Supabase via `/setup` in Discord
- ✅ All desktop apps connect to the same API endpoint
- ✅ Bot routes requests to the correct organization's database

## Step 10: Test End-to-End

1. **Restart desktop app** to pick up new environment variables

2. **Open Event Management Modal** in the desktop app

3. **Check browser console** - should see successful API calls to `https://api.kyriestudios.com`

4. **Create a test event** with Discord integration

5. **Verify in Discord** that the notification appears

## Maintenance Commands

### View logs:
```bash
pm2 logs heimdallr
pm2 logs heimdallr --lines 100
```

### Restart bot:
```bash
pm2 restart heimdallr
```

### Update bot code:
```bash
cd ~/Heimdallr
git pull
npm install
pm2 restart heimdallr
```

### Monitor resources:
```bash
pm2 monit
htop
```

### Check Nginx logs:
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## Troubleshooting

### Bot won't start:
```bash
pm2 logs heimdallr --err
# Check for missing environment variables or syntax errors
```

### API not accessible:
```bash
# Check if bot is running
pm2 status

# Check if Nginx is running
sudo systemctl status nginx

# Check firewall
sudo ufw status

# Test local connection
curl http://localhost:3001/health
```

### SSL certificate issues:
```bash
sudo certbot certificates
sudo certbot renew --force-renewal
```

### CORS errors:
- Check `DESKTOP_APP_ORIGIN` in `.env` includes your app's origin
- For Electron apps, ensure `file://` and `app://` are included
- For development, add `http://localhost:5173` temporarily
- Restart bot after changing: `pm2 restart heimdallr`

### Multi-tenant issues:
- Each organization must run `/setup` in their Discord server
- Check `config/guilds.json` to see configured guilds
- Verify each guild has `supabase_url` and `supabase_service_role_key`
- Bot logs will show: "⚠️ Guild XXX missing Supabase credentials" if not configured

## Security Best Practices

1. **Keep system updated:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Use SSH keys** instead of passwords

3. **Change default SSH port** (optional but recommended)

4. **Enable automatic security updates:**
   ```bash
   sudo apt install unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```

5. **Monitor logs regularly** for suspicious activity

6. **Backup guild configurations:**
   ```bash
   # Backup config/guilds.json regularly
   cp ~/Heimdallr/config/guilds.json ~/backups/guilds-$(date +%Y%m%d).json
   ```

## Cost Estimate

- **DigitalOcean Droplet**: $6/month (1 GB RAM)
- **Domain**: $10-15/year (if you don't have one)
- **SSL Certificate**: Free (Let's Encrypt)

**Total**: ~$6-7/month

## Next Steps

1. Set up monitoring (optional): DigitalOcean Monitoring, UptimeRobot
2. Configure automated backups in DigitalOcean
3. Set up log rotation for PM2 logs
4. Consider upgrading droplet if you get many users

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs heimdallr`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify DNS: `dig api.kyriestudios.com`
4. Test API locally: `curl http://localhost:3001/health`
