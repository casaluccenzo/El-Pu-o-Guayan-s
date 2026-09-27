# Offline-first POS — Plan B: PowerSync + reescritura del frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el POS (hoy PWA vanilla JS + Supabase directo) a PowerSync +
SQLite local, para que opere offline-first de verdad: la UI lee y escribe
SIEMPRE contra la base local, PowerSync sincroniza en segundo plano. Usa el
modelo de datos append-only que Plan A ya dejó en producción (dormido):
`stock_movements`, `day_closes`, `debt_payments`, `sales.voided_at`.

**Spec:** `docs/superpowers/specs/2026-09-02-offline-first-pos-design.md`
(todas las secciones aplican; referenciadas por número en cada task).

**Precondición cumplida:** Plan A completo en producción — ver
`docs/superpowers/plans/2026-09-02-offline-first-pos-plan-A-postgres.md` y
`docs/superpowers/plans/planA-shadow-report.md`. Las tablas/columnas nuevas
existen y están dormidas; nada del frontend las toca todavía.

**Escala (real, no estimación optimista):** el propio spec dice "el cambio
más grande al código desde el inicio del proyecto... semanas de trabajo
cuidadoso" (spec §11). Inventario concreto tomado del código real
(2026-09-23):
- `js/supabase.js` (1617 líneas): se reescribe casi entero salvo
  auth/PIN/reportes/sesiones — ~700-800 líneas de CRUD de
  products/sales/expenses/debts/replenishments/ingredients/app_config pasan
  de `client.from(...)` a hablar con SQLite local.
- `js/app.js` (5427 líneas): ~34 guards `navigator.onLine` a retirar, la
  cola offline actual (`OFFLINE_QUEUE_KEY`/`addToOfflineQueue`/
  `processOfflineQueue`, ~60 líneas) a eliminar, y cambios puntuales en
  `adjustStock`, `applyStockLoad`/`applyStockCount`, `closeDayAndResetLogs`,
  `settleDebtPayment`, `handleUndoSale`, y ~15 call-sites de
  `deleteSale(s)`/`deleteSalesByTimestamp`.
- Orden de magnitud combinado: **2000-2500 líneas tocadas**, en quizás 40-60
  funciones. No es un refactor de una tarde.

**Nuevo servicio externo:** PowerSync (SaaS gestionado o self-hosted). Esto
es una decisión que le corresponde al dueño del negocio, no al agente —
implica una cuenta nueva, y evaluar el plan gratis vs. las necesidades reales
(spec dice "el plan gratis alcanza para años a esta escala", pero eso hay que
confirmarlo contra los límites reales del plan vigente al momento de
ejecutar, no asumirlo de una fecha de spec pasada).

---

## Global Constraints

- **Rama aparte, nada toca producción hasta el rollout (spec §10).** Todo
  este plan se desarrolla en una rama propia; la app en `casalucenzo.com`
  sigue funcionando exactamente igual que hoy hasta la Task de rollout.
- **Modelo de escritura "guardar lo que pasó" (spec §5), no "pisar el
  resultado".** Cualquier código nuevo que toque stock/deudas/cierres debe
  insertar una fila en la tabla append-only correspondiente, nunca escribir
  directo `products.stock`, `debts.amount`, etc. desde el dispositivo.
- **PowerSync es la única fuente de verdad para OPERAR (spec §3).** Una vez
  wireado, ninguna función de escritura del día a día debe llamar a
  `client.from(...).upsert()` de Supabase directo — eso pasa a ser
  exclusivo de lo online-only (reportes, admin, auth).
- **Ningún dato sensible de auth (contraseñas, tokens) se loguea ni se manda
  a ningún sitio fuera de Supabase/PowerSync.**
- **Las funciones online-only del spec §4 (reportes agregados, gestión de
  usuarios/precios, `activity_logs`, bots, `pedidos_online`) NO se tocan en
  este plan salvo para agregarles un mensaje claro de "necesitás conexión"**
  — siguen hablando con Postgres directo, tal como hoy.
- **Nada de esto se aplica a la app real (`casalucenzo.com` / las tablets
  de producción) hasta pasar el rollout completo de la Task final** — modo
  sombra → una tablet → el resto (spec §10). Igual que Plan A, cada task
  intermedia se prueba en un entorno aislado primero.

---

## File Structure (nuevos/tocados, alto nivel — cada Task detalla los suyos)

| Archivo | Responsabilidad |
|---------|-----------------|
| `supabase/migrations/033_promote_stock_computed.sql` | products.stock/initial_stock/max pasan a ser mantenidos por el trigger de Plan A (no solo las columnas sombra) |
| `js/powersync/schema.js` (nuevo) | Definición del `Schema` local (tablas/columnas que PowerSync sincroniza) |
| `js/powersync/connector.js` (nuevo) | `PowerSyncBackendConnector` — `fetchCredentials` (JWT de Supabase) + `uploadData` (sube el CRUD local a Postgres) |
| `js/powersync/client.js` (nuevo) | Bootstrap de `PowerSyncDatabase`, expone `window.PowerSyncManager` |
| `js/supabase.js` | Reescritura de las funciones de lectura/escritura de products/sales/expenses/debts/replenishments/ingredients/app_config (queda solo auth/PIN/reportes/sesiones/bots) |
| `js/app.js` | Retiro de la cola offline vieja + los ~34 `navigator.onLine` + cambios en stock/cierre/deudas/anulación |
| `js/desktop.js`, `sw.js` | Sin cambios de fondo — el SW sigue cacheando assets estáticos; PowerSync usa su propio storage (OPFS/IndexedDB), ortogonal al SW |
| `tests/unit.test.js` | Tests nuevos de agregación pura (stock, saldo, last_close) |
| `tests/powersync-convergence.test.js` (nuevo) | Harness de 2 clientes offline → reconectan → convergen |

---

## Task 0: Decisión y entorno aislado

**Files:** ninguno (setup + decisión).

**Interfaces:**
- Produces: una rama git para Plan B, y una decisión explícita y documentada
  sobre la cuenta de PowerSync (cloud gestionado vs. self-hosted, qué plan).

- [x] **Step 1: Decisión de PowerSync — requiere al dueño del negocio**

  No es una decisión técnica que el agente pueda tomar solo (como ya pasó
  con crear el proyecto Supabase dev en Plan A, pero un escalón más arriba:
  acá se trata de sumar un proveedor SaaS nuevo a la cadena, con su propio
  ciclo de facturación). Presentar al usuario:
  - **PowerSync Cloud** (gestionado, más simple de arrancar) vs.
    **self-hosted** (Docker, más control, más mantenimiento).
  - Confirmar el plan gratis vigente cubre la escala real (~29 productos,
    3 perfiles, ventas/gastos de los últimos 60 días, 2-3 dispositivos) —
    chequear los límites actuales en `https://www.powersync.com/pricing` al
    momento de decidir, no confiar en lo que diga este plan.
  - El usuario crea la cuenta/proyecto de PowerSync (igual criterio que
    Plan A Task 0: el agente no crea cuentas en servicios de terceros que
    impliquen un compromiso del negocio, salvo pedido explícito).

- [x] **Step 2: Crear la rama**

  ```bash
  git checkout main && git pull origin main
  git checkout -b feature/offline-first-plan-b
  ```

- [x] **Step 3: Commit del scaffold**

  ```bash
  git commit --allow-empty -m "chore: start offline-first Phase 1 (Plan B)"
  ```

---

## Task 1: Publication de Postgres + proyecto PowerSync + sync rules

**Files:**
- Create: `supabase/migrations/034_powersync_publication.sql`
- Create: `docs/superpowers/plans/planB-sync-rules.yaml` (o el nombre que
  pida el dashboard de PowerSync — confirmar contra la doc real al ejecutar)

**Interfaces:**
- Consumes: el `DEV_PROJECT_ID` de Plan A (`casa-lucenzo-dev`) para probar
  antes de tocar producción — mismo patrón de aislamiento que Plan A.
- Produces: una `PUBLICATION` en Postgres que PowerSync puede leer, y un
  proyecto PowerSync conectado a ella con sync rules definidas.

> **Nota de honestidad:** esta task depende de la consola/dashboard de
> PowerSync (no solo SQL), y de la versión vigente de su documentación al
> momento de ejecutar — `docs.powersync.com` no fue accesible al escribir
> este plan (egress bloqueado desde este entorno), así que los pasos de acá
> son la forma conocida y verificada por búsqueda (confirmado por búsqueda
> web 2026-09-23), pero **hay que releer la doc oficial al ejecutar esta
> task**, no copiar esto a ciegas.

- [x] **Step 1: Crear la publication en el proyecto dev**

  Patrón confirmado (PowerSync requiere una `PUBLICATION` sobre las tablas
  que sincroniza):

  ```sql
  -- Migration 034: publication para PowerSync — tablas que bajan al dispositivo
  -- (spec §4, "Bajan al dispositivo"). NO incluye activity_logs,
  -- bcv_rate_history, bcv_sync_log, pedidos_online, whatsapp_conversations
  -- (esas quedan online-only).
  BEGIN;
  CREATE PUBLICATION powersync FOR TABLE
    public.products,
    public.ingredients,
    public.profiles,
    public.app_config,
    public.sales,
    public.expenses,
    public.debts,
    public.debt_payments,
    public.stock_movements,
    public.replenishments,
    public.day_closes;
  COMMIT;
  ```

  Aplicar primero a `casa-lucenzo-dev` vía `apply_migration` (MCP Supabase),
  igual criterio de aislamiento que Plan A.

- [x] **Step 2: Crear el proyecto PowerSync (dashboard, no SQL) y conectarlo al dev**

  Con la decisión de la Task 0 Step 1 ya tomada por el usuario. Configurar
  auth: activar "Use Supabase Auth" en el proyecto PowerSync y pegar el JWT
  secret de `casa-lucenzo-dev` (Supabase → Settings → API).

- [x] **Step 3: Sync rules — qué baja y con qué filtro** (revisado: el motor
      real no permite ventanas móviles vía `now()`/parámetros con `>=` — ver
      cabecera de `docs/superpowers/plans/planB-sync-rules.yaml` para el
      detalle. Se sincroniza cada tabla completa, sin filtro, por decisión
      explícita con Gustavo.)

  Traducir la tabla del spec §4 a sync rules reales (formato YAML del
  dashboard de PowerSync — confirmar la sintaxis exacta contra la doc al
  ejecutar):
  - `products`, `ingredients`, `profiles`, `app_config` (fila `id=1`): todo.
  - `sales`, `expenses`: ventana móvil `timestamp >= now() - 60 days`.
  - `debts`, `debt_payments`: últimos 60 días (abiertas + cerradas).
  - `stock_movements`: desde el último `day_close` para categoría
    `pastelitos`; 60 días para el resto (regla compuesta — puede requerir
    dos buckets de sync rules, uno por categoría).
  - `replenishments`: día en curso + 7 días previos.
  - `day_closes`: últimas ~10 filas.

- [x] **Step 4: Verificación de conexión**

  Confirmar en el dashboard de PowerSync que la conexión al proyecto dev
  da "Connection Successful" (o el estado equivalente vigente), y que las
  tablas de la publication aparecen listadas.

- [x] **Step 5: Commit** (`43a74bf`)

---

## Task 2: Promover las columnas sombra de Plan A a reales

**Files:**
- Create: `supabase/migrations/033_promote_stock_computed.sql`

**Interfaces:**
- Consumes: `recompute_product_stock()` de Plan A (migración 030).
- Produces: el mismo trigger, extendido para que además escriba
  `products.stock`, `products.initial_stock`, `products.max` — las columnas
  REALES que el frontend de hoy lee. Deja de haber "sombra" vs. "real": pasan
  a ser la misma cosa, calculada por Postgres.

> **Por qué esta task existe:** el spec §5.1 es explícito — "`products.stock`,
> `products.initial_stock` y `products.max` dejan de escribirse desde el
> dispositivo: pasan a ser cache calculado por Postgres". Plan A dejó el
> cálculo en columnas sombra separadas (`stock_computed`, etc.) a propósito,
> para poder compararlas contra las reales sin tocar el comportamiento de la
> app. Esta task es el momento en que esa comparación ya no hace falta y el
> cálculo se vuelve la fuente real — **es el punto de no retorno de Plan B**,
> equivalente al de la Task 10 de Plan A. Antes de este punto, ninguna
> escritura del frontend puede haberse movido todavía a `stock_movements`
> (si se movió, `products.stock` real dejaría de actualizarse y la app hoy
> lo notaría). El orden correcto es: esta task PRIMERO (columnas reales
> empiezan a ser mantenidas por el trigger, pero el frontend todavía
> escribe directo — last-write-wins entre el trigger y el frontend, sin
> romper nada porque a esta altura nadie más inserta en `stock_movements`
> salvo el backfill de Plan A) → recién en la Task 6 el frontend deja de
> escribir directo y empieza a insertar movimientos.

- [ ] **Step 1: Escribir y aplicar la migración (dev primero)**

  ```sql
  -- Migration 033: las columnas reales de products pasan a ser mantenidas
  -- por el mismo trigger que ya mantiene las columnas sombra (Plan A, 030).
  BEGIN;

  CREATE OR REPLACE FUNCTION public.recompute_product_stock(p_product_id text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
      v_cat        text;
      v_t0         timestamptz := public.last_close_at();
      v_stock      integer;
      v_initial    integer;
      v_max_cfg    integer;
  BEGIN
      SELECT category, max INTO v_cat, v_max_cfg
        FROM public.products WHERE id = p_product_id;
      IF NOT FOUND THEN RETURN; END IF;

      IF v_cat = 'pastelitos' THEN
          SELECT COALESCE(SUM(delta),0) INTO v_stock
            FROM public.stock_movements
           WHERE product_id = p_product_id AND created_at > v_t0;
          SELECT COALESCE(SUM(delta),0) INTO v_initial
            FROM public.stock_movements
           WHERE product_id = p_product_id AND created_at > v_t0 AND type = 'load';
      ELSE
          SELECT COALESCE(SUM(delta),0) INTO v_stock
            FROM public.stock_movements
           WHERE product_id = p_product_id;
          SELECT
            COALESCE((SELECT SUM(delta) FROM public.stock_movements
                       WHERE product_id = p_product_id AND created_at <= v_t0), 0)
            + COALESCE((SELECT SUM(delta) FROM public.stock_movements
                         WHERE product_id = p_product_id AND created_at > v_t0 AND type = 'load'), 0)
            INTO v_initial;
      END IF;

      UPDATE public.products
         SET stock_computed         = v_stock,
             initial_stock_computed = v_initial,
             max_computed           = GREATEST(v_initial, COALESCE(v_max_cfg, 0)),
             -- NUEVO: las columnas reales, mismo cálculo.
             stock                  = v_stock,
             initial_stock          = v_initial,
             max                    = GREATEST(v_initial, COALESCE(v_max_cfg, 0))
       WHERE id = p_product_id;
  END;
  $$;

  COMMIT;
  ```

  Aplicar a `casa-lucenzo-dev` primero.

- [ ] **Step 2: Aserción — el trigger no rompe nada al insertar un movimiento manual**

  Reusar el patrón de Plan A Task 6: insertar un `stock_movements` de prueba
  sobre un producto dev y verificar que `products.stock` (la columna real)
  cambia igual que `stock_computed`. Agregar a un
  `supabase/tests/planB_assertions.sql` nuevo (mismo espíritu que
  `planA_assertions.sql`).

- [ ] **Step 3: Gate — aplicar a producción — BLOQUEADO, no es solo revisar call sites**

  Verificado contra producción real (2026-09-26): `day_closes` tiene
  **0 filas** desde que existe la tabla (23-sep). `last_close_at()` devuelve
  `-infinity` y nunca avanzó — Task 9 (cierre de jornada inserta en
  `day_closes`) todavía no está hecha. El cron `api/daily-restock.js`
  (fix de esta sesión, `3ac1f13`, ya en `main`) inserta un `stock_movements`
  `load` de +15 cada día; sin que `last_close_at()` avance, el trigger de
  esta Task sumaría sobre TODO el historial en vez de resetear diariamente
  — `products.stock` real de pastelitos crecería sin techo (15, 30, 45...)
  apenas se aplique esta migración a producción. Ya le está pasando a la
  columna sombra `stock_computed` (invisible hoy porque nada la lee) y se
  volvería visible/roto en cuanto se prometa a columna real.

  **No aplicar a producción hasta que exista un mecanismo real que avance
  `last_close_at()` allá** — lo más limpio es adelantar la parte de Task 9
  que inserta en `day_closes` (aunque sea antes que el resto de esa task),
  o alguna mitigación equivalente. Además, sigue pendiente el chequeo
  original de call sites de `updateProductStock` (14 en `js/app.js`) una vez
  resuelto lo anterior.

- [x] **Step 4: Commit** (archivos, verificados en dev — la aplicación a
      producción sigue bloqueada por el Step 3 de arriba)

---

## Task 3: Bootstrap del cliente PowerSync

**Files:**
- Create: `js/powersync/schema.js`
- Create: `js/powersync/connector.js`
- Create: `js/powersync/client.js`
- Modify: `sistema/index.html` (cargar los 3 scripts nuevos + el SDK de
  PowerSync), `sw.js` (agregar los 3 archivos nuevos a `SCRIPTS`)

**Interfaces:**
- Produces: `window.PowerSyncManager` — expone `db` (instancia de
  `PowerSyncDatabase`), `connect()`, `getSyncStatus()`.
- Consumes: el JWT de la sesión de Supabase ya activa (`SupabaseManager`).

> Mismo caveat que la Task 1: verificar nombres de paquete/API exactos
> contra `docs.powersync.com` al ejecutar. Lo de abajo es la forma conocida
> del SDK JS Web de PowerSync (paquete `@powersync/web`, clases `Schema` /
> `Table` / `Column`, interfaz `PowerSyncBackendConnector` con
> `fetchCredentials()` y `uploadData(database)`), no una transcripción de la
> doc bloqueada.

- [x] **Step 1: Definir el schema local** (`js/powersync/schema.js`) — columnas
      verificadas contra las migraciones reales, no contra el spec (que
      estaba desactualizado en varios nombres). `sales`/`expenses`/`debts`/
      `replenishments` usan `uuid` como PK real en Postgres, no `id` — ver
      la correccion en `planB-sync-rules.yaml` (alias `uuid AS id` en el
      sync stream).

- [x] **Step 2: Implementar el connector de Supabase** (`js/powersync/connector.js`)
      — API real verificada contra el conector de referencia de PowerSync
      (`getNextCrudTransaction()`, `{op, table, id, opData}`,
      `transaction.complete()`), no contra la doc generica que no la cubre.

- [ ] **Step 3: Bootstrap y arranque — BLOQUEADO, decision de arquitectura pendiente**

  Instanciar `PowerSyncDatabase` con storage OPFS (web), conectar el
  connector, llamar `connect()` en el arranque de la app (después de login).

  **Hallazgo (2026-09-26, probado en navegador real, no solo doc):**
  `@powersync/web` abre su SQLite/OPFS dentro de un `SharedWorker`, y ese
  worker se construye con una URL relativa al origen desde donde se cargó
  el paquete — no hay ninguna opción de configuración para cambiarla
  (confirmado contra la doc oficial). Cargar el paquete desde un CDN (mismo
  patron que `@supabase/supabase-js` hoy, `cdn.jsdelivr.net/npm/...`, que
  este proyecto usa porque no tiene bundler) importa el modulo principal sin
  problema, pero `new SharedWorker(...)` tira `SecurityError` porque el
  script del worker queda en un origen distinto (el CDN) al de la app.
  Verificado con un test real: `db.init()` falla ahi mismo, no es teorico.

  **Resuelto (2026-09-26) — Camino 1, con el input de Gemini:**
  `npx @powersync/web copy-assets --output js/powersync/vendor` es una
  herramienta OFICIAL del paquete (confirmado contra `npm view`/`--help`
  antes de correrla, no solo porque Gemini la sugirio) que copia
  `worker.js` + los WASM a una carpeta local. `PowerSyncDatabase` acepta
  `database.worker` (string/URL/factory) para apuntar ahi -- esta opcion
  no aparecia bien documentada en `docs.powersync.com`, se confirmo
  leyendo el `.d.ts` real del paquete instalado.

  El modulo PRINCIPAL sigue viniendo del CDN (mismo patron que
  `@supabase/supabase-js`, pinneado a una version exacta via importmap) --
  no hace falta vendorizarlo tambien: `sw.js` ya cachea cualquier request
  cross-origin de forma generica (stale-while-revalidate, unica excepcion
  `supabase.co`), asi que queda disponible offline despues de la primera
  carga sin cambios adicionales.

  Verificado en un navegador real, de punta a punta, incluyendo un `INSERT`
  + `SELECT` reales contra `window.PowerSyncManager.db` (no solo que
  importe sin tirar error). Hay un log cosmetico
  ("[PowerSync]: Caught error while attempting to cleanup triggers
  SecurityError...") de una rutina interna de `@powersync/shared-internals`
  separada de la conexion principal -- ya viene atajado por la propia
  libreria ("Caught error"), no afecta el INSERT/SELECT real. Ver el
  comentario en `client.js` si reaparece.

- [x] **Step 4: Prueba manual — dev — verificado de punta a punta**

  Login real contra `casa-lucenzo-dev` con un usuario de prueba
  (`test@casalucenzo.com`, creado por Gustavo vía dashboard). Encontrados y
  corregidos 2 problemas reales que solo aparecen con datos/auth reales
  (ninguno de los dos era detectable con el test aislado de antes):

  1. **`sync.worker` faltante.** `database.worker` (ya seteado) resuelve el
     adaptador SQL; el mecanismo de sync/upload-queue
     (`@powersync/shared-internals`, el mismo "Caught error... cleanup
     triggers" que se había marcado como cosmético) usa una opción
     SEPARADA, `sync.worker`, con el mismo problema de origen cruzado. Sin
     ella, `connect()` resolvía sin tirar error pero nunca conectaba de
     verdad (`currentStatus.connected` quedaba en `false` para siempre, cero
     requests de red). Con `sync: { worker: WORKER_PATH }` agregado, conecta
     bien -- **la nota anterior de "cosmético" en `client.js` estaba mal**,
     ya corregida.
  2. **JWKS vs JWT secret legacy.** El JWT secret legacy que se pegó en
     Client Auth (Task 1) era para el alias `anon`; las sesiones de
     usuario real (`signInWithPassword`) vienen firmadas con las claves
     asimétricas nuevas de Supabase (`alg: ES256`, con `kid`) -- PowerSync
     rechazaba el token con `401 PSYNC_S2101` ("no key matched the token
     KID"). Se resolvió configurando JWKS en el dashboard de PowerSync.

  Con ambos arreglados: `connect()` conecta de verdad, los 11 streams
  quedan `has_synced: true`, los datos reales del seed de Plan A
  (`seed-past-a`, etc.) aparecen en las tablas locales, y un
  `INSERT`/`DELETE` de prueba en `ingredients` desde el navegador
  confirmó llegar y borrarse en Postgres dev real (verificado con
  `execute_sql` contra `casa-lucenzo-dev`, no asumido).

- [x] **Step 5: Commit**

---

## Task 4: Lecturas — products/sales/expenses/debts/replenishments/ingredients/app_config

**Files:**
- Modify: `js/supabase.js` — `fetchProducts` (332), `fetchSales` (351),
  `fetchExpenses` (378), `fetchDebts` (398), `fetchReplenishments` (410),
  `fetchIngredients` (422), `fetchAppConfig` (1072)

**Interfaces:**
- Consumes: `window.PowerSyncManager.db`.
- Produces: las mismas funciones, misma firma de retorno (para no romper a
  los ~40-60 call sites que ya las consumen), pero leyendo de SQLite local
  en vez de `client.from(...).select()`.

- [x] **Step 1: Reescribir cada función, una por una, manteniendo la firma**

  Las 7 reescritas con un `getLocalDb()` compartido al tope del archivo, no
  `db.watch()` (queda para si hace falta más adelante) — cada función
  intenta la lectura local primero y cae a Supabase si no aplica.

  **Hallazgo importante no anticipado por el plan:** `getLocalDb()` no
  puede devolver la base con solo que `window.PowerSyncManager.db` exista
  -- ese objeto se crea en el arranque de la página (`client.js`),
  **antes** del login, y `connect()` (Task 3) recién corre en
  `handleUserLogin` tras un login exitoso. `loadAllDataFromSupabase()`
  (que llama a estas 7 funciones) corre en la inicialización de la app,
  **antes** de cualquier login. Sin un chequeo adicional, esa primerísima
  carga leería una tabla local vacía en vez de traer los datos reales de
  Supabase -- el catálogo se habría visto vacío hasta loguearse. Se
  resolvió gateando en `db.currentStatus.hasSynced` (confirmado contra el
  `.d.ts` real de `@powersync/common`), no solo en la existencia del
  objeto. Verificado en navegador: antes de sincronizar,
  `hasSynced === false` y el catálogo sigue cargando 29 productos reales
  desde Supabase, sin cambios.

  También se atendieron dos observaciones de Gemini, verificadas antes de
  aplicarlas: (a) `use_auto_bcv`/`totp_enabled` de `app_config` llegan como
  `0`/`1` desde SQLite -- varios call sites comparan con `!== false`, que
  da `true` para CUALQUIER número (tipos distintos, nunca son
  estrictamente iguales a `false`), así que `mapAppConfigRow` los
  normaliza con `!!` de vuelta a boolean real; (b) `sales`/`expenses`/
  `debts`/`replenishments` preservan la columna `uuid` explícita en
  paralelo al `id` local (ya resuelto desde el schema de Task 3), así que
  el código existente que lee `.uuid` sigue funcionando sin cambios.

- [x] **Step 2: Test manual por función — verificado con datos reales**

  Con el login real de Task 3 Step 4: las 7 funciones devuelven datos del
  seed real de `casa-lucenzo-dev` con la forma esperada -- `price`/`cost`/
  `bcv_rate`/`amount` como `number` (no el string que da SQLite),
  `use_auto_bcv`/`totp_enabled` como `boolean` (no `0`/`1`), `productId`/
  `clientName` presentes. Encontrada de paso otra correccion real de
  schema, no solo de este Step: PowerSync mapea TODAS las columnas
  `numeric` de Postgres a `column.text` (no `column.real` como se habia
  puesto en Task 3) -- confirmado contra el generador oficial de schema
  del dashboard de PowerSync (introspecciona la publication real), no
  adivinado. `real` de SQLite es punto flotante y puede redondear mal un
  monto de dinero; `text` conserva el valor exacto. `js/powersync/schema.js`
  y los mappers de esta task ya corregidos y verificados juntos.

- [x] **Step 3: Commit**

---

## Task 5: Escrituras genéricas — products/expenses/debts/replenishments/ingredients/app_config

**Files:**
- Modify: `js/supabase.js` — `upsertProduct` (448), `deleteProduct` (503),
  `insertExpense` (640), `deleteExpense`/`deleteExpenses` (665/680),
  `upsertDebt` (696), `deleteDebt` (719), `upsertReplenishment` (750),
  `deleteReplenishment` (775), `upsertIngredient` (790), `upsertAppConfig`
  (1090)

**Interfaces:**
- Produces: las mismas funciones, escribiendo `INSERT`/`UPDATE`/`DELETE`
  locales vía `db.execute(...)` en vez de `client.from(...).upsert()`.
  PowerSync encola el cambio solo — nada de `enqueueOfflineOp` manual.

> **Nota:** `updateProductStock` (477) y las escrituras de venta/stock NO
> van acá — esas son la Task 6 (el modelo append-only), porque tocan la
> regla "guardar lo que pasó", no un CRUD genérico.

- [ ] **Step 1: Reescribir cada función**
- [ ] **Step 2: Test manual — dos pestañas offline (spec §9, "manual")**

  Dos pestañas del navegador en modo avión, cada una hace un cambio (p.ej.
  editar dos productos distintos), reconectar, confirmar que ambos cambios
  llegan a Postgres dev sin pisarse.

- [ ] **Step 3: Commit**

---

## Task 6: Stock — `adjustStock`/`applyStockLoad`/`applyStockCount` insertan `stock_movements`

**Files:**
- Modify: `js/app.js` — `applyStockLoad` (392-400), `applyStockCount`
  (411-423), `adjustStock` (431-502)
- Modify: `js/supabase.js` — nueva función `insertStockMovement(...)`
  reemplaza el uso directo de `updateProductStock` (477) desde estos 3
  call sites (esa función queda para los paths que de verdad necesiten
  pisar `max` manualmente, si quedara alguno)

**Interfaces:**
- Consumes: Task 2 (columnas reales mantenidas por trigger) y Task 3
  (cliente PowerSync).
- Produces: cada acción de stock inserta 1 fila en `stock_movements` local
  (`type` según spec §5.1a: `load` para carga/recuento-hacia-arriba, `sale`
  para -1 del carrito, `sale_return` para +1 del carrito, `count_down` para
  recuento hacia abajo). `products.stock`/`initial_stock`/`max` ya NO se
  escriben desde acá — el trigger de la Task 2 los recalcula solo al llegar
  el movimiento a Postgres. Localmente, mientras no sincronizó, la UI debe
  mostrar el stock optimista (ver Step 2).

- [ ] **Step 1: Mapear cada call site a un `type` de movimiento**

  Tabla exacta del spec §5.1a (sección "Caminos que hoy tocan los
  contadores"): carrito +1/-1 → `sale_return`/`sale` con `delta=±1`; carga
  de cocina (`applyStockLoad`) → `load` con `delta=+N`; recuento hacia
  arriba → `load` con `delta=Δ`; recuento hacia abajo (`applyStockCount`
  bajando) → `count_down` con `delta` negativo.

- [ ] **Step 2: Stock optimista en la UI mientras no sincronizó**

  Como `products.stock` ya no se escribe local, la UI (que hoy lee
  `product.stock` directo tras mutar el objeto en memoria) necesita seguir
  mostrando el número correcto al toque, antes de que el trigger de
  Postgres corra. Opciones a evaluar: (a) mantener un cálculo optimista en
  JS espejando la fórmula del spec §5.1a sobre los `stock_movements` locales
  no confirmados todavía, o (b) usar una vista/query local en PowerSync que
  sume los movimientos en tiempo real (`db.watch()`). Preferir (b) si el
  query local da la performance necesaria (~29 productos, trivial) — evita
  mantener dos implementaciones de la misma fórmula.

- [ ] **Step 3: Reescribir `applyStockLoad`, `applyStockCount`, `adjustStock`**

- [ ] **Step 4: Test unitario — la fórmula del spec en JS**

  Extender `tests/unit.test.js`: dado un set de `stock_movements` y un
  `last_close_at`, el cálculo optimista en JS (Step 2a si se eligió esa
  vía) debe dar el mismo resultado que la fórmula de Postgres — mismo
  espíritu que Plan A Task 6 pero del lado del cliente.

- [ ] **Step 5: Test manual — offline, vender, verificar stock negativo no bloquea (spec R3)**

- [ ] **Step 6: Commit**

---

## Task 7: Anulación de venta — `voided_at` en vez de `DELETE`

**Files:**
- Modify: `js/supabase.js` — retirar `deleteSale` (572), `deleteSales`
  (587), `deleteSalesByTimestamp` (621); agregar `voidSale(uuid, reason)`
  y `voidSalesByTimestamp(timestamp, reason)`
- Modify: `js/app.js` — `handleUndoSale` (823) y los ~15 call sites de
  `deleteSale(s)`/`deleteSalesByTimestamp` (679, 746, 847, 1097, 2064, 2296
  y los que aparezcan en la búsqueda final — confirmar el conteo exacto al
  ejecutar, el inventario de arriba es del agente explorador, no
  exhaustivo garantizado)

**Interfaces:**
- Produces: `UPDATE sales SET voided_at = now(), void_reason = ? WHERE
  uuid = ?` + un `stock_movements` de tipo `sale_return` (`delta=+1`) por
  cada unidad de esa venta, `source_uuid` = el `uuid` anulado — todo local,
  vía PowerSync.
- **Nunca `DELETE` de una fila ya sincronizada** (spec §5.2, regla dura).

- [ ] **Step 1: `voidSale`/`voidSalesByTimestamp`**
- [ ] **Step 2: Reescribir `handleUndoSale` y el flujo "Modificar cuenta"/"Corregir"**

  El flujo de "editar cuenta" (spec §5.2, "Editar una cuenta"): en vez de
  `deleteSalesByTimestamp` + re-insert, anular cada fila de esa cuenta con
  su `sale_return`, e insertar el set corregido como cuenta nueva. Ver
  `handleUndoSale` (app.js:823) y los call sites en 679/746 para el flujo
  real de "Corregir" (botón en ui.js:3534-3542).

- [ ] **Step 3: Actualizar reportes/caja para ignorar `voided_at IS NOT NULL`**

  Cualquier query local (Task 4) que agregue `sales` debe filtrar
  `WHERE voided_at IS NULL`.

- [ ] **Step 4: Test manual — anular, confirmar que no rompe el cierre del día**
- [ ] **Step 5: Commit**

---

## Task 8: Abonos a deudas — `debt_payments` en vez de mutar `debts.amount`

**Files:**
- Modify: `js/app.js` — `settleDebtPayment` (1657-~1705)
- Modify: `js/supabase.js` — `upsertDebt` queda solo para crear/editar la
  deuda original (`addDebt`, 1602-1651, sin tocar); nueva función
  `insertDebtPayment(debtUuid, amount, method)`

**Interfaces:**
- Produces: cada abono es un `INSERT` en `debt_payments` local (append-only,
  spec §5.3). El saldo mostrado en la UI pasa a calcularse como
  `debts.amount - SUM(debt_payments.amount WHERE debt_uuid = ?)` (query
  local o vista PowerSync), no una resta que se persiste.

> **Ojo con el flujo actual:** `settleDebtPayment` hoy hace tres cosas en
> una (app.js:1657-1705) — resta `debts.amount`, crea una venta sintética
> `productId: 'abono'` para que aparezca como ingreso de caja, y llama
> `upsertDebt` + `insertSale`. La parte de la venta sintética (`sales` con
> `productId='abono'`) **no cambia** — `sales` ya es append-only y no es
> parte del modelo de deudas. Solo la resta directa de `debts.amount` se
> reemplaza por el insert en `debt_payments`.

- [ ] **Step 1: `insertDebtPayment`**
- [ ] **Step 2: Reescribir `settleDebtPayment`** — insertar el pago, dejar
      la venta sintética de "abono" como está, dejar de mutar `debts.amount`
      directo.
- [ ] **Step 3: Dos dispositivos cobrando el mismo cliente offline (spec §9 manual)**

  El caso que el spec pone como ejemplo explícito de por qué este modelo
  hace falta — confirmar que los dos abonos entran y el saldo baja bien.

- [ ] **Step 4: Commit**

---

## Task 9: Cierre de jornada — `day_closes` en vez de mutar `products`/borrar logs

**Files:**
- Modify: `js/app.js` — `closeDayAndResetLogs` (2038-2133)

**Interfaces:**
- Produces: el cierre pasa a ser un `INSERT` en `day_closes` local
  (`id`, `closed_at`, `device_id`, `totals` jsonb) — nada más. El reset de
  `products.stock` para pastelitos ya no se escribe: al llegar la fila de
  `day_closes` a Postgres, el trigger de Plan A/Task 2 recalcula solo
  (`last_close_at()` cambia → todos los productos se recalculan).

> **Simplificación real respecto a hoy:** el código actual (2038-2133) hace
> guard de reentrancia, escribe en servidor, guarda localmente, vacía
> arrays de `salesLog`/`expenses`, limpia storage, resetea stock manual, y
> refresca BCV — bastante lógica dispersa. Con este modelo, los pasos de
> "vaciar `salesLog`/`expenses`" y "resetear stock manual" **desaparecen**:
> `sales`/`expenses` ya son append-only con fecha, así que un reporte del
> día de hoy simplemente filtra por fecha en vez de depender de un array
> que se vacía; y el stock se resetea solo vía el trigger. Lo único que
> queda es: insertar `day_closes`, refrescar BCV, re-renderizar.

- [ ] **Step 1: Reescribir `closeDayAndResetLogs`**
- [ ] **Step 2: Actualizar los reportes que hoy leen `salesLog`/`expenses` como arrays acotados al día**

  Deben pasar a filtrar por `timestamp > last_close_at()` en la query local,
  no depender de que el array se vació.

- [ ] **Step 3: Dos dispositivos cerrando offline (spec §9 manual)** — confirmar
      que dos filas en `day_closes` no rompen nada, gana la más nueva.
- [ ] **Step 4: Commit**

---

## Task 10: PIN offline — validación local

**Files:**
- Modify: `js/pin-management.js`
- Modify: `js/app.js` — `handleQuickPINInput` (3422-~3490)

**Interfaces:**
- Consumes: `profiles.pin_hash` ya replicado localmente por PowerSync
  (Task 1 sync rules — `profiles` baja completa).
- Produces: `verifyQuickPin` corre contra la SQLite local con lockout
  (`pin_failed_attempts`/`pin_locked_until`) evaluado en JS, sin red. El RPC
  `verify_quick_pin` (Postgres, supabase.js:965) queda como fallback online
  (spec §6, punto 2).

> **La pieza más sensible en seguridad de todo Plan B.** El RPC actual usa
> `crypt()`/`pgcrypto` (bcrypt) del lado de Postgres — replicarlo en el
> cliente implica una librería bcrypt en JS (evaluar `bcryptjs`, puro JS,
> sin dependencias nativas, para no romper el bundle web). Cualquier
> desvío de comportamiento acá (timing, manejo del lockout) es una
> superficie de ataque real sobre PINs de 4 dígitos. Antes de escribir
> código: confirmar con el usuario si prefiere bcryptjs u otra alternativa,
> y hacer una revisión de seguridad dedicada (`/security-review`) de esta
> task específica antes de darla por cerrada, aparte del resto del plan.

- [ ] **Step 1: Elegir librería de hashing y confirmar con el usuario**
- [ ] **Step 2: Reescribir la verificación local (lockout incluido)**
- [ ] **Step 3: Revisión de seguridad dedicada de este código**
- [ ] **Step 4: Test — 3 intentos fallidos bloquea local, igual que hoy en servidor**
- [ ] **Step 5: Commit**

---

## Task 11: Alta de dispositivo + límite de 30 días offline

**Files:**
- Modify: `js/auth.js`, `js/app.js` (`handleUserLogin`, 3353-3415)

**Interfaces:**
- Produces: guardado seguro del refresh token de Supabase en el
  dispositivo (spec §6, punto 1 — Secure Storage queda para Fase 2/Capacitor;
  en web, el storage de sesión que Supabase ya maneja), renovación
  automática de sesión al reconectar, y bloqueo forzado si pasaron > 30 días
  offline (spec §6, "Bordes").

- [ ] **Step 1: Confirmar dónde vive hoy el refresh token en la sesión web de Supabase**
- [ ] **Step 2: Lógica de renovación automática al reconectar**
- [ ] **Step 3: Contador de días offline + bloqueo a los 30**
- [ ] **Step 4: Test manual — simular > 30 días (mockear la fecha) y confirmar que pide login completo**
- [ ] **Step 5: Commit**

---

## Task 12: Retirar la cola offline vieja + los `navigator.onLine`

**Files:**
- Modify: `js/app.js` — retirar `OFFLINE_QUEUE_KEY` (84),
  `getOfflineQueue`/`addToOfflineQueue`/`processOfflineQueue` (86-143),
  `handleCleanOfflineCache` (155-247, adaptar o retirar según si sigue
  haciendo falta un botón de "forzar sync" con PowerSync), y los guards
  `navigator.onLine` de líneas 161, 272, 320, 1447, 1567, 2615, 2677, 2701,
  3704, 3714, 4118, 4585, 4627 (confirmar la lista completa al ejecutar —
  puede haber cambiado desde el inventario de este plan)
- Modify: `js/supabase.js` — retirar `enqueueOfflineOp` (102-111),
  `syncOfflineQueue` (144-275), `moveToDeadLetterQueue` (129-139), y los
  guards de líneas 145/290/464/490/506/530/558/575/591/624/652/668/684/706/
  722/738/762/778/800/1123/1464/1546 (algunos ya no aplican si la función
  que envolvían se reescribió en Tasks 4-9)
- Modify: `js/sales.js` — línea 108 (`isOffline` flag)

**Interfaces:**
- Produces: cero referencias a `OFFLINE_QUEUE_KEY`/`navigator.onLine` fuera
  de un indicador de estado de sync (Task 13). Las escrituras ya no
  necesitan preguntar si hay red — PowerSync decide solo.

> **Orden importa: esta task va DESPUÉS de las Tasks 4-9**, no antes — cada
> guard `navigator.onLine` protege una función que recién en esas tasks deja
> de necesitar el chequeo. Retirarlos antes rompería la app en el medio del
> refactor.

- [ ] **Step 1: Confirmar que ninguna función activa todavía depende de la cola vieja**

  Grep de `enqueueOfflineOp`/`addToOfflineQueue` — debe dar cero llamadas
  activas (solo las definiciones, a punto de borrarse).

- [ ] **Step 2: Retirar cola vieja + guards, uno por archivo**
- [ ] **Step 3: `npm test` + smoke test manual completo (login, vender, cerrar, todo) contra dev**
- [ ] **Step 4: Commit**

---

## Task 13: Indicador de estado de sync

**Files:**
- Modify: `sistema/index.html` (el badge que ya existe, `#header-offline-badge`,
  línea ~117 — reusar el elemento, cambiar qué lo dispara)
- Modify: `js/app.js`

**Interfaces:**
- Produces: el indicador pasa de "Actualizado hace X" / offline-badge
  manual a reflejar `PowerSyncManager.getSyncStatus()` (sincronizado /
  pendiente / offline) en tiempo real.

- [ ] **Step 1: Suscribirse a los eventos de estado de PowerSync**
- [ ] **Step 2: Actualizar el badge existente**
- [ ] **Step 3: Commit**

---

## Task 14: Reportes online-only — mensaje claro en vez de fallo silencioso

**Files:**
- Modify: `js/supabase.js` — `fetchStatsData` (1136), `fetchExpensesRange`
  (1167), `fetchPnlData` (1182), `fetchDayReport` (1207), `fetchReportDays`
  (1273), `fetchSalesHistory` (1316), `fetchActiveSessions` (1347)
- Modify: `js/ui.js` (los paneles que llaman a estas funciones)

**Interfaces:**
- Produces: estas funciones siguen hablando con Postgres directo (spec §4,
  explícitamente online-only), pero si `navigator.onLine` es `false`
  muestran un mensaje claro ("Necesitás conexión para ver esto") en vez del
  fallo silencioso/guard mudo de hoy.

- [ ] **Step 1: Un helper `requireOnline(featureName)` reusable**
- [ ] **Step 2: Aplicarlo a cada función de la lista**
- [ ] **Step 3: Commit**

---

## Task 15: Tests unitarios de agregación pura

**Files:**
- Modify: `tests/unit.test.js`

**Interfaces:**
- Produces: tests para `stock = Σ movimientos` (con frontera de cierre,
  ambas categorías), `saldo = total − Σ abonos`, `last_close = MAX(closed_at)`
  — implementados como funciones JS puras si Task 6 Step 2 eligió el camino
  optimista-en-cliente, o como tests contra el schema local de PowerSync si
  no. Mismo espíritu que los tests ya existentes de `aggregatePnl`/
  `estimateProductionCost`.

- [ ] **Step 1-N:** un test por fórmula, casos borde incluidos (cierre sin
      movimientos, producto nuevo sin historial, dos categorías cruzando el
      mismo cierre).
- [ ] **Step final: Commit**

---

## Task 16: Harness de convergencia — dos clientes PowerSync

**Files:**
- Create: `tests/powersync-convergence.test.js`

**Interfaces:**
- Produces: un test (puede requerir Node + un entorno headless, o correrse
  manual con dos pestañas reales si el harness automatizado no es viable
  en el tiempo disponible — documentar la decisión, no fingir automatización
  que no se hizo) que simula 2 dispositivos offline, cada uno vende del
  mismo producto y registra un abono al mismo cliente, reconectan, y se
  verifica: ninguna venta se pierde, el stock converge a la resta correcta,
  el saldo de la deuda converge bien.

- [ ] **Step 1: Decidir automatizado vs. manual documentado, con el usuario si hace falta**
- [ ] **Step 2: Implementar**
- [ ] **Step 3: Correr y confirmar convergencia**
- [ ] **Step 4: Commit**

---

## Task 17: Rollout — modo sombra (spec §10, paso 2)

**Files:** ninguno (operación).

**Interfaces:**
- Produces: el build de `feature/offline-first-plan-b` desplegado en un
  preview aparte (Vercel preview de la rama, o un subdominio de staging),
  con PowerSync sincronizando en segundo plano, mientras la app real de
  producción sigue con el código de hoy sin tocar. ~1 semana, comparando que
  los datos coincidan.

- [ ] **Step 1: Deploy a preview**
- [ ] **Step 2: Comparación diaria de datos (sombra vs. real) — mismo espíritu que Plan A Task 10**
- [ ] **Step 3: Reporte de resultado — requiere aprobación explícita del usuario para pasar a la Task 18**

---

## Task 18: Rollout — una tablet real (spec §10, paso 3) y luego el resto

**Files:** ninguno (operación).

**Interfaces:**
- Produces: una tablet de producción real corriendo el build nuevo 1
  semana; si sale limpio, el resto de las tablets; recién ahí se retira el
  código viejo definitivamente.

- [ ] **Step 1: Elegir la tablet piloto, con el usuario**
- [ ] **Step 2: 1 semana de operación real, monitoreo activo**
- [ ] **Step 3: Gate — requiere aprobación explícita del usuario antes de tocar el resto de las tablets**
- [ ] **Step 4: Rollout al resto + merge a `main` + limpieza final del código viejo**

---

## Self-Review

**1. Spec coverage:**
- §3/§4 (arquitectura, sync rules) → Tasks 1, 3. ✔
- §5.1/§5.1a (stock) → Tasks 2, 6. ✔
- §5.2 (voided_at) → Task 7. ✔
- §5.3 (debt_payments) → Task 8. ✔
- §5.4 (day_closes) → Task 9. ✔
- §6 (auth offline) → Tasks 10, 11. ✔
- §7 (refactor frontend) → Tasks 4, 5, 12, 13. ✔
- §8 (RLS/publication) → Task 1 (publication); RLS de las tablas nuevas ya
  la puso Plan A, no hace falta repetirla acá. ✔
- §9 (testing) → Tasks 15, 16. ✔
- §10 (lanzamiento) → Tasks 0 (rama), 17, 18. ✔

**2. Gaps deliberados / decisiones que no son del agente:**
- Task 0 Step 1: qué proveedor/plan de PowerSync — el usuario.
- Task 3, Task 10 Step 1: nombres exactos de paquetes/API de PowerSync y
  librería de hashing — no verificados contra la doc oficial (bloqueada
  desde este entorno al escribir el plan); marcados explícitamente para
  releer al ejecutar, no asumidos.
- Task 16 Step 1: si el harness de convergencia se automatiza o se
  documenta como manual — depende del tiempo real disponible, no forzado
  de antemano.
- Tasks 17-18: son operación real sobre el negocio (preview, tablet piloto,
  rollout completo) — cada gate pide aprobación explícita, mismo patrón
  que la Task 10 de Plan A.

**3. Coherencia con Plan A:**
- Task 2 de este plan es exactamente el ítem que el Self-Review de Plan A
  dejó anotado como "primera task de Plan B" (promover las columnas sombra).
  ✔
- La publication/sync rules de PowerSync (Task 1) es el otro gap deliberado
  que Plan A dejó anotado. ✔
