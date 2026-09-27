/**
 * Local dev server for Casa Lucenzo.
 *
 * Serves the repo root, which is the SOURCE. vercel.json declares
 * `buildCommand: node scripts/build.js` + `outputDirectory: www`, so in theory
 * production serves a built copy with SUPABASE_URL / SUPABASE_ANON_KEY /
 * SENTRY_DSN substituted for their placeholders.
 *
 * That is now what actually happens. Verified 2026-08-15 against
 * https://www.casalucenzo.com/: js/supabase.js ships the real URL/key and
 * sistema/index.html ships the real Sentry DSN -- no placeholders left. (This
 * comment previously said the build was NOT running, which was true until the
 * SENTRY_DSN injection fix; don't trust either claim without re-checking the
 * real domain.)
 *
 * So local and production are NOT the same thing: this server hands you the
 * unbuilt source, which falls back to the hardcoded values in js/supabase.js,
 * while production uses whatever is set in the Vercel dashboard. As of the same
 * check those differ -- Vercel injects a legacy JWT anon key, the fallback here
 * is the newer `sb_publishable_...` one. Same project either way, but if you are
 * debugging an auth/RLS difference between local and prod, start there.
 *
 *   npm run dev   ->   http://localhost:4173
 *
 * Node core only, no dependencies.
 *
 * Heads up: that fallback points at the real production project, so this talks
 * to the production database. Read freely, write carefully.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 4173;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.wasm': 'application/wasm'
};

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(ROOT, urlPath);

    // Never serve anything outside the project root
    if (!path.resolve(filePath).startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        console.log(`404 ${urlPath}`);
        res.writeHead(404).end('Not found');
        return;
    }

    console.log(`200 ${urlPath}`);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
}).listen(PORT, () => {
    console.log(`Casa Lucenzo dev server -> http://localhost:${PORT}`);
    console.log(`  landing: http://localhost:${PORT}/`);
    console.log(`  sistema: http://localhost:${PORT}/sistema/`);
});
