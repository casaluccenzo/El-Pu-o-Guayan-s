// La app de escritorio toma nombre, appId y repo de releases de BRAND
// (desktop/brand-config.js). Sin BRAND tiene que quedar la config de Casa
// Lucenzo; con BRAND, nada de Casa Lucenzo puede colarse al .exe ni al repo.
const assert = require('assert');
const { buildConfig } = require('../desktop/brand-config');

const def = buildConfig(undefined);
assert.strictEqual(def.appId, 'com.casaluccenzo.pos');
assert.strictEqual(def.productName, 'Casa Lucenzo');
assert.strictEqual(def.publish.repo, 'casa-luccenzo');
assert.strictEqual(def.win.icon, 'build/icon.png');
assert.strictEqual(def.nsis.artifactName, undefined);

const ep = buildConfig('el-puno-guayanes');
assert.strictEqual(ep.appId, 'com.elpunoguayanes.pos');
assert.strictEqual(ep.productName, 'El Puño Guayanés');
assert.strictEqual(ep.extraMetadata.brandName, 'El Puño Guayanés');
assert.strictEqual(ep.nsis.shortcutName, 'El Puño Guayanés');
assert.deepStrictEqual(
  { owner: ep.publish.owner, repo: ep.publish.repo },
  { owner: 'casaluccenzo', repo: 'El-Pu-o-Guayan-s' }
);
assert.ok(ep.win.icon.endsWith('img/brands/el-puno-guayanes/logo-512.png'.split('/').join(require('path').sep)));
assert.match(ep.nsis.artifactName, /^[\x20-\x7e]+$/, 'artifactName debe ser ASCII');
assert.ok(!ep.nsis.artifactName.includes(' '), 'artifactName sin espacios');

// Un BRAND mal escrito no puede caer en silencio a Casa Lucenzo.
assert.throws(() => buildConfig('no-existe'), /no-existe/);

console.log('desktop-brand.test.js: OK');
