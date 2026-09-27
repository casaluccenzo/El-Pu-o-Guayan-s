-- Migration 036: wrap auth.uid() in RLS policies with (select ...) so Postgres
-- evaluates it once per query instead of once per row (Supabase performance
-- advisor, "Auth RLS Initialization Plan" -- 21 policies flagged 2026-09-27,
-- all of them here). No behavior change: (select auth.uid()) returns the
-- exact same value as auth.uid()) inside a policy, just cached per statement
-- instead of re-evaluated per row. Matters more every day now that
-- sales/stock_movements grow via Plan B's append-only model instead of
-- staying small with in-place updates.
BEGIN;

ALTER POLICY "Admin y Cocina/Venta pueden actualizar stock de productos" ON public.products
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Solo Admin puede insertar o eliminar productos" ON public.products
  USING ((get_user_role((select auth.uid())) = 'admin'::text) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = 'admin'::text) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Ver ventas por rol" ON public.sales
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Venta y Admin pueden registrar ventas" ON public.sales
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Venta y Admin pueden actualizar ventas" ON public.sales
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Venta y Admin pueden eliminar ventas" ON public.sales
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Ver gastos por rol" ON public.expenses
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Venta y Admin pueden registrar gastos" ON public.expenses
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Venta y Admin pueden borrar gastos" ON public.expenses
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Ver deudas por rol" ON public.debts
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Venta y Admin pueden gestionar deudas" ON public.debts
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Cocina y Admin pueden crear y actualizar reposiciones" ON public.replenishments
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Gestión de ingredientes" ON public.ingredients
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'cocina'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Admin y venta pueden ver y gestionar pedidos" ON public.pedidos_online
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Admin y venta pueden actualizar pedidos" ON public.pedidos_online
  USING ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))))
  WITH CHECK ((get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text])) AND (location_id = get_user_location((select auth.uid()))));

ALTER POLICY "Venta y cocina y admin insertan movimientos" ON public.stock_movements
  WITH CHECK (get_user_role((select auth.uid())) = ANY (ARRAY['venta'::text, 'cocina'::text, 'admin'::text]));

ALTER POLICY "Admin puede gestionar perfiles" ON public.profiles
  USING (get_user_role((select auth.uid())) = 'admin'::text)
  WITH CHECK (get_user_role((select auth.uid())) = 'admin'::text);

ALTER POLICY "Permitir lectura de perfiles propios y por rol" ON public.profiles
  USING (((select auth.uid()) = id) OR (get_user_role((select auth.uid())) = 'admin'::text) OR (active = true));

ALTER POLICY "Venta y admin cierran jornada" ON public.day_closes
  WITH CHECK (get_user_role((select auth.uid())) = ANY (ARRAY['venta'::text, 'admin'::text]));

ALTER POLICY "Venta y admin registran abonos" ON public.debt_payments
  WITH CHECK (get_user_role((select auth.uid())) = ANY (ARRAY['venta'::text, 'admin'::text]));

ALTER POLICY "Actualización de app_config por admin/venta" ON public.app_config
  USING (get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text]))
  WITH CHECK (get_user_role((select auth.uid())) = ANY (ARRAY['admin'::text, 'venta'::text]));

COMMIT;
