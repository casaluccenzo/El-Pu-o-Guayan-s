-- Migration 033: las columnas reales de products pasan a ser mantenidas
-- por el mismo trigger que ya mantiene las columnas sombra (Plan A, 030).
-- Plan B, Task 2 (docs/superpowers/plans/2026-09-23-offline-first-pos-plan-B-frontend.md).
--
-- Punto de no retorno de Plan B: a partir de aca, products.stock/
-- initial_stock/max dejan de ser "lo que el codigo escribio" y pasan a ser
-- "lo que Postgres calculo desde stock_movements + day_closes".
BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_product_stock(p_product_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cat        text;
    v_t0         timestamptz := public.last_close_at();
    v_stock      integer;
    v_initial    integer;
    v_max_cfg    integer;
BEGIN
    SELECT category, max INTO v_cat, v_max_cfg
      FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_cat = 'pastelitos' THEN
        SELECT COALESCE(SUM(delta),0) INTO v_stock
          FROM public.stock_movements
         WHERE product_id = p_product_id AND created_at > v_t0;
        SELECT COALESCE(SUM(delta),0) INTO v_initial
          FROM public.stock_movements
         WHERE product_id = p_product_id AND created_at > v_t0 AND type = 'load';
    ELSE
        SELECT COALESCE(SUM(delta),0) INTO v_stock
          FROM public.stock_movements
         WHERE product_id = p_product_id;
        SELECT
          COALESCE((SELECT SUM(delta) FROM public.stock_movements
                     WHERE product_id = p_product_id AND created_at <= v_t0), 0)
          + COALESCE((SELECT SUM(delta) FROM public.stock_movements
                       WHERE product_id = p_product_id AND created_at > v_t0 AND type = 'load'), 0)
          INTO v_initial;
    END IF;

    UPDATE public.products
       SET stock_computed         = v_stock,
           initial_stock_computed = v_initial,
           max_computed           = GREATEST(v_initial, COALESCE(v_max_cfg, 0)),
           -- NUEVO: las columnas reales, mismo calculo.
           stock                  = v_stock,
           initial_stock          = v_initial,
           max                    = GREATEST(v_initial, COALESCE(v_max_cfg, 0))
     WHERE id = p_product_id;
END;
$$;

COMMIT;
