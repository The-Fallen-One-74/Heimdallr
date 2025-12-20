-- Test query to see what data exists in team_events

-- Check all events
SELECT id, title, event_type, start_date, start_time 
FROM team_events 
ORDER BY start_date DESC 
LIMIT 10;

-- Check specifically for holidays
SELECT id, title, event_type, start_date, start_time 
FROM team_events 
WHERE event_type = 'holiday'
ORDER BY start_date DESC;

-- Check upcoming events (next 30 days)
SELECT id, title, event_type, start_date, start_time 
FROM team_events 
WHERE start_date >= CURRENT_DATE 
  AND start_date <= CURRENT_DATE + INTERVAL '30 days'
ORDER BY start_date ASC;

-- Check upcoming holidays specifically
SELECT id, title, event_type, start_date, start_time 
FROM team_events 
WHERE event_type = 'holiday'
  AND start_date >= CURRENT_DATE 
  AND start_date <= CURRENT_DATE + INTERVAL '30 days'
ORDER BY start_date ASC;
