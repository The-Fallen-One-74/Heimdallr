-- Heimdallr Schema Verification Script
-- Run this in your Bifröst Supabase SQL Editor to check if required columns exist

-- Check team_events table structure
SELECT 
  'team_events' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'team_events'
ORDER BY ordinal_position;

-- Check sprints table structure
SELECT 
  'sprints' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'sprints'
ORDER BY ordinal_position;

-- Check if required columns exist in team_events
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_events' AND column_name = 'date') 
    THEN '✓ team_events.date exists'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_events' AND column_name = 'event_date')
    THEN '✓ team_events.event_date exists'
    ELSE '✗ Missing date column in team_events'
  END as date_column_check,
  
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_events' AND column_name = 'type') 
    THEN '✓ team_events.type exists'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_events' AND column_name = 'event_type')
    THEN '✓ team_events.event_type exists'
    ELSE '✗ Missing type column in team_events'
  END as type_column_check,
  
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_events' AND column_name = 'title') 
    THEN '✓ team_events.title exists'
    ELSE '✗ Missing title column in team_events'
  END as title_column_check;

-- Check if required columns exist in sprints
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sprints' AND column_name = 'start_date') 
    THEN '✓ sprints.start_date exists'
    ELSE '✗ Missing start_date column in sprints'
  END as start_date_check,
  
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sprints' AND column_name = 'end_date') 
    THEN '✓ sprints.end_date exists'
    ELSE '✗ Missing end_date column in sprints'
  END as end_date_check,
  
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sprints' AND column_name = 'name') 
    THEN '✓ sprints.name exists'
    ELSE '✗ Missing name column in sprints'
  END as name_column_check;
