'use strict';

/** Pruebas de la lógica que decide el resultado. Se ejecutan con `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const core = require('../server/core');
const cripto = require('../server/crypto');
const { Estado, SEMILLA } = require('../server/state');

const cfg = {
  total: 13,
  delibNum: 1, delibDen: 4,
  deciNum: 1, deciDen: 2,
  califNum: 2, califDen: 3,
  impedimentoReduceBase: false,
};

const votos = (...valores) => valores.map((valor) => ({ valor }));

test('umbrales derivados del padrón de 13 concejales', () => {
  assert.deepEqual(core.umbrales(cfg), {
    total: 13, deliberatorio: 4, decisorio: 7, calificada: 9,
  });
  const q = core.estadoQuorum(cfg, 6);
  assert.equal(q.hayDeliberatorio, true);
  assert.equal(q.hayDecisorio, false);
  assert.equal(q.faltanDecisorio, 1);
  assert.equal(core.estadoQuorum(cfg, 7).hayDecisorio, true);
});

test('la base de cálculo respeta la regla de impedimentos', () => {
  assert.equal(core.baseCalculo(cfg, 3), 13);
  assert.equal(core.baseCalculo({ ...cfg, impedimentoReduceBase: true }, 3), 10);
  assert.equal(core.votosRequeridos(cfg, 'ABSOLUTA', 3), 7);
  assert.equal(core.votosRequeridos({ ...cfg, impedimentoReduceBase: true }, 'ABSOLUTA', 3), 6);
  assert.equal(core.votosRequeridos(cfg, 'CALIFICADA'), 9);
  assert.equal(core.votosRequeridos(cfg, 'SIMPLE'), null);
});

test('escrutinio por mayoría simple y absoluta', () => {
  const simple = core.escrutar(cfg, 'SIMPLE', votos('SI', 'SI', 'NO', 'ABSTENCION'));
  assert.equal(simple.veredicto, 'APROBADO');
  assert.deepEqual([simple.si, simple.no, simple.abstencion, simple.emitidos], [2, 1, 1, 4]);

  assert.equal(core.escrutar(cfg, 'SIMPLE', votos('SI', 'NO')).veredicto, 'EMPATE');
  assert.equal(core.escrutar(cfg, 'SIMPLE', votos('NO', 'NO')).veredicto, 'NEGADO');
  assert.equal(core.escrutar(cfg, 'ABSOLUTA', votos('SI', 'SI', 'SI', 'SI', 'SI', 'SI')).veredicto, 'NEGADO');
  const absoluta = core.escrutar(cfg, 'ABSOLUTA', votos(...Array(7).fill('SI')));
  assert.equal(absoluta.veredicto, 'APROBADO');
  assert.match(absoluta.formula, /base=13/);
  assert.equal(core.escrutar(cfg, 'ABSOLUTA', []).veredicto, 'NEGADO');
});

test('escrutinio de elección secreta: electo, empate y boleta en blanco', () => {
  const candidatos = [
    { id: 'k1', nombre: 'Ana' },
    { id: 'k2', nombre: 'Luis' },
  ];
  const ganador = core.escrutarEleccion(cfg, 'ABSOLUTA',
    [
      ...Array(7).fill({ candidatoId: 'k1' }),
      ...Array(2).fill({ candidatoId: 'k2' }),
      { candidatoId: null },
    ], candidatos);
  assert.equal(ganador.veredicto, 'APROBADO');
  assert.equal(ganador.electo.id, 'k1');
  assert.equal(ganador.blanco, 1);
  assert.equal(ganador.requeridos, 7);

  const simple = core.escrutarEleccion(cfg, 'SIMPLE',
    [{ candidatoId: 'k1' }, { candidatoId: 'k1' }, { candidatoId: 'k2' }], candidatos);
  assert.equal(simple.veredicto, 'APROBADO');
  assert.equal(simple.requeridos, 2);

  const empate = core.escrutarEleccion(cfg, 'SIMPLE',
    [{ candidatoId: 'k1' }, { candidatoId: 'k2' }], candidatos);
  assert.equal(empate.veredicto, 'EMPATE');
  assert.equal(core.escrutarEleccion(cfg, 'SIMPLE', [{ candidatoId: null }], candidatos).veredicto, 'NEGADO');
});

test('validación de reglas acepta la configuración de demostración', () => {
  assert.deepEqual(core.validarConfig(cfg), []);
  assert.match(core.validarConfig({ ...cfg, califNum: 3, califDen: 2 })[0], /mayor que 1/);
  assert.deepEqual(core.modalidadesPermitidas('ELECCION'), ['SECRETA', 'NOMINAL', 'ORDINARIA']);
  assert.deepEqual(core.modalidadesPermitidas('INFORMATIVO'), []);
});

test('Shamir: hacen falta k fragmentos y los fragmentos correctos reconstruyen', () => {
  const secreto = Buffer.from('clave maestra de prueba 12345678901234567890');
  const partes = cripto.dividirSecreto(secreto, 5, 3);
  assert.equal(partes.length, 5);
  assert.deepEqual(cripto.reconstruirSecreto([partes[4], partes[1], partes[2]]), secreto);
  assert.notDeepEqual(cripto.reconstruirSecreto([partes[0], partes[1]]), secreto);
  assert.throws(() => cripto.dividirSecreto(secreto, 2, 3), /umbral/i);
});

test('la clave del miembro protege su fragmento', () => {
  const fragmento = { indice: 1, datos: 'deadbeef' };
  const protegido = cripto.protegerFragmento(fragmento, 'clave-secreta');
  assert.equal(JSON.stringify(protegido).includes('deadbeef'), false);
  assert.deepEqual(cripto.abrirFragmento(protegido, 'clave-secreta'), fragmento);
  assert.throws(() => cripto.abrirFragmento(protegido, 'clave-equivocada'));
});

test('la boleta secreta se sella y solo se abre con la privada de la comisión', () => {
  const { publicaPem, privadaPem } = cripto.generarParComision();
  const contenido = { candidatoId: 'k2', ronda: 1 };
  const boleta = cripto.sellarBoleta(contenido, publicaPem);
  assert.equal(JSON.stringify(boleta).includes('candidatoId'), false);
  assert.deepEqual(cripto.abrirBoleta(boleta, privadaPem), contenido);

  const otra = cripto.generarParComision();
  assert.throws(() => cripto.abrirBoleta(boleta, otra.privadaPem));
});

test('el estado de demostración arranca completo y sobrevive a un reinicio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-demo-'));
  try {
    const e = new Estado(dir);
    assert.equal(e.d.concejales.length, 13);
    assert.equal(e.d.puntos.length, 3);
    assert.equal(Object.keys(e.d.credenciales).length, 13);
    assert.equal(e.d.puntos[2].tipo, 'ELECCION');

    const token = e.tokenDe(e.d.concejales[0].id);
    assert.ok(token);
    assert.equal(e.verificarCredencial(token).id, e.d.concejales[0].id);
    assert.equal(e.verificarCredencial(token + 'x'), null);

    e.registrar('PRUEBA', 'Sesion', 's1', { dato: 1 });
    assert.equal(e.verificarCadena().ok, true);
    assert.equal(e.guardar(), true);

    const segunda = new Estado(dir);
    assert.equal(segunda.d.concejales.length, 13);
    assert.equal(segunda.verificarCadena().ok, true);
    assert.equal(segunda.verificarCredencial(token).id, e.d.concejales[0].id);

    segunda.reiniciar();
    assert.equal(segunda.d.sesion.estado, 'PROGRAMADA');
    assert.deepEqual(segunda.d.asistencia, {});
    // Las hojas impresas siguen sirviendo después de «empezar de cero».
    assert.equal(segunda.verificarCredencial(token).id, e.d.concejales[0].id);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('las credenciales impresas por la versión anterior siguen siendo válidas', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sala-legacy-'));
  try {
    const dir = path.join(raiz, 'sala-de-sesiones-2');
    const secretoViejo = 'a'.repeat(64);
    const sesionVieja = 's1794403411211';
    const vieja = {
      version: 1,
      secreto: secretoViejo,
      sesion: { id: sesionVieja },
      concejales: SEMILLA.map(([apellido, nombre, partido], i) => ({
        id: `c${String(i + 1).padStart(2, '0')}`, apellido, nombre, partido,
      })),
      credenciales: {},
    };
    for (const c of vieja.concejales) {
      const nonce = crypto.randomBytes(8).toString('hex');
      const payload = `${c.id}.${sesionVieja}.${nonce}`;
      const firma = crypto.createHmac('sha256', secretoViejo)
        .update(payload).digest('hex').slice(0, 16);
      vieja.credenciales[`${nonce}${firma}`] = {
        concejalId: c.id, sesionId: sesionVieja, nonce,
      };
    }
    fs.writeFileSync(path.join(raiz, 'sesion.json'), JSON.stringify(vieja));

    const estado = new Estado(dir);
    assert.equal(estado.credencialesAnteriores, 13);
    const tokenAnterior = Object.keys(vieja.credenciales)[0];
    assert.equal(estado.verificarCredencial(tokenAnterior).id, 'c01');
    const tokenNuevo = estado.tokenDe('c01');
    assert.notEqual(tokenNuevo, tokenAnterior);
    assert.equal(estado.verificarCredencial(tokenNuevo).id, 'c01');
    assert.equal(Object.keys(estado.d.credenciales).length, 26);

    // La importación debe sobrevivir a un reinicio sin volver a duplicar claves.
    const reiniciado = new Estado(dir);
    assert.equal(reiniciado.verificarCredencial(tokenAnterior).id, 'c01');
    assert.equal(Object.keys(reiniciado.d.credenciales).length, 26);
    assert.equal(reiniciado.credencialesAnteriores, 13);

    // Un cambio de padrón sí invalida las hojas anteriores.
    reiniciado.reemplazarPadron([{ apellido: 'Nuevo', nombre: 'Concejal', partido: 'X' }]);
    assert.equal(reiniciado.verificarCredencial(tokenAnterior), null);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('el puesto del concejal envía su credencial en todas las acciones', async () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'common.js'), 'utf8');
  let captura = null;
  const entorno = {
    window: {},
    location: { search: '', pathname: '/c/clave-de-la-credencial' },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    URLSearchParams,
    fetch: async (ruta, opciones) => {
      captura = { ruta, opciones };
      return { ok: true, json: async () => ({}) };
    },
    setInterval: () => 0,
    setTimeout, clearTimeout, console,
    document: {
      getElementById: () => null,
      createElement: () => ({}),
      body: { appendChild() {} },
    },
  };
  vm.createContext(entorno);
  vm.runInContext(codigo, entorno);

  await entorno.window.SALA.post('/api/checkin');
  assert.equal(captura.ruta, '/api/checkin');
  assert.deepEqual(JSON.parse(captura.opciones.body), { token: 'clave-de-la-credencial' });

  await entorno.window.SALA.post('/api/voto', { valor: 'SI' });
  assert.deepEqual(JSON.parse(captura.opciones.body), {
    valor: 'SI', token: 'clave-de-la-credencial',
  });
});
