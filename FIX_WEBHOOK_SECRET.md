# Fix Webhook Secret Mismatch

## Problem

The webhook secret in Supabase doesn't match the one in the bot's production `.env` file.

- **Bot `.env` has:** `df101bbf9ae20bd063d07fffd4cda62de1f060f27743f00efa153235af3069b2`
- **Supabase webhook configured with:** `df10ibbf9ae20bd0G3d07fffd4`

This causes webhook authentication to fail with "Unauthorized webhook request" errors.

## Solution

Update the Supabase webhook configuration to use the correct secret.

### Steps:

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project: `djistlrjhzmoyejotjfk`

2. **Open Database Webhooks**
   - Click "Database" in the left sidebar
   - Click "Webhooks" tab

3. **Edit the `team_events_insert` webhook**
   - Find the webhook for `team_events` table
   - Click "Edit" or the webhook name

4. **Update the HTTP Headers**
   - Find the `x-webhook-secret` header
   - Change the value to: `df101bbf9ae20bd063d07fffd4cda62de1f060f27743f00efa153235af3069b2`

5. **Save the webhook**
   - Click "Save" or "Update"

6. **Test the webhook**
   - Create a test event in the desktop app
   - Check PM2 logs on the droplet: `pm2 logs heimdallr`
   - You should see: "✅ Webhook authenticated successfully"

## Verification

After updating, test the integration:

1. **Open desktop app** and navigate to Calendar
2. **Create a new event** with Discord integration enabled
3. **Check the bot logs:**
   ```bash
   ssh heimdallr@<your-droplet-ip>
   pm2 logs heimdallr --lines 50
   ```

You should see:
```
✅ Webhook authenticated successfully
📨 Received team event webhook: [event-id]
📢 Posting event to Discord channel...
✅ Event posted to Discord
⏰ Scheduled 3 reminders for event
```

4. **Check Discord** - the event notification should appear in the configured channel

## Alternative: Update Bot .env Instead

If you prefer to keep the Supabase webhook secret as-is, you can update the bot's `.env` file instead:

```bash
ssh heimdallr@<your-droplet-ip>
cd ~/Heimdallr
nano .env
```

Change:
```env
WEBHOOK_SECRET=df101bbf9ae20bd063d07fffd4cda62de1f060f27743f00efa153235af3069b2
```

To:
```env
WEBHOOK_SECRET=df10ibbf9ae20bd0G3d07fffd4
```

Then restart:
```bash
pm2 restart heimdallr
```

**Recommendation:** Update Supabase to match the bot (first option) since the bot's secret is already longer and more secure.
