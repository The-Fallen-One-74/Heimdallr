# Heimdallr - Bifröst Discord Bot

## Overview

**Heimdallr** is a standalone Discord bot designed to integrate with Bifröst project management systems. Named after the Norse god who watches over the Bifrost bridge, this bot serves as the communication bridge between your Discord server and your Bifröst workspace.

**Status**: Open-source, standalone product for any Bifröst installation

## Core Purpose

**Heimdallr is the team's event coordinator and reminder system.**

Primary functions:
1. **Meeting Notifications** - Ping team members for scheduled meetings
2. **Sprint Events** - Remind about sprint planning, retros, reviews
3. **Holiday Announcements** - Notify team about upcoming holidays and time off
4. **Event Management** - Schedule and manage team events
5. **Automated Reminders** - Send timely reminders before events

## Key Features

### For Teams
- Never miss a meeting or sprint event
- Automatic reminders at configurable intervals
- Holiday and time-off notifications
- RSVP tracking for events
- Calendar view of all upcoming events

### For Administrators
- Easy setup with guided configuration
- Multi-server support (one bot, multiple Discord servers)
- Customizable reminder times
- Flexible notification channels
- Role-based permissions

### For Developers
- Open-source and self-hostable
- Well-documented API
- Modular architecture
- Easy to extend and customize

## Architecture

### Integration Points

```
Discord (Heimdallr) ←→ Supabase Database ←→ Bifröst Desktop App
                              ↕
                         Website
```

**Shared Database**: All systems use the same Supabase database, ensuring real-time sync.

### Authentication Strategy

**Option A: Discord ID Linking** (Recommended)
- Users link their Discord account to their Bifröst profile
- Store `discord_id` in profiles table
- Bot identifies users by Discord ID

**Option B: Command-based Auth**
- Users authenticate with `/link <email> <code>`
- Temporary codes generated in Bifröst
- More secure but less convenient

## Feature Roadmap

### Phase 1: Core Event System (MVP)

#### 1.1 Fix Existing Issues
- [ ] Implement interaction handler for slash commands
- [ ] Add error handling
- [ ] Add proper logging
- [ ] Update .gitignore

#### 1.2 Database Connection
- [ ] Install Supabase client
- [ ] Configure connection to existing Bifröst database
- [ ] Test database queries
- [ ] Add connection error handling

#### 1.3 Event Data Integration
- [ ] Connect to `team_events` table (holidays, meetings, etc.)
- [ ] Connect to `sprints` table for sprint events
- [ ] Set up real-time subscriptions for new events
- [ ] Create event notification queue

### Phase 2: Meeting Notifications

#### 2.1 Meeting Commands
- [ ] `/schedule meeting <title> <date> <time> <attendees>` - Schedule a meeting
- [ ] `/meetings` - List upcoming meetings
- [ ] `/meeting <id>` - View meeting details
- [ ] `/cancel meeting <id>` - Cancel a meeting
- [ ] `/reschedule meeting <id> <new-time>` - Reschedule

#### 2.2 Meeting Reminders
- [ ] 24 hours before: "Meeting tomorrow"
- [ ] 1 hour before: "Meeting in 1 hour"
- [ ] 15 minutes before: "Meeting starting soon"
- [ ] At meeting time: "Meeting is starting now!"

#### 2.3 Meeting Types
- [ ] Team meetings
- [ ] One-on-ones
- [ ] Sprint planning
- [ ] Sprint retrospectives
- [ ] Sprint reviews
- [ ] All-hands meetings

### Phase 3: Sprint Event Notifications

#### 3.1 Sprint Commands
- [ ] `/sprint current` - Show current sprint info
- [ ] `/sprint schedule <type> <date> <time>` - Schedule sprint event
- [ ] `/sprint events` - List all sprint events

#### 3.2 Sprint Event Types
- [ ] Sprint Planning - Start of sprint
- [ ] Daily Standup - Recurring daily
- [ ] Sprint Review - End of sprint
- [ ] Sprint Retrospective - After review
- [ ] Sprint Goal Reminder - Mid-sprint check-in

#### 3.3 Automated Sprint Notifications
- [ ] Sprint start notification (day before)
- [ ] Sprint end notification (day before)
- [ ] Daily standup reminders
- [ ] Sprint goal progress updates
- [ ] Sprint completion celebration

### Phase 4: Holiday & Time Off Management

#### 4.1 Holiday Commands
- [ ] `/holidays` - List upcoming holidays
- [ ] `/holiday <name>` - View holiday details
- [ ] `/add holiday <name> <date> <type>` - Add holiday (admin)
- [ ] `/remove holiday <id>` - Remove holiday (admin)

#### 4.2 Holiday Notifications
- [ ] 1 week before: "Holiday coming up"
- [ ] 1 day before: "Holiday tomorrow - office closed"
- [ ] On holiday: "Happy [Holiday Name]! Office is closed today"
- [ ] Day after: "Welcome back! Hope you enjoyed [Holiday]"

#### 4.3 Holiday Types
- [ ] Company holidays (office closed)
- [ ] Observances (office open)
- [ ] Team events (parties, celebrations)
- [ ] Important dates (deadlines, milestones)

### Phase 5: Event Calendar Integration

#### 5.1 Calendar Commands
- [ ] `/calendar [month]` - View event calendar
- [ ] `/today` - Show today's events
- [ ] `/week` - Show this week's events
- [ ] `/month` - Show this month's events

#### 5.2 Event Management
- [ ] `/event create` - Create custom event
- [ ] `/event edit <id>` - Edit event
- [ ] `/event delete <id>` - Delete event
- [ ] `/event attendees <id>` - Manage attendees

#### 5.3 RSVP System
- [ ] React to event notifications to RSVP
- [ ] Track who's attending
- [ ] Send reminders to non-responders
- [ ] Update event with attendance count

### Phase 6: Advanced Features

#### 6.1 Recurring Events
- [ ] Daily standups
- [ ] Weekly team meetings
- [ ] Bi-weekly one-on-ones
- [ ] Monthly all-hands
- [ ] Quarterly reviews

#### 6.2 Smart Reminders
- [ ] Customizable reminder times
- [ ] Different reminders for different event types
- [ ] Snooze functionality
- [ ] Reminder preferences per user

#### 6.3 Time Zone Support
- [ ] Store user time zones
- [ ] Convert event times to user's timezone
- [ ] Show multiple timezones for global teams

#### 6.4 Integration Features
- [ ] Sync with Google Calendar
- [ ] Export to .ics files
- [ ] Import events from external calendars
- [ ] Webhook notifications for external systems

## Technical Implementation

### Database Schema Updates

```sql
-- Discord user linking (optional - for personalized reminders)
ALTER TABLE profiles 
ADD COLUMN discord_id text UNIQUE,
ADD COLUMN discord_username text,
ADD COLUMN discord_notification_preferences jsonb DEFAULT '{"meetings": true, "sprints": true, "holidays": true}'::jsonb;

-- Bot configuration
CREATE TABLE discord_bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL UNIQUE,
  notification_channel_id text NOT NULL,
  reminder_times jsonb DEFAULT '{"meeting": [1440, 60, 15], "sprint": [1440, 60], "holiday": [10080, 1440]}'::jsonb,
  timezone text DEFAULT 'America/New_York',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Event reminders log (track what's been sent)
CREATE TABLE discord_event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  event_type text NOT NULL, -- 'meeting', 'sprint', 'holiday'
  reminder_type text NOT NULL, -- '24h', '1h', '15m', etc.
  sent_at timestamp with time zone DEFAULT now(),
  discord_message_id text,
  attendees_notified text[] -- Array of Discord IDs
);

-- Meeting attendees (if not already in team_events)
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES team_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  discord_id text,
  rsvp_status text DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'maybe'
  notified_at timestamp with time zone,
  responded_at timestamp with time zone
);
```

### Dependencies to Add

```json
{
  "dependencies": {
    "discord.js": "^14.14.1",
    "dotenv": "^16.3.1",
    "@supabase/supabase-js": "^2.39.0",
    "node-cron": "^3.0.3",
    "winston": "^3.11.0"
  }
}
```

### Environment Variables

```env
# Discord
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Configuration
NOTIFICATION_CHANNEL_ID=channel_for_notifications
ADMIN_ROLE_ID=discord_role_for_admins
TIMEZONE=America/New_York
```

### Project Structure

```
Heimdallr/
├── src/
│   ├── commands/
│   │   ├── meetings/
│   │   │   ├── schedule.js
│   │   │   ├── meetings.js
│   │   │   ├── meeting.js
│   │   │   ├── cancel.js
│   │   │   └── reschedule.js
│   │   ├── sprints/
│   │   │   ├── sprint.js
│   │   │   ├── sprint-schedule.js
│   │   │   └── sprint-events.js
│   │   ├── holidays/
│   │   │   ├── holidays.js
│   │   │   ├── holiday.js
│   │   │   ├── add-holiday.js
│   │   │   └── remove-holiday.js
│   │   ├── calendar/
│   │   │   ├── calendar.js
│   │   │   ├── today.js
│   │   │   ├── week.js
│   │   │   └── month.js
│   │   ├── events/
│   │   │   ├── event-create.js
│   │   │   ├── event-edit.js
│   │   │   └── event-delete.js
│   │   └── utility/
│   │       ├── ping.js
│   │       ├── about.js
│   │       ├── help.js
│   │       └── config.js
│   ├── events/
│   │   ├── ready.js
│   │   ├── interactionCreate.js
│   │   └── messageReactionAdd.js (for RSVP)
│   ├── services/
│   │   ├── supabase.js
│   │   ├── eventManager.js
│   │   ├── reminderScheduler.js
│   │   └── notificationService.js
│   ├── utils/
│   │   ├── logger.js
│   │   ├── embeds.js
│   │   ├── timeUtils.js
│   │   └── formatters.js
│   ├── jobs/
│   │   ├── checkUpcomingEvents.js
│   │   ├── sendMeetingReminders.js
│   │   ├── sendSprintReminders.js
│   │   └── sendHolidayReminders.js
│   ├── deploy-commands.js
│   └── index.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Command Reference

### Meeting Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/schedule meeting <title> <date> <time> <attendees>` | Schedule a meeting | Admin/Lead/Scrum Master |
| `/meetings [filter]` | List upcoming meetings | All users |
| `/meeting <id>` | View meeting details | All users |
| `/cancel meeting <id>` | Cancel a meeting | Admin/Meeting creator |
| `/reschedule meeting <id> <new-time>` | Reschedule meeting | Admin/Meeting creator |

### Sprint Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/sprint current` | Show current sprint | All users |
| `/sprint schedule <type> <date> <time>` | Schedule sprint event | Scrum Master/Admin |
| `/sprint events` | List sprint events | All users |

### Holiday Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/holidays [month]` | List holidays | All users |
| `/holiday <name>` | View holiday details | All users |
| `/add holiday <name> <date> <type>` | Add holiday | Admin/HR |
| `/remove holiday <id>` | Remove holiday | Admin/HR |

### Calendar Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/calendar [month]` | View event calendar | All users |
| `/today` | Show today's events | All users |
| `/week` | Show this week's events | All users |
| `/month` | Show this month's events | All users |

### Event Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/event create` | Create custom event | Admin/Lead |
| `/event edit <id>` | Edit event | Admin/Event creator |
| `/event delete <id>` | Delete event | Admin/Event creator |
| `/event attendees <id>` | View/manage attendees | All users |

### Utility Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/ping` | Check bot status | All users |
| `/about` | About Heimdallr | All users |
| `/help [command]` | Get help | All users |
| `/config` | Configure bot settings | Admin |

## Notification Types

### Time Tracking Notifications

**Clock In/Out** (Optional, configurable)
```
🟢 @User has clocked in
⏰ Started at: 9:00 AM
```

**Daily Summary** (End of day)
```
📊 Daily Time Summary - December 20, 2024

🟢 Currently Working: 5 members
⏸️ On Break: 2 members
⏹️ Clocked Out: 12 members

Total Hours Today: 87.5 hours
```

**Clock Out Reminder** (Configurable time)
```
⏰ Reminder: Don't forget to clock out!
You've been working for 8.5 hours today.
Use /clockout when you're done.
```

### Task Notifications

**Task Assigned**
```
📋 New Task Assigned

Task #123: Implement user authentication
Priority: High
Due: December 25, 2024
Project: Bifröst

View details: /task 123
```

**Task Status Changed**
```
✅ Task Status Updated

Task #123: Implement user authentication
Status: In Progress → Review
Updated by: @User

View details: /task 123
```

**Task Comment**
```
💬 New Comment on Your Task

Task #123: Implement user authentication
@User: "Great work! Just a few minor changes needed."

View details: /task 123
```

**Task Due Soon**
```
⚠️ Task Due Tomorrow

Task #123: Implement user authentication
Due: December 21, 2024 (Tomorrow)
Status: In Progress

Update status: /taskstatus 123 <status>
```

### Project Notifications

**Sprint Started**
```
🚀 Sprint Started!

Sprint: Sprint 12
Duration: December 20 - January 3
Goal: Complete authentication system

View tasks: /sprinttasks
```

**Milestone Completed**
```
🎉 Milestone Achieved!

Milestone: Beta Release
Project: Bifröst
Completed: 15/15 tasks

Great work team! 🎊
```

## Implementation Priority

### Week 1: Foundation
1. Fix critical bugs (interaction handler)
2. Add Supabase connection
3. Implement user linking system
4. Basic error handling and logging

### Week 2: Time Tracking
1. Clock in/out commands
2. Status queries
3. Basic notifications
4. Clock out reminders

### Week 3: Task Management
1. Task query commands
2. Task status updates
3. Task notifications
4. Task creation

### Week 4: Polish & Deploy
1. Help system
2. Error messages
3. Rate limiting
4. Deploy to production server

## Deployment

### Hosting Options

**Option A: VPS/Cloud Server**
- DigitalOcean Droplet ($6/month)
- AWS EC2 (Free tier available)
- Google Cloud Compute Engine

**Option B: Specialized Bot Hosting**
- Railway.app (Free tier available)
- Heroku (Paid)
- Render.com (Free tier available)

**Option C: Local Server**
- Run on office server
- Use PM2 for process management
- Set up auto-restart

### Deployment Checklist

- [ ] Set up hosting environment
- [ ] Configure environment variables
- [ ] Set up process manager (PM2)
- [ ] Configure auto-restart on crash
- [ ] Set up logging
- [ ] Configure backup strategy
- [ ] Test all commands
- [ ] Monitor for 24 hours
- [ ] Document deployment process

## Security Considerations

1. **Token Security**
   - Never commit tokens to git
   - Use environment variables
   - Rotate tokens periodically

2. **Database Access**
   - Use Supabase RLS policies
   - Validate all user inputs
   - Sanitize queries

3. **Permission Checks**
   - Verify user is linked before actions
   - Check role permissions
   - Rate limit commands

4. **Data Privacy**
   - Don't expose sensitive data in public channels
   - Use ephemeral messages for personal info
   - Log access to sensitive commands

## Monitoring & Maintenance

### Metrics to Track
- Command usage frequency
- Error rates
- Response times
- User engagement
- Notification delivery rate

### Maintenance Tasks
- Weekly: Review error logs
- Monthly: Update dependencies
- Quarterly: Review and optimize
- As needed: Add new features

## Success Metrics

**Adoption**
- % of team with linked accounts
- Daily active users
- Commands per user per day

**Efficiency**
- Time saved vs opening Bifröst
- Response time for queries
- Notification delivery success rate

**Satisfaction**
- User feedback
- Feature requests
- Bug reports

## Future Enhancements

1. **Voice Integration**
   - Clock in/out via voice commands
   - Voice channel status sync

2. **AI Assistant**
   - Natural language task queries
   - Smart suggestions
   - Automated task assignment

3. **Mobile App Integration**
   - Push notifications
   - Quick actions from mobile

4. **Advanced Analytics**
   - Productivity insights
   - Team performance trends
   - Predictive analytics

5. **Third-party Integrations**
   - GitHub commit notifications
   - Calendar integration
   - Email notifications

---

## Getting Started

Ready to build Heimdallr? Start with:

1. Fix the critical interaction handler bug
2. Add Supabase connection
3. Implement `/link` command
4. Build `/clockin` and `/clockout`
5. Test with your team
6. Iterate based on feedback

The goal is to make Heimdallr an indispensable tool that keeps your team connected and productive, whether they're in Bifröst, on Discord, or on the go.
