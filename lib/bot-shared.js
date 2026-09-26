// Shared helpers for every chat-bot entry point Casa Lucenzo has:
//   - api/whatsapp-webhook.js     (official Meta Graph API webhook, production)
//   - api/telegram-webhook.js     (Telegram bot, production)
//   - tools/whatsapp-qr-bridge.js (unofficial Baileys QR bridge, local/manual use only)
// Keeping the "read business context -> ask the AI -> execute an action" logic in
// exactly one place avoids the channels drifting apart (one previously had no
// phone whitelist at all because the check only ever got added to the other).

function normalizeText(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

function normalizePhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/[^0-9]/g, '');
}

/**
 * Send an outgoing WhatsApp message via the official Meta Graph API.
 * Shared by the webhook bot and any other server-side code that needs to
 * push a WhatsApp notification (e.g. new online-order alerts).
 */
async function sendWhatsAppMessage(recipientPhone, textBody) {
    const waToken = process.env.WHATSAPP_API_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!waToken || !phoneId) {
        console.log(`📱 [SIMULATED WHATSAPP OUTGOING TO +${recipientPhone}]:\n${textBody}`);
        return;
    }

    try {
        const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${waToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: recipientPhone,
                type: 'text',
                text: { body: textBody }
            })
        });

        if (!resp.ok) {
            const errTxt = await resp.text();
            console.error('❌ Meta Graph API Send Error:', errTxt);
        }
    } catch (e) {
        console.error('❌ Error sending WhatsApp message:', e.message);
    }
}

const DEFAULT_PRODUCTS = [
    { id: 'p1', name: 'Pastelito de Queso', stock: 20, price: 1.50, category: 'pastelitos' },
    { id: 'p2', name: 'Pastelito de Pollo', stock: 15, price: 1.50, category: 'pastelitos' },
    { id: 'p3', name: 'Pastelito de Carne', stock: 12, price: 1.50, category: 'pastelitos' },
    { id: 'p6', name: 'Coca Cola 355ml', stock: 30, price: 1.00, category: 'bebidas' },
    { id: 'p7', name: 'Malta 250ml', stock: 24, price: 1.00, category: 'bebidas' }
];

/**
 * Lightweight Zero-Dependency Supabase REST Helper
 */
class SupabaseRest {
    constructor(url, key) {
        this.url = url?.replace(/\/$/, '');
        this.key = key;
    }

    async get(table, select = '*') {
        if (!this.url || !this.key) return null;
        try {
            const resp = await fetch(`${this.url}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
                headers: {
                    'apikey': this.key,
                    'Authorization': `Bearer ${this.key}`
                }
            });
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            return null;
        }
    }

    // For queries needing filters/order/limit beyond plain `get` -- pass the
    // full PostgREST path+query, e.g. "sales?select=price&timestamp=gte.2026-01-01"
    async rawGet(pathAndQuery) {
        if (!this.url || !this.key) return null;
        try {
            const resp = await fetch(`${this.url}/rest/v1/${pathAndQuery}`, {
                headers: {
                    'apikey': this.key,
                    'Authorization': `Bearer ${this.key}`
                }
            });
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            return null;
        }
    }

    // PostgREST caps every response at 1000 rows. `rawGet` on an ascending
    // ordered query therefore loses its NEWEST rows once the table passes that
    // mark, silently and with no error -- which is how the nightly report came
    // to omit the most recent days entirely. Use this for any unbounded read.
    // Caller supplies the query WITHOUT limit/offset.
    async rawGetAll(pathAndQuery, pageSize = 1000, maxPages = 100) {
        const rows = [];
        const joiner = pathAndQuery.includes('?') ? '&' : '?';
        for (let page = 0; page < maxPages; page++) {
            const chunk = await this.rawGet(`${pathAndQuery}${joiner}limit=${pageSize}&offset=${page * pageSize}`);
            if (chunk === null) return page === 0 ? null : rows; // hard failure on the first page
            if (chunk.length === 0) break;
            rows.push(...chunk);
            if (chunk.length < pageSize) break;
        }
        return rows;
    }

    async patch(table, filterCol, filterVal, data) {
        if (!this.url || !this.key) return false;
        try {
            const resp = await fetch(`${this.url}/rest/v1/${table}?${filterCol}=eq.${encodeURIComponent(filterVal)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': this.key,
                    'Authorization': `Bearer ${this.key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(data)
            });
            return resp.ok;
        } catch (e) {
            return false;
        }
    }

    async post(table, data, prefer = 'return=minimal') {
        if (!this.url || !this.key) return false;
        try {
            const resp = await fetch(`${this.url}/rest/v1/${table}`, {
                method: 'POST',
                headers: {
                    'apikey': this.key,
                    'Authorization': `Bearer ${this.key}`,
                    'Content-Type': 'application/json',
                    'Prefer': prefer
                },
                body: JSON.stringify(data)
            });
            return resp.ok;
        } catch (e) {
            return false;
        }
    }
}

/**
 * Determines what a phone number is allowed to do via the WhatsApp bot:
 *   'admin'  -- full access, including stock/BCV changes (WHATSAPP_ADMIN_PHONE
 *               env whitelist, or a Supabase profile with role='admin')
 *   'viewer' -- can chat/query (sales, history, how the app works) but the
 *               server refuses to execute any mutation for them, regardless of
 *               what the AI extracts as intent (WHATSAPP_VIEWER_PHONE env
 *               whitelist, or a Supabase profile with role='venta'/'cocina')
 *   null     -- not authorized at all
 * @param {SupabaseRest|null} db
 * @param {string} rawFrom
 * @returns {Promise<'admin'|'viewer'|null>}
 */
async function getAuthorizationLevel(db, rawFrom) {
    const normalizedFrom = normalizePhone(rawFrom);

    const adminPhones = (process.env.WHATSAPP_ADMIN_PHONE || '').split(',').map(p => normalizePhone(p)).filter(Boolean);
    if (adminPhones.includes(normalizedFrom)) return 'admin';

    const viewerPhones = (process.env.WHATSAPP_VIEWER_PHONE || '').split(',').map(p => normalizePhone(p)).filter(Boolean);
    if (viewerPhones.includes(normalizedFrom)) return 'viewer';

    if (db) {
        const userProfiles = await db.get('profiles', 'phone,role');
        const found = (userProfiles || []).find(p => normalizePhone(p.phone) === normalizedFrom);
        if (found?.role === 'admin') return 'admin';
        if (found?.role === 'venta' || found?.role === 'cocina') return 'viewer';
    }

    return null;
}

/**
 * Same idea as getAuthorizationLevel but for Telegram, which identifies users by a
 * numeric user id (not a phone number) via TELEGRAM_ADMIN_ID / TELEGRAM_VIEWER_ID.
 * @param {string|number} telegramUserId
 * @returns {'admin'|'viewer'|null}
 */
function getTelegramAuthorizationLevel(telegramUserId) {
    const idStr = String(telegramUserId || '');
    if (!idStr) return null;

    const adminIds = (process.env.TELEGRAM_ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    if (adminIds.includes(idStr)) return 'admin';

    const viewerIds = (process.env.TELEGRAM_VIEWER_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    if (viewerIds.includes(idStr)) return 'viewer';

    return null;
}

/**
 * Fetches the last `limit` conversation turns for a given conversation key, oldest
 * first. The key is a WhatsApp phone number or a synthetic per-channel id like
 * `tg:123456789` for Telegram -- it's just an opaque text identifier to this table.
 * @param {SupabaseRest|null} db
 * @param {string} conversationKey
 * @param {number} limit
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
async function getConversationHistory(db, conversationKey, limit = 16) {
    if (!db) return [];
    const key = String(conversationKey || '');
    const rows = await db.rawGet(`whatsapp_conversations?phone=eq.${encodeURIComponent(key)}&select=role,content,created_at&order=created_at.desc&limit=${limit}`);
    if (!rows) return [];
    return rows.reverse();
}

/**
 * Appends one turn (user or assistant) to a conversation's history.
 * @param {SupabaseRest|null} db
 * @param {string} conversationKey
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
async function appendConversationTurn(db, conversationKey, role, content) {
    if (!db || !content) return;
    const key = String(conversationKey || '');
    await db.post('whatsapp_conversations', { phone: key, role, content });
}

/**
 * Builds a compact day-by-day sales/expenses summary for the last N days, so the
 * bot can answer questions like "¿cómo estuvo la semana pasada?" and not just "hoy".
 * @param {SupabaseRest|null} db
 * @param {number} days
 * @returns {Promise<string>}
 */
async function fetchHistoricalDailySummary(db, days = 14) {
    if (!db) return 'Sin datos históricos disponibles.';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    const startIso = startDate.toISOString();

    const sales = await db.rawGetAll(`sales?select=timestamp,price&timestamp=gte.${encodeURIComponent(startIso)}&order=timestamp.asc`);
    const expenses = await db.rawGetAll(`expenses?select=timestamp,amount&timestamp=gte.${encodeURIComponent(startIso)}&order=timestamp.asc`);

    if (!sales && !expenses) return 'Sin datos históricos disponibles (no se pudo conectar a la base de datos).';

    const byDay = {};
    (sales || []).forEach(s => {
        const day = (s.timestamp || '').slice(0, 10);
        if (!day) return;
        if (!byDay[day]) byDay[day] = { salesUsd: 0, salesCount: 0, expensesUsd: 0 };
        byDay[day].salesUsd += parseFloat(s.price) || 0;
        byDay[day].salesCount += 1;
    });
    (expenses || []).forEach(e => {
        const day = (e.timestamp || '').slice(0, 10);
        if (!day) return;
        if (!byDay[day]) byDay[day] = { salesUsd: 0, salesCount: 0, expensesUsd: 0 };
        byDay[day].expensesUsd += parseFloat(e.amount) || 0;
    });

    const sortedDays = Object.keys(byDay).sort();
    if (sortedDays.length === 0) return `Sin ventas ni gastos registrados en los últimos ${days} días.`;

    return sortedDays.map(day => {
        const d = byDay[day];
        const net = d.salesUsd - d.expensesUsd;
        return `${day}: Ventas $${d.salesUsd.toFixed(2)} (${d.salesCount} ops) | Gastos $${d.expensesUsd.toFixed(2)} | Neto $${net.toFixed(2)}`;
    }).join('\n');
}

const APP_KNOWLEDGE = `Casa Lucenzo es un sistema POS (punto de venta) y control de inventario web/PWA para una panadería/pastelería. Así funciona, por si te preguntan cómo usarlo:
- Roles: "admin" (control total: métricas, inventario, usuarios, tasa BCV, cierre de caja), "venta" (vitrina, registrar ventas, historial, cobro de fiados/deudas), "cocina" (comandas, despachos, recetas e ingredientes).
- Vitrina/Ventas: se registran ventas por producto, cada una queda con su hora y la tasa BCV del momento.
- Inventario: cada producto tiene stock actual, mínimo y máximo; cuando el stock baja del mínimo se marca como "bajo stock".
- Cierre de caja: el admin cierra la caja del día, quedando un corte con ventas totales, gastos y caja neta; desde ahí arranca el conteo del día siguiente.
- Deudas/Fiados: se puede anotar una venta fiada a un cliente y luego registrar su pago (abono).
- Tasa BCV: el precio en bolívares se calcula con una tasa de cambio que se actualiza manual o automáticamente.
- Cocina: ve las comandas pendientes, marca despachos y reposiciones de vitrina, gestiona ingredientes y recetas.
- Modo offline: si se cae la conexión, las operaciones quedan en una cola local y se sincronizan solas al volver internet.`;

/**
 * Call Gemini 2.5 Flash API for Conversational NLU & Natural Language Generation.
 * Holds a real back-and-forth conversation (via conversationHistory) instead of
 * treating every message in isolation, and can chat naturally about anything --
 * the business, how the app works, historical data, or general conversation --
 * not just the handful of stock/BCV actions it can actually execute.
 */
async function processIntentWithGemini(userText, catalog, liveContext, conversationHistory = []) {
    const apiKey = process.env.GEMINI_API_KEY;
    const catalogText = catalog.map(p => `- ID: "${p.id}" | Nombre: "${p.name}" | Categoría: "${p.category}" | Stock Actual en Vitrina: ${p.stock}`).join('\n');

    const fallback = () => ({
        intent: 'conversational_chat',
        reply_text: `🤖 ¡Hola ${liveContext.senderName}! Hoy en Casa Lucenzo llevamos **$${liveContext.totalSalesUsd.toFixed(2)} USD** en ventas (${liveContext.salesCount} operaciones).\n\n🏆 *Productos más vendidos hoy:*\n${liveContext.topProductsText}`
    });

    if (!apiKey) return fallback();

    const isAdmin = liveContext.authLevel === 'admin';
    const permissionNote = isAdmin
        ? 'Esta persona es administradora: puede pedirte cargar stock, fijar stock, o cambiar la tasa BCV, y vos ejecutás esa acción.'
        : 'Esta persona tiene acceso de SOLO CONSULTA: puede preguntar lo que quiera (ventas, histórico, cómo funciona la app, charla), pero NO puede cargar stock, fijar stock, ni cambiar la tasa BCV. Si te pide algo de eso, explicale con buena onda que esa acción solo la puede hacer un administrador, y NO uses los intents de acción -- respondé siempre con "conversational_chat" para esta persona.';

    const systemPrompt = `Eres el asistente de Casa Lucenzo (panadería/pastelería), hablando con ${liveContext.senderName}.

${permissionNote}

Tu forma de hablar: natural, cercana y directa, como charlar con un asistente de confianza -- no como un bot que solo entiende comandos fijos. Recordás lo que ya hablaron en la conversación (te paso el historial reciente) y podés seguir el hilo, hacer preguntas de vuelta, o simplemente charlar de lo que sea, no solo de números del negocio.

CÓMO FUNCIONA LA APP (por si te preguntan cómo usar algo):
${APP_KNOWLEDGE}

DATOS EN TIEMPO REAL DEL NEGOCIO (HOY):
- Resumen de Caja: ${liveContext.salesSummaryText}
- Productos Más Vendidos Hoy:
${liveContext.topProductsText}

HISTÓRICO DE LOS ÚLTIMOS DÍAS (para preguntas tipo "¿cómo estuvo la semana pasada?" o comparar días):
${liveContext.historicalSummaryText || 'No disponible.'}

CATÁLOGO E INVENTARIO ACTUAL EN VITRINA:
${catalogText}

INSTRUCCIONES:
1. Respondé como en una charla real: si preguntan algo del negocio (ventas, histórico, inventario), respondé con los datos de arriba de forma natural. Si preguntan cómo usar la app, explicá con la info de arriba. Si quieren charlar de otra cosa, charlá nomás -- no hace falta forzar todo a ser sobre el negocio.
2. Solo cuando el usuario pida explícitamente cargar stock, fijar stock, o cambiar la tasa BCV, identificá esa intención ("add_stock", "set_stock", "update_bcv") y extraé los parámetros -- eso es lo único que puede ejecutar acciones reales en el sistema. Para cualquier otra cosa (preguntas, charla, histórico, dudas de uso) usá "conversational_chat".
3. No fuerces el JSON de acción si no corresponde -- en duda, es "conversational_chat" con una respuesta natural.

RESPONDE ÚNICAMENTE CON UN OBJETO JSON VÁLIDO SIN BLOQUES MARKDOWN:
{
  "intent": "add_stock" | "set_stock" | "update_bcv" | "conversational_chat",
  "target_product_id": "ID del producto si aplica",
  "product_name": "Nombre detectado del producto si aplica",
  "quantity": numero_entero_si_aplica,
  "bcv_rate": numero_decimal_si_aplica,
  "reply_text": "Tu respuesta conversacional en español, natural, formateada con emojis elegantes"
}`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
        const contents = [
            ...conversationHistory.map(turn => ({
                role: turn.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: turn.content }]
            })),
            { role: 'user', parts: [{ text: userText }] }
        ];

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents
            })
        });
        if (!resp.ok) throw new Error(`Gemini API Error ${resp.status}`);
        const data = await resp.json();
        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(rawText);
    } catch (e) {
        return fallback();
    }
}

/**
 * The single shared brain for every channel: fetches live catalog/sales context,
 * runs the AI, and executes any authorized mutation (stock/BCV). Channel-specific
 * files (webhook signature checks, sending the reply over WhatsApp/Telegram/etc.)
 * stay in their own files; everything about *what the bot does* lives here once.
 *
 * @param {Object} params
 * @param {SupabaseRest} params.db
 * @param {string} params.conversationKey - phone number, or `tg:<id>` etc.
 * @param {string} params.senderName
 * @param {string} params.messageText
 * @param {'admin'|'viewer'} params.authLevel
 * @param {string} params.channelLabel - e.g. "WhatsApp", "Telegram" (for activity logs)
 * @returns {Promise<{replyMessage: string, intent: string}>}
 */
async function handleIncomingMessage({ db, conversationKey, senderName, messageText, authLevel, channelLabel }) {
    let currentProducts = DEFAULT_PRODUCTS;
    const dbProducts = await db.get('products');
    if (dbProducts && dbProducts.length > 0) {
        currentProducts = dbProducts;
    }

    let salesSummaryText = 'No hay ventas registradas hoy todavía.';
    let topProductsText = 'Sin datos de ventas aún.';
    let totalSalesUsd = 0;
    let salesCount = 0;

    const dbSales = await db.get('sales');
    if (dbSales && Array.isArray(dbSales)) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todaySales = dbSales.filter(s => (s.timestamp || '').startsWith(todayStr));
        salesCount = todaySales.length;
        totalSalesUsd = todaySales.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

        const counts = {};
        todaySales.forEach(s => {
            const name = s.product_name || 'Producto';
            counts[name] = (counts[name] || 0) + (parseInt(s.quantity, 10) || 1);
        });

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
            topProductsText = sorted.map(([name, qty], idx) => `${idx + 1}. ${name}: ${qty} unidades`).join('\n');
        }
        salesSummaryText = `Ventas Totales Hoy: $${totalSalesUsd.toFixed(2)} USD | Operaciones: ${salesCount}`;
    }

    const historicalSummaryText = await fetchHistoricalDailySummary(db, 14);
    const conversationHistory = await getConversationHistory(db, conversationKey);

    const aiResult = await processIntentWithGemini(messageText, currentProducts, {
        salesSummaryText,
        topProductsText,
        totalSalesUsd,
        salesCount,
        senderName,
        historicalSummaryText,
        authLevel
    }, conversationHistory);

    await appendConversationTurn(db, conversationKey, 'user', messageText);

    const { intent, target_product_id, quantity, bcv_rate, reply_text } = aiResult;
    const isMutationIntent = intent === 'add_stock' || intent === 'set_stock' || intent === 'update_bcv';
    let replyMessage = reply_text || '';

    if (isMutationIntent && authLevel !== 'admin') {
        replyMessage = `🙅 Esa acción (cambiar stock o tasa) solo la puede hacer un administrador. Puedo ayudarte con consultas: ventas, inventario, cómo funciona la app, lo que necesites.`;
    } else if (intent === 'add_stock' || intent === 'set_stock') {
        const targetProduct = currentProducts.find(p => p.id === target_product_id) ||
                              currentProducts.find(p => normalizeText(p.name).includes(normalizeText(aiResult.product_name || '')));

        if (targetProduct) {
            const qtyVal = parseInt(quantity, 10) || 0;
            const oldStock = targetProduct.stock || 0;
            let newStock = oldStock;

            if (intent === 'add_stock') {
                newStock += qtyVal;
            } else {
                newStock = qtyVal;
            }
            newStock = Math.max(0, newStock);

            // Same contract as the POS: `initial_stock` is everything the
            // vitrina received today and every "vendidos reales" figure is
            // `initial_stock - stock`. Loading through here without moving the
            // baseline zeroed out the day's numbers. Lowering the count is a
            // physical correction, so the baseline stays put.
            const loaded = Math.max(0, newStock - oldStock);
            const patch = {
                stock: newStock,
                initial_stock: (targetProduct.initial_stock || 0) + loaded,
                max: Math.max(targetProduct.max || 0, newStock)
            };

            await db.patch('products', 'id', targetProduct.id, patch);
            Object.assign(targetProduct, patch);

            await db.post('activity_logs', {
                user_name: `${channelLabel} (${senderName})`,
                action: `Ajuste de Stock vía ${channelLabel}`,
                details: `${intent === 'add_stock' ? 'Cargados' : 'Establecido'} ${qtyVal} ud de ${targetProduct.name}. Nuevo stock: ${newStock}`,
                timestamp: new Date().toISOString()
            });

            if (!replyMessage || replyMessage.includes('⚠️')) {
                replyMessage = `✅ *¡Stock Actualizado Exitosamente!*\n\n` +
                               `📦 *Producto:* ${targetProduct.name}\n` +
                               `➕ *Cantidad:* ${intent === 'add_stock' ? '+' : ''}${qtyVal}\n` +
                               `📊 *Nuevo Stock en Vitrina:* ${newStock} unidades\n\n` +
                               `*Casa Lucenzo Bot* 🥖`;
            }
        }
    } else if (intent === 'update_bcv') {
        const newRate = parseFloat(bcv_rate) || 0;
        if (newRate > 0) {
            // Must write to `app_config` (id=1, column bcv_rate) -- that's the
            // single source of truth the POS actually reads (fetchAppConfig /
            // upsertAppConfig in js/supabase.js) and gets pushed via realtime.
            // A prior version posted into a standalone `exchange_rates` table
            // nothing ever read, so the bot claimed success while the storefront
            // kept selling at the old rate.
            const ok = await db.patch('app_config', 'id', 1, {
                bcv_rate: newRate,
                use_auto_bcv: false
            });

            if (ok) {
                await db.post('activity_logs', {
                    user_name: `${channelLabel} (${senderName})`,
                    action: `Tasa BCV actualizada vía ${channelLabel}`,
                    details: `Nueva tasa: ${newRate.toFixed(2)} VES/USD`,
                    timestamp: new Date().toISOString()
                });
            }

            if (!replyMessage || replyMessage.includes('⚠️')) {
                replyMessage = ok
                    ? `💵 *Tasa BCV Actualizada Exitosamente*\n\n` +
                      `📈 *Nueva Tasa:* ${newRate.toFixed(2)} VES/USD\n` +
                      `👤 *Actualizado por:* ${senderName}\n\n` +
                      `Todos los precios en Bolívares se han recargado en el POS.`
                    : `⚠️ No se pudo actualizar la tasa BCV en el sistema. Probá de nuevo o cambiala desde el POS.`;
            }
        }
    }

    await appendConversationTurn(db, conversationKey, 'assistant', replyMessage);

    return { replyMessage, intent };
}

module.exports = {
    normalizeText,
    normalizePhone,
    sendWhatsAppMessage,
    DEFAULT_PRODUCTS,
    SupabaseRest,
    getAuthorizationLevel,
    getTelegramAuthorizationLevel,
    getConversationHistory,
    appendConversationTurn,
    fetchHistoricalDailySummary,
    processIntentWithGemini,
    handleIncomingMessage
};
