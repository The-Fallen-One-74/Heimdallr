#!/bin/bash
# Heimdallr Droplet Setup Script
# Run this on a fresh Ubuntu 24.04 droplet

set -e

echo "🛡️ Setting up Heimdallr..."

# Update system
apt update && apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Create app directory
mkdir -p /opt/heimdallr
cd /opt/heimdallr

# Clone the repo
git clone https://github.com/The-Fallen-One-74/Heimdallr.git .

# Install dependencies
npm install --production

# Create config directory
mkdir -p config

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "Next steps:"
echo "1. Create the .env file:"
echo "   nano /opt/heimdallr/.env"
echo ""
echo "2. Paste your environment variables (see .env.example)"
echo ""
echo "3. Start with PM2:"
echo "   pm2 start src/index.js --name heimdallr"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "4. Check logs:"
echo "   pm2 logs heimdallr"
echo ""
