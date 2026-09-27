process.env.TZ = 'America/Caracas';

const { SupabaseRest } = require('../lib/bot-shared');

/**
 * Pastelitos sell out or get zeroed by "Cierre de Jornada" (js/app.js,
 * closeDayAndResetLogs -- stock/initial_stock/max all go to 0 for that
 * category), and until now someone had to open `sistema` every morning and
 * retype the day's count into each pastelito before the vitrina was ready.
 * This cron does that reload automatically, once a day, before the shop
 * opens -- Vercel triggers it via the "crons" entry in vercel.json.
 *
 * Bebidas/dulces are untouched: unlike pastelitos, those categories carry
 * real leftover inventory across days (same distinction the day-close button
 * itself makes).
 *
 * Plan B (migration 033, applied to production 2026-09-27): products.stock/
 * initial_stock/max are no longer writable directly -- recompute_product_stock()
 * (migrations 030/033) owns them, recalculating off stock_movements + the
 * day_closes boundary every time a row lands in either table. This used to
 * also PATCH products directly ("to keep the shadow columns truthful" back
 * when stock_computed was dormant) -- now that those are the REAL columns,
 * that direct PATCH fights the trigger instead: if the stock_movements
 * insert below ever failed, the PATCH's value would sit un-verified until
 * the next real sale silently recomputed a different number out from under
 * it, with no visible error anywhere. Insert the movement only and let the
 * trigger be the only writer, same as every other stock change in the app
 * since Task 6 -- and surface a real error if the insert fails, instead of
 * swallowing it the way the old shadow-sync attempt did (SupabaseRest.post
 * only ever returned true/false, never the actual HTTP body).
 */
const DAILY_VITRINA_STOCK = 15;

module.exports = async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers['authorization'] || '';
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    // stock_movements has no anon INSERT policy (migration 025) -- this needs
    // the service role, same precedence the other crons use for privileged
    // reads/writes.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas' });
    }

    try {
        const db = new SupabaseRest(supabaseUrl, serviceKey);
        const pastelitos = await db.rawGet('products?select=id&category=eq.pastelitos');
        if (!Array.isArray(pastelitos) || pastelitos.length === 0) {
            return res.status(200).json({ ok: true, restocked: 0, ran_at: new Date().toISOString() });
        }

        // Dedup id makes a duplicate cron invocation on the same Caracas day
        // a no-op via Postgrest's ignore-duplicates instead of double-counting
        // -- `id` is stock_movements' primary key, so PostgREST needs no
        // explicit on_conflict target to resolve against it.
        const dayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
        const movements = pastelitos.map(p => ({
            id: `daily-restock-${p.id}-${dayStr}`,
            product_id: p.id,
            delta: DAILY_VITRINA_STOCK,
            type: 'load',
            device_id: 'cron-daily-restock',
            note: 'Repuesto automático diario de vitrina'
        }));

        const resp = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/stock_movements`, {
            method: 'POST',
            headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=ignore-duplicates,return=minimal'
            },
            body: JSON.stringify(movements)
        });

        if (!resp.ok) {
            const detail = await resp.text().catch(() => '');
            console.error(`daily-restock: stock_movements insert failed (HTTP ${resp.status}): ${detail}`);
            return res.status(502).json({ ok: false, error: `Supabase insert failed (HTTP ${resp.status})`, detail });
        }

        return res.status(200).json({ ok: true, restocked: pastelitos.length, restocked_to: DAILY_VITRINA_STOCK, ran_at: new Date().toISOString() });
    } catch (e) {
        console.error('daily-restock failed:', e.message);
        return res.status(500).json({ ok: false, error: e.message });
    }
};
