# Casa Lucenzo — runbook de release del escritorio

Cómo publicar una versión nueva (web + `.exe` juntos).

## Precondiciones (una sola vez)

- `desktop/.env` existe con `GH_TOKEN=<PAT>` — un token de GitHub con scope
  **`public_repo`** (Settings → Developer settings → Personal access tokens →
  Fine-grained o classic). Sin esto, `release:desktop` falla en el paso de
  publish. (electron-builder también acepta `GH_TOKEN` como variable de entorno
  del shell.)
- `cd desktop && npm install` corrido al menos una vez.
- Estás en la rama que trackea `origin/main`, limpia, con `git pull` hecho.

## Publicar

```bash
npm run release
```

Eso hace, en orden:
1. `npm run test` — unit + build test. Si falla, para.
2. `npm version patch` — sube `package.json` (ej. 1.0.0 → 1.0.1), corre el hook
   `version` que sincroniza `desktop/package.json` al mismo número, hace **un**
   commit `release v1.0.1` y el tag `v1.0.1`.
3. `npm run release:web` — `build` + `git push origin HEAD:main`. Vercel deploya
   casalucenzo.com con la versión nueva.
4. `npm run release:desktop` — `build` + `electron-builder --publish always`.
   Sube `Casa Lucenzo Setup 1.0.1.exe` + `latest.yml` + `.blockmap` a una
   **GitHub Release** `v1.0.1`.
5. `git push --tags` — sube el tag.

Para un cambio grande: `npm version minor` a mano antes, después
`npm run release:web && npm run release:desktop && git push --tags`.

## Otro negocio (BRAND)

La app de escritorio toma nombre, appId, ícono y repo de releases de
`img/brands/<BRAND>/brand.json` (bloque `desktop`, ver
`desktop/brand-config.js`). Sin `BRAND` sale Casa Lucenzo como siempre.

Para El Puño Guayanés lo más simple es GitHub Actions: en el repo,
Actions → "Release escritorio" → Run workflow. Compila en Windows y publica la
versión de `package.json` en Releases. Necesita una sola vez el secret
`SUPABASE_ANON_KEY` (y opcional `SENTRY_DSN`) en Settings → Secrets and
variables → Actions, con el mismo valor que tiene el proyecto de El Puño en
Vercel. Sin la key el workflow corta antes de publicar.

A mano, desde una PC con Windows y en una terminal con estas
variables (`BRAND` y las mismas `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`POWERSYNC_URL` y `SENTRY_DSN` que tiene el proyecto de El Puño en Vercel, porque
el `.exe` lleva una copia congelada de `www/`; sin ellas la app queda apuntando
a los valores por defecto de Casa Lucenzo):

```powershell
$env:BRAND="el-puno-guayanes"; $env:SUPABASE_URL="..."; $env:SUPABASE_ANON_KEY="..."
$env:POWERSYNC_URL="..."; $env:SENTRY_DSN="..."; $env:GH_TOKEN="<PAT con acceso a El-Pu-o-Guayan-s>"
npm run release:desktop
```

Sube `el-puno-guayanes-setup-X.Y.Z.exe` + `latest.yml` + `.blockmap` a una
Release `vX.Y.Z` de `casaluccenzo/El-Pu-o-Guayan-s`, y las PCs instaladas se
actualizan desde ahí. Para probar sin publicar: `npm run build` y
`npm --prefix desktop run dist` con las mismas variables; el instalador queda en
`desktop/dist/`. El acceso directo se llama "El Puño Guayanés".

## Verificar

- Vercel: casalucenzo.com carga, el footer dice `v1.0.1`.
- GitHub → Releases: `v1.0.1` tiene el `.exe`, `latest.yml`, `.blockmap`.
- En una PC con la versión anterior instalada: abrir la app, esperar ~1-4 min
  (o cerrar y reabrir para forzar el chequeo). En "Acerca de" (click en la
  versión del footer) el estado pasa a "⬇ Descargando…" y luego "✓ descargada —
  se instala al cerrar". Cerrar la app y reabrir → el footer dice `v1.0.1`.

## Instalación inicial en una PC nueva

1. Bajar `Casa Lucenzo Setup X.Y.Z.exe` de la última GitHub Release.
2. Ejecutarlo. Windows SmartScreen muestra "Windows protegió tu PC" →
   **Más información → Ejecutar de todas formas** (una sola vez por PC, porque el
   `.exe` no está firmado).
3. Instala sin pedir admin, crea el acceso directo "Casa Lucenzo".
4. Abrir, iniciar sesión con correo + contraseña (una vez; queda guardada).
5. De ahí en más se actualiza sola.

## Si una release sale mal

Como el auto-update se aplica **al cerrar la app**, la ventana de exposición es
corta. Arreglo:
1. Corregir el bug.
2. `npm run release` de nuevo (sube a `1.0.2`, versión más alta).
3. Las PC toman `1.0.2` al siguiente cierre.

Los instaladores viejos quedan en GitHub Releases: si hace falta volver a una
versión anterior en una PC, desinstalar y correr el `.exe` viejo (el
auto-updater lo va a querer actualizar de nuevo en el próximo chequeo — para
frenar eso hay que despublicar/borrar la Release mala).

## Errores comunes

- `Error: No published versions on GitHub` en los logs de la app instalada,
  antes de la primera Release: es esperado. Desaparece cuando publicás `v1.0.0`.
- `electron-builder ... GitHub Personal Access Token is not set`: falta
  `GH_TOKEN` (ver Precondiciones).
- El `.exe` pesa ~112 MB: normal para Electron. El auto-update baja solo el
  delta cuando el `.blockmap` lo permite.
