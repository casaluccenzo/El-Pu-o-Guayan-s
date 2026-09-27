// Supabase Integration & Offline Queue Sync Manager

let client = null;
let activeSubscription = null;
let dbSupportsLastClose = false;
let supabaseLastCloseTime = null;

// Production Build Placeholder Injection (injected via scripts/build.js from process.env)
const DEFAULT_SUPABASE_URL = "__SUPABASE_URL__";
const DEFAULT_SUPABASE_KEY = "__SUPABASE_ANON_KEY__";

/**
 * Resolve the effective Supabase URL/key from user prefs, the build-injected
 * defaults, or this hardcoded production fallback.
 *
 * On Vercel the build DOES run (verified 2026-08-15: www.casalucenzo.com serves
 * this file with both constants substituted), so the fallback is what you get
 * locally via `npm run dev`, which serves the unbuilt source. Note the two are
 * not identical: Vercel currently injects a legacy JWT anon key while the
 * fallback below is the newer `sb_publishable_...` key. Same project, but worth
 * knowing when local and prod behave differently.
 *
 * The key here is the public anon/publishable key, meant to be client-visible and
 * protected by RLS, not a secret.
 */
function getSupabaseConfig() {
    const prefs = window.StorageManager ? window.StorageManager.loadPreferences() : {};
    const url = prefs.supabaseUrl || (DEFAULT_SUPABASE_URL !== '__SUPABASE_URL__' ? DEFAULT_SUPABASE_URL : 'https://xttpaqokeyywjaajvjyu.supabase.co');
    const key = prefs.supabaseKey || (DEFAULT_SUPABASE_KEY !== '__SUPABASE_ANON_KEY__' ? DEFAULT_SUPABASE_KEY : 'sb_publishable_ZkI5REhQ3HMJFat15ENjsQ_fyd66_TX');
    return { url, key };
}

/**
 * Check if Supabase URL and Key are set up
 */
function isConfigured() {
    const { url, key } = getSupabaseConfig();
    return !!(url && key);
}

/**
 * Check if running in isolated test environment (Sandbox)
 */
function isTestEnvironment() {
    try {
        return window.location.port === '8080' || 
               window.location.search.includes('test=true') || 
               window.location.hash.includes('test');
    } catch(e) {
        return false;
    }
}

/**
 * Initialize the Supabase client using stored credentials or defaults
 */
function init() {
    if (isTestEnvironment()) {
        console.warn("🧪 MODO PRUEBAS (SANDBOX): Supabase deshabilitado en entorno de pruebas local para aislar producción.");
        client = null;
        return false;
    }

    if (!isConfigured()) {
        client = null;
        return false;
    }

    const { url, key } = getSupabaseConfig();

    if (window.supabase) {
        try {
            client = window.supabase.createClient(url, key);
            console.log("Supabase Client initialized successfully.");

            // Plan B, Task 11 (spec §6, "Bordes"): record proof of real
            // connectivity for the 30-day offline limit (AuthManager.
            // isOfflineLimitExceeded, js/auth.js). SIGNED_IN/TOKEN_REFRESHED
            // only fire after a genuine round-trip to Supabase Auth --
            // confirmed reading GoTrueClient's own source, not assumed.
            // INITIAL_SESSION is deliberately excluded: per its own
            // documented behavior it just reflects whatever was already in
            // storage, which a fully offline load can still produce, and
            // treating it as "online" would silently keep resetting this
            // clock forever on a device that never actually reconnects.
            client.auth.onAuthStateChange((event) => {
                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    window.StorageManager.saveLastAuthOnlineAt(new Date().toISOString());
                }
            });

            return true;
        } catch (e) {
            console.error("Failed to initialize Supabase client", e);
            client = null;
            return false;
        }
    } else {
        console.warn("Supabase SDK is not loaded from CDN.");
        client = null;
        return false;
    }
}

// ================= DATA FETCHERS =================

// PostgREST caps every response at 1000 rows. A query that orders ascending and
// reads in one shot therefore loses its NEWEST rows once the table passes that
// mark -- silently, with no error. On 2026-08-11 that made a $18.02 day report
// as $7.38. Any unbounded sales read has to page.
const POSTGREST_PAGE_SIZE = 1000;
const POSTGREST_MAX_PAGES = 100;

/**
 * Read every row of a query by walking fixed-size pages.
 * @param {Function} buildQuery Receives the row offset, returns a PostgREST query
 * @returns {Promise<Array>} Every row, in query order
 */
async function fetchAllPages(buildQuery) {
    const rows = [];
    for (let page = 0; page < POSTGREST_MAX_PAGES; page++) {
        const { data, error } = await buildQuery(page * POSTGREST_PAGE_SIZE);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < POSTGREST_PAGE_SIZE) break;
    }
    return rows;
}

// Plan B, Task 4: reads move from client.from(...) (Supabase direct) to the
// local PowerSync/SQLite database once it has actually synced at least once.
// The db OBJECT exists from page load regardless of login (js/powersync/
// client.js constructs it eagerly) -- but connect() only runs after a
// successful login (handleUserLogin), and loadAllDataFromSupabase() runs
// at app init, BEFORE any login. Gating on hasSynced (not just object
// existence) matters: without it, that very first pre-login load would
// read an empty local table instead of falling back to Supabase, and the
// product catalog would render empty until after someone logs in.
// A plain property access, not a call -- safe in Node under tests/unit.test.js
// (global.window is shimmed there, but PowerSyncManager never gets defined,
// so this is just undefined, not a ReferenceError).
function getLocalDb() {
    const manager = window.PowerSyncManager;
    if (!manager || !manager.db) return null;
    const status = manager.db.currentStatus;
    if (!status || !status.hasSynced) return null;
    return manager.db;
}

// Postgres `numeric` columns are stored as SQLite TEXT locally (see
// js/powersync/schema.js -- confirmed against PowerSync's own schema
// generator: numeric -> text, never real, to avoid float rounding on money).
// Supabase-direct already returns real numbers via PostgREST's JSON encoding,
// so this is a no-op there -- applied unconditionally so both branches share
// one mapper instead of duplicating the coercion per source.
function toNum(v) {
    return (v === null || v === undefined) ? v : Number(v);
}

// Plan B, Task 5: unica location existente (migracion 016b), NOT NULL sin
// default en Postgres para products/ingredients/debts/expenses/
// replenishments. schema.js no declara un default de columna en SQLite, asi
// que un INSERT local que no la mencione explicitamente la deja en NULL --
// y ese NULL explicito sube tal cual en el PUT (uploadData en connector.js),
// violando la constraint NOT NULL (23502). connector.js descarta esos
// errores 23xxx sin reintentar, así que la fila se pierde en Postgres para
// siempre (aunque localmente parezca haberse guardado bien). Por eso todo
// INSERT local nuevo de esas tablas tiene que setearla a mano; los UPDATE
// (ON CONFLICT DO UPDATE) no la tocan porque la fila ya la trae bien desde
// el sync inicial.
const DEFAULT_LOCATION_ID = '00000000-0000-0000-0000-000000000001';

// `initial_stock` is the day's load baseline and 0 is a legitimate value
// (nothing loaded yet). Substituting `stock` for a missing value used to also
// fire on a real 0, silently rewriting the baseline on every background sync
// and making the day's totals drift.
function mapProductRow(p) {
    return {
        ...p,
        price: toNum(p.price),
        cost: toNum(p.cost),
        initial_stock: (p.initial_stock !== null && p.initial_stock !== undefined) ? p.initial_stock : p.stock
    };
}

function mapSaleRow(s) {
    return { ...s, productId: s.product_id, price: toNum(s.price), bcv_rate: toNum(s.bcv_rate), cost_at_sale: toNum(s.cost_at_sale) };
}

function mapExpenseRow(e) {
    return { ...e, amount: toNum(e.amount), bcv_rate: toNum(e.bcv_rate) };
}

// Plan B, Task 8: debts.amount is the ORIGINAL debt (spec §5.3, append-only
// abonos) -- it never gets decremented in place anymore. What the UI shows
// and validates against is a computed balance (original - sum of
// debt_payments), attached here as `amount` for renderDebts/settleDebtPayment
// to keep reading unchanged; the untouched raw value survives as
// `originalAmount` so addDebt's "add more debt for this client" flow has the
// real base to add onto, not an already-paid-down number.
function mapDebtRow(d, paidAmount = 0) {
    const originalAmount = toNum(d.amount);
    return { ...d, clientName: d.client_name, originalAmount, amount: Math.max(0, originalAmount - paidAmount) };
}

async function fetchProducts() {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            // Plan B, Task 9 follow-up (Gemini, verificado): pastelitos.stock/
            // initial_stock viven en la columna de products, pero esa columna
            // solo la actualiza el trigger de Postgres (recompute_product_stock)
            // cuando el INSERT de day_closes efectivamente llega a subir. Si el
            // dispositivo cierra jornada offline y recarga la página ANTES de
            // reconectar, la fila local de products nunca se tocó -- el stock
            // de ayer "resucita" en pantalla hasta que sincroniza. La mutación
            // optimista en memoria de closeDayAndResetLogs no sobrevive un
            // reload (es un array de JS, no algo persistido), así que hace
            // falta calcularlo en vivo acá, espejando la MISMA fórmula del
            // trigger (migración 030, rama 'pastelitos') contra las tablas
            // locales -- que sí están completas y actualizadas al instante
            // via PowerSync, sin depender de ningún trigger. julianday(), no
            // comparación de string: un movimiento insertado local puede
            // quedar en formato "...Z" (JS) mientras day_closes.closed_at ya
            // sincronizó de vuelta en formato Postgres (ver el mismo hallazgo
            // en Task 7, voidSalesByTimestamp).
            const rows = await localDb.getAll(`
                SELECT
                    p.id, p.name, p.min, p.max, p.unit, p.price, p.category, p.updated_at,
                    p.cost, p.location_id, p.stock_computed, p.initial_stock_computed, p.max_computed,
                    CASE WHEN p.category = 'pastelitos' THEN
                        COALESCE((
                            SELECT SUM(sm.delta) FROM stock_movements sm
                            WHERE sm.product_id = p.id
                              AND julianday(sm.created_at) > COALESCE((SELECT julianday(MAX(closed_at)) FROM day_closes), -1e18)
                        ), 0)
                    ELSE p.stock END AS stock,
                    CASE WHEN p.category = 'pastelitos' THEN
                        COALESCE((
                            SELECT SUM(sm.delta) FROM stock_movements sm
                            WHERE sm.product_id = p.id
                              AND julianday(sm.created_at) > COALESCE((SELECT julianday(MAX(closed_at)) FROM day_closes), -1e18)
                              AND sm.type = 'load'
                        ), 0)
                    ELSE p.initial_stock END AS initial_stock
                FROM products p
                ORDER BY p.name
            `);
            return rows.map(mapProductRow);
        } catch (e) {
            console.error("Error fetching products from PowerSync local DB:", e);
            return null;
        }
    }
    if (!client) return null;
    try {
        const { data, error } = await client.from('products').select('*').order('name');
        if (error) throw error;
        return data.map(mapProductRow);
    } catch (e) {
        console.error("Error fetching products from Supabase:", e);
        return null;
    }
}

function currentSalesExpensesFilterTime() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return supabaseLastCloseTime ? supabaseLastCloseTime : todayStart.toISOString();
}

async function fetchSales() {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            // Plan B, Task 7: a voided sale (spec §5.2) must disappear from
            // the register/reports exactly like a deleted one used to --
            // loadAllDataFromSupabase() already treats anything absent from
            // this result as removed locally (see the comment below), so
            // filtering it out here is enough for the normal full-refetch
            // path. The Realtime echo path is separate (see
            // handleRealtimeDbUpdate in app.js), since that one patches
            // salesLog in place instead of refetching.
            const rows = await localDb.getAll(
                'SELECT * FROM sales WHERE timestamp >= ? AND voided_at IS NULL ORDER BY timestamp ASC, uuid ASC',
                [currentSalesExpensesFilterTime()]
            );
            return rows.map(mapSaleRow);
        } catch (e) {
            console.error("Error fetching sales from PowerSync local DB:", e);
            return null;
        }
    }
    if (!client) return null;
    try {
        const filterTime = currentSalesExpensesFilterTime();

        // Must page like every other unbounded sales read (see the note above
        // fetchAllPages). A single day normally sits far under the 1000-row
        // cap, but it is not guaranteed: a long stretch without a day close
        // widens this window, and a runaway duplication can add hundreds of
        // rows to one account by itself (2026-08-14). Truncating here is
        // especially costly now that loadAllDataFromSupabase treats a sale
        // absent from this result as removed server-side.
        const rows = await fetchAllPages(offset => client.from('sales').select('*')
            .gte('timestamp', filterTime)
            .is('voided_at', null)
            .order('timestamp', { ascending: true })
            .order('uuid', { ascending: true })
            .range(offset, offset + POSTGREST_PAGE_SIZE - 1));
        return rows.map(mapSaleRow);
    } catch (e) {
        console.error("Error fetching sales from Supabase:", e);
        return null;
    }
}

async function fetchExpenses() {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            const rows = await localDb.getAll(
                'SELECT * FROM expenses WHERE timestamp >= ? ORDER BY timestamp ASC, uuid ASC',
                [currentSalesExpensesFilterTime()]
            );
            return rows.map(mapExpenseRow);
        } catch (e) {
            console.error("Error fetching expenses from PowerSync local DB:", e);
            return null;
        }
    }
    if (!client) return null;
    try {
        // Paged for the same reason as fetchSales above.
        const rows = await fetchAllPages(offset => client.from('expenses').select('*')
            .gte('timestamp', currentSalesExpensesFilterTime())
            .order('timestamp', { ascending: true })
            .order('uuid', { ascending: true })
            .range(offset, offset + POSTGREST_PAGE_SIZE - 1));
        return rows.map(mapExpenseRow);
    } catch (e) {
        console.error("Error fetching expenses from Supabase:", e);
        return null;
    }
}

async function fetchDebts() {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            const rows = await localDb.getAll('SELECT * FROM debts ORDER BY timestamp DESC');
            // Local aggregate, not a server round-trip: debt_payments' local
            // INSERT (insertDebtPayment) applies to this same SQLite view
            // instantly, so unlike products/stock_movements (Task 6) there's
            // no trigger-lag window where a refetch could read a stale
            // balance -- nothing here needs a pending-write guard.
            const paidRows = await localDb.getAll(
                'SELECT debt_uuid, SUM(CAST(amount AS REAL)) as paid FROM debt_payments GROUP BY debt_uuid'
            );
            const paidByUuid = new Map(paidRows.map(p => [p.debt_uuid, p.paid]));
            return rows.map(d => mapDebtRow(d, paidByUuid.get(d.uuid) || 0));
        } catch (e) {
            console.error("Error fetching debts from PowerSync local DB:", e);
            return null;
        }
    }
    if (!client) return null;
    try {
        const { data, error } = await client.from('debts').select('*').order('timestamp', { ascending: false });
        if (error) throw error;
        const uuids = data.map(d => d.uuid).filter(Boolean);
        const paidByUuid = new Map();
        if (uuids.length > 0) {
            const { data: payments, error: payError } = await client.from('debt_payments').select('debt_uuid, amount').in('debt_uuid', uuids);
            if (payError) throw payError;
            (payments || []).forEach(p => paidByUuid.set(p.debt_uuid, (paidByUuid.get(p.debt_uuid) || 0) + toNum(p.amount)));
        }
        return data.map(d => mapDebtRow(d, paidByUuid.get(d.uuid) || 0));
    } catch (e) {
        console.error("Error fetching debts from Supabase:", e);
        return null;
    }
}

async function fetchReplenishments() {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            const rows = await localDb.getAll("SELECT * FROM replenishments WHERE status != 'recibido'");
            return rows.map(r => ({ ...r, productId: r.product_id }));
        } catch (e) {
            console.error("Error fetching replenishments from PowerSync local DB:", e);
            return null;
        }
    }
    if (!client) return null;
    try {
        const { data, error } = await client.from('replenishments').select('*').neq('status', 'recibido');
        if (error) throw error;
        return data.map(r => ({ ...r, productId: r.product_id }));
    } catch (e) {
        console.error("Error fetching replenishments from Supabase:", e);
        return null;
    }
}

function mapIngredientRow(i) {
    return { ...i, stock: toNum(i.stock) };
}

async function fetchIngredients() {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            const rows = await localDb.getAll('SELECT * FROM ingredients ORDER BY name');
            return rows.map(mapIngredientRow);
        } catch (e) {
            console.error("Error fetching ingredients from PowerSync local DB:", e);
            return null;
        }
    }
    if (!client) return null;
    try {
        const { data, error } = await client.from('ingredients').select('*').order('name');
        if (error) throw error;
        return data.map(mapIngredientRow);
    } catch (e) {
        console.error("Error fetching ingredients from Supabase:", e);
        return null;
    }
}

async function fetchPedidosOnline() {
    if (!client) return null;
    try {
        const { data, error } = await client.from('pedidos_online').select('*').order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return data;
    } catch (e) {
        console.error("Error fetching pedidos_online from Supabase:", e);
        return null;
    }
}

// ================= DATA MUTATORS =================

async function upsertProduct(product) {
    const initialStock = (product.initial_stock !== undefined && product.initial_stock !== null) ? product.initial_stock : (product.stock || 0);
    const localDb = getLocalDb();
    if (localDb) {
        try {
            // Las tablas locales de PowerSync son VISTAS (INSTEAD OF triggers),
            // no tablas reales -- "ON CONFLICT ... DO UPDATE" tira "cannot
            // UPSERT a view" (confirmado en un navegador real). INSERT OR
            // REPLACE si funciona ahi, y PowerSync lo captura como un solo PUT
            // (no un DELETE+INSERT), asi que no arriesga violar la FK real de
            // stock_movements.product_id -> products.id.
            // products tiene columnas sombra (migracion 029) que este payload
            // no toca -- las mantiene el trigger de Postgres. REPLACE reescribe
            // la fila entera, asi que hay que releerlas primero o quedan NULL
            // localmente y ese NULL sube pisando el valor real en Postgres.
            const existing = await localDb.getOptional(
                'SELECT stock_computed, initial_stock_computed, max_computed FROM products WHERE id = ?',
                [product.id]
            );
            await localDb.execute(
                `INSERT OR REPLACE INTO products
                   (id, name, stock, min, max, unit, price, cost, category, initial_stock, updated_at,
                    location_id, stock_computed, initial_stock_computed, max_computed)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [product.id, product.name, product.stock, product.min, product.max, product.unit,
                 String(product.price), String(product.cost || 0), product.category, initialStock,
                 new Date().toISOString(), DEFAULT_LOCATION_ID,
                 existing ? existing.stock_computed : null,
                 existing ? existing.initial_stock_computed : null,
                 existing ? existing.max_computed : null]
            );
        } catch (e) {
            console.error("PowerSync local upsertProduct failed:", e);
        }
        return;
    }
    if (!client) return;
    const payload = {
        id: product.id,
        name: product.name,
        stock: product.stock,
        min: product.min,
        max: product.max,
        unit: product.unit,
        price: product.price,
        cost: product.cost || 0,
        category: product.category,
        initial_stock: initialStock,
        updated_at: new Date().toISOString()
    };
    try {
        const { error } = await client.from('products').upsert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase upsertProduct failed:", e);
    }
}

// Plan B, Task 12: updateProductStock predates Task 6/9's append-only stock
// model (stock_movements + the recompute trigger). Its one remaining caller
// (loadAllDataFromSupabase's missing-default-product backfill, js/app.js)
// was switched to upsertProduct(p) instead -- .update() silently no-ops on a
// row that doesn't exist yet, which upsert doesn't. insertStockMovement and
// resetPastelitoCapacity cover everything else it used to do.

// Plan B, Task 9 follow-up (encontrado por Gemini + análisis propio, no
// estaba en el plan original): `max` es un techo que el trigger de Postgres
// (recompute_product_stock, migración 030) solo puede CRECER --
// `GREATEST(initial_stock, max actual)`, nunca lo achica. Sacar el
// `updateProductStock(id, 0, 0, 0)` de `closeDayAndResetLogs` (como hizo el
// primer intento de Task 9) resolvía el conflicto de doble escritura para
// stock/initial_stock (esos SÍ se derivan enteros de stock_movements, con
// razón Task 6 dejó de escribirlos directo) pero rompía el reset de `max`
// por completo -- ningún mecanismo en Postgres lo vuelve a bajar a 0 solo.
// Esta función existe solo para esa columna puntual, local-first para que
// sobreviva un reload offline igual que cualquier otra escritura de Task 5+.
async function resetPastelitoCapacity(id) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute('UPDATE products SET max = 0 WHERE id = ?', [id]);
        } catch (e) {
            console.error("PowerSync local resetPastelitoCapacity failed:", e);
        }
        return;
    }
    if (!client) return;
    try {
        const { error } = await client.from('products').update({ max: 0 }).eq('id', id);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase resetPastelitoCapacity failed:", e);
    }
}

// Plan B, Task 6: modelo append-only para stock (spec §5.1a). En vez de
// pisar products.stock/max/initial_stock, cada carga/venta/recuento inserta
// UNA fila aca; recompute_product_stock() (migracion 033) recalcula esas 3
// columnas server-side a partir de la suma de estos movimientos + la hora
// del ultimo cierre. `type` (spec §5.1a): 'load' carga/recuento-hacia-arriba,
// 'sale' -1 del carrito, 'sale_return' +1 del carrito, 'count_down' recuento
// hacia abajo. El caller decide el type -- esta funcion no interpreta el
// signo de delta.
async function insertStockMovement({ productId, delta, type, sourceUuid = null, deviceId = null, note = null }) {
    const id = crypto.randomUUID ? crypto.randomUUID() : 'sm_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const createdAt = new Date().toISOString();
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute(
                `INSERT INTO stock_movements (id, product_id, delta, type, source_uuid, device_id, created_at, location_id, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, productId, delta, type, sourceUuid, deviceId, createdAt, DEFAULT_LOCATION_ID, note]
            );
        } catch (e) {
            console.error("PowerSync local insertStockMovement failed:", e);
        }
        return;
    }
    if (!client) return;
    const payload = {
        id, product_id: productId, delta, type, source_uuid: sourceUuid,
        device_id: deviceId, created_at: createdAt, note
    };
    try {
        const { error } = await client.from('stock_movements').insert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase insertStockMovement failed:", e);
    }
}

// Task 6 Step 2: mientras un stock_movement recien insertado no subio a
// Postgres todavia, recompute_product_stock() no corrio -- el stock/max/
// initial_stock locales de ese producto quedan un instante desactualizados
// respecto al valor optimista que ya se mostro en pantalla. Un refetch de
// productos en esa ventana (loadAllDataFromSupabase, cada 3 min o al
// reconectar) pisaria ese valor optimista con el viejo. `getCrudBatch` es de
// solo lectura si no se llama a `.complete()` -- a diferencia de
// `getNextCrudTransaction()` (que Task 5 SI drena), esto es un peek seguro,
// no vacia la cola.
async function getPendingStockMovementProductIds() {
    const localDb = getLocalDb();
    if (!localDb) return new Set();
    try {
        const batch = await localDb.getCrudBatch(1000);
        const ids = new Set();
        if (!batch) return ids;
        for (const entry of batch.crud) {
            if (entry.table === 'stock_movements' && entry.opData && entry.opData.product_id) {
                ids.add(entry.opData.product_id);
            }
        }
        return ids;
    } catch (e) {
        console.error("getPendingStockMovementProductIds failed:", e);
        return new Set();
    }
}

async function deleteProduct(id) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute('DELETE FROM products WHERE id = ?', [id]);
        } catch (e) {
            console.error("PowerSync local deleteProduct failed:", e);
        }
        return;
    }
    if (!client) return;
    try {
        const { error } = await client.from('products').delete().eq('id', id);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase deleteProduct failed:", e);
    }
}

// Plan B, Task 12: insertSale/insertSales/upsertSales never got a local-first
// branch in Tasks 4-11 (only products/expenses/debts/replenishments/
// ingredients/stock_movements did) -- they kept going Supabase-direct with
// the old offline queue as their only fallback. Retiring that queue without
// fixing this first would have meant a sale made fully offline had NO
// persistence path at all. `sales` IS in the local schema and fetchSales()
// already reads it local-first -- the write side just never caught up.
//
// A single shared helper covers all three: a brand-new sale (insertSale/
// insertSales) and a rename-in-place for an existing one (upsertSales, used
// by "marcar como pagado" and by the self-healing reconciliation below).
// INSERT OR REPLACE rewrites the whole local row (same "cannot UPSERT a
// view" limit as upsertProduct) -- unlike Postgres' partial-column upsert,
// SQLite has no equivalent, so any column the caller's `sale` object doesn't
// carry (voided_at/void_reason/bcv_rate/cost_at_sale) has to be read back
// first or it gets silently NULLed on an update.
async function upsertSaleLocal(localDb, sale) {
    const existing = await localDb.getOptional(
        'SELECT voided_at, void_reason, bcv_rate, cost_at_sale, location_id FROM sales WHERE id = ?',
        [sale.uuid]
    );
    const bcvRate = (sale.bcvRate ?? sale.bcv_rate) ?? (existing ? existing.bcv_rate : null);
    const costAtSale = (sale.cost ?? sale.cost_at_sale) ?? (existing ? existing.cost_at_sale : null);
    await localDb.execute(
        `INSERT OR REPLACE INTO sales
           (id, uuid, product_id, name, price, timestamp, bcv_rate, cost_at_sale, voided_at, void_reason, location_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sale.uuid, sale.uuid, sale.productId, sale.name, String(sale.price), sale.timestamp,
         bcvRate != null ? String(bcvRate) : null, costAtSale != null ? String(costAtSale) : null,
         existing ? existing.voided_at : null, existing ? existing.void_reason : null,
         existing ? existing.location_id : DEFAULT_LOCATION_ID]
    );
}

async function insertSale(sale) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await upsertSaleLocal(localDb, sale);
        } catch (e) {
            console.error("PowerSync local insertSale failed:", e);
        }
        return;
    }
    if (!client) return;
    const payload = {
        uuid: sale.uuid,
        product_id: sale.productId,
        name: sale.name,
        price: sale.price,
        timestamp: sale.timestamp,
        bcv_rate: sale.bcvRate || window.bcvRate || null,
        cost_at_sale: (sale.cost !== undefined && sale.cost !== null) ? sale.cost : null
    };
    try {
        const { error } = await client.from('sales').insert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase insertSale failed:", e);
    }
}

async function insertSales(sales) {
    if (!Array.isArray(sales) || sales.length === 0) return;
    const localDb = getLocalDb();
    if (localDb) {
        try {
            for (const sale of sales) await upsertSaleLocal(localDb, sale);
        } catch (e) {
            console.error("PowerSync local insertSales batch failed:", e);
        }
        return;
    }
    if (!client) return;
    const payloads = sales.map(sale => ({
        uuid: sale.uuid,
        product_id: sale.productId,
        name: sale.name,
        price: sale.price,
        timestamp: sale.timestamp,
        bcv_rate: sale.bcvRate || window.bcvRate || null,
        cost_at_sale: (sale.cost !== undefined && sale.cost !== null) ? sale.cost : null
    }));
    try {
        const { error } = await client.from('sales').insert(payloads);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase insertSales batch failed:", e);
    }
}

async function upsertSales(sales) {
    if (!Array.isArray(sales) || sales.length === 0) return;
    const localDb = getLocalDb();
    if (localDb) {
        try {
            for (const sale of sales) await upsertSaleLocal(localDb, sale);
        } catch (e) {
            console.error("PowerSync local upsertSales batch failed:", e);
        }
        return;
    }
    if (!client) return;
    // Partial-column upsert on purpose: PostgREST only SETs the columns
    // listed here on conflict, it does not null out the rest -- exactly what
    // a rename (the only caller of this Supabase-direct path) needs.
    const basePayloads = sales.map(sale => ({
        uuid: sale.uuid,
        product_id: sale.productId,
        name: sale.name,
        price: sale.price,
        timestamp: sale.timestamp
    }));
    try {
        const { error } = await client.from('sales').upsert(basePayloads);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase upsertSales batch failed:", e);
    }
}


// Plan B, Task 7: sales are never DELETEd once synced (spec §5.2, hard
// rule) -- voidSale/voidSalesByTimestamp replace deleteSale/deleteSales/
// deleteSalesByTimestamp. A void is just a normal column UPDATE, so unlike
// the stock-movement writes (Task 5/6) it needs no INSERT OR REPLACE
// workaround for the "cannot UPSERT a view" limit -- plain UPDATE already
// works against PowerSync's local views.
async function voidSale(uuid, reason) {
    const nowIso = new Date().toISOString();
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute(
                'UPDATE sales SET voided_at = ?, void_reason = ? WHERE id = ?',
                [nowIso, reason || null, uuid]
            );
        } catch (e) {
            console.error("PowerSync local voidSale failed:", e);
        }
        return;
    }
    if (!client) return;
    try {
        const { error } = await client.from('sales').update({ voided_at: nowIso, void_reason: reason || null }).eq('uuid', uuid);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase voidSale failed:", e);
    }
}

/**
 * Voids every not-yet-voided sales row for a given account (grouped by
 * timestamp, the same identity key used everywhere else -- Cuentas Activas,
 * Historial, handleEditSale) right before that account is replaced with a
 * corrected set. Matches by timestamp instead of a caller-supplied uuid list
 * so a stale/incomplete list (the account changed since it was last loaded
 * locally) can never leave old rows unvoided under the new set.
 *
 * The Supabase-direct fallback deliberately does NOT enqueue for later
 * offline retry, same reasoning deleteSalesByTimestamp used to have: a
 * queued "void everything under this timestamp" retried later would still
 * match -- and incorrectly void -- the corrected replacement rows once
 * they're inserted under that same timestamp (edits reuse the account's
 * original timestamp as its identity). Returns false so the caller can
 * abort the edit outright and have the cashier retry once back online. The
 * local-first (PowerSync) path below doesn't have this race: CRUD tracking
 * captures the specific rows affected at write time, not a timestamp
 * re-matched against Postgres later, so it's safe to run unconditionally.
 * @param {string} timestamp Account identity (ISO timestamp all its sale rows share)
 * @param {string} [reason] Reason recorded on every voided row
 * @returns {Promise<boolean>} true only if at least one row was voided just now
 */
async function voidSalesByTimestamp(timestamp, reason) {
    if (!timestamp) return false;
    const nowIso = new Date().toISOString();
    const localDb = getLocalDb();
    if (localDb) {
        try {
            // julianday(...) instead of a raw string match: a sale's timestamp
            // is inserted locally as JS's toISOString() ("...462Z"), but once
            // it round-trips through Postgres and syncs back down, the same
            // instant reads back as Postgres' own timestamptz format
            // ("...462+00:00") -- a different string for the same moment.
            // sessionStorage can hold whichever format was current when the
            // edit started, so a raw `timestamp = ?` silently matched zero
            // rows the moment a background resync landed mid-edit (confirmed
            // in a real browser: both formats parse to the identical
            // julianday value, a plain string compare does not see them as
            // equal).
            const result = await localDb.execute(
                'UPDATE sales SET voided_at = ?, void_reason = ? WHERE julianday(timestamp) = julianday(?) AND voided_at IS NULL RETURNING id',
                [nowIso, reason || null, timestamp]
            );
            return !!(result.rows && result.rows.length > 0);
        } catch (e) {
            console.error("PowerSync local voidSalesByTimestamp failed:", e);
            return false;
        }
    }
    if (!client) return false;
    try {
        // .select() forces Postgres to hand back the rows it actually voided.
        // Without it, an RLS policy that silently filters the UPDATE out
        // (wrong role, expired session) still comes back as { error: null } --
        // a "success" that voided zero rows is exactly how the original
        // delete-based bug happened, so it must count as a failure here too.
        const { data, error } = await client.from('sales')
            .update({ voided_at: nowIso, void_reason: reason || null })
            .eq('timestamp', timestamp)
            .is('voided_at', null)
            .select('uuid');
        if (error) throw error;
        return Array.isArray(data) && data.length > 0;
    } catch (e) {
        console.error("Supabase voidSalesByTimestamp failed:", e);
        return false;
    }
}

async function insertExpense(expense) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute(
                `INSERT INTO expenses (id, uuid, description, amount, timestamp, category, currency, bcv_rate, location_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [expense.uuid, expense.uuid, expense.description, String(expense.amount), expense.timestamp,
                 expense.category || null, expense.currency || 'USD',
                 expense.bcv_rate != null ? String(expense.bcv_rate) : null, DEFAULT_LOCATION_ID]
            );
        } catch (e) {
            console.error("PowerSync local insertExpense failed:", e);
        }
        return;
    }
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
    try {
        const { error } = await client.from('expenses').insert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase insertExpense failed:", e);
    }
}

async function deleteExpense(uuid) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute('DELETE FROM expenses WHERE id = ?', [uuid]);
        } catch (e) {
            console.error("PowerSync local deleteExpense failed:", e);
        }
        return;
    }
    if (!client) return;
    try {
        const { error } = await client.from('expenses').delete().eq('uuid', uuid);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase deleteExpense failed:", e);
    }
}

async function deleteExpenses(uuids) {
    if (!Array.isArray(uuids) || uuids.length === 0) return;
    const localDb = getLocalDb();
    if (localDb) {
        try {
            const placeholders = uuids.map(() => '?').join(', ');
            await localDb.execute(`DELETE FROM expenses WHERE id IN (${placeholders})`, uuids);
        } catch (e) {
            console.error("PowerSync local deleteExpenses batch failed:", e);
        }
        return;
    }
    if (!client) return;
    try {
        const { error } = await client.from('expenses').delete().in('uuid', uuids);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase deleteExpenses batch failed:", e);
    }
}

async function upsertDebt(debt) {
    // Plan B, Task 8: debts.amount is the ORIGINAL debt, never the computed
    // balance -- always persist originalAmount (mapDebtRow's raw stored
    // value) when the caller has it. Falls back to .amount for a brand new
    // debt (addDebt's "new client" branch), where there are no payments yet
    // so the two are identical anyway.
    const amountToStore = (debt.originalAmount !== undefined && debt.originalAmount !== null) ? debt.originalAmount : debt.amount;
    const localDb = getLocalDb();
    if (localDb) {
        try {
            // INSERT OR REPLACE, no ON CONFLICT DO UPDATE -- ver nota en
            // upsertProduct ("cannot UPSERT a view"). debts no tiene columnas
            // sombra, asi que reescribir la fila entera es seguro.
            await localDb.execute(
                `INSERT OR REPLACE INTO debts (id, uuid, client_name, amount, description, timestamp, location_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [debt.uuid, debt.uuid, debt.clientName, String(amountToStore), debt.description,
                 debt.timestamp, DEFAULT_LOCATION_ID]
            );
        } catch (e) {
            console.error("PowerSync local upsertDebt failed:", e);
        }
        return;
    }
    if (!client) return;
    const payload = {
        uuid: debt.uuid,
        client_name: debt.clientName,
        amount: amountToStore,
        description: debt.description,
        timestamp: debt.timestamp
    };
    try {
        const { error } = await client.from('debts').upsert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase upsertDebt failed:", e);
    }
}

async function deleteDebt(uuid) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute('DELETE FROM debts WHERE id = ?', [uuid]);
        } catch (e) {
            console.error("PowerSync local deleteDebt failed:", e);
        }
        return;
    }
    if (!client) return;
    try {
        const { error } = await client.from('debts').delete().eq('uuid', uuid);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase deleteDebt failed:", e);
    }
}

// Plan B, Task 8: abonos son append-only (spec §5.3) -- cada pago es una fila
// nueva en debt_payments, nunca una resta persistida en debts.amount. La
// deuda restante se deriva sumando estas filas (ver mapDebtRow/fetchDebts).
async function insertDebtPayment(debtUuid, amount, method, deviceId) {
    const id = crypto.randomUUID ? crypto.randomUUID() : 'dp_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const createdAt = new Date().toISOString();
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute(
                `INSERT INTO debt_payments (id, debt_uuid, amount, method, device_id, created_at, location_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, debtUuid, String(amount), method || null, deviceId || null, createdAt, DEFAULT_LOCATION_ID]
            );
        } catch (e) {
            console.error("PowerSync local insertDebtPayment failed:", e);
        }
        return;
    }
    if (!client) return;
    const payload = {
        id, debt_uuid: debtUuid, amount, method: method || null,
        device_id: deviceId || null, created_at: createdAt
    };
    try {
        const { error } = await client.from('debt_payments').insert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase insertDebtPayment failed:", e);
    }
}

// pedidos_online is not part of PowerSync's sync stream (Task 1) -- online
// orders are inherently online-only, staff just confirm/reject them.
async function updatePedidoStatus(id, status) {
    if (!client) return;
    const payload = { status };
    try {
        const { error } = await client.from('pedidos_online').update(payload).eq('id', id);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase updatePedidoStatus failed:", e);
    }
}

async function upsertReplenishment(repl) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            // INSERT OR REPLACE, no ON CONFLICT DO UPDATE -- ver nota en
            // upsertProduct ("cannot UPSERT a view"). replenishments no tiene
            // columnas sombra, asi que reescribir la fila entera es seguro.
            await localDb.execute(
                `INSERT OR REPLACE INTO replenishments (id, uuid, product_id, name, amount, unit, status, timestamp, location_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [repl.uuid, repl.uuid, repl.productId, repl.name, repl.amount, repl.unit, repl.status,
                 repl.timestamp, DEFAULT_LOCATION_ID]
            );
        } catch (e) {
            console.error("PowerSync local upsertReplenishment failed:", e);
        }
        return;
    }
    if (!client) return;
    const payload = {
        uuid: repl.uuid,
        product_id: repl.productId,
        name: repl.name,
        amount: repl.amount,
        unit: repl.unit,
        status: repl.status,
        timestamp: repl.timestamp
    };
    try {
        const { error } = await client.from('replenishments').upsert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase upsertReplenishment failed:", e);
    }
}

async function deleteReplenishment(uuid) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute('DELETE FROM replenishments WHERE id = ?', [uuid]);
        } catch (e) {
            console.error("PowerSync local deleteReplenishment failed:", e);
        }
        return;
    }
    if (!client) return;
    try {
        const { error } = await client.from('replenishments').delete().eq('uuid', uuid);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase deleteReplenishment failed:", e);
    }
}

async function upsertIngredient(ing) {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            // INSERT OR REPLACE, no ON CONFLICT DO UPDATE -- ver nota en
            // upsertProduct ("cannot UPSERT a view"). ingredients no tiene
            // columnas sombra, asi que reescribir la fila entera es seguro.
            await localDb.execute(
                `INSERT OR REPLACE INTO ingredients (id, name, stock, unit, updated_at, location_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [ing.id, ing.name, String(ing.stock), ing.unit, new Date().toISOString(), DEFAULT_LOCATION_ID]
            );
        } catch (e) {
            console.error("PowerSync local upsertIngredient failed:", e);
        }
        return;
    }
    if (!client) return;
    const payload = {
        id: ing.id,
        name: ing.name,
        stock: ing.stock,
        unit: ing.unit,
        updated_at: new Date().toISOString()
    };
    try {
        const { error } = await client.from('ingredients').upsert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase upsertIngredient failed:", e);
    }
}

// ================= AUTHENTICATION & PROFILES =================

async function signInUser(usernameOrEmail, password) {
    if (!client) return { user: null, session: null, profile: null, error: new Error("Supabase client no configurado.") };
    const rawInput = (usernameOrEmail || '').trim();
    const cleanUser = rawInput.toLowerCase();
    const email = cleanUser.includes('@') ? cleanUser : `${cleanUser}@casalucenzo.com`;

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        const session = data.session;
        const user = data.user;

        const emailPrefix = cleanUser.split('@')[0];

        // Only used to seed a profile that does not exist yet (a brand-new
        // account signing in for the first time). It is a guess made from the
        // login string, so it must never be allowed to overwrite a role that
        // already exists: `profiles.role` is the authority -- it is what every
        // RLS policy checks via get_user_role(), and what an admin edits from
        // the Usuarios panel.
        //
        // This used to also run as an `else if (profile.role !== derivedRole)`
        // branch that wrote the guess back on EVERY login. Promoting someone
        // from the panel therefore lasted exactly until their next sign-in,
        // when their username silently demoted them again.
        const seedRole = (emailPrefix.includes('admin') || cleanUser.includes('admin')) ? 'admin' : ((emailPrefix.includes('cocina') || cleanUser.includes('cocina')) ? 'cocina' : 'venta');

        let profile = await getUserProfile(user.id);
        if (!profile) {
            profile = {
                id: user.id,
                username: emailPrefix,
                name: user.user_metadata?.name || (seedRole === 'admin' ? 'Enzo (Administrador)' : (seedRole === 'cocina' ? 'Equipo de Cocina' : 'Vendedora POS')),
                role: seedRole,
                active: true
            };
            await upsertProfile(profile);
        }

        return { user, session, profile, error: null };
    } catch (e) {
        console.warn("Supabase Auth signIn failed:", e);
        return { user: null, session: null, profile: null, error: e };
    }
}

async function signOutUser() {
    if (!client) return;
    try {
        await client.auth.signOut();
    } catch (e) {
        console.warn("Supabase auth.signOut warning:", e);
    }
}

async function getCurrentSession() {
    if (!client) return null;
    try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        return data.session;
    } catch (e) {
        console.warn("Supabase getSession failed:", e);
        return null;
    }
}

// Plan B, Task 3: PowerSyncBackendConnector.uploadData needs to push the
// local CRUD queue to Supabase through the SAME authenticated session this
// module already holds (RLS is role-based) -- a second, separately
// constructed client would start out unauthenticated. Exposes the raw
// supabase-js client rather than duplicating every table's write logic here.
function getClient() {
    return client;
}

async function getUserProfile(userId) {
    if (!client || !userId) return null;
    try {
        const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error) throw error;
        return data;
    } catch (e) {
        console.warn("Fetch profile failed, checking legacy fallback:", e);
        return null;
    }
}

/**
 * Sets a quick 4-digit PIN for the logged-in user via RPC (hashed on server)
 * @param {string} pin 4-digit PIN string
 * @returns {object} { success: boolean, error: object }
 */
async function setQuickPin(pin) {
    if (!client) return { success: false, error: new Error("Supabase client no configurado.") };
    try {
        const { error } = await client.rpc('set_quick_pin', { p_pin: pin });
        if (error) throw error;
        return { success: true, error: null };
    } catch (e) {
        console.error("Error setting quick PIN in Supabase:", e);
        return { success: false, error: e };
    }
}

/**
 * Sets a quick 4-digit PIN for any user (Admin authority) via RPC
 * @param {string} targetUserId Target user UUID
 * @param {string} pin 4-digit PIN string
 * @returns {object} { success: boolean, error: object }
 */
async function setUserPinByAdmin(targetUserIdOrUsername, pin) {
    if (!client || !targetUserIdOrUsername) return { success: false, error: new Error("Supabase client o usuario no especificado.") };
    try {
        let uuid = targetUserIdOrUsername;
        
        // If target is not a valid UUID format (e.g. "usr_admin", "admin", "vendedora")
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
        if (!isUuid) {
            const targetUsername = uuid.replace(/^usr_/, '').toLowerCase();
            // A failed/empty lookup is handled by the ILIKE fallback below, so the error is not read here.
            const { data: profile } = await client.from('profiles').select('id').eq('username', targetUsername).maybeSingle();
            if (profile && profile.id) {
                uuid = profile.id;
            } else {
                // Fallback query by ILIKE in case username casing differs
                const { data: profList } = await client.from('profiles').select('id, username');
                const matched = (profList || []).find(p => (p.username || '').toLowerCase() === targetUsername);
                if (matched && matched.id) {
                    uuid = matched.id;
                } else {
                    throw new Error(`No se encontró el perfil en Supabase para el usuario "${targetUsername}".`);
                }
            }
        }

        const { error } = await client.rpc('admin_set_user_pin', { p_target_user_id: uuid, p_pin: pin });
        if (error) throw error;
        return { success: true, error: null };
    } catch (e) {
        console.error("Error setting user PIN by admin in Supabase:", e);
        return { success: false, error: e };
    }
}

/**
 * Verifies a quick PIN for a user (Plan B, Task 10 -- spec §6 punto 2).
 *
 * Local-first: once PowerSync has synced, this compares against
 * profiles.pin_hash straight from the local SQLite view via bcryptjs, no
 * network needed -- verified in a real browser that bcryptjs correctly
 * validates a hash pgcrypto's crypt(pin, gen_salt('bf')) produced (same
 * bcrypt spec). Falls back to the verify_quick_pin RPC (still callable by
 * an expired/anon session -- migración 023 kept it open on purpose for
 * exactly this screen) only when there's no local db yet (e.g. before the
 * very first sync ever completes on this device).
 *
 * The lockout counter (3 fails -> 60s) is intentionally NOT written to
 * profiles.pin_failed_attempts/pin_locked_until from here -- see
 * loadPinLockoutState in js/storage.js for why a plain client UPDATE to
 * those columns would silently fail under RLS for any non-admin user.
 * @param {string} userId User UUID
 * @param {string} pin 4-digit PIN string
 * @returns {boolean} True if PIN is correct
 */
async function verifyQuickPin(userId, pin) {
    if (!userId || !pin) return false;
    const pinStr = String(pin).trim();
    const localDb = getLocalDb();
    if (localDb && window.bcrypt) {
        try {
            const profile = await localDb.getOptional('SELECT pin_hash FROM profiles WHERE id = ?', [userId]);
            if (profile) {
                if (!profile.pin_hash) return false;

                const lockout = window.StorageManager.loadPinLockoutState(userId);
                const now = Date.now();
                if (lockout.lockedUntil && lockout.lockedUntil > now) {
                    return false;
                }

                const isValid = window.bcrypt.compareSync(pinStr, profile.pin_hash);
                if (isValid) {
                    window.StorageManager.savePinLockoutState(userId, { attempts: 0, lockedUntil: null });
                    return true;
                }

                const attempts = (lockout.attempts || 0) + 1;
                const lockedUntil = attempts >= 3 ? now + 60000 : lockout.lockedUntil;
                window.StorageManager.savePinLockoutState(userId, { attempts, lockedUntil });
                return false;
            }
            // No local profile row at all -- this device never synced this
            // user down (e.g. right after a brand new login, before the
            // first PowerSync sync completes). Fall through to the RPC.
        } catch (e) {
            console.error("PowerSync local verifyQuickPin failed, falling back to Supabase RPC:", e);
        }
    }
    if (!client) return false;
    try {
        const { data, error } = await client.rpc('verify_quick_pin', { p_user_id: userId, p_pin: pinStr });
        if (error) throw error;
        return data === true;
    } catch (e) {
        console.error("Error verifying quick PIN in Supabase:", e);
        return false;
    }
}

async function fetchProfiles() {
    if (!client) return null;
    try {
        const { data, error } = await client.from('profiles').select('*').order('username');
        if (error) throw error;
        return data.map(p => ({
            id: p.id,
            username: p.username,
            name: p.name,
            role: p.role,
            active: p.active !== false
        }));
    } catch (e) {
        // Used to fall back to fetchUsers(), which queries a 'users' table
        // that doesn't exist (public.profiles replaced it -- see migration
        // 001) and always fails with PGRST205. That fallback masked the real
        // error here (almost always an expired/missing Supabase Auth session
        // after re-entering via quick PIN instead of a fresh login) behind a
        // second, unrelated "table not found" error, and the caller had no
        // way to tell "no profiles" apart from "the fetch itself failed".
        console.error("Supabase fetchProfiles failed:", e.message || e);
        return null;
    }
}

async function upsertProfile(profile) {
    if (!client) return;
    try {
        const payload = {
            id: profile.id,
            username: profile.username,
            name: profile.name,
            role: profile.role,
            active: profile.active !== false,
            updated_at: new Date().toISOString()
        };
        const { error } = await client.from('profiles').upsert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase upsertProfile failed:", e);
    }
}

async function signUpNewUser({ username, name, role, password }) {
    if (!client) return { success: false, error: new Error("Supabase no configurado.") };
    const cleanUser = (username || '').trim().toLowerCase();
    const email = `${cleanUser}@casalucenzo.com`;

    // signUp() switches the browser's active Supabase Auth session to the
    // account it just created. Save the admin's current session first and
    // restore it right after -- otherwise the admin creating a new cashier
    // account ends up logged in AS that blank new account instead.
    const { data: sessionData } = await client.auth.getSession();
    const adminSession = sessionData?.session || null;

    const restoreAdminSession = async () => {
        if (adminSession) {
            await client.auth.setSession({
                access_token: adminSession.access_token,
                refresh_token: adminSession.refresh_token
            }).catch(() => {});
        }
    };

    try {
        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: { data: { username: cleanUser, name: name || cleanUser, role } }
        });
        if (error) throw error;
        if (!data.user) throw new Error("No se pudo crear el usuario (respuesta vacía).");

        await restoreAdminSession();
        // handle_new_user() (migration 001) already created the matching
        // profiles row from this metadata via the auth.users trigger.
        return { success: true, profile: { id: data.user.id, username: cleanUser, name: name || cleanUser, role, active: true } };
    } catch (e) {
        await restoreAdminSession();
        return { success: false, error: e };
    }
}

async function setProfileActive(id, active) {
    if (!client) return false;
    try {
        const { error } = await client.from('profiles').update({
            active,
            updated_at: new Date().toISOString()
        }).eq('id', id);
        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Supabase setProfileActive failed:", e);
        return false;
    }
}

// SQLite has no boolean type -- PowerSync stores use_auto_bcv/totp_enabled
// as 0/1 (see js/powersync/schema.js). Several call sites compare these with
// `!== false`, which is true for either 0 or 1 (different type, so never
// strictly equal to the boolean `false`) -- silently always "on" once read
// from the local DB unless coerced back to a real boolean here.
function mapAppConfigRow(data) {
    if (!data) return data;
    return {
        ...data,
        use_auto_bcv: !!data.use_auto_bcv,
        totp_enabled: !!data.totp_enabled,
        bcv_rate: toNum(data.bcv_rate)
    };
}

async function fetchAppConfig() {
    const localDb = getLocalDb();
    if (localDb) {
        try {
            const data = mapAppConfigRow(await localDb.getOptional('SELECT * FROM app_config WHERE id = 1'));
            if (data) {
                dbSupportsLastClose = ('last_close_time' in data);
                if (dbSupportsLastClose && data.last_close_time) {
                    supabaseLastCloseTime = data.last_close_time;
                }
            }
            return data;
        } catch (e) {
            console.error("Error fetching app config from PowerSync local DB:", e);
            return null;
        }
    }
    if (!client) return null;
    try {
        const { data: rawData, error } = await client.from('app_config').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;
        const data = mapAppConfigRow(rawData);
        if (data) {
            dbSupportsLastClose = ('last_close_time' in data);
            if (dbSupportsLastClose && data.last_close_time) {
                supabaseLastCloseTime = data.last_close_time;
            }
        }
        return data;
    } catch (e) {
        console.error("Error fetching app config from Supabase:", e);
        return null;
    }
}

// Plan B, Task 2 gate: last_close_at() (migrations 026/030/033) reads
// MAX(day_closes.closed_at) to know where "today" starts for pastelitos
// stock. Nothing wrote to this table before -- the day close only ever
// touched app_config.last_close_time -- so that boundary never advanced and
// stock_computed (dormant shadow column, migration 030) was drifting upward
// by +15 every time the daily-restock cron ran. This is additive: it doesn't
// change what the day close already does, it just also records the same
// event where the Plan A/B trigger logic looks for it.
//
// Plan B, Task 12: this never got a local-first branch either (same gap as
// insertSale/insertSales -- see the comment above upsertSaleLocal), despite
// closeDayAndResetLogs() explicitly depending on it working offline (spec
// R1, "esta app tiene que poder operar offline un día entero"). Without it,
// a day close made fully offline zeroed the vitrina in memory but never
// moved last_close_at() at all once the old queue is gone.
async function insertDayClose(closedAt, deviceId) {
    const id = crypto.randomUUID ? crypto.randomUUID() : 'dc_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const localDb = getLocalDb();
    if (localDb) {
        try {
            await localDb.execute(
                `INSERT INTO day_closes (id, closed_at, device_id, location_id, created_at) VALUES (?, ?, ?, ?, ?)`,
                [id, closedAt, deviceId || null, DEFAULT_LOCATION_ID, new Date().toISOString()]
            );
        } catch (e) {
            console.error("PowerSync local insertDayClose failed:", e);
        }
        return;
    }
    if (!client) return;
    const payload = { id, closed_at: closedAt, device_id: deviceId || null };
    try {
        const { error } = await client.from('day_closes').insert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase insertDayClose failed:", e);
    }
}

async function upsertAppConfig(config) {
    // pin_local/pin_cocina/pin_admin (seteados mas abajo en el payload de
    // Supabase-direct) NO son columnas reales de app_config en Postgres --
    // verificado contra el esquema real (000_core_tables.sql + list_tables),
    // nunca se agregaron en ninguna migracion. Ese branch ya viene fallando
    // silenciosamente en produccion desde antes de Plan B (PostgREST rechaza
    // columnas inexistentes -> queda enganchado en el offline queue para
    // siempre). No se tocan aca tampoco -- ni schema.js las declara, asi que
    // intentar escribirlas localmente tiraria "no such column" en SQLite.
    const localDb = getLocalDb();
    if (localDb) {
        try {
            const sets = ['updated_at = ?'];
            const params = [new Date().toISOString()];
            if (config.bcvRate !== undefined) {
                sets.push('bcv_rate = ?');
                params.push(String(parseFloat(config.bcvRate) || 732.48));
            }
            if (config.useAutoBcv !== undefined) {
                sets.push('use_auto_bcv = ?');
                params.push(config.useAutoBcv ? 1 : 0);
            }
            if (dbSupportsLastClose && config.lastCloseTime !== undefined) {
                sets.push('last_close_time = ?');
                params.push(config.lastCloseTime);
                supabaseLastCloseTime = config.lastCloseTime;
            }
            await localDb.execute(`UPDATE app_config SET ${sets.join(', ')} WHERE id = 1`, params);
        } catch (e) {
            console.error("PowerSync local upsertAppConfig failed:", e);
        }
        return;
    }
    if (!client) return;
    // Partial upsert: only touch the columns the caller actually passed.
    // This used to unconditionally write bcv_rate + use_auto_bcv, so a call
    // that only meant to set last_close_time (the day close) clobbered the
    // exchange rate with the 732.48 fallback and turned auto-BCV off. From
    // 2026-09 the rate is kept current server-side (migration 021 cron), so
    // the browser has no business overwriting it unless the admin explicitly
    // edited it.
    const payload = {
        id: 1,
        updated_at: new Date().toISOString()
    };

    if (config.bcvRate !== undefined) {
        payload.bcv_rate = parseFloat(config.bcvRate) || 732.48;
    }
    if (config.useAutoBcv !== undefined) {
        payload.use_auto_bcv = !!config.useAutoBcv;
    }

    if (config.pinLocal !== undefined) payload.pin_local = config.pinLocal;
    if (config.pinCocina !== undefined) payload.pin_cocina = config.pinCocina;
    if (config.pinAdmin !== undefined) payload.pin_admin = config.pinAdmin;

    if (dbSupportsLastClose) {
        if (config.lastCloseTime !== undefined) {
            payload.last_close_time = config.lastCloseTime;
            supabaseLastCloseTime = config.lastCloseTime;
        }
    }

    try {
        const { error } = await client.from('app_config').upsert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase upsertAppConfig failed:", e);
    }
}

async function fetchStatsData() {
    if (!client) return null;
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        // Fetch sales and expenses in parallel. A week of sales sits well under
        // the 1000-row cap today, but this read has no ordering at all, so
        // crossing it would drop an arbitrary slice rather than a known end.
        const [sales, expenses] = await Promise.all([
            fetchAllPages(offset => client.from('sales').select('*')
                .gte('timestamp', sevenDaysAgo.toISOString())
                .is('voided_at', null)
                .order('timestamp', { ascending: true })
                .range(offset, offset + POSTGREST_PAGE_SIZE - 1)),
            fetchAllPages(offset => client.from('expenses').select('*')
                .gte('timestamp', sevenDaysAgo.toISOString())
                .order('timestamp', { ascending: true })
                .range(offset, offset + POSTGREST_PAGE_SIZE - 1))
        ]);

        return {
            sales: sales.map(s => ({ ...s, productId: s.product_id })),
            expenses: expenses
        };
    } catch (e) {
        console.error("Error fetching stats data from Supabase:", e);
        return null;
    }
}

async function fetchExpensesRange(startISO, endISO) {
    if (!client) return [];
    try {
        return await fetchAllPages(offset => client.from('expenses').select('*')
            .gte('timestamp', startISO)
            .lt('timestamp', endISO)
            .order('timestamp', { ascending: true })
            .order('uuid', { ascending: true })
            .range(offset, offset + POSTGREST_PAGE_SIZE - 1));
    } catch (e) {
        console.error('fetchExpensesRange failed:', e.message);
        return [];
    }
}

async function fetchPnlData(startISO, endISO) {
    if (!client) return null;
    try {
        const [sales, expenses] = await Promise.all([
            fetchAllPages(offset => client.from('sales').select('*')
                .gte('timestamp', startISO)
                .lt('timestamp', endISO)
                .is('voided_at', null)
                .order('timestamp', { ascending: true })
                .order('uuid', { ascending: true })
                .range(offset, offset + POSTGREST_PAGE_SIZE - 1)),
            fetchExpensesRange(startISO, endISO)
        ]);
        const normSales = (sales || []).map(s => ({ ...s, productId: s.product_id }));
        return { sales: normSales, expenses: expenses || [] };
    } catch (e) {
        console.error('fetchPnlData failed:', e.message);
        return null;
    }
}

/**
 * Fetch sales and expenses for a specific date range (single day)
 * @param {string} dateStr Date string in YYYY-MM-DD format
 * @returns {Object|null} { sales, expenses } for that day
 */
async function fetchDayReport(dateStr) {
    if (!client) return null;
    try {
        const dayStart = new Date(dateStr + 'T00:00:00');
        const dayEnd = new Date(dateStr + 'T23:59:59.999');

        const [salesRes, expensesRes, rateHistoryRes] = await Promise.all([
            client.from('sales').select('*')
                .gte('timestamp', dayStart.toISOString())
                .lte('timestamp', dayEnd.toISOString())
                .is('voided_at', null)
                .order('timestamp', { ascending: true }),
            client.from('expenses').select('*')
                .gte('timestamp', dayStart.toISOString())
                .lte('timestamp', dayEnd.toISOString())
                .order('timestamp', { ascending: true }),
            client.from('bcv_rate_history').select('bcv_rate').eq('rate_date', dateStr).maybeSingle()
        ]);

        if (salesRes.error) throw salesRes.error;
        if (expensesRes.error) throw expensesRes.error;

        const rawSales = salesRes.data || [];
        let dayBcvRate = null;
        for (const s of rawSales) {
            const r = parseFloat(s.bcv_rate || s.bcvRate);
            if (r && !isNaN(r) && r > 0) {
                dayBcvRate = r;
                break;
            }
        }

        // A day with no sales (or older rows from before sales.bcv_rate
        // existed) has nothing to infer a rate from -- fall back to that
        // day's recorded rate in bcv_rate_history, which is kept regardless
        // of whether anything sold that day (see migration 017).
        if (!dayBcvRate && !rateHistoryRes.error && rateHistoryRes.data) {
            const r = parseFloat(rateHistoryRes.data.bcv_rate);
            if (r && !isNaN(r) && r > 0) dayBcvRate = r;
        }

        return {
            dateStr: dateStr,
            bcvRate: dayBcvRate,
            sales: rawSales.map(s => ({
                ...s,
                productId: s.product_id,
                name: s.product_name || s.name || 'Producto',
                price: s.price || 0,
                bcvRate: parseFloat(s.bcv_rate || s.bcvRate) || null
            })),
            expenses: (expensesRes.data || []).map(e => ({
                ...e,
                amount: e.amount || 0
            }))
        };
    } catch (e) {
        console.error("Error fetching day report from Supabase:", e);
        return null;
    }
}

/**
 * Fetch list of unique days with sales activity in the last N days
 * @param {number} days Number of days to look back (default 30)
 * @returns {Array} Array of date strings with activity
 */
async function fetchReportDays(days = 30) {
    if (!client) return [];
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        // Pages like every other unbounded sales read (see fetchAllPages).
        // Ordered descending and capped at 1000, this silently dropped the
        // OLDEST days of the window once the range crossed the cap -- the
        // report history would just stop listing days that plainly had sales.
        const data = await fetchAllPages(offset => client.from('sales')
            .select('timestamp')
            .gte('timestamp', startDate.toISOString())
            .is('voided_at', null)
            .order('timestamp', { ascending: false })
            .order('uuid', { ascending: true })
            .range(offset, offset + POSTGREST_PAGE_SIZE - 1));

        // Extract unique dates
        const uniqueDays = new Set();
        (data || []).forEach(s => {
            const d = window.parseUTCTimestamp ? window.parseUTCTimestamp(s.timestamp) : new Date(s.timestamp);
            uniqueDays.add(d.toISOString().split('T')[0]);
        });

        return Array.from(uniqueDays).sort().reverse();
    } catch (e) {
        console.error("Error fetching report days from Supabase:", e);
        return [];
    }
}

/**
 * Fetch raw sales history for analytics (day-over-day comparisons, weekday
 * patterns, flavor ranking, prep recommendations). Only pulls the columns
 * analytics actually needs -- lighter than fetchStatsData()'s `select('*')`
 * since this range is much wider (up to the full table vs. 7 days).
 * @param {number} days How many days back to fetch. Pass 0/null/undefined
 *   to fetch the entire sales history with no date cutoff (used by the
 *   "Todo el historial" range, so weekday averages account for every week
 *   the business has been open, not just a recent window).
 * @returns {Array} Sale rows with productId normalized from product_id
 */
async function fetchSalesHistory(days) {
    if (!client) return [];
    try {
        let startIso = null;
        if (days) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);
            startIso = startDate.toISOString();
        }

        const rows = await fetchAllPages(offset => {
            let query = client.from('sales')
                .select('product_id, name, price, timestamp')
                .is('voided_at', null)
                .order('timestamp', { ascending: true })
                .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
            if (startIso) query = query.gte('timestamp', startIso);
            return query;
        });

        return rows.map(s => ({ ...s, productId: s.product_id }));
    } catch (e) {
        console.error("Error fetching sales history from Supabase:", e);
        return [];
    }
}

/**
 * Fetch all active sessions
 * @returns {Array} List of session rows
 */
async function fetchActiveSessions() {
    if (!client) return [];
    try {
        const { data, error } = await client.from('active_sessions').select('*').order('last_active_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error("Error fetching active sessions from Supabase:", e);
        return [];
    }
}

/**
 * Register or update device active session
 * @param {string} deviceId Unique client identifier
 * @param {string} deviceName User Agent string
 * @param {string} role App role
 * @returns {boolean} Success state
 */
async function registerSession(deviceId, deviceName, role) {
    if (!client) return false;
    try {
        const payload = {
            device_id: deviceId,
            device_name: deviceName,
            role: role || 'local',
            last_active_at: new Date().toISOString(),
            is_blocked: false
        };
        const { error } = await client.from('active_sessions').upsert(payload, { onConflict: 'device_id' });
        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error registering session to Supabase:", e);
        return false;
    }
}

/**
 * Delete a session (kickout or logout)
 * @param {string} deviceId Device identifier
 */
async function deleteSession(deviceId) {
    if (!client) return;
    try {
        const { error } = await client.from('active_sessions').delete().eq('device_id', deviceId);
        if (error) throw error;
    } catch (e) {
        console.error("Error deleting session from Supabase:", e);
    }
}

/**
 * Block or unblock a session
 * @param {string} deviceId Device identifier
 * @param {boolean} isBlocked Block state
 */
async function blockSession(deviceId, isBlocked) {
    if (!client) return;
    try {
        const { error } = await client.from('active_sessions').update({ is_blocked: isBlocked }).eq('device_id', deviceId);
        if (error) throw error;
    } catch (e) {
        console.error("Error blocking session in Supabase:", e);
    }
}

/**
 * Trust or untrust a session
 * @param {string} deviceId Device identifier
 * @param {boolean} isTrusted Trust state
 */
async function trustSession(deviceId, isTrusted) {
    if (!client) return;
    try {
        const { error } = await client.from('active_sessions').update({ is_trusted: isTrusted }).eq('device_id', deviceId);
        if (error) throw error;
    } catch (e) {
        console.error("Error setting session trust in Supabase:", e);
    }
}

// ================= AUDIT & ACTIVITY LOGS =================

/**
 * Inserts a new activity log record
 * @param {string} role Profile role ('local', 'cocina', 'admin')
 * @param {string} action Action description
 * @param {string} details JSON or details string
 */
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
    try {
        const { error } = await client.from('activity_logs').insert(payload);
        if (error) throw error;
    } catch (e) {
        console.error("Error inserting activity log to Supabase:", e);
    }
}

/**
 * Fetches recent activity logs
 * @returns {Array} List of logs
 */
async function fetchActivityLogs() {
    if (!client) {
        try {
            const localLogs = JSON.parse(localStorage.getItem('casa_lucenzo_local_activity_logs') || '[]');
            return [...localLogs].reverse();
        } catch(e) {
            return [];
        }
    }
    try {
        const { data, error } = await client.from('activity_logs').select('*').order('timestamp', { ascending: false }).limit(50);
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error("Error fetching activity logs from Supabase:", e);
        try {
            const localLogs = JSON.parse(localStorage.getItem('casa_lucenzo_local_activity_logs') || '[]');
            return [...localLogs].reverse();
        } catch(err) {
            return [];
        }
    }
}

let reconnectTimer = null;

/**
 * Subscribes to real-time events on all Supabase tables with auto-reconnection
 * @param {Function} onDbChange Callback when any table updates
 */
function subscribeToChanges(onDbChange) {
    if (!client) return;
    
    if (activeSubscription) {
        try {
            activeSubscription.unsubscribe();
        } catch { /* already closed or socket dropped -- we're replacing it anyway */ }
    }

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    activeSubscription = client.channel('casa-lucenzo-realtime-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (p) => onDbChange('products', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, (p) => onDbChange('sales', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (p) => onDbChange('expenses', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, (p) => onDbChange('debts', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'replenishments' }, (p) => onDbChange('replenishments', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, (p) => onDbChange('ingredients', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (p) => onDbChange('users', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, (p) => onDbChange('app_config', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_sessions' }, (p) => onDbChange('active_sessions', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, (p) => onDbChange('activity_logs', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_online' }, (p) => onDbChange('pedidos_online', p))
        .subscribe((status) => {
            console.log(`Realtime channel status: ${status}`);
            if (status === 'SUBSCRIBED') {
                console.log("Subscribed to all PostgreSQL change channels successfully.");
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn(`Realtime channel interrupted (${status}). Scheduling auto-reconnect...`);
                if (!reconnectTimer) {
                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null;
                        if (navigator.onLine && client) {
                            subscribeToChanges(onDbChange);
                            if (typeof onDbChange === 'function') {
                                onDbChange('all', null);
                            }
                        }
                    }, 3000);
                }
            }
        });
}

// Expose to window namespace
window.SupabaseManager = {
    isConfigured,
    isTestEnvironment,
    init,
    signInUser,
    signOutUser,
    getCurrentSession,
    getUserProfile,
    setQuickPin,
    setUserPinByAdmin,
    verifyQuickPin,
    fetchProfiles,
    upsertProfile,
    signUpNewUser,
    setProfileActive,
    fetchProducts,
    fetchSales,
    fetchExpenses,
    fetchDebts,
    fetchReplenishments,
    fetchIngredients,
    fetchPedidosOnline,
    updatePedidoStatus,
    upsertProduct,
    resetPastelitoCapacity,
    deleteProduct,
    insertStockMovement,
    getPendingStockMovementProductIds,
    insertSale,
    insertSales,
    upsertSales,
    voidSale,
    voidSalesByTimestamp,
    insertExpense,
    deleteExpense,
    deleteExpenses,
    upsertDebt,
    deleteDebt,
    insertDebtPayment,
    upsertReplenishment,
    deleteReplenishment,
    upsertIngredient,
    fetchAppConfig,
    upsertAppConfig,
    insertDayClose,
    getClient,
    subscribeToChanges,
    getDbSupportsLastClose: () => dbSupportsLastClose,
    fetchStatsData,
    fetchExpensesRange,
    fetchPnlData,
    fetchDayReport,
    fetchReportDays,
    fetchSalesHistory,
    fetchActiveSessions,
    registerSession,
    deleteSession,
    blockSession,
    trustSession,
    insertActivityLog,
    fetchActivityLogs
};
