# 4. Seguridad y auditoría

## Modelo de amenazas

El sistema protege un archivo local en un computador de la mesa y un canal HTTP dentro de una red Wi-Fi de confianza. **No** protege contra un equipo comprometido, ni contra observadores en una red pública, ni sustituye una auditoría externa.

## Credenciales

- Al guardar el padrón se generan credenciales nuevas (`token` aleatorio) ligadas a la sesión y al concejal.
- El servidor verifica el token con HMAC usando el `secreto` del estado.
- La credencial se envía en **cada** acción del concejal: check-in, impedimento, voto y ceremonial de la urna. Esto corrige el fallo histórico de «Credencial inválida» al marcar asistencia.
- Si la cámara no lee el QR, se puede escribir la clave impresa de 6 dígitos.
- Cambiar el padrón invalida las hojas impresas anteriormente; el sistema lo advierte.

## Voto ordinario y nominal

- Cada voto lleva `hash = SHA256(punto.concejal.ronda.valor).slice(0,32)` en el registro de auditoría.
- No se permite cambiar el voto dentro de la misma ronda.
- `EMPATE` habilita una ronda nueva.
- La abstención exige un impedimento aprobado por la mesa.

## Voto secreto

| Elemento | Protección |
|---|---|
| Boleta | Cifrada con RSA-OAEP usando la clave pública de la comisión designada para esa ronda |
| Orden de llegada | Inserción en posición aleatoria dentro de la urna |
| Hora | Truncada al minuto para impedir correlacionar emisor y voto |
| Identidad | Queda en `participacion`, separada de la boleta; el estado público solo muestra el número de boletas |
| Clave maestra | Generada al azar, dividida con Shamir (umbral `k` de `n`) y destruida de memoria después de usarla |
| Fragmento | Protegido con AES-256-GCM derivado de la contraseña del miembro mediante PBKDF2; la contraseña se muestra una sola vez y no se guarda |
| Urna | Se cierra antes del escrutinio; no se admiten boletas posteriores |

La mesa no puede abrir la votación secreta hasta que `k` miembros de la comisión hayan confirmado su clave. La apertura requiere `k` aportes.

> Durante el escrutinio la clave maestra existe en memoria del proceso. El cifrado protege el **archivo en disco**, no un equipo comprometido ni a alguien con acceso al proceso.

## Cadena de auditoría

Cada evento calcula:

```text
hashActual = SHA256(hashPrevio + JSON({seq, accion, entidad, entidadId, datos, ts}))
```

- El primer `hashPrevio` es 64 ceros.
- `/api/auditoria` devuelve `verificacion: { ok, registros, rotoEn? }`.
- `/api/exportar` incluye la misma verificación y la huella del acta.
- Cambios críticos (padrón, orden, urna, apertura/cierre de sesión) guardan antes una copia `sesion.json.bak`.

La cadena detecta modificaciones del archivo local. No es una firma digital ni una auditoría externa.

## Persistencia

- `sesion.json` se escribe de forma atómica: archivo temporal + renombrado.
- Si el archivo principal no pasa la validación al iniciar, se recupera el `.bak`.
- El estado exportado excluye fragmentos, contraseñas y claves privadas.

## Control de acceso

- Token de mesa en `x-mesa` o `?k=`.
- Credencial de concejal en cada acción del puesto móvil.
- Límite de reintentos por IP y tipo de acción (20 o 30 por minuto).
- Las rutas de archivos estáticos se restringen al directorio `public/`.

## Recomendaciones operativas

1. Usar una Wi-Fi exclusiva para la sesión; nunca una red pública.
2. Imprimir las credenciales después de guardar el padrón y guardarlas en sobre cerrado.
3. Anotar en papel las claves de la comisión; no enviarlas por WhatsApp ni escribirlas en el computador.
4. Cerrar la sesión al terminar y exportar el respaldo.
5. No compartir `sesion.json` de una sesión real: contiene credenciales y votos.
6. Recordar que el acta es **BORRADOR SIN VALIDEZ JURÍDICA**.
