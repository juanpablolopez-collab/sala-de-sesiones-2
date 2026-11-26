# 7. Preguntas frecuentes

## ¿Necesita internet?

No. Todo corre en la red local. La IP y el QR se calculan desde la interfaz de red del computador.

## ¿Por qué `localhost` no sirve en los celulares?

`localhost` apunta al propio celular. Hay que usar la dirección `http://192.168.x.x:4701` que muestra la mesa, o escanear el QR de la credencial.

## El celular no carga la página

- Confirmar que está en el mismo Wi-Fi y que la red está marcada como **Privada**.
- Probar la dirección desde el navegador del celular.
- Permitir la aplicación en el Firewall de Windows para redes privadas.
- Si el PC tiene VPN, desactivarla durante la sesión.

## Da «Credencial inválida» al tocar *Estoy presente*

Usar la versión corregida: el puesto del concejal envía su credencial en **todas** las peticiones, no solo al abrir la credencial. Si se imprimió una hoja antes de guardar el padrón, ya no sirve: imprimir de nuevo.

## ¿Se pueden cambiar los concejales con la sesión abierta?

No. Al instalar la sesión, padrón, reglas y orden del día quedan congelados. Para cambiarlos hay que usar *Empezar de cero* (borra asistencia, votos y resultados; conserva padrón y orden).

## ¿Qué significa «La comisión debe integrarse con concejales de partidos distintos»?

El servidor exige al menos dos bancadas distintas en la comisión escrutadora. Es una regla deliberada, no un error.

## ¿Qué pasa si un miembro de la comisión olvida su clave?

La clave se muestra una sola vez al generarla y no se guarda. Hay que volver a designar la comisión (solo se puede antes de abrir la votación o antes de depositar boletas).

## ¿Se puede ver quién votó qué en la elección secreta?

No. La identidad queda en `participacion` y la boleta cifrada en `urna`, sin vínculo. La hora de la boleta se trunca al minuto para impedir correlacionarlas por llegada.

## ¿Por qué una abstención es rechazada?

Porque requiere un impedimento declarado por el concejal y **aprobado por la mesa** en ese punto.

## ¿El acta tiene validez jurídica?

No. Es un **borrador** con huella SHA-256 y advertencia explícita *SIN VALIDEZ JURÍDICA*. Sirve para ensayo y demostración.

## ¿Dónde se guarda la información?

En `%APPDATA%\Sala de Sesiones\sala-de-sesiones-2\sesion.json`, con copia `sesion.json.bak`. El menú *Sala → Abrir carpeta de datos* abre esa ruta.

## Windows bloquea el ejecutable

Algunos equipos tienen *Smart App Control* o directivas de control de aplicaciones que no permiten excepciones por aplicación. Usar el modo servidor con Node portátil (`INICIAR-TUS-DATOS.bat`) o pedir la excepción a TI.

## ¿Se puede clonar una sesión en otro computador?

Sí, copiando `sesion.json`. No compartir el de una sesión real porque contiene credenciales y votos.

## ¿Quién es el autor?

**Juan Pablo López**, desarrollado para el **Concejo Municipal de Popayán**. Licencia MIT.
