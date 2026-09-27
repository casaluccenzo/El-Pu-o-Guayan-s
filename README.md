# 🥊 El Puño Guayanés — Sistema POS & Control de Inventario

Sistema Web/PWA de Punto de Venta (POS), control de inventario offline-first en tiempo real, comandas de cocina y panel administrativo de métricas para **El Puño Guayanés**.

- **App web**: [el-puno-guayanes-casa-luccenzo.vercel.app](https://el-puno-guayanes-casa-luccenzo.vercel.app)
- **App de escritorio (Windows)**: ver [más abajo](#-app-de-escritorio-windows).

> Este código nació como el sistema de Casa Lucenzo (negocio hermano, mismo dueño) y hoy es una base compartida: mismo motor, cada negocio con su propia base de datos, su propia sincronización y su propia marca. El repo de Casa Lucenzo es [casaluccenzo/casa-luccenzo](https://github.com/casaluccenzo/casa-luccenzo) — cambios de funcionalidad al motor en sí conviene aplicarlos en los dos repos.

---

## 🚀 Arquitectura Técnica

- **Frontend**: HTML5 + Vanilla CSS + JavaScript Modular (ES6) (sin frameworks, ultra-rápido y liviano).
- **Backend & Persistencia**: Supabase PostgreSQL + Supabase Auth + Row Level Security (RLS) — proyecto propio, sin datos compartidos con Casa Lucenzo.
- **Offline-first & Sincronización**: [PowerSync](https://www.powersync.com/) (`js/powersync/`) — cada dispositivo escribe primero a una base SQLite local (IndexedDB) y sincroniza en segundo plano contra Postgres. La app funciona igual con la conexión caída.
- **Stock append-only**: `stock_movements` es la fuente de verdad (`load`/`sale`/`count_down`/...); `products.stock_computed` se recalcula server-side vía trigger cada vez que se inserta un movimiento. Nunca se escribe `stock` a mano.
- **Tasa de Cambio BCV**: Conector automático multi-proveedor con fallback resiliente (`js/exchange-rate.js`).
- **Despliegue**: Vercel (Compilación estática vía `node scripts/build.js` ➔ `www/`), con `BRAND=el-puno-guayanes` para que el build use el logo y el nombre correctos (ver `img/brands/el-puno-guayanes/`).

---

## 💻 App de Escritorio (Windows)

Shell de Electron que empaqueta una copia congelada de la app — no es una ventana apuntando al sitio en vivo, se actualiza sola al abrir.

**Descargar**: [última versión en GitHub Releases](https://github.com/casaluccenzo/El-Pu-o-Guayan-s/releases/latest) → descargar el `.exe` → ejecutar. Instalador `oneClick`, no pide elegir carpeta.

*(Si todavía no hay ninguna release publicada acá, es porque falta correr la primera: ver la sección "Otro negocio (BRAND)" de `docs/superpowers/plans/electron-release-runbook.md`. Con `BRAND=el-puno-guayanes` el `.exe` sale como "El Puño Guayanés" y publica a este mismo repo.)*

---

## 🔑 Autenticación & Roles

**Supabase Auth** respaldado por la tabla `public.profiles` protegida por **Row Level Security (RLS)**:

- `admin`: Control total (Métricas, inventario, usuarios, tasa BCV, cierre de caja).
- `venta`: Punto de venta (Vitrina, ventas, historial, cobro de fiados).
- `cocina`: Monitor de comandas, despachos y recetas.

El login es por email/password; el PIN de 4 dígitos es solo para reabrir sesión rápido en el mismo dispositivo.

---

## 🛠️ Desarrollo Local

```bash
npm run dev
```

Levanta `http://localhost:4173/sistema/` sirviendo el código fuente sin compilar (sin Supabase/PowerSync reales salvo que se configuren en Preferencias).

Para generar el build real de este negocio:

```bash
BRAND=el-puno-guayanes SUPABASE_URL=... SUPABASE_ANON_KEY=... POWERSYNC_URL=... node scripts/build.js
```

(los valores reales están en las variables de entorno del proyecto Vercel — Project Settings → Environment Variables, no están commiteados en ningún lado).

---

## 🧪 Pruebas

```bash
npm test
```

---

Documentación técnica completa del motor (arquitectura de sync, migraciones, cómo agregar un negocio nuevo) vive en [el repo de Casa Lucenzo](https://github.com/casaluccenzo/casa-luccenzo#readme).
