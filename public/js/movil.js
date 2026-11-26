/* Puesto del concejal: asistencia, voto y ceremonial de la comisión. */
(function () {
  'use strict';

  const S = window.SALA;
  const panel = document.getElementById('panel');
  const scanner = document.getElementById('escaner');
  const video = document.getElementById('video');
  const token = S.tokenConcejal || decodeURIComponent((location.pathname.match(/^\/c\/([^/]+)/) || [])[1] || '');

  let yo = null;
  let candidatoElegido = null;
  let pines = {};
  let enLinea = true;
  let flujo = null;
  let ultimoRender = '';

  function marcarLinea(ok) {
    enLinea = ok;
    document.getElementById('offline').classList.toggle('on', !ok);
    const p = document.getElementById('conexion');
    p.innerHTML = `<span class="dot ${ok ? 'on' : 'off'}"></span> ${ok ? 'Conectado' : 'Sin conexión'}`;
  }

  async function cargar() {
    if (!token) {
      panel.innerHTML = `<section class="card"><h2>Credencial no válida</h2>
        <p class="error-text">Falta la clave en la dirección.</p>
        <p class="help">Escanee el código QR de una <strong>credencial personal</strong>. El código QR de la mesa solo sirve para probar la red.</p>
        <label class="field"><span>Clave impresa debajo del QR</span>
          <input id="token-manual-error" inputmode="text" autocomplete="off" placeholder="32 caracteres"></label>
        ${boton('ir-token', 'Abrir credencial', 'primary block')}
        ${boton('escanear', 'Escanear otra credencial', 'sm')}</section>`;
      return;
    }
    try {
      yo = await S.api('/api/yo/' + encodeURIComponent(token));
      document.getElementById('nombre').textContent = S.nombreCompleto(yo.concejal);
      const s = yo.sesion;
      document.getElementById('sesion-info').textContent =
        `Sesión ${s.numero} de ${s.anio} · ${s.tipo.toLowerCase()}`;
      marcarLinea(true);
    } catch (e) {
      marcarLinea(false);
      panel.innerHTML = `<section class="card"><h2>Credencial no válida</h2>
        <p class="error-text">${S.esc(e.message)}</p>
        <p class="help">Puede ser de otra sesión, de un padrón guardado después de imprimir o un QR de prueba de la mesa (ese solo verifica la red). Pida una hoja nueva a la Secretaría o escriba la clave impresa debajo del código.</p>
        <label class="field"><span>Clave impresa debajo del QR</span>
          <input id="token-manual-error" inputmode="text" autocomplete="off" placeholder="32 caracteres" value="${S.esc(token)}"></label>
        <div class="btn-row">${boton('ir-token', 'Abrir credencial', 'primary')}${boton('escanear', 'Escanear otra', 'sm')}</div></section>`;
      return;
    }
    render();
  }

  function boton(accion, texto, clase, extra) {
    return `<button class="btn ${clase || ''}" data-acc="${accion}" ${extra || ''}>${texto}</button>`;
  }

  function capturar() {
    const campos = {};
    panel.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.id) campos[el.id] = el.value;
    });
    const activo = document.activeElement;
    return {
      campos,
      foco: activo && panel.contains(activo) ? activo.id : null,
    };
  }

  function restaurar(g) {
    if (!g) return;
    for (const [id, valor] of Object.entries(g.campos)) {
      const el = document.getElementById(id);
      if (el && el.value !== valor) el.value = valor;
    }
    if (g.foco) document.getElementById(g.foco)?.focus();
  }

  function estadoVoto() {
    if (!yo.punto) return '';
    if (yo.yaDeposite) {
      return '<div class="aviso green"><strong>Boleta depositada.</strong> Ya puede cerrar la pantalla; no se puede cambiar el voto secreto.</div>';
    }
    if (yo.miVoto) {
      return `<div class="aviso green"><strong>Voto registrado: ${S.esc(yo.miVoto)}.</strong> Puede cerrar esta pantalla.</div>`;
    }
    return '';
  }

  function vistaPunto() {
    if (!yo.punto) {
      const q = yo.quorum;
      return `<section class="card centro">
        <h2>Sesión ${S.esc(S.estado?.sesion?.numero || yo.sesion.numero)}</h2>
        <p class="muted">No hay ninguna votación abierta en este momento.</p>
        <div class="metric" style="justify-content:center"><strong>${q.presentes}</strong><span>presentes de ${q.total}</span></div>
        <div class="progress ${q.hayDecisorio ? 'ok' : ''}"><i style="width:${q.total ? q.presentes / q.total * 100 : 0}%"></i></div>
        <p class="help">Quórum deliberatorio ${q.umbralDeliberatorio} · decisorio ${q.umbralDecisorio}</p>
        ${boton('actualizar', 'Actualizar', 'primary')}
      </section>`;
    }

    const p = yo.punto;
    const comun = `<section class="card">
      <div class="entre"><h2>${S.esc(p.titulo)}</h2>${S.badge(S.etiquetaModalidad[p.modalidad] || p.modalidad, 'gold')}</div>
      <p class="help">Ronda ${p.ronda} · mayoría ${S.etiquetaMayoria[p.mayoria] || p.mayoria}</p>
      ${estadoVoto()}
      ${yo.miImpedimento === 'DECLARADO' ? '<div class="aviso">Impedimento declarado: esperando a que la mesa lo resuelva.</div>' : ''}
      ${yo.yaDeposite || yo.miVoto ? '' : `<div class="btn-row" style="margin-top:10px">${boton('impedimento', 'Declarar impedimento', 'sm')}</div>`}
    </section>`;

    if (p.modalidad === 'SECRETA') {
      if (yo.yaDeposite) return comun;
      return comun + `<section class="card">
        <h3>Su boleta</h3>
        <p class="help">Elija un candidato o deje la boleta en blanco. Nadie podrá saber cuál eligió: el sistema guarda por separado quién votó y qué votó.</p>
        <div class="stack">
          ${(yo.candidatos || []).map((c) => `<button class="candidato ${candidatoElegido === c.id ? 'sel' : ''}" data-acc="elegir" data-id="${c.id}">
            <span class="marca">${candidatoElegido === c.id ? '✓' : ''}</span>
            <span><strong>${S.esc(c.nombre)}</strong><br><small>${S.esc(c.cargo || '')}</small></span></button>`).join('')}
        </div>
        ${boton('depositar', 'Depositar boleta', 'primary big block')}
        <div class="btn-row" style="margin-top:10px">${boton('blanco', 'Votar en blanco', 'sm')} ${candidatoElegido ? boton('limpiar', 'Quitar selección', 'sm') : ''}</div>
      </section>`;
    }

    if (yo.yaDeposite || yo.miVoto) return comun;
    const puedeAbstencion = yo.miImpedimento === 'APROBADO';
    return comun + `<section class="card">
      <h3>Emita su voto</h3>
      <div class="opciones">
        <button class="opcion si" data-acc="voto" data-valor="SI">SÍ</button>
        <button class="opcion no" data-acc="voto" data-valor="NO">NO</button>
        <button class="opcion abs" data-acc="voto" data-valor="ABSTENCION" ${puedeAbstencion ? '' : 'disabled title="Requiere impedimento aprobado"'}>ABSTENCIÓN</button>
      </div>
      <p class="help">${puedeAbstencion
        ? 'Su impedimento fue aprobado: solo puede votar en blanco (abstención).'
        : 'La abstención solo se permite con impedimento aprobado por el Presidente.'}</p>
    </section>`;
  }

  function vistaComision() {
    if (!(yo.comisiones || []).length) return '';
    return yo.comisiones.map((c) => {
      const pin = pines[c.puntoId];
      let paso = '';
      if (!c.claveFijada) {
        paso = `<p class="help">Generamos una clave de 6 dígitos para usted. Anótela en un papel: no se guarda en el computador y se le pedirá al abrir la urna.</p>
          ${boton('gen-clave:' + c.puntoId, 'Generar mi clave', 'primary block')}`;
      } else if (!c.confirmada) {
        paso = `<label class="field"><span>Escriba la clave que anotó para confirmarla</span>
          <input id="conf-${c.puntoId}" inputmode="numeric" autocomplete="off" placeholder="6 dígitos"></label>
          ${boton('confirmar:' + c.puntoId, 'Confirmar clave', 'primary block')}
          <p class="help">Descubrir un error ahora cuesta diez segundos; descubrirlo con la urna cerrada obliga a repetir la votación.</p>`;
      } else if (c.enCeremonia && !c.yaAporte) {
        paso = `<label class="field"><span>Escriba su clave para aportar el fragmento</span>
          <input id="apor-${c.puntoId}" inputmode="numeric" autocomplete="off" placeholder="6 dígitos"></label>
          ${boton('aportar:' + c.puntoId, 'Aportar mi fragmento', 'primary block')}
          <p class="help">Aportos: ${c.aportados} de ${c.umbral} necesarios. Su fragmento nunca se guarda en el archivo.</p>`;
      } else if (c.yaAporte) {
        paso = '<div class="aviso green">Ya aportó su fragmento. Esperando a los demás miembros.</div>';
      } else {
        paso = `<div class="aviso green">Clave confirmada. Espere a que la mesa cierre la urna.</div>`;
      }
      return `<section class="card">
        <div class="entre"><h3>Comisión escrutadora</h3>${c.confirmada ? S.badge('confirmada', 'green') : S.badge('pendiente')}</div>
        <p class="help">${S.esc(c.titulo)} · ${c.miembros} miembros · umbral ${c.umbral}</p>
        ${pin ? `<div class="aviso gold"><div class="help">Anote esta clave y guárdela:</div><div class="pin">${S.esc(pin)}</div>
          <div class="help">Se muestra una sola vez. Si la pierde, pida a la Secretaría que designe la comisión de nuevo.</div></div>` : ''}
        ${paso}
      </section>`;
    }).join('');
  }

  function render() {
    if (!yo) return;
    const g = capturar();
    let html = '';
    if (yo.asistencia !== 'PRESENTE') {
      html = `<section class="card centro">
        <h2>Estoy presente</h2>
        <p class="muted">Confirme que es usted antes de registrar su asistencia.</p>
        <p class="mono">${S.esc(S.nombreCompleto(yo.concejal))} · ${S.esc(yo.concejal.partido)}</p>
        ${boton('checkin', 'Estoy presente', 'primary big block')}
        <div class="btn-row" style="justify-content:center;margin-top:12px">${boton('escanear', 'Usar otra credencial', 'sm')}</div>
        <p class="help">Si el celular no abre la dirección, la Secretaría puede registrar su asistencia a mano desde la mesa.</p>
      </section>`;
    } else {
      html = vistaPunto() + vistaComision() + `<section class="card tight centro">
        <p class="pequeno">Asistencia registrada a las ${S.hora(S.estado?.concejales?.find((c) => c.id === yo.concejal.id)?.horaCheckin)}</p>
        <div class="btn-row" style="justify-content:center">${boton('actualizar', 'Actualizar')}${boton('escanear', 'Otra credencial', 'sm')}</div>
      </section>`;
    }
    const firma = html + JSON.stringify([yo.asistencia, yo.miVoto, yo.yaDeposite, candidatoElegido, Object.keys(pines)]);
    if (firma !== ultimoRender) {
      panel.innerHTML = html;
      ultimoRender = firma;
    }
    restaurar(g);
  }

  /* ─── Cámara / QR ─── */

  function detenerCamara() {
    if (flujo) {
      flujo.getTracks().forEach((t) => t.stop());
      flujo = null;
    }
    video.srcObject = null;
    video.style.display = 'none';
  }

  async function iniciarCamara() {
    scanner.classList.remove('oculto');
    const aviso = document.getElementById('estado-escaner');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      aviso.textContent = 'Este navegador no abre la cámara. Use la clave impresa debajo del código QR.';
      return;
    }
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = flujo;
      video.style.display = 'block';
      await video.play();
    } catch (e) {
      aviso.textContent = 'No se pudo abrir la cámara: ' + e.message + '. Use la clave impresa.';
      return;
    }
    if (typeof BarcodeDetector === 'undefined') {
      aviso.textContent = 'Este navegador no detecta QR automáticamente. Escriba la clave impresa debajo del código.';
      return;
    }
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const bucle = async () => {
        if (!flujo) return;
        try {
          const codigos = await detector.detect(video);
          for (const codigo of codigos) {
            try {
              const u = new URL(codigo.rawValue, location.origin);
              const m = u.pathname.match(/^\/c\/([^/]+)/);
              if (m) {
                detenerCamara();
                location.href = '/c/' + encodeURIComponent(decodeURIComponent(m[1]));
                return;
              }
            } catch (e) { /* no era una credencial */ }
          }
        } catch (e) { /* sigue intentando */ }
        setTimeout(bucle, 350);
      };
      aviso.textContent = 'Apunte al código QR de la credencial…';
      bucle();
    } catch (e) {
      aviso.textContent = 'El lector de QR no está disponible. Use la clave impresa.';
    }
  }

  /* ─── Acciones ─── */

  async function accion(acc, dato) {
    try {
      switch (acc) {
        case 'checkin':
          await S.post('/api/checkin');
          S.toast('Asistencia registrada', 'ok');
          await cargar();
          break;
        case 'actualizar': await cargar(); break;
        case 'voto': {
          await S.post('/api/voto', { valor: dato });
          S.toast('Voto registrado', 'ok');
          await cargar();
          break;
        }
        case 'elegir': candidatoElegido = dato; render(); break;
        case 'blanco': candidatoElegido = null; await S.post('/api/voto', { candidatoId: null }); S.toast('Boleta en blanco depositada', 'ok'); await cargar(); break;
        case 'limpiar': candidatoElegido = null; render(); break;
        case 'depositar':
          if (!candidatoElegido && !confirm('No seleccionó candidato: ¿depositar la boleta en blanco?')) break;
          await S.post('/api/voto', { candidatoId: candidatoElegido });
          S.toast('Boleta depositada', 'ok');
          candidatoElegido = null;
          await cargar();
          break;
        case 'impedimento': {
          const motivo = prompt('¿Cuál es el motivo del impedimento? Se registrará en el acta.');
          if (motivo === null) break;
          await S.post('/api/impedimento', { puntoId: yo.punto.id, motivo });
          S.toast('Impedimento declarado: la mesa debe resolverlo', 'ok');
          await cargar();
          break;
        }
        case 'gen-clave': {
          const r = await S.post('/api/comision/clave', { puntoId: dato, generar: true });
          pines[dato] = r.clave;
          S.toast('Anote su clave: se muestra una sola vez', 'ok');
          await cargar();
          break;
        }
        case 'confirmar': {
          const clave = document.getElementById('conf-' + dato)?.value || '';
          await S.post('/api/comision/confirmar', { puntoId: dato, contrasena: clave });
          S.toast('Clave confirmada', 'ok');
          await cargar();
          break;
        }
        case 'aportar': {
          const clave = document.getElementById('apor-' + dato)?.value || '';
          const r = await S.post('/api/comision/aportar', { puntoId: dato, contrasena: clave });
          S.toast(`Fragmento aportado (${r.aportados}/${r.requeridos})`, 'ok');
          await cargar();
          break;
        }
        case 'escanear': iniciarCamara(); break;
        case 'cerrar-escaner': detenerCamara(); scanner.classList.add('oculto'); break;
        case 'ir-token': {
          const t = ((document.getElementById('token-manual') || {}).value
            || (document.getElementById('token-manual-error') || {}).value || '').trim();
          if (!t) { S.toast('Escriba la clave o escanee el código', 'err'); break; }
          detenerCamara();
          location.href = '/c/' + encodeURIComponent(t);
          break;
        }
        default: break;
      }
    } catch (e) {
      S.toast(e.message, 'err');
      await cargar();
    }
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acc]');
    if (!b || b.disabled) return;
    const dato = b.dataset.id || (b.dataset.acc.includes(':') ? b.dataset.acc.split(':').slice(1).join(':') : b.dataset.valor || '');
    const acc = b.dataset.acc.split(':')[0];
    accion(acc, dato);
  });

  S.onEstado(() => { cargar(); });
  S.conectar();
  cargar();
  setInterval(async () => {
    try { await S.api('/api/ping'); marcarLinea(true); } catch (e) { marcarLinea(false); }
  }, 5000);
})();
