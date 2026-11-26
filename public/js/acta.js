/* Acta imprimible. Se genera desde el estado, nunca desde la memoria de un navegador. */
(function () {
  'use strict';

  const S = window.SALA;
  const esc = S.esc;
  let acta = null;

  function tabla(cabeceras, filas) {
    return `<div class="tabla-wrap"><table><thead><tr>${cabeceras.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function render(a) {
    const c = a.corporacion;
    const s = a.sesion;
    document.getElementById('titulo').textContent =
      `Acta de la sesión ${s.numero} de ${s.anio} (${s.tipo.toLowerCase()})`;
    document.getElementById('encabezado').innerHTML =
      `${esc(c.nombreCorporacion)} · ${esc(c.municipio)}<br>`
      + `${esc(s.lugar)} · ${S.fecha(s.fecha)}`
      + (s.horaInicio ? ` · iniciada a las ${S.hora(s.horaInicio)}` : '')
      + (s.horaFin ? ` · terminada a las ${S.hora(s.horaFin)}` : '');

    let html = '';
    html += `<h2>1. Asistencia y quórum</h2>`;
    html += `<p>Total del padrón: <strong>${a.quorum.total}</strong>. Presentes: <strong>${a.quorum.presentes}</strong>. `
      + `Quórum deliberatorio: ${a.quorum.umbralDeliberatorio}. Quórum decisorio: ${a.quorum.umbralDecisorio}.</p>`;
    html += tabla(['Concejal', 'Partido', 'Hora de ingreso'], a.asistentes.map((x) => [
      esc(x.nombre), esc(x.partido), esc(S.hora(x.hora)),
    ]));

    html += `<h2>2. Desarrollo de los puntos votados</h2>`;
    if (!a.puntos.length) {
      html += '<p class="muted">No se ha cerrado ninguna votación.</p>';
    }
    for (const [i, p] of a.puntos.entries()) {
      const tono = p.veredicto === 'APROBADO' ? '#1d7c4b' : p.veredicto === 'EMPATE' ? '#9a6b12' : '#a32c24';
      html += `<h3>${i + 1}. ${esc(p.titulo)}</h3>
        <p><strong>Veredicto:</strong> <span style="color:${tono}">${esc(p.veredicto)}</span> ·
        Modalidad ${esc(S.etiquetaModalidad[p.modalidad] || p.modalidad)} ·
        Mayoría ${esc(S.etiquetaMayoria[p.mayoria] || p.mayoria)} · Ronda ${p.ronda}.</p>
        <p>${esc(p.razon)}</p>
        <p class="pequeno">Cálculo: ${esc(p.formula || '')}</p>`;
      if (p.conteo) {
        html += tabla(['Candidato', 'Votos'], p.conteo.map((k) => [esc(k.nombre), k.votos]));
        html += `<p class="pequeno">Boletas depositadas: ${p.emitidas} · en blanco: ${p.blanco} · `
          + `umbral: ${p.requeridos}${p.electo ? ` · electo: ${esc(p.electo.nombre)}` : ''}</p>`;
      } else {
        html += `<p>Sí: ${p.si} · No: ${p.no} · Abstenciones: ${p.abstencion} · Votos emitidos: ${p.emitidos} · `
          + `Umbral: ${p.requeridos === null ? 'mayoría simple' : p.requeridos}</p>`;
      }
      if (p.impedidos?.length) {
        html += `<p class="pequeno"><strong>Impedimentos aprobados:</strong> ${p.impedidos.map(esc).join('; ')}</p>`;
      }
      if (p.comision?.length) {
        html += `<p class="pequeno"><strong>Comisión escrutadora:</strong> ${p.comision.map(esc).join('; ')}. `
          + 'Los fragmentos de clave no se conservan en el archivo.</p>';
      }
      if (p.nominal) {
        html += `<h4>Votación nominal</h4>` + tabla(['Concejal', 'Partido', 'Voto', 'Impedimento'],
          p.nominal.map((v) => [esc(v.nombre), esc(v.partido), esc(v.voto),
            v.impedido ? 'Sí' : 'No']));
      }
    }

    html += `<h2>3. Registro y huella</h2>
      <p>Eventos registrados: ${a.cadena.registros}. Cadena de actividad:
      <strong>${a.cadena.ok ? 'íntegra' : 'ROTA'}</strong>.</p>
      <p class="huella">Huella del acta (SHA-256): ${esc(a.huella)}</p>
      <p class="pequeno">Esta comprobación detecta cambios posteriores en el archivo local. No constituye una auditoría externa ni da validez jurídica al documento.</p>`;

    document.getElementById('cuerpo').innerHTML = html;
    document.getElementById('firmas').innerHTML = `<div class="firma">
      <div>Presidenta o Presidente</div><div>Secretaría General</div></div>
      <p class="centro pequeno" style="margin-top:34px">BORRADOR — SIN VALIDEZ JURÍDICA · Generado por Sala de Sesiones 2.0</p>`;
  }

  async function cargar() {
    try {
      acta = await S.api('/api/acta');
      render(acta);
    } catch (e) {
      document.getElementById('encabezado').textContent = 'No se pudo cargar el acta: ' + e.message;
      S.toast(e.message, 'err');
    }
  }

  document.getElementById('imprimir').addEventListener('click', () => window.print());
  document.getElementById('volver').addEventListener('click', () => { location.href = '/'; });
  document.getElementById('json').addEventListener('click', () => {
    if (!acta) return;
    S.descargarTexto(`acta-sesion-${acta.sesion.numero}.json`, JSON.stringify(acta, null, 2), 'application/json');
  });
  document.getElementById('csv').addEventListener('click', () => {
    if (!acta) return;
    const filas = [['punto', 'modalidad', 'mayoria', 'ronda', 'veredicto', 'razon']].concat(
      acta.puntos.map((p) => [p.titulo, p.modalidad, p.mayoria, p.ronda, p.veredicto, p.razon]));
    const csv = filas.map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    S.descargarTexto(`resultados-sesion-${acta.sesion.numero}.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8');
  });

  cargar();
})();
