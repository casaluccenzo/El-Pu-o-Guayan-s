-- planB_assertions.sql — correr entero contra la RAMA de desarrollo
-- (casa-lucenzo-dev, NO producción / xttpaqokeyywjaajvjyu). No es una
-- migración. Una falla lanza EXCEPTION con prefijo 'planB:'.
-- Ver docs/superpowers/plans/2026-09-23-offline-first-pos-plan-B-frontend.md
--
-- Requiere el seed de planA_seed.sql ya cargado (usa el producto
-- 'seed-past-a', categoria pastelitos).

-- ---------------------------------------------------------------------------
-- Task 2: el trigger de stock_movements ahora tambien escribe las columnas
-- REALES (stock/initial_stock/max), no solo las sombra.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_stock_before          integer;
  v_initial_before        integer;
  v_stock_computed_before integer;
BEGIN
  SELECT stock, initial_stock, stock_computed
    INTO v_stock_before, v_initial_before, v_stock_computed_before
    FROM public.products WHERE id = 'seed-past-a';

  -- Un movimiento manual de prueba: +5 tipo 'load'.
  INSERT INTO public.stock_movements (id, product_id, delta, type, note)
  VALUES ('t-planB-1', 'seed-past-a', 5, 'load', 'planB_assertions: prueba temporal');

  -- El trigger AFTER INSERT (migracion 030) corrio recompute_product_stock,
  -- que con la migracion 033 aplicada debe haber escrito la columna REAL
  -- ademas de la sombra, y ambas deben coincidir.
  PERFORM 1 FROM public.products
   WHERE id = 'seed-past-a'
     AND stock = stock_computed
     AND initial_stock = initial_stock_computed
     AND max = max_computed;
  ASSERT FOUND,
         'planB: stock/initial_stock/max reales deben coincidir con las columnas sombra tras el insert';

  -- Limpieza: borrar el movimiento de prueba y forzar el recalculo manual
  -- (no hay trigger AFTER DELETE -- si no se hace esto, el producto queda
  -- con el estado de prueba pisado permanentemente).
  DELETE FROM public.stock_movements WHERE id = 't-planB-1';
  PERFORM public.recompute_product_stock('seed-past-a');

  PERFORM 1 FROM public.products
   WHERE id = 'seed-past-a'
     AND stock = v_stock_before
     AND initial_stock = v_initial_before
     AND stock_computed = v_stock_computed_before;
  ASSERT FOUND,
         'planB: seed-past-a debe quedar exactamente como estaba antes del test';
END $$;
