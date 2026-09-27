# 🥖 Casa Lucenzo — Sistema POS & Control de Inventario

Sistema Web/PWA de Punto de Venta (POS), control de inventario offline-first en tiempo real, comandas de cocina y panel administrativo de métricas.

Este mismo código sirve hoy a **dos negocios independientes** desplegados por separado — ver [Multi-negocio y branding](#-multi-negocio-y-branding) más abajo.

| Negocio | App web | Supabase | PowerSync |
|---|---|---|---|
| Casa Lucenzo | [casalucenzo.com](https://casalucenzo.com) | proyecto `Casa Lucenzo` (`xttpaqokeyywjaajvjyu`) | proyecto `casa-lucenzo-dev`, entorno **Production** |
| El Puño Guayanés | [el-puno-guayanes-casa-luccenzo.vercel.app](https://el-puno-guayanes-casa-luccenzo.vercel.app) | proyecto propio (org "El Puño Guayanés") | mismo proyecto PowerSync, entorno **Development** |

---

## 🚀 Arquitectura Técnica

- **Frontend**: HTML5 + Vanilla CSS + JavaScript Modular (ES6) (sin frameworks, ultra-rápido y liviano).
- **Backend & Persistencia**: Supabase PostgreSQL + Supabase Auth + Row Level Security (RLS).
- **Offline-first & Sincronización**: [PowerSync](https://www.powersync.com/) (`js/powersync/`) — cada dispositivo escribe primero a una base SQLite local (IndexedDB) y sincroniza en segundo plano contra Postgres vía un stream definido en Sync Rules. La app funciona igual con la conexión caída; no depende de `navigator.onLine` en ningún flujo de escritura (retirado en la migración "Plan B", ver `docs/superpowers/plans/2026-09-23-offline-first-pos-plan-B-frontend.md`).
- **Stock append-only**: `stock_movements` es la fuente de verdad (`load`/`sale`/`count_down`/...); `products.stock_computed` se recalcula server-side vía trigger (`recompute_product_stock()`, migración 030) cada vez que se inserta un movimiento. Nunca se escribe `stock` a mano.
- **Tasa de Cambio BCV**: Conector automático multi-proveedor con fallback resiliente (`js/exchange-rate.js`).
- **Asistente IA**: Integración con Google Gemini API protegida vía Vercel Serverless Function (`/api/gemini.js`).
- **App de Escritorio**: shell Electron para Windows, ver [más abajo](#-app-de-escritorio-windows).
- **Despliegue**: Vercel (Compilación estática vía `node scripts/build.js` ➔ `www/`).

---

## 🏪 Multi-negocio y branding

El repo es uno solo; cada negocio es un **proyecto Vercel separado** (mismo repo/rama `main`, variables de entorno propias) apuntando a su **propio proyecto Supabase** y su **propio entorno PowerSync**. Nada de datos se comparte entre negocios.

Variables de entorno que cambian por deploy (todas configuradas en Vercel → Project Settings → Environment Variables, nunca commiteadas):

| Variable | Qué es |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Proyecto Supabase de ese negocio. |
| `POWERSYNC_URL` | Endpoint del entorno PowerSync de ese negocio (Client SDK Setup en el dashboard de PowerSync). |
| `BRAND` | Nombre de carpeta en `img/brands/<BRAND>/` — ver abajo. Si no está seteada, se usa el branding por defecto (Casa Lucenzo). |

### Branding por negocio (`img/brands/<BRAND>/`)

Cada carpeta contiene:
- `logo.jpg`, `logo-192.png`, `logo-512.png` — reemplazan a los archivos default de `img/` en el build.
- `brand.json` — `{ "displayName": "...", "shortName": "...", "description": "..." }`, usado para pisar `manifest.json` y toda ocurrencia de "Casa Lucenzo"/"CASA LUCENZO" en el HTML y JS compilados (título, footer, pantalla de login, mensajes de WhatsApp, reportes generados, prompt del agente IA).

`scripts/build.js` hace esta sustitución al final del build, solo si `BRAND` está seteada y la carpeta existe — sin la variable, el build es *byte-idéntico* al de Casa Lucenzo, así que agregar un negocio nuevo nunca puede romper el existente.

### Agregar un negocio nuevo

1. Crear proyecto Supabase (org propia si ya se usaron los 2 gratis de la org actual — el límite free es por usuario, no por org) y correr ahí todas las migraciones de `supabase/migrations/` en orden.
2. Crear instancia/entorno PowerSync nuevo, conectado a ese Supabase (rol dedicado `powersync_role`, no el usuario `postgres`), pegar las Sync Rules de `docs/superpowers/plans/planB-sync-rules.yaml`.
3. Crear proyecto Vercel nuevo enlazado al mismo repo/rama `main`, con `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POWERSYNC_URL` y `BRAND` propios.
4. Crear `img/brands/<nombre>/` con el logo y `brand.json` de ese negocio, commitear.
5. Desactivar "Vercel Authentication" (Deployment Protection) en el proyecto nuevo para que la app sea pública.

---

## 💻 App de Escritorio (Windows)

Shell de Electron (`desktop/`) que empaqueta una copia congelada de `www/` — no es una ventana apuntando al sitio en vivo, así que necesita su propia actualización para ver cambios nuevos (se actualiza sola, ver abajo).

**Descargar**: [última versión en GitHub Releases](https://github.com/casaluccenzo/casa-luccenzo/releases/latest) → descargar el `.exe` (`Casa-Lucenzo-Setup-X.Y.Z.exe`) → ejecutar. Instalador `oneClick`, no pide elegir carpeta.

- **Auto-actualización**: al abrir, revisa GitHub Releases (`electron-updater`) y se actualiza sola si hay una versión nueva — no hace falta reinstalar a mano.
- **Publicar una release nueva**: `npm run release:desktop` (desde la raíz) — corre `electron-builder --win --publish always` dentro de `desktop/`, sube el `.exe`/`.blockmap`/`latest.yml` a un release de GitHub. Necesita `GH_TOKEN` en el entorno (`desktop/.env`, gitignored) con permiso `repo`. `desktop/package.json` tiene `releaseType: "release"` — publica directo, no como draft.
- El número de versión sale de `package.json` (raíz) vía `npm version patch`; `scripts/sync-desktop-version.js` lo copia a `desktop/package.json` para que ambos coincidan siempre.

---

## 🔑 Autenticación & Roles

El sistema utiliza **Supabase Auth** respaldado por la tabla `public.profiles` protegida por **Row Level Security (RLS)**:

- `admin`: Control total (Métricas, inventario, usuarios, tasa BCV, cierre de caja).
- `venta`: Punto de venta (Vitrina, ventas, historial, cobro de fiados).
- `cocina`: Monitor de comandas, despachos y recetas.

El login es por email/password (Supabase Auth); el PIN de 4 dígitos (`set_quick_pin`/`verify_quick_pin`, migración 003) es solo para reabrir sesión rápido en el mismo dispositivo, no reemplaza el login inicial.

---

## 🛠️ Desarrollo Local

```bash
npm run dev
```

Levanta `http://localhost:4173/` (landing) y `http://localhost:4173/sistema/` (el POS), sirviendo el código fuente sin compilar. `js/supabase.js` y `js/powersync/connector.js` caen a sus placeholders sin reemplazar → la app corre en modo local-only (sin Supabase/PowerSync reales) salvo que se configuren manualmente en Preferencias.

### Modo Pruebas (Sandbox Isolado)

Para evitar alterar datos reales durante pruebas manuales, agregar `?test=true` a la URL — aísla el estado en `localStorage` bajo un prefijo separado.

---

## 🧬 Entornos

| Entorno | Proyecto Supabase | Ref | Uso |
|---|---|---|---|
| Producción (Casa Lucenzo) | `Casa Lucenzo` | `xttpaqokeyywjaajvjyu` | Datos reales del negocio. |
| Dev/pruebas | `casa-lucenzo-dev` | `kzthbjjfguivguppqeuq` | Para probar migraciones antes de aplicarlas a producción. **Pausado por defecto** (Supabase free = 2 proyectos activos por usuario) — reactivar desde el dashboard cuando haga falta, tarda un par de minutos. |

> ⚠️ Las tablas base (`products`, `sales`, `expenses`, `debts`, `replenishments`, `ingredients`, `app_config`, `active_sessions`) de producción se crearon a mano en el dashboard antes de que existiera `supabase/migrations/`, así que las migraciones `000`/`001` documentan el schema pero no son las que efectivamente lo crearon ahí. Para un proyecto Supabase nuevo (otro negocio, o restaurar dev), sí alcanza con correr todas las migraciones en orden — parten de una base vacía.

---

## 🧪 Pruebas

```bash
npm test                      # unitarias (cálculos de dinero/inventario/permisos) + build.test.js
npm run test:convergence      # opcional: convergencia PowerSync real contra casa-lucenzo-dev (requiere reactivarlo)
```

`test:convergence` escribe de verdad contra Postgres — tiene un guard que rechaza correr contra cualquier proyecto que no sea `casa-lucenzo-dev` salvo `CONVERGENCE_TEST_CONFIRM_DEV=yes`.

---

## 📦 Compilación y Despliegue

```bash
node scripts/build.js
```

Genera `www/` con las variables de entorno inyectadas (falla de forma silenciosa/degradada si faltan — ver comentarios en el archivo, nunca rompe el build).

Variables de entorno relevantes en Vercel (por proyecto, ver [Multi-negocio](#-multi-negocio-y-branding) para las que cambian por negocio):

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — proyecto Supabase de ese deploy.
- `POWERSYNC_URL` — endpoint PowerSync de ese deploy.
- `BRAND` — branding a aplicar (opcional, default = Casa Lucenzo).
- `SENTRY_DSN` — reporte de errores en producción (opcional, cae a un DSN mock si no está).
- `GEMINI_API_KEY`: Clave API para el Asistente IA.
- `PEDIDOS_ONLINE_ENABLED`: debe valer `true` para que `/api/notify-pedido` avise
  al staff por WhatsApp. Con cualquier otro valor el endpoint responde 503. El
  pedido se guarda igual en Supabase; lo único que se pierde es la notificación.
- `CRON_SECRET`: string aleatorio (16+ caracteres) que autoriza a los crons
  diarios (`/api/daily-restock`, `/api/keepalive`, `/api/sales-monitor`) definidos en
  `vercel.json`. Vercel lo envía solo como header al disparar cada cron; sin
  esta variable los endpoints rechazan toda petición.
- `SALES_MONITOR_ENABLED`: debe valer `true` para que `/api/sales-monitor`
  (cron diario, 9pm hora Venezuela) mande un resumen de ventas del día por
  WhatsApp a `WHATSAPP_ADMIN_PHONE`. Con cualquier otro valor responde 503 y
  no manda nada. Reutiliza el mismo cálculo de patrón semanal/tendencia/
  reseñas que la pestaña "Análisis" y su informe PDF (`js/analytics.js`).

## Versionado de assets

`sistema/index.html` pide cada `.js`/`.css` con `?v=NNN` y `sw.js` define
`APP_VERSION = 'NNN'`. **Los dos números tienen que subir juntos en cada
release**: el service worker cachea por URL completa, así que si no coinciden el
precache queda huérfano y los usuarios siguen ejecutando código viejo.

`npm run release` corre los tests, sube la versión (`npm version patch`,
sincroniza `desktop/package.json`), pushea `main` y publica la release de
escritorio — todo en un solo comando.
