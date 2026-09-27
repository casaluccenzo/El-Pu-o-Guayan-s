// Plan B, Task 3, Step 2 -- PowerSyncBackendConnector para Supabase.
// fetchCredentials() entrega el JWT de la sesion de Supabase ya activa
// (SupabaseManager.getCurrentSession, supabase.js:875-885) -- PowerSync no
// maneja su propio login, solo reusa el que ya existe.
// uploadData(database) sube el CRUD local pendiente directo via PostgREST
// (supabase-js), reusando el MISMO client autenticado de supabase.js
// (SupabaseManager.getClient()) para que las políticas RLS por rol se
// evaluen igual que en el resto de la app. RLS sigue validando del lado del
// servidor (spec §8) -- un bug aca solo puede fallar el sync, no escalar
// privilegios.
//
// API verificada contra la doc oficial + el conector de referencia de
// PowerSync (powersync-js/demos/react-supabase-todolist/SupabaseConnector.ts):
// database.getNextCrudTransaction() -> transaction | null; cada
// transaction.crud[i] tiene { op: 'PUT'|'PATCH'|'DELETE', table, id, opData };
// transaction.complete() marca el lote como subido.
//
// Build placeholder (mismo patron que DEFAULT_SUPABASE_URL en supabase.js):
// scripts/build.js debe inyectar esto desde una env var en Vercel. La URL
// del "endpoint" sale del dashboard de PowerSync (Client SDK Setup).
const DEFAULT_POWERSYNC_URL = "__POWERSYNC_URL__";

// Estas 4 tablas usan `uuid` como PK real en Postgres, no `id` -- el sync
// stream las proyecta como "uuid AS id" (ver planB-sync-rules.yaml) para que
// PowerSync tenga una fila identificable, pero al escribir de vuelta a
// Postgres hay que filtrar/upsertear por la columna real.
// Contrato con Tasks 4-9: cuando el codigo local inserte una fila nueva en
// una de estas tablas, tiene que setear `uuid` con el MISMO valor que usa
// como `id` local (mismo patron que ya usa crypto.randomUUID() en toda la
// app hoy) -- si no coinciden, el upload manda un uuid distinto al que
// PowerSync usa para trackear la fila localmente.
const UUID_KEYED_TABLES = new Set(['sales', 'expenses', 'debts', 'replenishments']);

function pkColumnFor(table) {
    return UUID_KEYED_TABLES.has(table) ? 'uuid' : 'id';
}

function getPowerSyncUrl() {
    const prefs = window.StorageManager ? window.StorageManager.loadPreferences() : {};
    if (prefs.powerSyncUrl) return prefs.powerSyncUrl;
    if (DEFAULT_POWERSYNC_URL !== '__POWERSYNC_URL__') return DEFAULT_POWERSYNC_URL;
    return null;
}

class SupabaseConnector {
    async fetchCredentials() {
        const endpoint = getPowerSyncUrl();
        if (!endpoint) {
            console.error('PowerSync: no hay powerSyncUrl configurada (preferencias o build placeholder).');
            return null;
        }
        const session = await window.SupabaseManager.getCurrentSession();
        if (!session || !session.access_token) {
            // Sin sesion todavia (login pendiente) -- PowerSync reintenta solo
            // una vez que fetchCredentials devuelva algo valido.
            return null;
        }
        return {
            endpoint,
            token: session.access_token
        };
    }

    async uploadData(database) {
        const transaction = await database.getNextCrudTransaction();
        if (!transaction) return;

        const client = window.SupabaseManager.getClient();
        if (!client) throw new Error('PowerSync uploadData: Supabase client no disponible todavia.');

        try {
            for (const op of transaction.crud) {
                const table = client.from(op.table);
                const pk = pkColumnFor(op.table);

                switch (op.op) {
                    case 'PUT': {
                        const record = { ...(op.opData ?? {}), [pk]: op.id };
                        const { error } = await table.upsert(record);
                        if (error) throw error;
                        break;
                    }
                    case 'PATCH': {
                        const { error } = await table.update(op.opData ?? {}).eq(pk, op.id);
                        if (error) throw error;
                        break;
                    }
                    case 'DELETE': {
                        const { error } = await table.delete().eq(pk, op.id);
                        if (error) throw error;
                        break;
                    }
                    default:
                        console.warn('PowerSync uploadData: operacion desconocida', op.op);
                }
            }
            await transaction.complete();
        } catch (e) {
            // Errores de datos/integridad de Postgres (23xxx: violacion de
            // constraint, 22xxx: excepcion de datos) no se van a arreglar
            // reintentando el mismo payload -- completar igual para no
            // trabar la cola entera detras de una fila irrecuperable.
            // Mismo criterio que el conector de referencia de PowerSync.
            const code = e && e.code ? String(e.code) : '';
            if (/^22/.test(code) || /^23/.test(code)) {
                console.error('PowerSync uploadData: fila descartada por error de datos/integridad, no se reintenta.', e);
                await transaction.complete();
                return;
            }
            console.error('PowerSync uploadData failed, se reintentara.', e);
            throw e;
        }
    }
}

window.PowerSyncConnector = SupabaseConnector;
