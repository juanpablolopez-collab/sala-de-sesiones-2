'use strict';

/**
 * Lógica pura de quórum y escrutinio.
 * Sin disco, sin red, sin estado global: misma entrada produce siempre la misma salida.
 * Esta es la capa que se prueba con `npm test`.
 */

/** Techo entero tolerante al error de punto flotante. */
const techo = (n) => Math.ceil(n - 1e-9);

/** Redondea y valida una fracción n/d. Lanza si no es usable. */
function fraccion(num, den, nombre) {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isInteger(n) || !Number.isInteger(d) || n <= 0 || d <= 0) {
    throw new Error(`La fracción de ${nombre} debe ser dos enteros positivos`);
  }
  if (n > d) {
    throw new Error(`La fracción de ${nombre} no puede ser mayor que 1`);
  }
  return { num: n, den: d };
}

/** Umbrales derivados de la configuración de la corporación. */
function umbrales(cfg) {
  const delib = fraccion(cfg.delibNum, cfg.delibDen, 'quórum deliberatorio');
  const deci = fraccion(cfg.deciNum, cfg.deciDen, 'quórum decisorio');
  const calif = fraccion(cfg.califNum, cfg.califDen, 'mayoría calificada');
  const total = Math.max(0, Math.floor(Number(cfg.total) || 0));
  return {
    total,
    deliberatorio: techo((total * delib.num) / delib.den),
    // El quórum decisorio es "más de la mitad": floor(total/2) + 1.
    decisorio: Math.floor((total * deci.num) / deci.den) + 1,
    calificada: techo((total * calif.num) / calif.den),
  };
}

/** Base de cálculo: los impedimentos pueden o no reducirla, según el reglamento. */
function baseCalculo(cfg, impedidos = 0) {
  const total = Math.max(0, Math.floor(Number(cfg.total) || 0));
  const imp = Math.max(0, Math.floor(Number(impedidos) || 0));
  return cfg.impedimentoReduceBase ? Math.max(0, total - imp) : total;
}

/** Votos a favor necesarios. `null` = mayoría simple (no hay umbral fijo). */
function votosRequeridos(cfg, tipoMayoria, impedidos = 0) {
  const base = baseCalculo(cfg, impedidos);
  if (tipoMayoria === 'CALIFICADA') {
    const c = fraccion(cfg.califNum, cfg.califDen, 'mayoría calificada');
    return techo((base * c.num) / c.den);
  }
  if (tipoMayoria === 'ABSOLUTA') return Math.floor(base / 2) + 1;
  return null;
}

/**
 * Escrutinio de votación ordinaria o nominal.
 * Los votos son [{valor: 'SI'|'NO'|'ABSTENCION'}].
 */
function escrutar(cfg, tipoMayoria, votos, impedidos = 0) {
  const validos = Array.isArray(votos) ? votos : [];
  const si = validos.filter((v) => v && v.valor === 'SI').length;
  const no = validos.filter((v) => v && v.valor === 'NO').length;
  const abstencion = validos.filter((v) => v && v.valor === 'ABSTENCION').length;
  const base = baseCalculo(cfg, impedidos);
  const requeridos = votosRequeridos(cfg, tipoMayoria, impedidos);
  const emitidos = si + no + abstencion;

  let veredicto;
  let razon;
  let formula;

  if (emitidos === 0) {
    veredicto = 'NEGADO';
    razon = 'No se emitió ningún voto.';
    formula = 'sin votos emitidos';
  } else if (tipoMayoria === 'SIMPLE') {
    veredicto = si > no ? 'APROBADO' : si === no ? 'EMPATE' : 'NEGADO';
    razon = si > no
      ? 'Más votos a favor que en contra.'
      : si === no
        ? 'Empate: procede repetir la votación.'
        : 'Más votos en contra que a favor.';
    formula = `mayoría simple → más Sí que No · Sí=${si} No=${no} (abstenciones=${abstencion}, no computan)`;
  } else {
    veredicto = si >= requeridos ? 'APROBADO' : 'NEGADO';
    razon = si >= requeridos
      ? `Se alcanzó la mayoría ${tipoMayoria.toLowerCase()} exigida.`
      : `Faltaron ${requeridos - si} votos para la mayoría ${tipoMayoria.toLowerCase()}.`;
    formula = tipoMayoria === 'ABSOLUTA'
      ? `base=${base} · absoluta = ⌊${base}/2⌋+1 = ${requeridos} · a favor=${si}`
      : `base=${base} · calificada = ⌈${base}×${cfg.califNum}/${cfg.califDen}⌉ = ${requeridos} · a favor=${si}`;
  }

  return { si, no, abstencion, emitidos, base, requeridos, veredicto, razon, formula, impedidos };
}

/**
 * Escrutinio de elección con voto secreto.
 * Recibe boletas ya descifradas: [{candidatoId: string|null}], sin vínculo con el emisor.
 */
function escrutarEleccion(cfg, tipoMayoria, boletas, candidatos, impedidos = 0) {
  const lista = Array.isArray(candidatos) ? candidatos : [];
  const depositadas = Array.isArray(boletas) ? boletas : [];
  const conteo = lista.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    votos: depositadas.filter((b) => b && b.candidatoId === c.id).length,
  }));
  const blanco = depositadas.filter((b) => b && !b.candidatoId).length;
  const emitidas = depositadas.length;
  const base = baseCalculo(cfg, impedidos);
  const requeridosFijos = votosRequeridos(cfg, tipoMayoria, impedidos);
  // En mayoría simple el umbral se calcula sobre lo efectivamente depositado.
  const requeridos = requeridosFijos ?? Math.floor(emitidas / 2) + 1;

  const orden = [...conteo].sort((a, b) => b.votos - a.votos || a.nombre.localeCompare(b.nombre, 'es'));
  const puntero = orden[0] || { id: null, nombre: '—', votos: 0 };
  const segundo = orden[1] || { votos: -1 };

  let veredicto;
  let razon;
  if (emitidas === 0) {
    veredicto = 'NEGADO';
    razon = 'No se depositó ninguna boleta.';
  } else if (puntero.votos === 0) {
    veredicto = 'NEGADO';
    razon = 'Todas las boletas fueron en blanco; ningún candidato recibió votos.';
  } else if (puntero.votos === segundo.votos) {
    veredicto = 'EMPATE';
    razon = `Empate entre los candidatos más votados con ${puntero.votos} voto(s) cada uno.`;
  } else if (puntero.votos >= requeridos) {
    veredicto = 'APROBADO';
    razon = `${puntero.nombre} resulta elegido con ${puntero.votos} voto(s).`;
  } else {
    veredicto = 'NEGADO';
    razon = `Ningún candidato alcanzó los ${requeridos} votos requeridos; procede nueva votación.`;
  }

  return {
    conteo, blanco, emitidas, base, requeridos, veredicto, razon, impedidos,
    electo: veredicto === 'APROBADO' ? { id: puntero.id, nombre: puntero.nombre } : null,
     formula: `boletas depositadas = ${emitidas} (en blanco ${blanco}) · `
      + `mayoría ${String(tipoMayoria).toLowerCase()} sobre base ${base} = ${requeridos} · `
      + `más votado = ${puntero.nombre} con ${puntero.votos}`,
  };
}

/** Estado del quórum en un momento dado. */
function estadoQuorum(cfg, presentes) {
  const u = umbrales(cfg);
  const p = Math.max(0, Math.floor(Number(presentes) || 0));
  return {
    presentes: p,
    total: u.total,
    umbralDeliberatorio: u.deliberatorio,
    umbralDecisorio: u.decisorio,
    hayDeliberatorio: p >= u.deliberatorio,
    hayDecisorio: p >= u.decisorio,
    faltanDeliberatorio: Math.max(0, u.deliberatorio - p),
    faltanDecisorio: Math.max(0, u.decisorio - p),
  };
}

/** Modalidades admitidas según el tipo de punto. */
function modalidadesPermitidas(tipoPunto) {
  if (tipoPunto === 'ELECCION') return ['SECRETA', 'NOMINAL', 'ORDINARIA'];
  if (tipoPunto === 'INFORMATIVO') return [];
  return ['ORDINARIA', 'NOMINAL'];
}

/** Valida un conjunto de fracciones antes de guardarlo. */
function validarConfig(cfg) {
  const errores = [];
  for (const [clave, etiqueta] of [
    ['delib', 'quórum deliberatorio'],
    ['deci', 'quórum decisorio'],
    ['calif', 'mayoría calificada'],
  ]) {
    try { fraccion(cfg[`${clave}Num`], cfg[`${clave}Den`], etiqueta); }
    catch (e) { errores.push(e.message); }
  }
  // El «+ 1» de `umbrales()` convierte cualquier fracción en «más de esa parte».
  // Por eso 1/2 es válido y significa mayoría absoluta (7 de 13, por ejemplo).
  return errores;
}

module.exports = {
  techo, fraccion, umbrales, baseCalculo, votosRequeridos,
  escrutar, escrutarEleccion, estadoQuorum, modalidadesPermitidas, validarConfig,
};
