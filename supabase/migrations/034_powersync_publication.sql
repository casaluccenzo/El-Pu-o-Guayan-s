-- Migration 034: publication para PowerSync -- tablas que bajan al dispositivo
-- (spec §4, "Bajan al dispositivo"). NO incluye activity_logs,
-- bcv_rate_history, bcv_sync_log, pedidos_online, whatsapp_conversations
-- (esas quedan online-only).
--
-- Plan B, Task 1, Step 1 (docs/superpowers/plans/2026-09-23-offline-first-pos-plan-B-frontend.md).
-- Aplicada a mano por el dueño del proyecto en el SQL Editor de Supabase
-- (proyecto casa-lucenzo-dev) porque el MCP de Supabase bloquea
-- apply_migration por clasificador automático.
BEGIN;
CREATE PUBLICATION powersync FOR TABLE
  public.products,
  public.ingredients,
  public.profiles,
  public.app_config,
  public.sales,
  public.expenses,
  public.debts,
  public.debt_payments,
  public.stock_movements,
  public.replenishments,
  public.day_closes;
COMMIT;
