// Plan B, Task 3, Step 3 -- Bootstrap del cliente PowerSync.
//
// Modulo ES real (cargado con <script type="module"> en sistema/index.html,
// via un importmap que resuelve "@powersync/web" al CDN) -- a diferencia
// del resto de js/, que son scripts clasicos con globals en window.
// connector.js sigue siendo un script clasico (necesita window.SupabaseManager,
// que tampoco es un modulo), asi que se lee via window.PowerSyncConnector,
// no via import.
//
// Arquitectura verificada en un navegador real, no solo contra la doc (ver
// Task 3 Step 3 en el plan para el detalle completo):
//   - El modulo principal SI viene del CDN (mismo patron que
//     @supabase/supabase-js hoy). sw.js ya cachea cualquier request
//     cross-origin (stale-while-revalidate generico, unica excepcion:
//     supabase.co), asi que queda disponible offline despues de la primera
//     carga -- no hace falta vendorizarlo.
//   - El worker de SQLite NO puede vivir en el CDN: un SharedWorker no se
//     puede construir con un script de otro origen (SecurityError, no es
//     un problema de cache). Se vendorizo aparte con la herramienta oficial
//     `npx @powersync/web copy-assets --output js/powersync/vendor` y se le
//     apunta explicitamente via database.worker.
import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './schema.js';

const WORKER_PATH = '/js/powersync/vendor/@powersync/worker.js';

let db = null;
let connectPromise = null;
let connectAttempted = false;

function createDatabase() {
    if (db) return db;
    db = new PowerSyncDatabase({
        schema: AppSchema,
        database: {
            dbFilename: 'casalucenzo.db',
            worker: WORKER_PATH
        },
        // Segunda opcion de worker, separada de database.worker: la que usa
        // el mecanismo de sync/upload-queue (@powersync/shared-internals,
        // triggers de CDC), no el adaptador SQL. Sin esto, connect() resuelve
        // sin tirar error pero NUNCA llega a conectar de verdad -- currentStatus
        // se queda en {connected:false, connecting:false} para siempre y no
        // sale ni un solo request de red al endpoint de PowerSync. Encontrado
        // recien al probar login real contra casa-lucenzo-dev, no algo que la
        // doc explique.
        sync: {
            worker: WORKER_PATH
        }
    });
    // Nota (verificado en navegador real): al arrancar aparece en consola un
    // "[PowerSync]: Caught error while attempting to cleanup triggers
    // SecurityError: ..." la PRIMERA vez que corre, antes de que sync.worker
    // (arriba) quede realmente aplicado -- es el mismo intento fallido que
    // bloqueaba connect(). Con sync.worker seteado debería dejar de aparecer;
    // si vuelve a aparecer Y connect() sigue sin conectar, investigar en serio.
    db.init().catch(e => console.error('PowerSync db.init() failed:', e));
    return db;
}

// Llamado desde handleUserLogin (js/app.js) apenas hay sesion de Supabase --
// fetchCredentials (connector.js) necesita esa sesion para el JWT.
async function connect() {
    connectAttempted = true;
    if (connectPromise) return connectPromise;
    const database = createDatabase();
    const ConnectorClass = window.PowerSyncConnector;
    if (!ConnectorClass) {
        throw new Error('PowerSync: window.PowerSyncConnector no esta disponible -- confirmar que connector.js cargo antes que client.js.');
    }
    connectPromise = database.connect(new ConnectorClass());
    await connectPromise;
    return connectPromise;
}

function getSyncStatus() {
    return db ? db.currentStatus : null;
}

// Plan B, Task 13 -- event-driven, not polled: db.registerListener's
// statusChanged fires on every connect/disconnect/upload/download
// transition (confirmed against @powersync/web's real .d.ts, not just the
// docs). Returns the same disposer registerListener gives back, so a caller
// can unsubscribe if it ever needs to.
function onStatusChange(callback) {
    return createDatabase().registerListener({ statusChanged: callback });
}

// Real pending-write count for the sync badge (Task 13) -- backed by
// PowerSync's own CRUD upload queue, unlike the old offline queue's manual
// localStorage count that Task 12 retired.
function getUploadQueueStats() {
    return createDatabase().getUploadQueueStats();
}

window.PowerSyncManager = {
    db: createDatabase(),
    connect,
    getSyncStatus,
    onStatusChange,
    getUploadQueueStats,
    // Task 13: before the first connect() attempt (pre-login, or a device
    // that never got that far), currentStatus.connected is false the same
    // way it would be if genuinely offline -- there is no third boolean to
    // tell the two apart. The badge/dot need this to stay quiet instead of
    // reading "Sin Conexión" on a bare login screen that never tried yet.
    hasAttemptedConnect: () => connectAttempted
};
