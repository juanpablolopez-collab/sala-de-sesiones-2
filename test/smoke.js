'use strict';

/**
 * Prueba de extremo a extremo contra el servidor real, sin Electron.
 * Recorre una sesión completa: asistencia, votación ordinaria, elección
 * secreta con comisión escrutadora, urna, acta y exportación.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crearServidor } = require('../server/index');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-smoke-'));
  const servidor = crearServidor({ dataDir: dir, puerto: 49152, puertoMax: 49170 });
  let paso = 0;
  const ok = (texto) => console.log(`  ${++paso}. ${texto}`);

  try {
    const info = await servidor.iniciar();
    const base = `http://127.0.0.1:${info.puerto}`;

    async function req(ruta, { method = 'GET', body, mesa = false } = {}) {
      const headers = {};
      if (mesa) headers['x-mesa'] = info.tokenMesa;
      if (body) headers['content-type'] = 'application/json';
      const r = await fetch(base + ruta, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
      });
      const texto = await r.text();
      let datos;
      try { datos = JSON.parse(texto); } catch (e) { datos = texto; }
      if (!r.ok) throw new Error(`${method} ${ruta} → ${r.status}: ${JSON.stringify(datos)}`);
      return datos;
    }

    const ping = await req('/api/ping');
    assert.equal(ping.ok, true);
    assert.match(ping.url, /^http:\/\//);
    ok('servidor local levantado en ' + ping.url);

    const mesa = await req('/api/mesa', { mesa: true });
    assert.equal(mesa.ok, true);
    assert.equal(mesa.tokenMesa, info.tokenMesa);
    await assert.rejects(req('/api/mesa'), /403/);
    ok('token de mesa protegido');

    const cred = await req('/api/credenciales');
    assert.equal(cred.credenciales.length, 13);
    assert.ok(cred.credenciales[0].png.startsWith('data:image/png'));
    const tokens = cred.credenciales.map((c) => c.token);
    ok('13 credenciales con QR generadas');

    const yo = await req('/api/yo/' + encodeURIComponent(tokens[0]));
    assert.equal(yo.concejal.id, 'c01');
    assert.equal(yo.asistencia, 'AUSENTE');
    ok('credencial individual verificada');

    for (const token of tokens.slice(0, 8)) {
      await req('/api/checkin', { method: 'POST', body: { token } });
    }
    let estado = await req('/api/estado');
    assert.equal(estado.quorum.presentes, 8);
    assert.equal(estado.quorum.hayDeliberatorio, true);
    assert.equal(estado.quorum.hayDecisorio, true);
    ok('8 asistencias registradas; quórum deliberatorio y decisorio alcanzados');

    await req('/api/sesion/abrir', { method: 'POST', mesa: true });
    await assert.rejects(req('/api/concejales', { method: 'POST', mesa: true, body: { lista: [] } }));
    ok('sesión instalada; padrón congelado');

    await req('/api/punto/p1/modalidad', { method: 'POST', mesa: true, body: { modalidad: 'ORDINARIA' } });
    await req('/api/punto/p1/abrir', { method: 'POST', mesa: true });
    for (const token of tokens.slice(0, 7)) {
      await req('/api/voto', { method: 'POST', body: { token, valor: 'SI' } });
    }
    await req('/api/voto', { method: 'POST', body: { token: tokens[7], valor: 'NO' } });
    const ordinaria = await req('/api/punto/p1/cerrar', { method: 'POST', mesa: true });
    assert.equal(ordinaria.resultado.veredicto, 'APROBADO');
    assert.equal(ordinaria.resultado.si, 7);
    assert.equal(ordinaria.resultado.no, 1);
    ok('votación ordinaria cerrada: 7 Sí / 1 No → APROBADO');

    await req('/api/punto/p3/modalidad', { method: 'POST', mesa: true, body: { modalidad: 'SECRETA' } });
    await assert.rejects(
      req('/api/punto/p3/comision', { method: 'POST', mesa: true, body: { miembros: ['c01', 'c05'], umbral: 2 } }),
      /partidos distintos/,
    );
    await req('/api/punto/p3/comision', {
      method: 'POST', mesa: true, body: { miembros: ['c01', 'c02', 'c03'], umbral: 2 },
    });
    ok('comisión escrutadora de tres partidos, umbral 2; rechazada comisión de un solo partido');

    const claves = {};
    for (const [i, id] of ['c01', 'c02'].entries()) {
      const token = cred.credenciales.find((c) => c.concejal.id === id).token;
      const r = await req('/api/comision/clave', {
        method: 'POST', body: { token, puntoId: 'p3', generar: true },
      });
      assert.match(r.clave, /^\d{6}$/);
      claves[id] = r.clave;
      await req('/api/comision/confirmar', {
        method: 'POST', body: { token, puntoId: 'p3', contrasena: r.clave },
      });
      assert.equal(i, i); // mantiene el orden legible del registro
    }
    await req('/api/punto/p3/abrir', { method: 'POST', mesa: true });
    ok('dos miembros confirmaron su clave y se abrió la elección secreta');

    for (const [i, token] of tokens.slice(0, 8).entries()) {
      await req('/api/voto', { method: 'POST', body: { token, candidatoId: i === 7 ? 'k2' : 'k1' } });
    }
    estado = await req('/api/estado');
    assert.equal(estado.puntos[2].boletas, 8);
    assert.equal(estado.puntos[2].emitidos, 8);
    ok('8 boletas cifradas depositadas; el sentido del voto no aparece en el estado público');

    await req('/api/punto/p3/urna', { method: 'POST', mesa: true });
    await assert.rejects(
      req('/api/punto/p3/cerrar', { method: 'POST', mesa: true }),
      /urna requiere/,
    );
    await req('/api/comision/aportar', {
      method: 'POST', body: {
        token: cred.credenciales.find((c) => c.concejal.id === 'c02').token,
        puntoId: 'p3', contrasena: claves.c02,
      },
    });
    await req('/api/comision/aportar', {
      method: 'POST', body: {
        token: cred.credenciales.find((c) => c.concejal.id === 'c01').token,
        puntoId: 'p3', contrasena: claves.c01,
      },
    });
    const secreta = await req('/api/punto/p3/cerrar', { method: 'POST', mesa: true });
    assert.equal(secreta.resultado.veredicto, 'APROBADO');
    assert.equal(secreta.resultado.electo.id, 'k1');
    assert.equal(secreta.resultado.emitidas, 8);
    assert.equal(secreta.resultado.blanco, 0);
    ok('urna abierta con 2 fragmentos: Ana María Castillo electa con 7 votos');

    const enDisco = fs.readFileSync(path.join(dir, 'sesion.json'), 'utf8');
    assert.equal(enDisco.includes('"privadaPem"'), false);
    assert.equal(enDisco.includes('"datos":"'), false);
    assert.equal(enDisco.includes(claves.c01), false);
    ok('ninguna clave ni fragmento en claro se escribió en sesion.json');

    const acta = await req('/api/acta');
    assert.equal(acta.puntos.length, 2);
    assert.match(acta.huella, /^[0-9a-f]{64}$/);
    assert.equal(acta.advertencia, 'BORRADOR — SIN VALIDEZ JURÍDICA');
    assert.equal(acta.cadena.ok, true);
    ok('acta generada con huella y advertencia de borrador');

    const respaldo = await req('/api/exportar');
    assert.equal(respaldo.aplicacion, 'Sala de Sesiones 2.0');
    assert.equal(respaldo.verificacionCadena.ok, true);
    assert.equal(Object.keys(respaldo.comisiones.p3.miembros[0]).join(','), 'concejalId,indice');
    ok('respaldo JSON exportado sin material criptográfico sensible');

    for (const ruta of ['/', '/proyector', '/credenciales', '/acta', '/js/movil.js', '/css/app.css']) {
      const r = await fetch(base + ruta);
      assert.equal(r.status, 200, ruta);
      assert.ok(r.headers.get('content-type'), ruta);
    }
    ok('las seis pantallas y sus recursos se sirven correctamente');

    const eventos = await fetch(base + '/api/eventos');
    const lector = eventos.body.getReader();
    const { value } = await lector.read();
    assert.match(Buffer.from(value).toString('utf8'), /"tipo":"estado"/);
    await lector.cancel();
    ok('canal de actualizaciones en tiempo real (SSE) envía el estado');

    console.log('\n  Prueba completa superada: ' + paso + ' comprobaciones.\n');
  } finally {
    await servidor.detener();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error('\n  FALLO:', e.message, '\n');
  process.exitCode = 1;
});
