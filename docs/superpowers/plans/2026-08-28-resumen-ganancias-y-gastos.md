# Resumen de Ganancias + Gestión de Gastos — Implementation Plan

> **Estado (revisado 2026-09-27): implementado.** Migración `020_expense_categories.sql`, `estimateProductionCost` y `aggregatePnl` en `js/analytics.js` (con tests en `tests/unit.test.js`), `fetchExpensesRange`/`fetchPnlData` en `js/supabase.js`, pestañas "Gastos" y "Ganancias" y `exportPnlToPDF`. El "Deploy checklist" de abajo era para Casa Lucenzo; no se re-verificó contra la base de El Puño.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weekly/monthly profit summary (Ventas − Costo terceros − Gastos = Ganancia neta) with per-category product breakdown and PDF export, plus an admin section to log categorized fixed expenses (arriendo, sueldos, servicios) in $ or Bs.

**Architecture:** Pure aggregation lives in `js/analytics.js` (dependency-free, unit-tested). Data is fetched per date-range on demand from Supabase (`js/supabase.js`) and cached in memory. Two new admin sidebar tabs ("Ganancias", "Gastos") reuse the existing `activateTab()` state machine and `panel-*` div pattern. PDFs reuse the `window.open('', '_blank') + document.write + window.print()` pattern already used by `exportSalesAnalyticsToPDF`. One additive DB migration on `expenses`.

**Tech Stack:** Vanilla JS (no framework, no build step for JS), Supabase JS client, PostgREST, Node `assert` test runner (`tests/unit.test.js`), Font Awesome icons, service worker cache-busting via `?v=` + `APP_VERSION`.

**Spec:** `docs/superpowers/specs/2026-08-28-resumen-ganancias-semanal-mensual-design.md`

## Global Constraints

- **Live production POS.** Single domain `casalucenzo.com`. Verify there after deploy, not only locally. (memory: `feedback_production_deploy_caution`)
- **Deploy order for the migration is mandatory:** migration 020 must be applied to the DB *before* client code that sends `category`/`currency`/`bcv_rate` in an `expenses` insert reaches production. An unknown column fails the whole insert.
- **Cache-busting must stay in sync:** `sistema/index.html` has **17** `?v=317` occurrences (16 `<script src="/js/*.js">` tags + 1 on `main.css`); `sw.js` has `APP_VERSION` (its `/css/main.css?v=${APP_VERSION}` follows the var automatically). Current: `317`. Bump every occurrence to `318` in the final task.
- **No new JS file.** All new calc goes in `js/analytics.js` (already loaded, already in `SCRIPTS`). This keeps the `SCRIPTS` array in `sw.js` unchanged.
- `js/analytics.js` must stay dependency-free (no `window.*` at call time) — it runs under `node tests/unit.test.js`. Pass `bcvRate` in as a parameter.
- Money display convention: `$` primary with `Bs` secondary. USD formatted `$X.XX`; Bs formatted `Bs. X.XXX,XX` via `toLocaleString('es-VE', { minimumFractionDigits: 2 })`.
- Spanish UI copy. Weekday/month labels hardcoded in Spanish (do not rely on browser locale).
- Admin-only: both new tabs live inside `admin-dashboard` view which is already admin-gated; handlers still early-return `if (currentRole !== 'admin') return;`.
- TDD: write the failing test first for every `analytics.js` function. Run `npm test` (which runs `node tests/unit.test.js`).
- Commit after every green step.

---

## File Structure

**Created:**
- `supabase/migrations/020_expense_categories.sql` — additive columns on `expenses`.

**Modified:**
- `js/analytics.js` — add `estimateProductionCost()`, `aggregatePnl()`, helpers, category constants; extend both `module.exports` and `window.AnalyticsManager`.
- `js/supabase.js` — add `fetchExpensesRange()`, `fetchPnlData()`; extend `insertExpense()` payload; export the two new fns on `window.SupabaseManager`.
- `js/app.js` — add `addAdminExpense()`, `loadAndRenderExpensesTab()`, `loadPnl()` + period-nav state; extend `addExpense()` expense shape; wire the two new tabs in `initAdminDashboardListeners()`.
- `js/ui.js` — add `renderAdminExpenses()`, `renderPnl()`, `exportPnlToPDF()`; refactor `exportDayCloseToPDF()` to call `estimateProductionCost()`; export the new fns on `window.UIManager`.
- `sistema/index.html` — 2 new sidebar buttons, 2 new `admin-panel-*` divs, bump 16 `?v=` tags.
- `sw.js` — bump `APP_VERSION`.
- `tests/unit.test.js` — import + test the new `analytics.js` functions.

---

## Task 1: Migration 020 — additive expense columns

**Files:**
- Create: `supabase/migrations/020_expense_categories.sql`

**Interfaces:**
- Produces: `expenses.category text` (nullable), `expenses.currency text NOT NULL DEFAULT 'USD'`, `expenses.bcv_rate numeric` (nullable).

- [x] **Step 1: Write the migration file**

```sql
-- Migration 020: Categorías y moneda en gastos
--
-- CONTEXTO
-- Hasta ahora `expenses` era una tabla plana (description, amount, timestamp)
-- y todos los gastos se cargaban desde el flujo de caja de Ventas, sin
-- categoría y asumidos en USD. Se agrega una sección admin para cargar
-- gastos fijos (arriendo, sueldos, servicios), que pueden pagarse en $ o Bs.
--
-- Todo aditivo:
--   category  -> 'arriendo' | 'sueldos' | 'servicios' | 'otros'.
--                NULL en filas viejas y en gastos de mostrador -> se leen
--                como 'otros' del lado del cliente.
--   currency  -> 'USD' | 'VES'. DEFAULT 'USD' para no romper inserts viejos.
--   bcv_rate  -> tasa BCV congelada al cargar el gasto (relevante solo si
--                currency = 'VES'), mismo patrón que sales.bcv_rate.
--
-- Sin cambios de RLS: las políticas de `expenses` (001/010/011) no
-- referencian columnas puntuales. Sin trigger de relleno server-side: el
-- form admin siempre manda los tres campos y el DEFAULT cubre rutas viejas.

BEGIN;

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS bcv_rate numeric;

COMMIT;
```

- [x] **Step 2: Verify it parses / dry check**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/020_expense_categories.sql','utf8'); if(!/ADD COLUMN IF NOT EXISTS/.test(s)) throw new Error('bad'); console.log('ok')"`
Expected: prints `ok`

- [x] **Step 3: Commit**

```bash
git add supabase/migrations/020_expense_categories.sql
git commit -m "feat(db): migration 020 — category/currency/bcv_rate on expenses"
```

> **Rollout note (not a code step):** applying this migration to the production Supabase project is done at deploy time by the human, BEFORE the client bundle that writes these columns ships. See `superpowers:finishing-a-development-branch` / the deploy checklist. `mcp__supabase__apply_migration` is available if the operator chooses to use it.

---

## Task 2: `estimateProductionCost()` in analytics.js

Generalizes the per-day tercero-cost estimation currently inlined in `exportDayCloseToPDF` (`js/ui.js:4580-4601`) to a multi-day range.

**Files:**
- Modify: `js/analytics.js` (add function + export in both `module.exports` and `window.AnalyticsManager`)
- Test: `tests/unit.test.js`

**Interfaces:**
- Consumes: sale rows shaped `{ productId|product_id, price, cost_at_sale, bcv_rate, timestamp }`; product rows `{ id, cost, category }`.
- Produces:
  `estimateProductionCost(sales, products, bcvRate) -> { bs: number, usd: number, isEstimated: boolean, estimatedDays: number, realDays: number }`
  - `bs`: total tercero cost in Bs across the range (real days use Σ `cost_at_sale`; estimated days use Σ current `product.cost`).
  - `usd`: real days converted per-sale by `cost_at_sale / (sale.bcv_rate || bcvRate)`; estimated days converted by `estimatedDayBs / bcvRate`.
  - a day is "estimated" only when its Σ `cost_at_sale` is 0 **and** it had ≥1 non-`abono` sale of a product whose `cost > 0`.

- [x] **Step 1: Write the failing tests**

Add to `tests/unit.test.js` inside `runAnalyticsUnitTests()` (after the existing analytics assertions). Reuse the file's `pastWeekday`/`saleAt` helpers; extend `saleAt` locally with a variant that sets `cost_at_sale` and `bcv_rate`:

```javascript
    // --- estimateProductionCost ---
    function saleCost(date, productId, price, costAtSale, rate) {
        return { productId, product_id: productId, name: productId, price,
                 cost_at_sale: costAtSale, bcv_rate: rate, timestamp: date.toISOString() };
    }
    const costProducts = [
        { id: 'mechada', name: 'Mechada', category: 'pastelitos', cost: 800 },
        { id: 'cafe', name: 'Café', category: 'bebidas', cost: 0 }
    ];
    const d1 = pastWeekday(2, 1); // some Tuesday last week
    const d2 = pastWeekday(3, 1); // some Wednesday last week

    // Day 1: real cost recorded (2 x 800 Bs @ rate 40) -> 1600 Bs, 40 USD
    // Day 2: NO cost recorded (old day) -> estimate 3 x 800 = 2400 Bs @ bcvRate 50 -> 48 USD
    const mixedSales = [
        saleCost(d1, 'mechada', 2, 800, 40),
        saleCost(d1, 'mechada', 2, 800, 40),
        saleCost(d2, 'mechada', 2, 0, null),
        saleCost(d2, 'mechada', 2, 0, null),
        saleCost(d2, 'mechada', 2, 0, null)
    ];
    const est = getEstimate(mixedSales, costProducts, 50);
    assert.strictEqual(est.bs, 1600 + 2400, "estimateProductionCost: bs = real 1600 + estimated 2400");
    assert.strictEqual(est.estimatedDays, 1, "estimateProductionCost: exactly 1 day estimated");
    assert.strictEqual(est.realDays, 1, "estimateProductionCost: exactly 1 day real");
    assert.strictEqual(est.isEstimated, true, "estimateProductionCost: isEstimated true when any day estimated");
    assert.strictEqual(Number(est.usd.toFixed(2)), 40 + 48, "estimateProductionCost: usd = 40 real + 48 estimated");
    console.log("✅ TEST PASSED: estimateProductionCost splits real vs estimated days");

    // Only-abono day is not an estimated day
    const abonoOnly = [{ productId: 'abono', product_id: 'abono', name: 'Abono', price: 5, cost_at_sale: 0, bcv_rate: null, timestamp: d1.toISOString() }];
    const est2 = getEstimate(abonoOnly, costProducts, 50);
    assert.strictEqual(est2.estimatedDays, 0, "estimateProductionCost: an abono-only day is never 'estimated'");
    assert.strictEqual(est2.isEstimated, false, "estimateProductionCost: no estimation when nothing to estimate");
    console.log("✅ TEST PASSED: estimateProductionCost ignores abono-only days");

    // A product with cost 0 does not inflate the estimate
    const cafeDay = [saleCost(d2, 'cafe', 1, 0, null)];
    const est3 = getEstimate(cafeDay, costProducts, 50);
    assert.strictEqual(est3.bs, 0, "estimateProductionCost: cost-0 product contributes nothing");
    assert.strictEqual(est3.estimatedDays, 0, "estimateProductionCost: cost-0-only day is not estimated");
    console.log("✅ TEST PASSED: estimateProductionCost ignores cost-0 products");
```

Add `getEstimate` (aliased) to the destructured import at the top of `tests/unit.test.js`:

```javascript
const {
    WEEKDAY_LABELS,
    getWeekdayPattern,
    compareVsWeekdayAverage,
    getFlavorRanking,
    getDailyPrepRecommendation,
    getRecentTrend,
    getUpcomingProjection,
    buildPerformanceInsights,
    estimateProductionCost: getEstimate,
    aggregatePnl
} = require('../js/analytics');
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `getEstimate is not a function` (or the Analytics suite throws).

- [x] **Step 3: Implement `estimateProductionCost` in `js/analytics.js`**

Add after `getDailyPrepRecommendation` (uses the file's existing `parseTimestamp` / `dateKey`):

```javascript
/**
 * Costo total pagado (o a pagar) al tercero por producción en un rango.
 *
 * Por día: si Σ cost_at_sale > 0 ese día tiene dato real y se respeta. Si
 * es 0 pero hubo ventas no-abono de productos con products.cost > 0, ese
 * día se ESTIMA con el costo actual por unidad (mismo criterio que usaba
 * exportDayCloseToPDF). Un día solo-abono, o solo productos con cost 0, no
 * se marca como estimado: su costo 0 es correcto.
 *
 * @param {Array} sales Filas de venta (con cost_at_sale, bcv_rate, timestamp)
 * @param {Array} products Catálogo actual (con id, cost, category)
 * @param {number} bcvRate Tasa actual, para convertir los días estimados y
 *   los reales sin bcv_rate propia.
 * @returns {{bs:number, usd:number, isEstimated:boolean, estimatedDays:number, realDays:number}}
 */
function estimateProductionCost(sales = [], products = [], bcvRate = 1) {
    const rate = bcvRate > 0 ? bcvRate : 1;
    const productById = {};
    (products || []).forEach(p => { if (p && p.id != null) productById[p.id] = p; });

    // Agrupar por día local
    const byDay = {};
    (sales || []).forEach(s => {
        if (!s || !s.timestamp) return;
        const key = dateKey(parseTimestamp(s.timestamp));
        (byDay[key] = byDay[key] || []).push(s);
    });

    let bs = 0;
    let usd = 0;
    let estimatedDays = 0;
    let realDays = 0;

    Object.values(byDay).forEach(daySales => {
        const realBs = daySales.reduce((sum, s) => sum + (parseFloat(s.cost_at_sale) || 0), 0);

        if (realBs > 0) {
            realDays += 1;
            bs += realBs;
            usd += daySales.reduce((sum, s) => {
                const c = parseFloat(s.cost_at_sale) || 0;
                if (c <= 0) return sum;
                const r = parseFloat(s.bcv_rate) > 0 ? parseFloat(s.bcv_rate) : rate;
                return sum + c / r;
            }, 0);
            return;
        }

        // realBs === 0 -> ¿estimable?
        const estBs = daySales.reduce((sum, s) => {
            const pid = s.productId || s.product_id;
            if (!pid || pid === 'abono') return sum;
            const prod = productById[pid];
            const c = prod && prod.cost ? parseFloat(prod.cost) : 0;
            return sum + (c > 0 ? c : 0);
        }, 0);

        if (estBs > 0) {
            estimatedDays += 1;
            bs += estBs;
            usd += estBs / rate;
        }
    });

    return {
        bs: Number(bs.toFixed(2)),
        usd: Number(usd.toFixed(2)),
        isEstimated: estimatedDays > 0,
        estimatedDays,
        realDays
    };
}
```

- [x] **Step 4: Add to both exports in `js/analytics.js`**

In the `AnalyticsManager` object literal add `estimateProductionCost,`. In the `module.exports = { ... }` block add `estimateProductionCost,`. (Leave `aggregatePnl` out until Task 4.)

- [x] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — the 3 new `estimateProductionCost` assertions print `✅`.

- [x] **Step 6: Commit**

```bash
git add js/analytics.js tests/unit.test.js
git commit -m "feat(analytics): estimateProductionCost — per-day real vs estimated tercero cost"
```

---

## Task 3: Refactor `exportDayCloseToPDF` to use `estimateProductionCost`

Removes the duplicate estimation logic. Behavior for a single day must not change.

**Files:**
- Modify: `js/ui.js:4568-4602` (inside `exportDayCloseToPDF`)

**Interfaces:**
- Consumes: `AnalyticsManager.estimateProductionCost(sales, products, bcvRate)` from Task 2.

- [x] **Step 1: Replace the inline estimation block**

In `exportDayCloseToPDF`, replace lines ~4576-4602 (from the `// Costo de producción por venta` comment through `const netMarginBs = ...`) with:

```javascript
    // Costo de producción (tercero). Congelado en cost_at_sale por venta;
    // para días viejos sin ese dato se estima con el costo actual por
    // unidad -- misma lógica compartida con el resumen de Ganancias.
    const prodCost = window.AnalyticsManager.estimateProductionCost(salesLog, products, rate);
    const isEstimatedCost = prodCost.isEstimated;
    const productionCostBsForDisplay = prodCost.bs;
    const netMarginBs = (totalSales * rate) - productionCostBsForDisplay;
```

Note: the old code only estimated when `totalProductionCostBs === 0` for the whole (single-day) `salesLog`; `estimateProductionCost` does the same thing per-day, and a day-close is one day, so the result is identical. The `totalProductionCostBs` local is no longer needed — delete its declaration (~line 4578) if nothing else references it (grep within the function).

- [x] **Step 2: Verify no other reference broke**

Run: `grep -n "totalProductionCostBs\|isEstimatedCost\|productionCostBsForDisplay" js/ui.js`
Expected: every remaining hit is inside `exportDayCloseToPDF` and resolves to the new locals.

- [x] **Step 3: Run tests**

Run: `npm test`
Expected: PASS (no test covers this function directly; this confirms nothing else broke).

- [x] **Step 4: Manual smoke (dev server)**

Start dev server (`.claude/launch.json` → preview_start), log in as admin, open a day-close report for a recent day and for a pre-2026-08-22 day. Confirm the "Costo de Producción (Terceros)" KPI shows a real value for the recent day and an "(Estimado)" value for the old day, same as before.

- [x] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "refactor(ui): exportDayCloseToPDF uses shared estimateProductionCost"
```

---

## Task 4: `aggregatePnl()` in analytics.js

The core P&L aggregation. Pure function, no `window.*`.

**Files:**
- Modify: `js/analytics.js`
- Test: `tests/unit.test.js`

**Interfaces:**
- Consumes: `estimateProductionCost` (Task 2); sale rows `{ productId|product_id, name, price, cost_at_sale, bcv_rate, timestamp }`; expense rows `{ description, amount, timestamp, category, currency, bcv_rate }`; product rows `{ id, name, category, cost }`.
- Produces:
  `aggregatePnl(sales, expenses, products, { start, end, periodLabel, bcvRate }) -> pnl`
  where `pnl` is:

```
{
  period: { start: Date, end: Date, label: string },
  totals: {
    ventasUsd: number,               // Σ price de ventas NO-abono
    costoTerceros: { bs, usd, isEstimated, estimatedDays },
    gastosUsd: number,
    gananciaNetaUsd: number          // ventasUsd - costoTerceros.usd - gastosUsd
  },
  categorias: [
    { key, label, unidades, ventasUsd, costoTercerosUsd, margenUsd,
      productos: [ { name, unidades, ventasUsd } ] }   // productos sorted by unidades desc
  ],
  gastos: {
    totalUsd: number,
    porCategoria: [
      { key, label, montoUsd,
        items: [ { description, montoUsd, currency, montoOriginal, fecha } ] }
    ]
  },
  abonos: { count: number, montoUsd: number },
  dias: [ { fecha: 'YYYY-MM-DD', ventasUsd, gastosUsd, gananciaUsd } ]
}
```

Category rules (mirror `exportDayCloseToPDF`): `product.category === 'bebidas'|'dulces'` map straight; `'pastelitos'` → `pasteles`; missing/`otros` → name contains `malta|refresco|agua|jugo` ⇒ `bebidas`, else `pasteles`. Clean product name with `/\s*\[.*\](\s*\(Pagado(?: - .*?)?\))?$/`.
Expense category: `arriendo|sueldos|servicios` pass through; anything else (incl. null) → `otros`. Present order: `arriendo, sueldos, servicios, otros`.
Expense USD: `currency` is `VES`/`Bs` ⇒ `amount / (bcv_rate || bcvRate)`; else `amount` as-is.
`costoTercerosUsd` per category: only `pasteles` (and any `otros`/category whose products have `cost>0`) get a share — computed as the category's portion of `estimateProductionCost`. Simplest correct approach: run `estimateProductionCost` on the full `sales` for `totals`, and for per-category, run it again on the subset of sales whose resolved category === that category.

- [x] **Step 1: Write the failing tests**

Add to `runAnalyticsUnitTests()` in `tests/unit.test.js`:

```javascript
    // --- aggregatePnl ---
    const pnlProducts = [
        { id: 'mechada', name: 'Mechada [Bandeja]', category: 'pastelitos', cost: 800 },
        { id: 'cafe', name: 'Café', category: 'bebidas', cost: 0 },
        { id: 'bombon', name: 'Bombón', category: 'dulces', cost: 0 }
    ];
    const pStart = new Date(); pStart.setDate(pStart.getDate() - 6); pStart.setHours(0,0,0,0);
    const pEnd = new Date(); pEnd.setHours(23,59,59,999);
    const day = new Date(); day.setHours(12,0,0,0);
    const pnlSales = [
        // 3 mechada @ $2, real cost 800 Bs @ rate 40  -> ventas 6, terceros 60 Bs? -> 3*800=2400 Bs -> /40 = 60 USD
        { productId:'mechada', name:'Mechada [Bandeja]', price:2, cost_at_sale:800, bcv_rate:40, timestamp: day.toISOString() },
        { productId:'mechada', name:'Mechada [Bandeja]', price:2, cost_at_sale:800, bcv_rate:40, timestamp: day.toISOString() },
        { productId:'mechada', name:'Mechada [Bandeja]', price:2, cost_at_sale:800, bcv_rate:40, timestamp: day.toISOString() },
        // 2 café @ $1
        { productId:'cafe', name:'Café', price:1, cost_at_sale:0, bcv_rate:40, timestamp: day.toISOString() },
        { productId:'cafe', name:'Café', price:1, cost_at_sale:0, bcv_rate:40, timestamp: day.toISOString() },
        // 1 abono $5 -> excluded from ventas
        { productId:'abono', name:'Abono', price:5, cost_at_sale:0, bcv_rate:40, timestamp: day.toISOString() }
    ];
    const pnlExpenses = [
        { description:'Arriendo agosto', amount:100, currency:'USD', bcv_rate:null, category:'arriendo', timestamp: day.toISOString() },
        { description:'CANTV', amount:2000, currency:'VES', bcv_rate:40, category:'servicios', timestamp: day.toISOString() }, // -> 50 USD
        { description:'Servilletas', amount:3, currency:'USD', bcv_rate:null, category:null, timestamp: day.toISOString() }    // -> otros
    ];
    const pnl = aggregatePnl(pnlSales, pnlExpenses, pnlProducts,
        { start: pStart, end: pEnd, periodLabel: 'Semana test', bcvRate: 40 });

    assert.strictEqual(pnl.totals.ventasUsd, 8, "aggregatePnl: ventas = 3*2 + 2*1 (abono excluido)");
    assert.strictEqual(pnl.totals.costoTerceros.usd, 60, "aggregatePnl: terceros = 2400 Bs / 40");
    assert.strictEqual(pnl.totals.costoTerceros.isEstimated, false, "aggregatePnl: cost is real, not estimated");
    assert.strictEqual(pnl.totals.gastosUsd, 153, "aggregatePnl: gastos = 100 + 50 + 3");
    assert.strictEqual(pnl.totals.gananciaNetaUsd, 8 - 60 - 153, "aggregatePnl: ganancia neta cascades (negative ok)");
    console.log("✅ TEST PASSED: aggregatePnl totals cascade");

    const past = pnl.categorias.find(c => c.key === 'pasteles');
    assert.strictEqual(past.unidades, 3, "aggregatePnl: pasteles has 3 units");
    assert.strictEqual(past.ventasUsd, 6, "aggregatePnl: pasteles ventas 6");
    assert.strictEqual(past.costoTercerosUsd, 60, "aggregatePnl: pasteles carries the full tercero cost");
    assert.strictEqual(past.margenUsd, -54, "aggregatePnl: pasteles margen = 6 - 60");
    assert.strictEqual(past.productos[0].name, 'Mechada', "aggregatePnl: product name cleaned of [Bandeja]");
    const beb = pnl.categorias.find(c => c.key === 'bebidas');
    assert.strictEqual(beb.costoTercerosUsd, 0, "aggregatePnl: bebidas has no tercero cost");
    console.log("✅ TEST PASSED: aggregatePnl per-category breakdown");

    assert.strictEqual(pnl.abonos.count, 1, "aggregatePnl: 1 abono");
    assert.strictEqual(pnl.abonos.montoUsd, 5, "aggregatePnl: abono total 5, outside ventas");
    const gArr = pnl.gastos.porCategoria.find(g => g.key === 'arriendo');
    const gOtros = pnl.gastos.porCategoria.find(g => g.key === 'otros');
    assert.strictEqual(gArr.montoUsd, 100, "aggregatePnl: arriendo 100");
    assert.strictEqual(gOtros.montoUsd, 3, "aggregatePnl: uncategorized expense falls into otros");
    assert.strictEqual(pnl.gastos.porCategoria[0].key, 'arriendo', "aggregatePnl: gasto categories ordered arriendo-first");
    console.log("✅ TEST PASSED: aggregatePnl abonos + expense categories");

    const emptyPnl = aggregatePnl([], [], pnlProducts, { start: pStart, end: pEnd, periodLabel: 'Vacío', bcvRate: 40 });
    assert.strictEqual(emptyPnl.totals.ventasUsd, 0, "aggregatePnl: empty period -> zeros, no throw");
    assert.strictEqual(emptyPnl.categorias.length, 0, "aggregatePnl: empty period -> no categories");
    assert.strictEqual(emptyPnl.totals.gananciaNetaUsd, 0, "aggregatePnl: empty period -> ganancia 0");
    console.log("✅ TEST PASSED: aggregatePnl handles an empty period");
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `aggregatePnl is not a function`.

- [x] **Step 3: Implement `aggregatePnl` in `js/analytics.js`**

Add after `estimateProductionCost`:

```javascript
const PNL_CATEGORY_META = {
    pasteles: { label: '🥐 Pasteles y Repostería', order: 1 },
    bebidas:  { label: '🥤 Bebidas',               order: 2 },
    dulces:   { label: '🍬 Dulces',                order: 3 },
    otros:    { label: '📦 Otros / Varios',         order: 4 }
};

const EXPENSE_CATEGORY_META = {
    arriendo:  { label: 'Arriendo local', order: 1 },
    sueldos:   { label: 'Sueldos',        order: 2 },
    servicios: { label: 'Servicios',      order: 3 },
    otros:     { label: 'Otros / diarios', order: 4 }
};

const PRODUCT_NAME_CLEAN_RE = /\s*\[.*\](\s*\(Pagado(?: - .*?)?\))?$/;

function resolvePnlCategory(sale, productById) {
    const pid = sale.productId || sale.product_id;
    const prod = pid ? productById[pid] : null;
    let cat = prod ? prod.category : '';
    if (!cat || cat === 'otros') {
        const n = (sale.name || '').toLowerCase();
        cat = /malta|refresco|agua|jugo/.test(n) ? 'bebidas' : 'pastelitos';
    }
    if (cat === 'pastelitos') return 'pasteles';
    if (cat === 'bebidas' || cat === 'dulces') return cat;
    return 'otros';
}

function resolveExpenseCategory(exp) {
    const c = (exp.category || '').toLowerCase();
    return EXPENSE_CATEGORY_META[c] && c !== 'otros' ? c
         : (c === 'otros' ? 'otros' : 'otros');
}

function expenseUsd(exp, bcvRate) {
    const amt = parseFloat(exp.amount) || 0;
    const cur = (exp.currency || 'USD').toUpperCase();
    if (cur === 'VES' || cur === 'BS') {
        const r = parseFloat(exp.bcv_rate) > 0 ? parseFloat(exp.bcv_rate) : (bcvRate > 0 ? bcvRate : 1);
        return amt / r;
    }
    return amt;
}

/**
 * P&L de un período: ventas de mercadería, costo del tercero, gastos y
 * ganancia neta, con desglose por categoría de producto y de gasto.
 * Puro: no lee window.*; la tasa entra por opts.bcvRate.
 */
function aggregatePnl(sales = [], expenses = [], products = [], opts = {}) {
    const { start, end, periodLabel = '', bcvRate = 1 } = opts;
    const rate = bcvRate > 0 ? bcvRate : 1;

    const productById = {};
    (products || []).forEach(p => { if (p && p.id != null) productById[p.id] = p; });

    const merch = [];
    let abonoCount = 0;
    let abonoUsd = 0;
    (sales || []).forEach(s => {
        const pid = s.productId || s.product_id;
        if (pid === 'abono') { abonoCount += 1; abonoUsd += parseFloat(s.price) || 0; return; }
        merch.push(s);
    });

    const ventasUsd = merch.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
    const costoTerceros = estimateProductionCost(merch, products, rate);

    // Categorías de producto
    const catMap = {};
    merch.forEach(s => {
        const key = resolvePnlCategory(s, productById);
        const c = catMap[key] || (catMap[key] = { key, label: PNL_CATEGORY_META[key].label, unidades: 0, ventasUsd: 0, _prod: {} });
        c.unidades += 1;
        c.ventasUsd += parseFloat(s.price) || 0;
        const name = (s.name || '').replace(PRODUCT_NAME_CLEAN_RE, '') || (s.productId || s.product_id || '—');
        const p = c._prod[name] || (c._prod[name] = { name, unidades: 0, ventasUsd: 0 });
        p.unidades += 1;
        p.ventasUsd += parseFloat(s.price) || 0;
    });

    const categorias = Object.values(catMap).map(c => {
        const subset = merch.filter(s => resolvePnlCategory(s, productById) === c.key);
        const catCost = estimateProductionCost(subset, products, rate);
        return {
            key: c.key,
            label: c.label,
            unidades: c.unidades,
            ventasUsd: Number(c.ventasUsd.toFixed(2)),
            costoTercerosUsd: catCost.usd,
            margenUsd: Number((c.ventasUsd - catCost.usd).toFixed(2)),
            productos: Object.values(c._prod)
                .map(p => ({ name: p.name, unidades: p.unidades, ventasUsd: Number(p.ventasUsd.toFixed(2)) }))
                .sort((a, b) => b.unidades - a.unidades)
        };
    }).sort((a, b) => PNL_CATEGORY_META[a.key].order - PNL_CATEGORY_META[b.key].order);

    // Gastos
    const gMap = {};
    (expenses || []).forEach(e => {
        const key = resolveExpenseCategory(e);
        const g = gMap[key] || (gMap[key] = { key, label: EXPENSE_CATEGORY_META[key].label, montoUsd: 0, items: [] });
        const usd = expenseUsd(e, rate);
        g.montoUsd += usd;
        g.items.push({
            description: e.description || '',
            montoUsd: Number(usd.toFixed(2)),
            currency: (e.currency || 'USD').toUpperCase(),
            montoOriginal: parseFloat(e.amount) || 0,
            fecha: dateKey(parseTimestamp(e.timestamp))
        });
    });
    const gastosCategorias = Object.values(gMap)
        .map(g => ({ ...g, montoUsd: Number(g.montoUsd.toFixed(2)) }))
        .sort((a, b) => EXPENSE_CATEGORY_META[a.key].order - EXPENSE_CATEGORY_META[b.key].order);
    const gastosUsd = gastosCategorias.reduce((sum, g) => sum + g.montoUsd, 0);

    // Serie diaria
    const dayMap = {};
    merch.forEach(s => {
        const k = dateKey(parseTimestamp(s.timestamp));
        (dayMap[k] = dayMap[k] || { fecha: k, ventasUsd: 0, gastosUsd: 0 }).ventasUsd += parseFloat(s.price) || 0;
    });
    (expenses || []).forEach(e => {
        const k = dateKey(parseTimestamp(e.timestamp));
        (dayMap[k] = dayMap[k] || { fecha: k, ventasUsd: 0, gastosUsd: 0 }).gastosUsd += expenseUsd(e, rate);
    });
    const dias = Object.values(dayMap)
        .map(d => ({
            fecha: d.fecha,
            ventasUsd: Number(d.ventasUsd.toFixed(2)),
            gastosUsd: Number(d.gastosUsd.toFixed(2)),
            gananciaUsd: Number((d.ventasUsd - d.gastosUsd).toFixed(2))
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const gananciaNetaUsd = Number((ventasUsd - costoTerceros.usd - gastosUsd).toFixed(2));

    return {
        period: { start, end, label: periodLabel },
        totals: {
            ventasUsd: Number(ventasUsd.toFixed(2)),
            costoTerceros,
            gastosUsd: Number(gastosUsd.toFixed(2)),
            gananciaNetaUsd
        },
        categorias,
        gastos: { totalUsd: Number(gastosUsd.toFixed(2)), porCategoria: gastosCategorias },
        abonos: { count: abonoCount, montoUsd: Number(abonoUsd.toFixed(2)) },
        dias
    };
}
```

(Note `resolveExpenseCategory` collapses to `'otros'` for anything not in the known set — the ternary is written verbosely for clarity; a reviewer may simplify to `return EXPENSE_CATEGORY_META[c] ? c : 'otros';`.)

- [x] **Step 4: Export it**

Add `aggregatePnl,` to both the `AnalyticsManager` object and the `module.exports` block in `js/analytics.js`.

- [x] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 4 new `aggregatePnl` assertion groups print `✅`.

- [x] **Step 6: Commit**

```bash
git add js/analytics.js tests/unit.test.js
git commit -m "feat(analytics): aggregatePnl — weekly/monthly P&L with category + expense breakdown"
```

---

## Task 5: Data layer — `fetchExpensesRange` + `fetchPnlData` in supabase.js

**Files:**
- Modify: `js/supabase.js` (add 2 functions; extend `insertExpense` payload; extend `window.SupabaseManager`)

**Interfaces:**
- Consumes: existing `client`, `fetchAllPages`, `POSTGREST_PAGE_SIZE`.
- Produces:
  - `fetchExpensesRange(startISO, endISO) -> Promise<Array>` — expense rows in `[start, end)`.
  - `fetchPnlData(startISO, endISO) -> Promise<{ sales: Array, expenses: Array }>` — sales rows have `productId` normalized from `product_id`.

- [x] **Step 1: Extend `insertExpense` payload (`js/supabase.js:633-640`)**

```javascript
async function insertExpense(expense) {
    if (!client) return;
    const payload = {
        uuid: expense.uuid,
        description: expense.description,
        amount: expense.amount,
        timestamp: expense.timestamp,
        category: expense.category || null,
        currency: expense.currency || 'USD',
        bcv_rate: expense.bcv_rate != null ? expense.bcv_rate : null
    };
    // ... rest unchanged
```

- [x] **Step 2: Add the two fetch functions**

Place near `fetchStatsData` (`js/supabase.js:~1114`):

```javascript
async function fetchExpensesRange(startISO, endISO) {
    if (!client) return [];
    try {
        return await fetchAllPages(offset => client.from('expenses').select('*')
            .gte('timestamp', startISO)
            .lt('timestamp', endISO)
            .order('timestamp', { ascending: true })
            .range(offset, offset + POSTGREST_PAGE_SIZE - 1));
    } catch (e) {
        console.error('fetchExpensesRange failed:', e.message);
        return [];
    }
}

async function fetchPnlData(startISO, endISO) {
    if (!client) return { sales: [], expenses: [] };
    try {
        const [sales, expenses] = await Promise.all([
            fetchAllPages(offset => client.from('sales').select('*')
                .gte('timestamp', startISO)
                .lt('timestamp', endISO)
                .order('timestamp', { ascending: true })
                .range(offset, offset + POSTGREST_PAGE_SIZE - 1)),
            fetchExpensesRange(startISO, endISO)
        ]);
        const normSales = (sales || []).map(s => ({ ...s, productId: s.product_id }));
        return { sales: normSales, expenses: expenses || [] };
    } catch (e) {
        console.error('fetchPnlData failed:', e.message);
        return { sales: [], expenses: [] };
    }
}
```

- [x] **Step 3: Export both**

In `window.SupabaseManager = { ... }` (`js/supabase.js:1502`), add `fetchExpensesRange,` and `fetchPnlData,` near `fetchStatsData`.

- [x] **Step 4: Sanity check (no unit test — browser-only module)**

Run: `node -e "require('./js/supabase.js')" 2>&1 | head -1` — will error on `window` (expected: the module is browser-only). Instead verify syntax: `node --check js/supabase.js`
Expected: no output (syntax OK).

- [x] **Step 5: Commit**

```bash
git add js/supabase.js
git commit -m "feat(supabase): fetchPnlData/fetchExpensesRange + category/currency in insertExpense"
```

---

## Task 6: "Gastos" admin tab — markup + render + wiring

**Files:**
- Modify: `sistema/index.html` (1 sidebar button + 1 panel div)
- Modify: `js/ui.js` (add `renderAdminExpenses`, export it)
- Modify: `js/app.js` (add `addAdminExpense`, `loadAndRenderExpensesTab`, extend `addExpense` shape, wire tab)

**Interfaces:**
- Consumes: `SupabaseManager.fetchExpensesRange`, `SupabaseManager.insertExpense`, `SupabaseManager.deleteExpense`, `AnalyticsManager` (for the `expenseUsd` conversion — expose a tiny helper or inline the same math), `window.bcvRate`.
- Produces: `UIManager.renderAdminExpenses(expenses, { month, category, bcvRate }, onDelete)`.

- [x] **Step 1: Add the sidebar button in `sistema/index.html`**

After `admin-tab-btn-costs` (line ~598), still inside the `Operación` section:

```html
                    <button id="admin-tab-btn-expenses" class="admin-tab-btn">
                        <i class="fa-solid fa-file-invoice-dollar"></i>
                        <span>Gastos</span>
                    </button>
```

- [x] **Step 2: Add the panel div in `sistema/index.html`**

After the `admin-panel-costs` closing `</div>` (locate: panel starts line ~970). Mirror the `admin-panel-analytics` structure:

```html
                <div id="admin-panel-expenses" class="admin-panel">
                    <div class="admin-panel-header">
                        <h3 class="panel-title">Gastos del Local</h3>
                    </div>
                    <div class="admin-panel-body">
                        <form id="add-admin-expense-form" style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:flex-end; margin-bottom:1rem;">
                            <select id="admin-expense-category" required style="flex:1 1 130px;">
                                <option value="arriendo">Arriendo local</option>
                                <option value="sueldos">Sueldos</option>
                                <option value="servicios">Servicios</option>
                                <option value="otros">Otros</option>
                            </select>
                            <input id="admin-expense-desc" type="text" placeholder="Descripción / nombre" required style="flex:2 1 160px;">
                            <input id="admin-expense-amount" type="number" step="0.01" min="0.01" placeholder="Monto" required style="flex:1 1 90px;">
                            <div class="segmented" id="admin-expense-currency-toggle" style="flex:0 0 auto;">
                                <button type="button" id="admin-expense-cur-usd" class="segmented-btn active" data-cur="USD">$</button>
                                <button type="button" id="admin-expense-cur-ves" class="segmented-btn" data-cur="VES">Bs</button>
                            </div>
                            <input id="admin-expense-date" type="date" required style="flex:0 0 auto;">
                            <button type="submit" class="btn-action-small" style="flex:0 0 auto;">
                                <i class="fa-solid fa-plus"></i> Agregar
                            </button>
                        </form>
                        <div style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center; margin-bottom:0.75rem;">
                            <input id="admin-expense-filter-month" type="month" style="flex:0 0 auto;">
                            <div class="segmented" id="admin-expense-filter-category">
                                <button class="segmented-btn active" data-cat="">Todas</button>
                                <button class="segmented-btn" data-cat="arriendo">Arriendo</button>
                                <button class="segmented-btn" data-cat="sueldos">Sueldos</button>
                                <button class="segmented-btn" data-cat="servicios">Servicios</button>
                                <button class="segmented-btn" data-cat="otros">Otros</button>
                            </div>
                        </div>
                        <div id="admin-expenses-container">
                            <div style="font-size:0.85rem; color:var(--color-text-muted); text-align:center; padding:1.5rem 0;">Cargando gastos...</div>
                        </div>
                    </div>
                </div>
```

- [x] **Step 3: `renderAdminExpenses` in `js/ui.js`**

Add near `renderExpenses` (grep for `function renderExpenses`). Export on `window.UIManager`.

```javascript
/**
 * Lista de gastos del panel admin, filtrada por mes y categoría.
 * @param {Array} expenses Filas de expenses (con category, currency, bcv_rate)
 * @param {{month:string, category:string, bcvRate:number}} filter
 *   month: 'YYYY-MM' | '' (todos). category: '' (todas) | clave.
 * @param {Function} onDelete uuid => void
 */
function renderAdminExpenses(expenses = [], filter = {}, onDelete) {
    const container = document.getElementById('admin-expenses-container');
    if (!container) return;
    const { month = '', category = '', bcvRate = (window.bcvRate || 1) } = filter;

    const CAT_LABEL = { arriendo: 'Arriendo', sueldos: 'Sueldos', servicios: 'Servicios', otros: 'Otros' };
    const toUsd = (e) => {
        const amt = parseFloat(e.amount) || 0;
        if ((e.currency || 'USD').toUpperCase() === 'VES') {
            const r = parseFloat(e.bcv_rate) > 0 ? parseFloat(e.bcv_rate) : (bcvRate || 1);
            return amt / r;
        }
        return amt;
    };
    const catKey = (e) => (CAT_LABEL[(e.category || '').toLowerCase()] ? e.category.toLowerCase() : 'otros');

    let rows = (expenses || []).filter(e => {
        if (month) { const k = (e.timestamp || '').slice(0, 7); if (k !== month) return false; }
        if (category && catKey(e) !== category) return false;
        return true;
    }).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    if (rows.length === 0) {
        container.innerHTML = `<div style="font-size:0.85rem; color:var(--color-text-muted); text-align:center; padding:1.5rem 0;">Sin gastos para este filtro.</div>`;
        return;
    }

    const fmtUsd = v => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtVes = v => 'Bs. ' + (v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });
    const total = rows.reduce((s, e) => s + toUsd(e), 0);

    container.innerHTML = rows.map(e => {
        const original = (e.currency || 'USD').toUpperCase() === 'VES' ? fmtVes(e.amount) : fmtUsd(e.amount);
        return `
        <div class="expense-row" style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.8rem;">
            <span style="flex:0 0 78px; color:var(--color-text-muted);">${(e.timestamp || '').slice(0, 10)}</span>
            <span style="flex:0 0 80px; font-weight:700;">${CAT_LABEL[catKey(e)]}</span>
            <span style="flex:1 1 auto;">${(e.description || '').replace(/</g, '&lt;')}</span>
            <span style="flex:0 0 auto;">${original}</span>
            <span style="flex:0 0 70px; text-align:right; color:var(--color-text-muted);">${fmtUsd(toUsd(e))}</span>
            <button class="btn-delete-expense" data-uuid="${e.uuid}" style="flex:0 0 auto; background:none; border:none; color:var(--color-danger); cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>`;
    }).join('') + `
        <div style="display:flex; justify-content:space-between; font-weight:800; padding-top:0.6rem; font-size:0.85rem;">
            <span>Total del filtro</span><span>${fmtUsd(total)}</span>
        </div>`;

    container.querySelectorAll('.btn-delete-expense').forEach(btn => {
        btn.addEventListener('click', () => onDelete && onDelete(btn.dataset.uuid));
    });
}
```

- [x] **Step 4: Extend `addExpense` shape in `js/app.js:1375-1380`**

```javascript
    const newExpense = {
        uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        description,
        amount,
        timestamp: new Date().toISOString(),
        category: 'otros',
        currency: 'USD',
        bcv_rate: null
    };
```

- [x] **Step 5: Add `addAdminExpense` + `loadAndRenderExpensesTab` in `js/app.js`**

Near `addExpense` / `deleteExpense`:

```javascript
let expensesTabFilter = { month: '', category: '', bcvRate: 1 };
let expensesTabCache = {}; // monthISO -> Array
let pnlCache = {};         // `${mode}:${startISO}` -> pnl  (also reset here on expense add/delete; consumed by Task 7)

async function loadAndRenderExpensesTab(forceRefetch = false) {
    if (currentRole !== 'admin') return;
    const monthInput = document.getElementById('admin-expense-filter-month');
    const month = (monthInput && monthInput.value) || new Date().toISOString().slice(0, 7);
    expensesTabFilter.month = month;
    expensesTabFilter.bcvRate = window.bcvRate || 1;

    if (forceRefetch) delete expensesTabCache[month];
    if (!Array.isArray(expensesTabCache[month])) {
        if (window.SupabaseManager.isConfigured() && navigator.onLine) {
            const start = new Date(month + '-01T00:00:00');
            const end = new Date(start); end.setMonth(end.getMonth() + 1);
            expensesTabCache[month] = await window.SupabaseManager.fetchExpensesRange(start.toISOString(), end.toISOString());
        } else {
            expensesTabCache[month] = expenses.filter(e => (e.timestamp || '').slice(0, 7) === month);
        }
    }
    window.UIManager.renderAdminExpenses(expensesTabCache[month], expensesTabFilter, handleDeleteAdminExpense);
}

function handleDeleteAdminExpense(uuid) {
    deleteExpense(uuid);
    Object.keys(expensesTabCache).forEach(m => {
        expensesTabCache[m] = expensesTabCache[m].filter(e => e.uuid !== uuid);
    });
    pnlCache = {}; // P&L numbers changed (defined in Task 7)
    loadAndRenderExpensesTab();
}

function addAdminExpense(e) {
    e.preventDefault();
    const category = document.getElementById('admin-expense-category').value;
    const description = document.getElementById('admin-expense-desc').value.trim();
    const amount = parseFloat(document.getElementById('admin-expense-amount').value);
    const dateStr = document.getElementById('admin-expense-date').value;
    const curBtn = document.querySelector('#admin-expense-currency-toggle .segmented-btn.active');
    const currency = (curBtn && curBtn.dataset.cur) || 'USD';
    if (!description || isNaN(amount) || amount <= 0 || !dateStr) return;

    triggerHaptic(15);
    // noon local so the date can't slip to the previous day via timezone
    const ts = new Date(dateStr + 'T12:00:00').toISOString();
    const newExpense = {
        uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        description, amount, timestamp: ts,
        category,
        currency,
        bcv_rate: currency === 'VES' ? (window.bcvRate || null) : null
    };
    expenses.push(newExpense);
    window.StorageManager.saveExpenses(expenses);
    if (window.SupabaseManager.isConfigured()) window.SupabaseManager.insertExpense(newExpense);

    const m = ts.slice(0, 7);
    if (Array.isArray(expensesTabCache[m])) expensesTabCache[m].push(newExpense);
    pnlCache = {};

    document.getElementById('add-admin-expense-form').reset();
    document.getElementById('admin-expense-cur-usd').classList.add('active');
    document.getElementById('admin-expense-cur-ves').classList.remove('active');
    setAdminExpenseDateDefault();
    window.UIManager.showToast('💸 Gasto registrado.', 'fa-solid fa-file-invoice-dollar');
    loadAndRenderExpensesTab();
}

function setAdminExpenseDateDefault() {
    const el = document.getElementById('admin-expense-date');
    if (el && !el.value) el.value = new Date().toISOString().slice(0, 10);
}
```

- [x] **Step 6: Wire the tab + form in `initAdminDashboardListeners()` (`js/app.js`)**

Add alongside the other `getElementById` tab lookups and `activateTab` calls:

```javascript
    const tabExpensesBtn = document.getElementById('admin-tab-btn-expenses');
    const panelExpenses = document.getElementById('admin-panel-expenses');
    if (tabExpensesBtn && panelExpenses) {
        tabExpensesBtn.addEventListener('click', () => {
            activateTab(tabExpensesBtn, panelExpenses);
            setAdminExpenseDateDefault();
            const mi = document.getElementById('admin-expense-filter-month');
            if (mi && !mi.value) mi.value = new Date().toISOString().slice(0, 7);
            loadAndRenderExpensesTab();
        });
    }
    const admExpForm = document.getElementById('add-admin-expense-form');
    if (admExpForm) admExpForm.addEventListener('submit', addAdminExpense);

    document.querySelectorAll('#admin-expense-currency-toggle .segmented-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('#admin-expense-currency-toggle .segmented-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
        });
    });
    document.querySelectorAll('#admin-expense-filter-category .segmented-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('#admin-expense-filter-category .segmented-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            expensesTabFilter.category = b.dataset.cat || '';
            loadAndRenderExpensesTab();
        });
    });
    const admExpMonth = document.getElementById('admin-expense-filter-month');
    if (admExpMonth) admExpMonth.addEventListener('change', () => loadAndRenderExpensesTab(true));
```

- [x] **Step 7: Export `renderAdminExpenses` on `window.UIManager`**

Grep for the `window.UIManager = {` assignment (or the `UIManager` object) in `js/ui.js` and add `renderAdminExpenses,`.

- [x] **Step 8: Syntax check + tests**

Run: `node --check js/app.js && node --check js/ui.js && npm test`
Expected: no syntax errors; all tests still PASS.

- [x] **Step 9: Manual smoke (dev server, admin)**

- Open the new "Gastos" tab. Add an arriendo of `$100` dated today → appears in the list, "Total del filtro" = `$100.00`.
- Add a servicio of `Bs 2000` with a toggle to Bs → list shows `Bs. 2.000,00` original and the `$` equivalent at the current rate.
- Change the category filter chips and the month picker → list filters correctly.
- Delete a row → disappears, total updates.

- [x] **Step 10: Commit**

```bash
git add sistema/index.html js/ui.js js/app.js
git commit -m "feat: admin Gastos tab — categorized expense logging in USD/VES"
```

---

## Task 7: "Ganancias" admin tab — markup + period nav + render

**Files:**
- Modify: `sistema/index.html` (1 sidebar button + 1 panel div)
- Modify: `js/ui.js` (`renderPnl`, export)
- Modify: `js/app.js` (`loadPnl` + period-nav state + wiring)

**Interfaces:**
- Consumes: `SupabaseManager.fetchPnlData`, `AnalyticsManager.aggregatePnl`, module-scope `products`, `window.bcvRate`.
- Produces: `UIManager.renderPnl(pnl, { mode })` — renders into `#admin-pnl-container`. `pnl` shape from Task 4.

- [x] **Step 1: Sidebar button (`sistema/index.html`), right after `admin-tab-btn-expenses`**

```html
                    <button id="admin-tab-btn-pnl" class="admin-tab-btn">
                        <i class="fa-solid fa-sack-dollar"></i>
                        <span>Ganancias</span>
                    </button>
```

- [x] **Step 2: Panel div (`sistema/index.html`), after `admin-panel-expenses`**

```html
                <div id="admin-panel-pnl" class="admin-panel">
                    <div class="admin-panel-header">
                        <h3 class="panel-title">Resumen de Ganancias</h3>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <div class="segmented" id="pnl-mode-toggle">
                                <button class="segmented-btn active" data-mode="week">Semana</button>
                                <button class="segmented-btn" data-mode="month">Mes</button>
                            </div>
                            <button id="btn-pnl-prev" class="btn-action-small"><i class="fa-solid fa-chevron-left"></i></button>
                            <span id="pnl-period-label" style="font-size:0.8rem; min-width:170px; text-align:center;"></span>
                            <button id="btn-pnl-next" class="btn-action-small"><i class="fa-solid fa-chevron-right"></i></button>
                            <button id="btn-pnl-pdf" class="btn-action-small" style="background:rgba(201,162,74,0.15); border-color:var(--color-gold); color:var(--color-gold);">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </button>
                        </div>
                    </div>
                    <div class="admin-panel-body">
                        <div id="admin-pnl-container">
                            <div style="font-size:0.85rem; color:var(--color-text-muted); text-align:center; padding:1.5rem 0;">Cargando resumen...</div>
                        </div>
                    </div>
                </div>
```

- [x] **Step 3: Period math + `loadPnl` in `js/app.js`**

```javascript
let pnlMode = 'week';       // 'week' | 'month'
let pnlAnchor = new Date(); // any date inside the selected period
let pnlLast = null;         // last rendered pnl (for the PDF button)
// `pnlCache` is declared in Task 6 step 5 (module scope) since expense
// add/delete resets it; do not redeclare it here.

function pnlRange(mode, anchor) {
    const d = new Date(anchor);
    if (mode === 'month') {
        const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
        const label = start.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
        return { start, end, label: label.charAt(0).toUpperCase() + label.slice(1) };
    }
    // week: Monday 00:00 -> next Monday 00:00
    const day = (d.getDay() + 6) % 7; // 0 = Monday
    const start = new Date(d); start.setDate(d.getDate() - day); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    const endLbl = new Date(end); endLbl.setDate(end.getDate() - 1);
    const fmt = x => x.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
    return { start, end, label: `Semana ${fmt(start)}–${fmt(endLbl)}` };
}

function pnlCanGoNext() {
    const next = new Date(pnlAnchor);
    if (pnlMode === 'month') next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 7);
    return pnlRange(pnlMode, next).start <= new Date();
}

async function loadPnl(forceRefetch = false) {
    if (currentRole !== 'admin') return;
    const { start, end, label } = pnlRange(pnlMode, pnlAnchor);
    const labelEl = document.getElementById('pnl-period-label');
    if (labelEl) labelEl.textContent = label;
    const nextBtn = document.getElementById('btn-pnl-next');
    if (nextBtn) nextBtn.disabled = !pnlCanGoNext();

    const key = `${pnlMode}:${start.toISOString()}`;
    const container = document.getElementById('admin-pnl-container');
    if (forceRefetch) delete pnlCache[key];

    if (!pnlCache[key]) {
        if (container) container.innerHTML = `<div style="font-size:0.85rem; color:var(--color-text-muted); text-align:center; padding:1.5rem 0;">Cargando resumen...</div>`;
        let sales = [], expenses = [];
        if (window.SupabaseManager.isConfigured() && navigator.onLine) {
            const data = await window.SupabaseManager.fetchPnlData(start.toISOString(), end.toISOString());
            sales = data.sales; expenses = data.expenses;
        } else if (container) {
            container.innerHTML = `<div style="font-size:0.85rem; color:var(--color-danger); text-align:center; padding:1.5rem 0;">Sin conexión — el resumen necesita datos del servidor.</div>`;
            return;
        }
        pnlCache[key] = window.AnalyticsManager.aggregatePnl(sales, expenses, products, {
            start, end, periodLabel: label, bcvRate: window.bcvRate || 1
        });
    }
    pnlLast = pnlCache[key];
    window.UIManager.renderPnl(pnlLast, { mode: pnlMode });
}
```

- [x] **Step 4: `renderPnl` in `js/ui.js`**

```javascript
/**
 * Pinta el resumen de Ganancias (cascada + gráfico diario + categorías + abonos).
 * @param {Object} pnl  Salida de AnalyticsManager.aggregatePnl
 * @param {{mode:string}} opts
 */
function renderPnl(pnl, opts = {}) {
    const c = document.getElementById('admin-pnl-container');
    if (!c || !pnl) return;
    const rate = (window.bcvRate || 1);
    const usd = v => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ves = v => 'Bs. ' + ((v || 0) * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 });
    const t = pnl.totals;

    if (t.ventasUsd === 0 && pnl.gastos.totalUsd === 0) {
        c.innerHTML = `<div style="font-size:0.9rem; color:var(--color-text-muted); text-align:center; padding:2rem 0;">Sin ventas ni gastos en este período.</div>`;
        return;
    }

    const estBanner = t.costoTerceros.estimatedDays > 0
        ? `<div style="background:rgba(245,158,11,0.12); border:1px solid #f59e0b; border-radius:8px; padding:0.5rem 0.75rem; font-size:0.75rem; margin-bottom:0.75rem;">
             Incluye ${t.costoTerceros.estimatedDays} día(s) con costo de producción estimado — antes del 22 ago no se registraba el costo real.
           </div>` : '';

    const neg = v => v < 0 ? ' style="color:var(--color-danger);"' : '';
    const cascade = `
        <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
          <tr><td style="padding:0.35rem 0;">Ventas de mercadería</td><td style="text-align:right;">${usd(t.ventasUsd)}</td><td style="text-align:right; color:var(--color-text-muted);">${ves(t.ventasUsd)}</td></tr>
          <tr><td style="padding:0.35rem 0;">− Costo de producción (terceros)${t.costoTerceros.isEstimated ? ' <em style="color:#f59e0b;">(est.)</em>' : ''}</td><td style="text-align:right;">−${usd(t.costoTerceros.usd)}</td><td style="text-align:right; color:var(--color-text-muted);">−Bs. ${t.costoTerceros.bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td></tr>
          <tr id="pnl-gastos-row" style="cursor:pointer;"><td style="padding:0.35rem 0;">− Gastos del local <i class="fa-solid fa-chevron-down" style="font-size:0.7em;"></i></td><td style="text-align:right;">−${usd(t.gastosUsd)}</td><td style="text-align:right; color:var(--color-text-muted);">−${ves(t.gastosUsd)}</td></tr>
          ${pnl.gastos.porCategoria.map(g => `<tr class="pnl-gasto-detail" style="display:none;"><td style="padding:0.2rem 0 0.2rem 1rem; color:var(--color-text-muted);">· ${g.label}</td><td style="text-align:right; color:var(--color-text-muted);">−${usd(g.montoUsd)}</td><td></td></tr>`).join('')}
          <tr style="border-top:2px solid rgba(255,255,255,0.15); font-weight:800;"><td style="padding:0.5rem 0;">= Ganancia neta</td><td style="text-align:right;"${neg(t.gananciaNetaUsd)}>${usd(t.gananciaNetaUsd)}</td><td style="text-align:right;"${neg(t.gananciaNetaUsd)}>${ves(t.gananciaNetaUsd)}</td></tr>
        </table>`;

    const maxDay = Math.max(...pnl.dias.map(d => d.ventasUsd), 1);
    const chart = pnl.dias.map(d => {
        const pct = (d.ventasUsd / maxDay) * 100;
        return `<div class="chart-bar-row">
            <span class="chart-bar-label">${d.fecha.slice(5)}</span>
            <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%"></div></div>
            <span class="chart-bar-val">${usd(d.ventasUsd)}</span>
        </div>`;
    }).join('');

    const cats = pnl.categorias.map((cat, i) => `
        <div class="category-stat-wrapper">
          <div class="category-stat-row pnl-cat-row" data-idx="${i}" style="cursor:pointer;">
            <div class="category-label">${cat.label}</div>
            <div class="category-values">
              <span class="category-qty-badge">${cat.unidades} u</span>
              <span class="category-price-usd">${usd(cat.ventasUsd)}</span>
              <span class="category-price-ves">margen ${usd(cat.margenUsd)}</span>
            </div>
          </div>
          <div class="category-stat-dropdown pnl-cat-dd" data-idx="${i}" style="display:none;">
            ${cat.productos.map(p => `<div style="display:flex; justify-content:space-between; font-size:0.75rem; padding:0.15rem 0.5rem;"><span>${p.name} ×${p.unidades}</span><span>${usd(p.ventasUsd)}</span></div>`).join('')}
          </div>
        </div>`).join('');

    const abonos = pnl.abonos.count > 0
        ? `<div style="font-size:0.75rem; color:var(--color-text-muted); margin-top:0.75rem; padding-top:0.5rem; border-top:1px dashed rgba(255,255,255,0.1);">
             Abonos cobrados en el período: ${pnl.abonos.count} operación(es) · ${usd(pnl.abonos.montoUsd)} (fuera del cálculo de ganancia)
           </div>` : '';

    c.innerHTML = estBanner + cascade
        + `<div style="margin:1rem 0 0.5rem; font-weight:700; font-size:0.8rem;">Ventas por día</div>` + chart
        + `<div style="margin:1rem 0 0.5rem; font-weight:700; font-size:0.8rem;">Por categoría</div>` + cats
        + abonos;

    const gastosRow = document.getElementById('pnl-gastos-row');
    if (gastosRow) gastosRow.addEventListener('click', () => {
        c.querySelectorAll('.pnl-gasto-detail').forEach(r => {
            r.style.display = r.style.display === 'none' ? 'table-row' : 'none';
        });
    });
    c.querySelectorAll('.pnl-cat-row').forEach(row => row.addEventListener('click', () => {
        const dd = c.querySelector(`.pnl-cat-dd[data-idx="${row.dataset.idx}"]`);
        if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    }));
}
```

- [x] **Step 5: Wire the tab + nav in `initAdminDashboardListeners()` (`js/app.js`)**

```javascript
    const tabPnlBtn = document.getElementById('admin-tab-btn-pnl');
    const panelPnl = document.getElementById('admin-panel-pnl');
    if (tabPnlBtn && panelPnl) {
        tabPnlBtn.addEventListener('click', () => {
            activateTab(tabPnlBtn, panelPnl);
            pnlAnchor = new Date();
            loadPnl();
        });
    }
    document.querySelectorAll('#pnl-mode-toggle .segmented-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('#pnl-mode-toggle .segmented-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            pnlMode = b.dataset.mode;
            pnlAnchor = new Date();
            loadPnl();
        });
    });
    const pnlPrev = document.getElementById('btn-pnl-prev');
    const pnlNext = document.getElementById('btn-pnl-next');
    if (pnlPrev) pnlPrev.addEventListener('click', () => {
        if (pnlMode === 'month') pnlAnchor.setMonth(pnlAnchor.getMonth() - 1);
        else pnlAnchor.setDate(pnlAnchor.getDate() - 7);
        loadPnl();
    });
    if (pnlNext) pnlNext.addEventListener('click', () => {
        if (!pnlCanGoNext()) return;
        if (pnlMode === 'month') pnlAnchor.setMonth(pnlAnchor.getMonth() + 1);
        else pnlAnchor.setDate(pnlAnchor.getDate() + 7);
        loadPnl();
    });
    const pnlPdf = document.getElementById('btn-pnl-pdf');
    if (pnlPdf) pnlPdf.addEventListener('click', () => {
        if (pnlLast) window.UIManager.exportPnlToPDF(pnlLast, { mode: pnlMode, bcvRate: window.bcvRate || 1 });
    });
```

- [x] **Step 6: Export `renderPnl` on `window.UIManager`** (add `renderPnl,` to the object).

- [x] **Step 7: Syntax check + tests**

Run: `node --check js/app.js && node --check js/ui.js && npm test`
Expected: clean; tests PASS.

- [x] **Step 8: Manual smoke (dev server, admin)**

- Open "Ganancias". Default = current week. Cascade shows Ventas / −Terceros / −Gastos / = Ganancia neta with $ and Bs columns.
- Toggle to "Mes" → shows current calendar month; the amber estimation banner appears for August 2026 (period crosses Aug 22).
- `‹` navigates back; `›` is disabled on the current period, enabled after going back.
- Click "Gastos del local" row → expands per-category detail. Click a category row → expands its product list.
- Cross-check one week's Ventas total against the sum of that week's day-close PDFs.

- [x] **Step 9: Commit**

```bash
git add sistema/index.html js/ui.js js/app.js
git commit -m "feat: admin Ganancias tab — weekly/monthly P&L summary with navigation"
```

---

## Task 8: `exportPnlToPDF` in ui.js

**Files:**
- Modify: `js/ui.js` (add `exportPnlToPDF`, export)

**Interfaces:**
- Consumes: `pnl` (Task 4 shape), `{ mode, bcvRate }`.
- Pattern: copy `exportSalesAnalyticsToPDF` (`js/ui.js:~2140`) — `window.open('', '_blank')`, `document.write(fullHtmlDoc)`, `window.onload → setTimeout(window.print, 400)`, `document.close()`.

- [x] **Step 1: Implement**

```javascript
/**
 * PDF del resumen de Ganancias. Misma técnica que exportSalesAnalyticsToPDF:
 * ventana nueva + document.write + window.print().
 */
function exportPnlToPDF(pnl, opts = {}) {
    if (sessionStorage.getItem('casa_lucenzo_active_role') !== 'admin') return;
    const { mode = 'week', bcvRate = (window.bcvRate || 1) } = opts;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('Permite las ventanas emergentes para generar el PDF.'); return; }

    const usd = v => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const t = pnl.totals;
    const title = `Resumen ${mode === 'month' ? 'Mensual' : 'Semanal'} — ${pnl.period.label}`;

    const catRows = pnl.categorias.map(c => `
        <tr><td>${c.label}</td><td style="text-align:right">${c.unidades}</td><td style="text-align:right">${usd(c.ventasUsd)}</td><td style="text-align:right">${usd(c.costoTercerosUsd)}</td><td style="text-align:right">${usd(c.margenUsd)}</td></tr>
        ${c.productos.map(p => `<tr class="sub"><td style="padding-left:1.5rem">${p.name}</td><td style="text-align:right">${p.unidades}</td><td style="text-align:right">${usd(p.ventasUsd)}</td><td></td><td></td></tr>`).join('')}
    `).join('');

    const gastoRows = pnl.gastos.porCategoria.map(g => `
        <tr><td>${g.label}</td><td style="text-align:right">${usd(g.montoUsd)}</td></tr>
        ${g.items.map(i => `<tr class="sub"><td style="padding-left:1.5rem">${i.fecha} · ${i.description}${i.currency === 'VES' ? ` (Bs. ${i.montoOriginal.toLocaleString('es-VE')})` : ''}</td><td style="text-align:right">${usd(i.montoUsd)}</td></tr>`).join('')}
    `).join('');

    const estNote = t.costoTerceros.estimatedDays > 0
        ? `<p class="note">Incluye ${t.costoTerceros.estimatedDays} día(s) con costo de producción estimado (antes del 22 ago no se registraba el costo real).</p>` : '';

    printWindow.document.write(`
      <html><head><title>${title} — Casa Lucenzo</title>
      <style>
        body{font-family:Arial,sans-serif;padding:2rem;color:#1e293b;}
        h1{font-size:1.3rem;margin:0 0 .25rem;} .meta{color:#64748b;font-size:.8rem;margin-bottom:1.5rem;}
        table{width:100%;border-collapse:collapse;margin-bottom:1.5rem;font-size:.85rem;}
        th,td{padding:.4rem .5rem;border-bottom:1px solid #e2e8f0;} th{text-align:left;background:#f1f5f9;}
        tr.sub td{color:#64748b;font-size:.8rem;border-bottom:1px dotted #e2e8f0;}
        .cascade td{font-size:.95rem;} .cascade .total td{font-weight:800;border-top:2px solid #334155;}
        .note{background:#fef3c7;border:1px solid #f59e0b;padding:.5rem .75rem;border-radius:6px;font-size:.8rem;}
        .neg{color:#dc2626;}
      </style></head><body>
      <h1>${title}</h1>
      <div class="meta">Casa Lucenzo · Generado ${new Date().toLocaleString('es-VE')} · Tasa BCV ${bcvRate.toLocaleString('es-VE')}</div>
      ${estNote}
      <table class="cascade">
        <tr><td>Ventas de mercadería</td><td style="text-align:right">${usd(t.ventasUsd)}</td></tr>
        <tr><td>− Costo de producción (terceros)${t.costoTerceros.isEstimated ? ' (est.)' : ''}</td><td style="text-align:right">−${usd(t.costoTerceros.usd)}</td></tr>
        <tr><td>− Gastos del local</td><td style="text-align:right">−${usd(t.gastosUsd)}</td></tr>
        <tr class="total"><td>= Ganancia neta</td><td style="text-align:right" class="${t.gananciaNetaUsd < 0 ? 'neg' : ''}">${usd(t.gananciaNetaUsd)}</td></tr>
      </table>
      <h3>Por categoría</h3>
      <table><tr><th>Categoría / Producto</th><th style="text-align:right">Unid.</th><th style="text-align:right">Ventas</th><th style="text-align:right">Terceros</th><th style="text-align:right">Margen</th></tr>${catRows}</table>
      <h3>Gastos</h3>
      <table><tr><th>Categoría / Detalle</th><th style="text-align:right">Monto</th></tr>${gastoRows}</table>
      ${pnl.abonos.count > 0 ? `<p class="meta">Abonos cobrados: ${pnl.abonos.count} · ${usd(pnl.abonos.montoUsd)} (fuera del cálculo de ganancia)</p>` : ''}
      <script>window.onload=function(){setTimeout(function(){window.print();},400);}</script>
      </body></html>`);
    printWindow.document.close();
}
```

- [x] **Step 2: Export on `window.UIManager`** — add `exportPnlToPDF,`.

- [x] **Step 3: Syntax + tests**

Run: `node --check js/ui.js && npm test`
Expected: clean; PASS.

- [x] **Step 4: Manual smoke** — in "Ganancias", click "PDF" for a week and a month. The print dialog opens; the sheet shows the cascade, per-category table with product sub-rows, the expense breakdown, and the estimation note for August.

- [x] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "feat(ui): exportPnlToPDF — printable weekly/monthly profit summary"
```

---

## Task 9: Cache-bust version bump + full regression

**Files:**
- Modify: `sistema/index.html` (16 `?v=317` → `?v=318`)
- Modify: `sw.js` (`APP_VERSION = '317'` → `'318'`)

- [x] **Step 1: Bump `sistema/index.html`**

Run: `sed -i 's/?v=317/?v=318/g' sistema/index.html`
Then verify: `grep -c "?v=318" sistema/index.html` → expect `17`; `grep -c "?v=317" sistema/index.html` → expect `0`.

- [x] **Step 2: Bump `sw.js`**

Change line 8: `const APP_VERSION = '318';`
Verify: `grep -n "APP_VERSION = '318'" sw.js` → 1 hit. `grep -n "317" sw.js` → 0 hits.

- [x] **Step 3: Full test run**

Run: `npm test`
Expected: `🎉 ALL UNIT TESTS PASSED` — Core, Analytics (with the new `estimateProductionCost` + `aggregatePnl` assertions), Legacy credentials, WhatsApp, Telegram suites all green.

- [x] **Step 4: Lint**

Run: `npx eslint js/analytics.js js/app.js js/ui.js js/supabase.js`
Expected: no errors (fix any that appear — match surrounding style).

- [x] **Step 5: Full manual QA pass (dev server, admin)** — run the whole spec §6 "Manual" checklist:

- "Ganancias": toggle Semana/Mes, navigate several periods each way, `›` disabled at the current period.
- One week's Ventas total == sum of that week's day-close PDFs.
- August 2026 month shows the estimation banner.
- Generate weekly + monthly PDFs; per-product breakdown present; numbers match the screen.
- Navigate to an empty past week → "Sin ventas ni gastos en este período"; PDF still generable.
- "Gastos": add arriendo in $, a servicio in Bs; both land in the right month of the summary with correct conversion; category + month filters work; delete recalculates the summary.
- Existing day-close report still shows real vs "(Estimado)" tercero cost (Task 3 regression).
- Resize below 768px → both new tabs collapse to the icon row with the rest (no broken layout).

- [x] **Step 6: Commit**

```bash
git add sistema/index.html sw.js
git commit -m "chore: bump cache version to 318 for Ganancias + Gastos"
```

---

## Deploy checklist (human, after branch review — not a code step)

Use `superpowers:finishing-a-development-branch`. Order matters:

1. **Apply migration 020 to the production Supabase project FIRST** (dashboard SQL editor or `mcp__supabase__apply_migration`). Confirm `expenses` now has `category`, `currency`, `bcv_rate` (`list_tables` / `\d expenses`).
2. Merge + deploy the client bundle (Vercel).
3. On `casalucenzo.com` (not a preview URL): hard-reload, confirm SW picks up `v318`, log in as admin, add one real expense in each currency, open "Ganancias" for the current week and month.
4. Run the `verifying-production-deploys` skill checklist (touches `sistema/index.html` script tags + a DB migration).
5. Record the outcome in memory (`project_*`) per `feedback_act_as_institutional_memory`.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §1 `fetchPnlData` | Task 5 |
| §2.1 `estimateProductionCost` | Task 2 |
| §2.2 `aggregatePnl` | Task 4 |
| §2.3 tercero → USD conversion | Task 2 (per-sale `bcv_rate` fallback) |
| §2.4 expense conversion + grouping | Task 4 (`expenseUsd`, `resolveExpenseCategory`) |
| §3 period semantics, banners, empty period, negative margin | Task 7 (`pnlRange`, `pnlCanGoNext`, `renderPnl`) |
| §4 Ganancias UI (nav, cascade, chart, category table, abonos) | Task 7 |
| §4.4 load + in-memory cache | Task 7 (`pnlCache`) |
| §5 `exportPnlToPDF` | Task 8 |
| §6 testing | Tasks 2, 4 (unit); Task 9 (manual) |
| §7 deploy risk / version sync | Task 9 + deploy checklist |
| §8.1 migration 020 | Task 1 |
| §8.2 client wiring (`insertExpense`, `addExpense` shape, `addAdminExpense`) | Tasks 5, 6 |
| §8.3 Gastos UI (tab, form, list, filters) | Task 6 |
| §8.4 expense edge cases (0/neg amount, future date, frozen rate, offline) | Task 6 (`addAdminExpense` guards; frozen `bcv_rate`; offline falls back to local `expenses`) |
| §"Fuera de alcance" — no recurring, no insumos cat, no expense edit | respected (Task 6 has add + delete only) |

No gaps found.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step has a full code block. Manual-QA steps enumerate concrete checks.

**3. Type consistency:**
- `estimateProductionCost(sales, products, bcvRate)` → `{ bs, usd, isEstimated, estimatedDays, realDays }` — same shape consumed by Task 3 (`prodCost.bs`, `.isEstimated`) and Task 4 (`costoTerceros` embedded verbatim in `totals`) and rendered in Task 7 (`t.costoTerceros.estimatedDays`, `.bs`, `.usd`, `.isEstimated`) and Task 8.
- `aggregatePnl(...)` return keys (`totals`, `categorias`, `gastos.porCategoria`, `abonos`, `dias`, `period`) match every consumer in Tasks 7 & 8.
- `fetchPnlData` → `{ sales, expenses }` with `sales[].productId` normalized — matches `aggregatePnl` expectations (reads `productId || product_id`).
- Expense object shape `{ uuid, description, amount, timestamp, category, currency, bcv_rate }` consistent across `addExpense` (Task 6 step 4), `addAdminExpense` (Task 6 step 5), `insertExpense` payload (Task 5 step 1), `renderAdminExpenses` / `aggregatePnl` readers.
- Tab/panel ids: `admin-tab-btn-expenses`/`admin-panel-expenses`, `admin-tab-btn-pnl`/`admin-panel-pnl` — consistent between `sistema/index.html` and the `getElementById` calls in `js/app.js`.
- `pnlCache` is declared once, at module scope, in Task 6 step 5 (alongside `expensesTabCache`), because expense add/delete resets it. Task 7 step 3 explicitly does **not** redeclare it. Consistent across both tasks regardless of execution order.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-28-resumen-ganancias-y-gastos.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
