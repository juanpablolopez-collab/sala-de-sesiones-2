'use strict';

/**
 * Aplica nombre, versión e icono al ejecutable empaquetado.
 *
 * electron-builder no puede usar su propia herramienta de recursos en equipos
 * sin permisos para crear enlaces simbólicos (caso típico de Windows sin modo
 * desarrollador), así que el configuramos con `signAndEditExecutable: false`
 * y hacemos este paso con el rcedit que ya quedó en la caché.
 *
 * Después de esto hay que reconstruir el instalador desde la carpeta ya
 * empaquetada:  electron-builder --win --x64 --prepackaged dist\win-unpacked
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const raiz = path.join(__dirname, '..');
const exe = path.join(raiz, 'dist', 'win-unpacked', 'Sala de Sesiones.exe');
const icono = path.join(__dirname, 'icon.ico');

if (!fs.existsSync(exe)) {
  console.error('No existe ' + exe + '. Ejecute antes: npm run dist');
  process.exit(1);
}

const cache = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Local'),
  'electron-builder', 'Cache', 'winCodeSign');
let rcedit = null;
try {
  for (const entrada of fs.readdirSync(cache)) {
    const candidato = path.join(cache, entrada, 'rcedit-x64.exe');
    if (fs.existsSync(candidato)) { rcedit = candidato; break; }
  }
} catch (e) { /* sin caché todavía */ }

if (!rcedit) {
  console.error('No se encontró rcedit-x64.exe en ' + cache);
  process.exit(1);
}

execFileSync(rcedit, [
  exe,
  '--set-version-string', 'FileDescription', 'Sala de Sesiones',
  '--set-version-string', 'ProductName', 'Sala de Sesiones',
  '--set-version-string', 'CompanyName', 'Sala de Sesiones',
  '--set-version-string', 'OriginalFilename', 'Sala de Sesiones.exe',
  '--set-file-version', '2.0.0.0',
  '--set-product-version', '2.0.0.0',
  '--set-icon', icono,
], { stdio: 'inherit' });

console.log('Metadatos e icono aplicados a ' + exe);
console.log('Ahora reconstruya el instalador: electron-builder --win --x64 --prepackaged dist\\win-unpacked');
