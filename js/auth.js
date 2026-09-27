/**
 * Casa Lucenzo - Authentication & Access Role Domain Module
 * Extracted from app.js / ui.js for modular architecture.
 */

function checkRolePermission(role, action) {
    if (!role || !action) return false;
    const normalizedRole = role.toLowerCase();
    const rolePermissions = {
        admin: ['view_stats', 'edit_inventory', 'day_close', 'manage_users', 'view_pos', 'kitchen_dispatch', 'edit_products', 'manage_users', 'edit_bcv'],
        venta: ['view_pos', 'register_sale', 'view_debts', 'add_expenses', 'add_debts'],
        cocina: ['kitchen_dispatch', 'view_recipes', 'confirm_receipt', 'replenish_stock', 'manage_ingredients']
    };
    if (normalizedRole === 'admin') return true;
    return (rolePermissions[normalizedRole] || []).includes(action);
}

// Plan B, Task 11 (spec §6, "Bordes"): an explicit app-level rule, not
// something Supabase's refresh token itself enforces on a schedule. If this
// device hasn't proven real connectivity (a fresh sign-in or a genuine
// token refresh -- js/supabase.js init() records the timestamp only on
// those events) in over 30 days, quick-PIN reactivation is refused and a
// full password login is required instead -- that always needs
// connectivity anyway, so it doubles as the recovery path.
const OFFLINE_LIMIT_DAYS = 30;

/**
 * @param {string|null} lastOnlineAtIso ISO timestamp from
 *   StorageManager.loadLastAuthOnlineAt(), or null if never established.
 * @returns {boolean} true once more than 30 days have passed since then.
 */
function isOfflineLimitExceeded(lastOnlineAtIso) {
    if (!lastOnlineAtIso) return false; // no baseline yet -- don't lock out a fresh install
    const lastOnline = new Date(lastOnlineAtIso).getTime();
    if (isNaN(lastOnline)) return false;
    return (Date.now() - lastOnline) > OFFLINE_LIMIT_DAYS * 24 * 60 * 60 * 1000;
}

const AuthManager = {
    checkRolePermission,
    isOfflineLimitExceeded,
    OFFLINE_LIMIT_DAYS
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkRolePermission,
        AuthManager
    };
}
if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
    window.checkRolePermission = checkRolePermission;
}
