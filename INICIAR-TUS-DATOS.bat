@echo off
setlocal
set "RAIZ=%~dp0"
set "NODE=%RAIZ%.tools\node-v22.14.0-win-x64\node.exe"
if not exist "%NODE%" (
  echo No se encontro Node en: %NODE%
  pause
  exit /b 1
)
set "SALA_DATOS=%APPDATA%\Sala de Sesiones\sala-de-sesiones-2"
set "SALA_PUERTO=4700"
set "SALA_ABRIR=0"
echo Iniciando Sala de Sesiones 2.0 con tus datos reales...
echo Direccion para los celulares: http://192.168.0.2:4700
echo No cierre esta ventana mientras dure la sesion.
"%NODE%" "%RAIZ%server\standalone.js"
pause
