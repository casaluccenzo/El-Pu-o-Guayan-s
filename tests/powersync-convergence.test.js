// Plan B, Task 16 -- convergence check.
//
// See docs/superpowers/plans/2026-09-23-offline-first-pos-plan-B-frontend.md
// (Task 16) for the full reasoning. Short version, worked out with Gemini
// before writing any of this: a genuine "two independent PowerSync clients"
// harness isn't feasible right now --
//   - @powersync/web needs a real browser (SharedWorker, OPFS/IndexedDB,
//     WASM). Running it in plain Node would need @powersync/node, which
//     pulls in native C++ SQLite bindings this project doesn't have.
//   - Two ordinary tabs of the same origin do NOT behave like two isolated
//     devices -- they share ONE SharedWorker and one local SQLite db.
//     Confirmed empirically during Task 13's browser verification (a
//     diagnostic write from one tab reached Postgres through a connection
//     that belonged to a completely different, forgotten background tab).
//     Two truly separate PowerSync clients need two separate browser
//     profiles, which this environment can't drive as two independent
//     contexts either.
//
// What actually has to converge once two real devices reconnect isn't
// PowerSync's own plumbing (it just uploads queued CRUD ops -- that's the
// SDK's job, not this app's) -- it's Postgres' data model: stock_movements
// + recompute_product_stock() (migrations 030/033), debt_payments' sum
// (mapDebtRow, js/supabase.js), and day_closes' last_close_at() (026). This
// script simulates exactly what two devices' upload queues would eventually
// send -- concurrent/out-of-order inserts from two device_ids -- straight
// against a real dev Postgres, and checks the REAL trigger output, not a
// JS mirror (that's what Task 15's pure-function suite already covers).
//
// The PowerSync-specific half this can't reach (the CRUD queue itself,
// conflict handling, reconnect behavior) is covered by a documented manual
// pass instead -- see the Task 16 notes in the plan doc for exactly what
// that involves and its current status.
//
// NEVER point this at production. Requires:
//   SUPABASE_URL, SUPABASE_ANON_KEY               (a DEV project only)
//   CONVERGENCE_TEST_USERNAME, CONVERGENCE_TEST_PASSWORD
//     A real login (venta/admin role) on that dev project -- every insert
//     here goes through the exact same RLS policies (001/025/026/027) a
//     real device would hit after signing in, not a service-role bypass.
//     More faithful to what's actually being verified, and it means this
//     script never has to hold a service_role key at all.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=... \
//   CONVERGENCE_TEST_USERNAME=test CONVERGENCE_TEST_PASSWORD=... \
//     node tests/powersync-convergence.test.js
//
// Not part of `npm test` on purpose (per the plan's own Task 16 note: this
// needs real network + real dev credentials, the opposite of the hermetic
// suite everything else in tests/ runs as) -- run it on its own, or via
// `npm run test:convergence`.

const assert = require('assert');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USERNAME = process.env.CONVERGENCE_TEST_USERNAME;
const PASSWORD = process.env.CONVERGENCE_TEST_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY || !USERNAME || !PASSWORD) {
    console.error('❌ Faltan variables de entorno.');
    console.error('   Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... CONVERGENCE_TEST_USERNAME=... CONVERGENCE_TEST_PASSWORD=... node tests/powersync-convergence.test.js');
    process.exit(1);
}

// Safety net: this script inserts and deletes real rows. casa-lucenzo-dev's
// project ref is the only target it'll touch without an explicit override --
// one stray env var pointed at production (xttpaqokeyywjaajvjyu) must not be
// able to run this.
const DEV_PROJECT_REF = 'kzthbjjfguivguppqeuq';
if (!SUPABASE_URL.includes(DEV_PROJECT_REF) && process.env.CONVERGENCE_TEST_CONFIRM_DEV !== 'yes') {
    console.error(`❌ SUPABASE_URL no parece ser casa-lucenzo-dev (ref esperado: ${DEV_PROJECT_REF}).`);
    console.error('   Este script inserta y borra filas reales. Si de verdad es un proyecto dev distinto,');
    console.error('   confirmá con CONVERGENCE_TEST_CONFIRM_DEV=yes.');
    process.exit(1);
}

let accessToken = null;

async function signIn() {
    const email = USERNAME.includes('@') ? USERNAME : `${USERNAME}@casalucenzo.com`;
    const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD })
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Login falló (HTTP ${resp.status}): ${text}`);
    }
    const data = await resp.json();
    accessToken = data.access_token;
}

async function rest(path, { method = 'GET', body, prefer = 'return=representation' } = {}) {
    const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
        method,
        headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': prefer
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`${method} ${path} -> HTTP ${resp.status}: ${text}`);
    }
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
}

const get = (path) => rest(path);
const post = (table, row) => rest(table, { method: 'POST', body: row });
const del = (path) => rest(path, { method: 'DELETE', prefer: 'return=minimal' });

const DEVICE_A = 'convergence-test-tablet-1';
const DEVICE_B = 'convergence-test-tablet-2';
const TEST_TAG = `conv-${Date.now()}`;
const DEFAULT_LOCATION_ID = '00000000-0000-0000-0000-000000000001';

// Every id/uuid this run creates, so cleanup can't miss one even if an
// assertion throws partway through.
const created = { products: [], stockMovements: [], dayCloses: [], sales: [], debts: [], debtPayments: [] };

async function cleanup() {
    // Reverse-ish order: children before the products/debts they reference.
    for (const id of created.stockMovements) await del(`stock_movements?id=eq.${id}`).catch(() => {});
    for (const uuid of created.sales) await del(`sales?uuid=eq.${uuid}`).catch(() => {});
    for (const id of created.debtPayments) await del(`debt_payments?id=eq.${id}`).catch(() => {});
    for (const uuid of created.debts) await del(`debts?uuid=eq.${uuid}`).catch(() => {});
    for (const id of created.products) await del(`products?id=eq.${id}`).catch(() => {});

    // day_closes has NO delete policy (001/026) -- it's append-only by
    // design, same as the real day-close feature. A first real run of this
    // script tried to delete it anyway: RLS silently no-ops the DELETE (0
    // rows affected, no error), so the row was quietly left behind forever.
    // Accept that instead of pretending otherwise: this test's own day_close
    // becomes a permanent (harmless) row here, exactly like a real close
    // would. Left over test rows from before this fix was found were purged
    // once by hand via a privileged connection, not through this script.
    if (created.dayCloses.length > 0) {
        console.log(`ℹ️  ${created.dayCloses.length} fila(s) de day_closes quedan (append-only, sin policy de DELETE -- esperado, no es basura a limpiar).`);
    }
}

async function testStockConvergence() {
    // A pastelito product, so the day_closes boundary actually applies
    // (recompute_product_stock's pastelitos branch only counts movements
    // strictly after last_close_at()).
    const productId = `${TEST_TAG}-pastelito`;
    created.products.push(productId);
    await post('products', {
        id: productId, name: 'Convergence Test Pastelito', stock: 0, min: 0, max: 0,
        unit: 'unid.', price: '1.00', cost: '0.40', category: 'pastelitos', initial_stock: 0,
        updated_at: new Date().toISOString(), location_id: DEFAULT_LOCATION_ID
    });

    // The close has to exist BEFORE the stale movement below, not after --
    // last_close_at() is the MAX over every row in day_closes, including
    // ones from unrelated earlier test runs still sitting in this shared
    // dev project. Insert this one first so it immediately becomes that
    // global max; only then does a movement timestamped before it reliably
    // land on the correct side of the boundary. (First real run of this
    // script caught exactly this: the stale movement below fired against a
    // pre-existing close from hours earlier, counted as "since close", and
    // permanently bumped max to 999 -- GREATEST() never comes back down,
    // by design, see Task 9. Not a product bug -- a test ordering bug.)
    const closedAt = new Date();
    const dayCloseId = `${TEST_TAG}-close`;
    created.dayCloses.push(dayCloseId);
    await post('day_closes', {
        id: dayCloseId, closed_at: closedAt.toISOString(), device_id: DEVICE_A,
        location_id: DEFAULT_LOCATION_ID
    });

    // Yesterday's leftover load -- must be EXCLUDED from both stock and
    // initial_stock now that the close above landed. If the boundary
    // comparison were ever wrong (e.g. >= instead of >, or the wrong
    // column), this large, obviously-wrong number would leak into the
    // totals and the assertions below would catch it immediately.
    const staleLoadId = `${TEST_TAG}-sm-stale`;
    created.stockMovements.push(staleLoadId);
    await post('stock_movements', {
        id: staleLoadId, product_id: productId, delta: 999, type: 'load',
        device_id: DEVICE_A, created_at: new Date(closedAt.getTime() - 3600000).toISOString(),
        location_id: DEFAULT_LOCATION_ID
    });

    // Give Postgres a beat before inserting post-close rows so their
    // timestamps are unambiguously later than day_closes.closed_at (real
    // devices go through a network round-trip in between; this script does
    // not, so it has to wait on purpose instead).
    await new Promise(r => setTimeout(r, 1200));

    // Device A reconnects: loaded 20 units for today, then rang up a sale.
    const loadId = `${TEST_TAG}-sm-load`;
    const saleAId = `${TEST_TAG}-sm-sale-a`;
    created.stockMovements.push(loadId, saleAId);
    await post('stock_movements', {
        id: loadId, product_id: productId, delta: 20, type: 'load',
        device_id: DEVICE_A, created_at: new Date().toISOString(), location_id: DEFAULT_LOCATION_ID
    });
    await post('stock_movements', {
        id: saleAId, product_id: productId, delta: -2, type: 'sale',
        device_id: DEVICE_A, created_at: new Date().toISOString(), location_id: DEFAULT_LOCATION_ID
    });

    // Device B reconnects independently and rings up its own sale --
    // interleaved with device A's, not sequenced by any shared client state.
    const saleBId = `${TEST_TAG}-sm-sale-b`;
    created.stockMovements.push(saleBId);
    await post('stock_movements', {
        id: saleBId, product_id: productId, delta: -3, type: 'sale',
        device_id: DEVICE_B, created_at: new Date().toISOString(), location_id: DEFAULT_LOCATION_ID
    });

    // Let the row-level trigger (fires per-INSERT) finish before reading back.
    await new Promise(r => setTimeout(r, 500));

    const [product] = await get(`products?id=eq.${productId}&select=stock,initial_stock,max`);
    assert.strictEqual(product.stock, 15, "Convergencia: stock post-cierre = 20 (carga) - 2 (device A) - 3 (device B) = 15, sin perder ninguna venta");
    assert.strictEqual(product.initial_stock, 20, "Convergencia: initial_stock post-cierre = solo la carga de 20, la de 999 pre-cierre quedó excluida");
    assert.strictEqual(product.max, 20, "Convergencia: max = GREATEST(initial_stock, max_actual) subió a 20");
    console.log("✅ TEST PASSED (convergencia real, Postgres): stock_movements de dos dispositivos + el cierre convergen exactamente en recompute_product_stock()");
}

async function testSalesNotLost() {
    const timestamp = new Date().toISOString();
    const saleA = { uuid: `${TEST_TAG}-sale-a`, product_id: 'seed-beb-a', name: `Convergence Test [Device A]`, price: '1.00', timestamp, location_id: DEFAULT_LOCATION_ID };
    const saleB = { uuid: `${TEST_TAG}-sale-b`, product_id: 'seed-beb-b', name: `Convergence Test [Device B]`, price: '1.00', timestamp, location_id: DEFAULT_LOCATION_ID };
    created.sales.push(saleA.uuid, saleB.uuid);
    await post('sales', saleA);
    await post('sales', saleB);

    const rows = await get(`sales?uuid=in.(${saleA.uuid},${saleB.uuid})&select=uuid`);
    assert.strictEqual(rows.length, 2, "Convergencia: 0 ventas perdidas -- ambas filas de sales, insertadas por dispositivos distintos, llegan intactas");
    console.log("✅ TEST PASSED (convergencia real, Postgres): ninguna venta de ningún dispositivo se pierde ni se pisa");
}

async function testDebtConvergence() {
    const debtUuid = `${TEST_TAG}-debt`;
    created.debts.push(debtUuid);
    await post('debts', {
        uuid: debtUuid, client_name: 'Convergence Test Client', amount: '100.00',
        description: 'Deuda de prueba (Task 16)', timestamp: new Date().toISOString(),
        location_id: DEFAULT_LOCATION_ID
    });

    const paymentAId = `${TEST_TAG}-dp-a`;
    const paymentBId = `${TEST_TAG}-dp-b`;
    created.debtPayments.push(paymentAId, paymentBId);
    // Two devices abonando a la MISMA deuda, en orden intercalado -- ninguno
    // conoce el abono del otro hasta que ambos ya subieron.
    await post('debt_payments', {
        id: paymentAId, debt_uuid: debtUuid, amount: '10.10', method: 'Efectivo',
        device_id: DEVICE_A, created_at: new Date().toISOString(), location_id: DEFAULT_LOCATION_ID
    });
    await post('debt_payments', {
        id: paymentBId, debt_uuid: debtUuid, amount: '5.00', method: 'Punto de Venta',
        device_id: DEVICE_B, created_at: new Date().toISOString(), location_id: DEFAULT_LOCATION_ID
    });

    const [debt] = await get(`debts?uuid=eq.${debtUuid}&select=amount`);
    const payments = await get(`debt_payments?debt_uuid=eq.${debtUuid}&select=amount`);
    const totalPaid = Number(payments.reduce((s, p) => s + parseFloat(p.amount), 0).toFixed(2));
    const balance = Number(Math.max(0, parseFloat(debt.amount) - totalPaid).toFixed(2));

    assert.strictEqual(totalPaid, 15.10, "Convergencia: Σ abonos de ambos dispositivos = 10.10 + 5.00 = 15.10 exacto, sin arrastre de punto flotante");
    assert.strictEqual(balance, 84.90, "Convergencia: saldo = 100 - 15.10 = 84.90 -- debts.amount nunca se mutó (spec §5.3, append-only)");
    console.log("✅ TEST PASSED (convergencia real, Postgres): abonos de dos dispositivos a la misma deuda convergen en el saldo correcto");
}

(async () => {
    const failures = [];
    const suites = [
        ['Stock + cierre de jornada (dos dispositivos)', testStockConvergence],
        ['Ninguna venta perdida (dos dispositivos)', testSalesNotLost],
        ['Abonos a deuda (dos dispositivos)', testDebtConvergence]
    ];

    try {
        await signIn();
    } catch (err) {
        console.error(`❌ No se pudo autenticar: ${err.message}`);
        process.exit(1);
    }

    try {
        for (const [name, suite] of suites) {
            try {
                await suite();
            } catch (err) {
                failures.push({ name, err });
                console.error(`\n❌ SUITE FAILED: ${name}\n${err && err.message ? err.message : err}\n`);
            }
        }
    } finally {
        console.log('\n🧹 Limpiando filas de prueba en casa-lucenzo-dev...');
        await cleanup();
    }

    if (failures.length === 0) {
        console.log("\n🎉 CONVERGENCE CHECK PASSED against real casa-lucenzo-dev Postgres!");
        process.exit(0);
    }
    console.error(`\n💥 ${failures.length} of ${suites.length} suite(s) failed: ${failures.map(f => f.name).join(', ')}`);
    process.exit(1);
})();
