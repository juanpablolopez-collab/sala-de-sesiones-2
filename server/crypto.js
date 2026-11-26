'use strict';

/**
 * Criptografía de la urna secreta.
 *
 * Modelo ( igual que una urna física ):
 *   1. Al designar la comisión se genera un par RSA-3072 para ESE punto.
 *      La pública queda visible; la privada se cifra con una clave maestra.
 *   2. La maestra se reparte con Shamir k-de-n entre los miembros de la comisión.
 *      Un miembro solo nunca puede abrir la urna.
 *   3. Cada fragmento se cifra con una contraseña que elige el miembro y que
 *      no se guarda en ninguna parte.
 *   4. Cada boleta se cifra con AES-256-GCM usando una clave efímera distinta,
 *      y esa clave se envuelve con la pública de la comisión.
 *
 * Lo que SÍ garantiza: el archivo de datos por sí solo no abre la urna.
 * Lo que NO garantiza: durante el escrutinio la clave existe en memoria del
 * proceso. Un atacante con control del proceso en ese instante podría verla.
 * Por eso el acta se marca como BORRADOR SIN VALIDEZ JURÍDICA.
 */
const crypto = require('crypto');

/* ─── GF(256) para Shamir ─── */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function tablas() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0);
    x &= 0xff;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const gdiv = (a, b) => {
  if (!b) throw new Error('División por cero en GF(256)');
  return a === 0 ? 0 : EXP[LOG[a] + 255 - LOG[b]];
};

/** Reparte un secreto en n fragmentos; hacen falta k. */
function dividirSecreto(secreto, n, k) {
  if (!Buffer.isBuffer(secreto) || !secreto.length) throw new Error('El secreto está vacío');
  if (!Number.isInteger(n) || !Number.isInteger(k)) throw new Error('n y k deben ser enteros');
  if (k < 2) throw new Error('El umbral mínimo es 2');
  if (k > n) throw new Error('El umbral no puede superar el número de miembros');
  if (n > 255) throw new Error('Máximo 255 fragmentos');

  const salidas = Array.from({ length: n }, (_, i) => ({
    indice: i + 1,
    bytes: Buffer.alloc(secreto.length),
  }));

  for (let pos = 0; pos < secreto.length; pos++) {
    const coef = [secreto[pos], ...crypto.randomBytes(k - 1)];
    for (const s of salidas) {
      let y = 0;
      for (let g = coef.length - 1; g >= 0; g--) y = gmul(y, s.indice) ^ coef[g];
      s.bytes[pos] = y;
    }
  }
  return salidas.map((s) => ({ indice: s.indice, datos: s.bytes.toString('hex') }));
}

/** Reconstruye el secreto por interpolación de Lagrange en x = 0. */
function reconstruirSecreto(fragmentos) {
  if (!Array.isArray(fragmentos) || fragmentos.length < 2) {
    throw new Error('Se requieren al menos 2 fragmentos');
  }
  const ps = fragmentos.map((f) => ({
    x: Number(f && f.indice),
    y: Buffer.from(String((f && f.datos) || ''), 'hex'),
  }));
  const vistos = new Set();
  for (const p of ps) {
    if (!Number.isInteger(p.x) || p.x < 1 || p.x > 255) throw new Error('Índice de fragmento inválido');
    if (vistos.has(p.x)) throw new Error('Fragmento repetido');
    vistos.add(p.x);
  }
  const len = ps[0].y.length;
  if (!len || ps.some((p) => p.y.length !== len)) throw new Error('Fragmentos de longitud distinta');

  const out = Buffer.alloc(len);
  for (let pos = 0; pos < len; pos++) {
    let acc = 0;
    for (let i = 0; i < ps.length; i++) {
      let num = 1;
      let den = 1;
      for (let j = 0; j < ps.length; j++) {
        if (i === j) continue;
        num = gmul(num, ps[j].x);
        den = gmul(den, ps[i].x ^ ps[j].x);
      }
      acc ^= gmul(ps[i].y[pos], gdiv(num, den));
    }
    out[pos] = acc;
  }
  return out;
}

/* ─── Par de claves de la comisión ─── */
function generarParComision() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicaPem: publicKey, privadaPem: privateKey };
}

/* ─── AES-256-GCM ─── */
function cifrar(textoPlano, clave32) {
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave32, nonce);
  const datos = Buffer.concat([c.update(Buffer.from(textoPlano, 'utf8')), c.final()]);
  return {
    cifrado: datos.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
  };
}

function descifrar(paquete, clave32) {
  if (!paquete || !paquete.cifrado || !paquete.nonce || !paquete.tag) {
    throw new Error('Paquete cifrado incompleto');
  }
  const d = crypto.createDecipheriv('aes-256-gcm', clave32, Buffer.from(paquete.nonce, 'base64'));
  d.setAuthTag(Buffer.from(paquete.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(paquete.cifrado, 'base64')), d.final()]).toString('utf8');
}

/** Envuelve/desenvuelve la clave efímera de una boleta con RSA-OAEP-SHA256. */
function envolverClave(clave32, publicaPem) {
  return crypto.publicEncrypt(
    { key: publicaPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    clave32,
  ).toString('base64');
}

function desenvolverClave(envuelta, privadaPem) {
  return crypto.privateDecrypt(
    { key: privadaPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envuelta, 'base64'),
  );
}

/** Deriva una clave desde la contraseña del miembro (PBKDF2-SHA256, 210k iteraciones). */
function claveDe(contrasena, salBuffer, proposito) {
  return crypto.pbkdf2Sync(
    String(contrasena),
    Buffer.concat([salBuffer, Buffer.from(`sala-de-sesiones/${proposito}`, 'utf8')]),
    210000, 32, 'sha256',
  );
}

function protegerFragmento(fragmento, contrasena, proposito = 'fragmento') {
  if (String(contrasena || '').length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  const sal = crypto.randomBytes(16);
  const clave = claveDe(contrasena, sal, proposito);
  try {
    return { ...cifrar(JSON.stringify(fragmento), clave), sal: sal.toString('base64'), kdf: 'pbkdf2-sha256-210k' };
  } finally {
    clave.fill(0);
  }
}

function abrirFragmento(protegido, contrasena, proposito = 'fragmento') {
  if (!protegido || !protegido.sal) throw new Error('Fragmento protegido incompleto');
  const clave = claveDe(contrasena, Buffer.from(protegido.sal, 'base64'), proposito);
  try {
    return JSON.parse(descifrar(protegido, clave));
  } finally {
    clave.fill(0);
  }
}

/** Sella una boleta: nadie puede vinclarla con quien la depositó. */
function sellarBoleta(contenido, publicaPem) {
  const efimera = crypto.randomBytes(32);
  try {
    const paquete = cifrar(JSON.stringify(contenido), efimera);
    return { ...paquete, claveEnvuelta: envolverClave(efimera, publicaPem) };
  } finally {
    efimera.fill(0);
  }
}

function abrirBoleta(boleta, privadaPem) {
  const efimera = desenvolverClave(boleta.claveEnvuelta, privadaPem);
  try {
    return JSON.parse(descifrar(boleta, efimera));
  } finally {
    efimera.fill(0);
  }
}

/** Mejora: cierre el material sensible cuando ya no hace falta. */
function limpiar(buffer) {
  if (Buffer.isBuffer(buffer)) buffer.fill(0);
}

module.exports = {
  dividirSecreto, reconstruirSecreto, generarParComision,
  cifrar, descifrar, envolverClave, desenvolverClave,
  protegerFragmento, abrirFragmento, sellarBoleta, abrirBoleta, limpiar,
};
