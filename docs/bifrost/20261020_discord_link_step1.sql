-- =============================================================================
-- Heimdallr ↔ Bifröst, step 1: link codes, connections and reports
--
-- DRAFT for the Bifrost-V2 repo. Not applied anywhere. Copy it into
-- bifrost-v2/supabase/migrations/ only after the release gate is done.
--
-- Part A works on Bifrost-V2 main (0.14.19) as it is.
-- Part B is needed once 20261004171000_canonical_task_assignment_boundary.sql
-- ships, because that migration stops postgres-owned functions from writing
-- tasks without a signed-in user. It has to be reconciled with that
-- migration's role list and ACL checks, so it is written as a guide.
--
-- Design doc: https://claude.ai/code/artifact/9272bc5d-e5d7-4ca8-8b45-f230ad2265a8
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Part A: tables
-- ---------------------------------------------------------------------------

-- Codes are stored hashed, so a leaked table read cannot be redeemed
CREATE TABLE public.discord_link_codes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code_hash       text NOT NULL UNIQUE,           -- sha256 hex of the 8-character code
  created_by      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  connection_id   uuid                             -- set on redeem
);

CREATE TABLE public.discord_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         bigint NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  guild_id                text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  guild_name              text NOT NULL,
  notification_channel_id text,
  timezone                text NOT NULL DEFAULT 'America/New_York',
  report_project_id       bigint REFERENCES public.projects(id) ON DELETE SET NULL,
  linked_by               uuid NOT NULL REFERENCES public.users(id),  -- who made the code
  linked_by_discord_id    text NOT NULL,                              -- who ran /setup
  created_at              timestamptz NOT NULL DEFAULT now(),
  revoked_at              timestamptz,
  revoked_by              uuid REFERENCES public.users(id)
);

-- One live link per Discord server
CREATE UNIQUE INDEX discord_connections_live_guild
  ON public.discord_connections (guild_id) WHERE revoked_at IS NULL;
CREATE INDEX discord_connections_org ON public.discord_connections (organization_id);

-- Redeem attempts, for rate limiting by server
CREATE TABLE public.discord_link_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id     text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded    boolean NOT NULL
);
CREATE INDEX discord_link_attempts_guild ON public.discord_link_attempts (guild_id, attempted_at);

ALTER TABLE public.discord_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_link_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.discord_link_codes, public.discord_connections, public.discord_link_attempts
  FROM PUBLIC, anon, authenticated;

-- Org Settings → Discord lists the org's connections. Nobody writes these
-- tables directly; the functions below do. Codes and attempts stay unreadable.
GRANT SELECT ON public.discord_connections TO authenticated;
CREATE POLICY discord_connections_read ON public.discord_connections
  FOR SELECT TO authenticated
  USING (public.has_org_permission(organization_id::integer, 'org.settings'));


-- ---------------------------------------------------------------------------
-- Part A: functions called from Bifröst (signed-in user)
-- ---------------------------------------------------------------------------

-- Creates a one-time code for the user's active org. Shown once, valid 15 minutes.
CREATE FUNCTION public.create_discord_link_code()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org bigint := public.get_my_org_id();
  -- No 0/O, 1/I/L lookalikes
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  v_byte int;
  i int;
  v_expires timestamptz := now() + interval '15 minutes';
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.has_org_permission(v_org::integer, 'org.settings') THEN
    RAISE EXCEPTION 'Organization settings permission required' USING ERRCODE = '42501';
  END IF;

  -- Rejection sampling over random bytes keeps every character equally likely
  WHILE length(v_code) < 8 LOOP
    v_bytes := uuid_send(gen_random_uuid());
    FOR i IN 0..15 LOOP
      v_byte := get_byte(v_bytes, i);
      IF v_byte < 248 AND length(v_code) < 8 THEN  -- 248 = 31 * 8
        v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.discord_link_codes (organization_id, code_hash, created_by, expires_at)
  VALUES (v_org, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_uid, v_expires);

  RETURN jsonb_build_object(
    'code', 'BFR-' || substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4),
    'expires_at', v_expires
  );
END $$;

-- Disconnects a server. Every bot call on the connection fails from then on.
CREATE FUNCTION public.revoke_discord_connection(p_connection_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org bigint;
BEGIN
  SELECT organization_id INTO v_org FROM public.discord_connections
   WHERE id = p_connection_id AND revoked_at IS NULL;

  IF v_org IS NULL OR auth.uid() IS NULL OR NOT public.has_org_permission(v_org::integer, 'org.settings') THEN
    RAISE EXCEPTION 'Connection not found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.discord_connections
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE id = p_connection_id;
END $$;


-- ---------------------------------------------------------------------------
-- Part A: functions called by the bot (service role)
-- ---------------------------------------------------------------------------

-- Redeems a link code from /setup. Returns {ok, error} rather than raising,
-- so failed attempts are still recorded for the rate limit.
CREATE FUNCTION public.redeem_discord_link_code(
  p_code text,
  p_guild_id text,
  p_guild_name text,
  p_discord_user_id text,
  p_notification_channel_id text DEFAULT NULL,
  p_timezone text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_link public.discord_link_codes%ROWTYPE;
  v_connection_id uuid;
  v_org_name text;
  v_timezone text;
BEGIN
  IF p_guild_id IS NULL OR p_guild_id !~ '^[0-9]{17,20}$' OR p_discord_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- 10 failed tries per server per 10 minutes
  IF (SELECT count(*) FROM public.discord_link_attempts
       WHERE guild_id = p_guild_id AND NOT succeeded
         AND attempted_at > now() - interval '10 minutes') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  IF length(v_code) = 11 AND left(v_code, 3) = 'BFR' THEN
    v_code := substr(v_code, 4);
  END IF;

  SELECT * INTO v_link FROM public.discord_link_codes
   WHERE code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex')
     AND used_at IS NULL AND expires_at > now()
   FOR UPDATE;

  IF v_link.id IS NULL THEN
    INSERT INTO public.discord_link_attempts (guild_id, succeeded) VALUES (p_guild_id, false);
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  v_timezone := CASE
    WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone) THEN p_timezone
    ELSE 'America/New_York'
  END;

  -- A new code replaces the server's old link
  UPDATE public.discord_connections
     SET revoked_at = now()
   WHERE guild_id = p_guild_id AND revoked_at IS NULL;

  INSERT INTO public.discord_connections (
    organization_id, guild_id, guild_name, notification_channel_id, timezone,
    linked_by, linked_by_discord_id
  ) VALUES (
    v_link.organization_id, p_guild_id, left(coalesce(p_guild_name, ''), 100), p_notification_channel_id, v_timezone,
    v_link.created_by, p_discord_user_id
  )
  RETURNING id INTO v_connection_id;

  UPDATE public.discord_link_codes
     SET used_at = now(), connection_id = v_connection_id
   WHERE id = v_link.id;

  INSERT INTO public.discord_link_attempts (guild_id, succeeded) VALUES (p_guild_id, true);

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_link.organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'connection_id', v_connection_id,
    'organization_id', v_link.organization_id,
    'organization_name', v_org_name
  );
END $$;

-- /reports: choose the project that receives /bug and /feature
CREATE FUNCTION public.discord_set_report_project(p_connection_id uuid, p_project_id bigint)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org bigint;
BEGIN
  SELECT organization_id INTO v_org FROM public.discord_connections
   WHERE id = p_connection_id AND revoked_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Discord connection not found or revoked' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Project is not in this organization' USING ERRCODE = '42501';
  END IF;

  UPDATE public.discord_connections SET report_project_id = p_project_id WHERE id = p_connection_id;
END $$;

-- /bug and /feature. Bugs start in product-backlog, features in submitted,
-- both tagged 'discord'. The organization comes from the connection, never
-- from the bot.
CREATE FUNCTION public.discord_submit_report(
  p_connection_id uuid,
  p_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_steps text DEFAULT NULL,
  p_reporter_tag text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.discord_connections%ROWTYPE;
  v_project_id bigint;
  v_department_id bigint;
  v_priority text;
  v_severity text;
  v_task_id bigint;
BEGIN
  SELECT * INTO v_conn FROM public.discord_connections
   WHERE id = p_connection_id AND revoked_at IS NULL;
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'Discord connection not found or revoked' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('bug', 'feature') THEN
    RAISE EXCEPTION 'Invalid report type' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required' USING ERRCODE = '22023';
  END IF;

  -- The chosen project if it is still in the org, otherwise the org's first
  SELECT id INTO v_project_id FROM public.projects
   WHERE organization_id = v_conn.organization_id
   ORDER BY (id = v_conn.report_project_id) DESC, id
   LIMIT 1;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'No projects found for this organization' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_department_id FROM public.departments
   WHERE organization_id = v_conn.organization_id ORDER BY id LIMIT 1;

  v_priority := CASE WHEN p_priority IN ('low', 'medium', 'high', 'critical') THEN p_priority ELSE 'medium' END;
  v_severity := CASE
    WHEN p_type <> 'bug' THEN NULL
    WHEN p_severity IN ('cosmetic', 'minor', 'major', 'blocker') THEN p_severity
    ELSE 'minor'
  END;

  INSERT INTO public.tasks (
    title, description, type, priority, severity, steps_to_reproduce,
    reported_by, column_id, project_id, department_id, tags
  ) VALUES (
    left(btrim(p_title), 200),
    NULLIF(p_description, ''),
    p_type,
    v_priority,
    v_severity,
    CASE WHEN p_type = 'bug' THEN NULLIF(p_steps, '') END,
    'Discord: ' || left(coalesce(p_reporter_tag, 'unknown'), 64),
    CASE p_type WHEN 'bug' THEN 'product-backlog' ELSE 'submitted' END,
    v_project_id,
    v_department_id,
    ARRAY['discord']
  )
  RETURNING id INTO v_task_id;

  RETURN jsonb_build_object('task_id', v_task_id);
END $$;


-- ---------------------------------------------------------------------------
-- Part A: grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_discord_link_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_discord_connection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_discord_link_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_discord_connection(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_discord_link_code(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discord_set_report_project(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discord_submit_report(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_discord_link_code(text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.discord_set_report_project(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.discord_submit_report(uuid, text, text, text, text, text, text, text) TO service_role;


-- =============================================================================
-- Part B: after the task boundary migration ships (guide, not runnable as is)
--
-- That migration's enforce_work_item_insert trigger rejects task inserts that
-- have no signed-in user unless current_user is one of its dedicated owner
-- roles. discord_submit_report needs its own role, the same way
-- submit_bifrost_feedback uses bifrost_task_feedback_submit:
--
-- 1. Add the role next to the others, and to every role list in that
--    migration's provisioning, default-privilege and ACL verification blocks
--    (and scripts/test-task-assignment-boundary-db.mjs):
--
--      CREATE ROLE bifrost_task_discord_submit NOLOGIN NOINHERIT NOSUPERUSER
--        NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
--
-- 2. Give it only what the function touches:
--
--      GRANT USAGE ON SCHEMA public TO bifrost_task_discord_submit;
--      GRANT INSERT(title,description,type,priority,severity,steps_to_reproduce,
--                   reported_by,column_id,project_id,department_id,tags),
--            SELECT(id) ON public.tasks TO bifrost_task_discord_submit;
--      GRANT USAGE ON SEQUENCE public.tasks_id_seq TO bifrost_task_discord_submit;
--      GRANT SELECT ON public.discord_connections TO bifrost_task_discord_submit;
--      GRANT SELECT(id, organization_id) ON public.projects, public.departments
--        TO bifrost_task_discord_submit;
--      CREATE POLICY task_discord_submit_insert ON public.tasks
--        FOR INSERT TO bifrost_task_discord_submit WITH CHECK (true);
--      CREATE POLICY task_discord_submit_read ON public.tasks
--        FOR SELECT TO bifrost_task_discord_submit USING (true);
--      (plus SELECT policies on discord_connections, projects and departments)
--
--      ALTER FUNCTION public.discord_submit_report(uuid,text,text,text,text,text,text,text)
--        OWNER TO bifrost_task_discord_submit;
--
-- 3. Add a branch to enforce_work_item_insert, before the general path,
--    in the same shape as the bifrost_task_feedback_submit branch:
--
--      IF current_user='bifrost_task_discord_submit' THEN
--       IF NEW.type NOT IN ('bug','feature')
--        OR NEW.column_id IS DISTINCT FROM (CASE NEW.type WHEN 'bug' THEN 'product-backlog' ELSE 'submitted' END)
--        OR NEW.tags IS DISTINCT FROM ARRAY['discord']::text[]
--        OR NEW.reported_by IS NULL OR NEW.reported_by NOT LIKE 'Discord: %' OR NEW.reported_by_id IS NOT NULL
--        OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=NEW.project_id AND p.organization_id=NEW.organization_id)
--        OR (NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.departments d
--             WHERE d.id=NEW.department_id AND d.organization_id=NEW.organization_id))
--        OR NEW.actual_hours IS DISTINCT FROM 0::numeric OR NEW.source_feature_id IS NOT NULL
--        OR NEW.claimed_by IS NOT NULL OR NEW.claimed_at IS NOT NULL OR NEW.sprint_id IS NOT NULL
--        OR NEW.epic_id IS NOT NULL OR NEW.milestone_id IS NOT NULL OR NEW.due_date IS NOT NULL
--        OR NEW.pre_review_column_id IS NOT NULL OR NEW.sort_order IS DISTINCT FROM 0
--        OR coalesce(cardinality(NEW.assignees),0)<>0 OR coalesce(cardinality(NEW.assignee_ids),0)<>0
--        OR NEW.created_at IS DISTINCT FROM now() OR NEW.updated_at IS DISTINCT FROM now() THEN
--        RAISE EXCEPTION 'Invalid Discord report shape' USING ERRCODE='42501';
--       END IF;
--       RETURN NEW;
--      END IF;
--
--    Check how that migration fills tasks.organization_id before this trigger
--    runs; the branch above assumes it is already set from the project.
-- =============================================================================
