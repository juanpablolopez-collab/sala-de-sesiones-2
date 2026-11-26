/* Hojas imprimibles con el QR y la clave de cada concejal. */
(function () {
  'use strict';

  const S = window.SALA;
  const esc = S.esc;
  let datos = null;

  async function cargar() {
    try {
      datos = await S.api('/api/credenciales');
    } catch (e) {
      S.toast(e.message, 'err');
      document.getElementById('credenciales').innerHTML =
        `<div class="aviso" style="background:#ffeceb">No se pudieron generar las credenciales: ${esc(e.message)}</div>`;
      return;
    }
    const s = datos.sesion;
    document.getElementById('detalles').textContent =
      `${datos.config.nombreCorporacion} · ${datos.config.municipio} · Sesión ${s.numero} de ${s.anio} · ${s.tipo}`;
    document.getElementById('escudo').innerHTML =
      `${esc(datos.config.municipio)}<br>${esc(datos.config.nombreCorporacion)}<br>BORRADOR — SIN VALIDEZ JURÍDICA`;
    document.getElementById('url-base').textContent = datos.urlBase;
    document.getElementById('credenciales').innerHTML = datos.credenciales.map((c, i) => `
      <div class="cred">
        <div class="pequeno muted">N.º ${String(i + 1).padStart(2, '0')}</div>
        <img src="${c.png}" alt="QR de ${esc(S.nombreCompleto(c.concejal))}">
        <div class="nombre">${esc(S.nombreCompleto(c.concejal))}</div>
        <div class="partido">${esc(c.concejal.partido)}</div>
        <div class="url">${esc(c.url)}</div>
        <div class="partido">Clave: <strong class="mono">${esc(c.token)}</strong></div>
      </div>`).join('');
    document.getElementById('pie').textContent =
      `Generadas el ${S.fecha(new Date().toISOString())} · ${datos.credenciales.length} credenciales · `
      + 'Documento de demostración sin validez jurídica.';
  }

  document.getElementById('imprimir').addEventListener('click', () => window.print());
  document.getElementById('volver').addEventListener('click', () => { location.href = '/'; });
  document.getElementById('csv').addEventListener('click', () => {
    if (!datos) return;
    const filas = [['apellido', 'nombre', 'partido', 'clave', 'url']].concat(datos.credenciales.map((c) => [
      c.concejal.apellido, c.concejal.nombre, c.concejal.partido, c.token, c.url,
    ]));
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    S.descargarTexto(`credenciales-sesion-${datos.sesion.numero}.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8');
  });

  cargar();
})();
