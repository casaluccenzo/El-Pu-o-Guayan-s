// Config de electron-builder. Antes vivía en package.json "build", con el
// nombre "Casa Lucenzo", el appId y el repo de releases fijos: cualquier
// negocio que corriera `npm run release:desktop` terminaba publicando un .exe
// de Casa Lucenzo en casaluccenzo/casa-luccenzo, y las PCs de ese negocio se
// hubieran actualizado desde ahí.
//
// Ahora sale de la misma variable BRAND que usa scripts/build.js para la web:
// img/brands/<BRAND>/brand.json da el nombre (displayName) y su bloque
// "desktop" da appId y publishRepo; el ícono es el logo-512.png de esa carpeta.
// Sin BRAND queda exactamente la config de Casa Lucenzo de siempre.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  appId: 'com.casaluccenzo.pos',
  productName: 'Casa Lucenzo',
  owner: 'casaluccenzo',
  repo: 'casa-luccenzo',
  icon: 'build/icon.png',
  artifactName: undefined, // default de electron-builder: "Casa Lucenzo Setup X.Y.Z.exe"
  packageName: undefined // queda el "name" de package.json
};

function resolveBrand(brand, rootDir = path.join(__dirname, '..')) {
  if (!brand) return { ...DEFAULTS };

  const brandDir = path.join(rootDir, 'img', 'brands', brand);
  const metaPath = path.join(brandDir, 'brand.json');
  if (!fs.existsSync(metaPath)) {
    // A diferencia del build web (que cae al branding por defecto), acá seguir
    // de largo publicaría un .exe de Casa Lucenzo en el repo equivocado.
    throw new Error(`BRAND="${brand}" pero no existe img/brands/${brand}/brand.json`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const desktop = meta.desktop || {};
  if (!meta.displayName || !desktop.appId || !desktop.publishRepo) {
    throw new Error(`img/brands/${brand}/brand.json necesita displayName, desktop.appId y desktop.publishRepo`);
  }

  const logo = path.join(brandDir, 'logo-512.png');
  return {
    appId: desktop.appId,
    productName: meta.displayName,
    owner: desktop.publishOwner || DEFAULTS.owner,
    repo: desktop.publishRepo,
    icon: fs.existsSync(logo) ? logo : DEFAULTS.icon,
    // Nombre del .exe en ASCII y sin espacios: "El Puño Guayanés Setup.exe"
    // llega a GitHub con la ñ/é y los espacios reescritos y latest.yml deja
    // de coincidir con el asset.
    artifactName: `${brand}-setup-\${version}.\${ext}`,
    // Separa la caché del updater de la de Casa Lucenzo en la misma PC.
    packageName: `${brand}-desktop`
  };
}

function buildConfig(brand = process.env.BRAND) {
  const b = resolveBrand(brand);
  return {
    appId: b.appId,
    productName: b.productName,
    // menu.js lee brandName del package.json empaquetado para el menú y el
    // "Acerca de".
    extraMetadata: {
      brandName: b.productName,
      ...(b.packageName ? { name: b.packageName } : {})
    },
    directories: { output: 'dist', buildResources: 'build' },
    files: ['main.js', 'preload.js', 'updater.js', 'menu.js', 'package.json'],
    extraResources: [{ from: '../www', to: 'www' }],
    win: { target: 'nsis', icon: b.icon },
    nsis: {
      oneClick: true,
      perMachine: false,
      allowToChangeInstallationDirectory: false,
      shortcutName: b.productName,
      ...(b.artifactName ? { artifactName: b.artifactName } : {})
    },
    publish: {
      provider: 'github',
      owner: b.owner,
      repo: b.repo,
      releaseType: 'release'
    }
  };
}

module.exports = { buildConfig, resolveBrand };
