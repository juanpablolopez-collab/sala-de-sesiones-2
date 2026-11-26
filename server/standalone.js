'use strict';

/**
 * Arranca el mismo servidor sin Electron. Útil para probar el sistema con un
 * navegador normal o desde otro equipo de la red, sin instalar nada.
 *
 *   node server/standalone.js
 *
 * Variables de entorno opcionales:
 *   SALA_DATOS   carpeta donde se guarda sesion.json
 *   SALA_PUERTO  puerto inicial (por defecto 4700)
 *   SALA_ABRIR   '0' para no abrir el navegador automáticamente
 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const { crearServidor } = require('./index');

const dataDir = process.env.SALA_DATOS || path.join(__dirname, '..', 'datos-locales');
const puerto = Number.parseInt(process.env.SALA_PUERTO || '4700', 10);

const servidor = crearServidor({ dataDir, puerto, puertoMax: puerto + 10 });

servidor.iniciar().then((info) => {
  const mesa = `http://127.0.0.1:${info.puerto}/?k=${info.tokenMesa}`;
  console.log('');
  console.log('  Sala de Sesiones 2.0 — modo servidor local');
  console.log('  ------------------------------------------------------------');
  console.log(`  Mesa de control : ${mesa}`);
  console.log(`  Celulares       : ${info.url}/c/<clave-de-la-credencial>`);
  console.log(`  Dirección IP    : ${info.ip}:${info.puerto}`);
  console.log(`  Datos           : ${dataDir}`);
  console.log('  ------------------------------------------------------------');
  console.log('  Sin licencia, sin caducidad, sin internet. Ctrl+C para detener.');
  console.log('');

  if (process.env.SALA_ABRIR !== '0' && process.platform === 'win32') {
    try {
      spawn('cmd', ['/c', 'start', '', mesa], { detached: true, stdio: 'ignore' }).unref();
    } catch (e) { /* que el usuario abra la dirección a mano */ }
  }
}).catch((e) => {
  console.error('No se pudo iniciar:', (e && e.message) || e);
  process.exitCode = 1;
});

function detener() {
  servidor.detener().then(() => process.exit(0)).catch(() => process.exit(0));
}
process.on('SIGINT', detener);
process.on('SIGTERM', detener);
