-- Minimal stand-in for the Bifröst schema the drafts depend on, for testing
-- on a throwaway local Postgres. Not a copy of Bifröst.
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
-- Tests pick the signed-in user with SET test.uid and permissions with SET test.perm
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO PUBLIC;

CREATE TABLE public.organizations (id bigserial PRIMARY KEY, name text);
CREATE TABLE public.users (id uuid PRIMARY KEY, organization_id bigint, first_name text, last_name text);
CREATE TABLE public.user_roles (user_id uuid, organization_id bigint);
CREATE TABLE public.projects (id bigserial PRIMARY KEY, organization_id bigint, name text);
CREATE TABLE public.departments (id bigserial PRIMARY KEY, organization_id bigint, name text);
CREATE TABLE public.tasks (
  id bigserial PRIMARY KEY, title text, description text, type text, priority text, severity text,
  steps_to_reproduce text, reported_by text, reported_by_id uuid, column_id text NOT NULL,
  project_id bigint, department_id bigint, tags text[] DEFAULT '{}'
);
CREATE TABLE public.calendar_events (
  id bigserial PRIMARY KEY, organization_id bigint NOT NULL REFERENCES public.organizations(id),
  title text NOT NULL, type text NOT NULL CHECK (type IN ('holiday','meeting','company','retrospective','other')),
  event_date date NOT NULL, event_time text, department_id bigint,
  created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz DEFAULT now()
);

CREATE FUNCTION public.get_my_org_id() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
  AS $$ SELECT organization_id FROM public.users WHERE id = auth.uid() $$;
CREATE FUNCTION public.get_my_org_ids() RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
  AS $$ SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() $$;
CREATE FUNCTION public.has_org_permission(p_organization_id integer, p_key text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$ SELECT current_setting('test.perm', true) = 'yes'
          AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND organization_id = p_organization_id) $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Assertion helpers
CREATE FUNCTION public.t_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', label; END IF;
  RAISE NOTICE 'ok: %', label;
END $$;
CREATE FUNCTION public.t_fails(stmt text, pattern text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE pattern THEN RAISE EXCEPTION 'FAILED: % (wrong error: %)', label, SQLERRM; END IF;
    RAISE NOTICE 'ok: %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAILED: % (no error)', label;
END $$;
GRANT EXECUTE ON FUNCTION public.t_assert(boolean, text), public.t_fails(text, text, text) TO PUBLIC;

-- Two orgs: Kyrie (owner Brian, Game Design dept) and Other (Eve)
INSERT INTO public.organizations (name) VALUES ('Kyrie'), ('Other');
INSERT INTO public.users VALUES
  ('11111111-1111-1111-1111-111111111111', 1, 'Brian', 'B'),
  ('22222222-2222-2222-2222-222222222222', 2, 'Eve', 'E'),
  ('33333333-3333-3333-3333-333333333333', 1, 'Mia', 'M');
INSERT INTO public.user_roles VALUES
  ('11111111-1111-1111-1111-111111111111', 1),
  ('22222222-2222-2222-2222-222222222222', 2),
  ('33333333-3333-3333-3333-333333333333', 1);
INSERT INTO public.projects (organization_id, name) VALUES (1, 'Bifrost'), (2, 'Other project'), (1, 'Game');
INSERT INTO public.departments (organization_id, name) VALUES (1, 'Game Design'), (2, 'Other dept');
INSERT INTO public.calendar_events (organization_id, title, type, event_date, event_time, created_by) VALUES
  (1, 'Design sync', 'meeting', '2026-11-02', '17:00', '11111111-1111-1111-1111-111111111111'),
  (2, 'Other standup', 'meeting', '2026-11-02', '15:00', '22222222-2222-2222-2222-222222222222');
