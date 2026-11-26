# Cómo colaborar

Gracias por mejorar **Sala de Sesiones 2.0**.

## Principios

- El sistema es para el Concejo Municipal de Popayán: claridad ante todo, sin jargon innecesario en la interfaz.
- El acta siempre es **BORRADOR SIN VALIDEZ JURÍDICA**. No quitar esa advertencia.
- Nunca subir credenciales, `sesion.json`, claves, fragmentos ni datos reales de concejales.
- Preferir cambios pequeños y verificables.

## Flujo

1. Crear una rama desde `main`: `git checkout -b nombre-corto`.
2. Hacer el cambio y agregar pruebas cuando aplique.
3. Ejecutar:

   ```powershell
   npm test
   npm run smoke
   ```

4. Confirmar que no se versionan datos: `git status` no debe mostrar `sesion.json`, `datos-locales/`, `dist/`, `node_modules/` ni `.tools/`.
5. Abrir un pull request describiendo **qué cambia, por qué y cómo se probó**.

## Estilo

- JavaScript sin transpilación; compatibilidad con Node 22 y Electron 33.
- Comentarios en español, concisos.
- Nombres de funciones en `camelCase`; constantes en `MAYUSCULAS`.
- La lógica de quórum y escrutinio va en `server/core.js`, sin efectos de lado, para poder probarla de forma aislada.

## Reportar un fallo

Incluir: versión, sistema operativo, paso para reproducir, mensaje de error y si ocurrió con datos reales o de demostración. **No pegar tokens ni credenciales** en el issue.

## Seguridad

Si encontrás un problema de seguridad, no lo publiques en un issue abierto. Contactá al mantenedor (Juan Pablo López) de forma privada.
