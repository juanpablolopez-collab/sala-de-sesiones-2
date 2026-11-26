# 3. Arquitectura

## Visión general

```text
┌──────────────┐   HTTP/SSE   ┌────────────────────┐   fs   ┌──────────────┐
│  Mesa (PC)   │◄────────────►│ Servidor Node/Electrón│◄─────►│ sesion.json  │
└──────────────┘              └────────────────────┘        └──────────────┘
        ▲                              ▲
        │ HTTP                         │ HTTP
┌───────┴────────┐            ┌────────┴────────┐
│ Celulares      │            │ Proyector/Acta  │
│ (concejales)   │            │ (solo lectura)  │
└────────────────┘            └─────────────────┘
```

Todo corre en un solo proceso. No hay base de datos externa, ni servidor en internet, ni WebSocket: las actualizaciones en tiempo real usan **Server-Sent Events** (`/api/eventos`) con sondeo como respaldo.

## Módulos del servidor

| Archivo | Responsabilidad |
|---|---|
| `server/index.js` | Enrutador HTTP, páginas estáticas, QR, API, ceremonial de la urna, control de acceso y límite de reintentos |
| `server/core.js` | Cálculo determinista de quórum y escrutinio; modalidades permitidas por tipo de punto |
| `server/crypto.js` | Shamir en GF(256), RSA-OAEP, AES-256-GCM, PBKDF2, limpieza de memoria |
| `server/state.js` | Estado en memoria, persistencia atómica, credenciales HMAC, log encadenado, recuperación del `.bak` |
| `server/standalone.js` | Arranca el mismo servidor sin Electron (útil con Node portátil) |

## Módulos del cliente

| Archivo | Responsabilidad |
|---|---|
| `public/js/common.js` | Estado compartido por SSE, `post()` con credencial, utilidades y etiquetas |
| `public/js/mesa.js` | Mesa de control: formularios, editor del orden, asistencia, votaciones, auditoría |
| `public/js/movil.js` | Puesto del concejal: check-in, impedimento, voto, comisión |
| `public/js/proyector.js` | Pantalla grande del salón |
| `public/js/credenciales.js` | Hojas imprimibles con QR y clave |
| `public/js/acta.js` | Borrador de acta |
| `public/css/app.css` | Estilos compartidos (incluye `.puntos-editor`) |

## Modelo de estado (`sesion.json`)

```js
{
  sesion:     { id, numero, anio, tipo, lugar, fecha, estado, horaInicio, horaFin,
                snapshotOrdenDia, snapshotConfig },
  config:     { nombreCorporacion, municipio, total, delib, deci, calif,
                impedimentoReduceBase },
  concejales: [{ id, apellido, nombre, partido, activo }],
  credenciales: { [token]: { concejalId, activa } },
  asistencia: { [concejalId]: { estado, horaCheckin, metodo } },
  puntos:     [{ id, orden, titulo, tipo, mayoria, modalidad, estado, ronda,
                resultado, candidatos }],
  votos:      { [puntoId]: { [concejalId]: { valor, ronda, ts, hash } } },
  impedimentos:{ [puntoId]: { [concejalId]: { estado, motivo, ts } } },
  urna:       { [puntoId]: [boletaCifrada] },
  participacion: { [puntoId]: { [concejalId]: horaTruncada } },
  comisiones: { [puntoId]: { umbral, publicaPem, privadaProtegida, miembros } },
  log:        [{ seq, accion, entidad, entidadId, datos, ts, hashPrevio, hashActual }],
  secreto:    'hex de 64 caracteres'
}
```

### Estados de un punto

`PENDIENTE` → `EN_VOTACION` → `CERRADO` (o `EMPATE`, que permite otra ronda). En elección secreta, entre `EN_VOTACION` y el cierre hay un estado `EN_ESCRUTINIO` mientras se cerró la urna y se aportan fragmentos.

### Estados de la sesión

`PROGRAMADA` → `ABIERTA` → `CERRADA`.

## Flujo de una votación ordinaria

1. La mesa define modalidad y abre el punto (`p.estado = EN_VOTACION`).
2. Cada concejal envía su credencial y su voto; el servidor valida quórum, asistencia, impedimentos y ronda.
3. El hash del voto se calcula con `punto.concejal.ronda.valor`, sin guardar el valor en claro en el registro.
4. Al cerrar, `core.escrutar()` calcula veredicto y fórmula según la mayoría configurada.
5. Se registra el evento en el log encadenado y se difunde el nuevo estado por SSE.

## Flujo de una elección secreta

1. Candidatos → `k1`, `k2`, … (IDs asignados por el servidor).
2. Comisión → par RSA, clave maestra aleatoria, fragmentos Shamir, fragmento protegido con contraseña.
3. Confirmación → cada miembro abre su fragmento con la contraseña y marca `confirmada`.
4. Boleta → `{ candidatoId, ronda }` cifrado con la clave pública de la comisión; se inserta en posición aleatoria y se guarda la hora truncada al minuto para impedir correlacionar emisor y voto.
5. Urna → se cierra, se aportan `k` fragmentos, se reconstruye la clave maestra, se abre la privada y se descifran las boletas.
6. Escrutinio → `core.escrutarEleccion()` con la mayoría configurada.

## Límites y control de acceso

- Token de mesa por cabecera `x-mesa` o query `?k=`; se genera al arrancar.
- Acciones de concejal exigen credencial verificada por HMAC.
- Límite de reintentos por IP y tipo: checkin 20/min, impedimento 20/min, voto 30/min, comisión 20/min.
- Solo se sirven archivos dentro de `public/`.

## Decisiones de diseño

- **Un solo archivo de estado:** facilita el respaldo y la auditoría; la escritura es atómica (temporal + renombrado).
- **Sin framework HTTP:** solo módulos de Node y `qrcode`; reduce superficie y dependencias.
- **SSE en vez de WebSocket:** más simple y suficiente para un salón de sesiones.
- **Cálculo puro separado:** `core.js` se prueba de forma determinista sin levantar servidor.
