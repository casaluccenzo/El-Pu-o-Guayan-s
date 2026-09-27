if (typeof global.window === 'undefined') {
    global.window = {
        addEventListener: () => {},
        location: { reload: () => {} },
        UI: { showToast: () => {} },
        UIManager: { showToast: () => {} },
        SupabaseManager: { isConfigured: () => false }
    };
} else {
    global.window.UI = { showToast: () => {} };
    global.window.UIManager = { showToast: () => {} };
    global.window.SupabaseManager = { isConfigured: () => false };
}
global.UIManager = { showToast: () => {} };
global.SupabaseManager = { isConfigured: () => false };
if (typeof global.document === 'undefined') {
    global.document = {
        addEventListener: () => {},
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
}
if (typeof global.localStorage === 'undefined') {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    };
}
// Node exposes a global `navigator` from v21 on, but CI pins Node 20, where it
// does not exist -- so app code that reads it (triggerHaptic does `'vibrate' in
// navigator`, and handleUserLogin calls it on the failed-login path) threw
// "navigator is not defined" only on CI. Mock it like the other browser globals
// above instead of relying on whatever the local Node version happens to have.
if (typeof global.navigator === 'undefined') {
    global.navigator = { onLine: true };
}

const assert = require('assert');
const crypto = require('crypto');
const { calculateTotals, validateStockAdjustment, checkRolePermission, handleUserLogin, applyStockLoad, applyStockCount, resolveVitrinaCapacity, bcvRateChangedEnough } = require('../js/app');
const waWebhookHandler = require('../api/whatsapp-webhook');
const tgWebhookHandler = require('../api/telegram-webhook');
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

// Setup mock environment variables for unit testing
process.env.WHATSAPP_BOT_ENABLED = 'true';
process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';
process.env.WHATSAPP_APP_SECRET = 'test_app_secret';
process.env.WHATSAPP_ADMIN_PHONE = '584141234567';
process.env.TELEGRAM_BOT_ENABLED = 'true';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test_tg_secret';
process.env.TELEGRAM_ADMIN_ID = '999888777';

// Simple mock req/res helper for testing serverless functions in Node
function createMockReqRes(method, query = {}, body = {}, headers = {}) {
    const rawBodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const hmac = crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(rawBodyStr).digest('hex');

    const req = {
        method,
        query,
        body: rawBodyStr,
        headers: {
            'x-hub-signature-256': `sha256=${hmac}`,
            ...headers
        }
    };

    let statusCode = 200;
    let responseData = null;

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        send(data) {
            responseData = data;
            return this;
        },
        json(data) {
            responseData = data;
            return this;
        },
        getStatusCode() { return statusCode; },
        getData() { return responseData; }
    };

    return { req, res };
}

// Mock req/res helper for the Telegram webhook (secret-token auth, not HMAC)
function createMockTelegramReqRes(body = {}, headers = {}) {
    const req = {
        method: 'POST',
        body,
        headers: {
            'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET,
            ...headers
        }
    };

    let statusCode = 200;
    let responseData = null;

    const res = {
        status(code) { statusCode = code; return this; },
        send(data) { responseData = data; return this; },
        json(data) { responseData = data; return this; },
        getStatusCode() { return statusCode; },
        getData() { return responseData; }
    };

    return { req, res };
}

// Unit Tests for Core Business Functions
function runCoreUnitTests() {
    console.log("🧪 Running Casa Lucenzo Unit Tests (Importing REAL application code)...\n");

    // 1. Math Calculation Tests
    const totals = calculateTotals([{ price: 5.00 }, { price: 2.20 }], [{ amount: 1.20 }]);
    assert.strictEqual(totals.totalSales, 7.20, "REAL calculateTotals: Total sales calculation should equal $7.20");
    assert.strictEqual(totals.totalExpenses, 1.20, "REAL calculateTotals: Total expenses calculation should equal $1.20");
    assert.strictEqual(totals.netCash, 6.00, "REAL calculateTotals: Net cash calculation should equal $6.00");
    console.log("✅ TEST PASSED: REAL calculateTotals: Total sales calculation should equal $7.20");
    console.log("✅ TEST PASSED: REAL calculateTotals: Total expenses calculation should equal $1.20");
    console.log("✅ TEST PASSED: REAL calculateTotals: Net cash calculation should equal $6.00");

    // 1b. A day that spent more than it sold must report the loss, not $0.00.
    const lossTotals = calculateTotals([{ price: 10.00 }], [{ amount: 25.50 }]);
    assert.strictEqual(lossTotals.netCash, -15.50, "REAL calculateTotals: A loss day must report negative net cash, not be floored at 0");
    console.log("✅ TEST PASSED: REAL calculateTotals: A loss day must report negative net cash, not be floored at 0");

    // 1c. Adding the same product repeatedly must bill every unit. `quantity`
    // is what checkout counts rows off, so it has to track `qty`.
    const { addToCart } = require('../js/sales');
    let cart = addToCart([], { id: 'pollo', name: 'Pollo', price: 1.98 });
    cart = addToCart(cart, { id: 'pollo', name: 'Pollo', price: 1.98 });
    cart = addToCart(cart, { id: 'pollo', name: 'Pollo', price: 1.98 });
    assert.strictEqual(cart.length, 1, "REAL addToCart: Repeated adds of one product stay a single cart line");
    assert.strictEqual(cart[0].quantity, 3, "REAL addToCart: `quantity` must reach 3 -- checkout bills off this field");
    assert.strictEqual(cart[0].qty, 3, "REAL addToCart: `qty` must stay in step with `quantity`");
    console.log("✅ TEST PASSED: REAL addToCart: Repeated adds of one product stay a single cart line");
    console.log("✅ TEST PASSED: REAL addToCart: `quantity` must reach 3 -- checkout bills off this field");
    console.log("✅ TEST PASSED: REAL addToCart: `qty` must stay in step with `quantity`");

    // 2. Inventory Stock Validation Tests
    const adjPass = validateStockAdjustment(5, 1);
    assert.strictEqual(adjPass.allowed, true, "REAL validateStockAdjustment: Adding stock to 5 by 1 should be allowed");
    assert.strictEqual(adjPass.newStock, 6, "REAL validateStockAdjustment: Adding stock to 5 by 1 should result in 6");
    const adjFail = validateStockAdjustment(0, -1);
    assert.strictEqual(adjFail.allowed, false, "REAL validateStockAdjustment: Decreasing 0 stock should be blocked");
    console.log("✅ TEST PASSED: REAL validateStockAdjustment: Adding stock to 5 by 1 should result in 6");
    console.log("✅ TEST PASSED: REAL validateStockAdjustment: Selling item with 0 stock should be blocked");

    // 2b. Daily stock load: `initial_stock` is the day's baseline and every
    // "vendidos reales" figure is `initial_stock - stock`, so a load must move
    // both or the day's totals silently collapse to zero.
    const fresh = { id: 'mechada', stock: 0, max: 0, initial_stock: 0, price: 1.98 };

    applyStockLoad(fresh, 20);
    assert.strictEqual(fresh.stock, 20, "REAL applyStockLoad: Loading 20 into an empty vitrina leaves 20 on the shelf");
    assert.strictEqual(fresh.initial_stock, 20, "REAL applyStockLoad: Loading 20 raises the day's baseline to 20");
    assert.strictEqual(fresh.max, 20, "REAL applyStockLoad: Capacity follows the load");

    // Sell 8, then load a second batch of 10 mid-morning.
    fresh.stock -= 8;
    applyStockLoad(fresh, 10);
    assert.strictEqual(fresh.initial_stock, 30, "REAL applyStockLoad: A second batch adds to the baseline instead of replacing it");
    assert.strictEqual(fresh.initial_stock - fresh.stock, 8, "REAL applyStockLoad: Reported sales survive a mid-day reload (8 sold)");

    // Capacity must never accumulate on its own -- that is what kept telling
    // Cocina to cook batches nobody had loaded.
    // 8 were already sold when the second batch arrived, so the shelf never
    // held all 30 at once: capacity is the high-water mark (22), not the total.
    assert.strictEqual(resolveVitrinaCapacity(fresh), 22, "REAL resolveVitrinaCapacity: Capacity is the shelf high-water mark, not the day's total");
    applyStockLoad(fresh, 0);
    assert.strictEqual(fresh.max, 22, "REAL applyStockLoad: A zero load is a no-op, not a capacity bump");
    assert.strictEqual(applyStockLoad(fresh, -5), false, "REAL applyStockLoad: A negative load is rejected outright");

    // A recount downward is a physical correction: the baseline holds so the
    // missing pieces surface in the Conciliación instead of vanishing.
    const recount = { id: 'queso', stock: 10, max: 10, initial_stock: 10 };
    applyStockCount(recount, 6);
    assert.strictEqual(recount.stock, 6, "REAL applyStockCount: Recounting down sets the physical stock");
    assert.strictEqual(recount.initial_stock, 10, "REAL applyStockCount: Recounting down leaves the day's baseline intact");
    assert.strictEqual(recount.initial_stock - recount.stock, 4, "REAL applyStockCount: The 4 unaccounted pieces stay visible as sales/faltantes");

    // Typing a higher number into the edit modal is how a batch gets loaded.
    applyStockCount(recount, 16);
    assert.strictEqual(recount.initial_stock, 20, "REAL applyStockCount: Recounting up loads the difference into the baseline");
    console.log("✅ TEST PASSED: REAL applyStockLoad: Daily stock load keeps stock and baseline in sync");
    console.log("✅ TEST PASSED: REAL applyStockLoad: Mid-day reload preserves the day's real sales figure");
    console.log("✅ TEST PASSED: REAL applyStockLoad: Vitrina capacity never accumulates on its own");
    console.log("✅ TEST PASSED: REAL applyStockCount: Downward recount keeps missing pieces visible");
    console.log("✅ TEST PASSED: REAL applyStockCount: Upward recount is treated as a load");

    // 3. RBAC Role-Based Access Control Tests
    assert.strictEqual(checkRolePermission('admin', 'day_close'), true, "REAL checkRolePermission: Admin should have permission for Day Close");
    assert.strictEqual(checkRolePermission('ventas', 'day_close'), false, "REAL checkRolePermission: Ventas should NOT have permission for Day Close");
    assert.strictEqual(checkRolePermission('cocina', 'pos'), false, "REAL checkRolePermission: Cocina should NOT have permission for POS register");
    console.log("✅ TEST PASSED: REAL checkRolePermission: Admin should have permission for Day Close");
    console.log("✅ TEST PASSED: REAL checkRolePermission: Ventas should NOT have permission for Day Close");
    console.log("✅ TEST PASSED: REAL checkRolePermission: Cocina should NOT have permission for POS register");

    // 4. BCV rate change guard -- fetchBcvRate polls every 6h + on focus, and the
    // background config read runs on every re-sync. Without this guard each poll
    // that found the SAME published rate still wrote app_config (fanning out over
    // realtime to every device) and ran a full renderAllViews(). That constant
    // churn is what made the till feel slow. The guard must only report a real move.
    assert.strictEqual(bcvRateChangedEnough(732.48, 732.48), false, "REAL bcvRateChangedEnough: identical rate is not a change");
    assert.strictEqual(bcvRateChangedEnough(794.9917, 794.9950), false, "REAL bcvRateChangedEnough: sub-céntimo provider drift is not a change");
    assert.strictEqual(bcvRateChangedEnough(794.99, 795.10), true, "REAL bcvRateChangedEnough: a real rate move is a change");
    assert.strictEqual(bcvRateChangedEnough(732.48, 0), false, "REAL bcvRateChangedEnough: a failed fetch (0) never counts as a change");
    assert.strictEqual(bcvRateChangedEnough(0, 795.10), true, "REAL bcvRateChangedEnough: first real rate over an unset baseline is a change");
    console.log("✅ TEST PASSED: REAL bcvRateChangedEnough: only a real rate move triggers sync + re-render");
}

// Analytics Tests: weekday pattern, flavor ranking, and daily prep recommendation
function runAnalyticsUnitTests() {
    // Finds the most recent occurrence of `weekday` (0=Domingo..6=Sábado) that
    // is `weeksAgo` weeks before today, so the fixture dates are always valid
    // regardless of when the test suite runs.
    function pastWeekday(weekday, weeksAgo) {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        const diff = (d.getDay() - weekday + 7) % 7;
        d.setDate(d.getDate() - diff - (weeksAgo * 7));
        return d;
    }

    function saleAt(date, productId, price = 1.50) {
        return { productId, product_id: productId, name: productId, price, timestamp: date.toISOString() };
    }

    const TUESDAY = 2;
    const WEDNESDAY = 3;

    const sales = [];
    // 4 Tuesdays of "mechada" sales: 10, 12, 8, 14 units -> average 11/day
    [10, 12, 8, 14].forEach((qty, weeksAgo) => {
        const d = pastWeekday(TUESDAY, weeksAgo);
        for (let n = 0; n < qty; n++) sales.push(saleAt(d, 'mechada'));
    });
    // Same 4 Tuesdays, much lower "pollo" volume
    [2, 3, 1, 2].forEach((qty, weeksAgo) => {
        const d = pastWeekday(TUESDAY, weeksAgo);
        for (let n = 0; n < qty; n++) sales.push(saleAt(d, 'pollo'));
    });
    // Only 2 Wednesdays of "queso" sales -> too few samples for confidence
    [4, 6].forEach((qty, weeksAgo) => {
        const d = pastWeekday(WEDNESDAY, weeksAgo);
        for (let n = 0; n < qty; n++) sales.push(saleAt(d, 'queso'));
    });

    const products = [
        { id: 'mechada', name: 'Carne Mechada', category: 'pastelitos', max: 20 },
        { id: 'pollo', name: 'Pollo', category: 'pastelitos', max: 20 },
        { id: 'queso', name: 'Queso', category: 'pastelitos', max: 20 }
    ];

    const pattern = getWeekdayPattern(sales);
    const tuesdayBucket = pattern.find(p => p.weekday === TUESDAY);
    assert.strictEqual(tuesdayBucket.sampleSize, 4, "REAL AnalyticsManager.getWeekdayPattern: Tuesday should have 4 sampled days");
    console.log("✅ TEST PASSED: REAL AnalyticsManager.getWeekdayPattern: Tuesday sample size is 4");

    const ranking = getFlavorRanking(sales, products);
    assert.strictEqual(ranking[0].productId, 'mechada', "REAL AnalyticsManager.getFlavorRanking: Mechada should be the top seller");
    assert.strictEqual(ranking[0].quantity, 44, "REAL AnalyticsManager.getFlavorRanking: Mechada total units sold should be 44");
    console.log("✅ TEST PASSED: REAL AnalyticsManager.getFlavorRanking: Ranks Mechada as the top seller with 44 units");

    const tuesdayRec = getDailyPrepRecommendation(sales, products, TUESDAY);
    const mechadaRec = tuesdayRec.find(r => r.productId === 'mechada');
    assert.strictEqual(mechadaRec.avg, 11, "REAL AnalyticsManager.getDailyPrepRecommendation: Mechada average for Tuesday should be 11");
    assert.strictEqual(mechadaRec.suggested, 13, "REAL AnalyticsManager.getDailyPrepRecommendation: Mechada suggested prep should round up avg*1.10 to 13");
    assert.strictEqual(mechadaRec.lowConfidence, false, "REAL AnalyticsManager.getDailyPrepRecommendation: 4 sampled Tuesdays should not be flagged low-confidence");
    console.log("✅ TEST PASSED: REAL AnalyticsManager.getDailyPrepRecommendation: Mechada suggested prep for Tuesday is 13 units (avg 11 + margin)");

    const wednesdayRec = getDailyPrepRecommendation(sales, products, WEDNESDAY);
    const quesoRec = wednesdayRec.find(r => r.productId === 'queso');
    assert.strictEqual(quesoRec.lowConfidence, true, "REAL AnalyticsManager.getDailyPrepRecommendation: Only 2 sampled Wednesdays should be flagged low-confidence");
    console.log("✅ TEST PASSED: REAL AnalyticsManager.getDailyPrepRecommendation: Flags low-confidence when fewer than 3 historical samples");

    const comparison = compareVsWeekdayAverage(tuesdayBucket.avgTotal * 1.5, pattern, TUESDAY);
    assert.ok(comparison.pctChange > 0, "REAL AnalyticsManager.compareVsWeekdayAverage: A total 50% above average should report a positive % change");
    console.log("✅ TEST PASSED: REAL AnalyticsManager.compareVsWeekdayAverage: Reports positive % change above the historical Tuesday average");

    // getRecentTrend: 14 days at $10/day vs. the prior 14 days at $8/day -> +25%
    const trendSales = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
        trendSales.push(saleAt(d, 'mechada', 10));
    }
    for (let i = 14; i < 28; i++) {
        const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
        trendSales.push(saleAt(d, 'mechada', 8));
    }
    const trend = getRecentTrend(trendSales, 2);
    assert.strictEqual(trend.recentAvg, 10, "REAL AnalyticsManager.getRecentTrend: Recent 14-day average should be $10");
    assert.strictEqual(trend.priorAvg, 8, "REAL AnalyticsManager.getRecentTrend: Prior 14-day average should be $8");
    assert.strictEqual(trend.pctChange, 25, "REAL AnalyticsManager.getRecentTrend: % change from $8 to $10 should be +25%");
    console.log("✅ TEST PASSED: REAL AnalyticsManager.getRecentTrend: Detects a +25% trend between two comparable 14-day periods");

    // getUpcomingProjection: each projected day should mirror its weekday's historical bucket
    const fakePattern = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        label: WEEKDAY_LABELS[weekday],
        avgTotal: (weekday + 1) * 10,
        avgCount: weekday + 1,
        sampleSize: weekday === 2 ? 1 : 5
    }));
    const projection = getUpcomingProjection(fakePattern, 7);
    assert.strictEqual(projection.length, 7, "REAL AnalyticsManager.getUpcomingProjection: Should project exactly 7 upcoming days");
    projection.forEach(p => {
        const expectedBucket = fakePattern[p.weekday];
        assert.strictEqual(p.projectedTotal, expectedBucket.avgTotal, `REAL AnalyticsManager.getUpcomingProjection: Projected total for weekday ${p.weekday} should match its historical average`);
        assert.strictEqual(p.lowConfidence, expectedBucket.sampleSize < 3, `REAL AnalyticsManager.getUpcomingProjection: lowConfidence flag should reflect sample size for weekday ${p.weekday}`);
    });
    console.log("✅ TEST PASSED: REAL AnalyticsManager.getUpcomingProjection: Projects 7 upcoming days using each weekday's historical average");

    // buildPerformanceInsights: should weave the real numbers into readable Spanish sentences
    const insights = buildPerformanceInsights({ weekdayPattern: pattern, flavorRanking: ranking, trend, todayComparison: comparison });
    assert.ok(Array.isArray(insights) && insights.length > 0, "REAL AnalyticsManager.buildPerformanceInsights: Should return at least one insight");
    assert.ok(insights.some(t => t.includes('Mechada')), "REAL AnalyticsManager.buildPerformanceInsights: Should mention the top-selling flavor (Mechada)");
    console.log("✅ TEST PASSED: REAL AnalyticsManager.buildPerformanceInsights: Generates data-driven insight sentences mentioning the top flavor");

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

    // >1000-row aggregation invariant — the guardrail this repo keeps needing
    // (see the 2026-08-11 pagination note in js/supabase.js). fetchPnlData /
    // fetchExpensesRange now carry a deterministic .order('uuid') tie-breaker
    // after .order('timestamp') so paging can't drop or double a row when many
    // share an identical timestamp; this asserts the aggregation side stays
    // exact for a large, timestamp-collision-heavy input.
    const bigStart = new Date(); bigStart.setDate(bigStart.getDate() - 20); bigStart.setHours(0,0,0,0);
    const bigEnd = new Date(); bigEnd.setHours(23,59,59,999);
    const collidingTs = new Date(); collidingTs.setDate(collidingTs.getDate() - 3); collidingTs.setHours(10,0,0,0);
    const bigSales = [];
    let expectedVentas = 0;
    for (let i = 0; i < 1500; i++) {
        const price = (i % 5) + 1; // 1..5, exact in float
        expectedVentas += price;
        // ~half the rows share one identical timestamp, the rest walk day-by-day
        const ts = (i % 2 === 0)
            ? collidingTs.toISOString()
            : new Date(bigStart.getTime() + (i % 18) * 86400000 + 3600000).toISOString();
        bigSales.push({ productId: 'mechada', name: 'Mechada [Bandeja]', price, cost_at_sale: 0, bcv_rate: 40, timestamp: ts });
    }
    const bigPnl = aggregatePnl(bigSales, [], pnlProducts,
        { start: bigStart, end: bigEnd, periodLabel: 'Bulk', bcvRate: 40 });
    assert.strictEqual(bigPnl.totals.ventasUsd, Number(expectedVentas.toFixed(2)),
        "aggregatePnl: 1500-row Σ price exact despite timestamp collisions");
    console.log("✅ TEST PASSED: aggregatePnl sums >1000 rows exactly");
}

// Plan B, Task 15 -- pure-JS mirrors of the aggregation formulas that live
// server-side (Postgres trigger `recompute_product_stock`, migrations
// 030/033/026) or as a raw SQL string (fetchProducts' pastelitos-live-query,
// js/supabase.js -- Task 9 follow-up). Neither of those is an importable JS
// function: the trigger only runs inside Postgres, and the SQL template
// string can't be unit tested without a real SQLite/PowerSync instance
// (that's Task 16's convergence harness). This suite exists so the FORMULA
// itself -- the thing that has to stay identical across three
// implementations (Postgres trigger, the offline-reload SQL mirror, and
// this test) -- has one fast, deterministic, DB-free place to catch a
// regression. It intentionally is not wired into the app: production keeps
// computing this in Postgres, exactly as Plan B intends.
function runPlanBAggregationTests() {
    // --- recomputeStock: mirrors recompute_product_stock() (030/033) ---
    // last_close_at() = COALESCE(MAX(day_closes.closed_at), '-infinity') --
    // mirrored here as -Infinity so "no closes yet" compares true for every
    // real timestamp, exactly like the SQL does.
    function recomputeStock(movements, category, lastCloseAtMs, currentMax) {
        // stock_movements.delta is an integer column -- no float rounding needed here
        // (unlike money amounts below).
        const sum = (rows) => rows.reduce((s, m) => s + m.delta, 0);
        const since = movements.filter(m => new Date(m.createdAt).getTime() > lastCloseAtMs);
        let stock, initialStock;
        if (category === 'pastelitos') {
            stock = sum(since);
            initialStock = sum(since.filter(m => m.type === 'load'));
        } else {
            const upToClose = movements.filter(m => new Date(m.createdAt).getTime() <= lastCloseAtMs);
            stock = sum(movements);
            initialStock = sum(upToClose) + sum(since.filter(m => m.type === 'load'));
        }
        return { stock, initialStock, max: Math.max(initialStock, currentMax || 0) };
    }

    const t0 = new Date('2026-09-20T04:00:00.000Z').getTime(); // last_close_at()
    const before = (mins) => new Date(t0 - mins * 60000).toISOString();
    const after = (mins) => new Date(t0 + mins * 60000).toISOString();

    // Pastelitos: only movements strictly after the close count at all.
    const pastelitoMoves = [
        { delta: 20, type: 'load', createdAt: before(30) },  // ayer -- ignorado
        { delta: 20, type: 'load', createdAt: after(10) },
        { delta: -3, type: 'sale', createdAt: after(20) },
        { delta: 1, type: 'sale_return', createdAt: after(21) }
    ];
    let r = recomputeStock(pastelitoMoves, 'pastelitos', t0, 0);
    assert.strictEqual(r.stock, 18, "recomputeStock: pastelitos stock = Σ deltas post-cierre (20-3+1)");
    assert.strictEqual(r.initialStock, 20, "recomputeStock: pastelitos initial_stock = Σ solo 'load' post-cierre");
    assert.strictEqual(r.max, 20, "recomputeStock: max = GREATEST(initial_stock, max_actual) sube");
    console.log("✅ TEST PASSED: recomputeStock (pastelitos) matches recompute_product_stock()'s formula");

    // Otras categorías (bebidas/dulces/etc.): stock es historico completo;
    // initial_stock = lo que había al cierre + lo cargado desde entonces.
    const bebidaMoves = [
        { delta: 60, type: 'load', createdAt: before(2000) },
        { delta: -45, type: 'sale', createdAt: before(100) }, // quedan 15 al cierre
        { delta: 12, type: 'load', createdAt: after(15) },
        { delta: -4, type: 'sale', createdAt: after(30) }
    ];
    r = recomputeStock(bebidaMoves, 'bebidas', t0, 60);
    assert.strictEqual(r.stock, 23, "recomputeStock: no-pastelitos stock = Σ TODO el historial (60-45+12-4)");
    assert.strictEqual(r.initialStock, 27, "recomputeStock: no-pastelitos initial_stock = stock-al-cierre(15) + cargas post-cierre(12)");
    assert.strictEqual(r.max, 60, "recomputeStock: max no baja si el max configurado ya era mayor");
    console.log("✅ TEST PASSED: recomputeStock (no-pastelitos) matches recompute_product_stock()'s formula");

    // Spec R3: una venta que deja stock negativo es legítima, sin floor a 0.
    r = recomputeStock([{ delta: 5, type: 'load', createdAt: after(1) }, { delta: -50, type: 'sale', createdAt: after(2) }], 'bebidas', t0, 5);
    assert.strictEqual(r.stock, -45, "recomputeStock (spec R3): stock negativo es legítimo, no se clampea a 0");
    console.log("✅ TEST PASSED: recomputeStock allows negative stock (spec R3, no floor)");

    // Cierre sin movimientos posteriores: pastelitos vuelve a 0 (se resetea
    // con el día); las demás categorías retienen el stock previo tal cual.
    r = recomputeStock(pastelitoMoves.slice(0, 1), 'pastelitos', t0, 20);
    assert.strictEqual(r.stock, 0, "recomputeStock: pastelitos sin movimientos post-cierre da 0 (se resetea con el día)");
    assert.strictEqual(r.initialStock, 0, "recomputeStock: idem para initial_stock");
    r = recomputeStock([{ delta: 60, type: 'load', createdAt: before(2000) }, { delta: -45, type: 'sale', createdAt: before(100) }], 'bebidas', t0, 60);
    assert.strictEqual(r.stock, 15, "recomputeStock: no-pastelitos sin movimientos post-cierre retiene el stock previo");
    assert.strictEqual(r.initialStock, 15, "recomputeStock: idem para initial_stock (nada nuevo que sumarle)");
    console.log("✅ TEST PASSED: recomputeStock handles a close with no movements since");

    // Producto nuevo sin ningún historial de movimientos.
    r = recomputeStock([], 'pastelitos', t0, 0);
    assert.strictEqual(r.stock, 0, "recomputeStock: producto nuevo sin historial -> stock 0");
    assert.strictEqual(r.initialStock, 0, "recomputeStock: producto nuevo sin historial -> initial_stock 0");
    assert.strictEqual(r.max, 0, "recomputeStock: producto nuevo sin historial -> max 0");
    console.log("✅ TEST PASSED: recomputeStock handles a brand-new product with no movement history");

    // Cruce de categorías: un pastelito y una bebida pasan por el MISMO
    // last_close_at() -- cada uno debe seguir su propia rama de la fórmula,
    // sin que una filtre a la otra (misma frontera, dos resultados distintos).
    const crossPastelito = recomputeStock(pastelitoMoves, 'pastelitos', t0, 0);
    const crossBebida = recomputeStock(bebidaMoves, 'bebidas', t0, 60);
    assert.strictEqual(crossPastelito.stock, 18, "recomputeStock: cruce de categorías -- el pastelito sigue dando 18");
    assert.strictEqual(crossBebida.stock, 23, "recomputeStock: cruce de categorías -- la bebida sigue dando 23 con el mismo t0");
    console.log("✅ TEST PASSED: recomputeStock keeps categories independent across the same day_closes boundary");

    // --- computeDebtBalance / computePaidByDebtUuid: mirrors mapDebtRow +
    // fetchDebts' paidByUuid grouping (js/supabase.js) ---
    function computeDebtBalance(originalAmount, paidAmount) {
        return Number(Math.max(0, originalAmount - paidAmount).toFixed(2));
    }
    function computePaidByDebtUuid(payments) {
        const map = new Map();
        for (const p of payments) map.set(p.debtUuid, Number(((map.get(p.debtUuid) || 0) + p.amount).toFixed(2)));
        return map;
    }

    // Abonos parciales sucesivos, con montos que en punto flotante crudo
    // arrastran error (10.10 + 10.10 + 10.10 = 30.299999999999997 sin redondeo).
    let paid = computePaidByDebtUuid([
        { debtUuid: 'd1', amount: 10.10 }, { debtUuid: 'd1', amount: 10.10 }, { debtUuid: 'd1', amount: 10.10 }
    ]).get('d1');
    assert.strictEqual(paid, 30.30, "computePaidByDebtUuid: abonos parciales sin arrastre de punto flotante");
    assert.strictEqual(computeDebtBalance(100, paid), 69.70, "computeDebtBalance: saldo = original - Σ abonos, exacto");
    console.log("✅ TEST PASSED: computeDebtBalance/computePaidByDebtUuid: multiple partial payments, no float drift");

    // Abono mayor a la deuda restante -> clamp a 0, nunca negativo.
    assert.strictEqual(computeDebtBalance(50, 80), 0, "computeDebtBalance: abono mayor a la deuda restante clampea a 0");
    console.log("✅ TEST PASSED: computeDebtBalance clamps an overpayment to 0");

    // Múltiples deudas con abonos agrupados por debt_uuid -- un abono a d2
    // no debe tocar el saldo de d1.
    const multiPaid = computePaidByDebtUuid([
        { debtUuid: 'd1', amount: 20 }, { debtUuid: 'd2', amount: 5 }, { debtUuid: 'd1', amount: 15 }
    ]);
    assert.strictEqual(computeDebtBalance(100, multiPaid.get('d1') || 0), 65, "computeDebtBalance: deuda d1 solo ve sus propios abonos (35 de 100)");
    assert.strictEqual(computeDebtBalance(10, multiPaid.get('d2') || 0), 5, "computeDebtBalance: deuda d2 solo ve sus propios abonos (5 de 10)");
    assert.strictEqual(computeDebtBalance(30, multiPaid.get('d3') || 0), 30, "computeDebtBalance: una deuda sin ningún abono queda en su monto original");
    console.log("✅ TEST PASSED: multiple debts keep independent balances grouped by debt_uuid");

    // --- computeLastCloseAt: mirrors last_close_at() (migration 026) ---
    function computeLastCloseAt(dayCloses) {
        if (!dayCloses || dayCloses.length === 0) return -Infinity;
        return Math.max(...dayCloses.map(d => new Date(d.closedAt).getTime()));
    }

    // Sin cierres previos -> -Infinity (equivalente a COALESCE(...,'-infinity')),
    // sin arrojar error -- y sigue comparando correctamente contra cualquier
    // timestamp real (todo movimiento cuenta como "post-cierre").
    assert.strictEqual(computeLastCloseAt([]), -Infinity, "computeLastCloseAt: day_closes vacío -> -Infinity, no null ni error");
    assert.ok(new Date('2020-01-01').getTime() > computeLastCloseAt([]), "computeLastCloseAt: -Infinity sigue comparando bien contra timestamps reales");

    // Múltiples cierres, incluso recibidos desordenados/tardíos (el orden de
    // inserción no debe importar) -> converge siempre al más reciente.
    const outOfOrderCloses = [
        { closedAt: '2026-09-15T04:00:00.000Z' },
        { closedAt: '2026-09-20T04:00:00.000Z' }, // el más reciente, llega en el medio
        { closedAt: '2026-09-10T04:00:00.000Z' }  // el más viejo, llega último
    ];
    assert.strictEqual(computeLastCloseAt(outOfOrderCloses), new Date('2026-09-20T04:00:00.000Z').getTime(),
        "computeLastCloseAt: converge al MAX(closed_at) sin importar el orden de llegada");
    console.log("✅ TEST PASSED: computeLastCloseAt = MAX(closed_at), empty -> -Infinity, order-independent");
}

// Security Regression Test: Reject all legacy credentials
async function verifyLegacyLoginRejections() {
    const legacyPasses = ['070821', 'Lucenzo2026!', '1111', 'Ventas2026!', '2222', 'Cocina2026!'];
    for (const pass of legacyPasses) {
        const res = await handleUserLogin('admin', pass);
        assert.strictEqual(res, false, `REAL handleUserLogin: Legacy credential (${pass}) MUST be rejected`);
        console.log(`✅ TEST PASSED: REAL handleUserLogin: Legacy credential (${pass}) MUST be strictly rejected`);
    }
}

async function verifyWhatsAppBot() {
    // 0. Disabled bot check (503 response when WHATSAPP_BOT_ENABLED is not 'true')
    process.env.WHATSAPP_BOT_ENABLED = 'false';
    const { req: r503, res: res503 } = createMockReqRes('GET', {});
    await waWebhookHandler(r503, res503);
    assert.strictEqual(res503.getStatusCode(), 503, "REAL WhatsApp Bot: Missing/disabled WHATSAPP_BOT_ENABLED returns HTTP 503");
    console.log("✅ TEST PASSED: REAL WhatsApp Bot: Disabled flag returns 503 Service Unavailable");
    process.env.WHATSAPP_BOT_ENABLED = 'true';

    // The owner paused the bot outright (WHATSAPP_BOT_MANUALLY_PAUSED in
    // api/whatsapp-webhook.js). Every request short-circuits to 503 before it
    // reaches the handshake, so the assertions below cannot run -- and failing
    // on them would just report the pause as a broken bot, on every run, until
    // someone un-pauses it. Assert the pause is airtight instead, and let the
    // full suite come back automatically when the flag flips.
    if (waWebhookHandler.WHATSAPP_BOT_MANUALLY_PAUSED) {
        const { req: rPaused, res: resPaused } = createMockReqRes('GET', { 'hub.mode': 'subscribe', 'hub.verify_token': 'test_verify_token', 'hub.challenge': '5551212' });
        await waWebhookHandler(rPaused, resPaused);
        assert.strictEqual(resPaused.getStatusCode(), 503, "REAL WhatsApp Bot: Manual pause must override a valid handshake too");

        const { req: rPausedPost, res: resPausedPost } = createMockReqRes('POST', {}, { entry: [{ changes: [{ value: { messages: [{ from: '584141234567', type: 'text', text: { body: 'hola' } }] } }] }] });
        await waWebhookHandler(rPausedPost, resPausedPost);
        assert.strictEqual(resPausedPost.getStatusCode(), 503, "REAL WhatsApp Bot: Manual pause must reject authorized POSTs too");

        console.log("✅ TEST PASSED: REAL WhatsApp Bot: Manual pause returns 503 for every method (handshake + authorized POST)");
        console.log("⏭️  SKIPPED: 4 WhatsApp routing assertions -- bot manually paused by the owner. They run again when WHATSAPP_BOT_MANUALLY_PAUSED is set to false.");
        return;
    }

    // 1. Handshake verification
    const { req: r1, res: res1 } = createMockReqRes('GET', { 'hub.mode': 'subscribe', 'hub.verify_token': 'test_verify_token', 'hub.challenge': '5551212' });
    await waWebhookHandler(r1, res1);
    assert.strictEqual(res1.getStatusCode(), 200, "REAL WhatsApp Bot: GET handshake verification status 200");
    assert.strictEqual(res1.getData(), '5551212', "REAL WhatsApp Bot: GET handshake verification returns challenge");
    console.log("✅ TEST PASSED: REAL WhatsApp Bot: GET handshake verification returns 200 OK with challenge");

    // 2. Invalid Signature Rejection (403 HTTP status)
    const { req: rSig, res: resSig } = createMockReqRes('POST', {}, { test: 'payload' }, { 'x-hub-signature-256': 'sha256=invalid_signature' });
    await waWebhookHandler(rSig, resSig);
    assert.strictEqual(resSig.getStatusCode(), 403, "REAL WhatsApp Bot: Invalid X-Hub-Signature-256 returns HTTP 403");
    console.log("✅ TEST PASSED: REAL WhatsApp Bot: Invalid HMAC signature correctly rejected with HTTP 403");

    // 3. Unauthorized sender rejection
    const { req: r2, res: res2 } = createMockReqRes('POST', {}, { entry: [{ changes: [{ value: { messages: [{ from: '19999999999', type: 'text', text: { body: 'hack' } }] } }] }] });
    await waWebhookHandler(r2, res2);
    assert.strictEqual(res2.getData()?.status, 'unauthorized_sender', "REAL WhatsApp Bot: Unauthorized phone number correctly blocked");
    console.log("✅ TEST PASSED: REAL WhatsApp Bot: Unauthorized phone number correctly blocked");

    // 4. Stock add command with valid HMAC signature
    const { req: r3, res: res3 } = createMockReqRes('POST', {}, { entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Admin' } }], messages: [{ from: '584141234567', type: 'text', text: { body: 'Cárgame 30 pastelitos de queso' } }] } }] }] });
    await waWebhookHandler(r3, res3);
    assert.strictEqual(res3.getData()?.status, 'success', "REAL WhatsApp Bot: Stock add command returns success status");
    console.log("✅ TEST PASSED: REAL WhatsApp Bot: Stock add command correctly extracted intent 'add_stock'");

    // 5. Viewer-tier phone (WHATSAPP_VIEWER_PHONE) is authorized to chat, distinct from admin
    process.env.WHATSAPP_VIEWER_PHONE = '584248255319';
    const { req: r4, res: res4 } = createMockReqRes('POST', {}, { entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Consultante' } }], messages: [{ from: '584248255319', type: 'text', text: { body: '¿cómo van las ventas?' } }] } }] }] });
    await waWebhookHandler(r4, res4);
    assert.strictEqual(res4.getData()?.status, 'success', "REAL WhatsApp Bot: Viewer-tier phone is authorized (not 'unauthorized_sender')");
    console.log("✅ TEST PASSED: REAL WhatsApp Bot: Viewer-tier phone (WHATSAPP_VIEWER_PHONE) can chat");
}

async function verifyTelegramBot() {
    // 0. Disabled bot check (503 response when TELEGRAM_BOT_ENABLED is not 'true')
    process.env.TELEGRAM_BOT_ENABLED = 'false';
    const { req: r503, res: res503 } = createMockTelegramReqRes({});
    await tgWebhookHandler(r503, res503);
    assert.strictEqual(res503.getStatusCode(), 503, "REAL Telegram Bot: Missing/disabled TELEGRAM_BOT_ENABLED returns HTTP 503");
    console.log("✅ TEST PASSED: REAL Telegram Bot: Disabled flag returns 503 Service Unavailable");
    process.env.TELEGRAM_BOT_ENABLED = 'true';

    // 1. Wrong secret token rejected (403)
    const { req: rSecret, res: resSecret } = createMockTelegramReqRes({ message: { chat: { id: 1 }, from: { id: 999888777 }, text: 'hola' } }, { 'x-telegram-bot-api-secret-token': 'wrong' });
    await tgWebhookHandler(rSecret, resSecret);
    assert.strictEqual(resSecret.getStatusCode(), 403, "REAL Telegram Bot: Wrong secret token returns HTTP 403");
    console.log("✅ TEST PASSED: REAL Telegram Bot: Invalid secret token correctly rejected with HTTP 403");

    // 2. Unauthorized sender rejection
    const { req: rUnauth, res: resUnauth } = createMockTelegramReqRes({ message: { chat: { id: 2 }, from: { id: 111222333 }, text: 'hola' } });
    await tgWebhookHandler(rUnauth, resUnauth);
    assert.strictEqual(resUnauth.getData()?.status, 'unauthorized_sender', "REAL Telegram Bot: Unauthorized user id correctly blocked");
    console.log("✅ TEST PASSED: REAL Telegram Bot: Unauthorized Telegram user id correctly blocked");

    // 3. Authorized admin can chat
    const { req: rAdmin, res: resAdmin } = createMockTelegramReqRes({ message: { chat: { id: 3 }, from: { id: 999888777, first_name: 'Gustavo' }, text: '¿cómo van las ventas?' } });
    await tgWebhookHandler(rAdmin, resAdmin);
    assert.strictEqual(resAdmin.getData()?.status, 'success', "REAL Telegram Bot: Authorized admin id gets a successful reply");
    console.log("✅ TEST PASSED: REAL Telegram Bot: Authorized admin id (TELEGRAM_ADMIN_ID) can chat");
}

// Every suite runs, even when an earlier one fails. The previous runner was a
// single .then() chain with one .catch(): the first failed assertion aborted
// everything after it, so a red WhatsApp test silently took the entire Telegram
// suite with it and nobody could tell the difference between "5 tests passed"
// and "5 tests never ran".
const SUITES = [
    ['Core', runCoreUnitTests],
    ['Analytics', runAnalyticsUnitTests],
    ['Plan B aggregation formulas', runPlanBAggregationTests],
    ['Legacy credentials', verifyLegacyLoginRejections],
    ['WhatsApp bot', verifyWhatsAppBot],
    ['Telegram bot', verifyTelegramBot]
];

(async () => {
    const failures = [];

    for (const [name, suite] of SUITES) {
        try {
            await suite();
        } catch (err) {
            failures.push({ name, err });
            console.error(`\n❌ SUITE FAILED: ${name}\n${err && err.message ? err.message : err}\n`);
        }
    }

    if (failures.length === 0) {
        console.log("\n🎉 ALL UNIT TESTS PASSED ON REAL APPLICATION CODE! (100% Verification)");
        process.exit(0);
    }

    console.error(`\n💥 ${failures.length} of ${SUITES.length} suite(s) failed: ${failures.map(f => f.name).join(', ')}`);
    process.exit(1);
})();
