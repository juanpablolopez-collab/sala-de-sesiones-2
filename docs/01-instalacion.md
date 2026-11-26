# 1. Instalación, red y respaldos

## Requisitos

- Windows 10/11 de 64 bits (para el instalador o el ejecutable portable).
- Node.js 22+ si se quiere ejecutar desde el código fuente.
- Una red Wi-Fi local compartida por el computador de la mesa y los celulares.
- No se necesita internet, cuenta ni licencia.

## Opción A — `INSTALAR.bat`

El paquete de entrega contiene:

```text
INSTALAR.bat          → instalador del usuario actual
CrearAccesos.ps1      → apoyo para los accesos directos
App\                  → aplicación portable
Datos\                → padrón de ejemplo y respaldos
Verificacion.txt      → hashes SHA-256
```

1. Copiar la carpeta completa al PC (por ejemplo al Escritorio).
2. Doble clic en `INSTALAR.bat`.
3. El instalador:
   - copia `App\` a `%LOCALAPPDATA%\Sala de Sesiones 2.0`;
   - crea accesos en Escritorio y en *Menú Inicio → Sala de Sesiones 2.0*;
   - abre la aplicación.
4. Si aparece *Windows protegió su PC*, elegir **Más información → Ejecutar de todos modos**.

No pide permisos de administrador porque instala en el perfil del usuario.

## Opción B — Portable

Ejecutar `App\Sala de Sesiones.exe`. No instala ni registra desinstalador. Es la opción preferida cuando la directiva de la organización bloquea instaladores nuevos.

## Opción C — Desde el código

```powershell
npm install --no-audit --no-fund
npm start
```

Si Electron está bloqueado por *Smart App Control*, usar el servidor sin Electron:

```powershell
$env:SALA_DATOS = "$env:APPDATA\Sala de Sesiones\sala-de-sesiones-2"
$env:SALA_PUERTO = '4700'
$env:SALA_ABRIR = '0'
node server\standalone.js
```

Luego abrir `http://127.0.0.1:4700/?k=<token-de-mesa>`.

## Red y celulares

La mesa calcula la IP real de la máquina (`os.networkInterfaces()`), por eso la dirección mostrada es `http://192.168.x.x:4701` y **no** `localhost`.

- Todos los dispositivos deben estar en la misma red y en perfil de red **Privada**.
- Si no conectan, habilitar la regla del Firewall de Windows para la aplicación en redes privadas.
- El código QR de la mesa solo comprueba la red. Para entrar se usa el QR de la **credencial de cada concejal** o su clave impresa.
- El servidor escucha en `0.0.0.0` y prueba puertos desde 4700 hasta 4710; el primero libre será el activo.

## Datos y respaldos

Ruta por defecto:

```text
%APPDATA%\Sala de Sesiones\sala-de-sesiones-2\
├── sesion.json        ← estado completo (padrón, sesión, votos, urna, log)
└── sesion.json.bak    ← copia automática antes de cambios críticos
```

El menú **Sala → Abrir carpeta de datos** abre esa ubicación.

Antes de cambiar el padrón, cargar el orden del día, abrir/cerrar sesión o cerrar la urna se guarda una copia `.bak`. Si `sesion.json` queda corrupto por un apagón, el servidor recupera el respaldo al iniciar.

### Exportaciones

| Ruta | Resultado |
|---|---|
| `/api/exportar` | JSON completo sin material criptográfico sensible |
| `/api/exportar-csv?tipo=asistencia` | Apellido, nombre, partido, estado, hora |
| `/api/exportar-csv?tipo=votos` | Votos nominales/ordinarios (nunca secretos) |
| `/api/exportar-csv?tipo=resultados` | Veredicto y fórmula por punto |

## Clonar una sesión en otro equipo

1. Copiar `sesion.json` al nuevo equipo con la app cerrada.
2. Reemplazar el `sesion.json` de la carpeta de datos.
3. Abrir la app. El estado (incluida la sesión cerrada) se conserva.

> No compartir `sesion.json` de una sesión real: contiene credenciales y votos. Para empezar de cero usar **Empezar de cero** en la mesa.

## Desinstalación

El desinstalador de Windows no borra la carpeta de datos. Para borrar todo, eliminar manualmente `%APPDATA%\Sala de Sesiones\sala-de-sesiones-2`.
