# 8. Historial de cambios

## 2.0.0 — entrega para el Concejo Municipal de Popayán

### Correcciones funcionales

- **Check-in desde celular:** el cliente envía la credencial (`tokenConcejal`) en todas las acciones (asistencia, voto, impedimento y comisión). Antes solo se enviaba al abrir la credencial y el check-in respondía *«Credencial inválida»*.
- **Importación del padrón:** el analizador acepta `,`, `|`, `;`, tabulador, salta encabezado y elimina BOM. La plantilla pasó a usar `|` para evitar conflictos con las comas de los apellidos.
- **Orden del día rediseñado:** reemplazo del textarea por un editor de filas con desplegables de tipo y mayoría, columna de modalidades permitidas, botones ↑/↓/✕ y *+ Agregar punto*. Se conserva la opción de pegar texto.
- **Conservación de datos al reordenar:** `POST /api/puntos` ahora respeta los IDs existentes y preserva candidatos, comisiones y resultados de los puntos que permanecen; limpia solo los eliminados. La respuesta incluye `detalle` con los IDs asignados.

### Verificación

- 11 pruebas unitarias superadas.
- 16 comprobaciones de la prueba de sesión completa superadas.
- Sesión real 42/2026 ejecutada de extremo a extremo con 19 credenciales, impedimentos, votaciones, elección secreta con comisión y urna, elección nominal, cierre, acta y exportación.

### Documentación

- README general y manuales de instalación, usuario, arquitectura, seguridad, API, pruebas, preguntas frecuentes e historial.
- Repositorio privado con ejemplos sintéticos; sin credenciales ni sesiones reales versionadas.

---

## Versiones anteriores

La reconstructión original incluía asistencia por QR, quórum, modalidades ordinaria/nominal/secreta, comisión escrutadora, acta y exportación. Los fallos listados arriba se corregieron antes de esta entrega.
