# Casa Lucenzo Electron Desktop — Implementation Plan

> **Estado (revisado 2026-09-27): Tasks 1–8 implementadas; Task 9 a medias.**
> Está en el código: `desktop/` (`main.js` con protocolo `app://`, `preload.js`, `updater.js`, `menu.js`, `build/icon.png`, `.env.example`), `scripts/inject-version.js` + `tests/build.test.js`, `js/desktop.js`, footer y diálogo "Acerca de", scripts `release*` y el runbook. Cambio respecto al plan: la config de electron-builder vive en `desktop/electron-builder.config.js` + `desktop/brand-config.js` (por marca), no en un bloque `build` de `desktop/package.json`.
> Task 9: se mergeó (#19) y hubo releases `v1.0.1`–`v1.0.4`; El Puño publica desde este repo vía `.github/workflows/release-desktop.yml`. **Pendiente de verdad:** registrar la instalación en las PC de la tienda y la prueba del ciclo de auto-update, y anotar el resultado en `electron-release-runbook.md` (Steps 3–6).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empaquetar el POS de Casa Lucenzo como una app de escritorio Windows
(`Casa Lucenzo.exe`) con el frontend adentro, versión visible, y
auto-actualización silenciosa vía GitHub Releases.

**Architecture:** Electron carga el frontend empaquetado (`www/`) a través de un
protocolo propio `app://` (las rutas absolutas `/js/...` lo requieren). El
proceso principal (`desktop/main.js`) maneja la ventana y `electron-updater`; un
`preload.js` acotado expone `window.electronAPI` al frontend. `package.json →
version` es la única fuente de versión, inyectada en el build. Nada de lógica de
negocio cambia.

**Tech Stack:** Electron (última estable), `electron-builder` (empaqueta +
publica a GitHub Releases, target NSIS Windows), `electron-updater`
(auto-update). Node 24 / npm 11. Sin bundler para el frontend (se copia tal
cual, como hoy).

**Spec:** `docs/superpowers/specs/2026-09-02-electron-desktop-design.md`

## Global Constraints

- **Solo Windows.** Target `nsis`, `oneClick: true`, `perMachine: false`.
- **Sin firma de código.** No configurar `certificateFile` ni CSC_* env vars.
- **Versión inicial: `1.0.0`** en `package.json`. Reemplaza el
  `APP_VERSION = '320'` de `sw.js`. Semver de acá en más.
- **Repo:** `casaluccenzo/casa-luccenzo` (público). El código Electron vive en
  `desktop/` en el mismo repo. Rama de trabajo: `feature/electron-desktop`
  (nueva, desde `main`).
- **El frontend actual (online-only) se empaqueta tal cual.** No se toca la
  lógica de negocio, Supabase, ni el trabajo offline-first. Cambios al frontend
  acotados a: versión en el footer, diálogo "Acerca de", guard del service
  worker.
- **casalucenzo.com no cambia de comportamiento.** El mismo `www/` sirve para
  web y escritorio; la única diferencia la hace `window.electronAPI` (existe
  solo en Electron).
- **`GH_TOKEN` nunca se commitea.** `.env` en `.gitignore`, `desktop/.env.example`
  sin el valor.
- Verificado 2026-09-02: `sistema/index.html` NO tiene `<meta>` CSP y
  `vercel.json` NO manda headers CSP → el origen `app://` carga sin fricción de
  CSP. Si en el futuro se agrega una CSP, incluir `app:` en las directivas.
- Node core only para scripts (`build.js`, `devserver.js` no tienen deps). Los
  tests son el patrón hand-rolled de `tests/unit.test.js` (asserts + `process.exit`).

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `desktop/package.json` | Deps de Electron + bloque `build` de electron-builder |
| `desktop/main.js` | Proceso principal: protocolo `app://`, ventana única, menú, arranque del updater |
| `desktop/updater.js` | Toda la lógica de `electron-updater`: eventos → estado simple → IPC al renderer |
| `desktop/preload.js` | `contextBridge` → `window.electronAPI` (5 métodos) |
| `desktop/build/icon.png` | 512×512, derivado de `img/logo-512.png` (electron-builder genera el `.ico`) |
| `desktop/.env.example` | `GH_TOKEN=` (placeholder) |
| `desktop/.gitignore` | `dist/`, `node_modules/`, `.env` |
| `scripts/build.js` | (modificar) inyecta `package.json.version` en `www/` |
| `scripts/inject-version.js` | (nuevo) función pura `injectVersion(dir, version)` — testeable |
| `sistema/index.html` | (modificar) `__APP_VERSION__` en footer + HTML del diálogo "Acerca de" |
| `js/desktop.js` | (nuevo) cableado de `window.electronAPI` ↔ el diálogo; cargado siempre, no-op si no hay `electronAPI` |
| `js/app.js` | (modificar) guard `!window.electronAPI` alrededor del registro del SW |
| `sw.js` | (modificar) `APP_VERSION` pasa a `'__APP_VERSION__'` (inyectado en build) |
| `package.json` | (modificar) `version: "1.0.0"`, scripts `release*` |
| `tests/build.test.js` | (nuevo) test de `injectVersion` |
| `.gitignore` | (modificar) `desktop/node_modules`, `desktop/dist`, `.env` |

**Nota sobre `<script>` en `sistema/index.html`:** hoy hay 17 `?v=320`. Pasan a
`?v=__APP_VERSION__` en el fuente; `build.js` los reemplaza por el número real.
`js/desktop.js` se agrega como un `<script>` más (con su `?v=__APP_VERSION__`) y
al array `SCRIPTS` de `sw.js` (skill `verifying-production-deploys`).

---

## Task 1: Scaffold de `desktop/` + ventana en blanco

**Files:**
- Create: `desktop/package.json`, `desktop/main.js`, `desktop/.gitignore`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm --prefix desktop start` abre una ventana de Electron. `main.js`
  exporta nada; es un entrypoint. La ventana por ahora carga un `data:` HTML de
  prueba.

- [x] **Step 1: Crear `desktop/package.json`**

```json
{
  "name": "casa-lucenzo-desktop",
  "version": "1.0.0",
  "private": true,
  "description": "Shell de escritorio del POS Casa Lucenzo",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder --win --publish never",
    "publish": "electron-builder --win --publish always"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0"
  },
  "dependencies": {
    "electron-updater": "^6.3.0"
  }
}
```

- [x] **Step 2: Instalar**

Run: `cd desktop && npm install`
Expected: instala sin errores. `desktop/node_modules/` creado.

- [x] **Step 3: `.gitignore` (raíz) — agregar**

```
desktop/node_modules/
desktop/dist/
.env
```

- [x] **Step 4: `desktop/.gitignore`**

```
node_modules/
dist/
.env
```

- [x] **Step 5: `desktop/main.js` mínimo**

```javascript
const { app, BrowserWindow } = require('electron');

// Doble click en el icono no abre una segunda ventana.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [w] = BrowserWindow.getAllWindows();
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });

  app.whenReady().then(() => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    win.loadURL('data:text/html,<h1>Casa Lucenzo — scaffold OK</h1>');
  });

  app.on('window-all-closed', () => app.quit());
}
```

- [x] **Step 6: Correr**

Run: `cd desktop && npm start`
Expected: se abre una ventana maximizada que dice "Casa Lucenzo — scaffold OK".
Cerrarla termina el proceso.

- [x] **Step 7: Commit**

```bash
git add desktop/package.json desktop/main.js desktop/.gitignore .gitignore
git commit -m "feat(desktop): Electron scaffold + blank window"
```

---

## Task 2: Protocolo `app://` + cargar el frontend real

**Files:**
- Modify: `desktop/main.js`

**Interfaces:**
- Consumes: la carpeta `www/` (producida por `npm run build` desde la raíz).
- Produces: la ventana carga `app://sistema/index.html` con los assets
  (`/js/*`, `/css/*`, `/img/*`) resolviendo bien. En dev, `www/` está en
  `<repo>/www`; empaquetado, en `process.resourcesPath + '/www'`.

- [x] **Step 1: Generar `www/` una vez**

Run (desde la raíz): `npm run build`
Expected: `www/sistema/index.html` existe.

- [x] **Step 2: Reescribir `desktop/main.js` con el protocolo**

```javascript
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// www/ está al lado de main.js en dev; en resources/ cuando está empaquetado.
const WWW_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'www')
  : path.join(__dirname, '..', 'www');

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [w] = BrowserWindow.getAllWindows();
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });

  app.whenReady().then(() => {
    // app://sistema/index.html  ->  <WWW_DIR>/sistema/index.html
    // app://js/app.js           ->  <WWW_DIR>/js/app.js
    protocol.handle('app', (request) => {
      const { host, pathname } = new URL(request.url);
      // host = primer segmento ('sistema', 'js', 'css', 'img'); pathname = el resto
      let rel = decodeURIComponent(host + pathname);
      if (rel.endsWith('/') || rel === 'sistema') rel = 'sistema/index.html';
      const filePath = path.join(WWW_DIR, rel);
      // Anti path-traversal: el archivo tiene que estar dentro de WWW_DIR
      if (!filePath.startsWith(WWW_DIR)) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    });

    const win = new BrowserWindow({
      width: 1280, height: 800, show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    win.loadURL('app://sistema/index.html');

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('did-fail-load', code, desc, url);
    });
  });

  app.on('window-all-closed', () => app.quit());
}
```

- [x] **Step 3: Correr y verificar la carga**

Run: `cd desktop && npm start`
Expected: se ve la **pantalla de login del POS** (no un 404, no una página en
blanco). Abrir DevTools (`Ctrl+Shift+I`) → pestaña Console → **no debe haber
errores 404 de `/js/*.js` ni `/css/*`**. La pestaña Network muestra
`app://js/app.js` etc. con status 200.

- [x] **Step 4: Verificar que Supabase responde desde `app://`**

En la ventana del POS, intentar hacer login con un usuario real
(email/contraseña). Expected: el login llega a Supabase y entra (o da "clave
incorrecta" — cualquier respuesta real sirve). En la Console **no debe haber
errores de CORS**. Si los hay: anotar el error exacto y parar — el fix
(header handler en `session.webRequest`) se decide con el error en mano.

- [x] **Step 5: Commit**

```bash
git add desktop/main.js
git commit -m "feat(desktop): app:// protocol serving www/, loads the POS"
```

---

## Task 3: `preload.js` + `window.electronAPI` (versión)

**Files:**
- Create: `desktop/preload.js`
- Modify: `desktop/main.js`

**Interfaces:**
- Produces: `window.electronAPI` en el renderer con:
  - `getVersion(): string` — `app.getVersion()` (de `desktop/package.json`)
  - `getUpdateStatus(): 'al-dia'|'descargando'|'lista'|'error'|'desconocido'`
  - `onUpdateStatus(cb: (status) => void): void`
  - `checkForUpdates(): void`
  - `restartToUpdate(): void`
  Task 4 conecta los 3 últimos al updater real; acá son stubs que devuelven
  `'desconocido'` / no-op, salvo `getVersion`.

- [x] **Step 1: `desktop/preload.js`**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

let currentStatus = 'desconocido';
const listeners = new Set();

ipcRenderer.on('update:status', (_e, status) => {
  currentStatus = status;
  for (const cb of listeners) { try { cb(status); } catch (_) {} }
});

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.sendSync('app:getVersion'),
  getUpdateStatus: () => currentStatus,
  onUpdateStatus: (cb) => { if (typeof cb === 'function') listeners.add(cb); },
  checkForUpdates: () => ipcRenderer.send('update:check'),
  restartToUpdate: () => ipcRenderer.send('update:restart')
});
```

- [x] **Step 2: En `desktop/main.js`, registrar el preload y el handler de versión**

Agregar el `require` arriba:
```javascript
const { ipcMain } = require('electron');
```
En `webPreferences` de la ventana:
```javascript
preload: path.join(__dirname, 'preload.js'),
```
Después de `app.whenReady().then(() => {` (antes de crear la ventana):
```javascript
ipcMain.on('app:getVersion', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('update:check', () => {});    // Task 4
ipcMain.on('update:restart', () => {});  // Task 4
```

- [x] **Step 3: Verificar**

Run: `cd desktop && npm start` → DevTools Console:
```javascript
window.electronAPI.getVersion()      // => "1.0.0"
window.electronAPI.getUpdateStatus() // => "desconocido"
```
Expected: los valores de arriba. `window.electronAPI` NO tiene otras
propiedades (ni `ipcRenderer`, ni `require`).

- [x] **Step 4: Commit**

```bash
git add desktop/preload.js desktop/main.js
git commit -m "feat(desktop): preload bridge — window.electronAPI (getVersion)"
```

---

## Task 4: `electron-updater` — estado y control

**Files:**
- Create: `desktop/updater.js`
- Modify: `desktop/main.js`

**Interfaces:**
- Consumes: `desktop/preload.js` (los canales IPC `update:check`,
  `update:restart`, y `update:status`).
- Produces: `initUpdater(win)` — arranca el chequeo automático (al inicio + cada
  4 h), traduce los eventos de `autoUpdater` a un string
  (`al-dia|descargando|lista|error`) y lo manda con
  `win.webContents.send('update:status', str)`. Conecta `update:check` a
  `autoUpdater.checkForUpdates()` y `update:restart` a
  `autoUpdater.quitAndInstall()`.

- [x] **Step 1: `desktop/updater.js`**

```javascript
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const FOUR_HOURS = 4 * 60 * 60 * 1000;

function initUpdater(win) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (status) => {
    if (!win.isDestroyed()) win.webContents.send('update:status', status);
  };

  autoUpdater.on('checking-for-update', () => send('descargando'));
  autoUpdater.on('update-available',    () => send('descargando'));
  autoUpdater.on('download-progress',   () => send('descargando'));
  autoUpdater.on('update-not-available',() => send('al-dia'));
  autoUpdater.on('update-downloaded',   () => send('lista'));
  autoUpdater.on('error', (err) => { console.error('updater', err); send('error'); });

  ipcMain.removeAllListeners('update:check');
  ipcMain.on('update:check', () => { autoUpdater.checkForUpdates().catch(() => send('error')); });
  ipcMain.removeAllListeners('update:restart');
  ipcMain.on('update:restart', () => autoUpdater.quitAndInstall());

  // En dev (sin empaquetar) autoUpdater no funciona — no romper.
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((e) => console.error('updater init', e));
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), FOUR_HOURS);
  }
}

module.exports = { initUpdater };
```

- [x] **Step 2: En `desktop/main.js`**

Quitar los stubs `ipcMain.on('update:check'...)` / `update:restart` del Task 3.
Agregar arriba: `const { initUpdater } = require('./updater');`
Después de `win.once('ready-to-show', ...)`:
```javascript
initUpdater(win);
```

- [x] **Step 3: Verificar (sin release publicada todavía)**

Run: `cd desktop && npm start`.
Expected: la app abre normal. En dev `app.isPackaged` es false → no se dispara
el chequeo automático (correcto). En DevTools:
```javascript
window.electronAPI.checkForUpdates()
```
No crashea. El status puede quedar `error` (no hay feed configurado / no
empaquetado) — es esperado en dev. Lo que importa: **la app no se rompe**.

- [x] **Step 4: Commit**

```bash
git add desktop/updater.js desktop/main.js
git commit -m "feat(desktop): electron-updater wiring (status + check + restart)"
```

---

## Task 5: Inyección de versión en el build

**Files:**
- Create: `scripts/inject-version.js`, `tests/build.test.js`
- Modify: `scripts/build.js`, `package.json`, `sw.js`

**Interfaces:**
- Produces: `injectVersion(wwwDir: string, version: string): void` en
  `scripts/inject-version.js` — reemplaza en `wwwDir`:
  - toda ocurrencia literal de `__APP_VERSION__` → `version`
  - `const APP_VERSION = '__APP_VERSION__'` ya cubierto por lo anterior en `sw.js`
  `build.js` la llama después de copiar. `package.json.version` sube a `1.0.0`.

- [x] **Step 1: `package.json` — versión y campo**

Cambiar `"version": "1.0.0"` (ya está en 1.0.0 — confirmar). Agregar más
adelante los scripts (Task 8); acá solo la versión.

- [x] **Step 2: `sw.js` — usar el token**

Reemplazar la línea 8:
```javascript
const APP_VERSION = '320';
```
por:
```javascript
const APP_VERSION = '__APP_VERSION__';
```
(El resto de `sw.js` usa la constante, no se toca.)

- [x] **Step 3: `sistema/index.html` — los `?v=`**

Reemplazar los 17 `?v=320` por `?v=__APP_VERSION__` (en el link de `main.css` y
en cada `<script src>`). El footer y el diálogo son Task 6.

- [x] **Step 4: Escribir el test (falla)**

`tests/build.test.js`:
```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { injectVersion } = require('../scripts/inject-version');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-'));
fs.mkdirSync(path.join(tmp, 'sistema'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'sw.js'), "const APP_VERSION = '__APP_VERSION__';\n");
fs.writeFileSync(path.join(tmp, 'sistema', 'index.html'),
  '<script src="/js/app.js?v=__APP_VERSION__"></script>\n<span>v__APP_VERSION__</span>\n');

injectVersion(tmp, '1.2.3');

const sw = fs.readFileSync(path.join(tmp, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(tmp, 'sistema', 'index.html'), 'utf8');
assert.strictEqual(sw, "const APP_VERSION = '1.2.3';\n", 'sw.js version not injected');
assert.ok(html.includes('app.js?v=1.2.3'), '?v= not injected');
assert.ok(html.includes('<span>v1.2.3</span>'), 'footer token not injected');
assert.ok(!html.includes('__APP_VERSION__'), 'token still present in html');
console.log('build.test.js: OK');
```

Run: `node tests/build.test.js`
Expected: FAIL — `Cannot find module '../scripts/inject-version'`.

- [x] **Step 5: `scripts/inject-version.js`**

```javascript
const fs = require('node:fs');
const path = require('node:path');

// Recorre wwwDir y reemplaza __APP_VERSION__ literal en .js/.html/.css/.json/.webmanifest
function injectVersion(wwwDir, version) {
  const exts = new Set(['.js', '.html', '.css', '.json', '.webmanifest']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!exts.has(path.extname(entry.name))) continue;
      const src = fs.readFileSync(full, 'utf8');
      if (src.includes('__APP_VERSION__')) {
        fs.writeFileSync(full, src.split('__APP_VERSION__').join(version), 'utf8');
      }
    }
  };
  walk(wwwDir);
}

module.exports = { injectVersion };
```

Run: `node tests/build.test.js`
Expected: `build.test.js: OK`.

- [x] **Step 6: Enganchar en `build.js`**

En `scripts/build.js`, después del bloque que copia assets a `www/` y antes de
la inyección de env vars (o después, no importa), agregar:
```javascript
const { injectVersion } = require('./inject-version');
const appVersion = require('../package.json').version;
injectVersion(destDir, appVersion);
console.log(`🏷️  Versión ${appVersion} inyectada en www/`);
```

- [x] **Step 7: Verificar el build entero**

Run: `npm run build`
Then:
```bash
grep -rn "__APP_VERSION__" www/ ; echo "exit: $?"
grep -rn "v=320\|APP_VERSION = '320'" www/ ; echo "exit: $?"
grep -m1 "APP_VERSION" www/sw.js
```
Expected: primer grep sin resultados (exit 1). Segundo sin resultados (exit 1).
Tercero: `const APP_VERSION = '1.0.0';`.

- [x] **Step 8: Agregar al test runner**

En `package.json`, `"test"` corre `tests/unit.test.js`. Agregar `tests/build.test.js`:
```json
"test": "node tests/unit.test.js && node tests/build.test.js"
```

Run: `npm test`
Expected: los dos pasan.

- [x] **Step 9: Commit**

```bash
git add scripts/inject-version.js scripts/build.js tests/build.test.js package.json sw.js sistema/index.html
git commit -m "feat(build): single version source — inject package.json version into www/"
```

---

## Task 6: Frontend — footer, diálogo "Acerca de", guard del SW

**Files:**
- Create: `js/desktop.js`
- Modify: `sistema/index.html`, `js/app.js`, `sw.js`

**Interfaces:**
- Consumes: `window.electronAPI` (Task 3/4), el token `__APP_VERSION__` (Task 5).
- Produces:
  - Footer con `v<version>` visible en navegador y Electron.
  - Diálogo `#about-dialog` (`[hidden]` por defecto) que se abre al clickear la
    versión del footer; muestra versión + estado del update + botones. Solo
    tiene sentido en Electron; en navegador el click no hace nada (o no se
    muestra el cursor pointer).
  - Service worker registrado SOLO si `!window.electronAPI`.

- [x] **Step 1: `sistema/index.html` — footer**

En el `<footer class="app-footer">` (línea ~549), después del bloque "HECHO EN
VENEZUELA", agregar:
```html
<div id="app-version-line" style="margin-top:0.25rem; font-size:9px; color: var(--color-text-muted); opacity:0.6; cursor: default;">
  v__APP_VERSION__
</div>
```

- [x] **Step 2: `sistema/index.html` — diálogo "Acerca de"**

Antes de `</body>` (o junto a los otros modales), agregar:
```html
<div id="about-dialog" class="modal-overlay" hidden>
  <div class="modal-content" style="max-width: 360px; text-align:center;">
    <div class="modal-header"><h3>Acerca de Casa Lucenzo</h3></div>
    <div class="modal-body" style="padding: 1.25rem 1.5rem;">
      <div style="font-size:1.1rem; font-weight:800;">Casa Lucenzo</div>
      <div id="about-version" style="font-size:0.85rem; color: var(--color-text-muted); margin:0.25rem 0 1rem;">
        Versión __APP_VERSION__ (Windows)
      </div>
      <div id="about-update-status" style="font-size:0.85rem; padding:0.6rem 0.9rem; border-radius:8px; background: rgba(255,255,255,0.04);">
        Buscando actualizaciones…
      </div>
      <div style="display:flex; gap:0.6rem; justify-content:center; margin-top:1.1rem;">
        <button id="about-check" class="btn-secondary">Buscar actualizaciones</button>
        <button id="about-restart" class="btn-primary" hidden>Reiniciar ahora</button>
      </div>
    </div>
    <div class="modal-footer">
      <button id="about-close" class="btn-secondary">Cerrar</button>
    </div>
  </div>
</div>
```
(Usar las clases de modal que ya existen en el proyecto — revisar otro modal
para los nombres exactos de `btn-primary`/`btn-secondary`/`modal-overlay`.)

- [x] **Step 3: `sistema/index.html` — cargar `js/desktop.js`**

Junto a los otros `<script src>` (después de `app.js`), agregar:
```html
<script src="/js/desktop.js?v=__APP_VERSION__"></script>
```

- [x] **Step 4: `sw.js` — agregar `desktop.js` al precache**

En el array de scripts de `sw.js` (línea ~10-28), agregar `'desktop.js'` en la
posición correspondiente (después de `app.js`), respetando el orden de
`sistema/index.html`.

- [x] **Step 5: `js/desktop.js`**

```javascript
// Cableado del shell de escritorio. No-op en un navegador normal.
(function () {
  const api = window.electronAPI;
  const versionLine = document.getElementById('app-version-line');

  // El footer ya trae el número inyectado en build; si estamos en Electron y el
  // package.json del shell difiere, preferimos el del shell.
  if (api && versionLine) {
    try { versionLine.textContent = 'v' + api.getVersion(); } catch (_) {}
  }

  if (!api) return; // navegador: nada más que hacer

  const dialog = document.getElementById('about-dialog');
  const statusEl = document.getElementById('about-update-status');
  const restartBtn = document.getElementById('about-restart');
  const checkBtn = document.getElementById('about-check');
  const closeBtn = document.getElementById('about-close');

  const STATUS_TEXT = {
    'al-dia': '✓ Estás en la última versión',
    'descargando': '⬇ Descargando actualización…',
    'lista': '✓ Actualización descargada — se instala al cerrar la app',
    'error': '⚠ No se pudo verificar (sin conexión o sin releases)',
    'desconocido': 'Verificando…'
  };
  function render(status) {
    if (statusEl) statusEl.textContent = STATUS_TEXT[status] || STATUS_TEXT.desconocido;
    if (restartBtn) restartBtn.hidden = (status !== 'lista');
  }
  render(api.getUpdateStatus());
  api.onUpdateStatus(render);

  if (versionLine) {
    versionLine.style.cursor = 'pointer';
    versionLine.addEventListener('click', () => {
      render(api.getUpdateStatus());
      if (dialog) dialog.hidden = false;
    });
  }
  if (checkBtn) checkBtn.addEventListener('click', () => { render('desconocido'); api.checkForUpdates(); });
  if (restartBtn) restartBtn.addEventListener('click', () => api.restartToUpdate());
  if (closeBtn) closeBtn.addEventListener('click', () => { if (dialog) dialog.hidden = true; });
})();
```

- [x] **Step 6: `js/app.js` — guard del service worker**

Localizar el bloque de registro (línea ~3900-3910):
```javascript
navigator.serviceWorker.register('/sw.js', { scope: '/sistema/' })
```
Envolverlo (y el `getRegistrations()` de la línea ~232 y el listener
`controllerchange` de la ~3891 si son parte del mismo setup) en:
```javascript
if (!window.electronAPI) {
  // ... todo el setup del service worker ...
}
```
Si están dispersos, la forma mínima segura: al inicio de cada bloque relacionado
al SW, `if (window.electronAPI) return;` (o no ejecutar). Confirmar leyendo el
contexto de cada una de las 3 ubicaciones.

- [x] **Step 7: Verificar en navegador**

Run: `npm run build` → servir `www/` (`npx serve www` o el devserver apuntado a
www).
Expected: footer muestra `v1.0.0`. DevTools → Application → Service Workers:
**el SW se registra** (estamos en navegador). Click en `v1.0.0`: no pasa nada
visible (no hay `electronAPI`) — aceptable.

- [x] **Step 8: Verificar en Electron**

Run: `cd desktop && npm start` (tras `npm run build` en la raíz).
Expected: footer `v1.0.0`. DevTools → Application → Service Workers: **NO hay
SW registrado**. Click en `v1.0.0`: abre el diálogo "Acerca de" con la versión y
un estado de update (probablemente "⚠ No se pudo verificar" en dev — ok). El
botón "Cerrar" lo cierra.

- [x] **Step 9: `npm test` + `npm run lint`**

Expected: pasan. (Si eslint se queja de `js/desktop.js` por `window`, ya está
en el glob `js/**` con `browserGlobals`; agregar `electronAPI` no hace falta —
se accede como `window.electronAPI`.)

- [x] **Step 10: Commit**

```bash
git add sistema/index.html js/desktop.js js/app.js sw.js
git commit -m "feat(desktop): version in footer + About dialog + SW guard"
```

---

## Task 7: electron-builder — config, icono, primer `.exe` local

**Files:**
- Create: `desktop/build/icon.png`, `desktop/.env.example`
- Modify: `desktop/package.json`

**Interfaces:**
- Consumes: `www/` (build de la raíz), `desktop/main.js` + `preload.js` +
  `updater.js`.
- Produces: `cd desktop && npm run dist` genera
  `desktop/dist/Casa Lucenzo Setup 1.0.0.exe` + `latest.yml`.

- [x] **Step 1: Icono**

Copiar `img/logo-512.png` → `desktop/build/icon.png`. electron-builder genera el
`.ico` multi-resolución desde ese PNG (necesita ser ≥ 256×256; 512 va bien).

- [x] **Step 2: `desktop/package.json` — bloque `build`**

Agregar al JSON:
```json
"build": {
  "appId": "com.casaluccenzo.pos",
  "productName": "Casa Lucenzo",
  "directories": { "output": "dist", "buildResources": "build" },
  "files": ["main.js", "preload.js", "updater.js", "package.json"],
  "extraResources": [{ "from": "../www", "to": "www" }],
  "win": { "target": "nsis", "icon": "build/icon.png" },
  "nsis": {
    "oneClick": true,
    "perMachine": false,
    "allowToChangeInstallationDirectory": false,
    "shortcutName": "Casa Lucenzo"
  },
  "publish": { "provider": "github", "owner": "casaluccenzo", "repo": "casa-luccenzo" }
}
```

- [x] **Step 3: `desktop/.env.example`**

```
# Token de GitHub con scope public_repo, para publicar releases.
# Copiar a desktop/.env (gitignored) con el valor real antes de `npm run publish`.
GH_TOKEN=
```

- [x] **Step 4: Build local (sin publicar)**

Run (desde la raíz, para tener www/ fresco): `npm run build`
Run: `cd desktop && npm run dist`
Expected: sin errores. `desktop/dist/Casa Lucenzo Setup 1.0.0.exe` existe, y
`desktop/dist/latest.yml`. Peso del `.exe`: ~70-100 MB (Electron + www/).

- [x] **Step 5: Instalar y probar en una PC Windows**

Correr el `.exe`. Pasar la advertencia de SmartScreen ("Más info" → "Ejecutar de
todas formas"). Expected: instala sin pedir admin, crea acceso directo "Casa
Lucenzo", abre el POS. Login funciona. Footer `v1.0.0`. "Acerca de" abre.

- [x] **Step 6: Commit**

```bash
git add desktop/package.json desktop/build/icon.png desktop/.env.example
git commit -m "feat(desktop): electron-builder config + NSIS installer"
```

---

## Task 8: Scripts de release (raíz)

**Files:**
- Modify: `package.json`
- Create: `docs/superpowers/plans/electron-release-runbook.md`

**Interfaces:**
- Produces: `npm run release` (desde la raíz) = sube la versión + build + deploy
  web + publish desktop. `npm run release:web` y `npm run release:desktop` por
  separado.

- [x] **Step 1: `package.json` scripts**

```json
"scripts": {
  "dev": "node scripts/devserver.js",
  "build": "node scripts/build.js",
  "test": "node tests/unit.test.js && node tests/build.test.js",
  "lint": "eslint .",
  "release:web": "npm run build && git push origin HEAD:main",
  "release:desktop": "npm run build && npm --prefix desktop run publish",
  "release": "npm version patch -m \"release v%s\" && npm run release:web && npm run release:desktop && git push --tags"
}
```

Nota: `npm version patch` sube `package.json`, hace commit y tag. `release:web`
pushea a `main` (Vercel deploya). `release:desktop` publica a GitHub Releases
(necesita `desktop/.env` con `GH_TOKEN` — electron-builder lo lee, o exportarlo
en el shell). `git push --tags` sube el tag `v1.0.1`.

- [x] **Step 2: Runbook**

`docs/superpowers/plans/electron-release-runbook.md` — pasos manuales:
1. Estar en `main`, limpio, `git pull`.
2. `desktop/.env` tiene `GH_TOKEN` válido (o `export GH_TOKEN=...`).
3. `npm run release` (o `npm version minor` para cambios grandes).
4. Verificar: Vercel deployó casalucenzo.com; GitHub Release `vX.Y.Z` tiene el
   `.exe` + `latest.yml`.
5. En una PC con la versión anterior instalada: abrir, esperar ~1 min, cerrar,
   reabrir → debe estar la versión nueva.
6. Si algo salió mal: `npm version patch` con el fix y `npm run release` de nuevo
   (versión más alta). Los instaladores viejos quedan en Releases.

- [x] **Step 3: Dry-run de `release:desktop`**

Sin `GH_TOKEN`: `npm run release:desktop` debe fallar claro en el paso de
publish (no en el build). Con `--publish never` (el `dist` script) ya se probó
en Task 7. Confirmar que el `build` corre y solo el `publish` necesita token.

- [x] **Step 4: Commit**

```bash
git add package.json docs/superpowers/plans/electron-release-runbook.md
git commit -m "feat(desktop): release scripts + runbook"
```

---

## Task 9: Primera release + verificación del ciclo de auto-update

**Files:** ninguno (operación).

**Interfaces:**
- Consumes: todo lo anterior, en `main`.
- Produces: Release `v1.0.0` publicada; ciclo de update verificado con `v1.0.1`.

- [x] **Step 1: Merge a `main`**

PR `feature/electron-desktop` → `main`, revisar el diff, mergear. `npm test` y
`npm run lint` verdes en CI.

- [x] **Step 2: Publicar `v1.0.0`**

Desde `main` limpio, con `GH_TOKEN`:
```bash
npm run build && npm --prefix desktop run publish
```
(No `npm version` — ya estamos en 1.0.0.)
Expected: GitHub Release `v1.0.0` con `Casa Lucenzo Setup 1.0.0.exe` +
`latest.yml`.

- [ ] **Step 3: Instalar en las 3 PC**

Bajar el `.exe` de la Release en cada PC, instalar, verificar que abre y el
login funciona. Anotar cuáles PC pasaron.

- [ ] **Step 4: Probar el update con `v1.0.1`**

Hacer un cambio trivial visible (ej. un espacio en el footer). Luego:
```bash
npm run release
```
Expected: Release `v1.0.1` publicada. En una PC con `v1.0.0` abierta: dentro de
~4 h (o reabrir la app para forzar el chequeo) el estado en "Acerca de" pasa a
"⬇ descargando" y luego "✓ descargada — se instala al cerrar". Cerrar y reabrir:
la versión del footer dice `v1.0.1`.

- [ ] **Step 5: Documentar el resultado**

Actualizar `electron-release-runbook.md` con cualquier ajuste que hizo falta
(rutas, timing, la PC que dio problema con SmartScreen, etc.).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/electron-release-runbook.md
git commit -m "docs: electron release runbook — verified update cycle"
```

---

## Self-Review

**1. Spec coverage:**
- §2 D1 (bundle) → Task 2 (`extraResources` www/). D2 (GitHub Releases) → Task 7
  publish config. D3 (unsigned) → Global Constraints, no cert config. D4 (silent,
  on quit) → Task 4 (`autoInstallOnAppQuit`, no forced restart). D5 (Windows) →
  Task 7 `--win nsis`. D6 (footer + About) → Task 6. D7 (ship now) → todo el plan
  usa el `www/` actual. D8 (`desktop/` same repo) → Task 1. D9 (`1.0.0`) →
  Global Constraints + Task 5. ✔
- §3 (app:// protocol, window, session) → Tasks 2, 3. ✔
- §4 (auto-update) → Task 4. ✔
- §5 (version unification) → Task 5. ✔
- §6 (release commands) → Task 8. ✔
- §7 (frontend changes) → Task 6. ✔
- §8 (desktop/ files) → Tasks 1, 3, 4, 7. ✔
- §9 (risks): CSP → resuelto en Global Constraints (no hay CSP). CORS → Task 2
  Step 4 lo verifica explícitamente. Release mala → Task 8 runbook. SmartScreen
  → Task 7 Step 5 / Task 9 Step 3. SW viejo → Task 6 Step 6. GH_TOKEN → Global
  Constraints + Task 7 Step 3. Crash del main → **gap**: el spec §9 lo pone como
  "fuera de alcance de la v1, anotado" — consistente, no se agrega task.
- §10 (testing) → Task 5 (unit de injectVersion), Tasks 2/6/7/9 (smoke manual),
  Task 6 Step 7 (regresión web). ✔
- §11 (rollout) → Task 9. ✔

**2. Placeholder scan:** Sin "TBD"/"TODO". Task 6 Step 2 dice "revisar otro modal
para los nombres exactos de las clases" — es una instrucción concreta de leer el
código existente, no un placeholder (los nombres de clase CSS del proyecto no
están en el spec y hay que tomarlos del código). Task 6 Step 6 dice "confirmar
leyendo el contexto de cada una de las 3 ubicaciones" del SW — idem, es leer
código real, con las líneas exactas dadas (232, 3891, 3904).

**3. Type consistency:**
- `window.electronAPI` métodos: `getVersion`, `getUpdateStatus`, `onUpdateStatus`,
  `checkForUpdates`, `restartToUpdate` — mismos nombres en Task 3 (definición),
  Task 4 (canales IPC `update:check`/`update:restart`/`update:status`), Task 6
  (`js/desktop.js` los consume). ✔
- Estados del update: `'al-dia'|'descargando'|'lista'|'error'|'desconocido'` —
  mismos strings en `updater.js` (Task 4) y `STATUS_TEXT` (Task 6). ✔
- `injectVersion(wwwDir, version)` — misma firma en Task 5 Step 5 (def), Step 6
  (llamada en build.js), y `tests/build.test.js`. ✔
- Token `__APP_VERSION__` — mismo literal en sw.js, sistema/index.html,
  inject-version.js, y el test. ✔

---

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-09-02-electron-desktop-plan.md`.

Dos formas de ejecutar:

1. **Subagente por task (recomendado)** — un subagente fresco por task, revisión
   entre medio. `superpowers:subagent-driven-development`.
2. **Inline** — ejecutar en esta sesión con checkpoints. `superpowers:executing-plans`.

Nota: las Tasks 5-6 tocan `sistema/index.html` / `sw.js` / `js/app.js` — mismos
archivos que la skill `verifying-production-deploys` vigila. Y el PR #18 (IVA
16%) ya está en `main`, así que la rama `feature/electron-desktop` sale de un
`main` que lo incluye.
