const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..');
const destDir = path.resolve(srcDir, 'www');

// List of files/directories to copy
const assetsToCopy = [
    'index.html',
    'pedido.html',
    'qr-mesa.html',
    'sistema',
    'manifest.json',
    'sw.js',
    'css',
    'js',
    'img'
];

console.log('🧹 Cleaning www folder...');
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir);

console.log('📦 Copying assets to www...');
assetsToCopy.forEach(asset => {
    const srcPath = path.join(srcDir, asset);
    const destPath = path.join(destDir, asset);

    if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath, { recursive: true });
        console.log(`  Copied: ${asset}`);
    } else {
        console.warn(`  Warning: Asset ${asset} not found!`);
    }
});

// Single version source: inject package.json version into www/ (footer, About
// dialog, ?v= cache-bust, sw.js APP_VERSION -- all via the __APP_VERSION__ token).
const { injectVersion } = require('./inject-version');
const appVersion = require('../package.json').version;
injectVersion(destDir, appVersion);
console.log(`🏷️  Versión ${appVersion} inyectada en www/`);

// Per-deployment branding (BRAND env var), same pattern as SUPABASE_URL/
// POWERSYNC_URL: this codebase now serves more than one business off the
// same Vercel project family, and "Casa Lucenzo" was hardcoded into the
// logo files and into several user-facing strings. img/brands/<BRAND>/
// holds that tenant's logo.jpg/logo-192.png/logo-512.png plus a brand.json
// with the display text; when unset, nothing here runs and Casa Lucenzo's
// own default assets/strings ship untouched.
const brand = process.env.BRAND;
if (brand) {
    const brandDir = path.join(srcDir, 'img', 'brands', brand);
    if (fs.existsSync(brandDir)) {
        for (const f of fs.readdirSync(brandDir)) {
            if (f === 'brand.json') continue;
            fs.copyFileSync(path.join(brandDir, f), path.join(destDir, 'img', f));
        }

        const brandMetaPath = path.join(brandDir, 'brand.json');
        if (fs.existsSync(brandMetaPath)) {
            const meta = JSON.parse(fs.readFileSync(brandMetaPath, 'utf8'));

            const manifestPath = path.join(destDir, 'manifest.json');
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest.name = `Sistema de Stock Fácil - ${meta.displayName}`;
            manifest.short_name = meta.shortName || manifest.short_name;
            manifest.description = meta.description || manifest.description;
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

            // "Casa Lucenzo"/"Casa Luccenzo" only ever appear as user-facing
            // copy (title, footer, About dialog) in these files -- never as
            // an identifier -- so a blanket string replace is safe here.
            // Luc{1,2}enzo covers both the correct spelling and the "Luccenzo"
            // typo that made it into some of these files.
            const textFiles = ['index.html', 'pedido.html', 'qr-mesa.html', path.join('sistema', 'index.html')];
            for (const rel of textFiles) {
                const p = path.join(destDir, rel);
                if (!fs.existsSync(p)) continue;
                let content = fs.readFileSync(p, 'utf8');
                content = content.replace(/Casa Luc{1,2}enzo/g, meta.displayName);
                fs.writeFileSync(p, content, 'utf8');
            }
            console.log(`🎨 Branding "${brand}" aplicado (${meta.displayName})`);
        } else {
            console.log(`🎨 Branding "${brand}" aplicado (solo imágenes, sin brand.json)`);
        }
    } else {
        console.warn(`⚠️ BRAND="${brand}" definido pero img/brands/${brand}/ no existe -- se usa el branding por defecto.`);
    }
}

// Perform environment variable placeholder injection for production www/ build
const supabaseBuildFile = path.join(destDir, 'js', 'supabase.js');
// The Sentry init + __SENTRY_DSN__ placeholder lives in the internal POS app
// (sistema/index.html), not the public landing page (index.html).
const indexBuildFile = path.join(destDir, 'sistema', 'index.html');

// Previously this hard-failed the whole deploy (process.exit(1)) when any of
// these three were missing on Vercel (VERCEL=1 is set for every Vercel build,
// Preview included, not just Production -- so "isProduction" was misleading).
// That's unnecessarily fragile: the runtime code already falls back cleanly
// when a placeholder is left unreplaced (js/supabase.js keeps the hardcoded
// prod URL/key; the Sentry init below has its own mock-DSN fallback), so a
// missing env var here should degrade gracefully, not take down every deploy
// on every branch until someone notices and fixes it in the Vercel dashboard.
if (!process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_URL || !process.env.SENTRY_DSN) {
    console.warn('⚠️ SUPABASE_ANON_KEY, SUPABASE_URL, or SENTRY_DSN not set for this deployment -- continuing with fallback values.');
}

if (fs.existsSync(supabaseBuildFile)) {
    const envUrl = process.env.SUPABASE_URL;
    const envKey = process.env.SUPABASE_ANON_KEY;

    if (envUrl && envKey) {
        let content = fs.readFileSync(supabaseBuildFile, 'utf8');
        content = content.replace('__SUPABASE_URL__', envUrl);
        content = content.replace('__SUPABASE_ANON_KEY__', envKey);
        fs.writeFileSync(supabaseBuildFile, content, 'utf8');
        console.log('🔒 Environment variables injected into www/js/supabase.js');
    } else {
        console.warn('⚠️ SUPABASE_URL/SUPABASE_ANON_KEY not set — leaving placeholders unreplaced (app will run in local-only mode).');
    }
}

// js/powersync/connector.js carries the same __POWERSYNC_URL__ placeholder
// pattern as supabase.js, but this injection was never wired up -- the
// placeholder was shipping to every deploy unreplaced, so PowerSync never
// connected in production (the app degrades to the Supabase-direct fallback
// paths in js/supabase.js, which is why nothing visibly broke).
const powersyncBuildFile = path.join(destDir, 'js', 'powersync', 'connector.js');
if (fs.existsSync(powersyncBuildFile)) {
    const envPowerSyncUrl = process.env.POWERSYNC_URL;

    if (envPowerSyncUrl) {
        let content = fs.readFileSync(powersyncBuildFile, 'utf8');
        content = content.replace('__POWERSYNC_URL__', envPowerSyncUrl);
        fs.writeFileSync(powersyncBuildFile, content, 'utf8');
        console.log('🔒 POWERSYNC_URL injected into www/js/powersync/connector.js');
    } else {
        console.warn('⚠️ POWERSYNC_URL not set — leaving placeholder unreplaced (PowerSync will not connect unless prefs.powerSyncUrl is set locally).');
    }
}

if (fs.existsSync(indexBuildFile)) {
    let indexContent = fs.readFileSync(indexBuildFile, 'utf8');
    const sentryDsn = process.env.SENTRY_DSN;

    // `__SENTRY_DSN__` appears three times in that file: in a comment, in the
    // assignment, and in the fallback comparison. Neither naive form works:
    //
    //   .replace()    -- substitutes only the FIRST occurrence, which is the
    //                    COMMENT. The real `var sentryDsn` kept the placeholder,
    //                    so setting SENTRY_DSN in Vercel did nothing at all,
    //                    while the build still printed "injected".
    //   .replaceAll() -- also rewrites the comparison, so the guard becomes
    //                    `if (dsn === dsn)`, which is always true and clobbers
    //                    the injected value with the hardcoded fallback.
    //
    // Anchoring on the whole assignment statement hits exactly one place and
    // leaves the comparison intact, so the fallback keeps working when unset.
    const SENTRY_ASSIGNMENT = "var sentryDsn = '__SENTRY_DSN__';";
    if (sentryDsn) {
        if (!indexContent.includes(SENTRY_ASSIGNMENT)) {
            // Fail loudly: a silent no-op here is how this broke the first time.
            console.error(`❌ SENTRY_DSN is set but the anchor was not found in ${indexBuildFile}. Did the Sentry init in sistema/index.html change? Leaving the file untouched.`);
        } else {
            indexContent = indexContent.replace(SENTRY_ASSIGNMENT, `var sentryDsn = '${sentryDsn}';`);
            fs.writeFileSync(indexBuildFile, indexContent, 'utf8');
            console.log('🛡️ SENTRY_DSN injected into www/sistema/index.html');
        }
    } else {
        // Deliberately NOT substituting a placeholder DSN here. This used to
        // fall back to 'https://mock-sentry-dsn@o0.ingest.sentry.io/0', which
        // would initialise Sentry against a project that does not exist --
        // error reporting silently dead, exactly when you need it most. Left
        // unreplaced, the page's own `if (sentryDsn === '__SENTRY_DSN__')`
        // branch takes over and uses the real hardcoded DSN.
        console.warn('⚠️ SENTRY_DSN not set -- leaving the placeholder so the page falls back to its hardcoded DSN.');
    }
}

console.log('✨ Build completed successfully! All assets are ready in www/ folder.');
