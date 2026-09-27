// Main App Orchestration Module

// Local app state
let products = [];
let salesLog = [];
let expenses = [];
let debts = [];
let replenishments = [];
let ingredients = [];
let pedidosOnline = [];
let activeCategory = 'todos';
let searchQuery = '';
let currentCart = [];
let costInsumos = [];
let paymentStatsFilter = 'day';
let categoryStatsFilter = 'day';

let lastCloseTime = null;

// Re-entrancy guard so a double tap on "¡Ya llegó!" cannot load a batch twice
let isConfirmingReceipt = false;

// Quick-access PINs for role switching (never declared before — was relying on
// implicit globals, which throws ReferenceError in strict mode and is undefined
// until the first assignment ever runs, e.g. before fetchAppConfig() resolves)
let pinLocal = null;
let pinCocina = null;
let pinAdmin = null;

// Sound and vibration preferences
let preferences = { sound: true, vibration: true, supabaseUrl: '', supabaseKey: '' };

// User access role
let currentRole = null;

// BCV Exchange Rate state
let bcvRate = 732.48;
let useAutoBcv = true;
let bcvLastFetchTime = null;

// Current report data displayed in the day close modal
let currentReportData = { sales: [], expenses: [] };

// Global cache for admin statistics and hourly chart mode
let hourlyActiveMode = 'today';
let adminStatsSales = [];
// Gastos de los 7 días, cacheados junto a `adminStatsSales` para que el
// handler de realtime pueda calcular el delta de gastos con el dataset bueno.
let adminStatsExpenses = [];
// ¿`adminStatsSales`/`adminStatsExpenses` traen de verdad la semana completa?
// Solo es cierto si `fetchStatsData()` respondió. Sin conexión ambos caen al
// dato local del turno, y ahí los deltas mentirían.
let adminStatsFullHistory = false;

// Analytics tab state: cached sales history keyed by lookback range (days),
// so switching 30/60/90/Todo or the hoy/mañana toggle doesn't always refetch.
// 0 means "sin recorte de fecha" -- fetch the full sales history.
let analyticsRangeDays = 60;
let analyticsPrepMode = 'today'; // 'today' | 'tomorrow'
const analyticsSalesCache = {};

// Full (unfiltered) set from the last Bitácora fetch -- the search box
// filters this client-side instead of re-querying Supabase per keystroke.
let currentActivityLogs = [];

function getAnalyticsPrepWeekday() {
    const now = new Date();
    if (analyticsPrepMode === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        return tomorrow.getDay();
    }
    return now.getDay();
}

// Unique device identifier for active session management
let myDeviceId = localStorage.getItem('casa_lucenzo_device_id');
if (!myDeviceId) {
    myDeviceId = crypto.randomUUID ? crypto.randomUUID() : 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('casa_lucenzo_device_id', myDeviceId);
}

// ================= SELF-HEALING SENTINEL =================

/**
 * Manual "Limpiar Caché" action for the apertura/cierre routine. PowerSync
 * owns write persistence and retry now (Plan B, Task 12 -- there is no
 * client-side queue left to sync), so this no longer forces a sync attempt.
 * What's left, still genuinely useful on its own: surface + let an admin
 * discard sales this device quarantined (found missing from the server with
 * nothing to explain the gap -- see the reconciliation note in
 * loadAllDataFromSupabase), then drop this device's cached app code so it's
 * always running what's actually deployed.
 */
async function handleCleanOfflineCache() {
    const btn = document.getElementById('btn-clean-offline-cache');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    triggerHaptic(15);

    try {
        if (!navigator.onLine) {
            window.UIManager.showToast("📡 Sin conexión: conectate a internet para traer la última versión.", "fa-solid fa-wifi-slash");
            return;
        }

        // Sales this device set aside because the server no longer had them and
        // nothing explained why. Surfaced here rather than left to rot: it is
        // the one place someone looks at sync health on purpose.
        const quarantined = window.StorageManager.loadQuarantinedSales();
        if (quarantined.length > 0) {
            const total = quarantined.reduce((sum, q) => sum + ((q.sale && q.sale.price) || 0), 0);
            const detail = quarantined.slice(0, 8)
                .map(q => `• ${q.sale && q.sale.name ? q.sale.name : '(sin nombre)'} — $${((q.sale && q.sale.price) || 0).toFixed(2)}`)
                .join('\n');
            const more = quarantined.length > 8 ? `\n…y ${quarantined.length - 8} más.` : '';
            const keep = confirm(
                `📋 Este dispositivo apartó ${quarantined.length} venta(s) por $${total.toFixed(2)} que ya no estaban en el servidor:\n\n${detail}${more}\n\n` +
                `Se apartaron en vez de borrarse, por si alguna era real y nunca llegó a guardarse. Si ya revisaste el sistema y los números están bien, se pueden descartar.\n\n` +
                `¿Descartarlas definitivamente?  (Aceptar = descartar · Cancelar = conservarlas)`
            );
            if (keep) {
                logActivity("Descarte de Ventas en Cuarentena", `Se descartaron ${quarantined.length} venta(s) apartadas por $${total.toFixed(2)} tras revisión manual del administrador.`);
                window.StorageManager.clearQuarantinedSales();
            }
        } else {
            window.UIManager.showToast("✅ No había ventas en cuarentena.", "fa-solid fa-circle-check");
        }

        // Drop this device's cached app code so it's always running what's
        // actually deployed -- an old cached service worker is exactly how
        // a device keeps running a version with a bug already fixed server-side.
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const reg of regs) await reg.unregister();
        }
        if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }

        window.UIManager.showToast("🔄 Recargando con la última versión...", "fa-solid fa-rotate");
        setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
        console.error("Error en limpieza manual de caché offline:", e);
        window.UIManager.showToast("❌ Error al limpiar. Revisá la consola.", "fa-solid fa-circle-xmark");
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
}
window.handleCleanOfflineCache = handleCleanOfflineCache;

function sanitizeDataIntegrity(log) {
    if (!Array.isArray(log)) return [];
    const seenUuids = new Set();
    return log.filter(s => {
        if (!s || typeof s !== 'object') return false;
        if (!s.name || typeof s.name !== 'string') return false;
        if (typeof s.price !== 'number' || isNaN(s.price) || s.price < 0) return false;
        if (s.uuid) {
            if (seenUuids.has(s.uuid)) return false;
            seenUuids.add(s.uuid);
        }
        return true;
    });
}

// Plan B, Task 13: #header-offline-badge's driver, replacing the offline
// queue's item count (retired in Task 12) with PowerSyncManager's real
// SyncStatus. Bound to db.registerListener's statusChanged event (see
// js/powersync/client.js) -- not polled -- so it reflects connect/
// disconnect/upload/download transitions the instant PowerSync reports them.
async function updateSyncStatusUI(status) {
    if (!status) return;
    // No connect() attempted yet (pre-login, or PowerSync not configured at
    // all) -- connected:false here doesn't mean "offline", it means "never
    // tried". Stay quiet instead of flashing "Sin Conexión" on the login screen.
    if (!window.PowerSyncManager || !window.PowerSyncManager.hasAttemptedConnect()) return;

    // Once PowerSync has synced at least once, its own connected/disconnected
    // signal is more accurate than the Supabase realtime channel's (that
    // channel can stay SUBSCRIBED for a while after real connectivity drops).
    if (status.hasSynced && window.UIManager && window.UIManager.updateConnectionStatus) {
        window.UIManager.updateConnectionStatus(status.connected ? 'online' : 'offline', 'powersync');
    }

    const badge = document.getElementById('header-offline-badge');
    const countSpan = document.getElementById('header-offline-count');
    if (!badge || !countSpan) return;

    if (!status.connected) {
        badge.style.display = 'flex';
        badge.style.background = 'rgba(239, 68, 68, 0.2)';
        badge.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        badge.style.color = '#F87171';
        countSpan.textContent = '⚡ Sin Conexión';
        badge.title = 'Sin conexión con el servidor -- los cambios se guardan localmente';
        return;
    }

    if (status.uploading || status.downloading) {
        let pendingText = '⚡ Sincronizando…';
        try {
            const stats = window.PowerSyncManager && await window.PowerSyncManager.getUploadQueueStats();
            if (stats && stats.count > 0) pendingText = `⚡ ${stats.count} pend.`;
        } catch (e) { /* best-effort only -- badge still shows "Sincronizando…" */ }
        badge.style.display = 'flex';
        badge.style.background = 'rgba(245, 158, 11, 0.18)';
        badge.style.borderColor = 'rgba(245, 158, 11, 0.5)';
        badge.style.color = '#FBBF24';
        countSpan.textContent = pendingText;
        badge.title = 'Sincronizando cambios pendientes con el servidor';
        return;
    }

    // Connected, nothing uploading/downloading -- fully caught up.
    badge.style.display = 'none';
}
window.updateSyncStatusUI = updateSyncStatusUI;

function initSelfHealingSentinel() {
    // Intercept unhandled errors & promise rejections to prevent crashing UI
    window.addEventListener('error', (event) => {
        console.warn('Self-Healing Sentinel caught error:', event.message, event.filename, event.lineno);
        if (event && event.preventDefault) event.preventDefault();
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.warn('Self-Healing Sentinel caught promise rejection:', event.reason);
        if (event && event.preventDefault) event.preventDefault();
    });
}

// Call Self-Healing Sentinel initialization immediately
initSelfHealingSentinel();

// ================= HANDLERS & LOGIC =================

/**
 * Short haptic pulse trigger for mobile screens
 * @param {number|Array} pattern Milliseconds pattern list (e.g. 15 or [50, 50, 50])
 */
function triggerHaptic(pattern) {
    if (preferences.vibration && 'vibrate' in navigator) {
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            // Silently absorb blocks
        }
    }
}

/**
 * Handle category filtering tab changes
 * @param {string} catId Category ID
 */
function handleCategoryChange(catId) {
    activeCategory = catId;
    triggerHaptic(15);
    window.UIManager.renderCategoryFilterBar(activeCategory, handleCategoryChange, products);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
}

/**
 * Handle product searching inputs
 * @param {string} query Search input string
 */
function handleSearchChange(query) {
    searchQuery = query;
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
}

/**
 * Vitrina capacity for a product ("X / max" and the "falta cocinar" figure).
 * Never below what is physically on the shelf, and never grows on its own --
 * the old `max = max + diff` accumulated across days and told the kitchen to
 * cook batches that nobody had loaded.
 * @param {Object} product Product to measure
 * @returns {number} Capacity to store in `max`
 */
function resolveVitrinaCapacity(product) {
    return Math.max(product.max || 0, product.stock || 0);
}

/**
 * Single source of truth for putting stock INTO the vitrina.
 *
 * `initial_stock` is the day's baseline: everything the vitrina received since
 * the last cierre de jornada. Every "vendidos reales" figure in the app is
 * `initial_stock - stock`, so a path that raises `stock` without raising the
 * baseline by the same amount silently zeroes out the day's numbers. Route
 * every load through here so the two can never drift apart.
 *
 * @param {Object} product Product to replenish (mutated in place)
 * @param {number} amountToAdd Pieces entering the vitrina (must be > 0)
 * @returns {boolean} True when the load was applied
 */
function applyStockLoad(product, amountToAdd) {
    const amount = parseInt(amountToAdd, 10);
    if (!product || isNaN(amount) || amount <= 0) return false;

    product.stock = (product.stock || 0) + amount;
    product.initial_stock = (product.initial_stock || 0) + amount;
    product.max = resolveVitrinaCapacity(product);
    return true;
}

/**
 * Set a product's physical count to an absolute value (a recount from the
 * edit modal, or a "fijar stock" order from the bot). Raising it is a load, so
 * the day's baseline follows it; lowering it is a physical correction, so the
 * baseline stays put and the missing pieces surface in the Conciliación
 * instead of quietly disappearing from the day's totals.
 * @param {Object} product Product to adjust (mutated in place)
 * @param {number} targetStock Absolute count now on the shelf
 */
function applyStockCount(product, targetStock) {
    if (!product) return;
    const target = Math.max(0, parseInt(targetStock, 10) || 0);
    const current = product.stock || 0;

    if (target > current) {
        applyStockLoad(product, target - current);
        return;
    }

    product.stock = target;
    product.max = resolveVitrinaCapacity(product);
}

/**
 * Plan B, Task 6: single choke point for persisting a stock change.
 * Records the movement in stock_movements (append-only, spec §5.1a) instead
 * of writing products.stock/max/initial_stock directly -- Postgres'
 * recompute_product_stock() (migracion 033) derives those from the sum of
 * these movements. Silently skips a zero delta: nothing physically moved
 * (e.g. a recount clamped to the same value), so there's nothing to log.
 * @param {Object} product Product the movement applies to
 * @param {number} delta Signed change actually applied to product.stock
 * @param {'load'|'sale'|'sale_return'|'count_down'} type Movement kind (spec §5.1a)
 * @param {string} [sourceUuid] Traceability link (e.g. the replenishment uuid for a 'load')
 */
function recordStockMovement(product, delta, type, sourceUuid) {
    if (!delta) return;
    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.insertStockMovement({
            productId: product.id, delta, type, sourceUuid: sourceUuid || null, deviceId: myDeviceId
        });
    }
}

/**
 * Handle stock adjustments, records transactions, triggers vibrations and floating numbers
 * @param {string} id Product identifier
 * @param {number} amount Change amount (+1 or -1)
 * @param {MouseEvent} event Click event to extract coordinates
 */
function adjustStock(id, amount, event) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    if (amount === -1) {
        // Adding 1 to cart / selling
        if (product.stock <= 0) {
            triggerHaptic(30);
            window.UIManager.showToast(`⚠️ "${product.name}" no tiene stock en vitrina.`, "fa-solid fa-triangle-exclamation");
            return;
        }

        // Spawn floating number indicator on tap coordinates
        if (event && event.clientX !== undefined) {
            window.UIManager.spawnFloatingIndicator(event.clientX, event.clientY, `-1`, 'float-minus');
        }

        triggerHaptic(15);

        // Add to active cart
        const cartItem = currentCart.find(item => item.productId === id);
        if (cartItem) {
            cartItem.quantity++;
        } else {
            currentCart.push({
                productId: product.id,
                name: product.name,
                price: product.price || 0,
                quantity: 1
            });
        }
        localStorage.setItem('casa_lucenzo_current_cart', JSON.stringify(currentCart));

        const originalStock = product.stock;
        product.stock = Math.max(0, product.stock - 1);
        window.StorageManager.saveProducts(products);

        recordStockMovement(product, product.stock - originalStock, 'sale');

        // Audio warning if stock falls under threshold
        if (product.stock <= product.min && originalStock > product.min) {
            window.UIManager.showToast(`⚠️ ¡Atención! "${product.name}" se está agotando. Ya se avisó a la cocina.`, "fa-solid fa-bell");
            if (preferences.sound) {
                window.AudioManager.playAlertSound();
            }
            triggerHaptic([50, 60, 50]);
        }

        // Render Cart and Local
        window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
        if (window.InventoryManager && window.InventoryManager.updateLowStockUI) {
            window.InventoryManager.updateLowStockUI(products, ingredients, currentRole);
        }
    } else if (amount === 1) {
        // Restocking vitrina (standard + button)
        if (event && event.clientX !== undefined) {
            window.UIManager.spawnFloatingIndicator(event.clientX, event.clientY, `+1`, 'float-plus');
        }

        triggerHaptic(15);

        const beforeLoad = product.stock;
        applyStockLoad(product, 1);
        window.StorageManager.saveProducts(products);

        recordStockMovement(product, product.stock - beforeLoad, 'load');

        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
    }
}

/**
 * Handle manual quantity entry, updating the active cart and adjusting available stock
 * @param {string} id Product identifier
 * @param {number} newQty Target quantity to purchase (from manual input)
 */
function handleCartQtyChange(id, newQty) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    const cartItem = currentCart.find(item => item.productId === id);
    const q_old = cartItem ? cartItem.quantity : 0;
    
    // Total available stock that can be placed in cart for this product
    const max_qty = product.stock + q_old;

    if (newQty > max_qty) {
        newQty = max_qty;
        triggerHaptic(30);
        window.UIManager.showToast(`⚠️ Stock insuficiente. Solo puedes cargar un máximo de ${max_qty} piezas.`, "fa-solid fa-triangle-exclamation");
    }

    if (newQty < 0 || isNaN(newQty)) {
        newQty = 0;
    }

    const diff = newQty - q_old;
    if (diff === 0) return; // No change

    triggerHaptic(15);

    const originalStock = product.stock;
    product.stock = Math.max(0, product.stock - diff);
    window.StorageManager.saveProducts(products);

    recordStockMovement(product, product.stock - originalStock, diff > 0 ? 'sale' : 'sale_return');

    // Update cart items array
    if (newQty === 0) {
        const cartItemIndex = currentCart.findIndex(item => item.productId === id);
        if (cartItemIndex !== -1) {
            currentCart.splice(cartItemIndex, 1);
        }
    } else {
        if (cartItem) {
            cartItem.quantity = newQty;
        } else {
            currentCart.push({
                productId: product.id,
                name: product.name,
                price: product.price || 0,
                quantity: newQty
            });
        }
    }
    localStorage.setItem('casa_lucenzo_current_cart', JSON.stringify(currentCart));

    // Audio warning if stock falls under threshold
    if (product.stock <= product.min && originalStock > product.min) {
        window.UIManager.showToast(`⚠️ ¡Atención! "${product.name}" se está agotando. Ya se avisó a la cocina.`, "fa-solid fa-bell");
        if (preferences.sound) {
            window.AudioManager.playAlertSound();
        }
        triggerHaptic([50, 60, 50]);
    }

    // Re-render Views
    window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
}

/**
 * Increment cart item quantity (taking from vitrina stock)
 */
function handleAddToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.stock <= 0) {
        triggerHaptic(30);
        window.UIManager.showToast(`⚠️ No hay más "${product ? product.name : ''}" en vitrina.`, "fa-solid fa-triangle-exclamation");
        return;
    }

    triggerHaptic(15);

    const cartItem = currentCart.find(item => item.productId === productId);
    if (cartItem) {
        cartItem.quantity++;
    } else {
        currentCart.push({
            productId: product.id,
            name: product.name,
            price: product.price || 0,
            quantity: 1
        });
    }
    localStorage.setItem('casa_lucenzo_current_cart', JSON.stringify(currentCart));

    const beforeAdd = product.stock;
    product.stock = Math.max(0, product.stock - 1);
    window.StorageManager.saveProducts(products);

    recordStockMovement(product, product.stock - beforeAdd, 'sale');

    window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
}

/**
 * Decrement cart item quantity (returning to vitrina stock)
 */
function handleRemoveFromCart(productId) {
    const cartItemIndex = currentCart.findIndex(item => item.productId === productId);
    if (cartItemIndex === -1) return;

    triggerHaptic(15);

    const cartItem = currentCart[cartItemIndex];
    const product = products.find(p => p.id === productId);

    if (product) {
        const beforeRemove = product.stock;
        product.stock = product.stock >= product.max ? product.stock + 1 : Math.min(product.max, product.stock + 1);
        window.StorageManager.saveProducts(products);
        recordStockMovement(product, product.stock - beforeRemove, 'sale_return');
    }

    cartItem.quantity--;
    if (cartItem.quantity <= 0) {
        currentCart.splice(cartItemIndex, 1);
    }
    localStorage.setItem('casa_lucenzo_current_cart', JSON.stringify(currentCart));

    window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
}

/**
 * Empty the current cart, returning all items back to vitrina stock
 */
async function handleClearCart() {
    if (currentCart.length === 0) return;

    triggerHaptic(20);
    if (confirm("¿Estás seguro de que quieres vaciar la cuenta del cliente? Todos los productos se devolverán a la vitrina.")) {
        currentCart.forEach(cartItem => {
            const product = products.find(p => p.id === cartItem.productId);
            if (product) {
                const beforeClear = product.stock;
                product.stock = product.stock >= product.max ? product.stock + cartItem.quantity : Math.min(product.max, product.stock + cartItem.quantity);
                recordStockMovement(product, product.stock - beforeClear, 'sale_return');
            }
        });

        // Delete old sales from Supabase if we were editing an existing account.
        // Same timestamp-keyed delete as handleCheckoutCart -- a stale uuid list
        // could otherwise leave the account undeleted while the screen clears
        // locally, so it silently reappears in Cuentas Activas on the next sync.
        const editingSalesStr = sessionStorage.getItem('casa_lucenzo_editing_sales');
        const editingTimestampForClear = sessionStorage.getItem('casa_lucenzo_editing_timestamp');
        if (editingSalesStr && editingTimestampForClear) {
            if (window.SupabaseManager.isConfigured()) {
                const voided = await window.SupabaseManager.voidSalesByTimestamp(editingTimestampForClear, "Cuenta vaciada durante edición");
                if (!voided) {
                    window.UIManager.showToast("⚠️ No se pudo confirmar el vaciado por falta de conexión. La cuenta podría reaparecer -- revisala en Cuentas Activas.", "fa-solid fa-triangle-exclamation");
                }
            }
            sessionStorage.removeItem('casa_lucenzo_editing_sales');
            sessionStorage.removeItem('casa_lucenzo_editing_timestamp');
        }
        sessionStorage.removeItem('casa_lucenzo_editing_client_name');

        currentCart = [];
        localStorage.removeItem('casa_lucenzo_current_cart');
        window.StorageManager.saveProducts(products);

        window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
        window.UIManager.showToast("🧹 Cuenta del cliente vaciada.", "fa-solid fa-trash-can");
    }
}

/**
 * Checkout active cart: ask for client name, record grouped sales log, sync to Supabase, and clear cart
 */
async function handleCheckoutCart() {
    if (currentCart.length === 0) return;

    // A double-tap on "Cobrar" (or a stray duplicate click while the previous
    // checkout is still awaiting Supabase) used to run this whole function
    // twice concurrently. On a "Modificar" edit, both copies delete-then-
    // insert the same account under the same timestamp -- if the second
    // delete lands after the first insert, it wipes the first copy's rows
    // and both copies insert on top, stacking duplicate rows silently
    // (no error, no extra activity log entry). This flag makes a second
    // call while one is already in flight a no-op instead of a second run.
    if (handleCheckoutCart._inProgress) {
        window.UIManager.showToast("⏳ Ya se está procesando esta cuenta, esperá un momento.", "fa-solid fa-hourglass-half");
        return;
    }
    handleCheckoutCart._inProgress = true;
    try {

    triggerHaptic(15);
    const defaultName = sessionStorage.getItem('casa_lucenzo_editing_client_name') || "";
    const cameFromClientes = !!defaultName;
    const clientNameInput = prompt("Ingresa el nombre del cliente / Razón Social:", defaultName);
    if (clientNameInput === null) return; // Cancelled

    const clientRifInput = prompt("Ingresa Cédula / RIF del cliente (Opcional):", "");
    if (clientRifInput === null) return; // Cancelled

    const rawName = clientNameInput.trim() || `Cliente #${salesLog.length + 1}`;
    const rawRif = (clientRifInput && clientRifInput.trim()) ? clientRifInput.trim() : "";
    const clientName = rawRif ? `${rawName} - ${rawRif}` : rawName;
    
    const editingTimestamp = sessionStorage.getItem('casa_lucenzo_editing_timestamp');
    const editingSalesStr = sessionStorage.getItem('casa_lucenzo_editing_sales');
    const timestamp = editingTimestamp || new Date().toISOString();

    if (editingSalesStr && editingTimestamp) {
        // Void by timestamp (the account's real identity key), not by a
        // uuid list captured back when "Modificar" was pressed -- that list
        // can go stale, which used to leave the old rows behind forever
        // while the corrected set was inserted right on top of them,
        // silently doubling that account's sales. If the void can't be
        // confirmed right now, stop here instead of inserting a replacement
        // on top of rows that might still be active.
        if (window.SupabaseManager.isConfigured()) {
            const voided = await window.SupabaseManager.voidSalesByTimestamp(editingTimestamp, "Corrección de cuenta");
            if (!voided) {
                window.UIManager.showToast("⚠️ No se pudo confirmar la corrección por falta de conexión. Probá de nuevo en unos segundos -- no se guardó nada todavía.", "fa-solid fa-triangle-exclamation");
                return;
            }
        }
        // Remove old entries from local memory log
        salesLog = salesLog.filter(s => s.timestamp !== editingTimestamp);

        sessionStorage.removeItem('casa_lucenzo_editing_sales');
        sessionStorage.removeItem('casa_lucenzo_editing_timestamp');
    }
    sessionStorage.removeItem('casa_lucenzo_editing_client_name');

    // Create sales log items for each cart product (as open active account)
    const newSales = [];
    currentCart.forEach(cartItem => {
        const prod = products.find(p => p.id === cartItem.productId);
        for (let i = 0; i < cartItem.quantity; i++) {
            const saleItem = {
                uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
                productId: cartItem.productId,
                name: `${cartItem.name} [${clientName}]`,
                price: cartItem.price || 0,
                cost: prod ? (prod.cost || 0) : 0,
                timestamp: timestamp
            };
            newSales.push(saleItem);
        }
    });

    salesLog.push(...newSales);
    window.StorageManager.saveSalesLog(salesLog);
    logActivity("Registro Venta", `Venta de ${newSales.length} ítems por $${newSales.reduce((s,x)=>s+x.price, 0).toFixed(2)}. Cliente: ${clientName || 'Sin Nombre'}`);

    // insertSales writes local-first (PowerSync) when synced, Supabase-direct
    // otherwise -- it handles its own fallback/errors internally now.
    if (window.SupabaseManager.isConfigured()) {
        await window.SupabaseManager.insertSales(newSales);
    }

    currentCart = [];
    localStorage.removeItem('casa_lucenzo_current_cart');

    // Refresh UI views
    window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
    window.UIManager.renderCashRegister(salesLog, expenses);
    window.UIManager.renderSalesHistory(salesLog, handleUndoSale, handleEditSale);
    window.UIManager.renderClientesView(salesLog, handleUndoSale, handleEditSale, markTransactionAsPaid, products);

    if (currentRole === 'admin') {
        loadAndRenderAdminStats();
    }

    window.UIManager.showToast(`📝 Cuenta de "${clientName}" creada en Cuentas Activas (Consumiendo).`, "fa-solid fa-user-clock");

    // Return straight to Cuentas Activas when this checkout came from Clientes
    // (editing an existing account, or starting a new one from there) -- avoids
    // having to manually re-click the tab while juggling several accounts.
    if (cameFromClientes) {
        window.UIManager.switchView('clientes');
    }

    } finally {
        handleCheckoutCart._inProgress = false;
    }
}

/**
 * Undoes a sales transaction by restoring stock and subtracting from register
 * @param {string} timestamp Sales log entry transaction timestamp
 */
function handleUndoSale(timestamp) {
    const matchingSales = salesLog.filter(s => s.timestamp === timestamp);
    if (matchingSales.length === 0) return;

    triggerHaptic(15);

    if (confirm(`¿Estás seguro de deshacer esta cuenta completa y devolver los productos al stock?`)) {
        // Immediately record voided UUIDs locally so a stale Supabase-direct
        // refetch (pre-first-sync only -- PowerSync's own local view updates
        // instantly) can't resurrect them into salesLog before the void
        // upload lands.
        const uuidsToVoid = matchingSales.map(s => s.uuid).filter(Boolean);
        if (uuidsToVoid.length > 0) {
            window.StorageManager.addDeletedSalesUuids(uuidsToVoid);
        }

        matchingSales.forEach(sale => {
            const product = products.find(p => p.id === sale.productId);
            if (product) {
                const beforeUndo = product.stock;
                product.stock = product.stock >= product.max ? product.stock + 1 : Math.min(product.max, product.stock + 1);
                recordStockMovement(product, product.stock - beforeUndo, 'sale_return', sale.uuid);
            }
        });

        if (window.SupabaseManager.isConfigured() && uuidsToVoid.length > 0) {
            uuidsToVoid.forEach(uuid => window.SupabaseManager.voidSale(uuid, "Cuenta deshecha por el usuario"));
        }

        // Filter out these sales from memory
        salesLog = salesLog.filter(s => s.timestamp !== timestamp);
        window.StorageManager.saveSalesLog(salesLog);
        window.StorageManager.saveProducts(products);

        logActivity("Reversión de Venta", `Revertida cuenta del horario ${new Date(timestamp).toLocaleTimeString()} (${matchingSales.length} ítems devueltos a stock)`);

        // Refresh all views
        renderAllViews();
        window.UIManager.showToast("↩️ Cuenta deshecha y productos devueltos al stock.", "fa-solid fa-rotate-left");
        logActivity("Anulación Venta", `Venta anulada por el usuario (monto total devuelto al stock: $${matchingSales.reduce((s,x)=>s+x.price,0).toFixed(2)})`);
    }
}

/**
 * Autocorrects today's sales log to match the physical vitrina stock discrepancies
 * @param {Array} discrepancyList Audited products with discrepancies
 */
async function handleAutocorrectSales(discrepancyList) {
    triggerHaptic(15);
    
    const timestamp = new Date().toISOString();
    const newSales = [];
    
    discrepancyList.forEach(item => {
        if (item.discrepancy <= 0) return; // Only autocorrect missing items (expected > logged)
        
        for (let i = 0; i < item.discrepancy; i++) {
            const saleItem = {
                uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
                productId: item.product.id,
                name: `${item.product.name} [Ajuste Inventario]`,
                price: item.product.price || 0,
                cost: item.product.cost || 0,
                timestamp: timestamp
            };
            newSales.push(saleItem);
        }
    });
    
    if (newSales.length === 0) return;
    
    salesLog.push(...newSales);
    window.StorageManager.saveSalesLog(salesLog);
    
    // Sync to Supabase
    if (window.SupabaseManager.isConfigured()) {
        try {
            await window.SupabaseManager.insertSales(newSales);
        } catch (e) {
            console.error("Error syncing autocorrected sales to Supabase", e);
        }
    }
    
    window.UIManager.showToast(`✨ Se han registrado ${newSales.length} ventas faltantes con éxito.`, "fa-solid fa-circle-check");
    
    // Refresh UI dashboards
    window.UIManager.renderCashRegister(salesLog, expenses);
    window.UIManager.renderSalesHistory(salesLog, handleUndoSale, handleEditSale);
    window.UIManager.renderClientesView(salesLog, handleUndoSale, handleEditSale, markTransactionAsPaid, products);
}
window.handleAutocorrectSales = handleAutocorrectSales;


/**
 * Loads a sales transaction back into the active cart for modification, deleting old sales records
 * @param {string} timestamp Sales log entry transaction timestamp
 */
async function handleEditSale(timestamp) {
    const matchingSales = salesLog.filter(s => s.timestamp === timestamp);
    if (matchingSales.length === 0) return;

    // A closed/collected sale is tagged "(Pagado ...)" on every item's name.
    // Reopening one for correction is money-sensitive: the corrected cuenta comes
    // back as pending payment, so the cashier must re-register the collection.
    const wasPaid = /\(Pagado(?:\s*-\s*.*?)?\)\s*$/.test(matchingSales[0].name);
    if (wasPaid) {
        if (!confirm("Esta venta ya fue cobrada. Al corregirla, la cuenta volverá a quedar PENDIENTE DE PAGO y tendrás que registrar el cobro de nuevo con el monto correcto. ¿Deseas continuar?")) {
            return;
        }
    }

    if (currentCart.length > 0) {
        if (!confirm("Ya tienes productos en la cuenta activa. ¿Deseas vaciarla para cargar esta cuenta del historial?")) {
            return;
        }
    }

    triggerHaptic(15);

    if (wasPaid) {
        logActivity("Corrección de Venta Cerrada", `Cuenta del horario ${new Date(timestamp).toLocaleTimeString()} reabierta para corrección (monto original: $${matchingSales.reduce((s, x) => s + x.price, 0).toFixed(2)}). Vuelve a estar pendiente de pago.`);
    }

    // 1. Group matching sales by product_id to reconstruct the cart
    const cartReconstructed = [];
    matchingSales.forEach(sale => {
        const existing = cartReconstructed.find(item => item.productId === sale.productId);
        if (existing) {
            existing.quantity++;
        } else {
            const cleanName = sale.name.replace(/\s*\[.*\](\s*\(Pagado(?: - .*?)?\))?$/, '');
            cartReconstructed.push({
                productId: sale.productId,
                name: cleanName,
                price: sale.price || 0,
                quantity: 1
            });
        }
    });

    // Extract client name
    let clientName;
    const firstSale = matchingSales[0];
    const match = firstSale.name.match(/^(.*)\s+\[(.*)\](\s*\(Pagado(?: - .*?)?\))?$/);
    if (match) {
        clientName = match[2];
    } else {
        clientName = firstSale.productId === 'abono' ? 'Abono Deuda' : 'Cliente';
    }

    // 2. Set active cart in memory and localStorage
    currentCart = cartReconstructed;
    localStorage.setItem('casa_lucenzo_current_cart', JSON.stringify(currentCart));
    sessionStorage.setItem('casa_lucenzo_editing_client_name', clientName);
    sessionStorage.setItem('casa_lucenzo_editing_timestamp', timestamp);
    sessionStorage.setItem('casa_lucenzo_editing_sales', JSON.stringify(matchingSales));

    // 3. Remove old sales locally to avoid double counting in active cart
    salesLog = salesLog.filter(s => s.timestamp !== timestamp);
    window.StorageManager.saveSalesLog(salesLog);

    // 4. Switch to local view and update UI
    window.UIManager.switchView('local');
    window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
    window.UIManager.renderCashRegister(salesLog, expenses);
    window.UIManager.renderSalesHistory(salesLog, handleUndoSale, handleEditSale);

    if (currentRole === 'admin') {
        window.UIManager.renderStats(salesLog, expenses);
    }

    window.UIManager.showToast(`✏️ Cuenta de "${clientName}" cargada para modificar.`, "fa-solid fa-pen-to-square");
}

/**
 * Marks a sales transaction as paid, updating Supabase and memory (changing suffix to include (Pagado))
 * @param {string} timestamp Sales log entry transaction timestamp
 */
async function markTransactionAsPaid(timestamp, paymentMethod, updatedName = null, updatedRif = null) {
    const matchingSales = salesLog.filter(s => s.timestamp === timestamp);
    if (matchingSales.length === 0) return;

    let clientName = "Cliente";
    let clientRif = "";
    const firstSale = matchingSales[0];
    const bracketMatch = firstSale.name.match(/\[(.*?)\]/);
    if (bracketMatch) {
        const rawTag = bracketMatch[1].trim();
        if (rawTag.includes(' - ')) {
            const parts = rawTag.split(/\s+-\s+/);
            clientName = parts[0].trim();
            clientRif = parts[1].trim();
        } else {
            clientName = rawTag;
        }
    }

    const finalName = updatedName !== null ? updatedName.trim() : clientName;
    const finalRif = updatedRif !== null ? updatedRif.trim() : clientRif;

    // Ask for payment method if not provided yet
    if (!paymentMethod) {
        const itemMap = {};
        matchingSales.forEach(s => {
            let baseName = s.name.replace(/\s*\[.*?\]/g, '').replace(/\s*\((?:Pagado|Punto|Pago|Efectivo|Biopago).*?\)/gi, '').trim();
            if (!itemMap[baseName]) {
                itemMap[baseName] = { name: baseName, quantity: 0, totalPrice: 0, price: s.price };
            }
            itemMap[baseName].quantity += 1;
            itemMap[baseName].totalPrice += s.price;
        });
        const items = Object.values(itemMap);

        if (window.UIManager && window.UIManager.showPaymentMethodModal) {
            window.UIManager.showPaymentMethodModal(finalName, finalRif, items, timestamp, (method, name, rif) => {
                markTransactionAsPaid(timestamp, method, name, rif);
            });
        } else {
            markTransactionAsPaid(timestamp, "Efectivo", finalName, finalRif);
        }
        return;
    }

    triggerHaptic(15);

    const clientTag = (finalRif && finalRif.trim()) ? `${finalName} - ${finalRif.trim()}` : finalName;

    // Map to updated sales with selected payment method
    const updatedSales = matchingSales.map(sale => {
        let baseProductName = sale.name
            .replace(/\s*\[.*?\]/g, '')
            .replace(/\s*\((?:Pagado|Punto|Pago|Efectivo|Biopago).*?\)/gi, '')
            .trim();
        let newName = `${baseProductName} [${clientTag}] (Pagado - ${paymentMethod})`;
        return {
            ...sale,
            name: newName
        };
    });

    if (window.SupabaseManager.isConfigured()) {
        await window.SupabaseManager.upsertSales(updatedSales);
    }

    // Update local salesLog
    salesLog = salesLog.map(s => {
        if (s.timestamp === timestamp) {
            let baseProductName = s.name
                .replace(/\s*\[.*?\]/g, '')
                .replace(/\s*\((?:Pagado|Punto|Pago|Efectivo|Biopago).*?\)/gi, '')
                .trim();
            let newName = `${baseProductName} [${clientTag}] (Pagado - ${paymentMethod})`;
            return { ...s, name: newName };
        }
        return s;
    });

    window.StorageManager.saveSalesLog(salesLog);
    renderAllViews();
    window.UIManager.showToast(`💵 Cuenta de "${finalName}" cobrada con éxito.`, "fa-solid fa-circle-check");
}

/**
 * Reset all log history and cash register to $0.00
 */
function clearAllSales() {
    triggerHaptic(20);
    if (confirm("¿Estás seguro de que quieres borrar el historial de ventas y reiniciar la caja a $0.00?")) {
        // Void instead of delete (spec §5.2) -- doesn't touch product stock,
        // same as the delete this replaces never did either.
        if (window.SupabaseManager.isConfigured()) {
            salesLog.forEach(s => window.SupabaseManager.voidSale(s.uuid, "Reinicio de caja"));
        }

        salesLog = [];
        window.StorageManager.clearSalesLog();
        window.UIManager.renderCashRegister(salesLog, expenses);
        window.UIManager.renderSalesHistory(salesLog, handleUndoSale);
        
        if (currentRole === 'admin') {
            window.UIManager.renderStats(salesLog, expenses, products);
        }

        window.UIManager.showToast("🧹 Historial de ventas y caja reiniciados.", "fa-solid fa-trash-can");
    }
}

// ================= DISPATCH FLOWS (KITCHEN <-> LOCAL) =================

/**
 * Trigger product delivery/replenishment dispatch from Kitchen to Vitrina (Sales)
 * @param {string} id Product identifier
 * @param {number|null} customAmount Custom quantity specified by cook
 */
function deliverProduct(id, customAmount = null) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    let amountToSend = customAmount !== null ? parseInt(customAmount, 10) : (product.max - product.stock);
    if (isNaN(amountToSend) || amountToSend <= 0) {
        amountToSend = Math.max(1, product.max - product.stock);
    }

    triggerHaptic(15);

    const newDispatch = {
        uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        productId: product.id,
        name: product.name,
        amount: amountToSend,
        unit: product.unit || 'unid.',
        status: 'en_camino',
        timestamp: new Date().toISOString()
    };

    // Deduct recipe ingredients from pantry stock
    if (window.RecipeCalculator) {
        const recipeList = window.RecipeCalculator.calculateIngredients([{ ...product, stock: product.stock, max: product.max }]);
        recipeList.forEach(recipeItem => {
            const targetIng = ingredients.find(ing => {
                if (recipeItem.name === "Harina de Trigo") return ing.id === 'harina';
                if (recipeItem.name === "Margarina") return ing.id === 'margarina';
                if (recipeItem.name === "Relleno Carne Mechada") return ing.id === 'carne_mechada';
                if (recipeItem.name === "Relleno Pollo Desmechado") return ing.id === 'pollo';
                if (recipeItem.name === "Relleno Queso Blanco") return ing.id === 'queso';
                return false;
            });
            if (targetIng) {
                const calculatedDeduction = (recipeItem.amount / (product.max - product.stock || 1)) * amountToSend;
                targetIng.stock = Math.max(0, targetIng.stock - calculatedDeduction);
                if (window.SupabaseManager.isConfigured()) {
                    window.SupabaseManager.upsertIngredient(targetIng);
                }
            }
        });
        window.StorageManager.saveIngredients(ingredients);
        window.UIManager.renderIngredientsPantry(ingredients, addIngredientStock);
    }

    // Filter local dispatches
    replenishments = replenishments.filter(r => r.productId !== id || r.status !== 'en_camino');
    replenishments.push(newDispatch);
    window.StorageManager.saveReplenishments(replenishments);

    // Sync to Supabase
    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.upsertReplenishment(newDispatch);
    }

    window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
    window.UIManager.renderPendingDispatches(replenishments, confirmReceipt);

    window.UIManager.showToast(`🚚 "${product.name}" (${amountToSend} ${product.unit || 'unid.'}) enviado a vitrina.`, "fa-solid fa-paper-plane");
    logActivity("Despacho Cocina", `Cocinado y enviado ${amountToSend} ${product.unit || 'unid.'} de ${product.name} a vitrina`);
}

/**
 * Request replenishment from sales terminal to Kitchen
 */
async function handleQuickReplenishment(productId, productName, unit = 'unid.') {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const amountNeeded = Math.max(1, product.max - product.stock);
    
    triggerHaptic(15);
    
    // Check if we already have a pending/en_camino replenishment for this product
    const alreadyExists = replenishments.some(r => r.productId === productId && (r.status === 'pendiente' || r.status === 'en_camino'));
    if (alreadyExists) {
        window.UIManager.showToast(`⚠️ Ya existe una solicitud de reposición activa para "${productName}".`, "fa-solid fa-triangle-exclamation");
        return;
    }
    
    const newDispatch = {
        uuid: crypto.randomUUID ? crypto.randomUUID() : 'rep_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
        productId: productId,
        name: productName,
        amount: amountNeeded,
        unit: unit,
        status: 'pendiente',
        timestamp: new Date().toISOString()
    };
    
    replenishments.push(newDispatch);
    window.StorageManager.saveReplenishments(replenishments);
    
    if (window.SupabaseManager.isConfigured()) {
        await window.SupabaseManager.upsertReplenishment(newDispatch);
    }
    
    window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
    window.UIManager.renderPendingDispatches(replenishments, confirmReceipt);
    window.UIManager.renderCriticalStockAlerts(products, handleQuickReplenishment);
    
    window.UIManager.showToast(`⚡ Solicitud de reposición de ${amountNeeded} ${unit} enviada a Cocina.`, "fa-solid fa-circle-check");
    logActivity("Reposición Solicitada", `Solicitado reposición de ${amountNeeded} ${productName} a Cocina`);
}

/**
 * Update stock manually for a product (direct load from kitchen)
 * @param {string} id Product identifier
 * @param {number} newStock New stock value
 */
async function updateProductStockDirect(id, newStock) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    triggerHaptic(15);
    const beforeCount = product.stock;
    applyStockCount(product, newStock);
    window.StorageManager.saveProducts(products);

    const countDelta = product.stock - beforeCount;
    recordStockMovement(product, countDelta, countDelta > 0 ? 'load' : 'count_down');

    renderAllViews();
    window.UIManager.showToast(`✅ Vitrina actualizada: "${product.name}" ahora tiene ${product.stock} ${product.unit || 'unid.'}.`, "fa-solid fa-circle-check");
}

/**
 * Add stock manually for a product (incremental load from kitchen)
 * @param {string} id Product identifier
 * @param {number} amountToAdd Stock to add
 */
async function addProductStockDirect(id, amountToAdd) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (amountToAdd <= 0) return;

    triggerHaptic(15);
    const beforeAdd = product.stock;
    applyStockLoad(product, amountToAdd);

    window.StorageManager.saveProducts(products);

    recordStockMovement(product, product.stock - beforeAdd, 'load');

    renderAllViews();
    window.UIManager.showToast(`✅ Vitrina actualizada: Se sumaron ${amountToAdd} piezas a "${product.name}". Total: ${product.stock}.`, "fa-solid fa-circle-check");
}
window.addProductStockDirect = addProductStockDirect;


/**
 * Local trigger: Mark all pending dispatches as received, replenishing stocks.
 *
 * Idempotent on purpose: each batch may only ever be added to the vitrina
 * once. The uuids are burned into localStorage *before* any stock moves, so a
 * double tap, a realtime echo, or the 45s background re-sync landing before
 * the Supabase DELETE commits can no longer resurrect the card and add the
 * same pieces a second time.
 */
async function confirmReceipt() {
    if (isConfirmingReceipt) return;

    const consumed = new Set(window.StorageManager.loadConsumedReplenishmentUuids());
    const pending = replenishments.filter(r => r.status === 'en_camino' && !consumed.has(r.uuid));
    if (pending.length === 0) {
        // Nothing genuinely new: drop any stale card left over from a re-sync.
        replenishments = replenishments.filter(r => !consumed.has(r.uuid));
        window.StorageManager.saveReplenishments(replenishments);
        window.UIManager.renderPendingDispatches(replenishments, confirmReceipt);
        return;
    }

    isConfirmingReceipt = true;
    triggerHaptic(15);

    // Claim the batch first -- everything below is now safe to retry.
    window.StorageManager.addConsumedReplenishmentUuids(pending.map(d => d.uuid));

    try {
        pending.forEach(dispatch => {
            const product = products.find(p => p.id === dispatch.productId);
            const beforeReceipt = product ? product.stock : 0;
            if (product && applyStockLoad(product, dispatch.amount)) {
                recordStockMovement(product, product.stock - beforeReceipt, 'load', dispatch.uuid);
                logActivity("Recepción Vitrina", `Recibidos ${dispatch.amount} ${product.unit || 'unid.'} de ${product.name} en vitrina. Stock actual: ${product.stock}/${product.max}`);
            }
            dispatch.status = 'recibido';
        });

        replenishments = replenishments.filter(r => r.status !== 'recibido' && !consumed.has(r.uuid));
        window.StorageManager.saveReplenishments(replenishments);
        window.StorageManager.saveProducts(products);

        // Refresh views
        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
        window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
        window.UIManager.renderPendingDispatches(replenishments, confirmReceipt);

        window.UIManager.showToast("✨ ¡Mercancía recibida! Vitrina actualizada.", "fa-solid fa-circle-check");

        // Await the deletes so the next background sync cannot re-read them.
        if (window.SupabaseManager.isConfigured()) {
            await Promise.all(pending.map(d => window.SupabaseManager.deleteReplenishment(d.uuid)));
        }
    } finally {
        isConfirmingReceipt = false;
    }
}

function resetToMax() {
    triggerHaptic(15);
    products.forEach(p => {
        const cat = p.category || (window.StorageManager ? window.StorageManager.getProductCategory(p) : 'pastelitos');
        const beforeReset = p.stock || 0;
        // Topping the shelf back up to capacity is a load like any other: only
        // the missing pieces enter, and the day's baseline grows by that much.
        if (cat === 'pastelitos' && applyStockLoad(p, (p.max || 0) - (p.stock || 0))) {
            recordStockMovement(p, p.stock - beforeReset, 'load');
        }
    });
    window.StorageManager.saveProducts(products);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
    window.UIManager.showToast("✨ Vitrina de pastelitos rellenada al máximo.", "fa-solid fa-circle-check");
}

// ================= DAILY EXPENSES =================

/**
 * Add a new expense transaction
 * @param {Event} e Submit event
 */
function addExpense(e) {
    e.preventDefault();

    const descInput = document.getElementById('expense-desc-input');
    const amountInput = document.getElementById('expense-amount-input');

    const description = descInput.value.trim();
    const amount = parseFloat(amountInput.value);

    if (!description || isNaN(amount) || amount <= 0) return;

    triggerHaptic(15);

    const newExpense = {
        uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        description,
        amount,
        timestamp: new Date().toISOString(),
        // NO category: the counter quick-expense is the only expense that flows
        // into the shift `expenses` array / cash register. Any categorized
        // expense belongs solely to the P&L / Gastos tab. null/absent reads as
        // 'otros' in aggregatePnl + renderAdminExpenses.
        currency: 'USD',
        bcv_rate: null
    };

    expenses.push(newExpense);
    window.StorageManager.saveExpenses(expenses);

    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.insertExpense(newExpense);
    }

    window.UIManager.renderExpenses(expenses, deleteExpense);
    window.UIManager.renderCashRegister(salesLog, expenses);
    
    if (currentRole === 'admin') {
        window.UIManager.renderStats(salesLog, expenses);
    }

    document.getElementById('add-expense-form').reset();
    window.UIManager.showToast("💸 Gasto registrado correctamente.", "fa-solid fa-file-invoice-dollar");
}

/**
 * Delete expense transaction
 * @param {string} uuid Expense unique identifier
 */
function deleteExpense(uuid) {
    triggerHaptic(15);
    expenses = expenses.filter(e => e.uuid !== uuid);
    window.StorageManager.saveExpenses(expenses);

    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.deleteExpense(uuid);
    }

    window.UIManager.renderExpenses(expenses, deleteExpense);
    window.UIManager.renderCashRegister(salesLog, expenses);

    if (currentRole === 'admin') {
        window.UIManager.renderStats(salesLog, expenses);
    }

    window.UIManager.showToast("🗑️ Gasto eliminado.", "fa-solid fa-trash");
}

// ================= ADMIN EXPENSES TAB (GASTOS DEL LOCAL) =================

let expensesTabFilter = { month: '', category: '', bcvRate: 1 };
let expensesTabCache = {}; // monthISO -> Array
let pnlCache = {};         // `${mode}:${startISO}` -> pnl  (also reset here on expense add/delete; consumed by Task 7)
let pnlMode = 'week';       // 'week' | 'month'
let pnlAnchor = new Date(); // any date inside the selected period
let pnlLast = null;         // last rendered pnl (for the PDF button)

// Plan B, Task 14 (spec §4): the historical/reporting reads below
// (fetchStatsData, fetchExpensesRange, fetchPnlData, fetchDayReport,
// fetchReportDays, fetchSalesHistory, fetchActiveSessions) go straight to
// Postgres on purpose -- they're not part of PowerSync's sync stream, so
// there's no local fallback for them, ever. Before this task they either
// silently returned []/null (a real network failure looks identical to "no
// data exists" -- e.g. fetchReportDays offline used to render "No se
// encontraron reportes recientes", which reads as "nothing happened" when
// really it's "couldn't ask the server") or, in a couple of spots, just did
// nothing at all. This makes the "no conexión" case explicit instead.
function requireOnline(featureName) {
    if (window.SupabaseManager.isConfigured() && navigator.onLine) return true;
    window.UIManager.showToast(`⚠️ ${featureName} requiere conexión a internet`, "fa-solid fa-wifi-slash");
    return false;
}

async function loadAndRenderExpensesTab(forceRefetch = false) {
    if (currentRole !== 'admin') return;
    const monthInput = document.getElementById('admin-expense-filter-month');
    const month = (monthInput && monthInput.value) || new Date().toISOString().slice(0, 7);
    expensesTabFilter.month = month;
    expensesTabFilter.bcvRate = window.bcvRate || 1;

    if (forceRefetch) delete expensesTabCache[month];
    if (!Array.isArray(expensesTabCache[month])) {
        if (requireOnline('Ver gastos de otros meses')) {
            const start = new Date(month + '-01T00:00:00');
            const end = new Date(start); end.setMonth(end.getMonth() + 1);
            expensesTabCache[month] = await window.SupabaseManager.fetchExpensesRange(start.toISOString(), end.toISOString());
        } else {
            // Best-effort degraded view: whatever's in the local operational
            // window (Task 5's local-first expenses) -- complete for the
            // current month, but silently partial for any other month. The
            // toast above is what keeps that from reading as "gastos: $0".
            expensesTabCache[month] = expenses.filter(e => (e.timestamp || '').slice(0, 7) === month);
        }
    }
    window.UIManager.renderAdminExpenses(expensesTabCache[month], expensesTabFilter, handleDeleteAdminExpense);
}

function handleDeleteAdminExpense(uuid) {
    let exp = null;
    Object.keys(expensesTabCache).forEach(m => {
        const hit = (expensesTabCache[m] || []).find(e => e.uuid === uuid);
        if (hit) exp = hit;
    });
    if (exp) {
        const CAT_LABEL = { arriendo: 'Arriendo', sueldos: 'Sueldos', servicios: 'Servicios', otros: 'Otros' };
        const cat = CAT_LABEL[(exp.category || '').toLowerCase()] || 'Otros';
        const orig = (exp.currency || 'USD').toUpperCase() === 'VES'
            ? `Bs. ${(parseFloat(exp.amount) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
            : `$${(parseFloat(exp.amount) || 0).toFixed(2)}`;
        if (!confirm(`¿Eliminar el gasto "${cat} — ${exp.description || ''}" (${orig})?`)) return;
    }
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
    // NB: admin fixed expenses (arriendo/sueldos/servicios) are deliberately NOT
    // pushed into the shift `expenses` array nor persisted via saveExpenses — they
    // must not touch the shift cash register / day-close PDF / other devices. The
    // Gastos tab renders from `expensesTabCache` and the P&L refetches from the
    // server, so neither needs a row here.
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

// ================= ADMIN GANANCIAS TAB (RESUMEN DE GANANCIAS) =================

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
    // Build the candidate from the normalized period start (month start = day 1,
    // week start = Monday) so setMonth/+7 can't overflow a 29-31 day-of-month.
    const next = new Date(pnlRange(pnlMode, pnlAnchor).start);
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
            let data = null;
            try {
                data = await window.SupabaseManager.fetchPnlData(start.toISOString(), end.toISOString());
            } catch (err) {
                console.error('loadPnl fetch failed:', err);
            }
            if (!data) {
                // Do NOT cache a failed fetch — offer a retry instead (spec §4.4).
                if (container) {
                    container.innerHTML = `<div style="font-size:0.85rem; color:var(--color-danger); text-align:center; padding:1.5rem 0;">No se pudo cargar el resumen, reintentá.<br><button id="btn-pnl-retry" class="btn-action-small" style="margin-top:0.75rem;"><i class="fa-solid fa-rotate"></i> Reintentar</button></div>`;
                    const retryBtn = document.getElementById('btn-pnl-retry');
                    if (retryBtn) retryBtn.addEventListener('click', () => loadPnl(true));
                }
                return;
            }
            sales = data.sales; expenses = data.expenses;
        } else if (container) {
            container.innerHTML = `<div style="font-size:0.85rem; color:var(--color-danger); text-align:center; padding:1.5rem 0;">Sin conexión — el resumen necesita datos del servidor.<br><button id="btn-pnl-retry-offline" class="btn-action-small" style="margin-top:0.75rem;"><i class="fa-solid fa-rotate"></i> Reintentar</button></div>`;
            const retryBtn = document.getElementById('btn-pnl-retry-offline');
            if (retryBtn) retryBtn.addEventListener('click', () => loadPnl(true));
            return;
        }
        pnlCache[key] = window.AnalyticsManager.aggregatePnl(sales, expenses, products, {
            start, end, periodLabel: label, bcvRate: window.bcvRate || 1
        });
    }
    pnlLast = pnlCache[key];
    window.UIManager.renderPnl(pnlLast, { mode: pnlMode });
}

// ================= DEBTS virtual ledger (FIADOS) =================

/**
 * Register client debt or add more balance to existing debtor
 * @param {Event} e Submit event
 */
function addDebt(e) {
    e.preventDefault();

    const nameInput = document.getElementById('debt-client-name');
    const amountInput = document.getElementById('debt-amount');
    const descInput = document.getElementById('debt-desc');

    const name = nameInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const description = descInput.value.trim();

    if (!name || isNaN(amount) || amount <= 0) return;

    triggerHaptic(15);

    const existingClient = debts.find(d => d.clientName.toLowerCase() === name.toLowerCase());
    let targetDebtObj;

    if (existingClient) {
        // Plan B, Task 8: existingClient.amount is now a COMPUTED balance
        // (original - abonos, see mapDebtRow), not the stored value -- must
        // add the new debt onto originalAmount, or upsertDebt would persist
        // an already-paid-down number as if it were the fresh original.
        const currentOriginal = (existingClient.originalAmount !== undefined && existingClient.originalAmount !== null)
            ? existingClient.originalAmount : existingClient.amount;
        existingClient.originalAmount = currentOriginal + amount;
        existingClient.amount += amount;
        existingClient.timestamp = new Date().toISOString();
        if (description) {
            existingClient.description = existingClient.description 
                ? `${existingClient.description}, ${description}` 
                : description;
        }
        targetDebtObj = existingClient;
    } else {
        const newDebt = {
            uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
            clientName: name,
            amount,
            description,
            timestamp: new Date().toISOString()
        };
        debts.push(newDebt);
        targetDebtObj = newDebt;
    }

    window.StorageManager.saveDebts(debts);

    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.upsertDebt(targetDebtObj);
    }

    window.UIManager.renderDebts(debts, settleDebtPayment);

    document.getElementById('add-debt-form').reset();
    window.UIManager.showToast(`📝 Cuenta de "${name}" actualizada.`, "fa-solid fa-book");
}

/**
 * Settle customer payments, subtracting from debt ledger and adding cash to register
 * @param {string} uuid Client ledger unique identifier
 */
function settleDebtPayment(uuid) {
    const client = debts.find(d => d.uuid === uuid);
    if (!client) return;

    triggerHaptic(15);

    const paymentPrompt = prompt(`Ingresa el monto que abona ${client.clientName}:\nDeuda actual: $${client.amount.toFixed(2)}`, client.amount.toFixed(2));
    if (paymentPrompt === null) return;

    const paymentAmount = parseFloat(paymentPrompt);
    if (isNaN(paymentAmount) || paymentAmount <= 0 || paymentAmount > client.amount) {
        alert("Monto inválido. No puede ser mayor que la deuda actual.");
        return;
    }

    triggerHaptic(15);

    // Plan B, Task 8: abonos son append-only (spec §5.3) -- ya no se persiste
    // una resta de debts.amount (ver insertDebtPayment más abajo), así que
    // dejar de mutar client.timestamp/description también: nada los sube a
    // Postgres desde acá, y mutarlos solo local crearía una vista distinta a
    // la de cualquier otro dispositivo (o esta misma pestaña tras un
    // refetch). El monto sí se mantiene optimista en memoria para feedback
    // instantáneo -- fetchDebts vuelve a calcular el mismo valor apenas
    // insertDebtPayment sube.
    client.amount = Math.max(0, client.amount - paymentAmount);

    const saleItem = {
        uuid: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        productId: 'abono',
        name: `Abono: ${client.clientName}`,
        price: paymentAmount,
        timestamp: new Date().toISOString()
    };
    salesLog.push(saleItem);

    window.StorageManager.saveDebts(debts);
    window.StorageManager.saveSalesLog(salesLog);

    logActivity("Abono de Deuda", `Cliente ${client.clientName} abonó $${paymentAmount.toFixed(2)}. Restante: $${client.amount.toFixed(2)}`);

    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.insertDebtPayment(client.uuid, paymentAmount, null, myDeviceId);
        window.SupabaseManager.insertSale(saleItem);
    }

    window.UIManager.renderDebts(debts, settleDebtPayment);
    window.UIManager.renderCashRegister(salesLog, expenses);
    window.UIManager.renderSalesHistory(salesLog, handleUndoSale);

    if (currentRole === 'admin') {
        window.UIManager.renderStats(salesLog, expenses);
    }

    window.UIManager.showToast(`💵 Pago de $${paymentAmount.toFixed(2)} registrado en caja.`, "fa-solid fa-hand-holding-dollar");
}

// ================= PEDIDOS ONLINE =================

/**
 * Marks a customer's online order as confirmed (payment received).
 * Does NOT touch stock or create a sale record -- staff still ring up the
 * sale normally when the customer picks up the order.
 */
function handleConfirmPedido(id) {
    const pedido = pedidosOnline.find(p => p.id === id);
    if (!pedido) return;

    triggerHaptic(15);
    pedido.status = 'confirmado';

    window.SupabaseManager.updatePedidoStatus(id, 'confirmado');
    logActivity("Pedido Online Confirmado", `Pedido de ${pedido.customer_name} por $${Number(pedido.total).toFixed(2)} confirmado.`);

    window.UIManager.renderPedidosOnline(pedidosOnline, handleConfirmPedido, handleRechazarPedido);
    window.UIManager.updatePedidosBadge(pedidosOnline);
    window.UIManager.showToast(`✅ Pedido de ${pedido.customer_name} confirmado.`, "fa-solid fa-check");
}

/**
 * Marks a customer's online order as rejected (e.g. payment never arrived).
 */
function handleRechazarPedido(id) {
    const pedido = pedidosOnline.find(p => p.id === id);
    if (!pedido) return;

    if (!confirm(`¿Rechazar el pedido de ${pedido.customer_name} por $${Number(pedido.total).toFixed(2)}?`)) return;

    triggerHaptic(15);
    pedido.status = 'rechazado';

    window.SupabaseManager.updatePedidoStatus(id, 'rechazado');
    logActivity("Pedido Online Rechazado", `Pedido de ${pedido.customer_name} por $${Number(pedido.total).toFixed(2)} rechazado.`);

    window.UIManager.renderPedidosOnline(pedidosOnline, handleConfirmPedido, handleRechazarPedido);
    window.UIManager.updatePedidosBadge(pedidosOnline);
    window.UIManager.showToast(`🚫 Pedido de ${pedido.customer_name} rechazado.`, "fa-solid fa-ban");
}

// ================= INGREDIENTS STOCK =================

/**
 * Prompt to add stock to kitchen ingredient alacena
 * @param {string} id Ingredient identifier
 */
function addIngredientStock(id) {
    const ing = ingredients.find(i => i.id === id);
    if (!ing) return;

    triggerHaptic(15);
    const promptAmount = prompt(`¿Cuántos ${ing.unit} de "${ing.name}" deseas agregar?`, "5.0");
    if (promptAmount === null) return;
    const amountVal = parseFloat(promptAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
        alert("Cantidad inválida.");
        return;
    }

    triggerHaptic(15);
    ing.stock += amountVal;
    window.StorageManager.saveIngredients(ingredients);

    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.upsertIngredient(ing);
    }

    window.UIManager.renderIngredientsPantry(ingredients, addIngredientStock);
    window.UIManager.showToast(`📦 Se agregaron +${amountVal} ${ing.unit} de ${ing.name}.`, "fa-solid fa-circle-check");
}

// ================= DAY CLOSE BROADCASTS =================

/**
 * Open Cierre de Día modal overlay
 */
function openDayCloseModal() {
    triggerHaptic(15);
    const todayLabel = new Date().toLocaleDateString();
    const currentRate = window.bcvRate || bcvRate;
    currentReportData = { sales: salesLog, expenses: expenses, dateLabel: todayLabel, rate: currentRate, isHistory: false };
    window.UIManager.renderDayCloseModal(salesLog, expenses, products, todayLabel, currentRate);
    document.getElementById('day-close-modal').classList.remove('hidden');
}

/**
 * Close Cierre de Día modal overlay
 */
function closeDayCloseModal() {
    triggerHaptic(15);
    document.getElementById('day-close-modal').classList.add('hidden');
}

function generateWhatsAppReport(reportSales, reportExpenses, dateLabel, rate, productsList = []) {
    const totalSales = reportSales.reduce((sum, s) => sum + (s.price || 0), 0);
    const totalExpenses = reportExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netCash = totalSales - totalExpenses;

    const categoryMap = {};

    reportSales.forEach(sale => {
        let cleanName = sale.name;
        if (sale.productId !== 'abono') {
            cleanName = sale.name.replace(/\s*\[.*\](\s*\(Pagado(?: - .*?)?\))?$/, '');
        }

        let catKey = 'otros';
        let catLabel = '📦 Otros / Varios';
        let sortOrder = 99;

        if (sale.productId !== 'abono') {
            const product = productsList.find(p => p.id === sale.productId);
            const rawCat = product ? product.category : 'otros';

            if (rawCat === 'pastelitos') {
                const unitPrice = sale.price || (product ? product.price : 0);
                catKey = `pastelitos_${unitPrice.toFixed(2)}`;
                catLabel = `🥐 Pastelitos ($${unitPrice.toFixed(2)})`;
                sortOrder = 10 + unitPrice;
            } else if (rawCat === 'bebidas') {
                catKey = 'bebidas';
                catLabel = '🥤 Bebidas';
                sortOrder = 50;
            } else if (rawCat === 'dulces') {
                catKey = 'dulces';
                catLabel = '🍬 Dulces';
                sortOrder = 60;
            } else {
                catKey = 'otros';
                catLabel = '📦 Otros / Varios';
                sortOrder = 90;
            }
        }

        if (!categoryMap[catKey]) {
            categoryMap[catKey] = { label: catLabel, sortOrder: sortOrder, sales: {} };
        }

        const catGroup = categoryMap[catKey].sales;
        if (!catGroup[cleanName]) {
            catGroup[cleanName] = { count: 0, unitPrice: sale.price || 0, total: 0 };
        }
        catGroup[cleanName].count++;
        catGroup[cleanName].total += sale.price || 0;
    });

    const totalItemsSold = reportSales.filter(s => s.productId !== 'abono').length;

    let message = `📋 *CIERRE DE JORNADA - CASA LUCENZO*\n`;
    message += `📅 Fecha: ${dateLabel}\n`;
    message += `💱 Tasa BCV: ${rate.toFixed(2)} Bs.\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🛒 *VENTAS DEL DÍA* (${totalItemsSold} unidades)\n\n`;

    const sortedCategories = Object.values(categoryMap).sort((a, b) => a.sortOrder - b.sortOrder);

    for (const catData of sortedCategories) {
        const items = Object.entries(catData.sales);
        if (items.length > 0) {
            message += `*${catData.label.toUpperCase()}*\n`;
            for (const [name, data] of items) {
                message += `  • ${data.count}x ${name}\n`;
                message += `    $${data.unitPrice.toFixed(2)} c/u → *$${data.total.toFixed(2)}* (Bs. ${(data.total * rate).toFixed(2)})\n`;
            }
            message += `\n`;
        }
    }
    if (totalItemsSold === 0) {
        message += `  Sin ventas registradas.\n`;
    }

    message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🏪 *GASTOS DEL LOCAL* (${reportExpenses.length})\n\n`;
    reportExpenses.forEach(exp => {
        message += `  • ${exp.description}: -$${exp.amount.toFixed(2)} (Bs. ${(exp.amount * rate).toFixed(2)})\n`;
    });
    if (reportExpenses.length === 0) {
        message += `  Sin gastos registrados.\n`;
    }

    message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 *RESUMEN FINANCIERO*\n\n`;
    message += `  💰 Ventas:  +$${totalSales.toFixed(2)} (Bs. ${(totalSales * rate).toFixed(2)})\n`;
    message += `  💸 Gastos:  -$${totalExpenses.toFixed(2)} (Bs. ${(totalExpenses * rate).toFixed(2)})\n`;
    message += `  ─────────────────\n`;
    message += `  💵 *CAJA NETA: $${netCash.toFixed(2)}*\n`;
    message += `     _(Bs. ${(netCash * rate).toFixed(2)})_\n`;
    message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📢 _Cierre generado automáticamente._\n`;
    message += `_¡Casa Lucenzo!_ 🌟`;

    return message;
}

/**
 * Open report history modal and load days from Supabase
 */
async function openReportHistoryModal() {
    triggerHaptic(15);
    const modal = document.getElementById('report-history-modal');
    const body = document.getElementById('report-history-modal-body');
    modal.classList.remove('hidden');

    // Show loading
    body.innerHTML = `
        <div style="text-align: center; padding: 2rem 0; color: var(--color-text-muted); font-size: 0.8125rem;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
            Cargando historial...
        </div>
    `;

    if (!window.SupabaseManager.isConfigured()) {
        body.innerHTML = `
            <div style="text-align: center; padding: 2rem 0; color: var(--color-text-muted); font-size: 0.8125rem;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; color: var(--color-gold);"></i>
                Configura Supabase para acceder al historial de reportes.
            </div>
        `;
        return;
    }

    // Plan B, Task 14: fetchReportDays goes straight to Postgres (not part of
    // PowerSync's sync stream) -- offline it silently returned [], and the
    // empty-state below read as "No se encontraron reportes recientes",
    // indistinguishable from a genuinely quiet 30 days. Distinguish them.
    if (!navigator.onLine) {
        body.innerHTML = `
            <div style="text-align: center; padding: 2rem 0; color: var(--color-text-muted); font-size: 0.8125rem;">
                <i class="fa-solid fa-wifi-slash" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; color: var(--color-danger);"></i>
                Sin conexión — el historial de reportes necesita datos del servidor.
                <br><button id="btn-report-history-retry-offline" class="btn-action-small" style="margin-top:0.75rem;"><i class="fa-solid fa-rotate"></i> Reintentar</button>
            </div>
        `;
        const retryBtn = document.getElementById('btn-report-history-retry-offline');
        if (retryBtn) retryBtn.addEventListener('click', () => openReportHistoryModal());
        return;
    }

    const days = await window.SupabaseManager.fetchReportDays(30);

    if (!days || days.length === 0) {
        body.innerHTML = `
            <div style="text-align: center; padding: 2rem 0; color: var(--color-text-muted); font-size: 0.8125rem;">
                <i class="fa-solid fa-inbox" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; color: var(--color-text-muted);"></i>
                No se encontraron reportes recientes.
            </div>
        `;
        return;
    }

    // Day name helper
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    let html = '';
    days.forEach(dateStr => {
        const d = new Date(dateStr + 'T12:00:00');
        const dayName = dayNames[d.getDay()];
        const displayDate = d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
        const today = new Date().toISOString().split('T')[0];
        const isToday = dateStr === today;
        const badge = isToday ? '<span style="font-size: 9px; background: var(--color-gold); color: #000; padding: 1px 6px; border-radius: 4px; font-weight: 800; margin-left: 0.35rem;">HOY</span>' : '';

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-md); margin-bottom: 0.5rem;">
                <div>
                    <div style="font-size: 0.8125rem; font-weight: 700; color: var(--color-white);">${dayName} ${badge}</div>
                    <div style="font-size: 0.6875rem; color: var(--color-text-muted);">${displayDate}</div>
                </div>
                <div style="display: flex; gap: 0.375rem;">
                    <button class="btn-report-view" data-date="${dateStr}" style="height: 34px; padding: 0 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--color-gold); background: transparent; color: var(--color-gold); font-weight: 700; font-size: 0.6875rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;">
                        <i class="fa-solid fa-eye" style="font-size: 10px;"></i> Ver
                    </button>
                    <button class="btn-report-whatsapp" data-date="${dateStr}" data-label="${dayName} ${displayDate}" style="height: 34px; padding: 0 0.75rem; border-radius: var(--radius-md); border: none; background: var(--color-success); color: #fff; font-weight: 700; font-size: 0.6875rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;">
                        <i class="fa-brands fa-whatsapp" style="font-size: 12px;"></i> Enviar
                    </button>
                </div>
            </div>
        `;
    });

    function formatReportDateStr(dateStr) {
        if (!dateStr) return new Date().toLocaleDateString();
        if (dateStr.includes('/')) return dateStr;
        const parts = dateStr.split('T')[0].split('-');
        if (parts.length === 3) {
            return `${parseInt(parts[2])}/${parseInt(parts[1])}/${parts[0]}`;
        }
        return dateStr;
    }

    body.innerHTML = html;

    // Bind view buttons
    body.querySelectorAll('.btn-report-view').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const dateStr = e.currentTarget.dataset.date;
            const formattedDate = formatReportDateStr(dateStr);
            triggerHaptic(15);
            if (!requireOnline('Ver el reporte de un día anterior')) return;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            const report = await window.SupabaseManager.fetchDayReport(dateStr);
            if (report) {
                const reportRate = report.bcvRate || report.sales?.find(s => s.bcvRate)?.bcvRate || window.bcvRate || bcvRate;
                currentReportData = { sales: report.sales, expenses: report.expenses, dateLabel: formattedDate, rate: reportRate, isHistory: true };
                modal.classList.add('hidden');
                window.UIManager.renderDayCloseModal(report.sales, report.expenses, products, formattedDate, reportRate);
                document.getElementById('day-close-modal').classList.remove('hidden');
            } else {
                window.UIManager.showToast("❌ No se pudo cargar el reporte.", "fa-solid fa-circle-xmark");
            }
            btn.innerHTML = '<i class="fa-solid fa-eye" style="font-size: 10px;"></i> Ver';
        });
    });

    // Bind WhatsApp buttons
    body.querySelectorAll('.btn-report-whatsapp').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const dateStr = e.currentTarget.dataset.date;
            const formattedDate = formatReportDateStr(dateStr);
            triggerHaptic(15);
            if (!requireOnline('Enviar el reporte por WhatsApp')) return;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            // Same Safari/iPadOS quirk as the day-close confirm button: open the
            // tab before the await below so it stays authorized by the click.
            const waTab = window.open('', '_blank');
            const report = await window.SupabaseManager.fetchDayReport(dateStr);
            if (report) {
                const reportRate = report.bcvRate || report.sales?.find(s => s.bcvRate)?.bcvRate || window.bcvRate || bcvRate;
                const message = generateWhatsAppReport(report.sales, report.expenses, formattedDate, reportRate, products);
                const encodedMessage = encodeURIComponent(message);
                if (waTab) {
                    waTab.location.href = `https://api.whatsapp.com/send?text=${encodedMessage}`;
                } else {
                    window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank');
                }
            } else {
                if (waTab) waTab.close();
                window.UIManager.showToast("❌ No se pudo cargar el reporte.", "fa-solid fa-circle-xmark");
            }
            btn.innerHTML = '<i class="fa-brands fa-whatsapp" style="font-size: 12px;"></i> Enviar';
        });
    });
}

/**
 * Clear daily sales and expenses logs locally and sync to Supabase, and refill vitrina stock to max for tomorrow
 */
async function closeDayAndResetLogs() {
    // The day close zeroes the register and the vitrina. Running it twice --
    // a double-tap on "confirmar", or two admins closing at once -- files a
    // second close, re-zeroes stock and fires a second WhatsApp report. Same
    // re-entrancy guard as handleCheckoutCart, on a heavier operation.
    if (closeDayAndResetLogs._inProgress) {
        window.UIManager.showToast("⏳ El cierre ya se está procesando, esperá un momento.", "fa-solid fa-hourglass-half");
        return;
    }
    closeDayAndResetLogs._inProgress = true;

    try {
        window.UIManager.showToast("⏳ Cerrando jornada y preparando vitrina...", "fa-solid fa-hourglass-start");

        const nowStr = new Date().toISOString();

        // 1. Record the close on the server FIRST. Writing it locally up front
        // meant a failed server write still advanced this device's cutoff: the
        // day's sales dropped out of its view while every other device -- and
        // the database -- still had the day open.
        if (window.SupabaseManager.isConfigured()) {
            if (window.SupabaseManager.getDbSupportsLastClose()) {
                console.log("Saving last day close timestamp to Supabase app_config...");
                await window.SupabaseManager.upsertAppConfig({ lastCloseTime: nowStr });
            } else {
                console.log("Database does not support last_close_time. Voiding daily sales and clearing expenses from Supabase as fallback...");
                await Promise.all(salesLog.map(s => window.SupabaseManager.voidSale(s.uuid, "Cierre de jornada (sin soporte de last_close_time)")));
                await window.SupabaseManager.deleteExpenses(expenses.map(e => e.uuid));
            }
        }
        window.StorageManager.saveLastCloseTime(nowStr);

        // 1b. Also record the close in day_closes (Plan A/B, migrations 026/030/033).
        // last_close_at() reads MAX(day_closes.closed_at) to know where "today"
        // starts for the pastelitos stock calculation; app_config.last_close_time
        // above doesn't feed that at all. Isolated in its own try/catch like the
        // BCV refresh below -- the close is already committed by this point, a
        // failure here must not report a completed close as failed.
        if (window.SupabaseManager.isConfigured()) {
            try {
                await window.SupabaseManager.insertDayClose(nowStr, myDeviceId);
            } catch (e) {
                console.warn("Day close committed, but insertDayClose failed.", e);
            }
        }

        // 2. Clear local arrays
        salesLog = [];
        expenses = [];

        // 3. Clear local storage logs
        window.StorageManager.clearSalesLog();
        window.StorageManager.clearExpenses();

        // 3b. A new day starts with no dispatches owed, so the guard list that
        // protects yesterday's batches from being re-loaded can start empty too.
        window.StorageManager.clearConsumedReplenishmentUuids();

        // 4. Reset showcase products' stock: Pastelitos reset to 0, Packaged items (bebidas, dulces) keep their actual remaining stock
        //
        // Plan B, Task 9: stock/initial_stock no persisten nada acá.
        // insertDayClose() (Step 1b) es lo que mueve la frontera real --
        // trg_day_close_recompute (migración 030) recalcula esas dos columnas
        // solo, straight from stock_movements, la misma fórmula que este loop
        // replicaba a mano con un updateProductStock() directo. Repetirlo acá
        // competiría con el trigger por las mismas columnas (el mismo
        // conflicto de doble escritura de Task 6) -- pero sacar la mutación
        // en memoria por completo tampoco es seguro: el trigger recién corre
        // cuando el INSERT de insertDayClose efectivamente sube, y esta app
        // tiene que poder operar offline un día entero (spec R1). Esta
        // asignación pura en memoria es lo que hace que Cocina vea la vitrina
        // en cero de inmediato, incluso antes de que el cierre sincronice.
        // (fetchProducts, más abajo en supabase.js, calcula lo mismo en vivo
        // para que sobreviva un F5/recarga offline -- hallazgo real de
        // Gemini, ver Task 9 en el plan.)
        //
        // `max` sí necesita seguir escribiéndose directo: a diferencia de
        // stock/initial_stock, el trigger solo puede CRECER ese techo
        // (GREATEST), nunca bajarlo -- sin este write explícito, "resetea con
        // el día" queda roto en TODOS los casos, no solo offline.
        products.forEach(p => {
            const cat = p.category || (window.StorageManager ? window.StorageManager.getProductCategory(p) : 'pastelitos');
            if (cat === 'pastelitos') {
                p.stock = 0;
                p.initial_stock = 0;
                // Capacity is "what got loaded today", so it resets with the day.
                // Left standing it accumulated, and Cocina kept asking for
                // batches nobody had loaded.
                p.max = 0;
                if (window.SupabaseManager.isConfigured()) {
                    window.SupabaseManager.resetPastelitoCapacity(p.id);
                }
            } else {
                // Keep actual remaining stock for drinks/sweets
                p.initial_stock = p.stock || 0;
            }
        });
        // 4.5. Ensure BCV automatic exchange connector is active and refreshed
        // for the next day. Isolated on purpose: the close itself is already
        // committed by this point, so a BCV provider being down must not throw
        // us into the catch below and report a completed close as failed --
        // that reads as "it didn't work" and invites closing a second time.
        useAutoBcv = true;
        try {
            await fetchBcvRate(true);
        } catch (e) {
            console.warn("Day close committed, but refreshing the BCV rate failed. Rate stays at its current value.", e);
            window.UIManager.showToast("⚠️ Jornada cerrada, pero no se pudo actualizar la tasa BCV. Revisala mañana antes de vender.", "fa-solid fa-triangle-exclamation");
        }

        // 5. Re-render UI
        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
        window.UIManager.renderCashRegister(salesLog, expenses);
        window.UIManager.renderSalesHistory(salesLog, handleUndoSale);
        window.UIManager.renderExpenses(expenses, deleteExpense);
        
        if (currentRole === 'admin') {
            loadAndRenderAdminStats();
        }

        window.UIManager.showToast("🌅 ¡Jornada cerrada! Caja en cero y vitrina lista al 100% para mañana.", "fa-solid fa-circle-check");
    } catch (e) {
        console.error("Failed to reset logs during day close", e);
        window.UIManager.showToast("❌ Error al cerrar la jornada. No se cerró -- revisá la conexión y probá de nuevo.", "fa-solid fa-circle-xmark");
    } finally {
        closeDayAndResetLogs._inProgress = false;
    }
}

// ================= ADMIN PREFERENCES =================

/**
 * Handle preference toggles changes (sound and vibration checkboxes)
 */
function handlePreferencesChange() {
    const soundVal = document.getElementById('pref-sound').checked;
    const vibrateVal = document.getElementById('pref-vibrate').checked;
    const supUrl = document.getElementById('pref-supabase-url').value.trim();
    const supKey = document.getElementById('pref-supabase-key').value.trim();

    const keysChanged = preferences.supabaseUrl !== supUrl || preferences.supabaseKey !== supKey;

    preferences.sound = soundVal;
    preferences.vibration = vibrateVal;
    preferences.supabaseUrl = supUrl;
    preferences.supabaseKey = supKey;

    window.StorageManager.savePreferences(preferences);
    
    if (vibrateVal) {
        triggerHaptic(15);
    }

    if (keysChanged) {
        console.log("Supabase connection credentials changed. Re-initializing...");
        const initialized = window.SupabaseManager.init();
        if (initialized) {
            window.UIManager.updateConnectionStatus('online');
            loadAllDataFromSupabase();
            window.SupabaseManager.subscribeToChanges(handleRealtimeDbUpdate);
        } else {
            window.UIManager.updateConnectionStatus('local');
            loadAllDataFromLocalStorage();
        }
    }
}

// ================= PRODUCT EDITING =================

/**
 * Add a new product to list from configuration panel
 * @param {Event} e Submit event
 */
function addNewProduct(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('new-name');
    const maxInput = document.getElementById('new-max');
    const minInput = document.getElementById('new-min');
    const unitSelect = document.getElementById('new-unit');
    const priceInput = document.getElementById('new-price');
    const costInput = document.getElementById('new-cost');
    const categorySelect = document.getElementById('new-category');

    const name = nameInput.value.trim();
    const max = parseInt(maxInput.value);
    const min = parseInt(minInput.value);
    const unit = unitSelect.value;
    const price = parseFloat(priceInput.value) || 0;
    const cost = parseFloat(costInput.value) || 0;
    const category = categorySelect.value;

    if (!name) return;

    triggerHaptic(15);

    const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');

    if (products.some(p => p.id === id)) {
        alert("Ya existe un producto con un nombre similar.");
        return;
    }

    const newProd = { id, name, stock: max, min, max, unit, price, cost, category, initial_stock: max };
    products.push(newProd);
    window.StorageManager.saveProducts(products);

    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.upsertProduct(newProd);
    }

    window.UIManager.renderSettingsProducts(products, editProductPrompt, deleteProduct);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
    
    document.getElementById('add-product-form').reset();
    window.UIManager.showToast(`✨ "${name}" agregado con éxito.`, "fa-solid fa-plus");
    logActivity("Producto Agregado", `Nuevo producto registrado: ${name} (Precio: $${price.toFixed(2)}, Max: ${max})`);
}

/**
 * Prompt to edit product limits, pricing, and category
 * @param {string} id Product identifier
 */
function editProductPrompt(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    triggerHaptic(15);

    document.getElementById('edit-prod-id').value = product.id;
    document.getElementById('edit-prod-name').value = product.name;
    document.getElementById('edit-prod-price').value = product.price !== undefined ? product.price : 1.50;
    document.getElementById('edit-prod-cost').value = product.cost !== undefined ? product.cost : 0;
    document.getElementById('edit-prod-category').value = product.category || 'pastelitos';
    document.getElementById('edit-prod-stock').value = product.stock !== undefined ? product.stock : 0;
    document.getElementById('edit-prod-max').value = product.max !== undefined ? product.max : 20;
    document.getElementById('edit-prod-min').value = product.min !== undefined ? product.min : 6;

    updateEditPriceBsPreview();

    document.getElementById('edit-product-modal').classList.remove('hidden');
}

function updateEditPriceBsPreview() {
    const priceEl = document.getElementById('edit-prod-price');
    const bsEl = document.getElementById('edit-prod-price-bs');
    if (priceEl && bsEl) {
        const price = parseFloat(priceEl.value) || 0;
        const rate = window.bcvRate || bcvRate || 1;
        const bsVal = price * rate;
        bsEl.innerHTML = `<i class="fa-solid fa-calculator" style="font-size: 9px;"></i> ≈ Bs. ${bsVal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

/**
 * Remove product from list
 * @param {string} id Product identifier
 */
function deleteProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    triggerHaptic(15);

    if (confirm(`¿Estás seguro de que quieres eliminar "${product.name}"?`)) {
        triggerHaptic(15);
        products = products.filter(p => p.id !== id);
        window.StorageManager.saveProducts(products);

        if (window.SupabaseManager.isConfigured()) {
            window.SupabaseManager.deleteProduct(id);
        }

        window.UIManager.renderSettingsProducts(products, editProductPrompt, deleteProduct);
        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
        window.UIManager.showToast("🗑️ Producto eliminado.", "fa-solid fa-trash");
        logActivity("Producto Eliminado", `Eliminado del menú: ${product.name}`);
    }
}

/**
 * Restores the inventory to the factory-default items and clears sales log
 */
function restoreDefaultProducts() {
    triggerHaptic(15);
    if (confirm("¿Estás seguro de reiniciar a los productos por defecto? Esto borrará tus cambios e historial de caja.")) {
        triggerHaptic(20);
        
        if (window.SupabaseManager.isConfigured()) {
            products.forEach(p => window.SupabaseManager.deleteProduct(p.id));
            salesLog.forEach(s => window.SupabaseManager.voidSale(s.uuid, "Restauración de productos por defecto"));
            expenses.forEach(e => window.SupabaseManager.deleteExpense(e.uuid));
            debts.forEach(d => window.SupabaseManager.deleteDebt(d.uuid));
            replenishments.forEach(r => window.SupabaseManager.deleteReplenishment(r.uuid));
        }

        products = window.StorageManager.resetToDefaults();
        ingredients = window.StorageManager.loadIngredients(); // reset ingredients too

        if (window.SupabaseManager.isConfigured()) {
            products.forEach(p => window.SupabaseManager.upsertProduct(p));
            ingredients.forEach(i => window.SupabaseManager.upsertIngredient(i));
        }

        salesLog = [];
        expenses = [];
        debts = [];
        replenishments = [];
        
        renderAllViews();
        
        window.UIManager.showToast("🔄 Sistema reiniciado con éxito.", "fa-solid fa-rotate-left");
    }
}

// ================= DATA SYNCHRONIZATION FROM CLOUD =================

// Tracks the last time data was actually confirmed fresh from Supabase (a
// full poll or a live realtime message), shown in Resumen so a stale device
// (screen locked/backgrounded, browser throttles its timers) is visibly
// distinguishable from a live one instead of silently showing an old number.
let lastSyncAt = null;

function markSyncFresh() {
    lastSyncAt = new Date();
    updateSyncFreshnessDisplay();
}

function updateSyncFreshnessDisplay() {
    const el = document.getElementById('resumen-last-sync');
    if (!el || !lastSyncAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - lastSyncAt.getTime()) / 1000));
    let text;
    if (seconds < 5) {
        text = 'justo ahora';
    } else if (seconds < 60) {
        text = `hace ${seconds}s`;
    } else {
        const minutes = Math.floor(seconds / 60);
        text = `hace ${minutes} min`;
    }
    el.innerHTML = `<i class="fa-solid fa-rotate"></i> Actualizado ${text}`;
}

/**
 * Loads today's records and stocks from Supabase database
 */
async function loadAllDataFromSupabase() {
    console.log("Loading dashboard statistics and logs from Supabase...");
    
    // 1. Fetch app configuration first (to get exchange rate, 2FA status, and day close timestamps)
    const supConfig = await window.SupabaseManager.fetchAppConfig();
    if (supConfig) {
        bcvRate = parseFloat(supConfig.bcv_rate) || 732.48;
        useAutoBcv = supConfig.use_auto_bcv !== false;
        window.bcvRate = bcvRate;
        window.StorageManager.saveBcvPreferences(bcvRate, useAutoBcv);


        // Load Day Close status
        if (window.SupabaseManager.getDbSupportsLastClose() && supConfig.last_close_time) {
            lastCloseTime = supConfig.last_close_time;
            window.StorageManager.saveLastCloseTime(lastCloseTime);
        } else {
            lastCloseTime = window.StorageManager.loadLastCloseTime();
        }

        // Sync DOM components
        const autoCheckbox = document.getElementById('pref-bcv-auto');
        const bcvRateInput = document.getElementById('pref-bcv-rate');
        const headerBcvInput = document.getElementById('header-bcv-rate-input');
        if (autoCheckbox) autoCheckbox.checked = useAutoBcv;
        if (bcvRateInput) {
            bcvRateInput.value = bcvRate;
            bcvRateInput.disabled = useAutoBcv;
        }
        if (headerBcvInput) headerBcvInput.value = bcvRate;

        // NOTE: the live BCV rate is NOT fetched here. This function runs on the
        // periodic background re-sync, and calling fetchBcvRate() on every cycle
        // meant two slow external API calls + (pre-guard) a full re-render every
        // time. The rate is refreshed on its own schedule: on app load, every
        // 6h, on tab-focus when >=6h stale, and on day close. Any rate another
        // device pushed is still picked up above via supConfig.bcv_rate.
    } else {
        lastCloseTime = window.StorageManager.loadLastCloseTime();
    }

    // 2. Fetch all other datasets in parallel to reduce network latency and roundtrips
    // (fetchUsers() used to run here too -- it always failed against a 'users'
    // table that doesn't exist (public.profiles replaced it), and its result
    // was discarded either way since supUsers was never truthy. Removed to
    // stop the guaranteed PGRST205 warning and wasted round-trip on every load.)
    const [supProducts, supSales, supExpenses, supDebts, supRepls, supIng, supPedidos] = await Promise.all([
        window.SupabaseManager.fetchProducts(),
        window.SupabaseManager.fetchSales(),
        window.SupabaseManager.fetchExpenses(),
        window.SupabaseManager.fetchDebts(),
        window.SupabaseManager.fetchReplenishments(),
        window.SupabaseManager.fetchIngredients(),
        window.SupabaseManager.fetchPedidosOnline()
    ]);

    if (supPedidos) {
        pedidosOnline = supPedidos;
    }

    // Save and load products (auto-merge missing default products like dulces)
    if (supProducts && supProducts.length > 0) {
        // Plan B, Task 6: a product with a stock_movement still queued locally
        // (not uploaded yet) hasn't had recompute_product_stock() run for it in
        // Postgres -- a refetch right now would read its old stock/max/
        // initial_stock and stomp the optimistic value already on screen with a
        // stale one (visible as the counter "jumping back"). This is a full
        // wholesale reassignment of `products`, not a per-field merge, so the
        // in-memory optimistic value has to be preserved explicitly here for
        // just those products, not just left alone.
        const previousProductsById = new Map(products.map(p => [p.id, p]));
        const pendingStockProductIds = window.SupabaseManager.getPendingStockMovementProductIds
            ? await window.SupabaseManager.getPendingStockMovementProductIds()
            : new Set();
        products = supProducts.map(p => {
            const merged = {
                ...p,
                category: window.StorageManager ? window.StorageManager.getProductCategory(p) : (p.category || 'pastelitos')
            };
            if (pendingStockProductIds.has(p.id)) {
                const prev = previousProductsById.get(p.id);
                if (prev) {
                    merged.stock = prev.stock;
                    merged.initial_stock = prev.initial_stock;
                    merged.max = prev.max;
                }
            }
            return merged;
        });
    } else {
        products = window.StorageManager.loadProducts();
    }

    window.StorageManager.saveProducts(products);
    
    // Save and load sales (merge local sales if any were saved offline or during schema mismatch)
    const deletedUuidsSet = new Set(window.StorageManager.loadDeletedSalesUuids() || []);
    const lastCloseDate = lastCloseTime ? window.parseUTCTimestamp(lastCloseTime) : null;

    const rawLocalSales = (window.StorageManager.loadSalesLog() || []).filter(s => !s.uuid || !deletedUuidsSet.has(s.uuid));
    const localSales = rawLocalSales.filter(s => {
        if (!s || !s.timestamp) return false;
        if (lastCloseDate) {
            try {
                return window.parseUTCTimestamp(s.timestamp) >= lastCloseDate;
            } catch (e) {
                return false;
            }
        }
        return true;
    });

    if (supSales && supSales.length > 0) {
        const cleanSupSales = supSales.filter(s => !s.uuid || !deletedUuidsSet.has(s.uuid));
        const supUuids = new Set(cleanSupSales.map(s => s.uuid));
        const missingLocal = localSales.filter(s => s.uuid && !supUuids.has(s.uuid));

        // A sale sitting in THIS device's cache but missing from the server
        // isn't always a failed offline write -- it can also be a row an
        // admin deliberately deleted server-side (a data correction). This
        // device has no local record of that: the delete tombstone above is
        // only written by handleUndoSale() on the SAME device that did the
        // undo. Blindly re-inserting every "missing" local row used to
        // resurrect a corrected/deleted account on its own every ~45s, on
        // any device that still had the old data cached, no matter how many
        // times it got cleaned up on the server (2026-08-14, "La guaira").
        //
        // Plan B, Task 12: this used to "corroborate" a gap against the old
        // offline queue's pending UUIDs before deciding whether to
        // auto-restore it -- that queue is gone now (insertSale/insertSales
        // write local-first straight into PowerSync's `sales` view, so
        // fetchSales() already includes anything this device wrote but
        // hasn't uploaded yet; supSales and localSales should only actually
        // diverge here in the narrow pre-first-sync window). Without a queue
        // left to corroborate against, treat every gap the same, safe way:
        // never silently re-insert, always quarantine for a human to review
        // ("Limpiar Caché" surfaces it). Losing a rare, real pending sale to
        // manual review is a far smaller failure than the old bug this
        // guarded against.
        salesLog = [...cleanSupSales];

        if (missingLocal.length > 0) {
            window.StorageManager.addQuarantinedSales(
                missingLocal,
                'Faltaba en el servidor tras la sincronización'
            );
            console.warn(`${missingLocal.length} local sale(s) missing from the server -- moved to quarantine for manual review.`, missingLocal.map(s => s.uuid));
        }
        window.StorageManager.saveSalesLog(salesLog);
    } else if (localSales.length > 0) {
        salesLog = localSales;
    } else {
        salesLog = [];
    }

    // Clean any temporary auto-injected test sales from salesLog and sanitize integrity
    salesLog = sanitizeDataIntegrity(salesLog.filter(s => !s.uuid || !s.uuid.startsWith('chica_')));
    window.StorageManager.saveSalesLog(salesLog);

    // Save and load expenses
    if (supExpenses) {
        expenses = supExpenses;
        window.StorageManager.saveExpenses(expenses);
    } else {
        expenses = window.StorageManager.loadExpenses();
    }

    // Save and load debts
    if (supDebts) {
        debts = supDebts;
        window.StorageManager.saveDebts(debts);
    } else {
        debts = window.StorageManager.loadDebts();
    }

    // Save and load replenishments (never resurrect a batch already loaded into
    // the vitrina -- its DELETE may not have committed before this fetch ran)
    const consumedRepls = new Set(window.StorageManager.loadConsumedReplenishmentUuids());
    if (supRepls) {
        replenishments = supRepls.filter(r => !consumedRepls.has(r.uuid));
        window.StorageManager.saveReplenishments(replenishments);
    } else {
        replenishments = window.StorageManager.loadReplenishments().filter(r => !consumedRepls.has(r.uuid));
    }

    // Save and load raw ingredients
    if (supIng && supIng.length > 0) {
        ingredients = supIng;
        window.StorageManager.saveIngredients(ingredients);
    } else {
        ingredients = window.StorageManager.loadIngredients();
    }

    renderAllViews();
    markSyncFresh();
}

/**
 * Fallback to standard offline localStorage values
 */
function loadAllDataFromLocalStorage() {
    products = window.StorageManager.loadProducts();
    salesLog = window.StorageManager.loadSalesLog();
    expenses = window.StorageManager.loadExpenses();
    debts = window.StorageManager.loadDebts();
    replenishments = window.StorageManager.loadReplenishments();
    ingredients = window.StorageManager.loadIngredients();
    
    const bcvPrefs = window.StorageManager.loadBcvPreferences();
    bcvRate = bcvPrefs.bcvRate || 732.48;
    useAutoBcv = bcvPrefs.useAutoBcv !== false;
    window.bcvRate = bcvRate;
    


    // Load last close time from localStorage
    lastCloseTime = window.StorageManager.loadLastCloseTime();

    renderAllViews();
}

async function loadAndRenderAdminStats() {
    if (currentRole !== 'admin') return;

    // Se dispara ya mismo, en paralelo con todo lo demás: fetchActivityLogs()
    // ya trae su propio fallback a localStorage si no hay Supabase configurado
    // o si la red falla, así que no depende de la rama online de abajo y no
    // vale la pena bloquear el resto del render esperándolo.
    const recentActivityPromise = window.SupabaseManager.fetchActivityLogs();

    let statsSales = salesLog;
    let statsExpenses = expenses;
    // Arranca en false y solo sube si el fetch responde: offline, `statsSales`
    // sigue siendo el turno local y los deltas quedan ocultos en vez de mentir.
    let gotFullHistory = false;
    // Gastos de la semana tal como llegaron de Supabase. Se guarda aparte de
    // `statsExpenses` porque abajo ese puede quedarse con el dato local si la
    // semana no tuvo gastos, y para el delta necesitamos saber la diferencia
    // entre "no hubo gastos" y "no tengo el historial".
    let weekExpenses = null;

    if (window.SupabaseManager.isConfigured() && navigator.onLine) {
        try {
            const data = await window.SupabaseManager.fetchStatsData();
            if (data && Array.isArray(data.sales)) {
                // Merge Supabase stats data with local salesLog to ensure 100% of sales are captured
                const supUuids = new Set(data.sales.map(s => s.uuid));
                const localUnsynced = salesLog.filter(s => s.uuid && !supUuids.has(s.uuid));
                statsSales = [...data.sales, ...localUnsynced];
                gotFullHistory = true;
                if (Array.isArray(data.expenses)) {
                    const supExpUuids = new Set(data.expenses.map(e => e.uuid));
                    const localExpUnsynced = expenses.filter(e => e.uuid && !supExpUuids.has(e.uuid));
                    weekExpenses = [...data.expenses, ...localExpUnsynced];
                }
                if (data.expenses && data.expenses.length > 0) {
                    statsExpenses = weekExpenses;
                }
            }
        } catch(e) {
            console.error("Failed to load historical stats from Supabase", e);
        }
    }

    // Cache statsSales globally for toggle rendering
    adminStatsSales = statsSales;
    adminStatsExpenses = weekExpenses || statsExpenses;
    adminStatsFullHistory = gotFullHistory;
    loadAndRenderUsersManagement();
    window.UIManager.renderStats(statsSales, statsExpenses, products, {
        fullHistory: gotFullHistory,
        deltaExpenses: adminStatsExpenses
    });
    window.UIManager.renderHourlyStats(adminStatsSales, hourlyActiveMode);
    window.UIManager.renderCriticalStockAlerts(products, handleQuickReplenishment);
    window.UIManager.renderPaymentAndCategoryStats(statsSales, products, paymentStatsFilter, categoryStatsFilter);

    try {
        window.UIManager.renderRecentActivity(await recentActivityPromise);
    } catch (e) {
        console.error("Failed to load recent activity for Resumen", e);
    }
}

/**
 * Load (or reuse the cached) sales history for the "Análisis" tab and
 * render it. Fetches lazily -- only when the tab is first opened, the
 * range toggle changes to an uncached value, or the user hits Refrescar --
 * to avoid pulling months of sales on every dashboard load.
 * @param {boolean} forceRefetch Bypass the cache for the current range
 */
async function loadAndRenderAnalytics(forceRefetch = false) {
    if (currentRole !== 'admin') return;

    const container = document.getElementById('admin-analytics-container');
    const hasCached = Array.isArray(analyticsSalesCache[analyticsRangeDays]);

    if (forceRefetch) delete analyticsSalesCache[analyticsRangeDays];

    if (!hasCached || forceRefetch) {
        if (container) {
            container.innerHTML = `<div style="font-size: 0.85rem; color: var(--color-text-muted); text-align: center; padding: 1.5rem 0;">Cargando historial de ventas...</div>`;
        }
        if (window.SupabaseManager.isConfigured() && navigator.onLine) {
            try {
                analyticsSalesCache[analyticsRangeDays] = await window.SupabaseManager.fetchSalesHistory(analyticsRangeDays);
            } catch (e) {
                console.error("Failed to load sales history for analytics", e);
                analyticsSalesCache[analyticsRangeDays] = [];
            }
        } else {
            // Offline / not configured: fall back to whatever is already in
            // memory (the current operational window, not the requested
            // range) -- the toast is what keeps a shorter/emptier-than-
            // expected chart from reading as "poco se vendió" instead of
            // "no se pudo traer el historial completo".
            requireOnline('El historial completo de Análisis');
            analyticsSalesCache[analyticsRangeDays] = salesLog;
        }
    }

    const salesHistory = analyticsSalesCache[analyticsRangeDays] || [];
    const targetWeekday = getAnalyticsPrepWeekday();
    const targetLabel = analyticsPrepMode === 'tomorrow' ? 'Mañana' : 'Hoy';
    window.UIManager.renderSalesAnalytics(salesHistory, products, targetWeekday, targetLabel);
}

async function loadAndRenderUsersManagement() {
    systemUsers = window.StorageManager ? window.StorageManager.loadUsers() : [];
    
    let supabaseProfiles = null;
    let profilesFetchFailed = false;
    if (window.SupabaseManager && window.SupabaseManager.isConfigured() && navigator.onLine) {
        try {
            supabaseProfiles = await window.SupabaseManager.fetchProfiles();
            if (supabaseProfiles === null) {
                profilesFetchFailed = true;
            } else {
                // profiles is the real source of truth now (see signUpNewUser /
                // setProfileActive) -- keep a local cache so the panel still
                // shows something sensible while offline, instead of whatever
                // was left over from the old localStorage-only user flow.
                systemUsers = supabaseProfiles;
                if (window.StorageManager) window.StorageManager.saveUsers(systemUsers);
            }
        } catch (e) {
            console.error("Failed to fetch Supabase profiles:", e);
            profilesFetchFailed = true;
        }
    }

    window.UIManager.renderUsersManagement(
        systemUsers,
        (userToEdit) => openUserModal(userToEdit),
        (userIdToDeactivate) => deactivateUserHandler(userIdToDeactivate)
    );

    const userSelect = document.getElementById('select-admin-target-user');
    if (userSelect) {
        const displayUsers = (supabaseProfiles && supabaseProfiles.length > 0) ? supabaseProfiles : systemUsers;
        if (displayUsers && displayUsers.length > 0) {
            userSelect.innerHTML = displayUsers.map(u => {
                // Label the role the user actually has, not one guessed from
                // their username -- mislabelling here is how an admin picks
                // the wrong account when assigning a PIN.
                const roleKey = (u.role || '').toLowerCase();
                const roleLabel = roleKey === 'admin' ? 'Admin' : (roleKey === 'cocina' ? 'Cocina' : 'Ventas');
                const displayName = u.name || u.username;
                return `<option value="${u.id}">${displayName} (${roleLabel})</option>`;
            }).join('');
        } else if (profilesFetchFailed) {
            // Distinguish "the fetch failed" from "there are genuinely zero
            // users" -- this used to silently show "No hay usuarios" (or get
            // stuck on the HTML's "Cargando usuarios..." placeholder) with no
            // indication that the real problem was a dead/expired session,
            // not an empty staff list. Re-entering via quick PIN instead of a
            // full login is the most common way the Supabase Auth session
            // goes stale mid-shift.
            userSelect.innerHTML = `<option value="">⚠️ No se pudo cargar -- volvé a iniciar sesión completa</option>`;
        } else {
            userSelect.innerHTML = `<option value="">No hay usuarios</option>`;
        }
    }
}

function openUserModal(user = null) {
    const modal = document.getElementById('user-modal');
    if (!modal) return;

    const usernameInput = document.getElementById('user-modal-username');
    const usernameNote = document.getElementById('user-modal-username-note');
    const passwordField = document.getElementById('user-modal-password-field');
    const passwordNote = document.getElementById('user-modal-password-note');
    const passwordInput = document.getElementById('user-modal-password');

    document.getElementById('user-modal-title').textContent = user ? '✏️ Editar Usuario' : '➕ Nuevo Usuario';
    document.getElementById('user-modal-id').value = user ? user.id : '';
    document.getElementById('user-modal-name').value = user ? (user.name || '') : '';
    document.getElementById('user-modal-username').value = user ? (user.username || '') : '';
    document.getElementById('user-modal-role').value = user ? user.role : 'venta';

    passwordInput.value = '';
    // A real password can't be shown back (it's never stored anywhere this
    // app can read it) and can't be changed for an existing account without
    // a service-role Admin API call, which a browser-only client doesn't
    // have. Editing is name/role only; creating still needs a password.
    const isEditing = !!user;
    usernameInput.readOnly = isEditing;
    usernameNote.classList.toggle('hidden', !isEditing);
    passwordField.classList.toggle('hidden', isEditing);
    passwordInput.required = !isEditing;
    passwordNote.classList.toggle('hidden', !isEditing);

    modal.classList.remove('hidden');
}

function closeUserModal() {
    const modal = document.getElementById('user-modal');
    if (modal) modal.classList.add('hidden');
}

async function deactivateUserHandler(id) {
    if (!confirm("¿Desactivar este usuario? No va a poder iniciar sesión hasta que lo reactives.")) return;
    if (!window.SupabaseManager.isConfigured()) {
        window.UIManager.showToast("⚠️ Conexión con Supabase no disponible.", "fa-solid fa-wifi");
        return;
    }
    const ok = await window.SupabaseManager.setProfileActive(id, false);
    if (ok) {
        window.UIManager.showToast("🚫 Usuario desactivado.", "fa-solid fa-user-slash");
        logActivity("Usuario Desactivado", `Usuario ${id} desactivado por admin`);
    } else {
        window.UIManager.showToast("❌ No se pudo desactivar el usuario.", "fa-solid fa-circle-xmark");
    }
    loadAndRenderUsersManagement();
}

/**
 * Triggers rendering for all active templates
 */
function renderAllViews() {
    window.UIManager.renderSearchBar(handleSearchChange);
    window.UIManager.renderCategoryFilterBar(activeCategory, handleCategoryChange, products);
    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
    window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
    window.UIManager.renderPendingDispatches(replenishments, confirmReceipt);
    window.UIManager.renderCashRegister(salesLog, expenses);
    window.UIManager.renderSalesHistory(salesLog, handleUndoSale, handleEditSale);
    window.UIManager.renderClientesView(salesLog, handleUndoSale, handleEditSale, markTransactionAsPaid, products);
    window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);

    window.UIManager.renderExpenses(expenses, deleteExpense);
    window.UIManager.renderDebts(debts, settleDebtPayment);
    window.UIManager.renderIngredientsPantry(ingredients, addIngredientStock);

    if (currentRole === 'admin' || currentRole === 'local') {
        window.UIManager.renderPedidosOnline(pedidosOnline, handleConfirmPedido, handleRechazarPedido);
        window.UIManager.updatePedidosBadge(pedidosOnline);
    }

    if (currentRole === 'admin') {
        loadAndRenderAdminStats();
        updateAdminDashboard();
    }
    if (window.InventoryManager && window.InventoryManager.updateLowStockUI) {
        window.InventoryManager.updateLowStockUI(products, ingredients, currentRole);
    }
}

/**
 * Handle real-time PostgreSQL updates, syncing memory state and re-rendering grids
 * @param {string} tableName Updated table key
 */
async function handleRealtimeDbUpdate(tableName, payload) {
    console.log(`Realtime postgres update detected for table: ${tableName}`, payload);
    markSyncFresh();

    // Fallback: If no payload is supplied, perform standard full fetch
    if (!payload || !payload.eventType) {
        performFullFetch(tableName);
        return;
    }

    const { eventType, new: newRow, old: oldRow } = payload;

    if (tableName === 'products') {
        if (eventType === 'DELETE') {
            products = products.filter(p => p.id !== oldRow.id);
        } else {
            const idx = products.findIndex(p => p.id === newRow.id);
            const formatted = {
                id: newRow.id,
                name: newRow.name,
                stock: parseInt(newRow.stock),
                min: parseInt(newRow.min),
                max: parseInt(newRow.max),
                unit: newRow.unit,
                price: parseFloat(newRow.price) || 0,
                cost: parseFloat(newRow.cost) || 0,
                category: newRow.category || 'pastelitos',
                initial_stock: (newRow.initial_stock !== null && newRow.initial_stock !== undefined) ? parseInt(newRow.initial_stock) : parseInt(newRow.stock)
            };
            if (idx !== -1) {
                products[idx] = formatted;
            } else {
                products.push(formatted);
            }
        }
        window.StorageManager.saveProducts(products);
        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
        window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
        window.UIManager.updateKitchenBadge(products);
        window.UIManager.renderClientesView(salesLog, handleUndoSale, handleEditSale, markTransactionAsPaid, products);
        if (currentRole === 'admin') {
            window.UIManager.renderCriticalStockAlerts(products, handleQuickReplenishment);
        }
    } else if (tableName === 'sales') {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        const filterTime = lastCloseTime ? window.parseUTCTimestamp(lastCloseTime) : startOfDay;

        if (eventType === 'DELETE' || (newRow && newRow.voided_at)) {
            // Plan B, Task 7: a voided sale (spec §5.2) must vanish from the
            // register/reports exactly like the DELETE this used to only
            // handle -- without this check the row stayed patched into
            // salesLog with voided_at set but nothing here ever looks at
            // that field, so it would keep counting toward totals forever.
            const uuidToRemove = eventType === 'DELETE' ? oldRow.uuid : newRow.uuid;
            salesLog = salesLog.filter(s => s.uuid !== uuidToRemove);
        } else {
            const saleDate = window.parseUTCTimestamp(newRow.timestamp);
            if (saleDate >= filterTime) {
                const idx = salesLog.findIndex(s => s.uuid === newRow.uuid);
                const formatted = {
                    uuid: newRow.uuid,
                    productId: newRow.product_id,
                    name: newRow.name,
                    price: parseFloat(newRow.price) || 0,
                    cost_at_sale: (newRow.cost_at_sale !== null && newRow.cost_at_sale !== undefined) ? parseFloat(newRow.cost_at_sale) : null,
                    bcv_rate: (newRow.bcv_rate !== null && newRow.bcv_rate !== undefined) ? parseFloat(newRow.bcv_rate) : null,
                    timestamp: newRow.timestamp
                };
                if (idx !== -1) {
                    salesLog[idx] = formatted;
                } else {
                    salesLog.push(formatted);
                }
            }
        }
        window.StorageManager.saveSalesLog(salesLog);
        pnlCache = {}; // an incoming sale changes P&L numbers — force a refetch on next tab open / refresh
        window.UIManager.renderCashRegister(salesLog, expenses);
        window.UIManager.renderSalesHistory(salesLog, handleUndoSale);
        window.UIManager.renderClientesView(salesLog, handleUndoSale, handleEditSale, markTransactionAsPaid, products);
        if (currentRole === 'admin') {
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
                const statFormatted = {
                    uuid: newRow.uuid,
                    productId: newRow.product_id,
                    name: newRow.name,
                    price: parseFloat(newRow.price) || 0,
                    timestamp: newRow.timestamp
                };
                const idx = adminStatsSales.findIndex(s => (s.uuid && s.uuid === statFormatted.uuid) || (s.timestamp === statFormatted.timestamp && s.productId === statFormatted.productId));
                if (idx !== -1) {
                    adminStatsSales[idx] = statFormatted;
                } else {
                    adminStatsSales.push(statFormatted);
                }
            } else if (eventType === 'DELETE') {
                adminStatsSales = adminStatsSales.filter(s => s.uuid !== oldRow.uuid && s.timestamp !== oldRow.timestamp);
            }
            // `expenses` (turno actual) se mantiene como tercer argumento para
            // no alterar los totales que ya pintaba; el delta usa el cache de
            // la semana vía `deltaExpenses`.
            window.UIManager.renderStats(adminStatsSales, expenses, products, {
                fullHistory: adminStatsFullHistory,
                deltaExpenses: adminStatsExpenses
            });
            window.UIManager.renderHourlyStats(adminStatsSales, hourlyActiveMode);
            window.UIManager.renderPaymentAndCategoryStats(adminStatsSales, products, paymentStatsFilter, categoryStatsFilter);
        }
    } else if (tableName === 'expenses') {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        const filterTime = lastCloseTime ? window.parseUTCTimestamp(lastCloseTime) : startOfDay;

        // Any categorized expense (arriendo/sueldos/servicios/otros/…) is logged
        // from the Ganancias/Gastos admin tab and belongs only to the P&L —
        // it must never enter the shift ledger on any device (the cash register /
        // day-close is currency-blind and would mis-count a Bs row as USD).
        // Only the counter quick-expense, which carries NO category, flows through.
        const inboundCat = (newRow && newRow.category ? String(newRow.category).toLowerCase() : '');
        if (eventType !== 'DELETE' && inboundCat !== '') {
            return;
        }

        if (eventType === 'DELETE') {
            expenses = expenses.filter(e => e.uuid !== oldRow.uuid);
        } else {
            const expDate = window.parseUTCTimestamp(newRow.timestamp);
            if (expDate > filterTime) {
                const idx = expenses.findIndex(e => e.uuid === newRow.uuid);
                const formatted = {
                    uuid: newRow.uuid,
                    description: newRow.description,
                    amount: parseFloat(newRow.amount) || 0,
                    timestamp: newRow.timestamp
                };
                if (idx !== -1) {
                    expenses[idx] = formatted;
                } else {
                    expenses.push(formatted);
                }
            }
        }
        window.StorageManager.saveExpenses(expenses);
        window.UIManager.renderCashRegister(salesLog, expenses);
        window.UIManager.renderExpenses(expenses, deleteExpense);
        if (currentRole === 'admin') {
            // Mismo patrón que la rama `sales` de este handler: sin `opts`, un
            // evento de gasto en tiempo real ocultaba los chips de delta (recién
            // agregados) y volvía a los totales locales del turno en vez del
            // cache semanal, haciendo que las cifras "parpadearan" según qué
            // tabla disparó el último evento.
            window.UIManager.renderStats(adminStatsSales, expenses, products, {
                fullHistory: adminStatsFullHistory,
                deltaExpenses: adminStatsExpenses
            });
        }
    } else if (tableName === 'debts') {
        if (eventType === 'DELETE') {
            debts = debts.filter(d => d.uuid !== oldRow.uuid);
        } else {
            const idx = debts.findIndex(d => d.uuid === newRow.uuid);
            const formatted = {
                uuid: newRow.uuid,
                clientName: newRow.client_name,
                amount: parseFloat(newRow.amount) || 0,
                description: newRow.description,
                timestamp: newRow.timestamp
            };
            if (idx !== -1) {
                debts[idx] = formatted;
            } else {
                debts.push(formatted);
            }
        }
        window.StorageManager.saveDebts(debts);
        window.UIManager.renderDebts(debts, settleDebtPayment);
    } else if (tableName === 'replenishments') {
        if (eventType === 'DELETE') {
            replenishments = replenishments.filter(r => r.uuid !== oldRow.uuid);
        } else if (!window.StorageManager.loadConsumedReplenishmentUuids().includes(newRow.uuid)) {
            const idx = replenishments.findIndex(r => r.uuid === newRow.uuid);
            const formatted = {
                uuid: newRow.uuid,
                productId: newRow.product_id,
                name: newRow.name,
                amount: parseInt(newRow.amount),
                unit: newRow.unit,
                status: newRow.status,
                timestamp: newRow.timestamp
            };
            if (idx !== -1) {
                replenishments[idx] = formatted;
            } else {
                replenishments.push(formatted);
            }
        }
        window.StorageManager.saveReplenishments(replenishments);
        window.UIManager.renderPendingDispatches(replenishments, confirmReceipt);
        window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
    } else if (tableName === 'ingredients') {
        if (eventType === 'DELETE') {
            ingredients = ingredients.filter(i => i.id !== oldRow.id);
        } else {
            const idx = ingredients.findIndex(i => i.id === newRow.id);
            const formatted = {
                id: newRow.id,
                name: newRow.name,
                stock: parseFloat(newRow.stock) || 0,
                unit: newRow.unit
            };
            if (idx !== -1) {
                ingredients[idx] = formatted;
            } else {
                ingredients.push(formatted);
            }
        }
        window.StorageManager.saveIngredients(ingredients);
        window.UIManager.renderIngredientsPantry(ingredients, addIngredientStock);
    } else if (tableName === 'app_config') {
        if (newRow) {
            // Check if last_close_time changed
            if (newRow.last_close_time && newRow.last_close_time !== lastCloseTime) {
                console.log("Detecting Day Close event from another device. Clearing local sales and reloading data across all devices...");
                lastCloseTime = newRow.last_close_time;
                window.StorageManager.saveLastCloseTime(lastCloseTime);
                
                salesLog = [];
                expenses = [];
                window.StorageManager.clearSalesLog();
                window.StorageManager.clearExpenses();

                await loadAllDataFromSupabase();
                renderAllViews();

                window.UIManager.showToast("🔔 Cierre de caja realizado por Administrador. Caja en $0.00.", "fa-solid fa-bell");
                return;
            }

            const incomingBcvRate = parseFloat(newRow.bcv_rate) || 732.48;
            const bcvRateChanged = incomingBcvRate !== bcvRate;
            bcvRate = incomingBcvRate;
            useAutoBcv = newRow.use_auto_bcv !== false;
            window.bcvRate = bcvRate;
            if (bcvRateChanged) {
                bcvLastFetchTime = new Date().toISOString();
                window.StorageManager.saveBcvLastFetch(bcvLastFetchTime);
            }
            window.StorageManager.saveBcvPreferences(bcvRate, useAutoBcv);

            // Sync DOM components
            const autoCheckbox = document.getElementById('pref-bcv-auto');
            const bcvRateInput = document.getElementById('pref-bcv-rate');
            if (autoCheckbox) autoCheckbox.checked = useAutoBcv;
            if (bcvRateInput) {
                bcvRateInput.value = bcvRate;
                bcvRateInput.disabled = useAutoBcv;
            }
            updateBcvHeaderDisplay();

            // Re-render all views
            window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
            window.UIManager.renderCashRegister(salesLog, expenses);
            window.UIManager.renderSalesHistory(salesLog, handleUndoSale);
            window.UIManager.renderDebts(debts, settleDebtPayment);
            window.UIManager.renderQuickConversionTable();
        }
    } else if (tableName === 'active_sessions') {
        const targetId = eventType === 'DELETE' ? (oldRow ? oldRow.device_id : null) : (newRow ? newRow.device_id : null);
        
        if (targetId === myDeviceId) {
            if (eventType === 'DELETE' || (newRow && newRow.is_blocked)) {
                console.warn("My session was deleted or blocked by administrator. Logging out...");
                window.UIManager.showToast("🚫 Tu sesión ha sido cerrada por el administrador.", "fa-solid fa-lock");
                lockSession();
            }
        }
        
        // Re-render the active devices list if currently open
        const listDiv = document.getElementById('settings-devices-list');
        if (listDiv && !document.getElementById('view-admin-dashboard').classList.contains('hidden')) {
            loadAndRenderActiveDevices();
        }
    } else if (tableName === 'pedidos_online') {
        if (eventType === 'DELETE') {
            pedidosOnline = pedidosOnline.filter(p => p.id !== oldRow.id);
        } else {
            const idx = pedidosOnline.findIndex(p => p.id === newRow.id);
            if (idx !== -1) {
                pedidosOnline[idx] = newRow;
            } else {
                pedidosOnline.unshift(newRow);
                if ((currentRole === 'admin' || currentRole === 'local') && newRow.status === 'pendiente') {
                    window.UIManager.showToast(`🛍️ Nuevo pedido online de ${newRow.customer_name} ($${Number(newRow.total).toFixed(2)})`, "fa-solid fa-bag-shopping");
                }
            }
        }
        if (currentRole === 'admin' || currentRole === 'local') {
            window.UIManager.renderPedidosOnline(pedidosOnline, handleConfirmPedido, handleRechazarPedido);
            window.UIManager.updatePedidosBadge(pedidosOnline);
        }
    }
}

/**
 * Fallback full-fetch logic if real-time payloads fail or sync starts
 */
async function performFullFetch(tableName) {
    // subscribeToChanges() calls onDbChange('all', null) after it re-establishes
    // a dropped realtime channel, to resync whatever was missed while the socket
    // was down. There was no 'all' branch, so that resync silently did nothing
    // and the device stayed stale until the next 45s poll. Route it through the
    // same loader the startup path uses -- it already merges safely against the
    // offline queues rather than clobbering local state.
    if (tableName === 'all') {
        await loadAllDataFromSupabase();
        return;
    }

    if (tableName === 'products') {
        const data = await window.SupabaseManager.fetchProducts();
        if (data) {
            products = data;
            window.StorageManager.saveProducts(products);
            window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
            window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
            window.UIManager.updateKitchenBadge(products);
        }
    } else if (tableName === 'sales') {
        const data = await window.SupabaseManager.fetchSales();
        if (data) {
            salesLog = data;
            window.StorageManager.saveSalesLog(salesLog);
            window.UIManager.renderCashRegister(salesLog, expenses);
            window.UIManager.renderSalesHistory(salesLog, handleUndoSale);
            if (currentRole === 'admin') {
                window.UIManager.renderStats(salesLog, expenses);
            }
        }
    } else if (tableName === 'expenses') {
        const data = await window.SupabaseManager.fetchExpenses();
        if (data) {
            expenses = data;
            window.StorageManager.saveExpenses(expenses);
            window.UIManager.renderCashRegister(salesLog, expenses);
            window.UIManager.renderExpenses(expenses, deleteExpense);
            if (currentRole === 'admin') {
                window.UIManager.renderStats(salesLog, expenses);
            }
        }
    } else if (tableName === 'debts') {
        const data = await window.SupabaseManager.fetchDebts();
        if (data) {
            debts = data;
            window.StorageManager.saveDebts(debts);
            window.UIManager.renderDebts(debts, settleDebtPayment);
        }
    } else if (tableName === 'replenishments') {
        const data = await window.SupabaseManager.fetchReplenishments();
        if (data) {
            const consumed = new Set(window.StorageManager.loadConsumedReplenishmentUuids());
            replenishments = data.filter(r => !consumed.has(r.uuid));
            window.StorageManager.saveReplenishments(replenishments);
            window.UIManager.renderPendingDispatches(replenishments, confirmReceipt);
            window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
        }
    } else if (tableName === 'ingredients') {
        const data = await window.SupabaseManager.fetchIngredients();
        if (data) {
            ingredients = data;
            window.StorageManager.saveIngredients(ingredients);
            window.UIManager.renderIngredientsPantry(ingredients, addIngredientStock);
        }
    } else if (tableName === 'app_config') {
        const data = await window.SupabaseManager.fetchAppConfig();
        if (data) {
            const incomingBcvRate = parseFloat(data.bcv_rate) || 732.48;
            const bcvRateChanged = incomingBcvRate !== bcvRate;
            bcvRate = incomingBcvRate;
            useAutoBcv = data.use_auto_bcv !== false;
            window.bcvRate = bcvRate;
            if (bcvRateChanged) {
                bcvLastFetchTime = new Date().toISOString();
                window.StorageManager.saveBcvLastFetch(bcvLastFetchTime);
            }
            window.StorageManager.saveBcvPreferences(bcvRate, useAutoBcv);

            // Sync custom security PINs
            if (data.pin_local) {
                pinLocal = data.pin_local;
                localStorage.setItem('casa_lucenzo_pin_local', pinLocal);
                const pinLocalInput = document.getElementById('pref-pin-local');
                if (pinLocalInput) pinLocalInput.value = pinLocal;
            }
            if (data.pin_cocina) {
                pinCocina = data.pin_cocina;
                localStorage.setItem('casa_lucenzo_pin_cocina', pinCocina);
                const pinCocinaInput = document.getElementById('pref-pin-cocina');
                if (pinCocinaInput) pinCocinaInput.value = pinCocina;
            }
            if (data.pin_admin) {
                pinAdmin = data.pin_admin;
                localStorage.setItem('casa_lucenzo_pin_admin', pinAdmin);
                const pinAdminInput = document.getElementById('pref-pin-admin');
                if (pinAdminInput) pinAdminInput.value = pinAdmin;
            }

            // Sync DOM components
            const autoCheckbox = document.getElementById('pref-bcv-auto');
            const bcvRateInput = document.getElementById('pref-bcv-rate');
            if (autoCheckbox) autoCheckbox.checked = useAutoBcv;
            if (bcvRateInput) {
                bcvRateInput.value = bcvRate;
                bcvRateInput.disabled = useAutoBcv;
            }
            updateBcvHeaderDisplay();

            // Re-render
            window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
            window.UIManager.renderCashRegister(salesLog, expenses);
            window.UIManager.renderSalesHistory(salesLog, handleUndoSale);
            window.UIManager.renderDebts(debts, settleDebtPayment);
            window.UIManager.renderQuickConversionTable();
        }
    }
}

/**
 * Helper to log role activity both to Supabase and locally
 * @param {string} action Action description
 * @param {string} details Extra info details
 */
function logActivity(action, details) {
    const role = currentRole || 'local';
    const actorName = currentUser ? currentUser.name : null;
    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.insertActivityLog(role, action, details, actorName);
    } else {
        // Just save locally
        try {
            const localLogs = JSON.parse(localStorage.getItem('casa_lucenzo_local_activity_logs') || '[]');
            localLogs.push({
                role: role,
                action: action,
                details: details || '',
                actor_name: actorName,
                timestamp: new Date().toISOString()
            });
            if (localLogs.length > 100) localLogs.shift();
            localStorage.setItem('casa_lucenzo_local_activity_logs', JSON.stringify(localLogs));
        } catch(e) {
            console.error("Local log failed", e);
        }
    }
}

// ================= USER ROLES ACCESS =================

let failedPinAttempts = 0;
let lockoutUntil = 0;
let lockoutCountdownInterval = null;
let adminInactivityTimer = null;
const ADMIN_INACTIVITY_MS = 3 * 60 * 1000; // 3 minutes for Admin auto-lock

/**
 * Resets or clears the inactivity auto-lock timer for Admin role
 */
function resetInactivityTimer() {
    if (adminInactivityTimer) clearTimeout(adminInactivityTimer);
    
    if (currentRole === 'admin') {
        adminInactivityTimer = setTimeout(() => {
            if (currentRole === 'admin') {
                window.UIManager.showToast("🔒 Sesión de Administrador cerrada por inactividad (3 min).", "fa-solid fa-lock");
                logActivity("Cierre Inactividad", "Sesión de Administrador cerrada tras 3 minutos sin interacción");
                lockSession();
            }
        }, ADMIN_INACTIVITY_MS);
    }
}

// Bind global activity listeners once
['touchstart', 'mousedown', 'mousemove', 'keydown', 'scroll', 'click'].forEach(evt => {
    window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

/**
 * Updates the UI lockout banner during penalty block.
 * @param {string} [userId] Plan B, Task 10: when given, reads the per-user
 *   persisted PIN lockout (js/storage.js) instead of the global
 *   lockoutUntil handleUserLogin() uses -- a full password login is
 *   inherently online-only, so that one keeps its own separate counter,
 *   untouched by this task.
 */
function updateLockoutUI(userId) {
    const banner = document.getElementById('pin-lockout-banner');
    if (!banner) return;

    const now = Date.now();
    const until = userId ? (window.StorageManager.loadPinLockoutState(userId).lockedUntil || 0) : lockoutUntil;
    if (now < until) {
        const remainingSec = Math.ceil((until - now) / 1000);
        banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Acceso bloqueado por ${remainingSec}s por múltiples intentos fallidos.`;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        if (lockoutCountdownInterval) {
            clearInterval(lockoutCountdownInterval);
            lockoutCountdownInterval = null;
        }
    }
}

let systemUsers = window.StorageManager ? window.StorageManager.loadUsers() : [];
let currentUser = null;

/**
 * Validates User & Password input credentials and applies corresponding role UI layout
 * @param {string} username Username or legacy PIN
 * @param {string} password Password string
 * @returns {boolean} True if login successful
 */
async function handleUserLogin(username, password) {
    const now = Date.now();
    if (now < lockoutUntil) {
        const remainingSec = Math.ceil((lockoutUntil - now) / 1000);
        triggerHaptic([80, 80]);
        window.UIManager.showToast(`⛔ Sistema bloqueado por seguridad. Espera ${remainingSec}s.`, "fa-solid fa-ban");
        updateLockoutUI();
        return false;
    }

    const rawUser = (username || '').trim();
    const rawPass = (password || '').trim();
    const cleanUser = rawUser.toLowerCase();
    const cleanPass = rawPass;

    let matchedUser = null;

    // Authentication strictly via Supabase Auth
    if (window.SupabaseManager && window.SupabaseManager.isConfigured()) {
        try {
            const { user, profile, error } = await window.SupabaseManager.signInUser(cleanUser, cleanPass);
            if (error) console.warn("Supabase Auth rejected the sign-in:", error.message || error);
            if (user && profile) {
                matchedUser = profile;
            }
        } catch (e) {
            console.warn("Supabase Auth sign-in failed:", e);
        }
    }

    if (matchedUser && matchedUser.active !== false) {
        failedPinAttempts = 0;
        currentUser = matchedUser;
        sessionStorage.setItem('casa_lucenzo_active_user', JSON.stringify(currentUser));
        localStorage.setItem('casa_lucenzo_active_user', JSON.stringify(currentUser));
        
        const mappedRole = matchedUser.role === 'admin' ? 'admin' : (matchedUser.role === 'cocina' ? 'cocina' : 'local');
        applyUserRole(mappedRole);

        // Plan B, Task 3 Step 3: PowerSync needs the Supabase session that
        // just got created above (fetchCredentials reads it). Best-effort,
        // fire-and-forget -- login must not wait on the initial sync
        // handshake, and nothing reads from PowerSync yet (Task 4+), so a
        // failure here has no user-visible effect today.
        if (window.PowerSyncManager) {
            window.PowerSyncManager.connect().catch(e => {
                console.warn("PowerSync connect() failed after login:", e);
            });
        }

        window.UIManager.showToast(`🔓 ¡Bienvenido/a, ${matchedUser.name}!`, "fa-solid fa-user-check");
        logActivity("Inicio de Sesión", `Ingreso de ${matchedUser.name} (${matchedUser.username}) al perfil ${mappedRole.toUpperCase()}`);
        return true;
    } else {
        failedPinAttempts++;
        triggerHaptic([80, 80]);

        if (failedPinAttempts >= 3) {
            lockoutUntil = Date.now() + 60000;
            failedPinAttempts = 0;
            window.UIManager.showToast("⛔ 3 intentos fallidos. Sistema bloqueado por 60 segundos.", "fa-solid fa-triangle-exclamation");
            logActivity("Seguridad Alerta", `Intento fallido de inicio de sesión para usuario "${cleanUser}"`);
            
            updateLockoutUI();
            if (lockoutCountdownInterval) clearInterval(lockoutCountdownInterval);
            lockoutCountdownInterval = setInterval(updateLockoutUI, 1000);
        } else {
            const remaining = 3 - failedPinAttempts;
            window.UIManager.showToast(`❌ Usuario o contraseña incorrectos (${remaining} intento${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}).`, "fa-solid fa-circle-xmark");
        }
        return false;
    }
}
window.handleUserLogin = handleUserLogin;

/**
 * Handles Quick PIN unlock. Plan B, Task 10 (spec §6 punto 2): verification
 * itself now runs local-first (bcrypt against the synced profiles.pin_hash,
 * js/supabase.js:verifyQuickPin), no network required once this device has
 * synced at least once. The 3-fails/60s lockout is per-user and persisted
 * (js/storage.js:loadPinLockoutState/savePinLockoutState) instead of the
 * in-memory, shared-with-handleUserLogin lockoutUntil/failedPinAttempts --
 * verifyQuickPin already does the counting/locking itself, this function
 * only reads the result back to drive the UI.
 * @param {string} pin 4-digit PIN string
 * @returns {boolean} Success state
 */
async function handleQuickPINInput(pin) {
    let activeUser = currentUser;
    if (!activeUser) {
        try {
            activeUser = JSON.parse(sessionStorage.getItem('casa_lucenzo_active_user') || localStorage.getItem('casa_lucenzo_active_user') || 'null');
        } catch { /* corrupt stored session -- treated as "not logged in" below */ }
    }

    if (!activeUser || !activeUser.id) {
        if (window.UIManager) window.UIManager.showToast("⚠️ Primero debes iniciar sesión con correo y contraseña.", "fa-solid fa-lock");
        return false;
    }

    // Plan B, Task 11 (spec §6, "Bordes"): quick-PIN reactivation is refused
    // past 30 days without proven connectivity -- full password login is
    // the required recovery path, and it inherently needs a connection.
    if (window.AuthManager && window.AuthManager.isOfflineLimitExceeded(window.StorageManager.loadLastAuthOnlineAt())) {
        if (window.UIManager) window.UIManager.showToast("🔒 Este dispositivo lleva más de 30 días sin conectarse. Iniciá sesión con tu contraseña para continuar.", "fa-solid fa-lock");
        return false;
    }

    const lockout = window.StorageManager.loadPinLockoutState(activeUser.id);
    const now = Date.now();
    if (lockout.lockedUntil && now < lockout.lockedUntil) {
        const remainingSec = Math.ceil((lockout.lockedUntil - now) / 1000);
        triggerHaptic([80, 80]);
        if (window.UIManager) window.UIManager.showToast(`⛔ Sistema bloqueado por seguridad. Espera ${remainingSec}s.`, "fa-solid fa-ban");
        updateLockoutUI(activeUser.id);
        return false;
    }

    const pinStr = (pin || '').trim();
    if (!pinStr) return false;

    let isValid = false;
    if (window.SupabaseManager && window.SupabaseManager.isConfigured()) {
        try {
            isValid = await window.SupabaseManager.verifyQuickPin(activeUser.id, pinStr);
        } catch (e) {
            console.error("PIN verification error:", e);
        }
    }

    if (isValid) {
        currentUser = activeUser;
        // Strictly the stored role -- same mapping handleUserLogin() uses.
        // This used to also grant admin to any username *containing* "admin"
        // (`userKey.includes('admin')`), so an account like "administracion"
        // with role `venta` unlocked straight into the admin interface. RLS
        // still refused its writes, but it had no business seeing the panel.
        const roleKey = (activeUser.role || '').toLowerCase();
        const mappedRole = roleKey === 'admin' ? 'admin' : (roleKey === 'cocina' ? 'cocina' : 'local');

        applyUserRole(mappedRole);
        if (window.UIManager) window.UIManager.showToast(`🔓 Sesión reactivada (${activeUser.name})`, "fa-solid fa-user-check");
        logActivity("Desbloqueo PIN", `Reactivación de sesión de ${activeUser.name} vía PIN rápido`);
        return true;
    } else {
        // verifyQuickPin already incremented/persisted this user's lockout
        // state -- read it back to decide what the UI shows.
        const updated = window.StorageManager.loadPinLockoutState(activeUser.id);
        triggerHaptic([80, 80]);

        if (updated.lockedUntil && updated.lockedUntil > Date.now()) {
            if (window.UIManager) window.UIManager.showToast("⛔ 3 intentos fallidos de PIN. Sistema bloqueado por 60 segundos.", "fa-solid fa-triangle-exclamation");
            logActivity("Seguridad Alerta", `Intento fallido de PIN para usuario "${activeUser.username || activeUser.name}"`);

            updateLockoutUI(activeUser.id);
            if (lockoutCountdownInterval) clearInterval(lockoutCountdownInterval);
            lockoutCountdownInterval = setInterval(() => updateLockoutUI(activeUser.id), 1000);
        } else {
            const remaining = Math.max(0, 3 - (updated.attempts || 0));
            if (window.UIManager) window.UIManager.showToast(`❌ PIN incorrecto (${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}).`, "fa-solid fa-circle-xmark");
        }
        return false;
    }
}
window.handlePINInput = handleQuickPINInput;

/**
 * Configures the DOM UI visibility states by active role permissions
 * @param {string} role 'local' | 'cocina' | 'admin'
 */
function applyUserRole(role) {
    currentRole = role;
    sessionStorage.setItem('casa_lucenzo_active_role', role);
    resetInactivityTimer();

    const pinOverlay = document.getElementById('pin-overlay');
    if (pinOverlay) pinOverlay.style.display = 'none';

    const navBar = document.getElementById('switch-nav-bar');
    const btnSettings = document.getElementById('btn-settings-toggle');
    const adminTab = document.getElementById('btn-admin-dashboard');
    
    // Default unlocked structures
    if (adminTab) adminTab.classList.add('hidden');
    document.getElementById('btn-local').classList.remove('hidden');
    document.getElementById('btn-clientes').classList.remove('hidden');
    document.getElementById('btn-resumen').classList.remove('hidden');
    document.getElementById('btn-cocina').classList.remove('hidden');
    document.getElementById('btn-fiados').classList.remove('hidden');
    document.getElementById('btn-cambio').classList.remove('hidden');
    document.getElementById('btn-pedidos').classList.remove('hidden');
    navBar.classList.remove('hidden');
    btnSettings.classList.remove('hidden');
    
    // Hide administrative actions inside sections if local
    const undoSales = document.getElementById('sales-history-section');
    const clearSales = document.getElementById('btn-clear-sales');
    const dayCloseSec = document.getElementById('day-close-trigger-section');

    if (undoSales) undoSales.classList.add('hidden');
    if (clearSales) clearSales.classList.remove('hidden');
    if (dayCloseSec) dayCloseSec.classList.remove('hidden');

    // Lock BCV Rate input for non-admin roles
    const bcvRateInput = document.getElementById('header-bcv-rate-input');
    if (bcvRateInput) {
        if (role === 'admin') {
            bcvRateInput.removeAttribute('readonly');
            bcvRateInput.style.cursor = 'text';
            bcvRateInput.title = 'Toca para cambiar la tasa manualmente (Modo Administrador)';
        } else {
            bcvRateInput.setAttribute('readonly', 'readonly');
            bcvRateInput.style.cursor = 'not-allowed';
            bcvRateInput.title = 'Tasa BCV del día (Solo modificable por Administrador)';
        }
    }

    if (role === 'local') {
        // Local seller: only Local + Clientes + Fiados + Cambio
        document.getElementById('btn-cocina').classList.add('hidden');
        btnSettings.classList.add('hidden');
        if (clearSales) clearSales.classList.add('hidden');
        
        // Dynamic numbering for local role
        const localSpan = document.querySelector('#btn-local .nav-label');
        const clientesSpan = document.querySelector('#btn-clientes .nav-label');
        const resumenSpanLocal = document.querySelector('#btn-resumen .nav-label');
        const fiadosSpan = document.querySelector('#btn-fiados .nav-label');
        const cambioSpan = document.querySelector('#btn-cambio .nav-label');
        const pedidosSpanLocal = document.querySelector('#btn-pedidos .nav-label');
        if (localSpan) localSpan.textContent = '1. LOCAL';
        if (clientesSpan) clientesSpan.textContent = '2. CLIENTES';
        if (resumenSpanLocal) resumenSpanLocal.textContent = '3. RESUMEN';
        if (fiadosSpan) fiadosSpan.textContent = '4. CRÉDITOS';
        if (cambioSpan) cambioSpan.textContent = '5. CAMBIO';
        if (pedidosSpanLocal) pedidosSpanLocal.textContent = '6. PEDIDOS';

        window.UIManager.switchView('local');
        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
        window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
        window.UIManager.renderPedidosOnline(pedidosOnline, handleConfirmPedido, handleRechazarPedido);
        window.UIManager.updatePedidosBadge(pedidosOnline);
    } else if (role === 'cocina') {
        // Kitchen parents: ONLY Kitchen view. Navigation bar hidden entirely.
        navBar.classList.add('hidden');
        btnSettings.classList.add('hidden');

        window.UIManager.switchView('cocina');
        window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
        window.UIManager.renderIngredientsPantry(ingredients, addIngredientStock);
    } else if (role === 'admin') {
        // Full Admin: Everything visible, statistics dashboard loaded
        if (undoSales) undoSales.classList.remove('hidden');
        if (adminTab) adminTab.classList.remove('hidden');

        // Dynamic numbering for admin role
        const adminSpan = document.querySelector('#btn-admin-dashboard .nav-label');
        const localSpan = document.querySelector('#btn-local .nav-label');
        const clientesSpan = document.querySelector('#btn-clientes .nav-label');
        const resumenSpanAdmin = document.querySelector('#btn-resumen .nav-label');
        const cocinaSpan = document.querySelector('#btn-cocina .nav-label');
        const fiadosSpan = document.querySelector('#btn-fiados .nav-label');
        const cambioSpan = document.querySelector('#btn-cambio .nav-label');
        const pedidosSpanAdmin = document.querySelector('#btn-pedidos .nav-label');
        if (adminSpan) adminSpan.textContent = '1. CONTROL';
        if (localSpan) localSpan.textContent = '2. VITRINA';
        if (clientesSpan) clientesSpan.textContent = '3. CLIENTES';
        if (resumenSpanAdmin) resumenSpanAdmin.textContent = '4. RESUMEN';
        if (cocinaSpan) cocinaSpan.textContent = '5. COCINA';
        if (fiadosSpan) fiadosSpan.textContent = '6. CRÉDITOS';
        if (cambioSpan) cambioSpan.textContent = '7. CAMBIO';
        if (pedidosSpanAdmin) pedidosSpanAdmin.textContent = '8. PEDIDOS';

        window.UIManager.switchView('admin-dashboard');
        updateAdminDashboard();
        loadAndRenderAdminStats();
        loadAndRenderActiveDevices();
        window.UIManager.renderPedidosOnline(pedidosOnline, handleConfirmPedido, handleRechazarPedido);
        window.UIManager.updatePedidosBadge(pedidosOnline);
    }

    // Refresh Low Stock Alerts for Admin and Kitchen
    if (window.InventoryManager && window.InventoryManager.updateLowStockUI) {
        window.InventoryManager.updateLowStockUI(products, ingredients, currentRole);
    }

    // Refresh active session on Supabase
    refreshMySession();
}

async function updateAdminDashboard() {
    const container = document.getElementById('admin-dashboard-container');
    if (!container) return;

    if (window.AuthManager && !window.AuthManager.checkRolePermission(currentRole, 'view_stats') && currentRole !== 'admin') {
        container.innerHTML = `<div style="color: #F87171; padding: 1rem; text-align: center;">Acceso denegado. Vista solo para administradores.</div>`;
        return;
    }

    // getTodaySalesLog()/getExpenses() never existed anywhere in the codebase, so
    // these guarded ternaries always took the fallback branch.
    const sales = salesLog || [];
    const expensesList = expenses || [];

    let previousWeekTotal = null;
    try {
        const allSales = (typeof StorageManager !== 'undefined' && StorageManager.loadSalesLog) ? StorageManager.loadSalesLog() : [];
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        const lastWeekStr = lastWeek.toISOString().slice(0, 10);

        const lastWeekSales = allSales.filter(s => (s.timestamp || '').startsWith(lastWeekStr));
        if (lastWeekSales.length > 0) {
            previousWeekTotal = lastWeekSales.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
        }
    } catch(e) {
        previousWeekTotal = null;
    }

    if (window.SalesManager && window.SalesManager.renderAdminDashboard) {
        container.innerHTML = window.SalesManager.renderAdminDashboard(sales, expensesList, previousWeekTotal);
    }
}
window.updateAdminDashboard = updateAdminDashboard;

/**
 * Locks the current role and forces PIN re-entry overlay
 */
function lockSession() {
    triggerHaptic(15);
    sessionStorage.removeItem('casa_lucenzo_active_role');
    currentRole = null;

    // Delete session from Supabase when logging out voluntarily
    if (window.SupabaseManager.isConfigured()) {
        window.SupabaseManager.deleteSession(myDeviceId);
    }

    const pinOverlay = document.getElementById('pin-overlay');
    if (pinOverlay) {
        pinOverlay.style.display = 'flex';
        // Clear display text inside keypad
        const display = document.getElementById('pin-display');
        if (display) display.innerText = '• • • •';
    }

    window.UIManager.initPinKeypad(window.handlePINInput);
}

/**
 * Helper to identify the current device user agent/platform
 */
function getDeviceName() {
    const ua = navigator.userAgent;
    let name = "Dispositivo Genérico";
    if (/android/i.test(ua)) name = "Android Phone/Tablet";
    else if (/iphone|ipad|ipod/i.test(ua)) name = "iPhone/iPad";
    else if (/windows/i.test(ua)) name = "PC Windows";
    else if (/macintosh/i.test(ua)) name = "Macbook/Mac";
    else if (/linux/i.test(ua)) name = "Linux System";
    
    if (/chrome|crios/i.test(ua)) name += " (Chrome)";
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) name += " (Safari)";
    else if (/firefox|fxios/i.test(ua)) name += " (Firefox)";
    else if (/edge/i.test(ua)) name += " (Edge)";
    
    return name;
}

/**
 * Register or refresh current active session on Supabase
 */
async function refreshMySession() {
    // active_sessions RLS only grants access to authenticated users -- an
    // anonymous visitor (no currentRole yet) always gets rejected, so don't
    // even try until someone's actually logged in.
    if (currentRole && window.SupabaseManager.isConfigured() && navigator.onLine) {
        await window.SupabaseManager.registerSession(myDeviceId, getDeviceName(), currentRole);
    }
}

/**
 * Fetch and render all active connected devices in the admin settings modal
 */
async function loadAndRenderActiveDevices() {
    if (currentRole !== 'admin') return;
    // Plan B, Task 14: this used to just do nothing when offline, leaving
    // whatever was rendered last (stale) or a blank panel on first open. A
    // plain empty sessions array would be worse -- renderActiveDevices'
    // own empty-state says "No hay dispositivos registrados en el
    // servidor.", exactly the misleading "nothing exists" reading this task
    // is about. Write the container directly instead of routing through it.
    if (!window.SupabaseManager.isConfigured() || !navigator.onLine) {
        const listDiv = document.getElementById('settings-devices-list');
        if (listDiv) {
            listDiv.innerHTML = `
                <div style="text-align: center; padding: 1rem 0; color: var(--color-text-muted); font-size: 0.75rem;">
                    <i class="fa-solid fa-wifi-slash" style="margin-right: 0.35rem;"></i>
                    Sin conexión — necesitás internet para ver los dispositivos conectados.
                </div>
            `;
        }
        return;
    }
    const sessions = await window.SupabaseManager.fetchActiveSessions();
    window.UIManager.renderActiveDevices(sessions, myDeviceId, handleEjectDevice, handleTrustDevice);
}

/**
 * Kickout a device by deleting its session from Supabase
 */
async function handleEjectDevice(deviceId) {
    if (confirm("¿Estás seguro de que deseas expulsar este dispositivo? Se le cerrará la sesión de inmediato.")) {
        triggerHaptic(15);
        await window.SupabaseManager.deleteSession(deviceId);
        window.UIManager.showToast("🚫 Dispositivo expulsado.", "fa-solid fa-circle-check");
        loadAndRenderActiveDevices();
    }
}

/**
 * Trust or untrust a device session
 */
async function handleTrustDevice(deviceId, isTrusted) {
    triggerHaptic(15);
    await window.SupabaseManager.trustSession(deviceId, isTrusted);
    const msg = isTrusted ? "🛡️ Dispositivo marcado como confiable." : "🛡️ Confianza removida del dispositivo.";
    window.UIManager.showToast(msg, "fa-solid fa-shield-halved");
    loadAndRenderActiveDevices();
}



// ================= APP INITIALIZATION =================

/**
 * Saves BCV configuration locally and updates Supabase
 */
function saveAndSyncBcvConfig() {
    window.StorageManager.saveBcvPreferences(bcvRate, useAutoBcv);
    // Only admin/local are allowed to write app_config per RLS (DB role 'venta'
    // maps to frontend role 'local' -- see handleUserLogin's mappedRole) --
    // anonymous visitors and 'cocina' sessions would just hit a policy
    // violation on every auto-fetch, spamming the console and the offline
    // retry queue for nothing.
    if (currentRole === 'admin' || currentRole === 'local') {
        window.SupabaseManager.upsertAppConfig({ bcvRate, useAutoBcv });
    }
}

/**
 * Update the header exchange rate text, flagging it visually when the rate
 * hasn't been refreshed in over 24h (e.g. the app was left open across days
 * without a day close, so the BCV rate stopped tracking today's dollar).
 */
function updateBcvHeaderDisplay() {
    const el = document.getElementById('header-bcv-rate-input');
    if (!el) return;
    el.value = bcvRate;

    const ageHours = bcvLastFetchTime ? (Date.now() - new Date(bcvLastFetchTime).getTime()) / 3600000 : null;
    const isStale = ageHours === null || ageHours >= 24;
    el.classList.toggle('bcv-rate-stale', isStale);
    if (isStale) {
        const lastLabel = bcvLastFetchTime ? new Date(bcvLastFetchTime).toLocaleString() : 'nunca';
        el.title = `⚠️ Tasa BCV desactualizada (última actualización: ${lastLabel}). Verifica tu conexión.`;
    } else if (el.getAttribute('readonly')) {
        el.title = 'Tasa BCV del día (Solo modificable por Administrador)';
    } else {
        el.title = 'Toca para cambiar la tasa manualmente (Modo Administrador)';
    }
}

/**
 * Fetch the official BCV rate from DolarVZLA API (which updates correctly with next business day value date)
 */
// Sub-centavo drift between the two rate providers is noise, not a rate move.
// A difference at or under 1 céntimo counts as "unchanged" so fetchBcvRate can
// skip the expensive app_config write (fans out over realtime) + full
// renderAllViews() on a poll that found the same published rate. Exported for
// tests.
function bcvRateChangedEnough(prevRate, newRate) {
    if (!(newRate > 0)) return false;
    if (!(prevRate > 0)) return true;
    return Math.abs(newRate - prevRate) > 0.01;
}

async function fetchBcvRate(force = false) {
    if (!useAutoBcv && !force) return;
    try {
        console.log("Fetching official BCV exchange rate...");
        let rate1 = 0;
        let rate2 = 0;

        // Provider 1: DolarVZLA (returns official rate for next business day)
        try {
            const res1 = await fetch('https://rates.dolarvzla.com/bcv/current.json');
            if (res1.ok) {
                const data1 = await res1.json();
                if (data1 && data1.current && data1.current.usd) {
                    rate1 = parseFloat(data1.current.usd);
                }
            }
        } catch(e1) {
            console.warn("DolarVZLA fetch failed:", e1);
        }

        // Provider 2: DolarAPI Venezuela
        try {
            const res2 = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            if (res2.ok) {
                const data2 = await res2.json();
                if (data2 && (data2.promedio || data2.monto || data2.precio)) {
                    rate2 = parseFloat(data2.promedio || data2.monto || data2.precio);
                }
            }
        } catch(e2) {
            console.warn("DolarAPI fetch failed:", e2);
        }

        // Pick the newest/highest valid official published rate
        const newRate = Math.max(rate1 || 0, rate2 || 0);

        if (newRate > 0) {
            const prevRate = bcvRate;
            const rateChanged = bcvRateChangedEnough(prevRate, newRate);

            bcvRate = newRate;
            window.bcvRate = bcvRate;
            useAutoBcv = true;

            // A successful fetch always refreshes the "last checked" clock even
            // when the published rate did not move -- otherwise the 6h-stale
            // guard on visibilitychange keeps re-firing this on every focus.
            bcvLastFetchTime = new Date().toISOString();
            window.StorageManager.saveBcvLastFetch(bcvLastFetchTime);

            // Everything below is expensive: saveAndSyncBcvConfig() writes
            // app_config (which fans out over realtime to every other device)
            // and renderAllViews() repaints all ~13 views. This used to run on
            // every poll regardless of whether the rate actually changed, which
            // is what made the POS feel slow. Only pay that cost on a real move.
            if (rateChanged) {
                saveAndSyncBcvConfig();
                console.log(`BCV Rate updated: ${prevRate} -> ${bcvRate} Bs.`);

                const bcvRateInput = document.getElementById('pref-bcv-rate');
                const autoCheckbox = document.getElementById('pref-bcv-auto');
                const headerBcvInput = document.getElementById('header-bcv-rate-input');
                if (bcvRateInput) {
                    bcvRateInput.value = bcvRate;
                    bcvRateInput.disabled = true;
                }
                if (headerBcvInput) {
                    headerBcvInput.value = bcvRate;
                }
                if (autoCheckbox) {
                    autoCheckbox.checked = true;
                }

                updateBcvHeaderDisplay();

                // Re-render UI
                renderAllViews();
            } else {
                console.log(`BCV Rate unchanged (${bcvRate} Bs) -- skipping sync + re-render.`);
            }
        }
    } catch (e) {
        console.error("Failed to fetch BCV rate, using fallback/cached value.", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Register PWA Service Worker (only in a browser on http/https -- NOT in
    // the Electron shell, where the frontend is already local under app:// and
    // the SW would just add a redundant cache layer).
    if ('serviceWorker' in navigator && !window.electronAPI
        && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        let refreshing = false;
        
        // Listen for controllerchange to trigger automated reload when new sw takes over
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            console.log('Service Worker controller changed, reloading.');
            if (window.UIManager && window.UIManager.showUpdateOverlay) {
                window.UIManager.showUpdateOverlay();
                window.UIManager.updateOverlayStatusSuccess();
            }
            setTimeout(() => {
                window.location.reload();
            }, 1200);
        });

        navigator.serviceWorker.register('/sw.js', { scope: '/sistema/' })
            .then(reg => {
                console.log('Service Worker Registered with scope:', reg.scope);
                
                // If there's an update already waiting to be activated, trigger it!
                if (reg.waiting) {
                    console.log('New update is waiting in background. Triggering activation.');
                    if (window.UIManager && window.UIManager.showUpdateOverlay) {
                        window.UIManager.showUpdateOverlay();
                        window.UIManager.updateOverlayStatusSuccess();
                    }
                    setTimeout(() => {
                        window.location.reload();
                    }, 1200);
                    return;
                }

                // Check for updates automatically every 30 seconds
                setInterval(() => {
                    reg.update().catch(err => console.debug('Periodic SW update check deferred', err));
                }, 30000);

                // Also check for updates when returning to the tab
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        reg.update().catch(err => console.debug('Tab focus SW update check deferred', err));
                    }
                });

                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    if (installingWorker) {
                        // Display full screen update overlay when installing begins
                        if (window.UIManager && window.UIManager.showUpdateOverlay) {
                            window.UIManager.showUpdateOverlay();
                        }
                        
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed') {
                                if (navigator.serviceWorker.controller) {
                                    console.log('New update installed, performing auto-reload.');
                                    if (window.UIManager && window.UIManager.updateOverlayStatusSuccess) {
                                        window.UIManager.updateOverlayStatusSuccess();
                                    }
                                    setTimeout(() => {
                                        window.location.reload();
                                    }, 1500);
                                }
                            }
                        };
                    }
                };
            })
            .catch(err => console.warn('Service Worker registration failed:', err));
    }

    // 2. Load preferences and inputs configuration
    preferences = window.StorageManager.loadPreferences();

    // One-time cleanup: devices that opened Ajustes before v284 had the legacy
    // JWT anon key pre-filled into the credentials field, so any change in that
    // panel silently persisted it -- and a saved preference outranks the key
    // injected at build time. Drop it so those devices go back to whatever the
    // deployment actually configures. Only clears these exact legacy values;
    // a deliberate override to another project is left alone.
    const LEGACY_PINNED_KEY_PREFIX = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dHBhcW9rZXl5d2phYWp2anl1';
    const LEGACY_PINNED_URL = 'https://xttpaqokeyywjaajvjyu.supabase.co';
    if ((preferences.supabaseKey || '').startsWith(LEGACY_PINNED_KEY_PREFIX) || preferences.supabaseUrl === LEGACY_PINNED_URL) {
        console.log('Clearing legacy pinned Supabase credentials from this device; falling back to the deployed configuration.');
        preferences.supabaseKey = '';
        preferences.supabaseUrl = '';
        window.StorageManager.savePreferences(preferences);
    }
    costInsumos = window.StorageManager.loadCostInsumos();
    
    // Load active cart if stored
    const savedCart = localStorage.getItem('casa_lucenzo_current_cart');
    if (savedCart) {
        try {
            currentCart = JSON.parse(savedCart);
        } catch (e) {
            currentCart = [];
        }
    }

    // Initialize BCV Exchange Rate
    const bcvPrefs = window.StorageManager.loadBcvPreferences();
    bcvRate = bcvPrefs.bcvRate || 732.48;
    useAutoBcv = bcvPrefs.useAutoBcv !== false;
    window.bcvRate = bcvRate;
    bcvLastFetchTime = window.StorageManager.loadBcvLastFetch() || null;
    
    const headerBcvInput = document.getElementById('header-bcv-rate-input');
    const autoBcvCheckbox = document.getElementById('pref-bcv-auto');
    const bcvRateInput = document.getElementById('pref-bcv-rate');
    
    if (headerBcvInput) {
        headerBcvInput.value = bcvRate;
        
        headerBcvInput.addEventListener('change', () => {
            const val = parseFloat(headerBcvInput.value);
            if (val > 0) {
                bcvRate = val;
                window.bcvRate = bcvRate;
                useAutoBcv = false; // Disable automatic sync since they manually set the rate
                bcvLastFetchTime = new Date().toISOString();
                window.StorageManager.saveBcvLastFetch(bcvLastFetchTime);
                saveAndSyncBcvConfig();

                // Sync Settings Modal components
                if (autoBcvCheckbox) autoBcvCheckbox.checked = false;
                if (bcvRateInput) {
                    bcvRateInput.value = bcvRate;
                    bcvRateInput.disabled = false;
                }

                updateBcvHeaderDisplay();

                // Re-render all views
                window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
                window.UIManager.renderCashRegister(salesLog, expenses);
                window.UIManager.renderSalesHistory(salesLog, handleUndoSale);
                window.UIManager.renderDebts(debts, settleDebtPayment);

                window.UIManager.showToast(`💵 Tasa cambiada a ${bcvRate.toFixed(2)} Bs.`, "fa-solid fa-dollar-sign");
            }
        });
    }

    if (autoBcvCheckbox && bcvRateInput) {
        autoBcvCheckbox.checked = useAutoBcv;
        bcvRateInput.value = bcvRate;
        bcvRateInput.disabled = useAutoBcv;
        
        autoBcvCheckbox.addEventListener('change', () => {
            useAutoBcv = autoBcvCheckbox.checked;
            bcvRateInput.disabled = useAutoBcv;
            if (useAutoBcv) {
                fetchBcvRate();
            } else {
                saveAndSyncBcvConfig();
            }
        });
        
        bcvRateInput.addEventListener('change', () => {
            const val = parseFloat(bcvRateInput.value);
            if (val > 0) {
                bcvRate = val;
                window.bcvRate = bcvRate;
                bcvLastFetchTime = new Date().toISOString();
                window.StorageManager.saveBcvLastFetch(bcvLastFetchTime);
                saveAndSyncBcvConfig();

                // Sync Header input
                updateBcvHeaderDisplay();

                // Re-render
                window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
                window.UIManager.renderCashRegister(salesLog, expenses);
                window.UIManager.renderSalesHistory(salesLog, handleUndoSale);
                window.UIManager.renderDebts(debts, settleDebtPayment);
            }
        });
    }

    updateBcvHeaderDisplay();
    if (useAutoBcv) {
        fetchBcvRate();
    }

    // The BCV rate otherwise only refreshes on app load or day close, so a
    // device left open across days (kiosk/tablet) silently keeps selling at
    // a stale dollar rate. Re-check periodically and whenever the tab
    // regains focus, same pattern as the service worker update check above.
    setInterval(() => {
        if (useAutoBcv) fetchBcvRate();
        updateBcvHeaderDisplay();
    }, 6 * 60 * 60 * 1000); // every 6h

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const ageHours = bcvLastFetchTime ? (Date.now() - new Date(bcvLastFetchTime).getTime()) / 3600000 : Infinity;
        if (useAutoBcv && ageHours >= 6) fetchBcvRate();
        updateBcvHeaderDisplay();
    });

    document.getElementById('pref-sound').checked = preferences.sound !== false;
    document.getElementById('pref-vibrate').checked = preferences.vibration !== false;
    // Left blank unless this device has a genuine override saved. These two
    // fields used to be pre-filled with the project URL and a hardcoded legacy
    // JWT anon key, which meant simply toggling Sonido or Vibración in this
    // panel wrote both into preferences -- and getSupabaseConfig() prefers a
    // saved preference over the build-injected value. One unrelated tap and the
    // device was pinned forever to a key nobody could rotate. The placeholders
    // show what the app falls back to without persisting anything.
    const prefUrlInput = document.getElementById('pref-supabase-url');
    const prefKeyInput = document.getElementById('pref-supabase-key');
    prefUrlInput.value = preferences.supabaseUrl || '';
    prefUrlInput.placeholder = 'Por defecto: el proyecto configurado en el despliegue';
    prefKeyInput.value = preferences.supabaseKey || '';
    prefKeyInput.placeholder = 'Por defecto: la llave pública del despliegue';

    const pinLocalInput = document.getElementById('pref-pin-local');
    const pinCocinaInput = document.getElementById('pref-pin-cocina');
    const pinAdminInput = document.getElementById('pref-pin-admin');
    if (pinLocalInput) pinLocalInput.value = pinLocal;
    if (pinCocinaInput) pinCocinaInput.value = pinCocina;
    if (pinAdminInput) pinAdminInput.value = pinAdmin;

    // 3. Initialize connection status dots
    if (window.SupabaseManager.isConfigured()) {
        if (navigator.onLine) {
            window.UIManager.updateConnectionStatus('online');
        } else {
            window.UIManager.updateConnectionStatus('offline');
        }
    } else {
        window.UIManager.updateConnectionStatus('local');
    }

    // 4. Initialize Supabase if keys are provided
    const isSupabaseReady = window.SupabaseManager.init();

    if (isSupabaseReady) {
        loadAllDataFromSupabase();
        window.SupabaseManager.subscribeToChanges(handleRealtimeDbUpdate);
        
        // Register active session & heartbeat
        refreshMySession();
        setInterval(refreshMySession, 45000); // 45s heartbeat
    } else {
        loadAllDataFromLocalStorage();
    }

    // 5. User roles validation checks & Login Form event listeners
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userInput = document.getElementById('login-username-input');
            const passInput = document.getElementById('login-password-input');
            const username = userInput ? userInput.value : '';
            const password = passInput ? passInput.value : '';
            await handleUserLogin(username, password);
        });
    }

    const btnTogglePass = document.getElementById('btn-toggle-password');
    if (btnTogglePass) {
        btnTogglePass.addEventListener('click', () => {
            const passInput = document.getElementById('login-password-input');
            if (passInput) {
                const isPass = passInput.type === 'password';
                passInput.type = isPass ? 'text' : 'password';
                btnTogglePass.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
            }
        });
    }

    const quickUserPills = document.querySelectorAll('.btn-quick-user-pill');
    quickUserPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const targetUser = pill.getAttribute('data-user');
            const userInput = document.getElementById('login-username-input');
            const passInput = document.getElementById('login-password-input');
            if (userInput) userInput.value = targetUser;
            if (passInput) passInput.focus();
            triggerHaptic(10);
        });
    });

    const btnOpenAddUser = document.getElementById('btn-open-add-user-modal');
    if (btnOpenAddUser) {
        btnOpenAddUser.addEventListener('click', () => openUserModal());
    }

    const btnUserModalClose = document.getElementById('user-modal-close');
    if (btnUserModalClose) {
        btnUserModalClose.addEventListener('click', closeUserModal);
    }

    const userForm = document.getElementById('user-form');
    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!window.SupabaseManager || !window.SupabaseManager.isConfigured()) {
                window.UIManager.showToast("⚠️ Conexión con Supabase no disponible.", "fa-solid fa-wifi");
                return;
            }

            const id = document.getElementById('user-modal-id').value;
            const name = document.getElementById('user-modal-name').value.trim();
            const username = document.getElementById('user-modal-username').value.trim().toLowerCase();
            const password = document.getElementById('user-modal-password').value;
            const role = document.getElementById('user-modal-role').value;

            const submitBtn = userForm.querySelector('button[type="submit"]');

            if (id) {
                // Editing: name/role only. Username maps to the account's real
                // Supabase Auth email (username@casalucenzo.com) and can't be
                // repointed from here; password can't be changed without a
                // service-role Admin API call, which this client doesn't have.
                if (submitBtn) submitBtn.disabled = true;
                try {
                    await window.SupabaseManager.upsertProfile({ id, username, name: name || username, role, active: true });
                    window.UIManager.showToast("✅ Usuario actualizado.", "fa-solid fa-circle-check");
                    logActivity("Usuario Editado", `Editado: ${name || username} (${role})`);
                    closeUserModal();
                    loadAndRenderUsersManagement();
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
                return;
            }

            if (!username || !password) {
                window.UIManager.showToast("❌ Por favor completa usuario y contraseña.", "fa-solid fa-triangle-exclamation");
                return;
            }
            if (password.length < 6) {
                window.UIManager.showToast("❌ La contraseña debe tener al menos 6 caracteres.", "fa-solid fa-triangle-exclamation");
                return;
            }

            if (submitBtn) submitBtn.disabled = true;
            try {
                const { success, error } = await window.SupabaseManager.signUpNewUser({ username, name: name || username, role, password });
                if (success) {
                    window.UIManager.showToast(`✅ Usuario "${username}" creado con éxito.`, "fa-solid fa-circle-check");
                    logActivity("Usuario Creado", `Nuevo usuario: ${name || username} (${role})`);
                    closeUserModal();
                    loadAndRenderUsersManagement();
                } else {
                    const msg = (error && error.message) ? error.message : 'error desconocido';
                    window.UIManager.showToast(`❌ No se pudo crear el usuario: ${msg}`, "fa-solid fa-circle-xmark");
                }
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    const activeRole = sessionStorage.getItem('casa_lucenzo_active_role');
    if (activeRole) {
        applyUserRole(activeRole);
    } else {
        lockSession();
    }

    // 6. Bind navigation buttons (Dashboard, Vitrina, Clientes, Cocina, Fiados, Cambio)
    const btnAdminDash = document.getElementById('btn-admin-dashboard');
    if (btnAdminDash) {
        btnAdminDash.addEventListener('click', () => {
            window.UIManager.switchView('admin-dashboard');
            updateAdminDashboard();
            loadAndRenderAdminStats();
            loadAndRenderActiveDevices();
        });
    }

    const btnRefreshDash = document.getElementById('btn-refresh-dashboard');
    if (btnRefreshDash) {
        btnRefreshDash.addEventListener('click', () => {
            updateAdminDashboard();
            if (window.UIManager && window.UIManager.showToast) {
                window.UIManager.showToast('Resumen del día actualizado', 'fa-solid fa-rotate');
            }
        });
    }

    document.getElementById('btn-local').addEventListener('click', () => {
        window.UIManager.switchView('local');
        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
        window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
        window.UIManager.renderPendingDispatches(replenishments, confirmReceipt);
    });

    document.getElementById('btn-clientes').addEventListener('click', () => {
        window.UIManager.switchView('clientes');
        window.UIManager.renderClientesView(salesLog, handleUndoSale, handleEditSale, markTransactionAsPaid, products);
    });

    const btnResumenNav = document.getElementById('btn-resumen');
    if (btnResumenNav) {
        btnResumenNav.addEventListener('click', () => {
            window.UIManager.switchView('resumen');
            window.UIManager.renderClientesView(salesLog, handleUndoSale, handleEditSale, markTransactionAsPaid, products);
        });
    }

    document.getElementById('btn-cocina').addEventListener('click', () => {
        window.UIManager.switchView('cocina');
        window.UIManager.renderCocina(products, deliverProduct, replenishments, salesLog);
        window.UIManager.renderIngredientsPantry(ingredients, addIngredientStock);
    });

    document.getElementById('btn-fiados').addEventListener('click', () => {
        window.UIManager.switchView('fiados');
        window.UIManager.renderDebts(debts, settleDebtPayment);
    });

    document.getElementById('btn-cambio').addEventListener('click', () => {
        window.UIManager.switchView('cambio');
        window.UIManager.renderQuickConversionTable();
    });

    document.getElementById('btn-pedidos').addEventListener('click', () => {
        window.UIManager.switchView('pedidos');
        window.UIManager.renderPedidosOnline(pedidosOnline, handleConfirmPedido, handleRechazarPedido);
    });

    // 7. Bind Clientes sub-navigation buttons (Mesas vs Cuentas Activas vs Historial)
    const btnSubMesas = document.getElementById('btn-sub-mesas');
    const btnSubCuentas = document.getElementById('btn-sub-cuentas');
    const btnSubHistorial = document.getElementById('btn-sub-historial');
    const subViewMesas = document.getElementById('sub-view-mesas');
    const subViewCuentas = document.getElementById('sub-view-cuentas');
    const subViewHistorial = document.getElementById('sub-view-historial');

    if (btnSubMesas && btnSubCuentas && btnSubHistorial && subViewMesas && subViewCuentas && subViewHistorial) {
        btnSubMesas.addEventListener('click', () => {
            btnSubMesas.classList.add('active');
            btnSubMesas.classList.remove('inactive');
            btnSubMesas.setAttribute('aria-selected', 'true');
            
            btnSubCuentas.classList.remove('active');
            btnSubCuentas.classList.add('inactive');
            btnSubCuentas.setAttribute('aria-selected', 'false');
            
            btnSubHistorial.classList.remove('active');
            btnSubHistorial.classList.add('inactive');
            btnSubHistorial.setAttribute('aria-selected', 'false');

            subViewMesas.classList.remove('hidden');
            subViewCuentas.classList.add('hidden');
            subViewHistorial.classList.add('hidden');
            triggerHaptic(10);
        });

        btnSubCuentas.addEventListener('click', () => {
            btnSubCuentas.classList.add('active');
            btnSubCuentas.classList.remove('inactive');
            btnSubCuentas.setAttribute('aria-selected', 'true');
            
            btnSubMesas.classList.remove('active');
            btnSubMesas.classList.add('inactive');
            btnSubMesas.setAttribute('aria-selected', 'false');
            
            btnSubHistorial.classList.remove('active');
            btnSubHistorial.classList.add('inactive');
            btnSubHistorial.setAttribute('aria-selected', 'false');

            subViewCuentas.classList.remove('hidden');
            subViewMesas.classList.add('hidden');
            subViewHistorial.classList.add('hidden');
            triggerHaptic(10);
        });

        btnSubHistorial.addEventListener('click', () => {
            btnSubHistorial.classList.add('active');
            btnSubHistorial.classList.remove('inactive');
            btnSubHistorial.setAttribute('aria-selected', 'true');
            
            btnSubMesas.classList.remove('active');
            btnSubMesas.classList.add('inactive');
            btnSubMesas.setAttribute('aria-selected', 'false');
            
            btnSubCuentas.classList.remove('active');
            btnSubCuentas.classList.add('inactive');
            btnSubCuentas.setAttribute('aria-selected', 'false');

            subViewHistorial.classList.remove('hidden');
            subViewMesas.classList.add('hidden');
            subViewCuentas.classList.add('hidden');
            triggerHaptic(10);
        });
    }

    // Converter Calculator Logic
    const calcUsd = document.getElementById('calc-usd');
    const calcVes = document.getElementById('calc-ves');
    if (calcUsd && calcVes) {
        calcUsd.addEventListener('input', () => {
            const usd = parseFloat(calcUsd.value);
            if (!isNaN(usd)) {
                calcVes.value = (usd * bcvRate).toFixed(2);
            } else {
                calcVes.value = '';
            }
        });
        
        calcVes.addEventListener('input', () => {
            const ves = parseFloat(calcVes.value);
            if (!isNaN(ves)) {
                calcUsd.value = (ves / bcvRate).toFixed(2);
            } else {
                calcUsd.value = '';
            }
        });
    }

    // 7. Bind configuration modal toggles
    document.getElementById('btn-settings-toggle').addEventListener('click', () => {
        window.UIManager.switchView('admin-dashboard');
        
        const isUserAdmin = currentRole === 'admin';
        const targetTabId = isUserAdmin ? 'admin-tab-btn-products' : 'admin-tab-btn-preferences';
        const targetPanelId = isUserAdmin ? 'admin-panel-products' : 'admin-panel-preferences';

        const tabBtn = document.getElementById(targetTabId);
        const panel = document.getElementById(targetPanelId);

        if (tabBtn && panel) {
            const allTabBtns = document.querySelectorAll('.admin-tab-btn');
            const allPanels = document.querySelectorAll('.admin-panel');
            allTabBtns.forEach(b => b.classList.remove('active'));
            allPanels.forEach(p => p.classList.remove('active'));
            tabBtn.classList.add('active');
            panel.classList.add('active');
        }

        window.UIManager.renderSettingsProducts(products, editProductPrompt, deleteProduct);
    });

    const btnSettingsClose = document.getElementById('btn-settings-close');
    if (btnSettingsClose) {
        btnSettingsClose.addEventListener('click', () => {
            window.UIManager.toggleSettingsModal(false);
        });
    }

    const btnSettingsCancel = document.getElementById('btn-settings-cancel');
    if (btnSettingsCancel) {
        btnSettingsCancel.addEventListener('click', () => {
            // Reset the mobile drawer so it doesn't reopen already-expanded
            // next time the admin dashboard is entered.
            document.getElementById('admin-sidebar')?.classList.remove('open');
            document.getElementById('admin-sidebar-backdrop')?.classList.remove('open');
            document.getElementById('btn-admin-sidebar-toggle')?.setAttribute('aria-expanded', 'false');
            window.UIManager.switchView('local');
            window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
            window.UIManager.renderActiveCart(currentCart, handleAddToCart, handleRemoveFromCart, handleClearCart, handleCheckoutCart);
        });
    }

    // 8. Bind WhatsApp sharing (Kitchen report)
    document.getElementById('btn-whatsapp-share').addEventListener('click', () => {
        window.ShareManager.shareToWhatsApp(products, window.UIManager.showToast);
    });

    // 9. Bind vitrina refill all
    document.getElementById('btn-reset-all').addEventListener('click', resetToMax);

    // 10. Bind factory reset
    document.getElementById('btn-factory-reset').addEventListener('click', restoreDefaultProducts);

    // 11. Bind clear sales history
    document.getElementById('btn-clear-sales').addEventListener('click', clearAllSales);

    // 12. Bind add product form
    document.getElementById('add-product-form').addEventListener('submit', addNewProduct);

    // 13. Bind expenses form
    document.getElementById('add-expense-form').addEventListener('submit', addExpense);

    // 14. Bind debts form
    document.getElementById('add-debt-form').addEventListener('submit', addDebt);

    // 15. Bind Day Close triggers
    document.getElementById('btn-cierre-dia-open').addEventListener('click', openDayCloseModal);
    document.getElementById('btn-cierre-dia-close').addEventListener('click', closeDayCloseModal);
    document.getElementById('btn-clean-offline-cache').addEventListener('click', handleCleanOfflineCache);
    document.getElementById('btn-cierre-dia-confirm').addEventListener('click', async (ev) => {
        const confirmBtn = ev.currentTarget;
        if (confirmBtn.disabled) return;
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.6';

        // Safari/iPadOS only allows window.open() when it's called synchronously
        // inside the click handler -- any await before it (closeDayAndResetLogs
        // below does several) drops the "user just clicked this" flag and the
        // tab gets silently blocked, no error, nothing to catch. Opening a blank
        // tab here, before any await, keeps it authorized; we just point it at
        // the real WhatsApp URL once the report is ready.
        const waTab = window.open('', '_blank');

        try {
            // Build the report from whatever data the modal is currently showing.
            const dateLabel = currentReportData.dateLabel || new Date().toLocaleDateString();
            const reportRate = currentReportData.rate || window.bcvRate || bcvRate;
            const message = generateWhatsAppReport(currentReportData.sales, currentReportData.expenses, dateLabel, reportRate, products);

            // Close first, share second. Opening WhatsApp up front announced a
            // closed day before the database had agreed to it -- if the close
            // then failed, the report was already sent and the day was still open.
            if (!currentReportData.isHistory) {
                await closeDayAndResetLogs();
            }

            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
            if (waTab) {
                waTab.location.href = waUrl;
            } else {
                // Blocked even as a blank tab (e.g. popups fully disabled) -- try
                // anyway so desktop/Android, which don't need the pre-open trick,
                // still get their normal window.open() behavior.
                window.open(waUrl, '_blank');
            }
            closeDayCloseModal();
        } catch (e) {
            // Don't leave a stray blank tab hanging if something above threw.
            if (waTab) waTab.close();
            throw e;
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '';
        }
    });
    
    document.getElementById('btn-cierre-dia-pdf').addEventListener('click', () => {
        triggerHaptic(15);
        const dateLabel = currentReportData.dateLabel || new Date().toLocaleDateString();
        const reportRate = currentReportData.rate || window.bcvRate || bcvRate;
        window.UIManager.exportDayCloseToPDF(currentReportData.sales, currentReportData.expenses, products, dateLabel, reportRate);
    });

    // 15b. Bind Report Preview button (opens report modal without closing day)
    document.getElementById('btn-preview-report').addEventListener('click', () => {
        triggerHaptic(15);
        const todayLabel = new Date().toLocaleDateString();
        const currentRate = window.bcvRate || bcvRate;
        currentReportData = { sales: salesLog, expenses: expenses, dateLabel: todayLabel, rate: currentRate, isHistory: false };
        window.UIManager.renderDayCloseModal(salesLog, expenses, products, todayLabel, currentRate);
        document.getElementById('day-close-modal').classList.remove('hidden');
    });

    // 15c. Bind Report History button and modal controls
    document.getElementById('btn-report-history').addEventListener('click', openReportHistoryModal);
    document.getElementById('btn-report-history-close').addEventListener('click', () => {
        triggerHaptic(15);
        document.getElementById('report-history-modal').classList.add('hidden');
    });
    document.getElementById('btn-report-history-done').addEventListener('click', () => {
        triggerHaptic(15);
        document.getElementById('report-history-modal').classList.add('hidden');
    });

    // 16. Bind preference toggle checkboxes and credentials
    document.getElementById('pref-sound').addEventListener('change', handlePreferencesChange);
    document.getElementById('pref-vibrate').addEventListener('change', handlePreferencesChange);
    document.getElementById('pref-supabase-url').addEventListener('change', handlePreferencesChange);
    document.getElementById('pref-supabase-key').addEventListener('change', handlePreferencesChange);

    // 17. Bind lock icon buttons
    document.getElementById('btn-lock-user').addEventListener('click', lockSession);

    // 17b. Bind logo click to reload page
    const logoContainer = document.querySelector('.logo-container');
    if (logoContainer) {
        logoContainer.style.cursor = 'pointer';
        logoContainer.title = 'Toca el logo para recargar la aplicación';
        logoContainer.addEventListener('click', () => {
            triggerHaptic(15);
            window.location.reload();
        });
    }

    // 18. Bind online/offline, visibility & focus auto-reconnect listeners
    // Returning to the tab fires visibilitychange AND focus in most browsers,
    // and both used to run the full routine: two realtime channel teardowns
    // plus two rounds of the eight-query loader, every single time the cashier
    // glanced at the phone. Collapse bursts into one run.
    let lastAutoSyncAt = 0;
    const AUTO_SYNC_MIN_GAP_MS = 3000;

    const autoSyncAndReconnect = ({ force = false } = {}) => {
        if (!window.SupabaseManager.isConfigured() || !navigator.onLine) return;

        const now = Date.now();
        if (!force && now - lastAutoSyncAt < AUTO_SYNC_MIN_GAP_MS) return;
        lastAutoSyncAt = now;

        window.UIManager.updateConnectionStatus('online');
        window.SupabaseManager.subscribeToChanges(handleRealtimeDbUpdate);
        loadAllDataFromSupabase();
    };

    // A real offline->online transition always resyncs; it is exactly the
    // moment the queued writes need to go out, so it skips the debounce.
    window.addEventListener('online', () => autoSyncAndReconnect({ force: true }));
    window.addEventListener('offline', () => {
        if (window.SupabaseManager.isConfigured()) {
            window.UIManager.updateConnectionStatus('offline');
        }
    });

    // Auto-refresh data when user switches back to tab or turns screen on
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log("Tab/screen reactivated. Triggering instant background sync...");
            autoSyncAndReconnect();
        }
    });
    window.addEventListener('focus', () => {
        if (document.visibilityState === 'visible') {
            autoSyncAndReconnect();
        }
    });


    // Periodic silent background re-sync as a backstop for the realtime channel.
    // Realtime (subscribeToChanges) is the primary freshness mechanism and fires
    // on every row change; autoSyncAndReconnect() also runs a full sync on every
    // tab focus / reconnect. This interval only needs to catch anything a
    // dropped socket missed, so 3 min is plenty -- 45s meant a burst of ~8 REST
    // calls + dataset re-parse every 45s on the till, for near-zero benefit.
    setInterval(() => {
        if (document.visibilityState === 'visible' && window.SupabaseManager.isConfigured() && navigator.onLine) {
            loadAllDataFromSupabase();
        }
    }, 3 * 60 * 1000);

    // Ticks the "Actualizado hace X" freshness label in Resumen
    setInterval(updateSyncFreshnessDisplay, 3000);

    // 19. Bind the sync status badge to PowerSync's real status (Task 13).
    // client.js is a deferred module script loaded before this one -- by
    // DOMContentLoaded it has already run, so window.PowerSyncManager exists.
    if (window.PowerSyncManager && window.PowerSyncManager.onStatusChange) {
        window.PowerSyncManager.onStatusChange(updateSyncStatusUI);
        const initialStatus = window.PowerSyncManager.getSyncStatus();
        if (initialStatus) updateSyncStatusUI(initialStatus);
    }

    initAdminDashboardListeners();
    initAgentListeners();
});

// Expose functions globally for UI callbacks and fallbacks
window.handleEditSale = handleEditSale;
window.handleUndoSale = handleUndoSale;
window.handleCartQtyChange = handleCartQtyChange;
window.updateProductStockDirect = updateProductStockDirect;

// Dynamically link currentCart to window.currentCart to avoid array reference mismatch
Object.defineProperty(window, 'currentCart', {
    get: () => currentCart,
    set: (val) => { currentCart = val; }
});

function handleDeleteCostInsumo(id) {
    triggerHaptic(15);
    costInsumos = costInsumos.filter(i => i.id !== id);
    window.StorageManager.saveCostInsumos(costInsumos);
    window.UIManager.renderCostCalculator(products, costInsumos, handleDeleteCostInsumo);
    window.UIManager.showToast("🗑️ Insumo eliminado de la calculadora.", "fa-solid fa-trash");
}

/**
 * Initialize listeners for the custom admin widescreen dashboard
 */
function initAdminDashboardListeners() {
    const tabSummaryBtn = document.getElementById('admin-tab-btn-summary');
    const tabAnalyticsBtn = document.getElementById('admin-tab-btn-analytics');
    const tabProductsBtn = document.getElementById('admin-tab-btn-products');
    const tabDevicesBtn = document.getElementById('admin-tab-btn-devices');
    const tabLogsBtn = document.getElementById('admin-tab-btn-logs');
    const tabCostsBtn = document.getElementById('admin-tab-btn-costs');
    const tabExpensesBtn = document.getElementById('admin-tab-btn-expenses');
    const tabPnlBtn = document.getElementById('admin-tab-btn-pnl');
    const tabAgentBtn = document.getElementById('admin-tab-btn-agent');
    const tabPreferencesBtn = document.getElementById('admin-tab-btn-preferences');

    const panelSummary = document.getElementById('admin-panel-summary');
    const panelAnalytics = document.getElementById('admin-panel-analytics');
    const panelProducts = document.getElementById('admin-panel-products');
    const panelDevices = document.getElementById('admin-panel-devices');
    const panelLogs = document.getElementById('admin-panel-logs');
    const panelCosts = document.getElementById('admin-panel-costs');
    const panelExpenses = document.getElementById('admin-panel-expenses');
    const panelPnl = document.getElementById('admin-panel-pnl');
    const panelAgent = document.getElementById('admin-panel-agent');
    const panelPreferences = document.getElementById('admin-panel-preferences');

    if (!tabSummaryBtn) return; // Not loaded yet

    const allTabBtns = [tabSummaryBtn, tabAnalyticsBtn, tabProductsBtn, tabDevicesBtn, tabLogsBtn, tabCostsBtn, tabExpensesBtn, tabPnlBtn, tabAgentBtn, tabPreferencesBtn].filter(Boolean);
    const allPanels = [panelSummary, panelAnalytics, panelProducts, panelDevices, panelLogs, panelCosts, panelExpenses, panelPnl, panelAgent, panelPreferences].filter(Boolean);

    // Mobile-only off-canvas drawer for the sidebar (desktop/tablet keep it
    // permanently visible -- these elements are simply display:none there).
    const adminSidebar = document.getElementById('admin-sidebar');
    const adminSidebarToggle = document.getElementById('btn-admin-sidebar-toggle');
    const adminSidebarBackdrop = document.getElementById('admin-sidebar-backdrop');

    function closeAdminSidebarDrawer() {
        if (adminSidebar) adminSidebar.classList.remove('open');
        if (adminSidebarBackdrop) adminSidebarBackdrop.classList.remove('open');
        if (adminSidebarToggle) adminSidebarToggle.setAttribute('aria-expanded', 'false');
    }

    if (adminSidebarToggle && adminSidebar && adminSidebarBackdrop) {
        adminSidebarToggle.addEventListener('click', () => {
            triggerHaptic(10);
            const isOpen = adminSidebar.classList.toggle('open');
            adminSidebarBackdrop.classList.toggle('open', isOpen);
            adminSidebarToggle.setAttribute('aria-expanded', String(isOpen));
        });
        adminSidebarBackdrop.addEventListener('click', closeAdminSidebarDrawer);
    }

    function activateTab(btn, panel) {
        triggerHaptic(10);
        allTabBtns.forEach(b => b.classList.remove('active'));
        allPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        panel.classList.add('active');
        closeAdminSidebarDrawer();
    }

    tabSummaryBtn.addEventListener('click', () => {
        activateTab(tabSummaryBtn, panelSummary);
        loadAndRenderAdminStats();
    });

    if (tabAnalyticsBtn && panelAnalytics) {
        tabAnalyticsBtn.addEventListener('click', () => {
            activateTab(tabAnalyticsBtn, panelAnalytics);
            loadAndRenderAnalytics();
        });
    }

    const btnRefreshAnalytics = document.getElementById('btn-refresh-analytics');
    if (btnRefreshAnalytics) {
        btnRefreshAnalytics.addEventListener('click', () => {
            triggerHaptic(10);
            loadAndRenderAnalytics(true);
        });
    }

    const btnAnalyticsPdf = document.getElementById('btn-analytics-pdf');
    if (btnAnalyticsPdf) {
        btnAnalyticsPdf.addEventListener('click', async () => {
            triggerHaptic(10);
            await loadAndRenderAnalytics();
            const salesHistory = analyticsSalesCache[analyticsRangeDays] || [];
            const rangeLabels = { 30: 'Últimos 30 días', 60: 'Últimos 60 días', 90: 'Últimos 90 días', 0: 'Todo el historial' };
            window.UIManager.exportSalesAnalyticsToPDF(salesHistory, products, rangeLabels[analyticsRangeDays] || '');
        });
    }

    const analyticsRangeBtns = {
        30: document.getElementById('btn-analytics-range-30'),
        60: document.getElementById('btn-analytics-range-60'),
        90: document.getElementById('btn-analytics-range-90'),
        0: document.getElementById('btn-analytics-range-all') // 0 = sin recorte de fecha (todo el historial)
    };
    Object.entries(analyticsRangeBtns).forEach(([days, btn]) => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            triggerHaptic(10);
            analyticsRangeDays = Number(days);
            Object.values(analyticsRangeBtns).forEach(b => {
                if (!b) return;
                b.classList.toggle('active', b === btn);
            });
            loadAndRenderAnalytics();
        });
    });

    const btnPrepToday = document.getElementById('btn-analytics-prep-today');
    const btnPrepTomorrow = document.getElementById('btn-analytics-prep-tomorrow');
    if (btnPrepToday && btnPrepTomorrow) {
        const updatePrepToggleUI = (mode) => {
            const todayActive = mode === 'today';
            btnPrepToday.classList.toggle('active', todayActive);
            btnPrepTomorrow.classList.toggle('active', !todayActive);
        };
        btnPrepToday.addEventListener('click', () => {
            triggerHaptic(10);
            analyticsPrepMode = 'today';
            updatePrepToggleUI('today');
            loadAndRenderAnalytics();
        });
        btnPrepTomorrow.addEventListener('click', () => {
            triggerHaptic(10);
            analyticsPrepMode = 'tomorrow';
            updatePrepToggleUI('tomorrow');
            loadAndRenderAnalytics();
        });
    }

    tabProductsBtn.addEventListener('click', () => {
        activateTab(tabProductsBtn, panelProducts);
        window.UIManager.renderSettingsProducts(products, editProductPrompt, deleteProduct);
    });

    tabDevicesBtn.addEventListener('click', () => {
        activateTab(tabDevicesBtn, panelDevices);
        loadAndRenderActiveDevices();
    });

    tabLogsBtn.addEventListener('click', async () => {
        activateTab(tabLogsBtn, panelLogs);
        await refreshActivityLogsView();
    });

    const btnRecentActivityVerTodo = document.getElementById('btn-recent-activity-ver-todo');
    if (btnRecentActivityVerTodo) {
        // Reusa el mismo botón de pestaña -- no duplica la lógica de
        // activar tab + cargar logs, solo la dispara desde otro lugar.
        btnRecentActivityVerTodo.addEventListener('click', () => tabLogsBtn.click());
    }

    const btnDashboardPdf = document.getElementById('btn-dashboard-pdf');
    if (btnDashboardPdf) {
        btnDashboardPdf.addEventListener('click', () => window.UIManager.exportDashboardSummaryToPDF());
    }

    if (tabCostsBtn && panelCosts) {
        tabCostsBtn.addEventListener('click', () => {
            activateTab(tabCostsBtn, panelCosts);
            window.UIManager.renderCostCalculator(products, costInsumos, handleDeleteCostInsumo);
        });
    }

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
        // normalize to the current period start first so setMonth can't overflow
        // a 29-31 day-of-month, then step and re-normalize.
        pnlAnchor = pnlRange(pnlMode, pnlAnchor).start;
        if (pnlMode === 'month') pnlAnchor.setMonth(pnlAnchor.getMonth() - 1);
        else pnlAnchor.setDate(pnlAnchor.getDate() - 7);
        pnlAnchor = pnlRange(pnlMode, pnlAnchor).start;
        loadPnl();
    });
    if (pnlNext) pnlNext.addEventListener('click', () => {
        if (!pnlCanGoNext()) return;
        pnlAnchor = pnlRange(pnlMode, pnlAnchor).start;
        if (pnlMode === 'month') pnlAnchor.setMonth(pnlAnchor.getMonth() + 1);
        else pnlAnchor.setDate(pnlAnchor.getDate() + 7);
        pnlAnchor = pnlRange(pnlMode, pnlAnchor).start;
        loadPnl();
    });
    const pnlRefresh = document.getElementById('btn-pnl-refresh');
    if (pnlRefresh) pnlRefresh.addEventListener('click', () => loadPnl(true));
    const pnlPdf = document.getElementById('btn-pnl-pdf');
    if (pnlPdf) pnlPdf.addEventListener('click', () => {
        if (pnlLast) window.UIManager.exportPnlToPDF(pnlLast, { mode: pnlMode, bcvRate: window.bcvRate || 1 });
    });

    if (tabAgentBtn && panelAgent) {
        tabAgentBtn.addEventListener('click', () => {
            activateTab(tabAgentBtn, panelAgent);
        });
    }

    tabPreferencesBtn.addEventListener('click', () => {
        activateTab(tabPreferencesBtn, panelPreferences);
        // "Asignar PIN" only gets populated as a side effect of
        // loadAndRenderAdminStats(), which otherwise only runs from the
        // Dashboard tab's click handler. Landing here directly (e.g. via the
        // gear-icon shortcut, which defaults admins to Productos, not
        // Dashboard) used to leave the select on the static HTML's
        // "Cargando usuarios..." placeholder forever.
        loadAndRenderUsersManagement();
    });

    // Form to Add New Cost Insumo
    const formAddInsumo = document.getElementById('form-add-cost-insumo');
    if (formAddInsumo) {
        formAddInsumo.addEventListener('submit', (e) => {
            e.preventDefault();
            triggerHaptic(15);
            const name = document.getElementById('cost-insumo-name').value.trim();
            const type = document.getElementById('cost-insumo-type').value;
            const qty = parseFloat(document.getElementById('cost-insumo-qty').value) || 1;
            const price = parseFloat(document.getElementById('cost-insumo-price').value) || 0;

            if (!name || qty <= 0 || price <= 0) return;

            let unitLabel = 'kg';
            if (type === 'liquid') unitLabel = 'L';
            if (type === 'unit') unitLabel = 'unid.';

            const newInsumo = {
                id: 'ins_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
                name,
                type,
                qty,
                price,
                unit: unitLabel
            };

            costInsumos.push(newInsumo);
            window.StorageManager.saveCostInsumos(costInsumos);
            formAddInsumo.reset();

            window.UIManager.renderCostCalculator(products, costInsumos, handleDeleteCostInsumo);
            window.UIManager.showToast(`📦 Insumo "${name}" registrado correctamente.`, "fa-solid fa-circle-check");
            logActivity("Calculadora Costos", `Nuevo insumo registrado: ${name} ($${price.toFixed(2)} / ${qty}${unitLabel})`);
        });
    }

    const costProdSelect = document.getElementById('cost-calc-product-select');
    const costSellPriceInput = document.getElementById('cost-calc-sell-price');
    if (costProdSelect) {
        costProdSelect.addEventListener('change', () => {
            window.UIManager.renderCostFinancialResults(products, costInsumos);
        });
    }
    if (costSellPriceInput) {
        costSellPriceInput.addEventListener('input', () => {
            window.UIManager.renderCostFinancialResults(products, costInsumos);
        });
    }

    // Bind Payment Methods Day/Week toggle buttons
    const btnPayDay = document.getElementById('btn-stats-payment-day');
    const btnPayWeek = document.getElementById('btn-stats-payment-week');
    if (btnPayDay && btnPayWeek) {
        btnPayDay.addEventListener('click', () => {
            triggerHaptic(10);
            paymentStatsFilter = 'day';
            window.UIManager.renderPaymentAndCategoryStats(adminStatsSales, products, paymentStatsFilter, categoryStatsFilter);
        });
        btnPayWeek.addEventListener('click', () => {
            triggerHaptic(10);
            paymentStatsFilter = 'week';
            window.UIManager.renderPaymentAndCategoryStats(adminStatsSales, products, paymentStatsFilter, categoryStatsFilter);
        });
    }

    // Bind Category Performance Day/Week toggle buttons
    const btnCatDay = document.getElementById('btn-stats-cat-day');
    const btnCatWeek = document.getElementById('btn-stats-cat-week');
    if (btnCatDay && btnCatWeek) {
        btnCatDay.addEventListener('click', () => {
            triggerHaptic(10);
            categoryStatsFilter = 'day';
            window.UIManager.renderPaymentAndCategoryStats(adminStatsSales, products, paymentStatsFilter, categoryStatsFilter);
        });
        btnCatWeek.addEventListener('click', () => {
            triggerHaptic(10);
            categoryStatsFilter = 'week';
            window.UIManager.renderPaymentAndCategoryStats(adminStatsSales, products, paymentStatsFilter, categoryStatsFilter);
        });
    }

    // Refresh logs button
    const refreshLogsBtn = document.getElementById('btn-admin-logs-refresh');
    if (refreshLogsBtn) {
        refreshLogsBtn.addEventListener('click', async () => {
            triggerHaptic(15);
            await refreshActivityLogsView();
        });
    }

    // Bitácora search -- filters the already-fetched logs client-side, no
    // need to hit Supabase again per keystroke.
    const logsSearchInput = document.getElementById('admin-logs-search');
    if (logsSearchInput) {
        logsSearchInput.addEventListener('input', () => applyActivityLogsFilter());
    }

    // Security PINs form submission
    const pinesForm = document.getElementById('admin-pines-form');
    if (pinesForm) {
        pinesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            triggerHaptic(20);
            
            const newLocal = document.getElementById('pref-pin-local').value.trim();
            const newCocina = document.getElementById('pref-pin-cocina').value.trim();
            const newAdmin = document.getElementById('pref-pin-admin').value.trim();

            if (!newLocal || !newCocina || !newAdmin) {
                window.UIManager.showToast("⚠️ Todos los PINes son obligatorios.", "fa-solid fa-triangle-exclamation");
                return;
            }

            pinLocal = newLocal;
            pinCocina = newCocina;
            pinAdmin = newAdmin;

            localStorage.setItem('casa_lucenzo_pin_local', pinLocal);
            localStorage.setItem('casa_lucenzo_pin_cocina', pinCocina);
            localStorage.setItem('casa_lucenzo_pin_admin', pinAdmin);

            if (window.SupabaseManager.isConfigured()) {
                window.UIManager.showToast("⏳ Guardando pines en Supabase...", "fa-solid fa-spinner");
                await window.SupabaseManager.upsertAppConfig({
                    bcvRate: bcvRate,
                    useAutoBcv: useAutoBcv,
                    pinLocal: pinLocal,
                    pinCocina: pinCocina,
                    pinAdmin: pinAdmin
                });
            }

            window.UIManager.showToast("🔒 Pines actualizados correctamente.", "fa-solid fa-lock");
            logActivity("Ajuste Seguridad", `Pines actualizados (Local: ${pinLocal}, Cocina: ${pinCocina}, Admin: ${pinAdmin})`);
        });
    }

    // Live price calculation in Bs.
    const editPriceInput = document.getElementById('edit-prod-price');
    if (editPriceInput) {
        editPriceInput.addEventListener('input', updateEditPriceBsPreview);
    }

    // Steppers (-) and (+) for Stock, Max Vitrina, and Alerta Mínima
    const bindEditStepper = (btnMinusId, btnPlusId, inputId, minVal = 0) => {
        const btnMinus = document.getElementById(btnMinusId);
        const btnPlus = document.getElementById(btnPlusId);
        const inputEl = document.getElementById(inputId);
        if (btnMinus && btnPlus && inputEl) {
            btnMinus.addEventListener('click', () => {
                triggerHaptic(10);
                const current = parseInt(inputEl.value) || 0;
                inputEl.value = Math.max(minVal, current - 1);
            });
            btnPlus.addEventListener('click', () => {
                triggerHaptic(10);
                const current = parseInt(inputEl.value) || 0;
                inputEl.value = current + 1;
            });
        }
    };

    bindEditStepper('btn-edit-stock-minus', 'btn-edit-stock-plus', 'edit-prod-stock', 0);
    bindEditStepper('btn-edit-max-minus', 'btn-edit-max-plus', 'edit-prod-max', 0);
    bindEditStepper('btn-edit-min-minus', 'btn-edit-min-plus', 'edit-prod-min', 0);

    // Admin Quick PIN configuration listener (Admin Authority Only)
    const adminPinForm = document.getElementById('admin-pin-config-form');
    if (adminPinForm) {
        adminPinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            triggerHaptic(15);

            if (currentRole !== 'admin') {
                if (window.UIManager) window.UIManager.showToast("⛔ Solo el perfil Administrador tiene la potestad de asignar PINs.", "fa-solid fa-lock");
                return;
            }

            const targetSelect = document.getElementById('select-admin-target-user');
            const targetUserId = targetSelect ? targetSelect.value : '';
            const targetUserName = targetSelect && targetSelect.options[targetSelect.selectedIndex] ? targetSelect.options[targetSelect.selectedIndex].text : 'Usuario';
            
            const pinInput = document.getElementById('input-admin-quick-pin');
            const pinVal = (pinInput ? pinInput.value : '').trim();

            if (!targetUserId) {
                if (window.UIManager) window.UIManager.showToast("⚠️ Selecciona un usuario válido.", "fa-solid fa-user-xmark");
                return;
            }

            if (!pinVal || pinVal.length !== 4 || !/^\d{4}$/.test(pinVal)) {
                if (window.UIManager) window.UIManager.showToast("⚠️ El PIN debe ser exactamente de 4 números.", "fa-solid fa-circle-exclamation");
                return;
            }

            if (window.SupabaseManager && window.SupabaseManager.isConfigured()) {
                const { success, error } = await window.SupabaseManager.setUserPinByAdmin(targetUserId, pinVal);
                if (success) {
                    if (pinInput) pinInput.value = '';
                    if (window.UIManager) window.UIManager.showToast(`🔑 ¡PIN asignado exitosamente a ${targetUserName}!`, "fa-solid fa-shield-check");
                    logActivity("Configuración PIN", `Admin asignó nuevo PIN a ${targetUserName}`);
                } else {
                    if (window.UIManager) window.UIManager.showToast(`❌ Error al guardar PIN: ${error ? error.message : 'falló la conexión'}`, "fa-solid fa-circle-xmark");
                }
            } else {
                if (window.UIManager) window.UIManager.showToast("⚠️ Conexión con Supabase no disponible para guardar PIN.", "fa-solid fa-wifi");
            }
        });
    }

    // Edit Product form submission
    const editProductForm = document.getElementById('edit-product-form');
    if (editProductForm) {
        editProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            triggerHaptic(20);
            
            const id = document.getElementById('edit-prod-id').value;
            const product = products.find(p => p.id === id);
            if (!product) return;

            const newName = document.getElementById('edit-prod-name').value.trim();
            const newPrice = parseFloat(document.getElementById('edit-prod-price').value) || 0;
            const newCost = parseFloat(document.getElementById('edit-prod-cost').value) || 0;
            const newCategory = document.getElementById('edit-prod-category').value;
            const stockVal = parseInt(document.getElementById('edit-prod-stock').value) || 0;
            const maxValRaw = parseInt(document.getElementById('edit-prod-max').value);
            const maxVal = isNaN(maxValRaw) ? 0 : Math.max(0, maxValRaw);
            const minVal = parseInt(document.getElementById('edit-prod-min').value) || 0;

            if (!newName) {
                alert("El nombre no puede estar vacío.");
                return;
            }

            const oldMax = product.max || 0;

            product.name = newName;
            product.price = newPrice;
            product.cost = newCost;
            product.category = newCategory;
            product.min = minVal;

            // Typing a higher stock here is how the day's batch gets loaded, so
            // it has to move the baseline exactly like any other load -- this
            // was the path that left `initial_stock` at 0 all day.
            applyStockCount(product, stockVal);

            // An explicitly retyped max wins; otherwise capacity just follows
            // the shelf (it used to be incremented on every edit and grew
            // without bound across days).
            product.max = (maxVal !== oldMax) ? Math.max(maxVal, product.stock) : resolveVitrinaCapacity(product);

            window.StorageManager.saveProducts(products);

            if (window.SupabaseManager.isConfigured()) {
                window.SupabaseManager.upsertProduct(product);
            }

            // Close modal
            document.getElementById('edit-product-modal').classList.add('hidden');

            window.UIManager.renderSettingsProducts(products, editProductPrompt, deleteProduct);
            window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
            window.UIManager.showToast("✏️ Producto editado correctamente.", "fa-solid fa-pen-to-square");
            logActivity("Producto Editado", `Editado: ${product.name} (Stock: ${stockVal}, Max: ${maxVal}, Precio: $${newPrice.toFixed(2)}, Costo: Bs.${newCost.toFixed(2)}, Cat: ${newCategory})`);
        });
    }

    const btnEditProductCancel = document.getElementById('btn-edit-product-cancel');
    if (btnEditProductCancel) {
        btnEditProductCancel.addEventListener('click', () => {
            triggerHaptic(10);
            document.getElementById('edit-product-modal').classList.add('hidden');
        });
    }

    const btnEditProductClose = document.getElementById('btn-edit-product-close');
    if (btnEditProductClose) {
        btnEditProductClose.addEventListener('click', () => {
            triggerHaptic(10);
            document.getElementById('edit-product-modal').classList.add('hidden');
        });
    }

    // Hourly stats toggle button listeners
    const btnHourlyToday = document.getElementById('btn-hourly-today');
    const btnHourlyWeekly = document.getElementById('btn-hourly-weekly');
    if (btnHourlyToday && btnHourlyWeekly) {
        btnHourlyToday.addEventListener('click', () => {
            triggerHaptic(10);
            hourlyActiveMode = 'today';
            btnHourlyToday.classList.add('active');
            btnHourlyWeekly.classList.remove('active');
            window.UIManager.renderHourlyStats(adminStatsSales, hourlyActiveMode);
        });

        btnHourlyWeekly.addEventListener('click', () => {
            triggerHaptic(10);
            hourlyActiveMode = 'weekly';
            btnHourlyWeekly.classList.add('active');
            btnHourlyToday.classList.remove('active');
            window.UIManager.renderHourlyStats(adminStatsSales, hourlyActiveMode);
        });

        const btnHourlyPdf = document.getElementById('btn-hourly-pdf');
        if (btnHourlyPdf) {
            btnHourlyPdf.addEventListener('click', () => {
                triggerHaptic(15);
                window.UIManager.exportHourlyStatsToPDF(adminStatsSales, hourlyActiveMode);
            });
        }
    }
}

/**
 * Fetch and render recent audit activity logs in admin logs panel
 */
async function refreshActivityLogsView() {
    if (window.SupabaseManager.isConfigured()) {
        currentActivityLogs = await window.SupabaseManager.fetchActivityLogs();
    } else {
        const localLogs = JSON.parse(localStorage.getItem('casa_lucenzo_local_activity_logs') || '[]');
        currentActivityLogs = [...localLogs].reverse();
    }
    applyActivityLogsFilter();
}

/**
 * Re-render the Bitácora table from currentActivityLogs, filtered by
 * whatever's currently typed in #admin-logs-search (action, details, actor).
 */
function applyActivityLogsFilter() {
    const searchInput = document.getElementById('admin-logs-search');
    const term = (searchInput?.value || '').trim().toLowerCase();

    if (!term) {
        window.UIManager.renderActivityLogs(currentActivityLogs);
        return;
    }

    const filtered = currentActivityLogs.filter(log => {
        return (log.action || '').toLowerCase().includes(term)
            || (log.details || '').toLowerCase().includes(term)
            || (log.actor_name || '').toLowerCase().includes(term)
            || (log.role || '').toLowerCase().includes(term);
    });
    window.UIManager.renderActivityLogs(filtered, true);
}

/**
 * Initialize event handlers and chat behavior for the AI Agent
 */
function initAgentListeners() {
    const chatForm = document.getElementById('agent-chat-form');
    const chatInput = document.getElementById('agent-chat-input');
    const chatMessages = document.getElementById('agent-chat-messages');
    const prefGeminiKey = document.getElementById('pref-gemini-key');

    if (prefGeminiKey && window.AgentManager) {
        prefGeminiKey.value = window.AgentManager.getGeminiApiKey();
        prefGeminiKey.addEventListener('change', () => {
            window.AgentManager.setGeminiApiKey(prefGeminiKey.value);
            window.UIManager.showToast("🔑 API Key de Gemini guardada correctamente.", "fa-solid fa-key");
        });
    }

    if (!chatForm || !chatInput || !chatMessages) return;

    const handleSendPrompt = async (promptText) => {
        const text = promptText.trim();
        if (!text) return;

        triggerHaptic(10);
        appendAgentMessage('user', text);
        chatInput.value = '';

        const typingEl = appendAgentTyping();

        const context = {
            products: products,
            salesLog: salesLog,
            expenses: expenses,
            bcvRate: bcvRate,
            actions: {
                addExpense: (desc, amount) => {
                    const newExpense = {
                        id: 'exp_' + Math.random().toString(36).substring(2) + Date.now().toString(36),
                        description: desc,
                        amount: amount,
                        date: new Date().toISOString()
                    };
                    expenses.push(newExpense);
                    window.StorageManager.saveExpenses(expenses);
                    if (window.SupabaseManager.isConfigured()) {
                        window.SupabaseManager.insertExpense(newExpense);
                    }
                    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
                    logActivity("Gasto por IA", `Agregado gasto: ${desc} ($${amount})`);
                },
                updateProductPrice: (prodId, newPrice) => {
                    const prod = products.find(p => p.id === prodId);
                    if (prod) {
                        prod.price = newPrice;
                        window.StorageManager.saveProducts(products);
                        if (window.SupabaseManager.isConfigured()) {
                            window.SupabaseManager.upsertProduct(prod);
                        }
                        window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
                        logActivity("Precio por IA", `Actualizado precio de ${prod.name} a $${newPrice}`);
                    }
                },
                resetToMax: () => {
                    resetToMax();
                },
                addNewProduct: (prodData) => {
                    const newProd = {
                        id: 'prod_' + Math.random().toString(36).substring(2),
                        name: prodData.name,
                        price: prodData.price,
                        stock: prodData.stock || 15,
                        min: prodData.min || 5,
                        max: prodData.max || 15,
                        unit: prodData.unit || 'unid.',
                        category: prodData.category || 'pastelitos'
                    };
                    products.push(newProd);
                    window.StorageManager.saveProducts(products);
                    if (window.SupabaseManager.isConfigured()) {
                        window.SupabaseManager.upsertProduct(newProd);
                    }
                    window.UIManager.renderLocal(products, adjustStock, activeCategory, searchQuery);
                    logActivity("Producto por IA", `Creado producto: ${prodData.name} ($${prodData.price})`);
                }
            }
        };

        try {
            const response = await window.AgentManager.processQuery(text, context);
            typingEl.remove();
            appendAgentMessage('agent', response.text);
        } catch (e) {
            console.error("Error processing agent query:", e);
            typingEl.remove();
            appendAgentMessage('agent', "❌ Lo siento, ocurrió un error al procesar tu solicitud.");
        }
    };

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSendPrompt(chatInput.value);
    });

    document.querySelectorAll('.agent-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.getAttribute('data-prompt');
            if (prompt) {
                handleSendPrompt(prompt);
            }
        });
    });
}

function appendAgentMessage(sender, text) {
    const chatMessages = document.getElementById('agent-chat-messages');
    if (!chatMessages) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `agent-msg ${sender}`;

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'agent-msg-bubble';
    
    let formatted = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');

    bubbleDiv.innerHTML = formatted;
    msgDiv.appendChild(bubbleDiv);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendAgentTyping() {
    const chatMessages = document.getElementById('agent-chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'agent-msg agent';

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'agent-msg-bubble';
    bubbleDiv.innerHTML = `<em>🤖 Pensando...</em>`;
    msgDiv.appendChild(bubbleDiv);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleUserLogin,
        calculateTotals: (sales, expenses) => (typeof window !== 'undefined' && window.SalesManager ? window.SalesManager.calculateTotals(sales, expenses) : require('./sales.js').calculateTotals(sales, expenses)),
        validateStockAdjustment: (stock, delta) => (typeof window !== 'undefined' && window.InventoryManager ? window.InventoryManager.validateStockAdjustment(stock, delta) : require('./inventory.js').validateStockAdjustment(stock, delta)),
        checkRolePermission: (role, action) => (typeof window !== 'undefined' && window.AuthManager ? window.AuthManager.checkRolePermission(role, action) : require('./auth.js').checkRolePermission(role, action)),
        applyStockLoad,
        applyStockCount,
        resolveVitrinaCapacity,
        bcvRateChangedEnough
    };
}
