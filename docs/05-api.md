# 5. Referencia de API

Base: `http://<IP-del-PC>:<puerto>` (el puerto activo se muestra en la mesa).

## Autenticación

| Tipo | Cómo se envía |
|---|---|
| Mesa | Cabecera `x-mesa: <token>` o query `?k=<token>` |
| Concejal | Campo `token` en el cuerpo JSON de cada acción |

Los tokens de concejal se obtienen de `/api/credenciales`. El token de mesa se genera al arrancar y se muestra en la consola / URL de la mesa.

Errores habituales: `401` credencial inválida, `403` requiere mesa, `409` conflicto de estado, `429` demasiados intentos.

## Lectura

| Ruta | Devuelve |
|---|---|
| `GET /api/ping` | Estado del servidor, IP, puerto y URL de red |
| `GET /api/estado` | Estado público: sesión, quórum, concejales, puntos, comisiones (sin secretos) |
| `GET /api/mesa` | Token de mesa y red (protegido por el propio token) |
| `GET /api/credenciales` | Credenciales con QR y clave, para imprimir |
| `GET /api/auditoria` | `{ verificacion, registros }` |
| `GET /api/acta` | Borrador de acta con huella SHA-256 |
| `GET /api/exportar` | Respaldo JSON completo sin material sensible |
| `GET /api/exportar-csv?tipo=...` | `asistencia`, `votos` o `resultados` |
| `GET /api/eventos` | SSE con el estado público |
| `GET /api/qr?url=...` | QR PNG de una dirección |

## Acciones del concejal

| Ruta | Cuerpo | Efecto |
|---|---|---|
| `POST /api/checkin` | `{ token }` | Marca asistencia |
| `POST /api/impedimento` | `{ token, puntoId, motivo }` | Declara impedimento |
| `POST /api/voto` | `{ token, valor }` o `{ token, candidatoId }` | Registra voto o deposita boleta |
| `POST /api/comision/clave` | `{ token, puntoId, generar: true }` | Genera/protege clave del fragmento |
| `POST /api/comision/confirmar` | `{ token, puntoId, contrasena }` | Confirma la clave |
| `POST /api/comision/aportar` | `{ token, puntoId, contrasena }` | Aporta fragmento al abrir la urna |

Valores de voto: `SI`, `NO`, `ABSTENCION`. La abstención requiere impedimento aprobado.

## Acciones de la mesa

| Ruta | Cuerpo | Efecto |
|---|---|---|
| `POST /api/config` | Campos de corporación y quórum | Actualiza reglas (solo PROGRAMADA) |
| `POST /api/sesion` | `{ numero, anio, tipo, lugar, fecha }` | Actualiza encabezado (solo PROGRAMADA) |
| `POST /api/concejales` | `{ lista: [{apellido,nombre,partido}] }` | Reemplaza padrón y regenera credenciales |
| `POST /api/puntos` | `{ lista: [{id?,titulo,tipo,mayoria}] }` | Reemplaza orden conservando datos de puntos existentes |
| `POST /api/punto/:id/candidatos` | `{ lista: [{nombre,cargo}] }` | Inscribe candidatos (IDs `k1`, `k2`, …) |
| `POST /api/punto/:id/comision` | `{ miembros: [ids], umbral }` | Designa comisión (≥2 partidos) |
| `POST /api/punto/:id/modalidad` | `{ modalidad }` | Define ORDINARIA, NOMINAL o SECRETA |
| `POST /api/punto/:id/impedimento` | `{ concejalId, decision }` | Aprueba/rechaza impedimento |
| `POST /api/punto/:id/abrir` | — | Abre la votación |
| `POST /api/punto/:id/urna` | — | Cierra la urna (solo SECRETA) |
| `POST /api/punto/:id/cerrar` | — | Escruta y cierra el punto |
| `POST /api/sesion/abrir` | — | Instala la sesión (congela padrón/orden) |
| `POST /api/sesion/cerrar` | — | Cierra la sesión |
| `POST /api/reiniciar` | — | Borra asistencia, votos y resultados; conserva padrón y orden |

## Tipos y mayorías

**Tipos:** `PROYECTO_ACUERDO`, `PROPOSICION`, `ELECCION`, `INFORMATIVO`.

**Mayorías:** `SIMPLE`, `ABSOLUTA`, `CALIFICADA`.

**Modalidades por tipo:**

| Tipo | Permitidas |
|---|---|
| `ELECCION` | `SECRETA`, `NOMINAL`, `ORDINARIA` |
| `INFORMATIVO` | ninguna |
| otros | `ORDINARIA`, `NOMINAL` |

El importador normaliza tildes y nombres comunes (por ejemplo *«Elección de Personero»* → `ELECCION`).

## Ejemplo: abrir y cerrar una votación

```js
const base = 'http://127.0.0.1:4701';
const mesa = { 'x-mesa': TOKEN_DE_MESA };

await fetch(`${base}/api/punto/p1/modalidad`, {
  method: 'POST', headers: { ...mesa, 'content-type': 'application/json' },
  body: JSON.stringify({ modalidad: 'ORDINARIA' }),
});
await fetch(`${base}/api/punto/p1/abrir`, { method: 'POST', headers: mesa });
// ...los concejales envían POST /api/voto con su token...
const r = await fetch(`${base}/api/punto/p1/cerrar`, { method: 'POST', headers: mesa });
console.log((await r.json()).resultado.veredicto);
```

El `resultado` incluye `veredicto`, `formula`, `si`, `no`, `abstencion` (o `conteo`, `electo`, `blanco` en elecciones).
