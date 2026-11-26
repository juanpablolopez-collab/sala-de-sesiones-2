# 6. Pruebas

## Comandos

```powershell
npm test          # 11 pruebas unitarias del núcleo
npm run smoke     # 16 comprobaciones de extremo a extremo
npm run dist      # construcción del instalador Windows
```

## Pruebas unitarias (`test/core.test.js`)

Cubren la lógica pura sin levantar servidor:

1. Umbrales derivados de un padrón de 13 concejales.
2. Base de cálculo con y sin reducción por impedimentos.
3. Escrutinio por mayoría simple y absoluta.
4. Elección secreta: electo, empate y boleta en blanco.
5. Validación de reglas de quórum.
6. Shamir: hacen falta `k` fragmentos y los correctos reconstruyen el secreto.
7. La clave del miembro protege su fragmento.
8. La boleta secreta se sella y solo se abre con la privada.
9. Credenciales y verificación HMAC.
10. Cadena de auditoría y detección de modificaciones.
11. Persistencia atómica y recuperación del respaldo.

## Prueba de sesión completa (`test/smoke.js`)

Levanta un servidor en una carpeta temporal (`os.tmpdir()`), con puerto propio, y recorre:

1. Servidor y token de mesa.
2. Credenciales y QR generados.
3. Verificación de una credencial individual.
4. Asistencia con quórum deliberatorio y decisorio.
5. Sesión instalada y padrón congelado.
6. Voto ordinario cerrado.
7. Rechazo de comisión de un solo partido.
8. Comisión válida, claves generadas y confirmadas.
9. Boletas cifradas depositadas sin filtrar el sentido del voto.
10. Urna abierta con `k` fragmentos y candidata electa.
11. Sin claves ni fragmentos en claro en `sesion.json`.
12. Acta con huella y advertencia de borrador.
13. Respaldo JSON exportado sin material sensible.
14. Las seis pantallas y recursos servidos correctamente.
15. Canal SSE enviando el estado.
16. Verificación de la cadena de auditoría.

La prueba usa datos **sintéticos** y una carpeta temporal: no toca la sesión real ni el padrón real.

## Integración continua (opcional)

Si se quiere CI en GitHub, agregar un workflow con `npm ci`, `npm test` y `npm run smoke` usando Node 22 y `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. El token usado para publicar este repo no tiene el permiso `workflow`, así que el archivo no se incluye en la entrega.

## Recomendación antes de una sesión real de ensayo

1. `npm test` y `npm run smoke` en el computador de la mesa.
2. Probar la red con un celular antes de que lleguen los concejales.
3. Imprimir credenciales **después** de guardar el padrón definitivo.
4. Verificar que el firewall permita la app en redes privadas.
5. Hacer una copia de la carpeta de datos al terminar.
