/* Utilidades compartidas por todas las pantallas. */
(function () {
  'use strict';

  const parametros = new URLSearchParams(location.search);
  const tokenUrl = parametros.get('k');
  if (tokenUrl) sessionStorage.setItem('sala-mesa-token', tokenUrl);
  const tokenMesa = tokenUrl || sessionStorage.getItem('sala-mesa-token') || '';
  // En el puesto del concejal la credencial viaja en /c/<clave>. Todas las
  // acciones (asistencia, voto, impedimento, comisión) deben enviarla al
  // servidor; si no, responden «Credencial inválida» aunque /api/yo sí sirvió.
  const tokenConcejal = decodeURIComponent(
    (location.pathname.match(/^\/c\/([^/]+)/) || [])[1] || '');

  const escuchas = new Set();
  let estado = null;
  let ultimoMensaje = Date.now();

  function toast(mensaje, tipo) {
    let n = document.getElementById('toast');
    if (!n) {
      n = document.createElement('div');
      n.id = 'toast';
      document.body.appendChild(n);
    }
    n.textContent = String(mensaje || '');
    n.className = 'on' + (tipo ? ' ' + tipo : '');
    clearTimeout(n._t);
    n._t = setTimeout(() => { n.className = ''; }, 4800);
  }

  async function api(ruta, opciones) {
    const op = Object.assign({}, opciones || {});
    op.headers = Object.assign({}, op.headers || {});
    if (op.body && typeof op.body !== 'string') {
      op.headers['content-type'] = 'application/json';
      op.body = JSON.stringify(op.body);
    }
    if (tokenMesa) op.headers['x-mesa'] = tokenMesa;
    const respuesta = await fetch(ruta, op);
    let datos;
    try { datos = await respuesta.json(); }
    catch (e) { datos = { error: 'La respuesta del servidor no se pudo leer' }; }
    if (!respuesta.ok) {
      const err = new Error(datos.error || `Error ${respuesta.status}`);
      err.status = respuesta.status;
      err.datos = datos;
      throw err;
    }
    return datos;
  }

  function post(ruta, cuerpo) {
    const datos = Object.assign({}, cuerpo || {});
    if (tokenConcejal && datos.token === undefined) datos.token = tokenConcejal;
    return api(ruta, { method: 'POST', body: datos });
  }

  function onEstado(fn) {
    escuchas.add(fn);
    if (estado) { try { fn(estado); } catch (e) { console.error(e); } }
    return () => escuchas.delete(fn);
  }

  function publicar(datos) {
    estado = datos;
    ultimoMensaje = Date.now();
    for (const fn of escuchas) {
      try { fn(datos); } catch (e) { console.error(e); }
    }
  }

  function conectar() {
    if (typeof EventSource === 'undefined') {
      setInterval(async () => {
        try { publicar(await api('/api/estado')); } catch (e) { /* sigue intentando */ }
      }, 4000);
      return;
    }
    const fuente = new EventSource('/api/eventos');
    fuente.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.tipo === 'estado') publicar(msg.datos);
      } catch (e) { /* ignora mensajes mal formados */ }
    };
    fuente.onerror = () => { /* EventSource reintenta solo */ };
    // Respaldo: si el servidor se reinicia, EventSource reintenta; esto además
    // garantiza estado fresco aunque se pierda un mensaje.
    setInterval(async () => {
      if (Date.now() - ultimoMensaje > 15000) {
        try { publicar(await api('/api/estado')); } catch (e) { /* sigue intentando */ }
      }
    }, 8000);
  }

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const hora = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const fecha = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const nombreCompleto = (c) => `${c.apellido || ''}, ${c.nombre || ''}`.replace(/^,\s*/, '');

  const etiquetaModalidad = {
    ORDINARIA: 'Ordinaria', NOMINAL: 'Nominal', SECRETA: 'Secreta',
  };
  const etiquetaMayoria = {
    SIMPLE: 'Simple', ABSOLUTA: 'Absoluta', CALIFICADA: 'Calificada',
  };
  const etiquetaEstado = {
    PROGRAMADA: 'Programada', ABIERTA: 'Abierta', CERRADA: 'Cerrada',
    PENDIENTE: 'Pendiente', EN_VOTACION: 'En votación', EN_ESCRUTINIO: 'En escrutinio',
    CERRADO: 'Cerrado', EMPATE: 'Empate',
  };

  function badge(texto, tono) {
    return `<span class="badge ${tono || ''}">${esc(texto)}</span>`;
  }

  async function cargarQR(url, img) {
    try {
      const datos = await api('/api/qr?u=' + encodeURIComponent(url));
      if (img) img.src = datos.png;
      return datos.png;
    } catch (e) {
      return null;
    }
  }

  function descargarTexto(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.SALA = {
    tokenMesa, tokenConcejal,
    api, post, toast, onEstado, conectar, esc, hora, fecha, nombreCompleto,
    etiquetaModalidad, etiquetaMayoria, etiquetaEstado, badge, cargarQR, descargarTexto,
    get estado() { return estado; },
  };
})();
