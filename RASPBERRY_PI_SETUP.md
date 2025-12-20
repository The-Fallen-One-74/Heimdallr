# Heimdallr - Raspberry Pi Deployment Guide

This guide will help you deploy Heimdallr on your Raspberry Pi to run 24/7.

## Prerequisites

- Raspberry Pi (any model with network connectivity)
- Raspberry Pi OS installed
- SSH access to your Pi
- Node.js 16+ installed on your Pi

## Step 1: Install Node.js (if not already installed)

SSH into your Raspberry Pi and run:

```bash
# Check if Node.js is installed
node --version

# If not installed or version is below 16, install Node.js 18:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

## Step 2: Transfer Files to Raspberry Pi

From your Windows machine, you can use one of these methods:

### Option A: Using Git (Recommended)

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. On your Pi, clone the repository:

```bash
cd ~
git clone <your-repo-url> heimdallr
cd heimdallr
```

### Option B: Using SCP (Secure Copy)

From your Windows machine (using PowerShell or Command Prompt):

```powershell
# Replace <pi-ip> with your Pi's IP address
scp -r E:\Bots\Heimdallr pi@<pi-ip>:~/heimdallr
```

### Option C: Using WinSCP or FileZilla

Use a GUI tool like WinSCP or FileZilla to transfer the entire `Heimdallr` folder to your Pi.

## Step 3: Install Dependencies on Raspberry Pi

SSH into your Pi and run:

```bash
cd ~/heimdallr
npm install
```

## Step 4: Configure Environment Variables

Create your `.env` file on the Pi:

```bash
cd ~/heimdallr
nano .env
```

Add your configuration:

```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
```

Save and exit (Ctrl+X, then Y, then Enter).

## Step 5: Deploy Commands

```bash
npm run deploy
```

## Step 6: Test the Bot

Run the bot manually to test:

```bash
npm start
```

Press Ctrl+C to stop when you're done testing.

## Step 7: Set Up Bot to Run 24/7

### Option A: Using PM2 (Recommended)

PM2 is a process manager that keeps your bot running and restarts it if it crashes.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the bot with PM2
pm2 start src/index.js --name heimdallr

# Save the PM2 process list
pm2 save

# Set PM2 to start on boot
pm2 startup
# Follow the instructions shown (copy/paste the command it gives you)

# View bot status
pm2 status

# View bot logs
pm2 logs heimdallr

# Restart bot
pm2 restart heimdallr

# Stop bot
pm2 stop heimdallr
```

### Option B: Using systemd Service

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/heimdallr.service
```

Add this content (replace `pi` with your username if different):

```ini
[Unit]
Description=Heimdallr Discord Bot
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/heimdallr
ExecStart=/usr/bin/node /home/pi/heimdallr/src/index.js
Restart=always
RestartSec=10
StandardOutput=append:/home/pi/heimdallr/logs/combined.log
StandardError=append:/home/pi/heimdallr/logs/error.log

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable heimdallr

# Start the service
sudo systemctl start heimdallr

# Check status
sudo systemctl status heimdallr

# View logs
journalctl -u heimdallr -f

# Restart service
sudo systemctl restart heimdallr

# Stop service
sudo systemctl stop heimdallr
```

## Useful Commands

### PM2 Commands
```bash
pm2 list                    # List all processes
pm2 logs heimdallr          # View logs
pm2 logs heimdallr --lines 100  # View last 100 lines
pm2 restart heimdallr       # Restart bot
pm2 stop heimdallr          # Stop bot
pm2 delete heimdallr        # Remove from PM2
pm2 monit                   # Monitor CPU/Memory usage
```

### systemd Commands
```bash
sudo systemctl status heimdallr     # Check status
sudo systemctl restart heimdallr    # Restart
sudo systemctl stop heimdallr       # Stop
sudo systemctl start heimdallr      # Start
journalctl -u heimdallr -f          # Follow logs
journalctl -u heimdallr --since today  # Today's logs
```

## Updating the Bot

When you make changes to the code:

### If using Git:
```bash
cd ~/heimdallr
git pull
npm install  # If package.json changed
npm run deploy  # If commands changed
pm2 restart heimdallr  # or sudo systemctl restart heimdallr
```

### If using SCP:
1. Transfer updated files from Windows to Pi
2. SSH into Pi and run:
```bash
cd ~/heimdallr
npm install  # If package.json changed
npm run deploy  # If commands changed
pm2 restart heimdallr  # or sudo systemctl restart heimdallr
```

## Monitoring

### Check if bot is running:
```bash
# With PM2
pm2 status

# With systemd
sudo systemctl status heimdallr

# Check process
ps aux | grep node
```

### View logs:
```bash
# Application logs
tail -f ~/heimdallr/logs/combined.log
tail -f ~/heimdallr/logs/error.log

# PM2 logs
pm2 logs heimdallr

# systemd logs
journalctl -u heimdallr -f
```

## Troubleshooting

### Bot won't start:
```bash
# Check Node.js version
node --version  # Should be 16+

# Check for errors
npm start

# Check logs
cat ~/heimdallr/logs/error.log
```

### Permission issues:
```bash
# Make sure you own the files
sudo chown -R pi:pi ~/heimdallr

# Make sure logs directory exists
mkdir -p ~/heimdallr/logs
```

### Out of memory:
If your Pi runs out of memory, you can increase swap space:
```bash
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Change CONF_SWAPSIZE=100 to CONF_SWAPSIZE=1024
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

## Security Tips

1. **Keep your Pi updated:**
```bash
sudo apt update && sudo apt upgrade -y
```

2. **Secure your .env file:**
```bash
chmod 600 ~/heimdallr/.env
```

3. **Use SSH keys instead of passwords**

4. **Set up a firewall:**
```bash
sudo apt install ufw
sudo ufw allow ssh
sudo ufw enable
```

## Performance Tips

- Use PM2's cluster mode if you have multiple cores (not usually needed for Discord bots)
- Monitor memory usage: `free -h`
- Monitor CPU usage: `top` or `htop`
- Keep your Pi cool with proper ventilation

## Backup

Regularly backup your configuration:
```bash
# Backup guild configs and tracking files
tar -czf heimdallr-backup-$(date +%Y%m%d).tar.gz ~/heimdallr/config ~/heimdallr/.env
```

## Need Help?

- Check logs: `pm2 logs heimdallr` or `journalctl -u heimdallr -f`
- Restart the bot: `pm2 restart heimdallr` or `sudo systemctl restart heimdallr`
- Check Discord bot status in Discord Developer Portal
- Verify your Supabase connection is working
