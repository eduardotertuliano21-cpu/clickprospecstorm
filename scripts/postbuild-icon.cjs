const { rcedit } = require('rcedit');
const path = require('path');
const fs = require('fs');

async function injectIcon() {
  const exePath = path.resolve(__dirname, '../release/win-unpacked/Click Lead Storm.exe');
  const iconPath = path.resolve(__dirname, '../public/icons/icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn('[postbuild-icon] Executable not found at:', exePath);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn('[postbuild-icon] Icon not found at:', iconPath);
    return;
  }

  console.log('[postbuild-icon] Injetando ícone oficial no executável Windows...');
  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      FileDescription: 'Click Lead Storm - Desktop CRM & Prospecção B2B',
      ProductName: 'Click Lead Storm',
      LegalCopyright: 'Copyright © 2026 Click Lead Storm'
    }
  });
  console.log('[postbuild-icon] ✅ Ícone e metadados injetados com sucesso!');
}

injectIcon().catch((err) => {
  console.error('[postbuild-icon] Erro ao injetar ícone:', err);
});
