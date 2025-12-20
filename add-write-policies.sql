-- Heimdallr Write Permissions Setup
-- Run this in your Bifröst Supabase SQL Editor to allow the bot to create/update/delete events

-- Add INSERT policy for team_events (allows bot to create meetings)
CREATE POLICY "Allow anon insert access to team_events" ON team_events
  FOR INSERT TO anon WITH CHECK (true);

-- Add UPDATE policy for team_events (allows bot to update meetings)
CREATE POLICY "Allow anon update access to team_events" ON team_events
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Add DELETE policy for team_events (allows bot to delete/cancel meetings)
CREATE POLICY "Allow anon delete access to team_events" ON team_events
  FOR DELETE TO anon USING (true);

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'team_events'
ORDER BY cmd;
