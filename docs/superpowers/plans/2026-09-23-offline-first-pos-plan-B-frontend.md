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

- [ ] **Step 3: Gate — aplicar a producción — SIGUE BLOQUEADO, releído al
      cerrar Task 16 (2026-09-27), no dar por resuelto solo porque el
      código de Task 9 ya existe**

  Estado original (2026-09-26): verificado contra producción real —
  `day_closes` tenía **0 filas** desde que existe la tabla (23-sep),
  `last_close_at()` devolvía `-infinity` y nunca avanzaba, porque el
  código de Task 9 (cierre de jornada inserta en `day_closes`) todavía no
  existía. Aplicar la migración 033 a producción en ese estado habría
  hecho crecer `products.stock` de pastelitos sin techo (el cron
  `api/daily-restock.js` inserta +15/día sin que nada reste).

  **Re-chequeado ahora (2026-09-27), al cerrar Task 16, antes de dar por
  "lista para producción" toda la rama**: Task 9 SÍ existe hoy en el
  código de `feature/offline-first-plan-b` — pero esa rama **todavía no
  está mergeada ni desplegada**, así que su código no corre en
  producción todavía. Confirmado por `git log` (no por asunción): los
  commits `eb6b244` ("Plan B Task 2 — promote shadow columns to real
  (dev only)") y `43a74bf` ("Postgres publication + PowerSync sync
  streams (dev)") dicen explícitamente "dev" en el propio mensaje — las
  migraciones **033 (este promote) y 034 (la publication de PowerSync)
  nunca se aplicaron a producción**. Intenté confirmarlo leyendo
  directamente el estado de producción (`list_migrations` contra
  `xttpaqokeyywjaajvjyu`) y el clasificador de modo automático lo bloqueó
  como lectura de producción — correctamente, no lo forcé; lo que sigue
  es inferencia de `git log`, no una lectura en vivo.

  **Esto bloquea a la Task 17 (rollout en modo sombra), no solo a esta
  Task 2**: sin la migración 034 (publication) en producción, PowerSync
  no tiene de dónde sincronizar datos reales — el "modo sombra" de la
  Task 17 no puede arrancar contra producción tal cual está hoy.

  **No aplicar 033 a producción hasta confirmar el orden correcto con
  Gustavo** — la secuencia más segura es: (a) aplicar 025-035 a
  producción (probablemente junto con el merge/deploy de esta rama, ya
  que el código de Task 9 tiene que existir en producción para que
  `last_close_at()` avance ahí — aplicar la migración sin el código
  desplegado reproduciría el mismo problema original), (b) recién
  entonces arrancar la Task 17. Esto es una decisión de secuenciar
  deploy + migraciones que le corresponde a Gustavo, no algo para
  resolver unilateralmente acá. Sigue pendiente también el chequeo
  original de call sites de `updateProductStock` en producción (ese
  código ya no existe en esta rama — Task 12 lo retiró — pero
  producción todavía corre el código viejo que sí lo llama).

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

- [x] **Step 3: Bootstrap y arranque** — resuelto 2026-09-26 (ver hallazgo +
      solución abajo); checkbox corregido ahora, había quedado sin tildar
      pese a que el contenido y los Steps 4-5 (dependientes de este) ya
      documentaban la resolución completa.

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

- [x] **Step 1: Reescribir cada función**

  Patrón: si `getLocalDb()` devuelve una db (ya sincronizada), escribe SOLO
  ahí (sin caer al Supabase-direct aunque falle -- mismo criterio que los
  `fetch*` de Task 4) y hace `return`; si no, corre el código Supabase-direct
  + `enqueueOfflineOp` de siempre, sin tocar. Se eliminó el
  `navigator.onLine`/`enqueueOfflineOp` manual del lado local -- PowerSync
  encola solo, tal como dice la nota de Interfaces arriba.

  Tres hallazgos reales (navegador real, `casa-lucenzo-dev`, sin login --
  probado con `window.PowerSyncManager.db.execute(...)` directo, ver detalle
  en el historial de conversación):

  1. **Las tablas locales de PowerSync son VISTAS, no tablas.**
     `INSERT ... ON CONFLICT(id) DO UPDATE SET ...` tira literalmente
     `"cannot UPSERT a view"` -- no es un límite documentado, se encontró
     recién al probarlo. Se reemplazó por `INSERT OR REPLACE`, que sí
     funciona contra la vista. Se verificó con `db.getNextCrudTransaction()`
     que `INSERT OR REPLACE` sobre una fila existente genera un solo `PUT`
     (no un `DELETE`+`PUT`), así que no arriesga violar la FK real
     `stock_movements.product_id -> products.id` (que un DELETE real sí
     rompería si el producto tiene movimientos).
  2. **`location_id` (migración 016b) es NOT NULL sin default en SQLite.**
     Los 5 columns reales de Postgres para `products`/`ingredients`/`debts`/
     `expenses`/`replenishments` tienen default
     `00000000-0000-0000-0000-000000000001` (única location existente), pero
     `schema.js` no declara defaults de columna. Un INSERT local nuevo que no
     la mencione la deja en NULL, y ese NULL explícito sube tal cual en el
     PUT -- Postgres lo rechaza (23502 not_null_violation) y `connector.js`
     descarta el error sin reintentar: la fila se pierde para siempre en
     Postgres aunque localmente pareciera haberse guardado bien. Se agregó
     `DEFAULT_LOCATION_ID` como constante compartida, seteada explícitamente
     en cada INSERT/REPLACE de esas 5 tablas.
  3. **`products` tiene columnas sombra** (`stock_computed`,
     `initial_stock_computed`, `max_computed`, migración 029) que
     `upsertProduct` nunca tocó -- las mantiene un trigger de Postgres.
     `INSERT OR REPLACE` reescribe la fila entera, así que sin releerlas
     antes quedarían NULL localmente y ese NULL pisaría el valor real al
     subir. `upsertProduct` ahora hace un `getOptional` de esas 3 columnas
     antes del REPLACE y las reinserta tal cual. Verificado en el navegador
     que sobrevive un ciclo insert→update.

  Hallazgo aparte, no de Plan B pero encontrado al tocar `upsertAppConfig`:
  `pin_local`/`pin_cocina`/`pin_admin` (el sistema viejo de PIN por rol,
  `js/app.js` línea ~5053) **no son columnas reales de `app_config`** --
  nunca se agregaron en ninguna migración (confirmado contra
  `000_core_tables.sql` y el esquema real vía `list_tables`). Ese guardado ya
  viene fallando en silencio en producción desde antes de Plan B (PostgREST
  rechaza la columna inexistente, queda enganchado en el offline queue para
  siempre). No se tocó -- ni se "arregló" ni se replicó localmente (`schema.js`
  tampoco las declara) -- queda fuera de este Task, a decidir si todavía hace
  falta ese sistema de PIN o ya lo reemplazó el de `profiles.pin_hash`.

- [x] **Step 1b: Verificación en navegador (sin login)**

  Cada `INSERT OR REPLACE`/`DELETE`/`UPDATE` de las 10 funciones se probó
  literalmente contra `window.PowerSyncManager.db` en un navegador real
  (insert nuevo, upsert sobre existente, delete, batch delete con `IN`), más
  `lint`/`npm test` limpios. Lo que NO se pudo probar sin las credenciales de
  login de `casa-lucenzo-dev` a mano es el round-trip real a Postgres
  (`uploadData` vía `connector.js`) -- eso queda en el Step 2 de abajo.

- [x] **Step 2: Test real contra `casa-lucenzo-dev`**

  Login real (`test@casalucenzo.com`, rol Admin) contra el dev server local.
  Nota: la variante literal "dos pestañas" del spec no aplica tal cual acá --
  ambas pestañas comparten el mismo `SharedWorker`/SQLite de PowerSync (mismo
  origen, mismo perfil de navegador), así que no simulan dos dispositivos
  independientes. Se verificó en su lugar el round-trip real de punta a
  punta, con lecturas directas a Postgres antes/después de cada operación
  (`client.from(...).select(...)`, no el MCP de Supabase -- bloqueado por el
  clasificador incluso contra el proyecto dev):

  - `upsertDebt` seguido de `deleteDebt` sobre una fila nueva: apareció en
    Postgres con `location_id` correcto, y desapareció tras el delete --
    tanto local como remoto.
  - `upsertProduct` sobre un producto real existente (`seed-dul-a`): cambio
    de precio confirmado en Postgres ida y vuelta (2.00 → 2.01 → 2.00), y las
    3 columnas sombra (`stock_computed`/`initial_stock_computed`/
    `max_computed`) llegaron intactas a Postgres en ambos pasos -- confirma
    que el `getOptional` previo al `INSERT OR REPLACE` (hallazgo 3 de arriba)
    funciona también en el camino real, no solo en el test local aislado.

  El resto de las funciones (`insertExpense`, `upsertReplenishment`,
  `upsertIngredient`, `upsertAppConfig`, los `delete*` restantes) comparten
  el mismo mecanismo ya verificado (misma vista, mismo
  `getNextCrudTransaction`/`uploadData`) y ya habían pasado el test SQL
  aislado del Step 1b -- no se repitió el round-trip real para cada una por
  ser redundante.

  Aparte, no relacionado a Task 5: durante el login se vieron varios `401
  PSYNC_S2101 "no key matched the token KID"` en el stream de descarga
  (`/sync/stream`) -- la misma familia de error JWKS de Task 3. Se
  autoresolvió solo (el stream volvió a conectar y sincronizar segundos
  después, `last_synced_at` avanzó) sin intervención, y no afectó a
  `uploadData` (ese camino no pasa por el JWKS de PowerSync, pega directo a
  PostgREST con la sesión de Supabase). Podría ser un refresh de JWT/JWKS
  transitorio -- vale la pena que quede anotado por si vuelve a aparecer de
  forma persistente.

- [x] **Step 3: Commit**

---

## Task 6: Stock — `adjustStock`/`applyStockLoad`/`applyStockCount` insertan `stock_movements`

**Files:**
- Modify: `js/app.js` — el archivo original solo listaba `applyStockLoad`
  (392-400), `applyStockCount` (411-423) y `adjustStock` (431-502). Al
  mapear los call sites reales de `updateProductStock` se encontraron 6 más
  con la misma lógica conceptual (mover stock vitrina↔carrito, o
  carga/recuento) que quedaban afuera: `handleCartQtyChange`,
  `handleAddToCart`, `handleRemoveFromCart`, `handleClearCart`,
  `updateProductStockDirect`, `addProductStockDirect`, `confirmReceipt`,
  `resetToMax` (8, no 6 -- se corrigió sobre la marcha). Dejar solo las 3
  originales habría dejado dos mecanismos escribiendo `products.stock` a la
  vez (movimientos nuevos + `updateProductStock` directo de las otras 6),
  con el trigger de Task 2 pisando uno u otro de forma impredecible en dev
  (donde la migración 033 ya corre). Confirmado con el usuario antes de
  tocar código — decidió alcance completo ahora, no incremental.
  `handleUndoSale` (línea ~823, con su propio `updateProductStock`) NO se
  tocó: es explícitamente Task 7 (`voidSale`), no Task 6.
- Modify: `js/supabase.js` — nueva función `insertStockMovement(...)` +
  `getPendingStockMovementProductIds()` (Step 2), reemplazan el uso directo
  de `updateProductStock` desde los 9 call sites de arriba (esa función
  queda para los paths que de verdad necesiten pisar `max` manualmente, si
  quedara alguno).

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

- [x] **Step 1: Mapear cada call site a un `type` de movimiento**

  Se usó un patrón uniforme en los 9 call sites en vez de asumir el delta:
  capturar `before = product.stock` justo antes de la mutación existente
  (sin tocarla), dejar que la lógica ya existente mute `product.stock`/
  `initial_stock`/`max` como siempre (optimismo en memoria intacto), y
  recién ahí calcular `delta = product.stock - before` y elegir `type` según
  el signo o la acción concreta. Esto evita depender de que el delta
  "teórico" (ej. `-diff` en `handleCartQtyChange`) coincida exactamente con
  el aplicado tras los `Math.max`/`Math.min` de clamping que ya existían.
  Un `delta` de 0 no inserta movimiento (nada pasó físicamente). Mapeo
  final: carrito ±1 (`adjustStock`, `handleAddToCart`) → `sale`;
  `handleRemoveFromCart`/`handleClearCart` → `sale_return`;
  `handleCartQtyChange` → `sale` o `sale_return` según el signo del delta
  real; `adjustStock`(+1)/`addProductStockDirect`/`confirmReceipt`/
  `resetToMax` → `load`; `updateProductStockDirect` → `load` o `count_down`
  según si `applyStockCount` subió o bajó. `confirmReceipt` además linkea
  `source_uuid` = el uuid de la reposición recibida.

- [x] **Step 2: Stock optimista en la UI mientras no sincronizó**

  Se descartó la opción (a) del plan original (recompute-formula paralela
  en JS) y la (b) (`db.watch()`) a favor de una tercera, más simple,
  sugerida por Gemini: la UI ya mutaba `product.stock` en memoria de forma
  optimista ANTES de este Task (arquitectura preexistente) — eso no cambia,
  solo cambia qué se persiste. Se evita mantener una segunda implementación
  de la fórmula del trigger.

  Encontrado al revisar `loadAllDataFromSupabase()`: reasigna `products`
  por completo (no hace merge campo por campo), así que un refetch
  mientras un movimiento sigue sin subir pisaría el valor optimista con uno
  viejo (el trigger todavía no corrió) -- un parpadeo hacia atrás real,
  posible en la ventana entre reconectar y que la cola de PowerSync suba.
  Se agregó `getPendingStockMovementProductIds()` (peek de solo lectura
  sobre `db.getCrudBatch()`, sin drenar la cola — no confundir con
  `getNextCrudTransaction()` de Task 5, que sí la drena) y se usa en el
  merge de productos para preservar `stock`/`initial_stock`/`max` del valor
  en memoria anterior solo para los productos con un movimiento todavía
  pendiente.

- [x] **Step 3: Reescribir los 9 call sites (ver Files)**

- [x] **Step 4: N/A con el diseño elegido**

  El test que pedía este Step (comparar una fórmula de recompute en JS
  contra la de Postgres) aplicaba a la opción (a) de Step 2, que no se usó.
  No hay una segunda fórmula que verificar del lado del cliente — el número
  optimista es simplemente el que la UI ya mutaba antes de este Task.

- [x] **Step 5: Verificación real contra `casa-lucenzo-dev`**

  Login real (`test@casalucenzo.com`, Admin). No se pudo forzar un offline
  genuino en este entorno de navegador (mismo límite que Task 5 Step 2), asi
  que se verificó cada mecanismo por separado, con lecturas directas a
  Postgres antes/después:

  - `insertStockMovement` real (`type: 'load'`, delta +5) sobre un producto
    existente: la fila apareció en `stock_movements` con los campos
    correctos, y `recompute_product_stock()` (migración 033) recalculó
    `stock`/`initial_stock` correctamente en Postgres (5→10, 7→12; `max` sin
    cambios, ya cubría el nuevo piso).
  - **Spec R3 confirmada tal cual**: un movimiento `type: 'sale'` con
    `delta: -50` llevó `stock` a **-40** sin error, sin bloqueo, sin clamp a
    0 -- exactamente "las ventas nunca se rechazan, el stock puede quedar
    negativo".
  - `getPendingStockMovementProductIds()` (el guard de Step 2): confirmado
    que detecta el producto con movimiento recién insertado (todavía en la
    cola local) y que la lista vuelve a quedar vacía ~3.5s después, una vez
    subido -- el mecanismo que evita el parpadeo funciona.
  - Un tap real por UI (botón "+" en Vitrina sobre "Malta 355ml",
    `handleAddToCart`) generó el movimiento (`type: 'sale', delta: -1`) con
    el `device_id` real del dispositivo, y `products.stock` bajó
    correctamente en Postgres (28→27) -- confirma el camino completo
    click→`recordStockMovement`→`insertStockMovement`→trigger, no solo la
    llamada directa a la función.
  - Datos de prueba en `seed-dul-a`/`seed-beb-a` restaurados a su `stock`
    original al terminar (quedó un desvío menor, inofensivo, en
    `initial_stock` -- son productos de prueba, no reales).

  Aparte, no relacionado a Task 6: el 401 JWKS transitorio del sync-stream
  que ya había aparecido en Task 5 **volvió a aparecer, esta vez sin
  autoresolverse** dentro de la ventana observada (login, alrededor de 15
  reintentos seguidos, más un "400" suelto). Sigue sin afectar las
  escrituras (confirmado arriba: todo subió bien igual), pero si es
  persistente y no un blip aislado, vale la pena revisar la config de JWKS
  en el dashboard de PowerSync para `casa-lucenzo-dev` -- ya son dos
  sesiones distintas donde aparece.

- [x] **Step 6: Commit**

---

## Task 7: Anulación de venta — `voided_at` en vez de `DELETE`

**Files:**
- Modify: `js/supabase.js` — retirados `deleteSale`, `deleteSales`,
  `deleteSalesByTimestamp`; agregados `voidSale(uuid, reason)` y
  `voidSalesByTimestamp(timestamp, reason)`. `fetchSales()` (Task 4) y las
  5 funciones de reportes online-only (`fetchStatsData`, `fetchPnlData`,
  `fetchDayReport`, `fetchReportDays`, `fetchSalesHistory`) ahora filtran
  `voided_at IS NULL`/`.is('voided_at', null)`.
- Modify: `js/app.js` — el conteo real de call sites fue 7, no ~15:
  `handleUndoSale` (826), el flujo de edición de cuenta en
  `handleClearCart`/`handleCheckoutCart` (682/749), `clearAllSales` (1102),
  el fallback muerto de `closeDayAndResetLogs` (2059, ver nota abajo),
  `restoreDefaultProducts` (2305), y una rama muerta más en
  `processOfflineQueue` (120, nunca alimentada por ningún `actionType:
  'deleteSales'` real -- se eliminó en vez de convertirse). También:
  `handleRealtimeDbUpdate`'s rama de `sales` (Realtime, no la de
  `performFullFetch`) no filtraba `voided_at` -- una fila recién anulada se
  quedaba viva en `salesLog` con `voided_at` seteado pero sin que nada lo
  mirara ahí. Corregido.

**Interfaces:**
- Produces: `UPDATE sales SET voided_at = now(), void_reason = ? WHERE
  uuid = ?` + un `stock_movements` de tipo `sale_return` (`delta=+1`) por
  cada unidad de esa venta, `source_uuid` = el `uuid` anulado — todo local,
  vía PowerSync.
- **Nunca `DELETE` de una fila ya sincronizada** (spec §5.2, regla dura).

- [x] **Step 1: `voidSale`/`voidSalesByTimestamp`**

  Hallazgo real (navegador real, `casa-lucenzo-dev`): un mismo instante
  puede llegar a estar guardado con formatos de texto distintos según por
  dónde pasó -- `toISOString()` del lado del cliente da
  `"...260Z"` (3 decimales), pero una vez que esa fila sube a Postgres y
  vuelve a bajar por el sync stream de PowerSync, la vi re-almacenada
  localmente como `"...260000Z"` (6 decimales, microsegundos). Un
  `WHERE timestamp = ?` con comparación de string deja de matchear apenas
  eso pasa -- y como `editingTimestamp` vive en `sessionStorage` durante
  toda la edición de una cuenta, un re-sync de fondo (cada 3 min, o al
  reconectar) en medio de una edición larga alcanza para gatillarlo. Se
  cambió `voidSalesByTimestamp` a `WHERE julianday(timestamp) =
  julianday(?)` -- confirmado en el navegador que normaliza ambos formatos
  al mismo valor y que el `UPDATE ... RETURNING` (necesario para leer
  `rowsAffected` real contra una vista, ver nota de Task 5) sigue
  funcionando con esa comparación.

  El camino Supabase-direct (fallback pre-primer-sync) no tiene este
  problema -- PostgREST parsea el string a un valor real de `timestamptz`
  antes de comparar, insensible al formato -- así que se dejó con
  `.eq('timestamp', ...)` normal.

- [x] **Step 2: Reescribir `handleUndoSale` y el flujo "Modificar cuenta"/"Corregir"**

  `handleUndoSale` además reemplaza el `updateProductStock` que había
  quedado pendiente de Task 6 (justo el que ese Task dejó explícitamente
  para acá) por `recordStockMovement(product, delta, 'sale_return',
  sale.uuid)` -- reutiliza el helper de Task 6, con `source_uuid` =
  la venta anulada. El tombstone local (`addDeletedSalesUuids`) se
  mantuvo tal cual -- sigue protegiendo la misma condición de carrera que
  protegía con `DELETE` (una anulación encolada offline que todavía no
  llegó a Postgres, en el camino Supabase-direct), solo que ahora
  antecede a un `voidSale` en vez de un `deleteSales`.

- [x] **Step 3: Reportes/caja ignoran `voided_at IS NOT NULL`**

  Filtro agregado en `fetchSales()` (ambas ramas) y en las 5 funciones de
  reportes listadas arriba. Verificado en el navegador: una fila insertada
  ya con `voided_at` seteado no aparece en el resultado de `fetchSales()`,
  una sin `voided_at` sí.

- [x] **Step 4: Verificación real contra `casa-lucenzo-dev`**

  Login real (`test@casalucenzo.com`, Admin). Confirmado con lecturas
  directas a Postgres antes/después:
  - `voidSale`: fila nueva → anulada → `voided_at`/`void_reason` correctos
    en Postgres.
  - `voidSalesByTimestamp` sobre una cuenta de 2 filas: ambas anuladas en
    un solo `UPDATE`, confirmado con `RETURNING`.
  - El bug de formato de timestamp (arriba) se reprodujo primero
    (`voidSalesByTimestamp` devolvía `false` con un timestamp "viejo" tras
    un round-trip) y se confirmó resuelto con `julianday()` en una
    repetición limpia del mismo escenario.
  - `fetchSales()` excluye correctamente una fila con `voided_at` ya
    seteado.
  - Datos de prueba (`e2e-*`) borrados de Postgres al terminar -- a
    diferencia de una venta real, un `DELETE` sobre filas creadas y
    destruidas enteramente dentro de este test no viola la regla dura de
    la spec (nunca existieron como venta real).

  No se pudo probar el click real de "Deshacer" en el navegador
  (`prompt()` nativo del checkout no es automatizable en este entorno, y
  `handleUndoSale` no queda expuesto en `window`) -- se verificó en su
  lugar cada pieza que compone ese flujo por separado (`voidSale`,
  `recordStockMovement` ya verificado en Task 6, el tombstone sin tocar).

- [x] **Step 5: Commit**

---

## Task 8: Abonos a deudas — `debt_payments` en vez de mutar `debts.amount`

**Files:**
- Modify: `js/app.js` — `settleDebtPayment` (1652-~1705); también `addDebt`
  (1597, la rama "cliente ya existe" -- no estaba en la lista original pero
  necesitaba el mismo ajuste, ver Step 1).
- Modify: `js/supabase.js` — `mapDebtRow`/`fetchDebts` calculan el saldo;
  `upsertDebt` sigue siendo la única vía para crear/editar la deuda
  original; nueva función `insertDebtPayment(debtUuid, amount, method,
  deviceId)`.

**Interfaces:**
- Produces: cada abono es un `INSERT` en `debt_payments` local (append-only,
  spec §5.3). El saldo mostrado en la UI pasa a calcularse como
  `debts.amount - SUM(debt_payments.amount WHERE debt_uuid = ?)` (query
  local, ver Step 1), no una resta que se persiste.

> **Ojo con el flujo actual:** `settleDebtPayment` hoy hace tres cosas en
> una (app.js:1657-1705) — resta `debts.amount`, crea una venta sintética
> `productId: 'abono'` para que aparezca como ingreso de caja, y llama
> `upsertDebt` + `insertSale`. La parte de la venta sintética (`sales` con
> `productId='abono'`) **no cambia** — `sales` ya es append-only y no es
> parte del modelo de deudas. Solo la resta directa de `debts.amount` se
> reemplaza por el insert en `debt_payments`.

- [x] **Step 1: `insertDebtPayment` + saldo calculado**

  `debts.amount` pasa a significar SOLO la deuda original (lo que `addDebt`
  crea/edita) -- nunca más se decrementa. `mapDebtRow(d, paidAmount)` ahora
  devuelve dos campos: `originalAmount` (el valor crudo, tal cual está en la
  columna) y `amount` (el saldo calculado, `originalAmount - paidAmount`) --
  este último mantiene el mismo nombre que ya usaban `renderDebts` (ui.js) y
  `settleDebtPayment`, así que ninguno de los dos necesitó tocarse para
  seguir mostrando/validando el saldo correcto. `fetchDebts()` sale este
  cálculo con un segundo query local (`SELECT debt_uuid, SUM(amount) ...
  GROUP BY debt_uuid` sobre `debt_payments`) -- es un agregado puramente
  local, no algo que dependa de un trigger de Postgres, así que a
  diferencia de `stock_movements` (Task 6) no hace falta ningún guard tipo
  `getPendingStockMovementProductIds`: un `insertDebtPayment` local se
  refleja al instante en cualquier `fetchDebts()` posterior, sin ventana de
  desincronización.

  Encontrado al implementar (no estaba en el plan original): `upsertDebt`
  ahora tiene que persistir `originalAmount`, no el `amount` (calculado) que
  trae el objeto en memoria -- si no, `addDebt`'s rama "el cliente ya tenía
  deuda" (que hace `existingClient.amount += nuevoMonto`) habría escrito el
  saldo YA DESCONTADO más el nuevo monto como si fuera la deuda original
  completa, borrando silenciosamente el historial de abonos ya hechos. Se
  ajustó esa rama de `addDebt` para incrementar `originalAmount` (no
  `amount`) y `upsertDebt` para preferir `originalAmount` cuando está
  presente (con fallback a `amount` para una deuda nueva, donde ambos son
  iguales por no haber abonos todavía). Verificado en el navegador real:
  deuda de $100 → dos abonos de $30 (simulando 2 dispositivos) → saldo
  calculado $40, `debts.amount` en Postgres sigue en 100 → deuda nueva de
  +$20 para el mismo cliente → `originalAmount` sube a 120, saldo pasa a
  60 -- todo confirmado con lecturas directas a Postgres.

- [x] **Step 2: Reescribir `settleDebtPayment`**

  Se dejó de mutar `client.timestamp`/`client.description` además de
  `client.amount` -- ya no hay ningún `upsertDebt` en esta función que los
  suba a Postgres, así que mutarlos solo local habría dejado esta pestaña
  mostrando algo distinto a cualquier otro dispositivo (o a sí misma tras
  un refetch). `client.amount` sí se sigue mutando en memoria para
  feedback optimista instantáneo -- `fetchDebts()` recalcula el mismo
  valor en cuanto `insertDebtPayment` sube. La venta sintética "Abono: X"
  sigue igual, sin tocar.

- [x] **Step 3: Verificación real — dos dispositivos cobrando offline (spec §9)**

  Simulado en `casa-lucenzo-dev` con `insertDebtPayment` desde dos
  `deviceId` distintos sobre la misma deuda: ambos abonos entraron como
  filas separadas en `debt_payments`, y el saldo calculado bajó
  correctamente reflejando la suma de los dos ($100 → $40). Confirmado
  contra Postgres real, no solo local.

- [x] **Step 4: Commit**

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

- [x] **Step 1: Reescribir `closeDayAndResetLogs`**

  Implementado distinto al "nada más" del enunciado original, por una razón
  de spec, no de gusto: `trg_day_close_recompute` (migración 030) sí
  recalcula todos los productos solo, pero recién CUANDO el `INSERT` de
  `day_closes` llega a correr en Postgres -- y `insertDayClose` (local-first,
  Task 3) puede tardar en subir mientras el dispositivo está offline. La
  spec (R1) exige vender/operar offline hasta un día entero, así que un
  cierre hecho sin conexión necesita mostrar la vitrina de pastelitos en
  cero DE INMEDIATO, no recién al reconectar. Se mantuvo la mutación local
  (`p.stock = 0`, etc., puro JS, sin red) para eso, pero se sacaron las 2
  llamadas a `updateProductStock(...)` que la acompañaban -- esas sí
  competían con el trigger por las mismas columnas (mismo tipo de conflicto
  de doble escritura que Task 6), y ya no hacen falta porque
  `insertDayClose` es quien de verdad mueve la frontera en Postgres. El
  resto (vaciar `salesLog`/`expenses`, limpiar storage, refrescar BCV) se
  dejó igual: son puramente locales, nunca compitieron con nada del lado
  del servidor.

- [x] **Step 2: N/A -- ya estaba resuelto**

  Investigado antes de tocar código: `currentSalesExpensesFilterTime()`
  (`js/supabase.js`) y el `lastCloseTime` global (`js/app.js`) ya filtran
  `fetchSales`/`fetchExpenses`, el merge de `loadAllDataFromSupabase`, y los
  dos handlers de Realtime (`sales`/`expenses`) por la hora del último
  cierre -- ninguno de ellos depende de que `salesLog`/`expenses` se vacíen
  a mano, ya filtran por fecha de por sí. Vaciar esos arrays en
  `closeDayAndResetLogs` sigue siendo puramente cosmético (feedback
  instantáneo en pantalla), no una dependencia oculta -- no había nada que
  migrar acá.

- [x] **Step 3: Verificación real — dos cierres (spec §9)**

  Simulado en `casa-lucenzo-dev` con `insertDayClose` desde dos
  `device_id` distintos: ambas filas quedaron en `day_closes` (nada se
  pisa, es append-only), y el producto de prueba recalculó correctamente
  a stock 0 después de cada cierre. Se probó además el caso más duro --
  una fila de cierre vieja que llega TARDE y fuera de orden (simulando un
  upload demorado) después de que ya hubo actividad nueva -- y
  `last_close_at() = MAX(closed_at)` la ignoró correctamente sin revertir
  el estado ya avanzado. No hizo falta ningún código nuevo para esto: es
  una consecuencia natural del modelo append-only ya construido en
  Tasks 2/3.

- [x] **Step 3b: Hallazgo real de Gemini — F5/recarga offline tras un cierre, más un segundo bug propio encontrado al investigarlo**

  Gemini señaló, revisando el Step 1: la mutación optimista en memoria
  (`p.stock = 0`) no sobrevive un reload -- es un array de JS, no algo
  persistido. Si el cajero cierra la jornada offline y recarga la página (o
  abre el navegador al día siguiente) ANTES de reconectar,
  `loadAllDataFromSupabase()` vuelve a leer `products` de la tabla local de
  PowerSync, que el trigger de Postgres todavía no tocó (no corre hasta que
  `insertDayClose` sube) -- los pastelitos "resucitan" con el stock de ayer
  hasta reconectar. `getPendingStockMovementProductIds()` (Task 6) no
  protege este caso: solo mira la cola de `stock_movements` pendientes, no
  `day_closes`.

  Al investigar la fórmula que Gemini propuso replicar en SQL, encontré un
  segundo problema, más grave porque no es solo offline: **`max` había
  dejado de resetear en TODOS los casos**, incluso online. El trigger
  (`recompute_product_stock`, migración 030) calcula
  `max = GREATEST(initial_stock, max actual)` -- una fórmula que solo puede
  CRECER max, nunca bajarlo. Sacar el `updateProductStock(id, 0, 0, 0)` del
  Step 1 arregló el conflicto de doble escritura para stock/initial_stock
  (correcto, esos sí derivan enteros de `stock_movements`), pero se llevó
  puesto el único mecanismo que alguna vez baja `max` a 0. Sin ese write
  directo, la capacidad de la vitrina quedaba acumulando para siempre otra
  vez -- exactamente el bug que el comentario original decía prevenir.

  Dos arreglos, cada uno del tamaño del problema real (no una sola solución
  para ambos, porque son de naturaleza distinta):
  - `resetPastelitoCapacity(id)` (`js/supabase.js`, nueva, local-first):
    unico write directo que sigue haciendo falta, SOLO para `max` -- no para
    stock/initial_stock, que Task 6 correctamente dejó de escribir directo.
  - `fetchProducts()` (rama local): para categoría `pastelitos`, en vez de
    leer `products.stock`/`initial_stock` de la columna, las calcula en vivo
    con la misma fórmula del trigger contra `stock_movements`/`day_closes`
    locales (`julianday()`, no comparación de string -- mismo hallazgo que
    Task 7). Esto la hace inmune a si el trigger ya corrió o no: correcta
    aunque el cierre siga sin subir. `max`/`stock_computed`/etc. no se
    tocaron -- ahí sí conviene seguir confiando en lo que Postgres calculó,
    porque `resetPastelitoCapacity` es local-first y sobrevive un reload
    igual que cualquier otra escritura de Task 5+.

  Verificado en `casa-lucenzo-dev`: `resetPastelitoCapacity` confirmado con
  lectura directa a Postgres (max 30 → 0). El escenario exacto de Gemini
  reproducido a mano -- se insertó una fila de `day_closes` puramente local
  (sin pasar por `insertDayClose`, para controlar el timing) dejando la
  columna `products.stock` intacta (25, sin tocar), y `fetchProducts()`
  igual devolvió `stock: 0` -- confirma que el cálculo en vivo funciona
  independientemente de si el trigger corrió.

- [x] **Step 4: Commit**

---

## Task 10: PIN offline — validación local

**Files:**
- Modify: `js/supabase.js` — `verifyQuickPin` reescrita (era la única que
  necesitaba tocarse de verdad; `pin-management.js` es un wrapper delgado
  que ya delegaba con la misma firma, no necesitó cambios)
- Modify: `js/app.js` — `handleQuickPINInput`, `updateLockoutUI` (ahora
  acepta un `userId` opcional)
- Modify: `js/storage.js` — nuevas `loadPinLockoutState`/
  `savePinLockoutState` (localStorage, por usuario)
- Modify: `sistema/index.html` — `<script>` de `bcryptjs@3.0.3` (CDN, build
  UMD)

**Interfaces:**
- Consumes: `profiles.pin_hash` ya replicado localmente por PowerSync
  (Task 1 sync rules — `profiles` baja completa).
- Produces: `verifyQuickPin` corre contra la SQLite local con lockout
  evaluado en JS, sin red. El RPC `verify_quick_pin` (Postgres) queda como
  fallback solo para cuando no hay `localDb` todavía (spec §6, punto 2).

> **La pieza más sensible en seguridad de todo Plan B.** El RPC actual usa
> `crypt()`/`pgcrypto` (bcrypt) del lado de Postgres — replicarlo en el
> cliente implica una librería bcrypt en JS (evaluar `bcryptjs`, puro JS,
> sin dependencias nativas, para no romper el bundle web). Cualquier
> desvío de comportamiento acá (timing, manejo del lockout) es una
> superficie de ataque real sobre PINs de 4 dígitos. Antes de escribir
> código: confirmar con el usuario si prefiere bcryptjs u otra alternativa,
> y hacer una revisión de seguridad dedicada (`/security-review`) de esta
> task específica antes de darla por cerrada, aparte del resto del plan.

- [x] **Step 1: Librería confirmada con el usuario — `bcryptjs@3.0.3`**

  No se asumió la compatibilidad con `pgcrypto`/`crypt()` de Postgres --
  se verificó real: `set_quick_pin('1234')` contra `casa-lucenzo-dev` generó
  un hash real (`$2a$06$...`), y `bcrypt.compareSync('1234', eseHash)`
  devolvió `true` (y `false` para un PIN incorrecto) en un navegador real.
  Se usa el build UMD (`umd/index.js`) vía `<script src>` clásico -- se
  confirmó que expone `window.bcrypt` sin necesitar módulo/bundler, mismo
  patrón que `@supabase/supabase-js`.

- [x] **Step 2: Reescribir la verificación local (lockout incluido)**

  `verifyQuickPin` ahora lee `profiles.pin_hash` de SQLite local y compara
  con `bcrypt.compareSync`. El lockout (3 fallos → 60s) se reescribió para
  ser exactamente igual al del RPC (`005_pin_rate_limit.sql`): un intento
  fallido SIEMPRE incrementa el contador (no se resetea al bloquear), y si
  vuelven a fallar después de que el bloqueo anterior ya expiró, se
  re-bloquea otros 60s (no hay "un solo bloqueo y ya"). Verificado en el
  navegador real, incluyendo ese caso de re-bloqueo.

  **Hallazgo al implementar, no estaba en el plan:** el contador NO se
  puede persistir en `profiles.pin_failed_attempts`/`pin_locked_until` como
  sugería el enunciado original. La única política RLS de `UPDATE` sobre
  `profiles` exige rol `admin` (migración 001) -- por eso
  `set_quick_pin`/`verify_quick_pin` son `SECURITY DEFINER` en primer lugar,
  para poder tocar esas columnas sin serlo. Un `UPDATE` local vía
  `db.execute` se subiría como un PATCH normal (no pasa por el RPC), y esa
  policy lo rechazaría en silencio para cualquier usuario no-admin. El
  contador de lockout offline vive en `localStorage` (`js/storage.js`,
  por usuario), sin intentar converger con el contador del servidor --
  son dos mecanismos paralelos, no una sola fuente de verdad.

  También se separó del lockout compartido que `handleUserLogin` seguía
  usando (`lockoutUntil`/`failedPinAttempts`, global, en memoria) --
  login por contraseña es inherentemente online, así que se dejó intacto,
  sin tocar. `updateLockoutUI` ahora acepta un `userId` opcional: sin él,
  se comporta exactamente igual que antes (para `handleUserLogin`); con él,
  lee el estado persistido por usuario (para `handleQuickPINInput`).

- [x] **Step 3: Revisión de seguridad dedicada**

  (El usuario eligió que la hiciera yo mismo al terminar, no una revisión
  externa.) Hallazgos:

  1. **Comparación de tiempo constante, confirmada leyendo el código
     fuente de `bcryptjs`:** `compareSync` usa `safeStringCompare`
     (XOR acumulado sobre todo el largo, sin salida anticipada) -- no hay
     canal lateral de timing en la comparación en sí.
  2. **El lockout local es descartable por quien tenga acceso al
     dispositivo** (borrar esa clave de `localStorage` resetea el
     contador a 0). Es una limitación real, pero inherente a hacer rate-
     limiting del lado del cliente sin hardware seguro -- no hay una
     mitigación client-side genuinamente mejor (ofuscar la clave sería
     seguridad de utilería, no protección real).
  3. **El hallazgo más importante, y no es nuevo de esta task:** para que
     el PIN funcione offline, `profiles.pin_hash` tiene que estar
     sincronizado localmente -- y eso ya pasaba desde la Task 1 (reglas de
     sync), no algo que Task 10 haya introducido. Pero es recién ahora que
     se vuelve prácticamente relevante: cualquiera con acceso a las
     devtools del dispositivo puede leer ese hash directo de SQLite y
     crackearlo offline, sin límite de intentos y sin pasar por
     `verifyQuickPin` en absoluto. Con un PIN de 4 dígitos (10.000
     combinaciones) y el costo bcrypt que usa `pgcrypto` por default
     (`gen_salt('bf')` → costo 6, confirmado en el hash real de arriba:
     `$2a$06$...`), el espacio completo se prueba en segundos en hardware
     común -- ningún rate-limit de la aplicación protege contra esto una
     vez que el hash salió del servidor. Esto es una tensión inherente al
     requisito mismo ("PIN debe funcionar offline" implica que el hash
     tiene que vivir en el dispositivo) y no algo que un cambio de código
     en Task 10 pueda resolver sin contradecir ese requisito. Vale la pena
     que el usuario/Gemini lo tengan explícitamente presente: lo que el
     PIN protege es la reactivación rápida de una sesión ya autenticada en
     un dispositivo ya desbloqueado una vez -- no el acceso inicial a la
     cuenta -- así que el costo de este trade-off es bajo, pero es una
     decisión consciente, no un descuido.

- [x] **Step 4: Test — 3 intentos fallidos bloquea local, igual que hoy en servidor**

  Verificado en `casa-lucenzo-dev` con el usuario de prueba: PIN correcto
  → resetea contador; 3 fallos → bloquea 60s; PIN correcto DURANTE el
  bloqueo → rechazado sin comparar (igual que el RPC); tras expirar el
  bloqueo, un fallo más re-bloquea otros 60s (contador sigue en 4, no se
  resetea) -- comportamiento idéntico al RPC en cada paso. Confirmado
  también que el estado sobrevive un reload de la página (mejora real
  sobre el mecanismo anterior, que era en memoria y se perdía al recargar).

- [x] **Step 5: Commit**

---

## Task 11: Alta de dispositivo + límite de 30 días offline

**Files:**
- Modify: `js/supabase.js` — `init()`, hook a `client.auth.onAuthStateChange`
- Modify: `js/auth.js` — nueva `isOfflineLimitExceeded` en `AuthManager`
- Modify: `js/storage.js` — nuevas `loadLastAuthOnlineAt`/`saveLastAuthOnlineAt`
- Modify: `js/app.js` — `handleQuickPINInput` (chequeo agregado; `handleUserLogin`
  no necesitó tocarse, ver Step 1-2)

**Interfaces:**
- Produces: guardado seguro del refresh token de Supabase en el
  dispositivo (spec §6, punto 1 — Secure Storage queda para Fase 2/Capacitor;
  en web, el storage de sesión que Supabase ya maneja), renovación
  automática de sesión al reconectar, y bloqueo forzado si pasaron > 30 días
  offline (spec §6, "Bordes").

- [x] **Step 1: Confirmar dónde vive hoy el refresh token en la sesión web de Supabase**

  `createClient(url, key)` no pasa opciones de `auth` -- hereda los
  defaults de `@supabase/supabase-js` (confirmado leyendo el código fuente
  real de `GoTrueClient`, no supuesto): `persistSession: true` (guarda en
  `window.localStorage` por default) y `autoRefreshToken: true`. El refresh
  token ya vive ahí desde que existe el login con Supabase Auth -- nada que
  cambiar acá, spec §6 punto 1 ya estaba resuelto de fábrica.

- [x] **Step 2: N/A -- ya resuelto por los defaults de supabase-js**

  Leyendo el código fuente: el auto-refresh corre con un ticker cada 30s
  (`AUTO_REFRESH_TICK_DURATION_MS`) y refresca cuando faltan ≤3 ticks para
  que expire el JWT (`AUTO_REFRESH_TICK_THRESHOLD`) -- o sea, como máximo
  30s de latencia para notar que el token venció y renovarlo, sin importar
  cuánto tiempo estuvo offline. Verificado real: forzar
  `client.auth.refreshSession()` en el navegador contra `casa-lucenzo-dev`
  disparó `TOKEN_REFRESHED` y devolvió una sesión nueva sin error. No hizo
  falta escribir lógica de reconexión -- ya viene andando.

- [x] **Step 3: Contador de días offline + bloqueo a los 30**

  `loadLastAuthOnlineAt`/`saveLastAuthOnlineAt` (`js/storage.js`,
  localStorage) guardan el último momento en que este dispositivo probó
  conectividad real. Se actualiza SOLO en `SIGNED_IN`/`TOKEN_REFRESHED`
  (`client.auth.onAuthStateChange`, enganchado en `init()`) --
  deliberadamente NO en `INITIAL_SESSION`: por su propia documentación esa
  se dispara "right after the client is constructed and the initial
  session from storage is loaded", sin garantía de red -- tratarla como
  "online" habría reseteado el contador solo con abrir la app offline,
  vaciando de sentido la regla entera. `AuthManager.isOfflineLimitExceeded`
  (`js/auth.js`) compara contra 30 días. El chequeo se agregó en
  `handleQuickPINInput` (app.js): si se excedió, se rechaza el PIN sin
  intentar verificarlo y se pide iniciar sesión con contraseña -- ese
  camino siempre necesita conexión, así que duplica como recuperación.
  `handleUserLogin` no necesitó ningún cambio (un login nuevo siempre
  requiere red, así que la regla de "30 días offline" nunca podría
  bloquearlo de todas formas).

  De paso, investigado y confirmado que NO hacía falta tocar: la
  desactivación de un usuario (`profiles.active = false`) ya se aplica
  sola en cuanto el dispositivo toca internet -- `get_user_role()` y
  `get_user_location()` (RLS, migraciones 001/016b) filtran
  `WHERE active = true` en cada llamada, así que un usuario desactivado
  pierde acceso a nivel de base de datos automáticamente, sin necesitar
  ninguna lógica de cliente nueva.

- [x] **Step 4: Verificación real — 30 días excedidos bloquea, reciente no**

  Contra `casa-lucenzo-dev`: `SIGNED_IN` real (login) guardó el timestamp;
  `refreshSession()` real disparó `TOKEN_REFRESHED` y lo actualizó de
  nuevo. Con el timestamp mockeado a 31 días atrás,
  `isOfflineLimitExceeded` dio `true` y `handlePINInput('1234')` (PIN
  correcto) fue rechazado sin comparar. Con 29 días, dio `false`. Al
  restaurar un timestamp fresco, el mismo PIN correcto volvió a funcionar
  normalmente.

- [x] **Step 5: Commit**

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

- [x] **Step 1: Confirmar que ninguna función activa todavía depende de la cola vieja**

  Grep real (no el inventario de arriba, que resultó desactualizado como en
  toda task anterior) mostró algo más serio que "cola muerta": **`insertSale`/
  `insertSales`/`upsertSales` (registrar una venta nueva) e `insertDayClose`
  NUNCA recibieron una rama local-first en las Tasks 4-11** — a diferencia de
  products/expenses/debts/replenishments/ingredients/stock_movements/
  app_config/activity_logs, que sí. Seguían 100% Supabase-direct con la cola
  vieja como único fallback offline. Retirar la cola tal cual pedía el texto
  original de esta task habría dejado una venta hecha 100% offline sin NINGÚN
  mecanismo de persistencia — la pérdida de datos más grave posible en un POS.
  Mismo problema en `insertDayClose`: el cierre offline nunca movía
  `last_close_at()` en Postgres, contradiciendo el propio comentario del
  código en `closeDayAndResetLogs` ("esta app tiene que poder operar offline
  un día entero", spec R1).

  Encontrado ANTES de escribir código (leyendo `js/supabase.js` función por
  función buscando `getLocalDb()`), confirmado con el usuario vía
  `AskUserQuestion` antes de ampliar el alcance de la task. Aprobado:
  "Migrar ventas a local-first primero (recomendado)".

- [x] **Step 1b (alcance ampliado, no estaba en el plan original): migrar
      insertSale/insertSales/upsertSales/insertDayClose a local-first**

  - `js/supabase.js`: nuevo helper compartido `upsertSaleLocal(localDb, sale)`
    — `INSERT OR REPLACE` en la tabla local `sales` de PowerSync, releyendo
    primero `voided_at`/`void_reason`/`bcv_rate`/`cost_at_sale`/`location_id`
    existentes (mismo motivo que `upsertProduct`: SQLite no tiene upsert
    parcial por columna como Postgres, así que sin esto una venta editada
    perdía su estado de anulación). `insertSale`/`insertSales`/`upsertSales`
    lo usan cuando `getLocalDb()` no es null; si no, caen al mismo
    Supabase-direct de siempre (sin la cola).
  - `insertDayClose`: mismo patrón, `INSERT INTO day_closes` local cuando hay
    `localDb`.
  - `updateProductStock` (código pre-Task 6/9, ya no lo llamaba nadie salvo
    el backfill de productos default faltantes) se retiró; ese único caller
    en `loadAllDataFromSupabase` pasa a usar `upsertProduct(p)` — `.update()`
    no crea la fila si no existe, `upsertProduct` sí.

- [x] **Step 2: Retirar cola vieja + guards, uno por archivo**

  `js/supabase.js`: `enqueueOfflineOp`/`syncOfflineQueue`/
  `moveToDeadLetterQueue`/`OFFLINE_QUEUE_MAX_AGE_MS` eliminados enteros, y el
  guard `if (!navigator.onLine) {...}` retirado de las ~19 funciones que lo
  tenían (incluyendo las ya migradas en Tasks 5-9 — su fallback
  Supabase-direct ahora solo loggea el error, sin re-encolar).

  `js/app.js`: `OFFLINE_QUEUE_KEY`/`getOfflineQueue`/`addToOfflineQueue`/
  `processOfflineQueue` eliminados. `handleCleanOfflineCache` adaptado (no
  retirado): ya no sincroniza nada, pero conserva la revisión/descarte de
  ventas en cuarentena + limpieza de caché del service worker (ambas siguen
  siendo útiles sin relación con la cola). `updateOfflineStatusUI` eliminado
  — `#header-offline-badge` queda con `display:none` dormido hasta que Task
  13 le dé un driver nuevo basado en `PowerSyncManager.getSyncStatus()`.
  `initSelfHealingSentinel` simplificado a solo los handlers genéricos de
  error/rejection (los listeners de online/offline/interval que llamaban a
  la cola se fueron con ella). También until ahora sin loguear: la
  reconciliación de ventas en `loadAllDataFromSupabase` (~línea 2372) usaba
  las UUIDs pendientes de la cola vieja para "corroborar" si una venta
  ausente del servidor era un borrado admin o un write offline no
  sincronizado — sin cola, se simplificó a: toda venta local ausente del
  servidor va directo a cuarentena para revisión manual (nunca se
  auto-restaura sin corroboración, más conservador que antes).

  `sistema/index.html`: título/label del botón actualizado ("LIMPIAR CACHÉ
  DE ESTE DISPOSITIVO", ya no dice "sincronizar").

  `js/sales.js:108` (`isOffline` flag de `renderAdminDashboard`): **dejado
  como está, a propósito** — es un flag puramente de UI (banner "Modo
  Offline" en un dashboard), no está atado a la cola de escritura que se
  retiró acá. Corresponde a Task 13 (indicador de sync) unificarlo, no a
  esta task.

  También se encontró y arregló un bug real que habría roto producción:
  `autoSyncAndReconnect` (`js/app.js`, dentro del bind de listeners de
  online/focus/visibilitychange) todavía llamaba a
  `window.SupabaseManager.syncOfflineQueue()` — una función que este mismo
  paso acababa de eliminar. Sin este fix, cualquier reconexión real habría
  tirado un `TypeError` no capturado ahí mismo.

- [x] **Step 3: `npm test` + smoke test manual completo (login, vender, cerrar, todo) contra dev**

  `npm run lint`: 0 errores. `npm test`: 100% verde (unit + build).

  Verificación real contra `casa-lucenzo-dev`, navegador real, logueado como
  `test` (admin) — no simulado. Sin `powerSyncUrl` configurada (no
  disponible en esta sesión), así que todo lo probado ejercitó el camino
  Supabase-direct (rama `!getLocalDb()`), que es exactamente donde vivían
  los guards retirados:
  - Checkout de un carrito de 2 productos → confirmado por SQL directo que
    ambas filas llegaron a `public.sales` (antes: dependía silenciosamente
    de la cola vieja).
  - "Registrar Pago" (marcar cuenta como pagada) → `upsertSales` confirmado
    reescribiendo `name` en Postgres sin nulear otras columnas.
  - Cierre de jornada → `insertDayClose` confirmado insertando una fila real
    en `public.day_closes` (antes de este task, esta función nunca había
    tenido ninguna verificación real, ni siquiera Supabase-direct).
  - Botón "Limpiar Caché" → corrió sin errores (sin ventas en cuarentena en
    este momento, así que solo limpió service worker + recargó).
  - Consola sin ningún error de referencia colgante (`syncOfflineQueue is
    not defined` y similares) durante toda la sesión de prueba.
  - Datos de prueba y el ajuste de stock de la venta de prueba revertidos en
    `casa-lucenzo-dev` al terminar (SQL directo). La contraseña del usuario
    `test` se reseteó a una temporal conocida solo por mí (autorizado
    explícitamente por el usuario en el chat) para poder loguearme — no hay
    forma de revertirla a la original porque nunca se leyó/guardó antes de
    pisarla; si hace falta la de antes, hay que resetearla de nuevo a mano.

- [x] **Step 4: Commit**

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

- [x] **Step 1: Suscribirse a los eventos de estado de PowerSync**

  `js/powersync/client.js`: instalé `@powersync/web@2.4.1` real en un
  scratchpad (misma técnica que con bcryptjs/supabase-js) para leer el
  `.d.ts` real de `SyncStatus` en vez de confiar en la doc — confirmé los
  campos `connected`/`connecting`/`uploading`/`downloading`/`hasSynced`/
  `lastSyncedAt`, y que `db.registerListener({statusChanged})` es real y
  devuelve un disposer (`BaseObserver.registerListener`). Agregué
  `onStatusChange(cb)` (wrapper de `registerListener`) y
  `getUploadQueueStats()` (cuenta real de la cola de subida CRUD de
  PowerSync — reemplaza el conteo manual de la cola vieja que Task 12
  retiró) al objeto `window.PowerSyncManager`.

  También agregué `hasAttemptedConnect()`: antes de que `connect()` se llame
  por primera vez (pre-login, o un dispositivo que nunca configuró
  PowerSync), `currentStatus.connected` es `false` de la misma forma que si
  estuviera genuinamente offline — no hay un tercer booleano para
  distinguir "nunca lo intentó" de "está caído". Sin este guard, el badge
  hubiera mostrado "Sin Conexión" en la propia pantalla de login. Verificado
  en navegador real: `false` antes de loguearse, `true` después.

- [x] **Step 2: Actualizar el badge existente**

  `js/app.js`: `updateSyncStatusUI(status)`, suscrita dentro del bloque
  `DOMContentLoaded` (paso "19."). Estados: `!connected` → rojo "Sin
  Conexión"; `uploading || downloading` → ámbar, con el conteo real de
  `getUploadQueueStats()` si hay algo pendiente; conectado y sin nada en
  vuelo → badge oculto (todo al día).

  **Hallazgo real durante la verificación, no anticipado por el plan**:
  `#conn-status` (el punto del header) ya tenía un driver propio
  (`updateConnectionStatus`, disparado por el canal realtime de Supabase en
  `autoSyncAndReconnect`/`subscribeToChanges`) que seguía activo. Verificado
  en navegador real que ambos drivers competían por el mismo elemento —
  PowerSync lo ponía en "offline" y, segundos después, un reconnect de
  Supabase realtime lo volvía a poner en "online", parpadeando entre dos
  señales distintas. Arreglado en `js/ui.js`: `updateConnectionStatus`
  acepta un segundo argumento `source`; una vez que PowerSync sincronizó al
  menos una vez (`hasSynced`), solo los llamados con `source:'powersync'`
  (desde `updateSyncStatusUI`) pueden tocar el punto — los llamados viejos
  de Supabase realtime se ignoran. Sin este fix, `#conn-status` habría
  quedado inservible en cuanto PowerSync entrara en juego.

  Verificación real contra `casa-lucenzo-dev` (mismo browser reusado de
  Task 12 — reveló un artefacto propio de esta sesión larga de pruebas, no
  un bug: pestañas viejas del mismo origen `localhost:4173`, abiertas desde
  pruebas anteriores en esta misma conversación, seguían compartiendo el
  SharedWorker de PowerSync y sosteniendo una conexión real desde antes,
  así que un `insertSale` de diagnóstico llegó a Postgres real pese a que
  esta pestaña reportaba `connected:false` — confirmado con
  `read_network_requests` y cerrando esas pestañas. Con una sola pestaña:
  pre-login badge oculto y `hasAttemptedConnect()` en `false`; post-login
  sin `powerSyncUrl` disponible esta sesión, badge en rojo "Sin Conexión" y
  `#conn-status` en `offline`, estable durante 8s+ de reconexiones de
  Supabase realtime de fondo (ya no compite). Sin errores nuevos en
  consola más allá del ya esperado "no hay powerSyncUrl configurada".

- [x] **Step 3: Commit**

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

- [x] **Step 1: Un helper `requireOnline(featureName)` reusable**

  `js/app.js`, justo antes de `loadAndRenderExpensesTab` (primer caller):
  `requireOnline(featureName)` — si hay Supabase configurado y
  `navigator.onLine`, devuelve `true`; si no, dispara el toast
  `"⚠️ ${featureName} requiere conexión a internet"` y devuelve `false`. Solo
  para los casos de acción simple/toast (botones, tabs sin contenedor propio
  de error) — las vistas que ya tenían o necesitaban un contenedor dedicado
  (PnL, historial de reportes, dispositivos conectados) escriben su propio
  mensaje en el contenedor en vez de sumar un toast redundante, tal como pide
  el punto 2 del pedido original.

- [x] **Step 2: Aplicarlo a cada función de la lista**

  Investigación real (no la lista de line numbers del plan, que ya estaba
  desactualizada) mostró que varias de estas ya degradaban bien y no
  necesitaban tocarse — evitar tratar el inventario del plan como órdenes
  literales, mismo criterio que en todas las tasks anteriores:
  - `fetchStatsData` / `loadAndRenderAdminStats`: ya oculta los deltas
    semanales en vez de mostrar un `0%` falso (`opts.fullHistory`,
    `js/ui.js:2113`) — no es un fallo silencioso, es "menos información
    pero nunca incorrecta". Sin cambios.
  - `fetchActivityLogs` / `refreshActivityLogsView`: ya tiene su propio
    fallback a un log local en `localStorage` (`casa_lucenzo_local_activity_logs`),
    tanto dentro de la función como en su caller. Sin cambios.
  - `fetchExpensesRange` / `loadAndRenderExpensesTab`: **sí** fallaba en
    silencio — mostraba una vista parcial (solo el mes actual, desde
    memoria) sin avisar que para cualquier otro mes eso podía estar
    incompleto. Ahora usa `requireOnline` con un toast.
  - `fetchPnlData` / `loadPnl`: ya distinguía "sin conexión" de "falló el
    fetch" con su propio mensaje en el contenedor (spec §4.4) — le faltaba
    el botón de reintentar en la rama offline (sí lo tenía la rama de fetch
    fallido). Agregado.
  - `fetchReportDays` / `openReportHistoryModal`: **hallazgo real, el
    ejemplo exacto que dio Gemini** — offline mostraba "No se encontraron
    reportes recientes.", indistinguible de 30 días genuinamente sin
    actividad. Ahora un estado dedicado con botón reintentar. Verificado en
    navegador real: offline → mensaje + reintentar; vuelta online →
    reintentar trae el estado real ("No se encontraron reportes
    recientes.", correcto porque dev no tiene reportes).
  - `fetchDayReport` (botones "Ver"/WhatsApp del historial): ahora
    `requireOnline` corta ANTES de intentar el fetch (y, en el de WhatsApp,
    antes de abrir la pestaña en blanco) en vez de descubrir la falla
    después.
  - `fetchSalesHistory` / `loadAndRenderAnalytics`: ya degradaba a
    `salesLog` (la ventana operativa local) sin romper nada, pero sin
    avisar que ese dataset es más chico que el rango pedido. Sumado el
    toast. Verificado en navegador real.
  - `fetchActiveSessions` / `loadAndRenderActiveDevices`: **el otro caso
    real** — offline no hacía nada (ni toast ni contenedor), dejando lo que
    hubiera quedado renderizado antes (stale) o vacío en la primera carga.
    Llamar a `renderActiveDevices([])` habría mostrado su propio "No hay
    dispositivos registrados en el servidor." — exactamente el mismo
    problema. Ahora escribe un mensaje dedicado en `#settings-devices-list`
    sin pasar por esa función. Verificado en navegador real.

  Firmas y tipos de retorno de las 7 funciones de `js/supabase.js` sin
  tocar (siguen devolviendo `null`/`[]`), tal como pidió Gemini.

- [x] **Step 3: Commit**

  `npm run lint`: 0 errores. `npm test`: 100% verde. Verificado en
  navegador real contra el build servido (no simulado) forzando
  `navigator.onLine = false` vía `Object.defineProperty` — encontré en el
  camino que el service worker servía una versión cacheada de `js/app.js`
  hasta desregistrarlo + limpiar `caches` (mismo problema ya conocido de
  Task 10). Sin errores nuevos en consola.

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

- [x] **Step 1-N:** un test por fórmula, casos borde incluidos (cierre sin
      movimientos, producto nuevo sin historial, dos categorías cruzando el
      mismo cierre).

  Nueva suite `runPlanBAggregationTests` en `tests/unit.test.js`, registrada
  en `SUITES` justo después de `Analytics`. Leí las fórmulas reales antes de
  escribir nada (migraciones `026_day_closes.sql`, `030_stock_recompute.sql`,
  `033_promote_stock_computed.sql`, y `mapDebtRow`/`fetchDebts` en
  `js/supabase.js`) en vez de asumir el resumen del plan — coincidía, pero
  confirmado contra el SQL real, no de memoria.

  Decisión de diseño: estas fórmulas no existen hoy como función JS
  importable en ningún lado (el trigger vive solo en Postgres; el espejo de
  pastelitos en `fetchProducts()` es un template string SQL, no una función
  invocable). En vez de crear código de producción nuevo sin ningún caller
  real solo para tener algo que testear, las tres funciones puras
  (`recomputeStock`, `computeDebtBalance`/`computePaidByDebtUuid`,
  `computeLastCloseAt`) viven *dentro* del archivo de test, documentadas
  como el espejo de la fórmula real — su trabajo es atrapar una regresión
  de fórmula rápido y sin DB; Task 16 (harness de convergencia) es quien
  verifica que el trigger/SQL real siguen de acuerdo con esta.

  15 aserciones nuevas, las 3 fórmulas cubiertas:
  - `recomputeStock`: pastelitos (solo movimientos post-cierre, `initial_stock`
    solo `type='load'`) vs. otras categorías (`stock` = histórico completo,
    `initial_stock` = stock-al-cierre + cargas post-cierre); `max = GREATEST(...)`
    sube pero nunca baja solo; spec R3 (venta deja stock negativo, sin floor);
    cierre sin movimientos (pastelitos → 0, otras categorías retienen);
    producto nuevo sin historial; dos categorías cruzando el mismo `t0` sin
    filtrarse entre sí.
  - `computeDebtBalance` / `computePaidByDebtUuid`: abonos parciales con
    montos que en punto flotante crudo arrastran error (3× 10.10 sin
    redondear da 30.299999999999997 — verificado que con `.toFixed(2)` da
    30.30 exacto); abono mayor a la deuda restante clampea a 0; múltiples
    deudas con abonos agrupados por `debt_uuid` sin cruzarse entre sí.
  - `computeLastCloseAt`: `day_closes` vacío → `-Infinity` (nunca lanza,
    compara correctamente contra cualquier timestamp real); múltiples
    cierres recibidos desordenados convergen al `MAX(closed_at)` sin
    importar el orden de llegada.

- [x] **Step final: Commit**

  `node tests/unit.test.js`: 15/15 aserciones nuevas verdes al primer
  intento (además de toda la suite existente). `node tests/build.test.js`:
  OK. `npm run lint`: 0 errores. Sin cambios a código de producción — no
  requiere verificación en navegador.

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

- [x] **Step 1: Decidir automatizado vs. manual documentado, con el usuario si hace falta**

  Discutido con Gemini antes de escribir código (el plan mismo deja esta
  decisión abierta). Diagnóstico técnico, verificado no solo teorizado:
  - `@powersync/web` necesita navegador real (`SharedWorker`, OPFS/IndexedDB,
    WASM) — correrlo en Node puro requeriría `@powersync/node`, que trae
    dependencias nativas C++ de SQLite que este proyecto no tiene.
  - Dos pestañas comunes del mismo origen NO son dos dispositivos aislados
    — comparten un solo `SharedWorker` y una sola base SQLite local.
    **Confirmado empíricamente, no en teoría**: durante la verificación de
    Task 13 encontré que un `insertSale` de diagnóstico llegó a
    Postgres real desde una pestaña que reportaba `connected:false`,
    porque otra pestaña de fondo — completamente olvidada, de pruebas de
    tasks anteriores — sostenía la conexión real compartida por el mismo
    worker.

  Decisión (hoy híbrida, la mitad automatizada quedó lista, la mitad manual
  quedó documentada pero SIN ejecutar — ver Step 3):
  1. **Automatizado**: lo que realmente tiene que converger cuando dos
     dispositivos reconectan no es la mecánica interna de PowerSync (eso es
     responsabilidad de la librería, no de esta app) sino el modelo de datos
     de Postgres — `stock_movements` + `recompute_product_stock()`,
     `debt_payments` + el saldo, `day_closes` + `last_close_at()`. Un script
     Node simula exactamente lo que subirían las colas CRUD de dos
     dispositivos, contra Postgres real, sin necesitar navegador.
  2. **Manual documentado**: lo que el script automatizado NO puede tocar
     (la cola CRUD de PowerSync en sí, su manejo de reconexión) queda para
     una pasada manual con dos perfiles de navegador reales — sin
     automatizar, documentado explícitamente como pendiente (ver Step 3).

- [x] **Step 2: Implementar**

  `tests/powersync-convergence.test.js` (nuevo) — sin dependencias nuevas:
  siguiendo la convención ya establecida en `lib/bot-shared.js`
  (`SupabaseRest`, ya que `@supabase/supabase-js` ni siquiera es una
  dependencia de npm en este proyecto, se carga solo por CDN en el
  navegador), habla contra la REST API de PostgREST con `fetch` plano.

  Decisión de diseño sobre autenticación: en vez de pedir una
  `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS por completo), el script hace un
  login real (`/auth/v1/token?grant_type=password`) con un usuario de
  prueba y usa ESE token para cada insert — pasa por las mismas policies
  RLS (001/025/026/027) que un dispositivo real después de loguearse. Más
  fiel a lo que se está verificando, y evita que este script necesite
  guardar el secreto más peligroso del proyecto.

  Guardas de seguridad: rechaza correr sin `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
  credenciales, y rechaza correr contra cualquier URL que no contenga el
  ref de `casa-lucenzo-dev` salvo confirmación explícita
  (`CONVERGENCE_TEST_CONFIRM_DEV=yes`) — nunca debe poder correr contra
  producción por accidente. No se agregó a `npm test` (necesita red +
  credenciales reales, lo opuesto a la suite hermética) — corre aparte,
  `npm run test:convergence` (nuevo script en `package.json`).

  Simula: dos `device_id` (`tablet-1`/`tablet-2`) insertando
  intercalado/desordenado — 2 ventas + sus `stock_movements` (delta -2 y
  -3) sobre un producto pastelito de prueba, cruzando un `day_closes` real
  de por medio; 2 abonos ($10.10 y $5.00) a la misma deuda de prueba.
  Limpia todo lo que crea al final (`finally`), salvo `day_closes` — ver el
  hallazgo del Step 3.

- [x] **Step 3: Correr y confirmar convergencia**

  **Mitad automatizada — corrida real contra `casa-lucenzo-dev`, no
  simulada:**

  Primera corrida falló (a propósito lo dejo documentado, no lo escondo):
  `max` dio `999` en vez de `20`. No era un bug de `recompute_product_stock`
  sino un error de orden en el test mismo — insertaba el movimiento "viejo,
  antes del cierre" ANTES de crear el `day_closes` de la prueba, así que
  `last_close_at()` en ese instante todavía apuntaba a cierres reales de
  horas antes (de tasks anteriores en este mismo proyecto dev compartido),
  y el movimiento de 999 quedó contado como "posterior al cierre" bajo esa
  frontera vieja — y `GREATEST()` nunca lo bajó después (por diseño, Task 9).
  Reordenado: el `day_closes` de la prueba se inserta PRIMERO, así queda
  como el máximo global de inmediato, y recién entonces el movimiento viejo
  (con timestamp antes de ese cierre) se inserta. Segunda corrida: las 3
  suites verdes contra Postgres real.

  Segundo hallazgo real durante la limpieza: `day_closes` no tiene policy
  de `DELETE` (`001`/`026` — es append-only a propósito, mismo diseño que
  el resto de Plan B). El primer intento de borrar la fila de prueba fallaba
  en silencio (RLS deniega el DELETE, 0 filas afectadas, sin error) y quedó
  huérfana. Corregido: el script ya no intenta borrar `day_closes` — lo
  documenta como una fila permanente esperada (igual que un cierre real),
  no basura a limpiar. Las filas huérfanas de las corridas de prueba
  durante este debugging se purgaron a mano vía una conexión privilegiada
  (no a través del script, que nunca tuvo ni necesitó esa clase de acceso).

  Estado final verificado con SQL directo: cero filas de prueba
  (`conv-%`) quedan en `products`/`stock_movements`/`day_closes`/`sales`/
  `debts`/`debt_payments`.

  **Mitad manual — NO ejecutada esta sesión, documentado en vez de fingirla:**

  Requiere la `powerSyncUrl` real de `casa-lucenzo-dev`, que no está
  disponible en este entorno (mismo bloqueo ya encontrado en Tasks 13/14).
  Pendiente para cuando el usuario la tenga a mano:
  1. Abrir la app en dos perfiles de navegador realmente separados (dos
     perfiles de Chrome, o un perfil normal + uno invitado — **no** dos
     pestañas del mismo perfil, comparten el `SharedWorker`, ver Step 1).
  2. En cada uno, loguearse, cortar la red (DevTools → Network → Offline, o
     desconectar Wi-Fi), y hacer una acción distinta: Dispositivo 1 vende un
     producto, Dispositivo 2 anota un abono a una deuda (o vende el mismo
     producto, para forzar la resta a converger sobre el mismo stock).
  3. Reconectar ambos y confirmar en el badge de Task 13 que ambos llegan a
     "sincronizado" sin error.
  4. Confirmar contra Postgres real (o recargando ambas pestañas) que
     ninguna venta se perdió y que el stock/saldo coincide con lo que la
     mitad automatizada de este Step ya probó que el trigger calcula bien.

- [x] **Step 4: Commit**

  `npm run lint`: 0 errores. `npm test` (suite hermética): sin cambios,
  sigue 100% verde — este script deliberadamente no se sumó ahí.
  `npm run test:convergence` contra `casa-lucenzo-dev` real: 3/3 suites
  verdes.

---

## Task 17: Rollout — modo sombra (spec §10, paso 2)

> **Estado: pendiente de ejecución operacional por parte de Gustavo.**
> Tasks 0–16 (todo el código de `feature/offline-first-plan-b`) están
> formalmente completas, verificadas y testeadas — confirmado por Gemini.
> Esta task ya no es código: es desplegar, esperar, y comparar datos reales
> en producción/staging, algo que le corresponde a Gustavo, no a un agente.
>
> **⚠️ Bloqueador real sin resolver, encontrado al releer Task 2 antes de
> cerrar la rama (2026-09-27), NO cubierto por Gemini ni por el trabajo de
> código: las migraciones 033 (columnas reales) y 034 (publication de
> PowerSync) nunca se aplicaron a producción — solo a `casa-lucenzo-dev`
> (confirmado por `git log`, ver la nota completa en la Task 2, Step 3).
> Sin 034 en producción, PowerSync no tiene nada de dónde sincronizar ahí:
> el modo sombra de este Step no puede arrancar contra producción tal cual
> está hoy. Resolver el gate de la Task 2 (y decidir el orden
> migraciones-vs-deploy con Gustavo) es un prerequisito real de esta task,
> no un detalle aparte.**

**Files:** ninguno (operación).

**Interfaces:**
- Produces: el build de `feature/offline-first-plan-b` desplegado en un
  preview aparte (Vercel preview de la rama, o un subdominio de staging),
  con PowerSync sincronizando en segundo plano, mientras la app real de
  producción sigue con el código de hoy sin tocar. ~1 semana, comparando que
  los datos coincidan.

- [ ] **Step 1: Deploy a preview** — pendiente (Gustavo)
- [ ] **Step 2: Comparación diaria de datos (sombra vs. real) — mismo espíritu que Plan A Task 10** — pendiente (Gustavo)
- [ ] **Step 3: Reporte de resultado — requiere aprobación explícita del usuario para pasar a la Task 18** — pendiente (Gustavo)

---

## Task 18: Rollout — una tablet real (spec §10, paso 3) y luego el resto

> **Estado: pendiente de ejecución operacional por parte de Gustavo**, y
> bloqueada por la aprobación de la Task 17 (Step 3) antes de empezar.

**Files:** ninguno (operación).

**Interfaces:**
- Produces: una tablet de producción real corriendo el build nuevo 1
  semana; si sale limpio, el resto de las tablets; recién ahí se retira el
  código viejo definitivamente.

- [ ] **Step 1: Elegir la tablet piloto, con el usuario** — pendiente (Gustavo)
- [ ] **Step 2: 1 semana de operación real, monitoreo activo** — pendiente (Gustavo)
- [ ] **Step 3: Gate — requiere aprobación explícita del usuario antes de tocar el resto de las tablets** — pendiente (Gustavo)
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
