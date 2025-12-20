# Heimdallr Schema Requirements

Heimdallr expects your Bifröst Supabase database to have the following tables and columns:

## Required Tables

### 1. `team_events` Table

This table stores all events (meetings, holidays, deadlines, etc.)

**Required Columns:**
- `id` (uuid, primary key)
- `title` (text) - Event name
- `description` (text, optional) - Event description
- `date` OR `event_date` (timestamp with time zone) - When the event occurs
- `type` OR `event_type` (text) - Event type: 'meeting', 'holiday', 'deadline', etc.
- `location` (text, optional) - Event location
- `discord_role_id` (text, optional) - Discord role ID to mention in reminders
- `created_at` (timestamp with time zone)

**Example:**
```sql
CREATE TABLE team_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  date timestamp with time zone NOT NULL,
  type text NOT NULL,
  location text,
  created_at timestamp with time zone DEFAULT now()
);
```

### 2. `sprints` Table

This table stores sprint information.

**Required Columns:**
- `id` (uuid, primary key)
- `name` (text) - Sprint name
- `goal` (text, optional) - Sprint goal
- `start_date` (timestamp with time zone) - Sprint start
- `end_date` (timestamp with time zone) - Sprint end
- `created_at` (timestamp with time zone)

**Example:**
```sql
CREATE TABLE sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  goal text,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
```

## Verification

Run `check-schema.sql` in your Supabase SQL Editor to verify your schema matches these requirements.

## Column Name Flexibility

Heimdallr supports both naming conventions:
- `date` or `event_date` for event dates
- `type` or `event_type` for event types

The bot will automatically detect which column names you're using.

## Event Types

Supported event types in the `type`/`event_type` column:
- `meeting` - Team meetings
- `holiday` - Company holidays
- `sprint` - Sprint events
- `deadline` - Project deadlines
- `celebration` - Team celebrations

## Permissions

Make sure your Supabase anon key has full access to these tables:

```sql
-- Enable Row Level Security
ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Allow read access
CREATE POLICY "Allow anon read access to team_events" ON team_events
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon read access to sprints" ON sprints
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon read access to holidays" ON holidays
  FOR SELECT TO anon USING (true);

-- Allow write access (for creating/updating/deleting meetings)
CREATE POLICY "Allow anon insert access to team_events" ON team_events
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update access to team_events" ON team_events
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete access to team_events" ON team_events
  FOR DELETE TO anon USING (true);
```

**Important:** Run `add-write-policies.sql` in your Supabase SQL Editor to add write permissions for the bot.
