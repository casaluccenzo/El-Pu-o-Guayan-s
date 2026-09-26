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

function createDatabase() {
    if (db) return db;
    db = new PowerSyncDatabase({
        schema: AppSchema,
        database: {
            dbFilename: 'casalucenzo.db',
            worker: WORKER_PATH
        }
    });
    // Nota (verificado en navegador real): al arrancar aparece en consola un
    // "[PowerSync]: Caught error while attempting to cleanup triggers
    // SecurityError: ... worker.js cannot be accessed from origin ..." que
    // sigue apuntando al CDN en vez de WORKER_PATH. Es una rutina interna de
    // @powersync/shared-internals separada de la conexion principal (no usa
    // este mismo objeto de opciones) -- el propio mensaje dice "Caught error",
    // o sea que ya viene atajado. Probado explicitamente: INSERT/SELECT
    // reales contra window.PowerSyncManager.db funcionan bien a pesar de este
    // log. Cosmetico, no bloqueante -- si en el futuro aparece un mensaje
    // parecido pero SIN "Caught", ahi si investigar en serio.
    db.init().catch(e => console.error('PowerSync db.init() failed:', e));
    return db;
}

// Llamado desde handleUserLogin (js/app.js) apenas hay sesion de Supabase --
// fetchCredentials (connector.js) necesita esa sesion para el JWT.
async function connect() {
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

window.PowerSyncManager = {
    db: createDatabase(),
    connect,
    getSyncStatus
};
