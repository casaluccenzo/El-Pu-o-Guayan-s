# Admin Dashboard Additions Implementation Plan

> **Estado (revisado 2026-09-27): implementado.** Todo está en el código: botón "Dashboard" en el sidebar, KPI "Ticket Promedio", botón "Reporte PDF" (`exportDashboardSummaryToPDF` en `js/ui.js`), migración `016_add_activity_logs_actor_name.sql` y `actor_name` en ambas vistas de actividad. Los pasos de chequeo manual se marcan por estar la función en producción, no porque se hayan vuelto a correr.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four pieces of real, missing scope from `proto-admin-resumen.html` to the live Admin Dashboard panel: a "Dashboard" nav label (fixing a naming collision with the unrelated `view-resumen` screen), a Ticket Promedio KPI card, a branded "Reporte PDF" export button, and per-employee attribution on Actividad Reciente.

**Architecture:** All additive changes to existing files — no new files except one SQL migration. `renderStats()` (`js/ui.js`) gains a Ticket Promedio calculation alongside its existing KPI math; a new `exportDashboardSummaryToPDF()` follows the same window.open/document.write/print pattern as the three existing PDF exporters in `js/ui.js`; `logActivity()`/`insertActivityLog()` gain one new field threaded from the already-tracked `currentUser` global down to a new `activity_logs.actor_name` column.

**Tech Stack:** Vanilla JS (no framework), Supabase (Postgres + PostgREST), plain CSS. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-16-admin-dashboard-sidebar-design.md](../specs/2026-08-16-admin-dashboard-sidebar-design.md) — **read the "Correction" section at the top first**: the sidebar itself already exists in production (`css/components.css:1811`); this plan implements only what's left after that correction (§2 minus the sidebar-build claim, §3, and the naming fix).

## Global Constraints

- App version is currently mid-bump to `286` in the working tree (uncommitted, from an earlier unrelated KPI/Bs/delta feature already tested this session). **Before starting Task 1**, commit that pending work separately so it doesn't get tangled with this plan's diff. This plan's own version bump goes `286 → 287` and must stay synced across `sistema/index.html`'s `?v=` query strings, `sw.js`'s `APP_VERSION`, and the `SCRIPTS` array in `sw.js` (see [[feedback-production-deploy-caution]] memory — this has broken before).
- Role gate: every new UI element here lives inside `#view-admin-dashboard`, which is already gated to `currentRole === 'admin'` by the surrounding code. No new role checks needed.
- No new npm dependencies. No new files except the migration.
- Money formatting: match existing convention exactly — `$${value.toFixed(2)}` for USD, `Bs. ${(value * rate).toFixed(2)}` for the Bs conversion (see `js/ui.js` `renderStats()`).
- Final task must run the full [[verifying-production-deploys]] checklist before this is considered done — this touches `sistema/index.html` script tags, `sw.js`, and a DB migration, all flagged in that skill.

---

### Task 1: Rename sidebar "Resumen" to "Dashboard"

**Files:**
- Modify: `sistema/index.html:577` (sidebar button label text)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new — pure text change, no IDs or JS touched

- [x] **Step 1: Make the change**

In `sistema/index.html`, find (around line 577):

```html
                    <button id="admin-tab-btn-summary" class="admin-tab-btn active">
                        <i class="fa-solid fa-chart-line"></i>
                        <span>📊 Resumen</span>
                    </button>
```

Change the `<span>` text to:

```html
                        <span>📊 Dashboard</span>
```

Do not change the button `id` (`admin-tab-btn-summary`) — `js/app.js:4309` looks it up by that exact ID.

- [x] **Step 2: Manual check**

Run the dev server (`npm run dev`), log in as admin, open the ⚙️ settings panel, confirm the sidebar's first item now reads "Dashboard" and still opens the same KPI panel as before.

- [x] **Step 3: Commit**

```bash
git add sistema/index.html
git commit -m "DISEÑO: Renombrar item de sidebar Admin de Resumen a Dashboard

Resumen ya nombra una pantalla distinta y no relacionada
(view-resumen, conciliación de turno). Evita el choque de nombres."
```

---

### Task 2: Ticket Promedio KPI card

**Files:**
- Modify: `sistema/index.html` (KPI grid, around line 673 — insert a 5th card)
- Modify: `css/components.css:1931` (grid column count)
- Modify: `js/ui.js` (`renderStats()`, around line 1846–1852)

**Interfaces:**
- Consumes: `salesLog` (array of sale line-items, each `{ price, timestamp, ... }`) and `todaySales`/`todaySalesTotal`, already computed inside `renderStats()` at `js/ui.js:1832-1836`.
- Produces: DOM element `#admin-kpi-ticket` (text content), populated on every `renderStats()` call — later tasks (the PDF export in Task 3) read this element's text.

**Important data note:** `salesLog` entries are per product *unit*, not per transaction — a single checkout that sells 3 items produces 3 entries sharing the exact same `timestamp` (see `js/app.js:756-768`, the `newSales` loop uses one shared `const timestamp` for the whole cart). So "cantidad de operaciones" (transaction count) must be the count of **distinct timestamps**, not `todaySales.length`.

- [x] **Step 1: Add the HTML card**

In `sistema/index.html`, inside `.admin-kpi-grid`, right after the closing `</div>` of the `gastos` card and before the `dispositivos` card (around line 672-673):

```html
                            <div class="admin-kpi-card ticket">
                                <div class="admin-kpi-icon"><i class="fa-solid fa-receipt"></i></div>
                                <div class="admin-kpi-info">
                                    <span class="admin-kpi-label">Ticket Promedio</span>
                                    <span id="admin-kpi-ticket" class="admin-kpi-value">—</span>
                                    <span id="admin-kpi-ticket-count" class="admin-kpi-bs"></span>
                                </div>
                            </div>
```

- [x] **Step 2: Widen the grid from 4 to 5 columns**

In `css/components.css:1931`, change:

```css
    grid-template-columns: repeat(4, minmax(0, 1fr));
```

to:

```css
    grid-template-columns: repeat(5, minmax(0, 1fr));
```

Leave the `768px` mobile override at `css/components.css:2297` (`repeat(2, minmax(0, 1fr)) !important`) untouched — 5 cards in 2 columns leaves the last card alone on its own row, which the grid already handles fine with no extra CSS.

- [x] **Step 3: Compute and render the value**

In `js/ui.js`, inside `renderStats()`, right after the existing block that sets `gastosKpiEl.textContent` (around line 1852), add:

```javascript
    const ticketKpiEl = document.getElementById('admin-kpi-ticket');
    const ticketCountEl = document.getElementById('admin-kpi-ticket-count');
    // Cada línea de `todaySales` es una unidad vendida, no una transacción --
    // varias líneas comparten el mismo timestamp cuando salen del mismo
    // checkout (ver js/app.js, newSales). Contamos timestamps distintos.
    const ticketCount = new Set(todaySales.map(s => s.timestamp)).size;
    if (ticketKpiEl) {
        ticketKpiEl.textContent = ticketCount > 0
            ? `$${(todaySalesTotal / ticketCount).toFixed(2)}`
            : '—';
    }
    if (ticketCountEl) {
        ticketCountEl.textContent = ticketCount > 0
            ? `${ticketCount} operación${ticketCount === 1 ? '' : 'es'} hoy`
            : 'sin operaciones hoy';
    }
```

- [x] **Step 4: Manual check**

On the dev server, as admin, open Dashboard. With no sales today it should show "—" / "sin operaciones hoy". Register a couple of test sales (different products, same checkout) and confirm: (a) the card shows total ÷ number of *checkouts*, not ÷ number of line items, and (b) the count label matches how many separate "Agregar a la cuenta" checkouts you did, not how many products.

- [x] **Step 5: Commit**

```bash
git add sistema/index.html css/components.css js/ui.js
git commit -m "FEATURE: Tarjeta Ticket Promedio en Dashboard de Admin

Ventas totales del día / cantidad de operaciones (transacciones
distintas por timestamp, no líneas de producto)."
```

---

### Task 3: "Reporte PDF" export button

**Files:**
- Modify: `sistema/index.html:626-633` (add button next to "Refrescar")
- Modify: `js/ui.js` (new function `exportDashboardSummaryToPDF`)
- Modify: `js/app.js` (wire the button's click handler)

**Interfaces:**
- Consumes: DOM text content of `#admin-kpi-caja`, `#admin-kpi-ventas`, `#admin-kpi-gastos`, `#admin-kpi-ticket`, `#admin-kpi-ticket-count`, `#admin-kpi-devices` (all already populated by `renderStats()`/`loadAndRenderAdminStats()` by the time this button is clickable).
- Produces: `window.UIManager.exportDashboardSummaryToPDF` (new export, no arguments — reads the DOM directly, following the same "read what's already rendered" approach used nowhere else in this codebase but justified here: the other PDF exporters take raw data because they *compute* a full report; this one is a snapshot of numbers already on screen, so recomputing them would duplicate `renderStats()`'s logic for no benefit).

This follows the existing `window.open('', '_blank')` → `document.write(...)` → `document.close()` pattern used by `exportDayCloseToPDF` (`js/ui.js:4316`), `exportHourlyStatsToPDF` (`js/ui.js:4784`), and `exportSalesAnalyticsToPDF` (`js/ui.js:5351`) — reusing their branded CSS header block for visual consistency, but deliberately smaller: this is a KPI snapshot, not a full sales report with category/product breakdowns (those already have their own PDF buttons elsewhere in the app).

- [x] **Step 1: Add the button next to "Refrescar"**

In `sistema/index.html`, around line 626-633, change:

```html
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <button id="btn-refresh-dashboard" class="btn-action-small" style="font-size: 10px; padding: 2px 8px;">
                                <i class="fa-solid fa-rotate"></i> Refrescar
                            </button>
                            <div style="font-size: 10px; color: var(--color-text-muted); font-weight: 700;" id="admin-summary-time-display">
                                Cargando estado en vivo...
                            </div>
                        </div>
```

to:

```html
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <button id="btn-refresh-dashboard" class="btn-action-small" style="font-size: 10px; padding: 2px 8px;">
                                <i class="fa-solid fa-rotate"></i> Refrescar
                            </button>
                            <button id="btn-dashboard-pdf" class="btn-action-small" style="font-size: 10px; padding: 2px 8px;">
                                <i class="fa-solid fa-file-pdf"></i> Reporte PDF
                            </button>
                            <div style="font-size: 10px; color: var(--color-text-muted); font-weight: 700;" id="admin-summary-time-display">
                                Cargando estado en vivo...
                            </div>
                        </div>
```

- [x] **Step 2: Add the export function to `js/ui.js`**

Add this new function right after `renderRecentActivity` (after its closing `}`, around line 2095):

```javascript
/**
 * Opens a new window with a printable one-page KPI snapshot of the admin
 * Dashboard and triggers the browser print dialog. Reads values already
 * rendered by renderStats() rather than recomputing them -- this is a
 * snapshot of what's on screen, not a fresh report.
 */
function exportDashboardSummaryToPDF() {
    const get = (id) => {
        const el = document.getElementById(id);
        return el ? el.textContent.trim() : '—';
    };

    const caja = get('admin-kpi-caja');
    const ventas = get('admin-kpi-ventas');
    const gastos = get('admin-kpi-gastos');
    const ticket = get('admin-kpi-ticket');
    const ticketCount = get('admin-kpi-ticket-count');
    const devices = get('admin-kpi-devices');
    const fecha = new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Por favor, permite las ventanas emergentes para poder generar el PDF.");
        return;
    }

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&family=Playfair+Display:wght@700;900&display=swap');
        body {
            font-family: 'Outfit', sans-serif;
            color: #0f172a;
            padding: 2.5rem;
            margin: 0;
            background-color: #ffffff;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 1.5rem;
            margin-bottom: 2rem;
        }
        .logo-area { display: flex; align-items: center; gap: 1rem; }
        .logo-circle {
            width: 60px; height: 60px; border-radius: 50%;
            background-image: url('/img/logo-192.png');
            background-size: 108% 108%; background-position: center; background-repeat: no-repeat;
            border: 2px solid #f3c63f;
        }
        .logo-text h1 { font-family: 'Playfair Display', serif; font-size: 1.8rem; margin: 0; color: #0b1329; font-weight: 900; }
        .logo-text p { font-size: 0.85rem; margin: 0; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
        .date { font-size: 0.9rem; color: #64748b; text-transform: capitalize; }
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
        .kpi-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; }
        .kpi-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; }
        .kpi-value { font-size: 1.4rem; font-weight: 900; color: #0b1329; margin-top: 0.25rem; }
        .kpi-sub { font-size: 0.75rem; color: #94a3b8; margin-top: 0.15rem; }
        .footer { margin-top: 2rem; font-size: 0.75rem; color: #94a3b8; text-align: center; }
    `;

    printWindow.document.write(`
        <html>
        <head>
            <title>Reporte Dashboard - Casa Lucenzo</title>
            <style>${css}</style>
        </head>
        <body>
            <div class="header">
                <div class="logo-area">
                    <div class="logo-circle"></div>
                    <div class="logo-text">
                        <h1>Casa Lucenzo</h1>
                        <p>Reporte de Dashboard Administrativo</p>
                    </div>
                </div>
                <div class="date">${fecha}</div>
            </div>
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Caja (Estimado)</div>
                    <div class="kpi-value">${caja}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Ventas Hoy</div>
                    <div class="kpi-value">${ventas}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Gastos Hoy</div>
                    <div class="kpi-value">${gastos}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Ticket Promedio</div>
                    <div class="kpi-value">${ticket}</div>
                    <div class="kpi-sub">${ticketCount}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Dispositivos Conectados</div>
                    <div class="kpi-value">${devices}</div>
                </div>
            </div>
            <div class="footer">Generado por el Sistema Casa Lucenzo el ${new Date().toLocaleString('es-VE')}</div>
            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 400);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
```

Add `exportDashboardSummaryToPDF,` to the `window.UIManager = { ... }` export object at the bottom of `js/ui.js` (same list where `renderRecentActivity` was added).

- [x] **Step 3: Wire the button in `js/app.js`**

Right after the existing `btnRecentActivityVerTodo` wiring (`js/app.js:4434-4439`), add:

```javascript
    const btnDashboardPdf = document.getElementById('btn-dashboard-pdf');
    if (btnDashboardPdf) {
        btnDashboardPdf.addEventListener('click', () => window.UIManager.exportDashboardSummaryToPDF());
    }
```

- [x] **Step 4: Manual check**

On the dev server, as admin, click "Reporte PDF". Confirm a new tab/window opens with the branded summary and the browser print dialog appears automatically. Confirm the values match what's on the Dashboard KPI cards at the moment of clicking (including Ticket Promedio from Task 2).

- [x] **Step 5: Commit**

```bash
git add sistema/index.html js/ui.js js/app.js
git commit -m "FEATURE: Botón Reporte PDF en Dashboard de Admin

Reutiliza el patrón window.open + document.write + print ya usado
por los otros 3 exportadores PDF del sistema. Es una foto de los
KPIs ya renderizados, no un reporte nuevo con desglose."
```

---

### Task 4: Employee attribution in Actividad Reciente

**Files:**
- Create: `supabase/migrations/016_add_activity_logs_actor_name.sql`
- Modify: `js/supabase.js` (`insertActivityLog`, around line 1351-1387)
- Modify: `js/app.js` (`logActivity`, around line 3027-3047)
- Modify: `js/ui.js` (`renderActivityLogs` and `renderRecentActivity`, around lines 1975 and 2066)

**Interfaces:**
- Consumes: `currentUser` (module-global in `js/app.js:3102`, shape `{ name, username, ... }`, set on login at `js/app.js:3142-3143`).
- Produces: `activity_logs.actor_name` column (nullable text); `insertActivityLog(role, action, details, actorName)` — 4th parameter, optional, defaults to `null` if omitted.

**Deploy-order requirement (real risk, see spec §3):** the migration must be applied to the database **before** the client code that sends `actor_name` reaches production, or every activity-log insert will fail (unknown column). Apply Step 1 to the production database first; do not deploy Steps 2-4 until it's confirmed applied.

- [x] **Step 1: Write and apply the migration**

Create `supabase/migrations/016_add_activity_logs_actor_name.sql`:

```sql
-- Migration 016: Add actor_name to activity_logs for per-employee attribution
--
-- logActivity() has only ever carried the role ('admin'/'venta'/'cocina'),
-- not who specifically performed the action. currentUser (js/app.js) already
-- tracks the logged-in person's name every session -- this just gives it a
-- column to land in. Additive and nullable: existing rows are untouched and
-- keep rendering as role-only. No RLS policy changes needed -- Postgres RLS
-- is row-level, not column-level, so the WITH CHECK conditions from
-- migrations 010/011/014 are unaffected by a new column.

BEGIN;

ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS actor_name text;

COMMIT;
```

Apply it to the production database via the Supabase SQL editor (same manual process used for prior migrations per [[project-pending-fixes-rls-and-pagination]] memory), then confirm:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'activity_logs' AND column_name = 'actor_name';
```

should return one row before moving on.

- [x] **Step 2: Thread `actorName` through `insertActivityLog`**

In `js/supabase.js`, change the function signature and payload (around line 1351-1374):

```javascript
async function insertActivityLog(role, action, details, actorName) {
    // Also save locally for offline fallback
    try {
        const localLogs = JSON.parse(localStorage.getItem('casa_lucenzo_local_activity_logs') || '[]');
        localLogs.push({
            role: role || 'unknown',
            action: action || '',
            details: details || '',
            actor_name: actorName || null,
            timestamp: new Date().toISOString()
        });
        // Limit to 100 logs locally
        if (localLogs.length > 100) localLogs.shift();
        localStorage.setItem('casa_lucenzo_local_activity_logs', JSON.stringify(localLogs));
    } catch(e) {
        console.error("Local log write failed", e);
    }

    if (!client) return;
    const payload = {
        role: role || 'unknown',
        action: action || '',
        details: details || '',
        actor_name: actorName || null,
        timestamp: new Date().toISOString()
    };
```

(The rest of the function — the offline-queue try/catch — is unchanged.)

- [x] **Step 3: Pass `currentUser.name` from `logActivity`**

In `js/app.js`, change `logActivity` (around line 3027-3031):

```javascript
function logActivity(action, details) {
    const role = currentRole || 'local';
    const actorName = currentUser ? currentUser.name : null;
    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.insertActivityLog(role, action, details, actorName);
    } else {
```

Also update the local-fallback branch a few lines below (around line 3035-3040) to include `actor_name: actorName` in the object pushed to `localLogs`, matching the shape now used in `js/supabase.js`.

Note: `currentUser` is declared at `js/app.js:3102`, *after* `logActivity` at line 3027 — this works because `logActivity` is only ever called after login (function declarations are hoisted and `currentUser` is read at call time, not definition time), but it means `currentUser` will be `null` for any `logActivity` call that happens before the first login in a session (there are none today — grep confirms every call site is inside authenticated flows). No change needed, just noting why this isn't a bug.

- [x] **Step 4: Display `actor_name` in both activity views**

In `js/ui.js`, `renderRecentActivity` (around line 2066), the `.map(log => ...)` template currently renders `log.action` directly. Change the action line to include the actor when present:

```javascript
                    <span class="admin-activity-action">${escapeHtml(log.action)}${log.actor_name ? ` · ${escapeHtml(log.actor_name)}` : ''}</span>
```

Apply the identical change to `renderActivityLogs` (around line 1975) wherever it renders the `ACCIÓN REALIZADA` cell — append `${log.actor_name ? ' · ' + escapeHtml(log.actor_name) : ''}` the same way, so the full Bitácora table shows it too.

- [x] **Step 5: Manual check**

On the dev server: log out and log back in as admin (a fresh login after this change). Confirm the new "Inicio de Sesión" entry in Actividad Reciente shows the actor name appended (e.g. "Inicio de Sesión · Admin"). Confirm older entries (from before this change) still render without errors or an empty " · " artifact.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/016_add_activity_logs_actor_name.sql js/supabase.js js/app.js js/ui.js
git commit -m "FEATURE: Atribución por empleado en Actividad Reciente

logActivity() ahora pasa currentUser.name a insertActivityLog(),
guardado en la nueva columna activity_logs.actor_name (016).
Aditivo: registros viejos siguen mostrando solo el rol."
```

---

### Task 5: Version sync and production verification

**Files:**
- Modify: `sistema/index.html` (all `?v=286` → `?v=287`)
- Modify: `sw.js` (`APP_VERSION`)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new — this is the release-version bump for everything landed in Tasks 1-4, plus whatever was already sitting at `v286` per Global Constraints.

- [x] **Step 1: Bump the version**

In `sistema/index.html`, replace every `?v=286` with `?v=287` (the `main.css` link and all 16 `<script>` tags).

In `sw.js`, change `const APP_VERSION = '286';` to `const APP_VERSION = '287';`. Do not touch the `SCRIPTS` array itself — no files were added or removed, only edited.

- [x] **Step 2: Run the full verification checklist**

Use the [[verifying-production-deploys]] skill now — this deploy touches `js/supabase.js`, `sistema/index.html`'s script tags, `sw.js`, and includes a DB migration, which is exactly its trigger list. Do not skip any item, in particular:
- Confirm on a real custom domain, not just the Vercel preview.
- Confirm the migration 016 is applied in production (Task 4 Step 1) before this deploy ships, not after.
- Confirm `?v=` in `sistema/index.html` and `APP_VERSION` in `sw.js` match.

- [x] **Step 3: Commit**

```bash
git add sistema/index.html sw.js
git commit -m "RELEASE: v287 -- Dashboard Ticket Promedio, Reporte PDF, atribución por empleado"
```
