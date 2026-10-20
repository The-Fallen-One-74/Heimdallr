-- =============================================================================
-- Heimdallr ↔ Bifröst, step 3: department roles and Discord accounts
--
-- DRAFT for the Bifrost-V2 repo. Not applied anywhere. Needs steps 1 and 2.
--
-- Moves the bot's /departments mapping (config/guilds.json department_roles)
-- into Org Settings, and lets members link their Discord account so their
-- sign-ups show in Bifröst. Linking an account works like linking a server:
-- the member creates a code in Profile and runs a bot command with it, which
-- proves they own both accounts without Discord OAuth.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Department → Discord role
-- ---------------------------------------------------------------------------

CREATE TABLE public.discord_role_mappings (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connection_id   uuid NOT NULL REFERENCES public.discord_connections(id) ON DELETE CASCADE,
  department_id   bigint NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  discord_role_id text NOT NULL CHECK (discord_role_id ~ '^[0-9]{17,20}$'),
  UNIQUE (connection_id, department_id)
);

ALTER TABLE public.discord_role_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discord_role_mappings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.discord_role_mappings TO authenticated;
CREATE POLICY discord_role_mappings_read ON public.discord_role_mappings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.discord_connections c
     WHERE c.id = connection_id
       AND public.has_org_permission(c.organization_id::integer, 'org.settings')
  ));

-- Org Settings → Discord: map a department to a role, or clear it with NULL
CREATE FUNCTION public.set_discord_role_mapping(
  p_connection_id uuid,
  p_department_id bigint,
  p_discord_role_id text
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org bigint;
BEGIN
  SELECT organization_id INTO v_org FROM public.discord_connections
   WHERE id = p_connection_id AND revoked_at IS NULL;
  IF v_org IS NULL OR auth.uid() IS NULL OR NOT public.has_org_permission(v_org::integer, 'org.settings') THEN
    RAISE EXCEPTION 'Connection not found' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = p_department_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Department is not in this organization' USING ERRCODE = '42501';
  END IF;

  IF p_discord_role_id IS NULL THEN
    DELETE FROM public.discord_role_mappings
     WHERE connection_id = p_connection_id AND department_id = p_department_id;
  ELSE
    INSERT INTO public.discord_role_mappings (connection_id, department_id, discord_role_id)
    VALUES (p_connection_id, p_department_id, p_discord_role_id)
    ON CONFLICT (connection_id, department_id)
    DO UPDATE SET discord_role_id = EXCLUDED.discord_role_id;
  END IF;
END $$;

-- The bot reads the mapping when it posts and reminds
CREATE FUNCTION public.discord_list_role_mappings(p_connection_id uuid)
RETURNS TABLE (department_id bigint, discord_role_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.discord_live_connection(p_connection_id);
  RETURN QUERY
    SELECT m.department_id, m.discord_role_id FROM public.discord_role_mappings m
     WHERE m.connection_id = p_connection_id;
END $$;


-- ---------------------------------------------------------------------------
-- Linking a member's Discord account
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ADD COLUMN discord_user_id text UNIQUE
  CHECK (discord_user_id ~ '^[0-9]{17,20}$');

CREATE TABLE public.discord_account_link_codes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
ALTER TABLE public.discord_account_link_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discord_account_link_codes FROM PUBLIC, anon, authenticated;

-- Profile → Connect Discord: a one-time code for the signed-in user
CREATE FUNCTION public.create_discord_account_link_code()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  v_byte int;
  i int;
  v_expires timestamptz := now() + interval '15 minutes';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  WHILE length(v_code) < 8 LOOP
    v_bytes := uuid_send(gen_random_uuid());
    FOR i IN 0..15 LOOP
      v_byte := get_byte(v_bytes, i);
      IF v_byte < 248 AND length(v_code) < 8 THEN
        v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.discord_account_link_codes (user_id, code_hash, expires_at)
  VALUES (v_uid, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_expires);

  RETURN jsonb_build_object(
    'code', 'ME-' || substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4),
    'expires_at', v_expires
  );
END $$;

-- Profile → Disconnect Discord
CREATE FUNCTION public.unlink_my_discord_account()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users SET discord_user_id = NULL WHERE id = auth.uid();
  UPDATE public.calendar_event_signups SET user_id = NULL
   WHERE user_id = auth.uid() AND discord_user_id IS NOT NULL;
END $$;

-- Bot command with the code. Returns {ok, error} so failed tries count
-- toward the same per-server rate limit as server link codes.
CREATE FUNCTION public.redeem_discord_account_link_code(
  p_connection_id uuid,
  p_code text,
  p_discord_user_id text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.discord_connections := public.discord_live_connection(p_connection_id);
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_link public.discord_account_link_codes%ROWTYPE;
BEGIN
  IF p_discord_user_id IS NULL OR p_discord_user_id !~ '^[0-9]{17,20}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF (SELECT count(*) FROM public.discord_link_attempts
       WHERE guild_id = v_conn.guild_id AND NOT succeeded
         AND attempted_at > now() - interval '10 minutes') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  IF length(v_code) = 10 AND left(v_code, 2) = 'ME' THEN
    v_code := substr(v_code, 3);
  END IF;

  SELECT * INTO v_link FROM public.discord_account_link_codes
   WHERE code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex')
     AND used_at IS NULL AND expires_at > now()
   FOR UPDATE;

  IF v_link.id IS NULL THEN
    INSERT INTO public.discord_link_attempts (guild_id, succeeded) VALUES (v_conn.guild_id, false);
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- The Discord account moves to this user if someone else had it
  UPDATE public.users SET discord_user_id = NULL
   WHERE discord_user_id = p_discord_user_id AND id <> v_link.user_id;
  UPDATE public.users SET discord_user_id = p_discord_user_id WHERE id = v_link.user_id;
  UPDATE public.discord_account_link_codes SET used_at = now() WHERE id = v_link.id;

  -- Earlier sign-ups from this Discord account now show as this user in
  -- orgs they belong to, unless they already answered that event in Bifröst
  UPDATE public.calendar_event_signups s SET user_id = v_link.user_id
   WHERE s.discord_user_id = p_discord_user_id
     AND s.user_id IS DISTINCT FROM v_link.user_id
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = v_link.user_id AND ur.organization_id = s.organization_id)
     AND NOT EXISTS (SELECT 1 FROM public.calendar_event_signups o
                      WHERE o.event_id = s.event_id AND o.user_id = v_link.user_id);

  INSERT INTO public.discord_link_attempts (guild_id, succeeded) VALUES (v_conn.guild_id, true);
  RETURN jsonb_build_object('ok', true);
END $$;

-- Sign-ups now also fill user_id when the Discord account is linked
CREATE OR REPLACE FUNCTION public.discord_set_signup(
  p_connection_id uuid,
  p_event_id bigint,
  p_discord_user_id text,
  p_status text
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org bigint := public.discord_event_in_connection(p_connection_id, p_event_id);
  v_user uuid;
BEGIN
  IF p_status NOT IN ('going', 'maybe', 'not_going') THEN
    RAISE EXCEPTION 'Invalid sign-up status' USING ERRCODE = '22023';
  END IF;
  IF p_discord_user_id IS NULL OR p_discord_user_id !~ '^[0-9]{17,20}$' THEN
    RAISE EXCEPTION 'Invalid Discord user' USING ERRCODE = '22023';
  END IF;

  -- Only link the sign-up to a user who belongs to this org
  SELECT u.id INTO v_user FROM public.users u
   WHERE u.discord_user_id = p_discord_user_id
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.organization_id = v_org);

  -- An answer the user already gave in Bifröst becomes this one
  IF v_user IS NOT NULL THEN
    UPDATE public.calendar_event_signups SET discord_user_id = p_discord_user_id
     WHERE event_id = p_event_id AND user_id = v_user AND discord_user_id IS NULL;
  END IF;

  INSERT INTO public.calendar_event_signups (event_id, organization_id, discord_user_id, user_id, status)
  VALUES (p_event_id, v_org, p_discord_user_id, v_user, p_status)
  ON CONFLICT (event_id, discord_user_id)
  DO UPDATE SET status = EXCLUDED.status, user_id = coalesce(EXCLUDED.user_id, public.calendar_event_signups.user_id), updated_at = now();
END $$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_discord_role_mapping(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_discord_account_link_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_my_discord_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_discord_role_mapping(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_discord_account_link_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_my_discord_account() TO authenticated;

REVOKE ALL ON FUNCTION public.discord_list_role_mappings(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_discord_account_link_code(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discord_set_signup(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discord_list_role_mappings(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_discord_account_link_code(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.discord_set_signup(uuid, bigint, text, text) TO service_role;
