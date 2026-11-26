# 2. Guía de usuario

## Para la secretaría (mesa de control)

La mesa tiene siete secciones: **Preparar, Datos y reglas, Concejales, Orden del día, Asistencia, Votaciones y Auditoría**.

### Preparar

- Muestra la dirección que deben abrir los celulares y su QR de comprobación de red.
- Muestra la carpeta de datos y si la sesión está PROGRAMADA, ABIERTA o CERRADA.
- Botones: pantalla del salón, credenciales, acta, exportar y empezar de cero.

**Comprobar antes de empezar:** abrir la dirección en un celular conectado al Wi-Fi. Si no carga, no avanzar.

### Datos y reglas

- Nombre de la corporación, municipio, número/año/tipo de sesión.
- Fracciones de quórum: deliberatorio, decisorio y calificado.
- `impedimentoReduceBase`: si los impedimentos aprobados reducen la base de cálculo.

Cambiar las reglas **antes** de instalar la sesión. Después quedan congeladas.

### Concejales

- Importar CSV o pegar una lista. Se aceptan `|`, `;`, `,` y tabulador; se salta el encabezado y el BOM.
- Formato: `apellido | nombre | partido`.
- Al guardar se regeneran las credenciales. Las hojas impresas antes dejan de servir.
- El partido **no es decorativo**: se usa para exigir que la comisión escrutadora tenga bancadas distintas.

Plantilla: `examples/padron-ejemplo.csv`.

### Orden del día

Cada punto es una fila editable:

| Columna | Qué hace |
|---|---|
| Punto | Título del asunto |
| Tipo | Desplegable: Proyecto de acuerdo, Proposición, Elección, Informativo |
| Mayoría | Simple, Absoluta o Calificada |
| Votación permitida | Modalidades que habilita el tipo |
| Acciones | ↑ subir, ↓ bajar, ✕ eliminar |

- **+ Agregar punto** crea una fila nueva.
- **Guardar orden del día** aplica todo junto.
- Si se reordenan o eliminan puntos, se conservan candidatos y comisiones de los que quedan.
- La opción plegable *Pegar una lista en texto* permite cargar varias filas `título | tipo | mayoría`.

**Tip:** declarar los candidatos de un punto de elección después de guardar el orden, en la sección *Candidatos de elección*.

### Asistencia

- Tabla de concejales con estado y hora de check-in.
- Barra de quórum en vivo: presentes, umbral deliberatorio y decisorio.
- Botón **Instalar sesión**: se habilita con quórum deliberatorio. Congela padrón, reglas y orden.

### Votaciones

Para cada punto:

1. Elegir **modalidad** (la columna *Votación permitida* indica las opciones válidas).
2. **Abrir** el punto.
3. Esperar a que voten los concejales; el progreso se actualiza solo.
4. **Cerrar** la votación. Aparece el veredicto con la fórmula.

En elección secreta, además:

1. Inscribir candidatos en *Orden del día → Candidatos de elección*.
2. Designar la **comisión escrutadora** (mínimo dos partidos distintos, umbral *k de n*).
3. Cada miembro abre su credencial, genera su clave de 6 dígitos y la **confirma**. La clave se muestra una sola vez: anotarla en papel.
4. La mesa abre la votación cuando hay `k` confirmaciones.
5. Los concejales depositan su boleta. El sentido del voto no aparece en el estado público.
6. **Cerrar urna**. Ya no se admiten boletas.
7. Ceremonia: cada miembro de la comisión aporta su clave. Con `k` aportes se abre el escrutinio.
8. **Cerrar** el punto: se muestra el conteo y el electo.

### Auditoría

Lista de eventos con sello de tiempo y verificación de la cadena SHA-256.

---

## Para los concejales (celular)

1. Abrir la dirección que indicó la secretaría, o escanear el QR de la credencial impresa.
2. Si la cámara no lee, escribir la **clave de 6 dígitos** impresa.
3. Tocar **Estoy presente**. El check-in queda registrado con hora.
4. Si tiene un conflicto de interés en el punto en curso, tocar **Declarar impedimento** y escribir el motivo. La mesa lo aprueba o rechaza.
5. Cuando la mesa abre un punto, votar:
   - **Ordinaria / nominal:** SÍ, NO o ABSTENCIÓN (la abstención solo si el impedimento fue aprobado).
   - **Secreta:** elegir candidato o boleta en blanco. No se puede cambiar después de depositar.
6. Si forma parte de la comisión escrutadora: generar y confirmar su clave antes de la votación, y aportarla al cerrar la urna.

> Cada acción envía la credencial. No hace falta iniciar sesión ni recordar nada después de cerrar la pestaña, pero conviene conservar la hoja impresa.

---

## Pantalla del salón y acta

- **Pantalla del salón** (`/proyector`): quórum, punto en curso y resultado en grande; se actualiza en tiempo real.
- **Acta** (`/acta`): borrador con los puntos, fórmulas, huella SHA-256 y la advertencia *SIN VALIDEZ JURÍDICA*.
- **Exportar respaldo**: JSON con todo el estado excepto claves y fragmentos.

---

## Reglas que se aplican solas

- No se puede votar sin quórum decisorio ni sin haber marcado asistencia.
- No se puede cambiar el voto en la misma ronda.
- Con impedimento aprobado solo se puede votar ABSTENCIÓN en ese punto.
- No se puede abrir una elección secreta sin candidatos, sin comisión o sin `k` claves confirmadas.
- No se puede cerrar la sesión mientras haya una votación abierta o en escrutinio.
- Después de instalar la sesión, padrón, reglas y orden del día quedan congelados.
