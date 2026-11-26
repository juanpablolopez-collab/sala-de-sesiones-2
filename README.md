# Sala de Sesiones 2.0

**Sistema local de asistencia, quórum y votación para el Concejo Municipal de Popayán.**

Desarrollado por **Juan Pablo López**. Sin licencia, sin clave de activación, sin caducidad y sin necesidad de internet.

> **AVISO IMPORTANTE — BORRADOR SIN VALIDEZ JURÍDICA.** Esta herramienta sirve para **ensayar, demostrar y acompañar** una sesión. Lo que aquí se vote **no produce decisiones con efecto legal**. El acta, el respaldo JSON y la pantalla lo recuerdan en todo momento.

---

## Tabla de contenidos

- [Qué problema resuelve](#qué-problema-resuelve)
- [Características](#características)
- [Instalación rápida](#instalación-rápida)
- [Guía de uso en 10 pasos](#guía-de-uso-en-10-pasos)
- [Pantallas y roles](#pantallas-y-roles)
- [Modalidades de votación](#modalidades-de-votación)
- [Reglas de quórum](#reglas-de-quórum)
- [Seguridad y auditoría](#seguridad-y-auditoría)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Desarrollo y pruebas](#desarrollo-y-pruebas)
- [Datos, respaldos y recuperación](#datos-respaldos-y-recuperación)
- [Solución de problemas](#solución-de-problemas)
- [Límites honestos](#límites-honestos)
- [Documentación completa](#documentación-completa)
- [Autor y licencia](#autor-y-licencia)

---

## Qué problema resuelve

En una sesión del concejo hay que responder, en vivo y sin depender de internet, cuatro preguntas:

1. ¿Quién llegó y hay quórum para deliberar y decidir?
2. ¿Qué puntos del orden del día se votaron y con qué mayoría?
3. En una elección, ¿cómo se protege el secreto del voto sin confiar en una sola persona?
4. ¿Cómo se demuestra después que el resultado corresponde a lo ocurrido?

La mesa de control centraliza esas cuatro respuestas. Los concejales participan desde su propio celular, conectado al mismo Wi-Fi; no necesitan instalar nada ni crear cuenta.

**Pensado para Popayán:** la IP y el QR se calculan desde la interfaz de red real del computador, no desde `localhost`, para que las credenciales funcionen en la sala de sesiones.

---

## Características

- **Asistencia por credencial:** cada concejal recibe una credencial con QR y clave impresa; marca su asistencia desde el celular.
- **Quórum en tiempo real:** umbrales configurables (por defecto 1/4 deliberatorio, 1/2 + 1 decisorio, 2/3 calificado) derivados del tamaño del padrón.
- **Orden del día editable:** cada punto se ajusta con desplegables de *tipo* y *mayoría*; se pueden agregar, borrar y reordenar puntos con flechas. La columna de modalidades muestra qué votaciones permite cada tipo.
- **Tres modalidades:** ordinaria, nominal y secreta.
- **Elección secreta real:** boleta cifrada, urna separada de la identidad, comisión escrutadora de partidos distintos, umbral *k de n* con Shamir y apertura ceremonial con las claves de los miembros.
- **Impedimentos:** un concejal declara un conflicto de interés; la mesa lo aprueba o rechaza y el sistema ajusta la base de cálculo.
- **Resultados con fórmula:** cada veredicto muestra la mayoría aplicada, los votos, las abstenciones y los impedidos.
- **Acta y exportación:** borrador de acta con huella SHA-256, respaldo JSON y exportación CSV de asistencia, votos y resultados.
- **Auditoría encadenada:** cada cambio se registra con hash encadenado; `/api/auditoria` verifica la integridad.
- **Sin internet y sin dependencias externas:** un solo paquete en tiempo de ejecución (`qrcode`); todo lo demás viene con Node/Electron.
- **Persistencia segura:** escritura atómica de `sesion.json`, copia `.bak` y recuperación automática.

---

## Instalación rápida

Hay tres formas de usar el sistema. Elegí la que mejor se ajuste al equipo.

### Opción A — Instalador para Windows (recomendado)

1. Copiar la carpeta del paquete de entrega al computador.
2. Doble clic en **`INSTALAR.bat`**.
3. Se instala en `%LOCALAPPDATA%\Sala de Sesiones 2.0` y se crean accesos en Escritorio y menú Inicio.
4. Si Windows muestra *«Windows protegió su PC»*: **Más información → Ejecutar de todos modos**. El binario no está firmado.

### Opción B — Portable, sin instalación

Ejecutar directamente **`Sala de Sesiones.exe`** desde la carpeta `App\`. No deja accesos directos; se puede borrar la carpeta cuando ya no se use.

### Opción C — Desde el código fuente

Requiere Node.js 22+ (o el Node portátil incluido en el paquete de entrega):

```powershell
npm install --no-audit --no-fund
npm start                 # abre la mesa con Electron

# alternativa sin Electron (el puerto se elige con variables de entorno):
$env:SALA_DATOS = "$env:APPDATA\Sala de Sesiones\sala-de-sesiones-2"
$env:SALA_PUERTO = '4700'
$env:SALA_ABRIR = '0'
npm run server
```

> En clientes con **Smart App Control** o directivas de control de aplicaciones que bloquean ejecutables sin firma, usar el modo servidor con Node portátil (`INICIAR-TUS-DATOS.bat`) en lugar del `.exe`.

Ver la [guía completa de instalación](docs/01-instalacion.md).

---

## Guía de uso en 10 pasos

1. **Abrir la mesa** en el computador del secretario.
2. **Preparar → red:** copiar la dirección `http://192.168.x.x:4701` y abrirla en un celular conectado al **mismo Wi-Fi**. Si no carga, detenerse: ese es el fallo que arruina la sesión.
3. **Concejales:** importar el padrón (se aceptan `|`, `;`, `,` y tabulador; salta encabezado y BOM) y guardar. Se generan credenciales nuevas.
4. **Imprimir credenciales** desde el botón *Credenciales* y repartir una por concejal.
5. **Datos y reglas:** confirmar en voz alta las fracciones de quórum. Toda discusión posterior empieza ahí.
6. **Orden del día:** armar los puntos con tipo y mayoría. Guardar.
7. **Asistencia:** los concejales escanean su QR o escriben su clave y tocan *Estoy presente*. Verificar quórum en vivo.
8. **Instalar sesión:** con quórum deliberatorio. Desde ese momento, padrón y orden quedan congelados.
9. **Votaciones:** elegir modalidad, abrir el punto, seguir el progreso, cerrar la votación. En secreto: designar comisión, confirmar claves, depositar boletas, cerrar urna y aportar fragmentos.
10. **Acta / exportar:** generar el borrador de acta y el respaldo; proyectar resultados con *Pantalla del salón*.

Ver el [manual de usuario](docs/02-guia-usuario.md).

---

## Pantallas y roles

| Pantalla | Quién la usa | Para qué |
|---|---|---|
| `/` — Mesa de control | Secretaría / mesa | Preparar, configurar, asistencia, votaciones, auditoría |
| `/movil` | Concejales | Check-in, impedimentos, votos, ceremonia de la urna |
| `/proyector` | Todos | Quórum, punto en curso y resultado en grande |
| `/credenciales` | Secretaría | Hojas imprimibles con QR y clave |
| `/acta` | Secretaría | Borrador de acta con huella |

La mesa exige el token de administrador (se entrega al iniciar el servidor). El puesto de cada concejal exige su credencial en **cada** acción, no solo al abrir la página.

---

## Modalidades de votación

| Modalidad | Cómo se registra | Cuándo conviene |
|---|---|---|
| **Ordinaria** | Voto individual, visible para el concejal y la mesa | Asuntos ordinarios |
| **Nominal** | Voto individual visible para todos, en orden alfabético | Cuando el reglamento exige llamar por apellido |
| **Secreta** | Boleta cifrada; se separan quién votó de qué votó | Elecciones de personero, contralor, mesa directiva |

Solo los puntos de tipo **ELECCION** admiten voto secreto. Los puntos **INFORMATIVO** no tienen votación. El resto admite ordinaria y nominal.

### Comisión escrutadora

- Se nombra con **al menos dos concejales de partidos distintos**; el servidor rechaza comisiones de un solo partido.
- La clave maestra de la urna se divide con Shamir en `n` fragmentos; hacen falta `k` (umbral) para reconstruirla. Cada miembro protege su fragmento con una contraseña de 6 dígitos que **se muestra una sola vez** y nunca se guarda.
- La mesa no puede abrir la votación hasta que `k` miembros confirmen su clave.
- Después de cerrar la urna, los miembros aportan su clave; solo entonces se abre el escrutinio.

---

## Reglas de quórum

Los umbrales se calculan sobre el total del padrón:

- **Deliberatorio:** 1/4 de los concejales (por defecto).
- **Decisorio:** 1/2 + 1 (por defecto).
- **Calificado:** 2/3 (por defecto).

El parámetro `impedimentoReduceBase` define si los impedimentos aprobados reducen o no la base de cálculo. Cada resultado incluye la fórmula exacta aplicada.

---

## Seguridad y auditoría

- Credenciales ligadas a la sesión y al padrón, verificadas con HMAC.
- Cifrado de boletas (RSA-OAEP) y de fragmentos (AES-256-GCM + PBKDF2).
- Shamir en GF(256) para el umbral de la comisión.
- Registro de actividad encadenado con SHA-256; `/api/auditoria` detecta modificaciones.
- Escritura atómica y copia `sesion.json.bak` para recuperación tras un apagón.
- Ninguna clave, contraseña ni fragmento en claro se escribe en `sesion.json`.

Detalles en [seguridad.md](docs/04-seguridad.md) y [api.md](docs/05-api.md).

---

## Estructura del repositorio

```text
Sala de Sesiones 2.0/
├── main.js                  # proceso Electron: servidor + ventana
├── server/
│   ├── index.js             # API HTTP, SSE, páginas, ceremonia de urna
│   ├── core.js              # quórum y escrutinio puro
│   ├── crypto.js            # Shamir, RSA, AES, PBKDF2
│   ├── state.js             # persistencia atómica y cadena de auditoría
│   └── standalone.js        # servidor sin Electron
├── public/
│   ├── mesa.html / js/mesa.js
│   ├── movil.html / js/movil.js
│   ├── proyector.html / js/proyector.js
│   ├── credenciales.html / js/credenciales.js
│   ├── acta.html / js/acta.js
│   ├── js/common.js         # cliente compartido (credencial en cada POST)
│   └── css/app.css
├── test/
│   ├── core.test.js         # 11 pruebas unitarias
│   └── smoke.js             # sesión completa de extremo a extremo
├── build/                   # icono y metadatos del instalador
├── docs/                    # manuales y referencia técnica
├── examples/padron-ejemplo.csv
├── INICIAR.bat
├── INICIAR-TUS-DATOS.bat
└── package.json
```

**No se versionan** datos reales, credenciales, `sesion.json`, `node_modules`, binarios de Electron ni el instalador generado. Ver `.gitignore`.

---

## Desarrollo y pruebas

```powershell
npm install --no-audit --no-fund
npm test          # pruebas unitarias del núcleo
npm run smoke     # sesión completa contra un servidor temporal
npm run dist      # construye el instalador Windows x64
```

El smoke test recorre asistencia, apertura de sesión, voto ordinario, comisión, elección secreta, urna, acta y exportación. Ver [pruebas.md](docs/06-pruebas.md).

---

## Datos, respaldos y recuperación

Ubicación por defecto: `%APPDATA%\Sala de Sesiones\sala-de-sesiones-2\sesion.json`.

- `sesion.json.bak`: copia automática antes de cambios críticos.
- `/api/exportar`: respaldo JSON sin material criptográfico sensible.
- `/api/exportar-csv?tipo=asistencia|votos|resultados`: exportación plana.

Si el archivo principal se corrompe, el servidor recupera el `.bak` al iniciar. Ver [instalación.md](docs/01-instalacion.md#datos-y-respaldos).

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| *«Credencial inválida»* al marcar asistencia | Versión antigua del cliente | Actualizar: el cliente envía el token en cada POST |
| El celular no carga la página | No está en la misma red, o firewall | Usar la IP mostrada (no `localhost`) y permitir la app en el firewall |
| *«El orden del día solo puede cambiarse antes de abrir»* | Sesión ya instalada | Es correcto: reiniciar sesión para volver a editar |
| *«La comisión debe integrarse con partidos distintos»* | Comisión de un solo partido | Designar al menos dos bancadas distintas |
| *«Faltan miembros por confirmar su clave»* | Menos de `k` confirmaciones | Que los miembros confirmen con su clave de 6 dígitos |
| Windows bloquea el `.exe` | Directiva / Smart App Control | Usar `INSTALAR.bat` o el modo servidor con Node portátil |

Más casos en [preguntas-frecuentes.md](docs/07-preguntas-frecuentes.md).

---

## Límites honestos

- No es un sistema certificado para elecciones reales; es una herramienta de demostración y ensayo.
- Durante el escrutinio la clave maestra existe en memoria del proceso: el cifrado protege **el archivo**, no un equipo comprometido.
- La cadena SHA-256 detecta cambios en el archivo local; no reemplaza una auditoría externa.
- El QR y las credenciales viajan sin cifrar dentro de la red local: **no usar en Wi-Fi público**.

---

## Documentación completa

| Documento | Contenido |
|---|---|
| [01-instalacion.md](docs/01-instalacion.md) | Instalación, red, datos y respaldos |
| [02-guia-usuario.md](docs/02-guia-usuario.md) | Manual paso a paso para mesa y concejales |
| [03-arquitectura.md](docs/03-arquitectura.md) | Módulos, flujo de datos y modelo de estado |
| [04-seguridad.md](docs/04-seguridad.md) | Credenciales, cifrado, urna y auditoría |
| [05-api.md](docs/05-api.md) | Referencia de endpoints |
| [06-pruebas.md](docs/06-pruebas.md) | Cómo ejecutar y qué cubren las pruebas |
| [07-preguntas-frecuentes.md](docs/07-preguntas-frecuentes.md) | Fallos típicos y respuestas |
| [08-cambios.md](docs/08-cambios.md) | Historial de correcciones |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Cómo colaborar |

---

## Autor y licencia

**Juan Pablo López** — para el **Concejo Municipal de Popayán**.

Licencia MIT. Ver [LICENSE](LICENSE). El sistema se entrega sin costo y sin restricciones de uso, con la advertencia explícita de que no genera actas con validez jurídica.
