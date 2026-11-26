'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Padrón de demostración. Se reemplaza completo desde la mesa antes de abrir. */
const SEMILLA = [
  ['Arboleda Ruiz', 'Marcela', 'Partido Verde'],
  ['Benavides Loaiza', 'Hernán', 'Conservador'],
  ['Caicedo Muñoz', 'Diana', 'Liberal'],
  ['Chaguendo Paz', 'Óscar', 'Alianza Social'],
  ['Delgado Vivas', 'Lucía', 'Partido Verde'],
  ['Erazo Bolaños', 'Ramiro', 'Conservador'],
  ['Fernández Tobar', 'Paula', 'Liberal'],
  ['Gómez Idrobo', 'Andrés', 'Cambio Radical'],
  ['Hurtado Mera', 'Sandra', 'Alianza Social'],
  ['Jiménez Pantoja', 'Carlos', 'Conservador'],
  ['López Astudillo', 'Natalia', 'Liberal'],
  ['Muñoz Certuche', 'Julián', 'Cambio Radical'],
  ['Ortega Zambrano', 'Beatriz', 'Partido Verde'],
];

const PUNTOS = [
  {
    titulo: 'Proyecto de acuerdo 012 de 2026 — Presupuesto de inversión',
    tipo: 'PROYECTO_ACUERDO', mayoria: 'SIMPLE',
  },
  {
    titulo: 'Proyecto de acuerdo 013 de 2026 — Plan Municipal de Movilidad',
    tipo: 'PROYECTO_ACUERDO', mayoria: 'ABSOLUTA',
  },
  {
    titulo: 'Elección de Personero Municipal',
    tipo: 'ELECCION', mayoria: 'ABSOLUTA',
    candidatos: [
      { id: 'k1', nombre: 'Ana María Castillo', cargo: 'Candidata A' },
      { id: 'k2', nombre: 'Luis Eduardo Prado', cargo: 'Candidato B' },
      { id: 'k3', nombre: 'Sofía Bermúdez', cargo: 'Candidata C' },
    ],
  },
];

const CANDIDATOS_DEMO = ['Ana María Castillo', 'Luis Eduardo Prado', 'Sofía Bermúdez'];

function estadoInicial() {
  const concejales = SEMILLA.map((c, i) => ({
    id: `c${String(i + 1).padStart(2, '0')}`,
    apellido: c[0],
    nombre: c[1],
    partido: c[2],
    activo: true,
  }));

  return {
    version: 2,
    creadoAt: new Date().toISOString(),
    secreto: crypto.randomBytes(32).toString('hex'),
    config: {
      nombreCorporacion: 'Concejo Municipal',
      municipio: 'Popayán',
      total: concejales.length,
      delibNum: 1, delibDen: 4,
      deciNum: 1, deciDen: 2,
      califNum: 2, califDen: 3,
      impedimentoReduceBase: false,
      repeticionesEmpate: 1,
    },
    concejales,
    sesion: {
      id: `s${Date.now()}`,
      numero: 42,
      anio: new Date().getFullYear(),
      tipo: 'ORDINARIA',
      fecha: new Date().toISOString(),
      lugar: 'Recinto del Concejo',
      estado: 'PROGRAMADA',
      horaInicio: null,
      horaFin: null,
      snapshotOrdenDia: null,
      snapshotConfig: null,
    },
    puntos: PUNTOS.map((p, i) => ({
      id: `p${i + 1}`,
      orden: i + 1,
      titulo: p.titulo,
      tipo: p.tipo,
      mayoria: p.mayoria,
      modalidad: null,
      estado: 'PENDIENTE',
      ronda: 1,
      resultado: null,
      candidatos: (p.candidatos || []).map((c) => ({ ...c })),
    })),
    asistencia: {},
    credenciales: {},
    votos: {},
    impedimentos: {},
    urna: {},          // puntoId -> [boletas selladas], SIN vínculo con el emisor
    participacion: {}, // puntoId -> { concejalId: hora }, SIN el sentido del voto
    comisiones: {},    // puntoId -> comisión escrutadora (sin claves en claro)
    log: [],
  };
}

/** Normaliza un estado leído del disco, tolerando archivos incompletos o viejos. */
function normalizar(d) {
  const base = estadoInicial();
  if (!d || typeof d !== 'object') return base;
  const out = { ...base, ...d };
  out.version = 2;
  out.config = { ...base.config, ...(d.config || {}) };
  out.sesion = { ...base.sesion, ...(d.sesion || {}) };
  out.concejales = Array.isArray(d.concejales) ? d.concejales : base.concejales;
  out.puntos = Array.isArray(d.puntos) ? d.puntos : base.puntos;
  for (const k of ['asistencia', 'credenciales', 'votos', 'impedimentos', 'urna', 'participacion', 'comisiones']) {
    if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {};
  }
  out.log = Array.isArray(d.log) ? d.log : [];
  for (const p of out.puntos) {
    if (!Array.isArray(p.candidatos)) p.candidatos = [];
    if (!p.ronda) p.ronda = 1;
  }
  // Los fragmentos en claro y las copias pendientes NUNCA deben sobrevivir en disco.
  for (const com of Object.values(out.comisiones)) {
    for (const m of com.miembros || []) {
      delete m.pendiente;
      delete m.copiaPendiente;
      if (m.confirmada === undefined) m.confirmada = !!m.protegido;
    }
  }
  if (!/^[0-9a-f]{64}$/i.test(String(out.secreto || ''))) {
    out.secreto = crypto.randomBytes(32).toString('hex');
  }
  return out;
}

class Estado {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.archivo = path.join(dataDir, 'sesion.json');
    this.backup = path.join(dataDir, 'sesion.json.bak');
    this.contadorGuardados = 0;
    this.cargar();
  }

  cargar() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    let datos = null;
    let origen = 'nuevo';
    for (const [ruta, etiqueta] of [[this.archivo, 'principal'], [this.backup, 'respaldo']]) {
      try {
        const texto = fs.readFileSync(ruta, 'utf8');
        datos = normalizar(JSON.parse(texto));
        origen = etiqueta;
        break;
      } catch (e) { /* se prueba el siguiente */ }
    }
    this.d = datos || estadoInicial();
    this.origen = origen;
    this.importarCredencialesAnteriores();
    this.asegurarCredenciales();
    this.guardar();
  }

  /**
   * La versión anterior guardaba el estado en la carpeta padre del usuario.
   * Sus hojas ya impresas siguen sirviendo: se importan como credenciales
   * heredadas, verificadas con el HMAC de aquella versión (la clave se usaba
   * como texto, no como bytes). Nunca se mezclan con las nuevas: la mesa
   * imprime siempre claves recién generadas.
   */
  importarCredencialesAnteriores() {
    const rutas = [
      path.join(path.dirname(this.dataDir), 'sesion.json'),
      path.join(this.dataDir, 'sesion-anterior.json'),
    ];
    let importadas = 0;
    for (const ruta of rutas) {
      let vieja;
      try { vieja = JSON.parse(fs.readFileSync(ruta, 'utf8')); }
      catch (e) { continue; }
      if (!vieja || vieja.version !== 1 || !vieja.sesion?.id || !vieja.credenciales) continue;
      if (!/^[0-9a-f]{64}$/i.test(String(vieja.secreto || ''))) continue;
      for (const [token, cred] of Object.entries(vieja.credenciales)) {
        const t = String(token).toLowerCase();
        if (!/^[0-9a-f]{32}$/.test(t) || !cred || cred.sesionId !== vieja.sesion.id) continue;
        if (this.d.credenciales[t]) continue;
        const actual = this.d.concejales.find((c) => c.id === cred.concejalId);
        if (!actual) continue;
        const anterior = (Array.isArray(vieja.concejales) ? vieja.concejales : [])
          .find((c) => c.id === cred.concejalId);
        // Si el padrón cambió, una credencial antigua podría identificar a otra
        // persona: en ese caso se descarta.
        if (anterior && (anterior.apellido !== actual.apellido || anterior.nombre !== actual.nombre)) continue;
        const payload = `${cred.concejalId}.${cred.sesionId}.${cred.nonce}`;
        const firma = crypto.createHmac('sha256', String(vieja.secreto))
          .update(payload).digest('hex').slice(0, 16);
        if (!t.endsWith(firma)) continue;
        this.d.credenciales[t] = {
          concejalId: cred.concejalId,
          sesionId: cred.sesionId,
          nonce: cred.nonce,
          creadoAt: cred.creadoAt || new Date().toISOString(),
          legacy: true,
          importadoEn: new Date().toISOString(),
        };
        importadas++;
      }
      if (importadas) break;
    }
    const yaImportadas = Number(this.d.credencialesAnteriores || 0) || 0;
    this.credencialesAnteriores = Math.max(yaImportadas, importadas);
    this.d.credencialesAnteriores = this.credencialesAnteriores;
    return importadas;
  }

  /** Escritura atómica: nunca se deja un sesion.json a medias. */
  guardar({ backup = false } = {}) {
    try {
      const tmp = `${this.archivo}.tmp`;
      if (backup && fs.existsSync(this.archivo)) {
        try { fs.copyFileSync(this.archivo, this.backup); } catch (e) { /* no bloquea */ }
      }
      fs.writeFileSync(tmp, JSON.stringify(this.d, null, 2), 'utf8');
      try {
        fs.renameSync(tmp, this.archivo);
      } catch (e) {
        fs.copyFileSync(tmp, this.archivo);
        fs.unlinkSync(tmp);
      }
      this.contadorGuardados++;
      if (this.contadorGuardados % 25 === 0) {
        try { fs.copyFileSync(this.archivo, this.backup); } catch (e) { /* no bloquea */ }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Borra asistencia, votos y resultados; conserva padrón, orden del día y configuración. */
  reiniciar() {
    const cfg = { ...this.d.config };
    const concejales = this.d.concejales.map((c) => ({ ...c }));
    const puntos = this.d.puntos.map((p) => ({
      ...p, modalidad: null, estado: 'PENDIENTE', ronda: 1, resultado: null,
      candidatos: (p.candidatos || []).map((c) => ({ ...c })),
    }));
    const sesion = {
      ...this.d.sesion, estado: 'PROGRAMADA', horaInicio: null, horaFin: null,
      snapshotOrdenDia: null, snapshotConfig: null,
    };
    this.d = {
      ...estadoInicial(),
      secreto: this.d.secreto,
      config: cfg,
      concejales,
      puntos,
      sesion,
      // Las hojas impresas siguen sirviendo: es la misma sesión y el mismo padrón.
      credenciales: this.d.credenciales,
    };
    this.asegurarCredenciales();
    this.guardar({ backup: true });
  }

  /** Credencial por concejal y por sesión, firmada con HMAC. */
  asegurarCredenciales() {
    if (!this.d.credenciales || typeof this.d.credenciales !== 'object') this.d.credenciales = {};
    // Las heredadas se conservan, pero no cuentan como vigentes: las hojas
    // nuevas que imprima la mesa deben usar claves generadas por esta versión.
    const vigentes = new Set(Object.values(this.d.credenciales)
      .filter((v) => v && !v.legacy).map((v) => v.concejalId));
    for (const c of this.d.concejales) {
      if (vigentes.has(c.id)) continue;
      const nonce = crypto.randomBytes(8).toString('hex');
      const payload = `${c.id}.${this.d.sesion.id}.${nonce}`;
      const firma = crypto.createHmac('sha256', Buffer.from(this.d.secreto, 'hex'))
        .update(payload).digest('hex').slice(0, 16);
      this.d.credenciales[`${nonce}${firma}`] = {
        concejalId: c.id, sesionId: this.d.sesion.id, nonce, creadoAt: new Date().toISOString(),
      };
    }
  }

  verificarCredencial(token) {
    const t = String(token || '');
    const cred = this.d.credenciales[t];
    if (!cred) return null;
    // Heredada: ya se verificó su HMAC al importarla del archivo anterior.
    if (cred.legacy) return this.d.concejales.find((c) => c.id === cred.concejalId) || null;
    if (cred.sesionId !== this.d.sesion.id) return null;
    const payload = `${cred.concejalId}.${cred.sesionId}.${cred.nonce}`;
    const firma = crypto.createHmac('sha256', Buffer.from(this.d.secreto, 'hex'))
      .update(payload).digest('hex').slice(0, 16);
    if (!t.endsWith(firma)) return null;
    return this.d.concejales.find((c) => c.id === cred.concejalId) || null;
  }

  tokenDe(concejalId) {
    const tokens = Object.keys(this.d.credenciales);
    return tokens.find((t) => !this.d.credenciales[t].legacy && this.d.credenciales[t].concejalId === concejalId)
      || tokens.find((t) => this.d.credenciales[t].concejalId === concejalId)
      || null;
  }

  /** Registro de actividad encadenado (SHA-256). No sustituye una auditoría externa. */
  registrar(accion, entidad, entidadId, datos = {}) {
    const prev = this.d.log.length ? this.d.log[this.d.log.length - 1].hashActual : '0'.repeat(64);
    const seq = this.d.log.length + 1;
    const ts = new Date().toISOString();
    const cuerpo = JSON.stringify({ seq, accion, entidad, entidadId, datos, ts });
    const hashActual = crypto.createHash('sha256').update(prev + cuerpo).digest('hex');
    this.d.log.push({ seq, accion, entidad, entidadId, datos, ts, hashPrevio: prev, hashActual });
    if (this.d.log.length > 5000) this.d.log.splice(0, this.d.log.length - 5000);
  }

  verificarCadena() {
    let prev = '0'.repeat(64);
    for (const r of this.d.log) {
      const cuerpo = JSON.stringify({
        seq: r.seq, accion: r.accion, entidad: r.entidad,
        entidadId: r.entidadId, datos: r.datos, ts: r.ts,
      });
      const h = crypto.createHash('sha256').update(prev + cuerpo).digest('hex');
      if (h !== r.hashActual) return { ok: false, rotoEn: r.seq, registros: this.d.log.length };
      prev = r.hashActual;
    }
    return { ok: true, registros: this.d.log.length };
  }

  reemplazarPadron(lista) {
    this.d.concejales = lista.map((p, i) => ({
      id: `c${String(i + 1).padStart(2, '0')}`,
      apellido: String(p.apellido || '').slice(0, 60).trim(),
      nombre: String(p.nombre || '').slice(0, 60).trim(),
      partido: String(p.partido || 'Sin partido').slice(0, 60).trim(),
      activo: true,
    }));
    this.d.config.total = this.d.concejales.length;
    // Cambió el padrón: todo lo anterior deja de tener sentido.
    Object.assign(this.d, {
      asistencia: {}, votos: {}, impedimentos: {}, credenciales: {},
      urna: {}, participacion: {}, comisiones: {},
    });
    this.credencialesAnteriores = 0;
    this.d.credencialesAnteriores = 0;
    for (const p of this.d.puntos) {
      p.estado = 'PENDIENTE'; p.resultado = null; p.ronda = 1; p.modalidad = null;
    }
    this.asegurarCredenciales();
  }

  presentes() {
    return this.d.concejales.filter((c) => this.d.asistencia[c.id]?.estado === 'PRESENTE');
  }

  /** Datos de demostración útiles para la interfaz y las pruebas. */
  static candidatosDemo() { return [...CANDIDATOS_DEMO]; }
}

module.exports = { Estado, estadoInicial, normalizar, SEMILLA, PUNTOS };
