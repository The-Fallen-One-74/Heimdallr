-- =============================================================================
-- Heimdallr ↔ Bifröst, step 2: events and sign-ups
--
-- DRAFT for the Bifrost-V2 repo. Not applied anywhere. Needs step 1
-- (20261020_discord_link_step1.sql) first.
--
-- Moves the bot's local sign-ups (config/signups.json) and its direct
-- calendar_events writes into Bifröst. Every function takes the server's
-- connection_id and derives the organization from it.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Where each event was posted, so a reschedule or cancel can edit the post
CREATE TABLE public.discord_event_posts (
  event_id      bigint NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.discord_connections(id) ON DELETE CASCADE,
  channel_id    text NOT NULL,
  message_id    text NOT NULL,
  posted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, connection_id)
);

-- Join / Maybe / Can't answers. Keyed by Discord ID so members without a
-- Bifröst account can sign up; user_id fills in once they link (step 3).
CREATE TABLE public.calendar_event_signups (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        bigint NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  organization_id bigint NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  discord_user_id text,
  user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status          text NOT NULL CHECK (status IN ('going', 'maybe', 'not_going')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (discord_user_id IS NOT NULL OR user_id IS NOT NULL),
  UNIQUE (event_id, discord_user_id),
  UNIQUE (event_id, user_id)
);
CREATE INDEX calendar_event_signups_org ON public.calendar_event_signups (organization_id);

ALTER TABLE public.discord_event_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_signups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.discord_event_posts, public.calendar_event_signups FROM PUBLIC, anon, authenticated;

-- Members see sign-ups for their org's events. Nobody writes directly.
GRANT SELECT ON public.calendar_event_signups TO authenticated;
CREATE POLICY calendar_event_signups_read ON public.calendar_event_signups
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_my_org_ids()));


-- ---------------------------------------------------------------------------
-- Shared check: a live connection, and an event in that connection's org
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.discord_live_connection(p_connection_id uuid)
RETURNS public.discord_connections LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.discord_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_conn FROM public.discord_connections
   WHERE id = p_connection_id AND revoked_at IS NULL;
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'Discord connection not found or revoked' USING ERRCODE = '42501';
  END IF;
  RETURN v_conn;
END $$;

CREATE FUNCTION public.discord_event_in_connection(p_connection_id uuid, p_event_id bigint)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org bigint := (public.discord_live_connection(p_connection_id)).organization_id;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.calendar_events WHERE id = p_event_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = '42501';
  END IF;
  RETURN v_org;
END $$;


-- ---------------------------------------------------------------------------
-- Sign-ups
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.discord_set_signup(
  p_connection_id uuid,
  p_event_id bigint,
  p_discord_user_id text,
  p_status text
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org bigint := public.discord_event_in_connection(p_connection_id, p_event_id);
BEGIN
  IF p_status NOT IN ('going', 'maybe', 'not_going') THEN
    RAISE EXCEPTION 'Invalid sign-up status' USING ERRCODE = '22023';
  END IF;
  IF p_discord_user_id IS NULL OR p_discord_user_id !~ '^[0-9]{17,20}$' THEN
    RAISE EXCEPTION 'Invalid Discord user' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.calendar_event_signups (event_id, organization_id, discord_user_id, status)
  VALUES (p_event_id, v_org, p_discord_user_id, p_status)
  ON CONFLICT (event_id, discord_user_id)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now();
END $$;

-- Answers for one event, for buttons, /attendees and reminders
CREATE FUNCTION public.discord_list_signups(p_connection_id uuid, p_event_id bigint)
RETURNS TABLE (discord_user_id text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.discord_event_in_connection(p_connection_id, p_event_id);
  RETURN QUERY
    SELECT s.discord_user_id, s.status FROM public.calendar_event_signups s
     WHERE s.event_id = p_event_id AND s.discord_user_id IS NOT NULL
     ORDER BY s.updated_at;
END $$;


-- ---------------------------------------------------------------------------
-- Events from /schedule, /reschedule and /cancel
-- created_by is the Bifröst user who made the link code
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.discord_create_event(
  p_connection_id uuid,
  p_title text,
  p_type text,
  p_event_date date,              -- UTC, like the app writes
  p_event_time text DEFAULT NULL, -- UTC HH:MM, NULL for all-day
  p_department_id bigint DEFAULT NULL
)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.discord_connections := public.discord_live_connection(p_connection_id);
  v_id bigint;
BEGIN
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required' USING ERRCODE = '22023';
  END IF;
  IF p_type NOT IN ('holiday', 'meeting', 'company', 'retrospective', 'other') THEN
    RAISE EXCEPTION 'Invalid event type' USING ERRCODE = '22023';
  END IF;
  IF p_event_time IS NOT NULL AND p_event_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Invalid event time' USING ERRCODE = '22023';
  END IF;
  IF p_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.departments WHERE id = p_department_id AND organization_id = v_conn.organization_id
  ) THEN
    RAISE EXCEPTION 'Department is not in this organization' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.calendar_events (organization_id, title, type, event_date, event_time, department_id, created_by)
  VALUES (v_conn.organization_id, left(btrim(p_title), 200), p_type, p_event_date, p_event_time, p_department_id, v_conn.linked_by)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- Changes the title and/or time. NULL leaves a field as it is.
CREATE FUNCTION public.discord_update_event(
  p_connection_id uuid,
  p_event_id bigint,
  p_title text DEFAULT NULL,
  p_event_date date DEFAULT NULL,
  p_event_time text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.discord_event_in_connection(p_connection_id, p_event_id);
  IF p_event_time IS NOT NULL AND p_event_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Invalid event time' USING ERRCODE = '22023';
  END IF;

  UPDATE public.calendar_events
     SET title      = coalesce(NULLIF(left(btrim(p_title), 200), ''), title),
         event_date = coalesce(p_event_date, event_date),
         event_time = coalesce(p_event_time, event_time)
   WHERE id = p_event_id;
END $$;

CREATE FUNCTION public.discord_delete_event(p_connection_id uuid, p_event_id bigint)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.discord_event_in_connection(p_connection_id, p_event_id);
  DELETE FROM public.calendar_events WHERE id = p_event_id;
END $$;

-- The bot records where it posted an event, once per server
CREATE FUNCTION public.discord_record_event_post(
  p_connection_id uuid,
  p_event_id bigint,
  p_channel_id text,
  p_message_id text
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.discord_event_in_connection(p_connection_id, p_event_id);
  INSERT INTO public.discord_event_posts (event_id, connection_id, channel_id, message_id)
  VALUES (p_event_id, p_connection_id, p_channel_id, p_message_id)
  ON CONFLICT (event_id, connection_id)
  DO UPDATE SET channel_id = EXCLUDED.channel_id, message_id = EXCLUDED.message_id, posted_at = now();
END $$;


-- ---------------------------------------------------------------------------
-- Grants: bot functions are for the service role only
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.discord_live_connection(uuid)',
    'public.discord_event_in_connection(uuid,bigint)',
    'public.discord_set_signup(uuid,bigint,text,text)',
    'public.discord_list_signups(uuid,bigint)',
    'public.discord_create_event(uuid,text,text,date,text,bigint)',
    'public.discord_update_event(uuid,bigint,text,date,text)',
    'public.discord_delete_event(uuid,bigint)',
    'public.discord_record_event_post(uuid,bigint,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
