// LocalStorage management for Casa Lucenzo inventory, sales, expenses, debts, and ingredients

const DEFAULT_PRODUCTS = [
    { id: 'mechada', name: 'Carne Mechada', stock: 20, min: 6, max: 20, unit: 'unid.', price: 1.50, category: 'pastelitos' },
    { id: 'pollo', name: 'Pollo', stock: 20, min: 6, max: 20, unit: 'unid.', price: 1.50, category: 'pastelitos' },
    { id: 'molida', name: 'Carne Molida', stock: 12, min: 4, max: 12, unit: 'unid.', price: 1.50, category: 'pastelitos' },
    { id: 'queso', name: 'Queso', stock: 8, min: 3, max: 8, unit: 'unid.', price: 1.20, category: 'pastelitos' },
    { id: 'estaciones', name: '4 Estaciones (Especial)', stock: 12, min: 4, max: 12, unit: 'unid.', price: 1.80, category: 'pastelitos' },
    { id: 'primavera', name: 'Primavera (Especial)', stock: 8, min: 3, max: 8, unit: 'unid.', price: 1.80, category: 'pastelitos' },
    { id: 'ricota', name: 'Ricota con Tocineta', stock: 8, min: 3, max: 8, unit: 'unid.', price: 1.80, category: 'pastelitos' },
    { id: 'tocineta', name: 'Tocineta con Queso', stock: 12, min: 4, max: 12, unit: 'unid.', price: 1.80, category: 'pastelitos' },
    { id: 'malta', name: 'Malta Retornable', stock: 24, min: 6, max: 24, unit: 'botellas', price: 1.00, category: 'bebidas' },
    { id: 'samba_fresa', name: 'Samba de fresa', stock: 20, min: 5, max: 20, unit: 'unid.', price: 1.06, category: 'dulces' },
    { id: 'cocosette_maxi', name: 'Cocosette Maxi', stock: 18, min: 4, max: 18, unit: 'unid.', price: 0.90, category: 'dulces' },
    { id: 'susy_maxi', name: 'Susy Maxi', stock: 18, min: 4, max: 18, unit: 'unid.', price: 0.90, category: 'dulces' },
    { id: 'savoy_leche', name: 'Chocolate de Leche SAVOY 30 gr', stock: 12, min: 3, max: 12, unit: 'unid.', price: 1.44, category: 'dulces' },
    { id: 'savoy_cricri', name: 'Chocolate CRICRI SAVOY 30 gr', stock: 12, min: 3, max: 12, unit: 'unid.', price: 1.44, category: 'dulces' },
    { id: 'savoy_rikiti', name: 'Chocolate MANI RIKITI SAVOY 30 gr', stock: 12, min: 3, max: 12, unit: 'unid.', price: 1.44, category: 'dulces' },
    { id: 'pirulin_16g', name: 'Pirulin 16 gr', stock: 25, min: 5, max: 25, unit: 'unid.', price: 0.65, category: 'dulces' }
];

const DEFAULT_INGREDIENTS = [
    { id: 'harina', name: 'Harina de Trigo', stock: 25.0, unit: 'kg' },
    { id: 'margarina', name: 'Margarina / Grasa', stock: 10.0, unit: 'kg' },
    { id: 'carne_mechada', name: 'Carne Mechada (Relleno)', stock: 15.0, unit: 'kg' },
    { id: 'pollo', name: 'Pollo Desmechado (Relleno)', stock: 15.0, unit: 'kg' },
    { id: 'queso', name: 'Queso Blanco (Relleno)', stock: 10.0, unit: 'kg' }
];

const DEFAULT_USERS = [
    { id: 'usr_admin', username: 'admin', name: 'Enzo (Administrador)', role: 'admin', active: true },
    { id: 'usr_vendedora', username: 'vendedora', name: 'Vendedora POS', role: 'venta', active: true },
    { id: 'usr_cocina', username: 'cocina', name: 'Equipo de Cocina', role: 'cocina', active: true }
];

const INVENTORY_KEY = 'casa_lucenzo_inventory_modular';
const SALES_LOG_KEY = 'casa_lucenzo_sales_log';
const EXPENSES_KEY = 'casa_lucenzo_expenses';
const DEBTS_KEY = 'casa_lucenzo_debts';
const REPLENISHMENTS_KEY = 'casa_lucenzo_replenishments';
const PREFERENCES_KEY = 'casa_lucenzo_preferences';
const INGREDIENTS_KEY = 'casa_lucenzo_ingredients';
const USERS_KEY = 'casa_lucenzo_users';

function getProductCategory(p) {
    if (!p) return 'pastelitos';
    const idLower = (p.id || '').toLowerCase();
    const nameLower = (p.name || '').toLowerCase();

    const sweetKeywords = ['samba', 'cocosette', 'susy', 'savoy', 'pirulin', 'chocolate', 'cricri', 'rikiti', 'dulce', 'galleta', 'caramelo', 'nucita'];
    if (sweetKeywords.some(kw => idLower.includes(kw) || nameLower.includes(kw))) {
        return 'dulces';
    }

    const beverageKeywords = ['malta', 'refresco', 'jugo', 'agua', 'bebida', 'pepsi', 'coca', 'chinotto', 'hit', '7up', 'nestea', 'nestae'];
    if (beverageKeywords.some(kw => idLower.includes(kw) || nameLower.includes(kw))) {
        return 'bebidas';
    }

    if (p.category && p.category.trim() !== '') {
        return p.category;
    }

    return p.category || 'pastelitos';
}

/**
 * Loads products from localStorage, or returns default products if empty.
 */
function loadProducts() {
    const saved = localStorage.getItem(INVENTORY_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            
            // Auto-migration: check if database contains old high-limit max values (e.g. Mechada max = 50)
            const needsMigration = parsed.some(p => p.id === 'mechada' && p.max === 50);
            
            if (needsMigration) {
                console.log("Old stock limits detected. Migrating to new stock limits...");
                saveProducts(DEFAULT_PRODUCTS);
                return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
            }

            // Auto-merge missing default products (e.g. dulces)
            let updated = false;
            DEFAULT_PRODUCTS.forEach(defProd => {
                if (!parsed.some(p => p.id === defProd.id)) {
                    parsed.push({ ...defProd });
                    updated = true;
                }
            });
            if (updated) {
                saveProducts(parsed);
            }

            return parsed.map(p => ({
                ...p,
                price: p.price !== undefined ? parseFloat(p.price) : 1.50,
                category: getProductCategory(p)
            }));
        } catch (e) {
            console.error("Error reading from local storage, loading defaults", e);
            return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
        }
    }
    return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
}

function saveProducts(products) {
    try {
        localStorage.setItem(INVENTORY_KEY, JSON.stringify(products));
    } catch (e) {
        console.error("Failed to save to local storage", e);
    }
}

function resetToDefaults() {
    try {
        localStorage.removeItem(INVENTORY_KEY);
        localStorage.removeItem(SALES_LOG_KEY);
        localStorage.removeItem(EXPENSES_KEY);
        localStorage.removeItem(DEBTS_KEY);
        localStorage.removeItem(REPLENISHMENTS_KEY);
        localStorage.removeItem(PREFERENCES_KEY);
        localStorage.removeItem(INGREDIENTS_KEY);
    } catch(e) {
        console.error("Failed to clear local storage", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
}

// ================= SALES =================

function loadSalesLog() {
    const saved = localStorage.getItem(SALES_LOG_KEY);
    return saved ? JSON.parse(saved) : [];
}

function saveSalesLog(log) {
    localStorage.setItem(SALES_LOG_KEY, JSON.stringify(log));
}

function clearSalesLog() {
    localStorage.removeItem(SALES_LOG_KEY);
}

// ================= EXPENSES =================

function loadExpenses() {
    const saved = localStorage.getItem(EXPENSES_KEY);
    return saved ? JSON.parse(saved) : [];
}

function saveExpenses(expenses) {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
}

function clearExpenses() {
    localStorage.removeItem(EXPENSES_KEY);
}

// ================= DEBTS (FIADOS) =================

function loadDebts() {
    const saved = localStorage.getItem(DEBTS_KEY);
    return saved ? JSON.parse(saved) : [];
}

function saveDebts(debts) {
    localStorage.setItem(DEBTS_KEY, JSON.stringify(debts));
}

function clearDebts() {
    localStorage.removeItem(DEBTS_KEY);
}

// ================= REPLENISHMENTS (DISPATCHES) =================

function loadReplenishments() {
    const saved = localStorage.getItem(REPLENISHMENTS_KEY);
    return saved ? JSON.parse(saved) : [];
}

function saveReplenishments(repls) {
    localStorage.setItem(REPLENISHMENTS_KEY, JSON.stringify(repls));
}

function clearReplenishments() {
    localStorage.removeItem(REPLENISHMENTS_KEY);
}

// ================= INGREDIENTS =================

function loadIngredients() {
    const saved = localStorage.getItem(INGREDIENTS_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch(e) {
            return JSON.parse(JSON.stringify(DEFAULT_INGREDIENTS));
        }
    }
    return JSON.parse(JSON.stringify(DEFAULT_INGREDIENTS));
}

function saveIngredients(ingredients) {
    localStorage.setItem(INGREDIENTS_KEY, JSON.stringify(ingredients));
}

// ================= PREFERENCES =================

function loadPreferences() {
    const saved = localStorage.getItem(PREFERENCES_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch(e) {
            return { sound: true, vibration: true };
        }
    }
    return { sound: true, vibration: true };
}

function savePreferences(prefs) {
    try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
    } catch(e) {
        console.error("Failed to save preferences", e);
    }
}

// ================= PIN LOCKOUT (Plan B, Task 10) =================
//
// Per-user, persisted across reloads -- unlike the in-memory lockoutUntil/
// failedPinAttempts pair handleUserLogin() uses (a full password login is
// inherently online-only, so that one wasn't touched by this task).
// Deliberately local-only: profiles.pin_failed_attempts/pin_locked_until in
// Postgres are only ever written by the SECURITY DEFINER PIN RPCs, because
// the one UPDATE policy on profiles requires role='admin' (migración 001) --
// a plain client-side write here for a non-admin user would just get
// silently rejected by RLS once PowerSync tried to upload it. Keeping this
// counter local-only sidesteps that instead of fighting it.
const PIN_LOCKOUT_KEY_PREFIX = 'casa_lucenzo_pin_lockout_';

function loadPinLockoutState(userId) {
    try {
        const raw = localStorage.getItem(PIN_LOCKOUT_KEY_PREFIX + userId);
        if (!raw) return { attempts: 0, lockedUntil: null };
        const parsed = JSON.parse(raw);
        return { attempts: parsed.attempts || 0, lockedUntil: parsed.lockedUntil || null };
    } catch (e) {
        return { attempts: 0, lockedUntil: null };
    }
}

function savePinLockoutState(userId, state) {
    try {
        localStorage.setItem(PIN_LOCKOUT_KEY_PREFIX + userId, JSON.stringify(state));
    } catch (e) {
        console.error("Failed to save PIN lockout state", e);
    }
}

const BCV_PREFS_KEY = 'casa_lucenzo_bcv_prefs';

function loadBcvPreferences() {
    const saved = localStorage.getItem(BCV_PREFS_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch(e) {
            return { bcvRate: 732.48, useAutoBcv: true };
        }
    }
    return { bcvRate: 732.48, useAutoBcv: true };
}

function saveBcvPreferences(rate, auto) {
    try {
        localStorage.setItem(BCV_PREFS_KEY, JSON.stringify({ bcvRate: parseFloat(rate) || 732.48, useAutoBcv: !!auto }));
    } catch(e) {
        console.error("Failed to save BCV preferences", e);
    }
}

const BCV_LAST_FETCH_KEY = 'casa_lucenzo_bcv_last_fetch';

function loadBcvLastFetch() {
    return localStorage.getItem(BCV_LAST_FETCH_KEY);
}

function saveBcvLastFetch(iso) {
    try {
        localStorage.setItem(BCV_LAST_FETCH_KEY, iso || '');
    } catch(e) {
        console.error("Failed to save BCV last fetch time", e);
    }
}



const LAST_CLOSE_KEY = 'casa_lucenzo_last_close_time';

function loadLastCloseTime() {
    return localStorage.getItem(LAST_CLOSE_KEY);
}

function saveLastCloseTime(time) {
    localStorage.setItem(LAST_CLOSE_KEY, time || '');
}

const COST_INSUMOS_KEY = 'casa_lucenzo_cost_insumos';

const DEFAULT_COST_INSUMOS = [
    { id: 'harina', name: 'Harina de Trigo', type: 'solid', qty: 25, price: 22.00, unit: 'kg' },
    { id: 'margarina', name: 'Margarina / Grasa', type: 'solid', qty: 10, price: 18.00, unit: 'kg' },
    { id: 'carne_mechada', name: 'Carne Mechada Guisada', type: 'solid', qty: 15, price: 75.00, unit: 'kg' },
    { id: 'pollo', name: 'Pollo Guisado desmechado', type: 'solid', qty: 15, price: 50.00, unit: 'kg' },
    { id: 'queso', name: 'Queso Blanco Rayado', type: 'solid', qty: 10, price: 45.00, unit: 'kg' },
    { id: 'aceite', name: 'Aceite de Fritura (Líquido)', type: 'liquid', qty: 10, price: 20.00, unit: 'L' },
    { id: 'tocineta', name: 'Tocineta picada', type: 'solid', qty: 5, price: 30.00, unit: 'kg' }
];

function loadCostInsumos() {
    const saved = localStorage.getItem(COST_INSUMOS_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            return JSON.parse(JSON.stringify(DEFAULT_COST_INSUMOS));
        }
    }
    return JSON.parse(JSON.stringify(DEFAULT_COST_INSUMOS));
}

function saveCostInsumos(insumos) {
    try {
        localStorage.setItem(COST_INSUMOS_KEY, JSON.stringify(insumos));
    } catch (e) {
        console.error("Failed to save cost insumos", e);
    }
}

const DELETED_SALES_KEY = 'casa_lucenzo_deleted_sales_uuids';

function loadDeletedSalesUuids() {
    try {
        const saved = localStorage.getItem(DELETED_SALES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function addDeletedSalesUuids(uuids) {
    if (!uuids) return;
    const list = Array.isArray(uuids) ? uuids : [uuids];
    if (list.length === 0) return;
    try {
        const current = loadDeletedSalesUuids();
        const set = new Set([...current, ...list]);
        localStorage.setItem(DELETED_SALES_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {
        console.error("Failed to save deleted sales uuids", e);
    }
}

const SALES_QUARANTINE_KEY = 'casa_lucenzo_sales_quarantine';
const SALES_QUARANTINE_MAX = 500;

/**
 * Sales this device still had locally but the server no longer has, with no
 * pending retry to explain the gap. They are pulled out of the active log so
 * they stop being re-inserted on every sync, but they are NEVER destroyed:
 * losing a real sale silently is worse than carrying a stale one, and only a
 * human can tell a deliberate server-side correction apart from a write that
 * genuinely never landed. Kept for review; capped so localStorage can't grow
 * without bound.
 */
function loadQuarantinedSales() {
    try {
        const saved = localStorage.getItem(SALES_QUARANTINE_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function addQuarantinedSales(sales, reason) {
    const list = (Array.isArray(sales) ? sales : [sales]).filter(Boolean);
    if (list.length === 0) return;
    try {
        const existing = loadQuarantinedSales();
        const seen = new Set(existing.map(q => q.sale && q.sale.uuid).filter(Boolean));
        const additions = list
            .filter(s => s.uuid && !seen.has(s.uuid))
            .map(s => ({ sale: s, reason: reason || 'sin motivo registrado', quarantinedAt: new Date().toISOString() }));
        if (additions.length === 0) return;
        // Keep the most recent entries when the cap is hit.
        const merged = [...existing, ...additions].slice(-SALES_QUARANTINE_MAX);
        localStorage.setItem(SALES_QUARANTINE_KEY, JSON.stringify(merged));
    } catch (e) {
        console.error("Failed to quarantine sales", e);
    }
}

function clearQuarantinedSales() {
    localStorage.removeItem(SALES_QUARANTINE_KEY);
}

const CONSUMED_REPLENISHMENTS_KEY = 'casa_lucenzo_consumed_replenishment_uuids';

/**
 * Dispatches whose stock has already been added to the vitrina. Kept so a
 * background re-sync landing before the Supabase DELETE commits cannot bring
 * the "¡Ya llegó!" card back and let the same batch be counted twice.
 */
function loadConsumedReplenishmentUuids() {
    try {
        const saved = localStorage.getItem(CONSUMED_REPLENISHMENTS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function addConsumedReplenishmentUuids(uuids) {
    if (!uuids) return;
    const list = (Array.isArray(uuids) ? uuids : [uuids]).filter(Boolean);
    if (list.length === 0) return;
    try {
        const set = new Set([...loadConsumedReplenishmentUuids(), ...list]);
        // Bounded: a dispatch only needs protection until its DELETE settles.
        localStorage.setItem(CONSUMED_REPLENISHMENTS_KEY, JSON.stringify(Array.from(set).slice(-200)));
    } catch (e) {
        console.error("Failed to save consumed replenishment uuids", e);
    }
}

function clearConsumedReplenishmentUuids() {
    localStorage.removeItem(CONSUMED_REPLENISHMENTS_KEY);
}

function loadUsers() {
    try {
        const saved = localStorage.getItem(USERS_KEY);
        if (!saved) {
            localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
            return DEFAULT_USERS;
        }
        const parsed = JSON.parse(saved);
        if (!parsed || parsed.length === 0) {
            localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
            return DEFAULT_USERS;
        }
        return parsed;
    } catch (e) {
        console.error("Failed to load users from localStorage", e);
        return DEFAULT_USERS;
    }
}

function saveUsers(users) {
    try {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) {
        console.error("Failed to save users to localStorage", e);
    }
}

// Expose to window namespace
window.StorageManager = {
    DEFAULT_PRODUCTS,
    DEFAULT_INGREDIENTS,
    DEFAULT_USERS,
    DEFAULT_COST_INSUMOS,
    loadProducts,
    saveProducts,
    getProductCategory,
    resetToDefaults,
    loadSalesLog,
    saveSalesLog,
    clearSalesLog,
    loadDeletedSalesUuids,
    addDeletedSalesUuids,
    loadQuarantinedSales,
    addQuarantinedSales,
    clearQuarantinedSales,
    loadExpenses,
    saveExpenses,
    clearExpenses,
    loadDebts,
    saveDebts,
    clearDebts,
    loadReplenishments,
    saveReplenishments,
    clearReplenishments,
    loadConsumedReplenishmentUuids,
    addConsumedReplenishmentUuids,
    clearConsumedReplenishmentUuids,
    loadIngredients,
    saveIngredients,
    loadUsers,
    saveUsers,
    loadCostInsumos,
    saveCostInsumos,
    loadPreferences,
    savePreferences,
    loadPinLockoutState,
    savePinLockoutState,
    loadBcvPreferences,
    saveBcvPreferences,
    loadBcvLastFetch,
    saveBcvLastFetch,
    loadLastCloseTime,
    saveLastCloseTime
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.StorageManager;
}
