const js = require('@eslint/js');

const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    caches: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    fetch: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    Audio: 'readonly',
    URL: 'readonly',
    Blob: 'readonly',
    FileReader: 'readonly',
    CustomEvent: 'readonly',
    alert: 'readonly',
    confirm: 'readonly',
    prompt: 'readonly',
    crypto: 'readonly',
    // js/*.js files are dual CommonJS/browser modules (guarded by `typeof module !== 'undefined'`)
    // to stay unit-testable under Node — see tests/unit.test.js.
    module: 'readonly',
    require: 'readonly',
    exports: 'writable',
    // Globals one of our own scripts publishes on `window` for the others to use.
    // They're real at runtime because sistema/index.html loads the owner first.
    escapeHtml: 'readonly',    // js/ui/shared.js
    showToast: 'readonly',     // js/ui.js
    StorageManager: 'readonly' // js/storage.js
};

const nodeGlobals = {
    require: 'readonly',
    module: 'writable',
    exports: 'writable',
    process: 'readonly',
    console: 'readonly',
    Buffer: 'readonly',
    __dirname: 'readonly',
    fetch: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    URL: 'readonly',
    Response: 'readonly'
};

module.exports = [
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: browserGlobals
        },
        rules: {
            // caughtErrors: 'none' -- `catch (e)` without touching `e` is the house
            // style for deliberate swallows; flagging ~40 of those buried the real hits.
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
            // The shared globals above are declared by files inside this same glob,
            // so their definition sites must not be reported as redeclarations.
            'no-redeclare': ['error', { builtinGlobals: false }],
            'no-undef': 'warn',
            // Same house style as caughtErrors:'none' above -- `catch (e) {}` is
            // a deliberate swallow, not an oversight.
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    },
    {
        // Plan B: the PowerSync client bootstrap is real ES modules (it
        // imports from the '@powersync/web' package) -- everything else
        // under js/ is script-sourceType, dual CommonJS/browser (see the
        // comment on browserGlobals above).
        files: ['js/powersync/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: browserGlobals
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
            'no-undef': 'warn',
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    },
    {
        files: ['api/**/*.js', 'lib/**/*.js', 'scripts/**/*.js', 'tools/**/*.js', 'tests/**/*.js', 'desktop/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: nodeGlobals
        },
        rules: {
            // caughtErrors: 'none' -- `catch (e)` without touching `e` is the house
            // style for deliberate swallows; flagging ~40 of those buried the real hits.
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
            'no-undef': 'warn',
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    },
    {
        // This config file itself is CommonJS and runs under Node.
        files: ['*.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: nodeGlobals
        }
    },
    {
        files: ['sw.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                self: 'readonly',
                caches: 'readonly',
                fetch: 'readonly',
                console: 'readonly'
            }
        }
    },
    {
        ignores: [
            'www/', 'node_modules/', 'whatsapp-session/', 'supabase/.temp/',
            'desktop/dist/', 'desktop/node_modules/',
            // Every dot-directory is local tooling (editor, AI skills/agents,
            // deploy, worktrees) -- all git-ignored, none of it application
            // code. Without this, `eslint .` scans their .mjs helpers and
            // drowns real findings under thousands of no-undef errors.
            '.agents/', '.claude/', '.codex/', '.gemini/', '.github/',
            '.gstack/', '.idea/', '.impeccable/', '.orchestrator/', '.vercel/', '.worktrees/'
        ]
    }
];
