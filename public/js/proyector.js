/* Pantalla grande del recinto: quórum, punto en curso y resultado. */
(function () {
  'use strict';

  const S = window.SALA;
  const contenido = document.getElementById('contenido');
  const esc = S.esc;

  function reloj() {
    document.getElementById('reloj').textContent = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }
  reloj();
  setInterval(reloj, 1000);

  function caja(valor, etiqueta, tono) {
    return `<div class="salon-caja"><strong style="color:${tono || 'var(--gold-soft)'}">${valor}</strong><span>${etiqueta}</span></div>`;
  }

  function resultado(p) {
    if (!p.resultado) {
      return `<div class="salon-grid">
        ${caja(p.emitidos, 'votos registrados')}
        ${caja(p.impedidos, 'impedimentos')}
        ${caja(p.modalidad ? S.etiquetaModalidad[p.modalidad] : '—', 'modalidad')}
      </div>`;
    }
    const r = p.resultado;
    const aprobado = r.veredicto === 'APROBADO';
    const tono = aprobado ? 'var(--green)' : r.veredicto === 'EMPATE' ? 'var(--gold)' : 'var(--red)';
    const filas = r.conteo
      ? r.conteo.map((k) => `${esc(k.nombre)} — ${k.votos} voto(s)`).join('<br>')
      : `Sí: ${r.si} · No: ${r.no} · Abstenciones: ${r.abstencion}`;
    return `<div class="resultado" style="color:${tono}">${r.veredicto}</div>
      <p class="muted">${esc(r.razon)}</p>
      <p class="pequeno">${filas}${r.blanco !== undefined ? `<br>Boletas en blanco: ${r.blanco}` : ''}</p>`;
  }

  function render(d) {
    if (!d) return;
    const s = d.sesion;
    const q = d.quorum;
    const conexion = document.getElementById('conexion');
    conexion.innerHTML = `<span class="dot on"></span> En vivo · ${d.servidor.conexiones} pantalla(s)`;

    document.getElementById('corporacion').textContent =
      `${d.config.nombreCorporacion} · ${d.config.municipio}`;
    document.getElementById('sesion').textContent =
      `Sesión ${s.numero} de ${s.anio} · ${S.etiquetaEstado[s.estado] || s.estado} · ${s.tipo}`;

    const enCurso = d.puntos.find((p) => ['EN_VOTACION', 'EN_ESCRUTINIO'].includes(p.estado));
    if (enCurso) {
      contenido.innerHTML = `
        <div class="brand-sub">Punto ${enCurso.orden} del orden del día · ${S.etiquetaMayoria[enCurso.mayoria] || enCurso.mayoria}</div>
        <div class="titulo-punto">${esc(enCurso.titulo)}</div>
        ${S.badge(S.etiquetaModalidad[enCurso.modalidad] || enCurso.modalidad, 'gold')}
        ${enCurso.estado === 'EN_ESCRUTINIO'
          ? '<div class="aviso" style="margin-top:20px">Urna cerrada. La comisión escrutadora está abriendo el material.</div>'
          : `<div class="salon-grid">
              ${caja(enCurso.emitidos, `votos de ${q.presentes} presentes`)}
              ${caja(Math.max(0, q.presentes - enCurso.emitidos), 'sin votar')}
              ${caja(enCurso.impedidos, 'impedimentos')}
            </div>
            <div class="progress" style="margin-top:22px"><i style="width:${q.presentes ? Math.min(100, enCurso.emitidos / q.presentes * 100) : 0}%"></i></div>`}
        ${enCurso.resultado ? `<div style="margin-top:24px">${resultado(enCurso)}</div>` : ''}`;
      return;
    }

    const ultimo = [...d.puntos].reverse().find((p) => p.resultado);
    if (ultimo) {
      contenido.innerHTML = `
        <div class="brand-sub">Punto ${ultimo.orden} · resultado de la ronda ${ultimo.resultado.ronda}</div>
        <div class="titulo-punto">${esc(ultimo.titulo)}</div>
        ${resultado(ultimo)}
        <div class="salon-grid" style="margin-top:24px">
          ${caja(q.presentes, 'concejales presentes')}
          ${caja(q.umbralDecisorio, 'quórum decisorio', q.hayDecisorio ? 'var(--green)' : 'var(--red)')}
          ${caja(d.puntos.filter((p) => p.resultado).length, 'puntos resueltos')}
        </div>`;
      return;
    }

    contenido.innerHTML = `
      <div class="salon-num">${q.presentes}</div>
      <h1>Concejales presentes</h1>
      <p class="muted">de ${q.total} integrantes · quórum deliberatorio ${q.umbralDeliberatorio} · decisorio ${q.umbralDecisorio}</p>
      <div class="salon-grid">
        ${caja(q.hayDeliberatorio ? 'SÍ' : 'NO', 'quórum deliberatorio', q.hayDeliberatorio ? 'var(--green)' : 'var(--red)')}
        ${caja(q.hayDecisorio ? 'SÍ' : 'NO', 'quórum decisorio', q.hayDecisorio ? 'var(--green)' : 'var(--red)')}
        ${caja(d.puntos.length, 'puntos en el orden del día')}
      </div>
      <p class="pequeno muted" style="margin-top:26px">${esc(s.estado === 'ABIERTA'
        ? 'La Secretaría abrirá el primer punto cuando la mesa esté lista.'
        : s.estado === 'CERRADA' ? 'La sesión ha terminado.' : 'Instalando la sesión…')}</p>`;
  }

  document.getElementById('pantalla-completa').addEventListener('click', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  document.getElementById('volver').addEventListener('click', () => { location.href = '/'; });

  S.onEstado(render);
  S.conectar();
})();
