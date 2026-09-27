// Plan B, Task 3, Step 1 -- Schema local de PowerSync.
// Espejo de las 11 tablas que Sync Streams sincroniza (ver
// docs/superpowers/plans/planB-sync-rules.yaml, Task 1). Columnas
// verificadas contra las migraciones reales (000/016b/017/019/020/025-032),
// no contra el spec -- el spec quedo desactualizado en varios detalles.
//
// PowerSync agrega una columna "id" implicita a cada Table -- es la clave
// primaria local en SQLite. No se declara acá. Para sales/expenses/debts/
// replenishments (PK real en Postgres = uuid, no id) el sync stream
// proyecta "uuid AS id" ademas de mantener la columna "uuid" original, asi
// que ambas existen localmente.
//
// SQLite/PowerSync solo tiene 3 tipos de columna (column.text, .integer,
// .real) -- no hay boolean ni timestamptz nativos. Mapeo:
//   boolean       -> integer (0/1)
//   timestamptz   -> text (ISO 8601, como lo manda Postgres/PostgREST)
//   uuid          -> text
//   integer       -> integer
//   numeric       -> TEXT, no real -- confirmado contra el generador oficial
//     de PowerSync (Client SDK Setup del dashboard, que introspecciona la
//     publication real): usa column.text para todo lo que en Postgres es
//     `numeric`, nunca column.real. `numeric` es precision exacta (plata);
//     `real` de SQLite es punto flotante (double) y puede redondear mal
//     (ej. 19.99 -> 19.989999999999998). El texto conserva el valor exacto;
//     Tasks 4-9 convierten a Number() en JS solo al hacer aritmetica, no al
//     guardar. Afecta: products.price/cost, sales.price/bcv_rate/
//     cost_at_sale, expenses.amount/bcv_rate, debts.amount,
//     debt_payments.amount, ingredients.stock, app_config.bcv_rate.
//   jsonb         -> text (JSON.stringify/parse del lado de la app)
import { column, Schema, Table } from '@powersync/web';

const products = new Table(
    {
        name: column.text,
        stock: column.integer,
        min: column.integer,
        max: column.integer,
        unit: column.text,
        price: column.text,
        category: column.text,
        updated_at: column.text,
        initial_stock: column.integer,
        cost: column.text,
        location_id: column.text,
        // Columnas sombra (migracion 029). Plan A las mantiene siempre
        // iguales a las reales desde la migracion 033 (Task 2) -- dejarlas
        // ac joins para comparar sombra vs real localmente si hiciera falta.
        stock_computed: column.integer,
        initial_stock_computed: column.integer,
        max_computed: column.integer
    },
    { indexes: { category: ['category'] } }
);

const ingredients = new Table({
    name: column.text,
    stock: column.text,
    unit: column.text,
    updated_at: column.text,
    location_id: column.text
});

const profiles = new Table({
    username: column.text,
    name: column.text,
    role: column.text,
    active: column.integer,
    created_at: column.text,
    updated_at: column.text,
    location_id: column.text,
    // PIN offline (Task 10) -- bcrypt hash + rate limiting, replicados tal
    // cual estan en Postgres (migraciones 003/005).
    pin_hash: column.text,
    pin_failed_attempts: column.integer,
    pin_locked_until: column.text
});

const app_config = new Table({
    bcv_rate: column.text,
    use_auto_bcv: column.integer,
    updated_at: column.text,
    totp_secret: column.text,
    totp_enabled: column.integer,
    last_close_time: column.text,
    location_id: column.text
});

const sales = new Table(
    {
        // uuid es la PK real en Postgres; el stream la proyecta tambien
        // como "id" (ver nota de arriba). Se mantiene acá para que el
        // codigo JS existente (que lee sale.uuid) siga funcionando.
        uuid: column.text,
        product_id: column.text,
        name: column.text,
        price: column.text,
        timestamp: column.text,
        bcv_rate: column.text,
        cost_at_sale: column.text,
        // Anulacion (migracion 028, spec §5.2) -- NULL = venta activa.
        voided_at: column.text,
        void_reason: column.text,
        location_id: column.text
    },
    { indexes: { product: ['product_id'], timestamp: ['timestamp'] } }
);

const expenses = new Table(
    {
        uuid: column.text,
        description: column.text,
        amount: column.text,
        timestamp: column.text,
        category: column.text,
        currency: column.text,
        bcv_rate: column.text,
        location_id: column.text
    },
    { indexes: { timestamp: ['timestamp'] } }
);

const debts = new Table({
    uuid: column.text,
    client_name: column.text,
    amount: column.text,
    description: column.text,
    timestamp: column.text,
    location_id: column.text
});

const replenishments = new Table(
    {
        uuid: column.text,
        product_id: column.text,
        name: column.text,
        amount: column.integer,
        unit: column.text,
        status: column.text,
        timestamp: column.text,
        location_id: column.text
    },
    { indexes: { product: ['product_id'] } }
);

// Append-only (migracion 025, spec §5.1a). id SI es la PK real en Postgres
// aca -- no hace falta alias en el sync stream.
const stock_movements = new Table(
    {
        product_id: column.text,
        delta: column.integer,
        type: column.text,
        source_uuid: column.text,
        device_id: column.text,
        created_at: column.text,
        location_id: column.text,
        note: column.text
    },
    { indexes: { product: ['product_id', 'created_at'] } }
);

// Append-only (migracion 027, spec §5.3).
const debt_payments = new Table(
    {
        debt_uuid: column.text,
        amount: column.text,
        method: column.text,
        device_id: column.text,
        created_at: column.text,
        location_id: column.text
    },
    { indexes: { debt: ['debt_uuid', 'created_at'] } }
);

// Append-only (migracion 026, spec §5.4). last_close_at() en Postgres =
// MAX(closed_at) -- localmente se calcula igual con una query sobre esta
// tabla, no hay una funcion espejo (Task 6 Step 2 / Task 9).
const day_closes = new Table({
    closed_at: column.text,
    device_id: column.text,
    // jsonb -> text: JSON.stringify al escribir, JSON.parse al leer.
    totals: column.text,
    location_id: column.text,
    created_at: column.text
});

export const AppSchema = new Schema({
    products,
    ingredients,
    profiles,
    app_config,
    sales,
    expenses,
    debts,
    replenishments,
    stock_movements,
    debt_payments,
    day_closes
});
