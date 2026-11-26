'use strict';

/**
 * Servidor local de la Sala de Sesiones.
 * Solo usa módulos incluidos en Node/Electron + `qrcode`.
 * Escucha en 0.0.0.0 para que los celulares de los concejales puedan entrar
 * por Wi-Fi. No necesita internet.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const core = require('./core');
const cripto = require('./crypto');
const { Estado } = require('./state');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const LIMITE_BODY = 512 * 1024;

/** IP de la máquina en la red local. `localhost` no sirve para los celulares. */
function ipLocal() {
  const nets = os.networkInterfaces();
  const candidatas = [];
  for (const nombre of Object.keys(nets)) {
    for (const net of nets[nombre] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      const mac = String(net.mac || '').replace(/[^0-9a-f]/gi, '');
      if (/^0{12}$/.test(mac)) continue;
      candidatas.push({ nombre, ip: net.address, mac });
    }
  }
  const privadas = candidatas.filter((c) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(c.ip));
  const elegida = privadas[0] || candidatas[0] || { ip: '127.0.0.1' };
  return elegida.ip;
}

function iguales(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function limpio(valor, max = 200) {
  return String(valor == null ? '' : valor).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function crearServidor({ dataDir, puerto = 4700, puertoMax = 4710 } = {}) {
  const estado = new Estado(dataDir);
  const tokenMesa = crypto.randomBytes(24).toString('hex');

  /** Fragmentos sin proteger: SOLO en memoria, nunca en sesion.json. */
  const pendientes = new Map();  // puntoId -> Map(concejalId -> fragmento)
  /** Fragmentos aportados en una ceremonia: SOLO en memoria. */
  const ceremonia = new Map();   // puntoId -> Map(concejalId -> fragmento)
  const clientesSSE = new Set();
  const intentos = new Map();    // control simple de reintentos

  const D = () => estado.d;
  const urlBase = (p) => `http://${ipLocal()}:${p}`;

  let puertoActivo = puerto;
  const red = () => ({ ip: ipLocal(), puerto: puertoActivo, url: urlBase(puertoActivo), offline: true });

  function difundir() {
    const carga = `data: ${JSON.stringify({ tipo: 'estado', datos: publico() })}\n\n`;
    for (const res of clientesSSE) {
      try { res.write(carga); } catch (e) { clientesSSE.delete(res); }
    }
  }

  function impedidosDe(puntoId) {
    return Object.values(D().impedimentos[puntoId] || {})
      .filter((v) => v && v.estado === 'APROBADO').length;
  }

  /** Estado público: viaja a todos los navegadores, sin secretos. */
  function publico() {
    const d = D();
    const pres = estado.presentes();
    const q = core.estadoQuorum(d.config, pres.length);
    return {
      servidor: {
        ...red(), carpetaDatos: dataDir, origenDatos: estado.origen,
        credencialesAnteriores: estado.credencialesAnteriores || D().credencialesAnteriores || 0,
        ahora: new Date().toISOString(), conexiones: clientesSSE.size,
      },
      config: d.config,
      sesion: d.sesion,
      quorum: q,
      concejales: d.concejales.map((c) => ({
        id: c.id, apellido: c.apellido, nombre: c.nombre, partido: c.partido, activo: c.activo,
        asistencia: d.asistencia[c.id]?.estado || 'AUSENTE',
        horaCheckin: d.asistencia[c.id]?.horaCheckin || null,
      })),
      puntos: d.puntos.map((p) => {
        const com = d.comisiones[p.id];
        const aportes = ceremonia.get(p.id) || new Map();
        return {
          id: p.id, orden: p.orden, titulo: p.titulo, tipo: p.tipo, mayoria: p.mayoria,
          modalidad: p.modalidad, estado: p.estado, ronda: p.ronda, resultado: p.resultado,
          candidatos: (p.candidatos || []).map((c) => ({ ...c })),
          permitidas: core.modalidadesPermitidas(p.tipo),
          impedimentos: d.impedimentos[p.id] || {},
          impedidos: impedidosDe(p.id),
          emitidos: p.modalidad === 'SECRETA'
            ? Object.keys(d.participacion[p.id] || {}).length
            : Object.keys(d.votos[p.id] || {}).length,
          /**
           * Registro individual en vivo SOLO en la nominal: el Secretario llama
           * por apellido y cada concejal responde en voz alta, delante de todos.
           * En la ordinaria no se publica; en la secreta no existe.
           */
          nominal: p.modalidad === 'NOMINAL' && ['EN_VOTACION', 'CERRADO', 'EMPATE'].includes(p.estado)
            ? d.concejales
                .filter((c) => d.asistencia[c.id]?.estado === 'PRESENTE')
                .slice()
                .sort((a, b) => String(a.apellido).localeCompare(String(b.apellido), 'es'))
                .map((c) => ({
                  concejalId: c.id,
                  nombre: `${c.apellido}, ${c.nombre}`,
                  voto: d.votos[p.id]?.[c.id]?.ronda === p.ronda ? d.votos[p.id][c.id].valor : null,
                  impedido: d.impedimentos[p.id]?.[c.id]?.estado === 'APROBADO',
                }))
            : null,
          boletas: (d.urna[p.id] || []).length,
          comision: com ? {
            umbral: com.umbral,
            lista: com.miembros.map((m) => {
              const c = d.concejales.find((x) => x.id === m.concejalId);
              return {
                concejalId: m.concejalId,
                nombre: c ? `${c.apellido}, ${c.nombre}` : m.concejalId,
                partido: c ? c.partido : '',
                protegida: !!m.protegido,
                confirmada: !!m.confirmada,
                aporto: aportes.has(m.concejalId),
              };
            }),
            aportados: aportes.size,
          } : null,
        };
      }),
      puntoAbierto: d.puntos.find((p) => p.estado === 'EN_VOTACION')?.id || null,
      registro: { registros: d.log.length, cadena: estado.verificarCadena().ok },
    };
  }

  /* ─────────── Utilidades HTTP ─────────── */

  function json(res, status, obj) {
    const cuerpo = JSON.stringify(obj);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(cuerpo),
      'Cache-Control': 'no-store',
    });
    res.end(cuerpo);
  }

  function texto(res, status, cuerpo, tipo = 'text/plain; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    res.end(cuerpo);
  }

  function leerBody(req) {
    return new Promise((resolve, reject) => {
      let tam = 0;
      const partes = [];
      req.on('data', (parte) => {
        tam += parte.length;
        if (tam > LIMITE_BODY) {
          reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 }));
          req.destroy();
          return;
        }
        partes.push(parte);
      });
      req.on('end', () => {
        const crudo = Buffer.concat(partes).toString('utf8');
        if (!crudo) return resolve({});
        try { resolve(JSON.parse(crudo)); }
        catch (e) { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  function fallo(res, status, mensaje) { json(res, status, { error: mensaje }); }

  function esMesa(req, url) {
    const t = req.headers['x-mesa'] || url.searchParams.get('k');
    return !!t && iguales(t, tokenMesa);
  }

  function permitir(req, clave, max = 20, ventana = 60000) {
    const ip = req.socket.remoteAddress || '?';
    const id = `${ip}:${clave}`;
    const ahora = Date.now();
    const lista = (intentos.get(id) || []).filter((t) => ahora - t < ventana);
    if (lista.length >= max) {
      intentos.set(id, lista);
      return false;
    }
    lista.push(ahora);
    intentos.set(id, lista);
    return true;
  }

  function registrarCambio(accion, entidad, id, datos, { backup = false } = {}) {
    estado.registrar(accion, entidad, id, datos);
    estado.guardar({ backup });
    difundir();
  }

  function sesionAbierta() { return D().sesion.estado === 'ABIERTA'; }

  function puntoDe(id) { return D().puntos.find((p) => p.id === id) || null; }

  function quorums() { return core.estadoQuorum(D().config, estado.presentes().length); }

  async function servirArchivo(res, nombre) {
    const ruta = path.resolve(PUBLIC_DIR, nombre);
    if (!ruta.startsWith(PUBLIC_DIR + path.sep) && ruta !== PUBLIC_DIR) {
      return fallo(res, 403, 'Ruta no permitida');
    }
    try {
      const datos = await fs.promises.readFile(ruta);
      const ext = path.extname(ruta).toLowerCase();
      const tipos = {
        '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
        '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      };
      res.writeHead(200, {
        'Content-Type': tipos[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(datos);
    } catch (e) {
      fallo(res, 404, 'No se encontró el archivo');
    }
  }

  /* ─────────── Normalización de importación ─────────── */

  function normalizarTipo(bruto) {
    const t = limpio(bruto, 80).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[\s_-]+/g, ' ');
    if (!t) return { tipo: 'PROPOSICION', reconocido: false };
    const tabla = [
      [/^(ELECCION|ELECCIONES|ELEGIR|DIGNATARIO|DIGNATARIOS|PERSONERO|CONTRALOR|MESA DIRECTIVA)/, 'ELECCION'],
      [/^(PROYECTO DE ACUERDO|PROYECTO ACUERDO|ACUERDO|PROYECTO)/, 'PROYECTO_ACUERDO'],
      [/^(PROPOSICION|PROPOSICIONES|PROPUESTA)/, 'PROPOSICION'],
      [/^(INFORMATIVO|INFORME|INFORMACION|LECTURA)/, 'INFORMATIVO'],
    ];
    for (const [re, tipo] of tabla) if (re.test(t)) return { tipo, reconocido: true };
    return { tipo: 'PROPOSICION', reconocido: false };
  }

  function normalizarMayoria(bruto) {
    const t = limpio(bruto, 40).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (/^(ABSOLUTA|MAYORIA ABSOLUTA)/.test(t)) return { mayoria: 'ABSOLUTA', reconocido: true };
    if (/^(CALIFICADA|2\/3|DOS TERCIOS)/.test(t)) return { mayoria: 'CALIFICADA', reconocido: true };
    if (/^(SIMPLE|MAYORIA SIMPLE)/.test(t)) return { mayoria: 'SIMPLE', reconocido: true };
    return { mayoria: 'SIMPLE', reconocido: !t };
  }

  /* ─────────── API ─────────── */

  async function api(req, res, url, body) {
    const ruta = url.pathname;
    const metodo = req.method;

    /* Lecturas públicas */
    if (ruta === '/api/ping' && metodo === 'GET') return json(res, 200, { ok: true, ...red() });

    if (ruta === '/api/estado' && metodo === 'GET') return json(res, 200, publico());

    if (ruta === '/api/mesa' && metodo === 'GET') {
      if (!esMesa(req, url)) return fallo(res, 403, 'Token de mesa inválido');
      return json(res, 200, { ok: true, tokenMesa, ...red(), origenDatos: estado.origen });
    }

    if (ruta === '/api/red' && metodo === 'GET') {
      return json(res, 200, {
        ...red(),
        interfaces: Object.entries(os.networkInterfaces())
          .flatMap(([nombre, redes]) => (redes || [])
            .filter((n) => n.family === 'IPv4' && !n.internal)
            .map((n) => ({ nombre, ip: n.address }))),
        nota: 'La red no necesita internet: solo conecta el computador con los celulares.',
      });
    }

    if (ruta === '/api/eventos' && metodo === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      res.write(`data: ${JSON.stringify({ tipo: 'estado', datos: publico() })}\n\n`);
      clientesSSE.add(res);
      req.on('close', () => clientesSSE.delete(res));
      return;
    }

    if (ruta === '/api/qr' && metodo === 'GET') {
      const destino = limpio(url.searchParams.get('u'), 500) || red().url;
      try {
        const png = await QRCode.toDataURL(destino, {
          margin: 1, width: 560, errorCorrectionLevel: 'M', color: { dark: '#0b1220ff', light: '#ffffffff' },
        });
        return json(res, 200, { url: destino, png });
      } catch (e) {
        return fallo(res, 500, 'No se pudo generar el código QR');
      }
    }

    if (ruta === '/api/credenciales' && metodo === 'GET') {
      const baseUrl = red().url;
      const lista = [];
      for (const c of D().concejales) {
        const token = estado.tokenDe(c.id);
        const destino = `${baseUrl}/c/${token}`;
        const png = await QRCode.toDataURL(destino, { margin: 1, width: 420, errorCorrectionLevel: 'M' });
        lista.push({ concejal: c, token, url: destino, png });
      }
      return json(res, 200, {
        credenciales: lista, config: D().config, sesion: D().sesion, urlBase: baseUrl,
      });
    }

    const mYo = ruta.match(/^\/api\/yo\/([^/]+)$/);
    if (mYo && metodo === 'GET') {
      const c = estado.verificarCredencial(decodeURIComponent(mYo[1]));
      if (!c) return fallo(res, 401, 'Credencial inválida o de otra sesión');
      const d = D();
      const abierto = d.puntos.find((p) => p.estado === 'EN_VOTACION') || null;
      const comisiones = d.puntos
        .filter((p) => d.comisiones[p.id]?.miembros.some((m) => m.concejalId === c.id))
        .map((p) => {
          const com = d.comisiones[p.id];
          const m = com.miembros.find((x) => x.concejalId === c.id);
          return {
            puntoId: p.id, titulo: p.titulo, estadoPunto: p.estado,
            umbral: com.umbral, miembros: com.miembros.length,
            claveFijada: !!m.protegido, confirmada: !!m.confirmada,
            yaAporte: (ceremonia.get(p.id) || new Map()).has(c.id),
            aportados: (ceremonia.get(p.id) || new Map()).size,
            enCeremonia: p.estado === 'EN_ESCRUTINIO',
          };
        });
      return json(res, 200, {
        concejal: c,
        asistencia: d.asistencia[c.id]?.estado || 'AUSENTE',
        sesion: { numero: d.sesion.numero, anio: d.sesion.anio, tipo: d.sesion.tipo, estado: d.sesion.estado },
        quorum: quorums(),
        punto: abierto && {
          id: abierto.id, titulo: abierto.titulo, modalidad: abierto.modalidad,
          mayoria: abierto.mayoria, ronda: abierto.ronda,
        },
        miVoto: abierto && d.votos[abierto.id]?.[c.id]?.ronda === abierto.ronda
          ? d.votos[abierto.id][c.id].valor : null,
        miImpedimento: abierto ? (d.impedimentos[abierto.id]?.[c.id]?.estado || null) : null,
        candidatos: abierto && abierto.modalidad === 'SECRETA' ? abierto.candidatos : [],
        yaDeposite: abierto ? !!d.participacion[abierto.id]?.[c.id] : false,
        comisiones,
      });
    }

    if (ruta === '/api/auditoria' && metodo === 'GET') {
      return json(res, 200, {
        verificacion: estado.verificarCadena(),
        registros: D().log.slice(-250).reverse(),
      });
    }

    if (ruta === '/api/acta' && metodo === 'GET') return json(res, 200, acta());

    if (ruta === '/api/exportar' && metodo === 'GET') {
      const d = D();
      const volcado = {
        exportadoAt: new Date().toISOString(),
        aplicacion: 'Sala de Sesiones 2.0',
        advertencia: 'BORRADOR — SIN VALIDEZ JURÍDICA. Documento de respaldo de una sesión simulada.',
        configuracion: d.config,
        sesion: d.sesion,
        concejales: d.concejales,
        asistencia: d.asistencia,
        puntos: d.puntos,
        votos: d.votos,
        impedimentos: d.impedimentos,
        urna: Object.fromEntries(Object.entries(d.urna || {}).map(([k, v]) => [k, v.length])),
        participacion: d.participacion,
        // Nunca salen fragmentos ni claves privadas.
        comisiones: Object.fromEntries(Object.entries(d.comisiones || {}).map(([k, c]) => [k, {
          umbral: c.umbral,
          miembros: (c.miembros || []).map((m) => ({ concejalId: m.concejalId, indice: m.indice })),
        }])),
        registroActividad: d.log,
        verificacionCadena: estado.verificarCadena(),
        huellaActa: acta().huella,
      };
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="sesion-${d.sesion.numero}-${d.sesion.anio}.json"`,
      });
      return res.end(JSON.stringify(volcado, null, 2));
    }

    if (ruta === '/api/exportar-csv' && metodo === 'GET') {
      const tipo = url.searchParams.get('tipo') || 'asistencia';
      const d = D();
      let filas = [];
      if (tipo === 'asistencia') {
        filas = [['apellido', 'nombre', 'partido', 'estado', 'hora']].concat(d.concejales.map((c) => [
          c.apellido, c.nombre, c.partido, d.asistencia[c.id]?.estado || 'AUSENTE',
          d.asistencia[c.id]?.horaCheckin || '',
        ]));
      } else if (tipo === 'votos') {
        filas = [['punto', 'ronda', 'modalidad', 'concejal', 'voto', 'impedimento']];
        for (const p of d.puntos) {
          for (const [cid, v] of Object.entries(d.votos[p.id] || {})) {
            const c = d.concejales.find((x) => x.id === cid);
            if (p.modalidad === 'SECRETA') continue; // el secreto no se vuelca por concejal
            filas.push([p.titulo, p.ronda, p.modalidad, c ? `${c.apellido}, ${c.nombre}` : cid,
              v.valor, d.impedimentos[p.id]?.[cid]?.estado || '']);
          }
        }
      } else if (tipo === 'resultados') {
        filas = [['punto', 'modalidad', 'mayoria', 'ronda', 'veredicto', 'detalle']];
        for (const p of d.puntos.filter((x) => x.resultado)) {
          filas.push([p.titulo, p.modalidad, p.mayoria, p.ronda, p.resultado.veredicto, p.resultado.formula]);
        }
      }
      const csv = filas.map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${tipo}-sesion-${d.sesion.numero}.csv"`,
      });
      return res.end('\ufeff' + csv);
    }

    /* ─── Acciones del concejal ─── */

    if (ruta === '/api/checkin' && metodo === 'POST') {
      if (!permitir(req, 'checkin', 20)) return fallo(res, 429, 'Demasiados intentos. Espere un momento.');
      const c = estado.verificarCredencial(body.token);
      if (!c) return fallo(res, 401, 'Credencial inválida');
      if (D().sesion.estado === 'CERRADA') return fallo(res, 409, 'La sesión ya está cerrada');
      if (D().asistencia[c.id]?.estado === 'PRESENTE') return json(res, 200, { ok: true, yaRegistrado: true });
      D().asistencia[c.id] = { estado: 'PRESENTE', horaCheckin: new Date().toISOString(), metodo: 'QR' };
      registrarCambio('CHECKIN', 'Asistencia', c.id, { metodo: 'QR' });
      return json(res, 200, { ok: true });
    }

    if (ruta === '/api/impedimento' && metodo === 'POST') {
      if (!permitir(req, 'impedimento', 20)) return fallo(res, 429, 'Demasiados intentos. Espere un momento.');
      const c = estado.verificarCredencial(body.token);
      if (!c) return fallo(res, 401, 'Credencial inválida');
      const p = puntoDe(body.puntoId);
      if (!p || !sesionAbierta()) return fallo(res, 409, 'No hay un punto habilitado para declarar impedimentos');
      D().impedimentos[p.id] = D().impedimentos[p.id] || {};
      D().impedimentos[p.id][c.id] = {
        estado: 'DECLARADO', motivo: limpio(body.motivo, 300), ts: new Date().toISOString(),
      };
      registrarCambio('IMPEDIMENTO_DECLARADO', 'ConflictoInteres', c.id, { puntoId: p.id });
      return json(res, 200, { ok: true });
    }

    if (ruta === '/api/voto' && metodo === 'POST') {
      if (!permitir(req, 'voto', 30)) return fallo(res, 429, 'Demasiados intentos. Espere un momento.');
      const c = estado.verificarCredencial(body.token);
      if (!c) return fallo(res, 401, 'Credencial inválida');
      const d = D();
      if (!sesionAbierta()) return fallo(res, 409, 'La sesión no está abierta');
      const p = d.puntos.find((x) => x.estado === 'EN_VOTACION');
      if (!p) {
        const escrutinio = d.puntos.some((x) => x.estado === 'EN_ESCRUTINIO');
        return fallo(res, 409, escrutinio
          ? 'La urna ya se cerró: no se admiten más boletas'
          : 'No hay ninguna votación abierta');
      }
      if (!quorums().hayDecisorio) return fallo(res, 409, 'Se perdió el quórum decisorio');
      if (d.asistencia[c.id]?.estado !== 'PRESENTE') return fallo(res, 409, 'Debe registrar asistencia primero');

      /* Voto secreto: urna */
      if (p.modalidad === 'SECRETA') {
        const com = d.comisiones[p.id];
        if (!com) return fallo(res, 409, 'No hay comisión escrutadora designada');
        d.participacion[p.id] = d.participacion[p.id] || {};
        if (d.participacion[p.id][c.id]) {
          return fallo(res, 409, 'Ya depositó su boleta. El voto secreto no se puede cambiar');
        }
        const candidatoId = body.candidatoId ? limpio(body.candidatoId, 40) : null;
        if (candidatoId && !(p.candidatos || []).some((k) => k.id === candidatoId)) {
          return fallo(res, 400, 'Candidato no inscrito en este punto');
        }
        const boleta = cripto.sellarBoleta({ candidatoId, ronda: p.ronda }, com.publicaPem);
        const hora = new Date();
        hora.setMinutes(0, 0, 0); // hora truncada: impide correlacionar llegada con voto
        d.urna[p.id] = d.urna[p.id] || [];
        d.urna[p.id].splice(crypto.randomInt(d.urna[p.id].length + 1), 0, {
          ...boleta, horaTruncada: hora.toISOString(),
        });
        d.participacion[p.id][c.id] = hora.toISOString();
        registrarCambio('BOLETA_DEPOSITADA', 'Urna', p.id, { ronda: p.ronda });
        return json(res, 200, { ok: true, secreta: true });
      }

      /* Votación ordinaria o nominal */
      const valor = limpio(body.valor, 20).toUpperCase();
      if (!['SI', 'NO', 'ABSTENCION'].includes(valor)) return fallo(res, 400, 'Valor de voto inválido');
      const imp = d.impedimentos[p.id]?.[c.id]?.estado;
      if (valor === 'ABSTENCION' && imp !== 'APROBADO') {
        return fallo(res, 409, 'La abstención requiere un impedimento aprobado por el Presidente');
      }
      if (imp === 'APROBADO' && valor !== 'ABSTENCION') {
        return fallo(res, 409, 'Con impedimento aprobado no puede votar el fondo del asunto');
      }
      d.votos[p.id] = d.votos[p.id] || {};
      const anterior = d.votos[p.id][c.id];
      if (anterior && anterior.ronda === p.ronda) {
        if (anterior.valor === valor) return json(res, 200, { ok: true, valor, yaRegistrado: true });
        return fallo(res, 409, 'Ya votó en esta ronda; el voto no se puede cambiar');
      }
      const hash = crypto.createHash('sha256')
        .update(`${p.id}.${c.id}.${p.ronda}.${valor}`).digest('hex').slice(0, 32);
      d.votos[p.id][c.id] = {
        valor, ronda: p.ronda, ts: new Date().toISOString(),
        ip: req.socket.remoteAddress || '', hash,
      };
      registrarCambio('VOTO_REGISTRADO', 'Voto', c.id, { puntoId: p.id, ronda: p.ronda, hash });
      return json(res, 200, { ok: true, valor });
    }

    /* ─── Acciones de la mesa ─── */
    // La ceremonia de la urna la ejecutan los concejales con su credencial;
    // el resto de las acciones de escritura pertenecen a la mesa de control.
    const ACCIONES_CONCEJAL = new Set([
      '/api/comision/clave', '/api/comision/confirmar', '/api/comision/aportar',
    ]);
    if (ruta.startsWith('/api/') && !ACCIONES_CONCEJAL.has(ruta)) {
      if (!esMesa(req, url)) return fallo(res, 403, 'Solo la mesa de control puede hacer esto');
    }

    if (ruta === '/api/config' && metodo === 'POST') {
      const c = D().config;
      const n = body || {};
      const num = (v, actual) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : actual);
      c.delibNum = num(n.delibNum, c.delibNum); c.delibDen = num(n.delibDen, c.delibDen);
      c.deciNum = num(n.deciNum, c.deciNum); c.deciDen = num(n.deciDen, c.deciDen);
      c.califNum = num(n.califNum, c.califNum); c.califDen = num(n.califDen, c.califDen);
      if (typeof n.impedimentoReduceBase === 'boolean') c.impedimentoReduceBase = n.impedimentoReduceBase;
      if (n.nombreCorporacion) c.nombreCorporacion = limpio(n.nombreCorporacion, 80);
      if (n.municipio) c.municipio = limpio(n.municipio, 60);
      const errores = core.validarConfig(c);
      if (errores.length) return fallo(res, 400, errores.join(' '));
      registrarCambio('CONFIG_ACTUALIZADA', 'ConfiguracionCorporacion', 'cfg', { ...c });
      return json(res, 200, { ok: true, config: c });
    }

    if (ruta === '/api/sesion' && metodo === 'POST') {
      const s = D().sesion;
      const b = body || {};
      if (s.estado === 'CERRADA') return fallo(res, 409, 'La sesión ya está cerrada');
      if (Number.isFinite(+b.numero) && +b.numero > 0) s.numero = Math.floor(+b.numero);
      if (Number.isFinite(+b.anio) && +b.anio > 2000) s.anio = Math.floor(+b.anio);
      if (['ORDINARIA', 'EXTRAORDINARIA', 'INSTALACION'].includes(b.tipo)) s.tipo = b.tipo;
      if (b.lugar) s.lugar = limpio(b.lugar, 120);
      if (b.fecha) {
        const f = new Date(b.fecha);
        if (!Number.isNaN(f.getTime())) s.fecha = f.toISOString();
      }
      registrarCambio('SESION_ACTUALIZADA', 'Sesion', s.id, { numero: s.numero, tipo: s.tipo });
      return json(res, 200, { ok: true, sesion: s });
    }

    if (ruta === '/api/concejales' && metodo === 'POST') {
      const d = D();
      if (d.sesion.estado !== 'PROGRAMADA') return fallo(res, 409, 'El padrón solo puede cambiarse antes de abrir la sesión');
      const lista = Array.isArray(body.lista) ? body.lista : [];
      const limpia = lista
        .filter((p) => p && limpio(p.apellido, 60))
        .map((p) => ({
          apellido: limpio(p.apellido, 60),
          nombre: limpio(p.nombre, 60),
          partido: limpio(p.partido, 60) || 'Sin partido',
        }));
      if (limpia.length < 3) return fallo(res, 400, 'Se requieren al menos 3 concejales');
      if (limpia.length > 60) return fallo(res, 400, 'Máximo 60 concejales');
      estado.reemplazarPadron(limpia);
      pendientes.clear();
      ceremonia.clear();
      registrarCambio('PADRON_CARGADO', 'Concejal', 'todos', { total: limpia.length }, { backup: true });
      return json(res, 200, { ok: true, total: limpia.length });
    }

    if (ruta === '/api/puntos' && metodo === 'POST') {
      const d = D();
      if (d.sesion.estado !== 'PROGRAMADA') return fallo(res, 409, 'El orden del día solo puede cambiarse antes de abrir la sesión');
      const lista = Array.isArray(body.lista) ? body.lista : [];
      const limpia = lista.filter((p) => p && limpio(p.titulo, 300)).slice(0, 30);
      if (!limpia.length) return fallo(res, 400, 'Se requiere al menos un punto');

      const anteriores = new Map(d.puntos.map((p) => [p.id, p]));
      const usados = new Set();
      const avisos = [];
      let siguiente = d.puntos.reduce((n, p) => {
        const num = Number(String(p.id || '').replace(/\D/g, ''));
        return Math.max(n, Number.isFinite(num) ? num : 0);
      }, 0);

      d.puntos = limpia.map((p, i) => {
        const idSolicitado = limpio(p.id, 20);
        let id = idSolicitado && anteriores.has(idSolicitado) && !usados.has(idSolicitado) ? idSolicitado : '';
        if (!id) {
          do { siguiente += 1; id = `p${siguiente}`; } while (usados.has(id));
        }
        usados.add(id);
        const prev = anteriores.get(id) || null;
        const t = normalizarTipo(p.tipo === undefined ? prev?.tipo : p.tipo);
        const m = normalizarMayoria(p.mayoria === undefined ? prev?.mayoria : p.mayoria);
        const titulo = limpio(p.titulo, 300);
        if (!t.reconocido) avisos.push(`«${titulo}»: no se entendió el tipo «${p.tipo}», quedó como proposición`);
        if (!m.reconocido) avisos.push(`«${titulo}»: no se entendió la mayoría «${p.mayoria}», quedó como simple`);
        const permitidas = core.modalidadesPermitidas(t.tipo);
        return {
          ...(prev || {}),
          id, orden: i + 1, titulo, tipo: t.tipo, mayoria: m.mayoria,
          modalidad: prev && permitidas.includes(prev.modalidad) ? prev.modalidad : null,
          estado: prev?.estado || 'PENDIENTE',
          ronda: prev?.ronda || 1,
          resultado: prev?.resultado || null,
          candidatos: prev?.candidatos || [],
        };
      });

      for (const mapa of [d.votos, d.impedimentos, d.urna, d.participacion, d.comisiones]) {
        for (const id of Object.keys(mapa)) if (!usados.has(id)) delete mapa[id];
      }
      for (const id of [...pendientes.keys()]) if (!usados.has(id)) pendientes.delete(id);
      for (const id of [...ceremonia.keys()]) if (!usados.has(id)) ceremonia.delete(id);

      registrarCambio('ORDEN_DIA_CARGADO', 'PuntoVotacion', 'todos', { puntos: d.puntos.length }, { backup: true });
      return json(res, 200, {
        ok: true, puntos: d.puntos.length, avisos,
        detalle: d.puntos.map((p) => ({
          id: p.id, orden: p.orden, titulo: p.titulo, tipo: p.tipo, mayoria: p.mayoria,
        })),
      });
    }

    const mCand = ruta.match(/^\/api\/punto\/([^/]+)\/candidatos$/);
    if (mCand && metodo === 'POST') {
      const p = puntoDe(mCand[1]);
      if (!p) return fallo(res, 404, 'Punto no encontrado');
      if (p.tipo !== 'ELECCION') return fallo(res, 409, 'Solo los puntos de elección tienen candidatos');
      if (p.estado === 'EN_VOTACION' || p.estado === 'EN_ESCRUTINIO') return fallo(res, 409, 'La votación ya está abierta');
      const lista = (Array.isArray(body.lista) ? body.lista : [])
        .map((c) => ({ nombre: limpio(c && c.nombre, 120), cargo: limpio(c && c.cargo, 80) }))
        .filter((c) => c.nombre).slice(0, 20);
      if (!lista.length) return fallo(res, 400, 'Se requiere al menos un candidato');
      p.candidatos = lista.map((c, i) => ({ id: `k${i + 1}`, ...c }));
      registrarCambio('CANDIDATOS_CARGADOS', 'PuntoVotacion', p.id, { total: p.candidatos.length });
      return json(res, 200, { ok: true, candidatos: p.candidatos.length });
    }

    const mCom = ruta.match(/^\/api\/punto\/([^/]+)\/comision$/);
    if (mCom && metodo === 'POST') {
      const d = D();
      const p = puntoDe(mCom[1]);
      if (!p) return fallo(res, 404, 'Punto no encontrado');
      if (p.tipo !== 'ELECCION') return fallo(res, 409, 'La comisión escrutadora solo aplica a elecciones');
      if (['EN_VOTACION', 'EN_ESCRUTINIO'].includes(p.estado)) return fallo(res, 409, 'La votación ya está abierta');
      if ((d.urna[p.id] || []).length) return fallo(res, 409, 'Ya hay boletas depositadas');
      const ids = [...new Set(Array.isArray(body.miembros) ? body.miembros.map((x) => limpio(x, 20)) : [])];
      const miembros = ids.map((id) => d.concejales.find((c) => c.id === id)).filter(Boolean);
      if (miembros.length < 2) return fallo(res, 400, 'La comisión requiere al menos 2 miembros');
      if (new Set(miembros.map((m) => m.partido)).size < 2) {
        return fallo(res, 409, 'La comisión debe integrarse con concejales de partidos distintos');
      }
      const umbral = Math.min(Math.max(2, parseInt(body.umbral, 10) || 2), miembros.length);

      const par = cripto.generarParComision();
      const maestra = crypto.randomBytes(32);
      const privadaProtegida = cripto.cifrar(par.privadaPem, maestra);
      const fragmentos = cripto.dividirSecreto(maestra, miembros.length, umbral);
      cripto.limpiar(maestra);

      d.comisiones[p.id] = {
        umbral,
        publicaPem: par.publicaPem,
        privadaProtegida,
        miembros: miembros.map((m, i) => ({
          concejalId: m.id, indice: fragmentos[i].indice, protegido: null, confirmada: false,
        })),
      };
      pendientes.set(p.id, new Map(miembros.map((m, i) => [m.id, fragmentos[i]])));
      ceremonia.delete(p.id);
      registrarCambio('COMISION_DESIGNADA', 'ComisionEscrutadora', p.id,
        { miembros: miembros.map((m) => m.id), umbral });
      return json(res, 200, { ok: true, umbral, miembros: miembros.length });
    }

    if (ruta === '/api/comision/clave' && metodo === 'POST') {
      if (!permitir(req, 'comision-clave', 20)) return fallo(res, 429, 'Demasiados intentos. Espere un momento.');
      const c = estado.verificarCredencial(body.token);
      if (!c) return fallo(res, 401, 'Credencial inválida');
      const com = D().comisiones[limpio(body.puntoId, 20)];
      if (!com) return fallo(res, 404, 'No hay comisión designada para ese punto');
      const m = com.miembros.find((x) => x.concejalId === c.id);
      if (!m) return fallo(res, 403, 'No forma parte de la comisión escrutadora');
      if (m.confirmada) return fallo(res, 409, 'Ya confirmó su clave para esta votación');
      const generar = body.generar !== false && !body.contrasena;
      const clave = generar
        ? String(crypto.randomInt(0, 1000000)).padStart(6, '0')
        : String(body.contrasena || '');
      if (!generar && clave.length < 6) return fallo(res, 400, 'La contraseña debe tener al menos 6 caracteres');
      const pendiente = (pendientes.get(body.puntoId) || new Map()).get(c.id);
      if (!pendiente) {
        return fallo(res, 409, 'La comisión tiene que designarse de nuevo. Pídaselo a la Secretaría.');
      }
      m.protegido = cripto.protegerFragmento(pendiente, clave, `${body.puntoId}:${c.id}`);
      m.confirmada = false;
      registrarCambio('COMISION_CLAVE_FIJADA', 'ComisionEscrutadora', c.id,
        { puntoId: body.puntoId, generada: generar });
      // La clave generada se devuelve UNA sola vez: no se guarda en ningún lado.
      return json(res, 200, { ok: true, clave: generar ? clave : undefined });
    }

    if (ruta === '/api/comision/confirmar' && metodo === 'POST') {
      if (!permitir(req, 'comision-confirmar', 20)) return fallo(res, 429, 'Demasiados intentos. Espere un momento.');
      const c = estado.verificarCredencial(body.token);
      if (!c) return fallo(res, 401, 'Credencial inválida');
      const com = D().comisiones[limpio(body.puntoId, 20)];
      if (!com) return fallo(res, 404, 'No hay comisión designada para ese punto');
      const m = com.miembros.find((x) => x.concejalId === c.id);
      if (!m || !m.protegido) return fallo(res, 403, 'Todavía no tiene una clave asignada');
      try {
        cripto.abrirFragmento(m.protegido, String(body.contrasena || ''), `${body.puntoId}:${c.id}`);
      } catch (e) {
        return fallo(res, 401, 'Esa no es su clave. Revise el papel donde la anotó');
      }
      m.confirmada = true;
      const mapa = pendientes.get(body.puntoId);
      if (mapa) { mapa.delete(c.id); if (!mapa.size) pendientes.delete(body.puntoId); }
      registrarCambio('COMISION_CLAVE_CONFIRMADA', 'ComisionEscrutadora', c.id, { puntoId: body.puntoId });
      return json(res, 200, { ok: true });
    }

    if (ruta === '/api/comision/aportar' && metodo === 'POST') {
      if (!permitir(req, 'comision-aportar', 20)) return fallo(res, 429, 'Demasiados intentos. Espere un momento.');
      const c = estado.verificarCredencial(body.token);
      if (!c) return fallo(res, 401, 'Credencial inválida');
      const pid = limpio(body.puntoId, 20);
      const p = puntoDe(pid);
      const com = D().comisiones[pid];
      if (!p || !com) return fallo(res, 404, 'Punto o comisión no encontrados');
      const m = com.miembros.find((x) => x.concejalId === c.id);
      if (!m || !m.protegido) return fallo(res, 403, 'No forma parte de la comisión o no fijó su clave');
      if (p.estado !== 'EN_ESCRUTINIO') {
        return fallo(res, 409, 'La urna todavía no se ha cerrado: la ceremonia aún no empieza');
      }
      let fragmento;
      try {
        fragmento = cripto.abrirFragmento(m.protegido, String(body.contrasena || ''), `${pid}:${c.id}`);
      } catch (e) {
        registrarCambio('ESCRUTINIO_APORTE_FALLIDO', 'ComisionEscrutadora', c.id, { puntoId: p.id });
        return fallo(res, 401, 'Contraseña incorrecta');
      }
      if (!ceremonia.has(pid)) ceremonia.set(pid, new Map());
      ceremonia.get(pid).set(c.id, fragmento);
      registrarCambio('ESCRUTINIO_APORTE', 'ComisionEscrutadora', c.id, { puntoId: p.id });
      return json(res, 200, {
        ok: true, aportados: ceremonia.get(pid).size, requeridos: com.umbral,
      });
    }

    if (ruta === '/api/asistencia' && metodo === 'POST') {
      const c = D().concejales.find((x) => x.id === limpio(body.concejalId, 20));
      if (!c) return fallo(res, 404, 'Concejal no encontrado');
      const nuevo = ['PRESENTE', 'AUSENTE', 'TARDE', 'RETIRADO'].includes(body.estado) ? body.estado : 'AUSENTE';
      D().asistencia[c.id] = {
        estado: nuevo,
        horaCheckin: nuevo === 'PRESENTE' ? (D().asistencia[c.id]?.horaCheckin || new Date().toISOString()) : null,
        metodo: 'MANUAL',
      };
      registrarCambio('ASISTENCIA_MANUAL', 'Asistencia', c.id, { estado: nuevo });
      return json(res, 200, { ok: true });
    }

    if (ruta === '/api/sesion/abrir' && metodo === 'POST') {
      const d = D();
      if (d.sesion.estado !== 'PROGRAMADA') return fallo(res, 409, 'La sesión ya fue abierta');
      const q = quorums();
      if (!q.hayDeliberatorio) {
        return fallo(res, 409, `Falta quórum deliberatorio (${q.presentes}/${q.umbralDeliberatorio})`);
      }
      d.sesion.estado = 'ABIERTA';
      d.sesion.horaInicio = new Date().toISOString();
      d.sesion.snapshotOrdenDia = d.puntos.map((p) => ({
        id: p.id, titulo: p.titulo, tipo: p.tipo, mayoria: p.mayoria,
      }));
      d.sesion.snapshotConfig = { ...d.config };
      registrarCambio('SESION_ABIERTA', 'Sesion', d.sesion.id, { presentes: q.presentes }, { backup: true });
      return json(res, 200, { ok: true });
    }

    if (ruta === '/api/sesion/cerrar' && metodo === 'POST') {
      if (!sesionAbierta()) return fallo(res, 409, 'La sesión no está abierta');
      if (D().puntos.some((p) => p.estado === 'EN_VOTACION' || p.estado === 'EN_ESCRUTINIO')) {
        return fallo(res, 409, 'Hay una votación abierta: ciérrela antes de cerrar la sesión');
      }
      D().sesion.estado = 'CERRADA';
      D().sesion.horaFin = new Date().toISOString();
      registrarCambio('SESION_CERRADA', 'Sesion', D().sesion.id, {}, { backup: true });
      return json(res, 200, { ok: true });
    }

    const mMod = ruta.match(/^\/api\/punto\/([^/]+)\/modalidad$/);
    if (mMod && metodo === 'POST') {
      const p = puntoDe(mMod[1]);
      if (!p) return fallo(res, 404, 'Punto no encontrado');
      if (!['PROGRAMADA', 'ABIERTA'].includes(D().sesion.estado)) return fallo(res, 409, 'La sesión está cerrada');
      if (['EN_VOTACION', 'EN_ESCRUTINIO', 'CERRADO'].includes(p.estado)) {
        return fallo(res, 409, 'La modalidad ya no puede cambiarse');
      }
      if (!core.modalidadesPermitidas(p.tipo).includes(body.modalidad)) {
        return fallo(res, 409, `Modalidad no admitida para un punto de tipo ${p.tipo}`);
      }
      p.modalidad = body.modalidad;
      registrarCambio('MODALIDAD_DEFINIDA', 'PuntoVotacion', p.id, { modalidad: p.modalidad });
      return json(res, 200, { ok: true });
    }

    const mImp = ruta.match(/^\/api\/punto\/([^/]+)\/impedimento$/);
    if (mImp && metodo === 'POST') {
      const p = puntoDe(mImp[1]);
      if (!p) return fallo(res, 404, 'Punto no encontrado');
      if (!['PENDIENTE', 'EN_VOTACION'].includes(p.estado)) return fallo(res, 409, 'No se pueden resolver impedimentos en este punto');
      const cid = limpio(body.concejalId, 20);
      const decision = body.decision === 'APROBADO' ? 'APROBADO' : 'RECHAZADO';
      D().impedimentos[p.id] = D().impedimentos[p.id] || {};
      const actual = D().impedimentos[p.id][cid] || {};
      D().impedimentos[p.id][cid] = {
        ...actual, estado: decision, resueltoPor: 'MESA', ts: new Date().toISOString(),
      };
      if (decision === 'APROBADO' && D().votos[p.id]?.[cid] && D().votos[p.id][cid].valor !== 'ABSTENCION') {
        delete D().votos[p.id][cid];
      }
      registrarCambio('IMPEDIMENTO_RESUELTO', 'ConflictoInteres', cid, { puntoId: p.id, decision });
      return json(res, 200, { ok: true });
    }

    const mAbrir = ruta.match(/^\/api\/punto\/([^/]+)\/abrir$/);
    if (mAbrir && metodo === 'POST') {
      const d = D();
      const p = puntoDe(mAbrir[1]);
      if (!p) return fallo(res, 404, 'Punto no encontrado');
      if (!sesionAbierta()) return fallo(res, 409, 'La sesión no está abierta');
      if (!p.modalidad) return fallo(res, 409, 'Falta definir la modalidad');
      if (p.modalidad === 'SECRETA') {
        if (!(p.candidatos || []).length) return fallo(res, 409, 'Falta inscribir los candidatos');
        const com = d.comisiones[p.id];
        if (!com) return fallo(res, 409, 'Falta designar la comisión escrutadora');
        const listos = com.miembros.filter((m) => m.protegido && m.confirmada).length;
        if (listos < com.umbral) {
          return fallo(res, 409, `Faltan miembros de la comisión por confirmar su clave (${listos} de ${com.umbral} necesarios)`);
        }
      }
      const q = quorums();
      if (!q.hayDecisorio) return fallo(res, 409, `Falta quórum decisorio (${q.presentes}/${q.umbralDecisorio})`);
      if (d.puntos.some((x) => x.estado === 'EN_VOTACION')) return fallo(res, 409, 'Ya hay una votación abierta');
      p.estado = 'EN_VOTACION';
      d.votos[p.id] = d.votos[p.id] || {};
      registrarCambio('VOTACION_ABIERTA', 'PuntoVotacion', p.id, { modalidad: p.modalidad, ronda: p.ronda });
      return json(res, 200, { ok: true });
    }

    const mUrna = ruta.match(/^\/api\/punto\/([^/]+)\/urna$/);
    if (mUrna && metodo === 'POST') {
      const p = puntoDe(mUrna[1]);
      if (!p || p.estado !== 'EN_VOTACION') return fallo(res, 409, 'Esa votación no está abierta');
      if (p.modalidad !== 'SECRETA') return fallo(res, 409, 'Solo la votación secreta tiene urna');
      p.estado = 'EN_ESCRUTINIO';
      registrarCambio('URNA_CERRADA', 'Urna', p.id,
        { boletas: (D().urna[p.id] || []).length, ronda: p.ronda }, { backup: true });
      return json(res, 200, { ok: true, boletas: (D().urna[p.id] || []).length });
    }

    const mCerrar = ruta.match(/^\/api\/punto\/([^/]+)\/cerrar$/);
    if (mCerrar && metodo === 'POST') {
      const d = D();
      const p = puntoDe(mCerrar[1]);
      if (!p) return fallo(res, 404, 'Punto no encontrado');
      const abiertaOk = p.modalidad === 'SECRETA'
        ? ['EN_VOTACION', 'EN_ESCRUTINIO'].includes(p.estado)
        : p.estado === 'EN_VOTACION';
      if (!abiertaOk) return fallo(res, 409, 'Esa votación no está abierta');

      let resultado;
      if (p.modalidad === 'SECRETA') {
        if (p.estado !== 'EN_ESCRUTINIO') return fallo(res, 409, 'Primero hay que cerrar la urna');
        const com = d.comisiones[p.id];
        const aportes = ceremonia.get(p.id) || new Map();
        if (aportes.size < com.umbral) {
          return fallo(res, 409, `La urna requiere ${com.umbral} miembros de la comisión para abrirse; han aportado ${aportes.size}`);
        }
        let maestra;
        let privadaPem;
        try {
          maestra = cripto.reconstruirSecreto([...aportes.values()]);
          privadaPem = cripto.descifrar(com.privadaProtegida, maestra);
          const boletas = (d.urna[p.id] || [])
            .map((b) => cripto.abrirBoleta(b, privadaPem))
            .filter((b) => b.ronda === p.ronda);
          resultado = core.escrutarEleccion(d.config, p.mayoria, boletas, p.candidatos, impedidosDe(p.id));
          registrarCambio('URNA_ABIERTA', 'Urna', p.id, {
            boletas: boletas.length, comision: [...aportes.keys()], veredicto: resultado.veredicto,
          }, { backup: true });
        } catch (e) {
          return fallo(res, 409, 'No fue posible abrir la urna. Revise las claves aportadas.');
        } finally {
          if (maestra) cripto.limpiar(maestra);
          privadaPem = null;
          ceremonia.delete(p.id);
        }
      } else {
        const votos = Object.values(d.votos[p.id] || {}).filter((v) => v.ronda === p.ronda);
        resultado = core.escrutar(d.config, p.mayoria, votos, impedidosDe(p.id));
      }

      p.resultado = { ...resultado, modalidad: p.modalidad, ronda: p.ronda, cerradoAt: new Date().toISOString() };
      p.estado = resultado.veredicto === 'EMPATE' ? 'EMPATE' : 'CERRADO';
      registrarCambio('VOTACION_CERRADA', 'PuntoVotacion', p.id,
        p.modalidad === 'SECRETA'
          ? { veredicto: resultado.veredicto, depositadas: resultado.emitidas, blanco: resultado.blanco }
          : { veredicto: resultado.veredicto, si: resultado.si, no: resultado.no, abstencion: resultado.abstencion },
        { backup: true });
      return json(res, 200, { ok: true, resultado: p.resultado });
    }

    const mRepetir = ruta.match(/^\/api\/punto\/([^/]+)\/repetir$/);
    if (mRepetir && metodo === 'POST') {
      const d = D();
      const p = puntoDe(mRepetir[1]);
      if (!p) return fallo(res, 404, 'Punto no encontrado');
      if (!['CERRADO', 'EMPATE'].includes(p.estado)) return fallo(res, 409, 'Ese punto aún no tiene un resultado');
      p.ronda += 1;
      p.estado = 'PENDIENTE';
      p.resultado = null;
      d.votos[p.id] = {};
      if (p.modalidad === 'SECRETA') {
        // Mejora: cada ronda usa material criptográfico nuevo.
        d.urna[p.id] = [];
        d.participacion[p.id] = {};
        d.comisiones[p.id] = undefined;
        delete d.comisiones[p.id];
        ceremonia.delete(p.id);
        pendientes.delete(p.id);
      }
      registrarCambio('VOTACION_REPETIDA', 'PuntoVotacion', p.id, { ronda: p.ronda }, { backup: true });
      return json(res, 200, { ok: true, ronda: p.ronda, requiereComisionNueva: p.modalidad === 'SECRETA' });
    }

    if (ruta === '/api/reiniciar' && metodo === 'POST') {
      estado.reiniciar();
      pendientes.clear();
      ceremonia.clear();
      difundir();
      return json(res, 200, { ok: true });
    }

    return fallo(res, 404, 'Ruta no encontrada');
  }

  /* ─────────── Acta ─────────── */

  function acta() {
    const d = D();
    const pres = estado.presentes();
    const votados = d.puntos.filter((p) => p.resultado);
    const q = core.estadoQuorum(d.config, pres.length);
    const huella = crypto.createHash('sha256')
      .update(JSON.stringify(votados.map((p) => [
        p.id, p.resultado.ronda, p.resultado.veredicto,
        p.resultado.modalidad === 'SECRETA'
          ? [p.resultado.emitidas, p.resultado.blanco, p.resultado.conteo.map((k) => [k.id, k.votos])]
          : [p.resultado.si, p.resultado.no, p.resultado.abstencion],
      ])))
      .digest('hex');
    return {
      corporacion: d.config,
      sesion: d.sesion,
      quorum: q,
      asistentes: pres.map((c) => ({ nombre: `${c.apellido}, ${c.nombre}`, partido: c.partido, hora: d.asistencia[c.id]?.horaCheckin || '' })),
      puntos: votados.map((p) => ({
        titulo: p.titulo,
        modalidad: p.modalidad,
        mayoria: p.mayoria,
        tipo: p.tipo,
        ronda: p.resultado.ronda,
        veredicto: p.resultado.veredicto,
        razon: p.resultado.razon,
        formula: p.resultado.formula,
        ...p.resultado,
        nominal: p.modalidad === 'NOMINAL'
          ? d.concejales
              .filter((c) => d.asistencia[c.id]?.estado === 'PRESENTE')
              .slice()
              .sort((a, b) => String(a.apellido).localeCompare(String(b.apellido), 'es'))
              .map((c) => ({
                nombre: `${c.apellido}, ${c.nombre}`,
                partido: c.partido,
                voto: d.votos[p.id]?.[c.id]?.ronda === p.resultado.ronda
                  ? d.votos[p.id][c.id].valor : 'NO VOTÓ',
                impedido: d.impedimentos[p.id]?.[c.id]?.estado === 'APROBADO',
              }))
          : null,
        impedidos: Object.entries(d.impedimentos[p.id] || {})
          .filter(([, v]) => v && v.estado === 'APROBADO')
          .map(([cid]) => {
            const c = d.concejales.find((x) => x.id === cid);
            return c ? `${c.apellido}, ${c.nombre}` : cid;
          }),
        comision: (d.comisiones[p.id]?.miembros || []).map((m) => {
          const c = d.concejales.find((x) => x.id === m.concejalId);
          return c ? `${c.apellido}, ${c.nombre}` : m.concejalId;
        }),
      })),
      huella,
      cadena: estado.verificarCadena(),
      borrador: true,
      advertencia: 'BORRADOR — SIN VALIDEZ JURÍDICA',
    };
  }

  /* ─────────── Servidor HTTP ─────────── */

  const servidor = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch (e) {
      return fallo(res, 400, 'URL inválida');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, x-mesa',
      });
      return res.end();
    }

    try {
      if (url.pathname.startsWith('/api/')) {
        const body = req.method === 'POST' ? await leerBody(req) : {};
        return await api(req, res, url, body);
      }

      if (req.method !== 'GET') return fallo(res, 405, 'Método no permitido');
      const paginas = {
        '/': 'mesa.html', '/mesa': 'mesa.html', '/index.html': 'mesa.html',
        '/proyector': 'proyector.html', '/proyector.html': 'proyector.html',
        '/credenciales': 'credenciales.html', '/credenciales.html': 'credenciales.html',
        '/acta': 'acta.html', '/acta.html': 'acta.html',
      };
      if (paginas[url.pathname]) return servirArchivo(res, paginas[url.pathname]);
      const movil = url.pathname.match(/^\/c\/[^/]+$/);
      if (movil) return servirArchivo(res, 'movil.html');
      if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      const rel = url.pathname.replace(/^\/+/, '');
      if (/^(css|js|img)\//.test(rel)) return servirArchivo(res, rel);
      return fallo(res, 404, 'No se encontró la página');
    } catch (e) {
      const status = e.status || 500;
      if (!res.headersSent) fallo(res, status, e.message || 'Error interno');
      else res.end();
    }
  });

  const latido = setInterval(() => {
    for (const res of clientesSSE) {
      try { res.write(': latido\n\n'); } catch (e) { clientesSSE.delete(res); }
    }
  }, 20000);
  latido.unref();

  return {
    servidor,
    estado,
    tokenMesa,
    publico,
    acta,
    iniciar: () => new Promise((resolve, reject) => {
      const intentar = (p) => {
        puertoActivo = p;
        const onError = (e) => {
          servidor.removeListener('listening', onListen);
          if (e.code === 'EADDRINUSE' && p < puertoMax) intentar(p + 1);
          else reject(e);
        };
        const onListen = () => {
          servidor.removeListener('error', onError);
          resolve({ ...red(), tokenMesa });
        };
        servidor.once('error', onError);
        servidor.once('listening', onListen);
        servidor.listen(p, '0.0.0.0');
      };
      intentar(puerto);
    }),
    detener: () => new Promise((resolve) => {
      for (const res of clientesSSE) { try { res.end(); } catch (e) {} }
      clientesSSE.clear();
      clearInterval(latido);
      servidor.close(() => resolve());
    }),
    info: () => ({ ...red(), tokenMesa }),
  };
}

module.exports = { crearServidor, ipLocal };
