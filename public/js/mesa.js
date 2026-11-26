/* Mesa de control: formularios, asistencia, votaciones y auditoría. */
(function () {
  'use strict';

  const S = window.SALA;
  const panel = document.getElementById('panel');
  const tabsEl = document.getElementById('tabs');

  const PESTANAS = [
    ['preparar', 'Preparar'], ['config', 'Datos y reglas'], ['padron', 'Concejales'],
    ['orden', 'Orden del día'], ['asistencia', 'Asistencia'], ['votacion', 'Votaciones'],
    ['auditoria', 'Auditoría'],
  ];

  let tab = 'preparar';
  let padronImportado = null;
  let avisosPadron = [];
  let avisosOrden = [];
  let ordenLocal = null;
  let contadorOrden = 0;
  let registros = null;
  let qrMostrado = '';
  let qrCargando = false;

  /* ─── Utilidades ─── */

  const esc = S.esc;

  const TIPOS_ORDEN = [
    ['PROYECTO_ACUERDO', 'Proyecto de acuerdo'],
    ['PROPOSICION', 'Proposición'],
    ['ELECCION', 'Elección'],
    ['INFORMATIVO', 'Informativo'],
  ];
  const MAYORIAS_ORDEN = [
    ['SIMPLE', 'Simple'], ['ABSOLUTA', 'Absoluta'], ['CALIFICADA', 'Calificada'],
  ];
  const MODALIDADES_POR_TIPO = {
    ELECCION: ['SECRETA', 'NOMINAL', 'ORDINARIA'],
    INFORMATIVO: [],
  };

  function modalidadesDe(tipo) {
    return MODALIDADES_POR_TIPO[tipo] || ['ORDINARIA', 'NOMINAL'];
  }

  function opciones(lista, actual) {
    return lista.map(([valor, etiqueta]) => `<option value="${valor}" ${valor === actual ? 'selected' : ''}>${esc(etiqueta)}</option>`).join('');
  }

  function puntosParaEditor(d) {
    if (!ordenLocal) {
      ordenLocal = (d.puntos || []).map((p) => ({
        id: p.id, clave: p.id, titulo: p.titulo, tipo: p.tipo, mayoria: p.mayoria,
      }));
    }
    return ordenLocal;
  }

  function sincronizarOrden() {
    if (!ordenLocal) return;
    panel.querySelectorAll('[data-campo^="ord-"]').forEach((el) => {
      const claveCompleta = el.getAttribute('data-campo') || '';
      const separador = claveCompleta.indexOf(':');
      if (separador < 0) return;
      const campo = claveCompleta.slice(0, separador);
      const clave = claveCompleta.slice(separador + 1);
      const fila = ordenLocal.find((x) => x.clave === clave);
      if (!fila) return;
      if (campo === 'ord-titulo') fila.titulo = el.value;
      else if (campo === 'ord-tipo') fila.tipo = el.value;
      else if (campo === 'ord-mayoria') fila.mayoria = el.value;
    });
  }

  const ico = {
    ok: '<span class="badge green">listo</span>',
    pendiente: '<span class="badge">pendiente</span>',
  };

  function boton(id, texto, clase, extra) {
    return `<button class="btn ${clase || ''}" data-act="${id}" ${extra || ''}>${texto}</button>`;
  }

  function estadoBadge(estado) {
    const tono = estado === 'ABIERTA' || estado === 'EN_VOTACION' || estado === 'ABIERTO' ? 'green'
      : estado === 'CERRADA' || estado === 'CERRADO' ? 'blue'
        : estado === 'EMPATE' || estado === 'EN_ESCRUTINIO' ? 'gold' : '';
    return S.badge(S.etiquetaEstado[estado] || estado, tono);
  }

  function capturarCampos() {
    const campos = {};
    panel.querySelectorAll('input, select, textarea').forEach((el) => {
      const clave = el.id || el.getAttribute('data-campo');
      if (!clave) return;
      campos[clave] = el.type === 'checkbox' ? el.checked : el.value;
    });
    const activo = document.activeElement;
    const foco = activo && panel.contains(activo)
      ? { id: activo.id, inicio: activo.selectionStart, fin: activo.selectionEnd }
      : null;
    return { campos, foco };
  }

  function restaurarCampos(guardado) {
    if (!guardado) return;
    for (const [clave, valor] of Object.entries(guardado.campos)) {
      const el = document.getElementById(clave) || panel.querySelector(`[data-campo="${CSS.escape(clave)}"]`);
      if (!el) continue;
      if (typeof valor === 'boolean') el.checked = valor;
      else if (el.value !== valor) el.value = valor;
    }
    if (guardado.foco && guardado.foco.id) {
      const el = document.getElementById(guardado.foco.id);
      if (el) {
        el.focus();
        try {
          if (guardado.foco.inicio != null) el.setSelectionRange(guardado.foco.inicio, guardado.foco.fin);
        } catch (e) { /* algunos controles no soportan selección */ }
      }
    }
  }

  function fechaLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  }

  function renderTabs() {
    tabsEl.innerHTML = PESTANAS.map(([id, texto], i) =>
      `<button class="tab ${tab === id ? 'on' : ''}" data-tab="${id}"><span class="n">0${i + 1}</span>${texto}</button>`
    ).join('');
  }

  /* ─── Vistas ─── */

  function vistaPreparar(d) {
    const url = d.servidor.url;
    return `
      <div class="aviso"><strong>Antes de convocar a nadie:</strong> compruebe que el computador y los celulares se vean en la misma red.
      Es la única falla que arruina la sesión completa.</div>
      <div class="grid cols-2">
        <section class="card">
          <div class="card-head">
            <div><h2>Dirección del servidor</h2><p>Abra esta dirección en el celular de un concejal.</p></div>
            ${S.badge('Sin internet', 'green')}
          </div>
          <p class="mono salto" style="font-size:18px;color:var(--gold-soft)">${esc(url)}</p>
          <div class="btn-row">
            ${boton('copiar-url', 'Copiar dirección', 'primary')}
            ${boton('probar-red', 'Probar conexión')}
          </div>
          <div id="prueba-red" class="help"></div>
          <div class="separador"></div>
          <h4>Comprobación en 30 segundos</h4>
          <ol class="muted pequeño">
            <li>Conecte este computador al Wi-Fi del recinto.</li>
            <li>Abra la dirección de arriba en un celular conectado al mismo Wi-Fi.</li>
            <li>Si carga la pantalla del concejal, la demostración puede hacerse.</li>
          </ol>
          <p class="help">Si no hay Wi-Fi compartido, active el punto de acceso del celular del Secretario y conecte aquí y allá a esa red.</p>
        </section>
        <section class="card centro">
          <div class="card-head"><div><h2>Código QR de acceso</h2><p>El concejal lo escanea con la cámara.</p></div></div>
          <div class="qr" style="display:inline-block"><img id="qr-red" alt="Código QR de la dirección del servidor"></div>
          <div class="help" style="margin-top:10px">Este mismo código aparece en cada credencial impresa.</div>
        </section>
      </div>
      <section class="card" style="margin-top:18px">
        <div class="card-head"><div><h2>Datos de esta copia</h2><p>Información útil para el día de la prueba.</p></div></div>
        <div class="tabla-wrap"><table class="tabla-compacta">
          <tbody>
            <tr><th>Dirección IP</th><td class="mono">${esc(d.servidor.ip)}:${d.servidor.puerto}</td></tr>
            <tr><th>Carpeta de datos</th><td class="mono salto">${esc(d.servidor.carpetaDatos)}</td></tr>
            <tr><th>Origen de los datos</th><td>${esc(d.servidor.origenDatos || 'archivo de sesión')}</td></tr>
            ${d.servidor.credencialesAnteriores
              ? `<tr><th>Credenciales anteriores</th><td>${d.servidor.credencialesAnteriores} importadas: las hojas ya impresas con la versión anterior siguen sirviendo.</td></tr>`
              : ''}
            <tr><th>Registro de actividad</th><td>${d.registro.registros} eventos · cadena ${d.registro.cadena ? 'íntegra' : 'ROTA'}</td></tr>
            <tr><th>Licencia</th><td>Sin licencia ni caducidad: esta versión abre siempre.</td></tr>
          </tbody>
        </table></div>
        <div class="aviso blue" style="margin-top:14px"><strong>Esta versión no sirve para adoptar decisiones con efecto jurídico.</strong>
        Es una sesión simulada: nada de lo que se vote tiene efecto. Las actas salen marcadas «BORRADOR — SIN VALIDEZ JURÍDICA».</div>
      </section>`;
  }

  function vistaConfig(d) {
    const c = d.config;
    const s = d.sesion;
    const bloqueado = s.estado !== 'PROGRAMADA';
    return `
      <section class="card">
        <div class="card-head"><div><h2>Datos de la sesión</h2><p>Los datos se muestran en el acta y en las credenciales.</p></div>
        ${estadoBadge(s.estado)}</div>
        ${bloqueado ? '<div class="aviso red">La sesión ya fue abierta: estos datos quedaron congelados para proteger el acta.</div>' : ''}
        <div class="grid cols-3">
          <label class="field"><span>Corporación</span><input id="s-corp" value="${esc(c.nombreCorporacion)}" ${bloqueado ? 'disabled' : ''}></label>
          <label class="field"><span>Municipio</span><input id="s-mun" value="${esc(c.municipio)}" ${bloqueado ? 'disabled' : ''}></label>
          <label class="field"><span>Lugar</span><input id="s-lugar" value="${esc(s.lugar)}" ${bloqueado ? 'disabled' : ''}></label>
          <label class="field"><span>Número de sesión</span><input id="s-num" type="number" min="1" value="${s.numero}" ${bloqueado ? 'disabled' : ''}></label>
          <label class="field"><span>Año</span><input id="s-anio" type="number" min="2000" value="${s.anio}" ${bloqueado ? 'disabled' : ''}></label>
          <label class="field"><span>Clase de sesión</span><select id="s-tipo" ${bloqueado ? 'disabled' : ''}>
            ${['ORDINARIA', 'EXTRAORDINARIA', 'INSTALACION'].map((x) => `<option ${s.tipo === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select></label>
          <label class="field"><span>Fecha y hora</span><input id="s-fecha" type="datetime-local" value="${fechaLocal(s.fecha)}" ${bloqueado ? 'disabled' : ''}></label>
        </div>
        ${boton('guardar-sesion', 'Guardar datos de la sesión', 'primary', bloqueado ? 'disabled' : '')}
      </section>

      <section class="card" style="margin-top:18px">
        <div class="card-head"><div><h2>Reglas de quórum y mayorías</h2>
        <p>Fracciones del reglamento interno del Concejo. El sistema recalcula todo al instante.</p></div></div>
        <div class="grid cols-3">
          <div>
            <h4>Quórum deliberatorio</h4>
            <div class="fraccion">
              <label class="field"><span>Numerador</span><input id="delib-n" type="number" min="1" value="${c.delibNum}"></label>
              <span class="bar">/</span>
              <label class="field"><span>Denominador</span><input id="delib-d" type="number" min="1" value="${c.delibDen}"></label>
            </div>
            <div class="help">Por defecto 1/4 del padrón.</div>
          </div>
          <div>
            <h4>Quórum decisorio</h4>
            <div class="fraccion">
              <label class="field"><span>Numerador</span><input id="deci-n" type="number" min="1" value="${c.deciNum}"></label>
              <span class="bar">/</span>
              <label class="field"><span>Denominador</span><input id="deci-d" type="number" min="1" value="${c.deciDen}"></label>
            </div>
            <div class="help">El sistema suma 1 al resultado: 1/2 de 13 da 7. Por defecto 1/2 + 1.</div>
          </div>
          <div>
            <h4>Mayoría calificada</h4>
            <div class="fraccion">
              <label class="field"><span>Numerador</span><input id="calif-n" type="number" min="1" value="${c.califNum}"></label>
              <span class="bar">/</span>
              <label class="field"><span>Denominador</span><input id="calif-d" type="number" min="1" value="${c.califDen}"></label>
            </div>
            <div class="help">Por defecto 2/3.</div>
          </div>
        </div>
        <label class="check" style="margin:14px 0">
          <input type="checkbox" id="imp-reduce" ${c.impedimentoReduceBase ? 'checked' : ''}>
          Los impedimentos aprobados reducen la base de cálculo
        </label>
        <div class="aviso">Contraste cada número <strong>en voz alta</strong> con el Secretario. Si alguien discute un resultado después, casi siempre es por acá.</div>
        ${boton('guardar-config', 'Guardar reglas', 'primary')}
      </section>`;
  }

  function filasPadron() {
    if (padronImportado) return padronImportado;
    return (window.SALA.estado?.concejales || []).map((c) => ({
      apellido: c.apellido, nombre: c.nombre, partido: c.partido, error: '',
    }));
  }

  function textoPadron() {
    return filasPadron().map((p) => `${p.apellido} | ${p.nombre} | ${p.partido}`).join('\n');
  }

  function vistaPadron(d) {
    const filas = filasPadron();
    const bloqueado = d.sesion.estado !== 'PROGRAMADA';
    const invalidas = filas.filter((f) => f.error).length;
    return `
      <section class="card">
        <div class="card-head"><div><h2>Listado de concejales</h2>
          <p>Pegue una lista, importe un CSV o agregue fila por fila. Nada se guarda hasta confirmar.</p></div>
          ${S.badge(`${filas.length} concejales`, invalidas ? 'red' : 'green')}</div>
        ${bloqueado ? '<div class="aviso red">El padrón quedó congelado al abrir la sesión: cambiarlo alteraría la base del quórum.</div>' : ''}
        <label class="field"><span>Una fila por concejal: apellido | nombre | partido (también acepta , ; o tabulador)</span>
          <textarea id="padron-texto" spellcheck="false" ${bloqueado ? 'disabled' : ''}>${esc(textoPadron())}</textarea></label>
        <div class="btn-row">
          <label class="btn" style="position:relative;overflow:hidden">
            Importar CSV o TXT
            <input type="file" id="padron-archivo" accept=".csv,.txt,text/csv,text/plain" style="position:absolute;inset:0;opacity:0;cursor:pointer" ${bloqueado ? 'disabled' : ''}>
          </label>
          ${boton('padron-analizar', 'Analizar lista')}
          ${boton('padron-plantilla', 'Descargar plantilla')}
          ${boton('padron-guardar', 'Guardar padrón', 'primary', bloqueado ? 'disabled' : '')}
        </div>
        ${avisosPadron.map((a) => `<div class="aviso red">${esc(a)}</div>`).join('')}
      </section>
      <section class="card" style="margin-top:18px">
        <div class="card-head"><div><h2>Vista previa</h2><p>Lo que entenderá el sistema, fila por fila.</p></div></div>
        <div class="tabla-wrap"><table class="tabla-compacta">
          <thead><tr><th>#</th><th>Apellido</th><th>Nombre</th><th>Partido</th></tr></thead>
          <tbody>${filas.length ? filas.map((f, i) => `<tr>
            <td class="muted">${i + 1}</td>
            <td style="color:${f.error ? 'var(--red)' : 'inherit'}">${esc(f.apellido)}${f.error ? ` <small>${esc(f.error)}</small>` : ''}</td>
            <td>${esc(f.nombre)}</td><td>${esc(f.partido)}</td></tr>`).join('')
            : '<tr><td colspan="4" class="vacio">No hay concejales cargados.</td></tr>'}</tbody>
        </table></div>
        <div class="aviso blue" style="margin-top:12px"><strong>El partido no es decorativo:</strong> se usa para exigir que la comisión escrutadora tenga concejales de bancadas distintas.</div>
        <div class="aviso"><strong>Las credenciales se generan al guardar el padrón.</strong> Imprímalas después: las hojas impresas antes dejan de servir.</div>
      </section>`;
  }

  function textoOrden(d) {
    return puntosParaEditor(d).map((p) => `${p.titulo} | ${p.tipo} | ${p.mayoria}`).join('\n');
  }

  function vistaOrden(d) {
    const bloqueado = d.sesion.estado !== 'PROGRAMADA';
    const puntos = puntosParaEditor(d);
    return `
      <section class="card">
        <div class="card-head"><div><h2>Orden del día</h2>
          <p>Agregue puntos, elija el tipo y la mayoría, y acomode el orden con las flechas.</p></div>
          ${S.badge(`${puntos.length} ${puntos.length === 1 ? 'punto' : 'puntos'}`)}</div>
        ${bloqueado ? '<div class="aviso red">El orden del día quedó congelado al abrir la sesión, igual que el orden aprobado.</div>' : ''}
        ${puntos.length ? `
        <div class="tabla-wrap"><table class="tabla-compacta puntos-editor">
          <thead><tr><th>#</th><th>Punto</th><th>Tipo</th><th>Mayoría</th><th>Votación permitida</th><th class="derecha">Acciones</th></tr></thead>
          <tbody>${puntos.map((p, i) => {
            const mods = modalidadesDe(p.tipo);
            return `<tr class="${p.id ? '' : 'nuevo'}">
              <td class="muted num">${i + 1}</td>
              <td><input data-campo="ord-titulo:${esc(p.clave)}" value="${esc(p.titulo)}" placeholder="Ej. Proyecto de acuerdo 001 de 2026" ${bloqueado ? 'disabled' : ''}></td>
              <td><select data-campo="ord-tipo:${esc(p.clave)}" data-modalidades="${esc(p.clave)}" ${bloqueado ? 'disabled' : ''}>${opciones(TIPOS_ORDEN, p.tipo)}</select></td>
              <td><select data-campo="ord-mayoria:${esc(p.clave)}" ${bloqueado ? 'disabled' : ''}>${opciones(MAYORIAS_ORDEN, p.mayoria)}</select></td>
              <td class="modalidades-${esc(p.clave)}">${mods.length
                ? mods.map((m) => `<span class="badge" title="${esc(S.etiquetaModalidad[m] || m)}">${esc(S.etiquetaModalidad[m] || m)}</span>`).join('')
                : '<span class="badge">Sin votación</span>'}</td>
              <td class="acciones">
                ${boton('punto-subir:' + i, '↑', 'sm', (bloqueado || i === 0) ? 'disabled title="Subir"' : 'title="Subir"')}
                ${boton('punto-bajar:' + i, '↓', 'sm', (bloqueado || i === puntos.length - 1) ? 'disabled title="Bajar"' : 'title="Bajar"')}
                ${boton('punto-borrar:' + esc(p.clave), '✕', 'sm danger', bloqueado ? 'disabled title="Eliminar"' : 'title="Eliminar punto"')}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : '<div class="vacio">Todavía no hay puntos. Agregue el primero.</div>'}
        <div class="btn-row" style="margin-top:12px">
          ${boton('punto-agregar', '+ Agregar punto', '', bloqueado ? 'disabled' : '')}
          ${boton('orden-guardar', 'Guardar orden del día', 'primary', (bloqueado || !puntos.length) ? 'disabled' : '')}
        </div>
        <div class="help">El tipo define la votación: elección permite voto secreto; informativo no se vota. Los cambios se aplican al guardar.</div>
        ${avisosOrden.map((a) => `<div class="aviso ${a.startsWith('Listo') ? 'green' : 'red'}">${esc(a)}</div>`).join('')}
        ${bloqueado ? '' : `
        <details style="margin-top:14px">
          <summary class="help" style="cursor:pointer">Pegar una lista en texto (opcional)</summary>
          <label class="field" style="margin-top:10px"><span>Una fila por punto: título | tipo | mayoría</span>
            <textarea id="orden-texto" spellcheck="false">${esc(textoOrden(d))}</textarea></label>
          <div class="btn-row">${boton('orden-importar-texto', 'Usar esta lista', 'sm')}</div>
        </details>`}
      </section>
      <section class="card" style="margin-top:18px">
        <div class="card-head"><div><h2>Candidatos de elección</h2><p>Solo los puntos de tipo ELECCION pueden tener voto secreto. Guarde el orden antes de inscribir candidatos en un punto nuevo.</p></div></div>
        <div class="grid cols-2">
          ${d.puntos.filter((p) => p.tipo === 'ELECCION').map((p) => `
            <div class="card tight">
              <h4>${esc(p.titulo)}</h4>
              <label class="field" style="margin-top:10px"><span>Un candidato por línea</span>
                <textarea id="cand-${p.id}" ${bloqueado ? 'disabled' : ''}>${esc((p.candidatos || []).map((c) => c.nombre).join('\n'))}</textarea></label>
              ${boton('guardar-cand:' + p.id, 'Guardar candidatos', '', bloqueado ? 'disabled' : '')}
            </div>`).join('') || '<div class="vacio">No hay puntos de elección en el orden del día.</div>'}
        </div>
      </section>`;
  }

  function vistaAsistencia(d) {
    const q = d.quorum;
    const pres = q.presentes;
    const abierta = d.sesion.estado === 'ABIERTA';
    return `
      <section class="card">
        <div class="card-head"><div><h2>Asistencia y quórum</h2>
          <p>Cada concejal escanea su credencial con la cámara de su celular.</p></div>
          ${estadoBadge(d.sesion.estado)}</div>
        <div class="grid cols-3">
          <div><div class="metric"><strong>${pres}</strong><span>presentes de ${q.total}</span></div>
            <div class="progress ${q.hayDecisorio ? 'ok' : ''}"><i style="width:${q.total ? Math.min(100, pres / q.total * 100) : 0}%"></i></div>
            <div class="help">Deliberatorio: ${q.umbralDeliberatorio} · Decisorio: ${q.umbralDecisorio}</div></div>
          <div><h4>Instalación de la sesión</h4>
            <div>${q.hayDeliberatorio ? ico.ok : ico.pendiente} ${q.hayDeliberatorio ? 'Hay quórum' : `Faltan ${q.faltanDeliberatorio}`}</div>
            ${boton('abrir-sesion', abierta ? 'Sesión ya instalada' : 'Instalar sesión', 'primary', (!q.hayDeliberatorio || abierta) ? 'disabled' : '')}</div>
          <div><h4>Cierre</h4>
            <div class="help">El orden del día se congela al instalar. Después no se puede cambiar el padrón.</div>
            ${boton('cerrar-sesion', 'Cerrar sesión', 'danger', !abierta ? 'disabled' : '')}</div>
        </div>
        <div class="separador"></div>
        <h4>Registro manual</h4>
        <p class="help">Si un celular no abre la dirección, registre la asistencia de esa persona a mano y la sesión sigue.</p>
        <div class="tabla-wrap"><table class="tabla-compacta">
          <thead><tr><th>Concejal</th><th>Partido</th><th>Estado</th><th>Hora</th><th></th></tr></thead>
          <tbody>${d.concejales.map((c) => `<tr>
            <td>${esc(S.nombreCompleto(c))}</td><td>${esc(c.partido)}</td>
            <td>${S.badge(c.asistencia, c.asistencia === 'PRESENTE' ? 'green' : '')}</td>
            <td class="muted">${S.hora(c.horaCheckin)}</td>
            <td class="derecha">${boton('asis:' + c.id, c.asistencia === 'PRESENTE' ? 'Marcar ausente' : 'Marcar presente', 'sm')}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>`;
  }

  function resultadoHTML(p) {
    const r = p.resultado;
    if (!r) return '<div class="vacio">Sin resultados todavía.</div>';
    const tono = r.veredicto === 'APROBADO' ? 'aprobado' : r.veredicto === 'EMPATE' ? 'empate' : 'negado';
    const texto = r.veredicto === 'APROBADO' ? 'APROBADO' : r.veredicto === 'EMPATE' ? 'EMPATE' : 'NEGADO';
    let detalle = '';
    if (p.modalidad === 'SECRETA') {
      const max = Math.max(1, ...r.conteo.map((c) => c.votos));
      detalle = `<div class="conteo">${r.conteo.map((c) => `<div>
        <div class="fila"><span>${esc(c.nombre)}</span><strong>${c.votos}</strong></div>
        <div class="barra"><i style="width:${c.votos / max * 100}%"></i></div></div>`).join('')}
        <div class="fila"><span>En blanco</span><strong>${r.blanco}</strong></div></div>`;
    } else {
      detalle = `<div class="conteo">
        <div class="fila"><span>Sí</span><strong>${r.si}</strong></div>
        <div class="fila"><span>No</span><strong>${r.no}</strong></div>
        <div class="fila"><span>Abstenciones</span><strong>${r.abstencion}</strong></div></div>`;
    }
    return `<div class="resultado ${tono}">${texto}</div>
      <p class="muted">${esc(r.razon)}</p>${detalle}
      <div class="aviso help" style="border-left-color:var(--gold)">${esc(r.formula || '')}</div>`;
  }

  function comisionHTML(p, d) {
    const com = p.comision;
    if (p.modalidad !== 'SECRETA' || p.tipo !== 'ELECCION') return '';
    const seleccionados = new Set((com?.lista || []).map((m) => m.concejalId));
    const puedeEditar = !['EN_VOTACION', 'EN_ESCRUTINIO', 'CERRADO', 'EMPATE'].includes(p.estado);
    return `
      <div class="card tight" style="margin-top:14px;background:var(--bg-2)">
        <h4>Comisión escrutadora</h4>
        <p class="help">Se generan claves nuevas para este punto. Hacen falta al menos ${com?.umbral || 2} fragmentos para abrir la urna; un miembro solo nunca puede hacerlo.</p>
        ${com ? `<div class="lista">${com.lista.map((m) => `<div class="fila">
          <span>${esc(m.nombre)} <small>${esc(m.partido)}</small></span>
          <span>${m.confirmada ? S.badge('clave confirmada', 'green') : m.protegida ? S.badge('clave fijada', 'gold') : S.badge('sin clave')}
          ${m.aporto ? S.badge('aportó', 'blue') : ''}</span></div>`).join('')}</div>` : ''}
        ${puedeEditar ? `<div class="separador"></div>
          <div class="grid cols-2">
            <div><h4>Designar miembros</h4>
              <div class="stack" style="max-height:230px;overflow:auto;padding-right:6px">
                ${d.concejales.map((c) => `<label class="check">
                  <input type="checkbox" data-com="${p.id}:${c.id}" ${seleccionados.has(c.id) ? 'checked' : ''}>
                  ${esc(S.nombreCompleto(c))} <small>${esc(c.partido)}</small></label>`).join('')}
              </div></div>
            <div><h4>Umbral</h4>
              <label class="field"><span>Fragmentos necesarios</span><input id="umbral-${p.id}" type="number" min="2" value="${com?.umbral || 2}"></label>
              ${boton('guardar-com:' + p.id, 'Designar y generar claves', 'primary')}
              <p class="help">Deben ser concejales de partidos distintos. Las claves se entregan en los celulares y no se guardan en el archivo.</p>
            </div>
          </div>` : ''}
        ${p.estado === 'EN_ESCRUTINIO' ? `<div class="aviso blue">Urna cerrada. Los miembros de la comisión deben aportar sus claves desde su celular antes del conteo (${com?.aportados || 0} de ${com?.umbral || 2}).</div>` : ''}
      </div>`;
  }

  function vistaVotacion(d) {
    const abierta = d.sesion.estado === 'ABIERTA';
    return `
      <div class="aviso">${abierta
        ? 'La sesión está abierta. Abra un punto, espere los votos en los celulares y cierre la votación cuando terminan de votar todos.'
        : 'Instale la sesión en la pestaña <b>Asistencia</b> antes de abrir una votación.'}</div>
      <div class="stack">
      ${d.puntos.map((p) => {
        const puede = abierta && p.estado === 'PENDIENTE';
        const enVotacion = p.estado === 'EN_VOTACION';
        const enEscrutinio = p.estado === 'EN_ESCRUTINIO';
        const impedimentos = Object.entries(p.impedimentos || {});
        return `<section class="card">
          <div class="card-head">
            <div><h2>${p.orden}. ${esc(p.titulo)}</h2>
              <p>${S.etiquetaMayoria[p.mayoria] || p.mayoria} · ronda ${p.ronda} · ${esc(S.etiquetaModalidad[p.modalidad] || 'sin modalidad')}</p></div>
            <div class="btn-row">${estadoBadge(p.estado)}${p.resultado ? S.badge(p.resultado.veredicto, p.resultado.veredicto === 'APROBADO' ? 'green' : p.resultado.veredicto === 'EMPATE' ? 'gold' : 'red') : ''}</div>
          </div>
          <div class="grid cols-2">
            <div>
              <h4>Modalidad</h4>
              <label class="field"><select data-mod="${p.id}" ${puede ? '' : 'disabled'}>
                <option value="">— Sin definir —</option>
                ${p.permitidas.map((m) => `<option value="${m}" ${p.modalidad === m ? 'selected' : ''}>${S.etiquetaModalidad[m]}</option>`).join('')}
              </select></label>
              <div class="help">Progreso: ${p.emitidos} de ${d.quorum.presentes} presentes.</div>
              <div class="progress"><i style="width:${d.quorum.presentes ? Math.min(100, p.emitidos / d.quorum.presentes * 100) : 0}%"></i></div>
              <div class="btn-row" style="margin-top:10px">
                ${boton('abrir:' + p.id, 'Abrir votación', 'primary', !puede ? 'disabled' : '')}
                ${enVotacion && p.modalidad === 'SECRETA' ? boton('urna:' + p.id, 'Cerrar urna', 'gold') : ''}
                ${enVotacion || enEscrutinio ? boton('cerrar:' + p.id, 'Cerrar y escrutar', 'ok') : ''}
                ${['CERRADO', 'EMPATE'].includes(p.estado) ? boton('repetir:' + p.id, 'Repetir votación') : ''}
              </div>
              ${p.modalidad === 'SECRETA' && enVotacion ? `<div class="aviso">No cierre la urna hasta que todos hayan depositado su boleta.</div>` : ''}
            </div>
            <div><h4>Resultado</h4>${resultadoHTML(p)}</div>
          </div>
          ${comisionHTML(p, d)}
          ${p.nominal ? `<div class="separador"></div><h4>Registro nominal (público)</h4>
            <div class="tabla-wrap"><table class="tabla-compacta"><thead><tr><th>Concejal</th><th>Situación</th><th>Voto</th></tr></thead>
            <tbody>${p.nominal.map((v) => `<tr><td>${esc(v.nombre)}</td><td>${v.impedido ? 'Con impedimento aprobado' : 'Habilitado'}</td><td>${esc(v.voto || '—')}</td></tr>`).join('')}</tbody></table></div>` : ''}
          ${impedimentos.length ? `<div class="separador"></div><h4>Impedimentos declarados</h4>
            <div class="tabla-wrap"><table class="tabla-compacta"><thead><tr><th>Concejal</th><th>Estado</th><th></th></tr></thead><tbody>
            ${impedimentos.map(([cid, imp]) => {
              const c = d.concejales.find((x) => x.id === cid);
              return `<tr><td>${c ? esc(S.nombreCompleto(c)) : esc(cid)}<div class="help">${esc(imp.motivo || '')}</div></td>
                <td>${S.badge(imp.estado, imp.estado === 'APROBADO' ? 'gold' : '')}</td>
                <td class="derecha">${boton(`imp-ok:${p.id}:${cid}`, 'Aprobar', 'sm ok')} ${boton(`imp-no:${p.id}:${cid}`, 'Rechazar', 'sm')}</td></tr>`;
            }).join('')}</tbody></table></div>` : ''}
        </section>`;
      }).join('')}
      </div>`;
  }

  function vistaAuditoria(d) {
    return `
      <section class="card">
        <div class="card-head"><div><h2>Registro de actividad</h2>
          <p>Cada acción queda encadenada con SHA-256. Esta comprobación detecta cambios en el archivo, no sustituye una auditoría externa.</p></div>
          ${d.registro.cadena ? S.badge('Cadena íntegra', 'green') : S.badge('Cadena rota', 'red')}</div>
        <div class="btn-row">${boton('auditar', 'Volver a verificar')}${boton('exportar', 'Descargar respaldo')}</div>
        <div class="tabla-wrap" style="margin-top:14px"><table class="tabla-compacta">
          <thead><tr><th>#</th><th>Hora</th><th>Acción</th><th>Entidad</th><th>Huella</th></tr></thead>
          <tbody>${(registros || []).slice(0, 80).map((r) => `<tr>
            <td class="muted">${r.seq}</td><td>${S.hora(r.ts)}</td><td>${esc(r.accion)}</td>
            <td>${esc(r.entidad)} ${esc(r.entidadId || '')}</td>
            <td class="mono pequeño salto">${esc((r.hashActual || '').slice(0, 16))}…</td></tr>`).join('')
            || '<tr><td colspan="5" class="vacio">Cargando registro…</td></tr>'}</tbody>
        </table></div>
      </section>`;
  }

  function render(datos) {
    if (!datos) return;
    const guardado = capturarCampos();
    renderTabs();
    const vistas = {
      preparar: vistaPreparar, config: vistaConfig, padron: vistaPadron,
      orden: vistaOrden, asistencia: vistaAsistencia, votacion: vistaVotacion,
      auditoria: vistaAuditoria,
    };
    panel.innerHTML = (vistas[tab] || vistaPreparar)(datos);
    restaurarCampos(guardado);

    if (tab === 'preparar') {
      const url = datos.servidor.url;
      const img = document.getElementById('qr-red');
      if (img && url !== qrMostrado && !qrCargando) {
        qrCargando = true;
        S.cargarQR(url, img).finally(() => { qrCargando = false; });
        qrMostrado = url;
      }
      document.getElementById('url-red')?.addEventListener('click', () => {});
    }
    if (tab === 'auditoria' && !registros) cargarRegistros();
  }

  async function cargarRegistros() {
    try {
      const datos = await S.api('/api/auditoria');
      registros = datos.registros;
      render(S.estado);
    } catch (e) { S.toast(e.message, 'err'); }
  }

  /* ─── Acciones ─── */

  function valor(id) { return document.getElementById(id)?.value ?? ''; }
  function numero(id, actual) {
    const n = parseInt(valor(id), 10);
    return Number.isFinite(n) && n > 0 ? n : actual;
  }

  function dividirFila(linea) {
    const partes = [];
    let actual = '';
    let entreComillas = false;
    for (const ch of linea) {
      if (ch === '"') { entreComillas = !entreComillas; continue; }
      if (!entreComillas && /[|;,\t]/.test(ch)) {
        partes.push(actual.trim());
        actual = '';
      } else {
        actual += ch;
      }
    }
    partes.push(actual.trim());
    return partes;
  }

  function analizarPadron() {
    const bruto = valor('padron-texto').replace(/^\uFEFF/, '');
    const filas = bruto.split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean).map(dividirFila)
      .filter((partes) => !((partes[0] || '').toLowerCase() === 'apellido'
        && (partes[1] || '').toLowerCase() === 'nombre'))
      .map((partes) => {
        return {
          apellido: partes[0] || '',
          nombre: partes[1] || '',
          partido: partes.slice(2).join(', ') || 'Sin partido',
          error: '',
        };
      });
    avisosPadron = [];
    for (const f of filas) {
      if (!f.apellido) f.error = 'Falta el apellido';
      else if (!f.nombre) f.error = 'Falta el nombre';
      else if (f.apellido.length > 60 || f.nombre.length > 60) f.error = 'Nombre demasiado largo';
    }
    if (filas.length < 3) avisosPadron.push('Se requieren al menos 3 concejales.');
    if (filas.length > 60) avisosPadron.push('Máximo 60 concejales.');
    const validas = filas.filter((f) => !f.error).length;
    avisosPadron.push(`${filas.length} filas leídas · ${validas} válidas · ${filas.length - validas} con errores.`);
    padronImportado = filas;
    render(S.estado);
  }

  function plantillaPadron() {
    S.descargarTexto('plantilla-concejales.csv',
      '\ufeffapellido|nombre|partido\nArboleda Ruiz|Marcela|Partido Verde\nBenavides Loaiza|Hernán|Conservador\nCaicedo Muñoz|Diana|Liberal\n',
      'text/csv;charset=utf-8');
  }

  async function ejecutar(act, dato) {
    const S2 = S;
    try {
      switch (act) {
        case 'copiar-url': {
          const url = S2.estado.servidor.url;
          await navigator.clipboard.writeText(url);
          S2.toast('Dirección copiada: ' + url, 'ok');
          break;
        }
        case 'probar-red': {
          const n = document.getElementById('prueba-red');
          n.textContent = 'Probando…';
          const r = await S2.api('/api/red');
          n.innerHTML = `<span style="color:var(--green)">Servidor activo en ${S2.esc(r.url)}. Abra esa dirección en un celular del mismo Wi-Fi.</span>`;
          S2.toast('Servidor activo', 'ok');
          break;
        }
        case 'guardar-sesion': {
          await S2.post('/api/sesion', {
            numero: numero('s-num', S2.estado.sesion.numero),
            anio: numero('s-anio', S2.estado.sesion.anio),
            tipo: valor('s-tipo'), lugar: valor('s-lugar'), fecha: valor('s-fecha'),
          });
          S2.toast('Datos de la sesión guardados', 'ok');
          break;
        }
        case 'guardar-config': {
          await S2.post('/api/config', {
            nombreCorporacion: valor('s-corp'), municipio: valor('s-mun'),
            delibNum: numero('delib-n', 1), delibDen: numero('delib-d', 4),
            deciNum: numero('deci-n', 1), deciDen: numero('deci-d', 2),
            califNum: numero('calif-n', 2), califDen: numero('calif-d', 3),
            impedimentoReduceBase: document.getElementById('imp-reduce')?.checked || false,
          });
          S2.toast('Reglas guardadas', 'ok');
          break;
        }
        case 'padron-analizar': analizarPadron(); break;
        case 'padron-plantilla': plantillaPadron(); break;
        case 'padron-guardar': {
          const filas = (padronImportado || []).filter((f) => !f.error);
          if (filas.length < 3) { S2.toast('Hay errores en el padrón: revise la vista previa', 'err'); break; }
          const r = await S2.post('/api/concejales', { lista: filas });
          padronImportado = null; avisosPadron = [];
          S2.toast(`Padrón guardado: ${r.total} concejales. Ya puede imprimir las credenciales.`, 'ok');
          break;
        }
        case 'punto-agregar': {
          sincronizarOrden();
          const puntos = puntosParaEditor(S2.estado);
          contadorOrden += 1;
          puntos.push({
            id: '', clave: 'n' + contadorOrden, titulo: '',
            tipo: 'PROPOSICION', mayoria: 'SIMPLE',
          });
          render(S2.estado);
          const entradas = panel.querySelectorAll('[data-campo^="ord-titulo:"]');
          entradas[entradas.length - 1]?.focus();
          break;
        }
        case 'punto-borrar': {
          sincronizarOrden();
          ordenLocal = (ordenLocal || []).filter((x) => x.clave !== dato);
          render(S2.estado);
          break;
        }
        case 'punto-subir': case 'punto-bajar': {
          sincronizarOrden();
          const i = Number(dato);
          const j = act === 'punto-subir' ? i - 1 : i + 1;
          if (ordenLocal && i >= 0 && j >= 0 && j < ordenLocal.length) {
            [ordenLocal[i], ordenLocal[j]] = [ordenLocal[j], ordenLocal[i]];
            render(S2.estado);
          }
          break;
        }
        case 'orden-importar-texto': {
          const lista = valor('orden-texto').split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean).map((linea) => {
            const partes = linea.split('|').map((p) => p.trim());
            return {
              titulo: partes[0] || '', tipo: partes[1] || 'PROPOSICION', mayoria: partes[2] || 'SIMPLE',
            };
          }).filter((p) => p.titulo);
          if (!lista.length) { S2.toast('Escriba al menos un punto', 'err'); break; }
          ordenLocal = lista.map((p) => {
            contadorOrden += 1;
            return { id: '', clave: 'n' + contadorOrden, ...p };
          });
          avisosOrden = [`${ordenLocal.length} puntos listos para guardar.`];
          render(S2.estado);
          break;
        }
        case 'orden-guardar': {
          sincronizarOrden();
          const lista = (ordenLocal || []).filter((p) => String(p.titulo || '').trim()).map((p) => ({
            id: p.id || undefined,
            titulo: String(p.titulo).trim(),
            tipo: p.tipo,
            mayoria: p.mayoria,
          }));
          if (!lista.length) { S2.toast('Escriba al menos un título', 'err'); break; }
          const r = await S2.post('/api/puntos', { lista });
          avisosOrden = r.avisos?.length ? r.avisos : [`Listo: ${r.puntos} puntos guardados.`];
          ordenLocal = (r.detalle || []).map((p) => ({
            id: p.id, clave: p.id, titulo: p.titulo, tipo: p.tipo, mayoria: p.mayoria,
          }));
          render(S2.estado);
          S2.toast('Orden del día guardado', 'ok');
          break;
        }
        case 'guardar-cand': {
          const [pid] = dato.split(':');
          const lista = valor('cand-' + pid).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((nombre) => ({ nombre, cargo: '' }));
          const r = await S2.post(`/api/punto/${pid}/candidatos`, { lista });
          S2.toast(`${r.candidatos} candidatos inscritos`, 'ok');
          break;
        }
        case 'guardar-com': {
          const [pid] = dato.split(':');
          const miembros = [];
          panel.querySelectorAll(`[data-com^="${pid}:"]`).forEach((el) => { if (el.checked) miembros.push(el.getAttribute('data-com').split(':')[1]); });
          const umbral = numero('umbral-' + pid, 2);
          const r = await S2.post(`/api/punto/${pid}/comision`, { miembros, umbral });
          S2.toast(`Comisión designada: ${r.miembros} miembros, umbral ${r.umbral}`, 'ok');
          break;
        }
        case 'asis': {
          const c = S2.estado.concejales.find((x) => x.id === dato);
          await S2.post('/api/asistencia', {
            concejalId: dato, estado: c?.asistencia === 'PRESENTE' ? 'AUSENTE' : 'PRESENTE',
          });
          break;
        }
        case 'abrir-sesion': await S2.post('/api/sesion/abrir'); S2.toast('Sesión instalada', 'ok'); break;
        case 'cerrar-sesion': await S2.post('/api/sesion/cerrar'); S2.toast('Sesión cerrada', 'ok'); break;
        case 'abrir': await S2.post(`/api/punto/${dato}/abrir`); S2.toast('Votación abierta en los celulares', 'ok'); break;
        case 'urna': {
          const r = await S2.post(`/api/punto/${dato}/urna`);
          S2.toast(`Urna cerrada con ${r.boletas} boleta(s). Ahora aportan las claves.`, 'ok');
          break;
        }
        case 'cerrar': {
          const r = await S2.post(`/api/punto/${dato}/cerrar`);
          S2.toast('Resultado: ' + r.resultado.veredicto, r.resultado.veredicto === 'APROBADO' ? 'ok' : '');
          break;
        }
        case 'repetir': await S2.post(`/api/punto/${dato}/repetir`); S2.toast('Votación repetida', 'ok'); break;
        case 'imp-ok': case 'imp-no': {
          const [pid, cid] = dato.split(':');
          await S2.post(`/api/punto/${pid}/impedimento`, { concejalId: cid, decision: act === 'imp-ok' ? 'APROBADO' : 'RECHAZADO' });
          S2.toast('Impedimento resuelto', 'ok');
          break;
        }
        case 'auditar': registros = null; await cargarRegistros(); S2.toast('Cadena verificada', 'ok'); break;
        case 'exportar': window.open('/api/exportar', '_blank'); break;
        default: break;
      }
    } catch (e) {
      S2.toast(e.message, 'err');
    }
  }

  /* ─── Eventos ─── */

  tabsEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    render(S.estado);
  });

  panel.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const [act, ...rest] = b.dataset.act.split(':');
    ejecutar(act, rest.join(':'));
  });

  panel.addEventListener('change', async (ev) => {
    const el = ev.target;
    if (el.id === 'padron-archivo' && el.files && el.files[0]) {
      try {
        const texto = await el.files[0].text();
        document.getElementById('padron-texto').value = texto;
        analizarPadron();
      } catch (e) { S.toast('No se pudo leer el archivo: ' + e.message, 'err'); }
      return;
    }
    const claveTipo = el.getAttribute('data-modalidades');
    if (claveTipo) {
      const fila = (ordenLocal || []).find((x) => x.clave === claveTipo);
      if (fila) fila.tipo = el.value;
      const celda = panel.querySelector(`.modalidades-${CSS.escape(claveTipo)}`);
      if (celda) {
        const mods = modalidadesDe(el.value);
        celda.innerHTML = mods.length
          ? mods.map((m) => `<span class="badge" title="${esc(S.etiquetaModalidad[m] || m)}">${esc(S.etiquetaModalidad[m] || m)}</span>`).join('')
          : '<span class="badge">Sin votación</span>';
      }
      return;
    }
    const mod = el.getAttribute('data-mod');
    if (mod && el.value) {
      try {
        await S.post(`/api/punto/${mod}/modalidad`, { modalidad: el.value });
        S.toast('Modalidad definida: ' + S.etiquetaModalidad[el.value], 'ok');
      } catch (e) { S.toast(e.message, 'err'); }
    }
  });

  document.getElementById('btn-salon').addEventListener('click', () => window.open('/proyector', '_blank'));
  document.getElementById('btn-creds').addEventListener('click', () => window.open('/credenciales', '_blank'));
  document.getElementById('btn-acta').addEventListener('click', () => window.open('/acta', '_blank'));
  document.getElementById('btn-exportar').addEventListener('click', () => window.open('/api/exportar', '_blank'));
  document.getElementById('btn-reiniciar').addEventListener('click', async () => {
    if (!confirm('Se borran asistencia, votos y resultados.\n\nEl padrón, el orden del día y las reglas se conservan.\n\n¿Continuar?')) return;
    try {
      await S.post('/api/reiniciar');
      registros = null;
      S.toast('Sesión en blanco', 'ok');
    } catch (e) { S.toast(e.message, 'err'); }
  });

  S.onEstado(render);
  S.conectar();
  S.api('/api/mesa').catch((e) => S.toast(e.message, 'err'));
})();
