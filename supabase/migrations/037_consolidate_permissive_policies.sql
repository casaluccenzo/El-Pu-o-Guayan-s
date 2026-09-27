-- Migration 037: eliminate duplicate permissive RLS policy evaluation
-- (Supabase performance advisor, "Multiple Permissive Policies" -- 7 tables
-- flagged 2026-09-27). Postgres evaluates every permissive policy that
-- applies to a query and ORs the results -- when two policies both cover
-- the same role+action, that's pure duplicate work every time.
--
-- Each case here was checked individually before touching it: a `FOR ALL`
-- policy's SELECT (or, for products, also UPDATE) contribution is dropped
-- only where another policy already grants the exact same or a strictly
-- broader set of rows for that command -- never narrowed. `ALTER POLICY`
-- can't change which command a policy applies to, so the `ALL` policies
-- below are dropped and re-created as separate per-command policies for
-- just the commands that still need them.
--
-- Applied to casa-lucenzo-dev first, verified via pg_policies (exactly one
-- policy per table+command afterward, no overlaps, no gaps), then to
-- production. Re-ran the performance advisor afterward: both
-- auth_rls_initplan (036) and multiple_permissive_policies are gone.
BEGIN;

-- debts: "Ver deudas por rol" (SELECT) is byte-for-byte identical to what
-- "Venta y Admin pueden gestionar deudas" (ALL) already grants for SELECT.
-- Purely redundant -- no replacement needed.
DROP POLICY "Ver deudas por rol" ON public.debts;

-- app_config: SELECT is already unconditionally open via "Lectura de
-- app_config" (true, anon+authenticated) -- keep only INSERT/UPDATE/DELETE
-- for admin/venta (INSERT still needed: upsertAppConfig() does a real
-- upsert, which RLS checks as an INSERT even when it resolves as an UPDATE).
DROP POLICY "Actualización de app_config por admin/venta" ON public.app_config;

CREATE POLICY "Insertar app_config admin/venta" ON public.app_config
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text]));

CREATE POLICY "Actualizar app_config admin/venta" ON public.app_config
  FOR UPDATE TO authenticated
  USING (get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text]))
  WITH CHECK (get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text]));

CREATE POLICY "Borrar app_config admin/venta" ON public.app_config
  FOR DELETE TO authenticated
  USING (get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text]));

-- ingredients: SELECT already unconditionally open via "Lectura de
-- ingredientes" (true) -- keep only INSERT/UPDATE/DELETE for admin/cocina.
DROP POLICY "Gestión de ingredientes" ON public.ingredients;

CREATE POLICY "Insertar ingredientes admin/cocina" ON public.ingredients
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))));

CREATE POLICY "Actualizar ingredientes admin/cocina" ON public.ingredients
  FOR UPDATE TO authenticated
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))));

CREATE POLICY "Borrar ingredientes admin/cocina" ON public.ingredients
  FOR DELETE TO authenticated
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))));

-- products: SELECT already unconditionally open via "Todos los usuarios
-- autenticados pueden ver productos" (true). UPDATE already fully covered
-- by "Admin y Cocina/Venta pueden actualizar stock de productos" (its role
-- array already includes admin, so dropping this policy's UPDATE loses no
-- one's access). Keep only INSERT/DELETE for admin -- matches what the
-- policy's own name ("insertar o eliminar") always said it was for.
DROP POLICY "Solo Admin puede insertar o eliminar productos" ON public.products;

CREATE POLICY "Insertar productos admin" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role((select auth.uid())) = 'admin'::text) AND (location_id = get_user_location((select auth.uid()))));

CREATE POLICY "Borrar productos admin" ON public.products
  FOR DELETE TO authenticated
  USING ((get_user_role((select auth.uid())) = 'admin'::text) AND (location_id = get_user_location((select auth.uid()))));

-- profiles: SELECT already covered (self, active users, or admin) via
-- "Permitir lectura de perfiles propios y por rol" -- keep only
-- INSERT/UPDATE/DELETE for admin.
DROP POLICY "Admin puede gestionar perfiles" ON public.profiles;

CREATE POLICY "Insertar perfiles admin" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role((select auth.uid())) = 'admin'::text);

CREATE POLICY "Actualizar perfiles admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (get_user_role((select auth.uid())) = 'admin'::text)
  WITH CHECK (get_user_role((select auth.uid())) = 'admin'::text);

CREATE POLICY "Borrar perfiles admin" ON public.profiles
  FOR DELETE TO authenticated
  USING (get_user_role((select auth.uid())) = 'admin'::text);

-- replenishments: SELECT already unconditionally open via "Ver
-- reposiciones por rol" (true) -- keep only INSERT/UPDATE/DELETE for
-- admin/cocina/venta.
DROP POLICY "Cocina y Admin pueden crear y actualizar reposiciones" ON public.replenishments;

CREATE POLICY "Insertar reposiciones admin/cocina/venta" ON public.replenishments
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

CREATE POLICY "Actualizar reposiciones admin/cocina/venta" ON public.replenishments
  FOR UPDATE TO authenticated
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

CREATE POLICY "Borrar reposiciones admin/cocina/venta" ON public.replenishments
  FOR DELETE TO authenticated
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

COMMIT;
