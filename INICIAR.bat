@echo off
setlocal
set "RAIZ=%~dp0"
set "NODE=%RAIZ%.tools\node-v22.14.0-win-x64\node.exe"
if not exist "%NODE%" (
  echo No se encontro Node en: %NODE%
  echo Use el instalador SalaDeSesiones-Setup-2.0.0.exe o descargue Node 22 a la carpeta .tools.
  pause
  exit /b 1
)
echo Iniciando Sala de Sesiones 2.0 en modo servidor local...
"%NODE%" "%RAIZ%server\standalone.js"
pause
