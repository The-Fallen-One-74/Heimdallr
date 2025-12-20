# Heimdallr - Design Document

## Architecture Overview

Heimdallr is a Discord bot that integrates with Bifröst's Supabase database to provide event notifications and reminders. The bot uses a modular architecture with clear separation of concerns.

### System Architecture

```

  Discord API    

         
    
     Heimdallr
       Bot    
    
         
    
      Supabase Database          
      (Shared with Bifröst)      
      - profiles                 
      - team_events              
      - sprints                  
      - discord_bot_config       
      - discord_event_reminders  
    
```

### Technology Stack

- **Runtime**: Node.js 18+
- **Discord Library**: discord.js v14
- **Database**: Supabase (PostgreSQL)
- **Scheduling**: node-cron
- **Logging**: winston
- **Environment**: dotenv

## Component Structure

### Core Components

#### 1. Bot Client (src/index.js)
- Initialize Discord client
- Load commands and events
- Handle graceful shutdown
- Manage bot lifecycle

#### 2. Command Handler (src/events/interactionCreate.js)
- Route slash commands to handlers
- Validate permissions
- Handle errors
- Log command usage

#### 3. Event Manager (src/services/eventManager.js)
- Query upcoming events from database
- Categorize events by type
- Track event changes
- Manage event lifecycle

#### 4. Reminder Scheduler (src/services/reminderScheduler.js)
- Schedule reminders based on event times
- Check for upcoming events periodically
- Send reminders at configured intervals
- Track sent reminders to avoid duplicates

#### 5. Notification Service (src/services/notificationService.js)
- Format event notifications
- Send Discord messages
- Handle mentions and roles
- Track notification delivery

#### 6. Database Service (src/services/supabase.js)
- Connect to Supabase
- Query event data
- Store reminder logs
- Manage bot configuration

## Data Models

### Database Schema

#### discord_bot_config
```sql
CREATE TABLE discord_bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL UNIQUE,
  notification_channel_id text NOT NULL,
  reminder_times jsonb DEFAULT '{
    "meeting": [1440, 60, 15],
    "sprint": [1440, 60],
    "holiday": [10080, 1440]
  }'::jsonb,
  timezone text DEFAULT 'America/New_York',
  admin_role_id text,
  enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
```

#### discord_event_reminders
```sql
CREATE TABLE discord_event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  reminder_type text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  discord_message_id text,
  guild_id text NOT NULL,
  attendees_notified text[]
);

CREATE INDEX idx_event_reminders_event ON discord_event_reminders(event_id);
CREATE INDEX idx_event_reminders_guild ON discord_event_reminders(guild_id);
```

#### meeting_attendees
```sql
CREATE TABLE meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES team_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  discord_id text,
  rsvp_status text DEFAULT 'pending',
  notified_at timestamp with time zone,
  responded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_meeting_attendees_event ON meeting_attendees(event_id);
CREATE INDEX idx_meeting_attendees_discord ON meeting_attendees(discord_id);
```

#### profiles (update)
```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS discord_id text UNIQUE,
ADD COLUMN IF NOT EXISTS discord_username text,
ADD COLUMN IF NOT EXISTS discord_notification_preferences jsonb DEFAULT '{
  "meetings": true,
  "sprints": true,
  "holidays": true,
  "reminders": true
}'::jsonb;
```

## Command Structure

### Command Categories

#### Utility Commands
- `/ping` - Check bot status
- `/about` - Bot information
- `/help [command]` - Help system
- `/config` - View/edit bot configuration (admin)

#### Meeting Commands
- `/schedule meeting` - Schedule a meeting
- `/meetings [filter]` - List meetings
- `/meeting <id>` - View meeting details
- `/cancel meeting <id>` - Cancel meeting
- `/reschedule meeting <id>` - Reschedule meeting

#### Sprint Commands
- `/sprint current` - Current sprint info
- `/sprint schedule` - Schedule sprint event
- `/sprint events` - List sprint events

#### Holiday Commands
- `/holidays [month]` - List holidays
- `/holiday <name>` - Holiday details
- `/add holiday` - Add holiday (admin)
- `/remove holiday <id>` - Remove holiday (admin)

#### Calendar Commands
- `/calendar [month]` - View calendar
- `/today` - Today's events
- `/week` - This week's events
- `/month` - This month's events

## Event Flow

### Meeting Notification Flow

```
1. Meeting created in Bifröst or via /schedule
   
2. Event stored in team_events table
   
3. Reminder Scheduler detects new event
   
4. Schedules reminders (24h, 1h, 15m before)
   
5. At reminder time:
   - Query event details
   - Format notification
   - Send to Discord channel
   - Mention attendees
   - Log reminder sent
   
6. Users can RSVP via reactions
   
7. RSVP stored in meeting_attendees
```

### Sprint Event Flow

```
1. Sprint created/updated in Bifröst
   
2. Sprint data in sprints table
   
3. Reminder Scheduler detects sprint events:
   - Sprint start
   - Sprint end
   - Sprint planning
   - Sprint retro
   
4. Sends notifications at configured times
   
5. Team receives sprint updates
```

### Holiday Notification Flow

```
1. Holiday added to team_events
   
2. Scheduler detects holiday
   
3. Sends reminders:
   - 1 week before
   - 1 day before
   - On the day
   
4. Team is informed about time off
```

## Command Structure

### Command Categories

#### Utility Commands
- `/ping` - Check bot status
- `/about` - Bot information
- `/help [command]` - Help system
- `/config` - View/edit bot configuration (admin)

#### Meeting Commands
- `/schedule meeting` - Schedule a meeting
- `/meetings [filter]` - List meetings
- `/meeting <id>` - View meeting details
- `/cancel meeting <id>` - Cancel meeting
- `/reschedule meeting <id>` - Reschedule meeting

#### Sprint Commands
- `/sprint current` - Current sprint info
- `/sprint schedule` - Schedule sprint event
- `/sprint events` - List sprint events

#### Holiday Commands
- `/holidays [month]` - List holidays
- `/holiday <name>` - Holiday details
- `/add holiday` - Add holiday (admin)
- `/remove holiday <id>` - Remove holiday (admin)

#### Calendar Commands
- `/calendar [month]` - View calendar
- `/today` - Today's events
- `/week` - This week's events
- `/month` - This month's events

### Command Implementation Pattern

```javascript
// src/commands/meetings/schedule.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEvent } = require('../../services/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a meeting')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Meeting title')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time (HH:MM)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('attendees')
        .setDescription('Mention attendees')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    try {
      // Validate inputs
      // Create event in database
      // Schedule reminders
      // Send confirmation
      await interaction.reply('Meeting scheduled!');
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Error scheduling meeting', ephemeral: true });
    }
  },
};
```

## Event Flow

### Meeting Notification Flow

```
1. Meeting created in Bifröst or via /schedule
   
2. Event stored in team_events table
   
3. Reminder Scheduler detects new event
   
4. Schedules reminders (24h, 1h, 15m before)
   
5. At reminder time:
   - Query event details
   - Format notification
   - Send to Discord channel
   - Mention attendees
   - Log reminder sent
   
6. Users can RSVP via reactions
   
7. RSVP stored in meeting_attendees
```

### Sprint Event Flow

```
1. Sprint created/updated in Bifröst
   
2. Sprint data in sprints table
   
3. Reminder Scheduler detects sprint events:
   - Sprint start
   - Sprint end
   - Sprint planning
   - Sprint retro
   
4. Sends notifications at configured times
   
5. Team receives sprint updates
```

### Holiday Notification Flow

```
1. Holiday added to team_events
   
2. Scheduler detects holiday
   
3. Sends reminders:
   - 1 week before
   - 1 day before
   - On the day
   
4. Team is informed about time off
```

## Command Structure

### Command Categories

#### Utility Commands
- `/ping` - Check bot status
- `/about` - Bot information
- `/help [command]` - Help system
- `/config` - View/edit bot configuration (admin)

#### Meeting Commands
- `/schedule meeting` - Schedule a meeting
- `/meetings [filter]` - List meetings
- `/meeting <id>` - View meeting details
- `/cancel meeting <id>` - Cancel meeting
- `/reschedule meeting <id>` - Reschedule meeting

#### Sprint Commands
- `/sprint current` - Current sprint info
- `/sprint schedule` - Schedule sprint event
- `/sprint events` - List sprint events

#### Holiday Commands
- `/holidays [month]` - List holidays
- `/holiday <name>` - Holiday details
- `/add holiday` - Add holiday (admin)
- `/remove holiday <id>` - Remove holiday (admin)

#### Calendar Commands
- `/calendar [month]` - View calendar
- `/today` - Today's events
- `/week` - This week's events
- `/month` - This month's events

### Command Implementation Pattern

```javascript
// src/commands/meetings/schedule.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEvent } = require('../../services/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a meeting')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Meeting title')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time (HH:MM)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('attendees')
        .setDescription('Mention attendees')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    try {
      // Validate inputs
      // Create event in database
      // Schedule reminders
      // Send confirmation
      await interaction.reply('Meeting scheduled!');
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Error scheduling meeting', ephemeral: true });
    }
  },
};
```

## Event Flow

### Meeting Notification Flow

```
1. Meeting created in Bifröst or via /schedule
   
2. Event stored in team_events table
   
3. Reminder Scheduler detects new event
   
4. Schedules reminders (24h, 1h, 15m before)
   
5. At reminder time:
   - Query event details
   - Format notification
   - Send to Discord channel
   - Mention attendees
   - Log reminder sent
   
6. Users can RSVP via reactions
   
7. RSVP stored in meeting_attendees
```

### Sprint Event Flow

```
1. Sprint created/updated in Bifröst
   
2. Sprint data in sprints table
   
3. Reminder Scheduler detects sprint events:
   - Sprint start
   - Sprint end
   - Sprint planning
   - Sprint retro
   
4. Sends notifications at configured times
   
5. Team receives sprint updates
```

### Holiday Notification Flow

```
1. Holiday added to team_events
   
2. Scheduler detects holiday
   
3. Sends reminders:
   - 1 week before
   - 1 day before
   - On the day
   
4. Team is informed about time off
```
