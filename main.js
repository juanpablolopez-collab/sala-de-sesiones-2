'use strict';

const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { crearServidor } = require('./server');

let ventana = null;
let servidor = null;
let info = null;

const dataDir = path.join(app.getPath('userData'), 'sala-de-sesiones-2');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore();
      ventana.focus();
    }
  });
}

function urlMesa() {
  return `http://127.0.0.1:${info.puerto}/?k=${info.tokenMesa}`;
}

function abrirExterno(ruta) {
  shell.openExternal(`${info.url}${ruta}`);
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#0a1018',
    title: 'Sala de Sesiones',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  ventana.loadURL(urlMesa());
  ventana.on('closed', () => { ventana = null; });
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function construirMenu() {
  const plantilla = [
    {
      label: 'Sala',
      submenu: [
        { label: 'Mesa de control', accelerator: 'Ctrl+1', click: () => ventana && ventana.loadURL(urlMesa()) },
        { label: 'Pantalla del salón', accelerator: 'Ctrl+2', click: () => abrirExterno('/proyector') },
        { label: 'Hoja de credenciales', accelerator: 'Ctrl+3', click: () => abrirExterno('/credenciales') },
        { label: 'Acta (borrador)', accelerator: 'Ctrl+4', click: () => abrirExterno('/acta') },
        { type: 'separator' },
        {
          label: 'Dirección para los celulares',
          click: () => dialog.showMessageBox(ventana, {
            type: 'info',
            title: 'Dirección del servidor',
            message: 'Los concejales deben abrir esta dirección en el mismo Wi-Fi',
            detail: `Dirección  ${info.url}\nPuerto     ${info.puerto}\n\n`
              + 'No sirve "localhost" en los celulares: usen la dirección de arriba o escaneen el código QR de la hoja de credenciales.\n\n'
              + `Datos guardados en:\n${dataDir}`,
          }),
        },
        {
          label: 'Abrir carpeta de datos',
          click: () => { fs.mkdirSync(dataDir, { recursive: true }); shell.openPath(dataDir); },
        },
        { type: 'separator' },
        { label: 'Recargar', accelerator: 'Ctrl+R', role: 'reload' },
        { label: 'Herramientas de desarrollo', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'Ctrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    servidor = crearServidor({ dataDir, puerto: 4700, puertoMax: 4710 });
    info = await servidor.iniciar();
    construirMenu();
    crearVentana();
  } catch (e) {
    dialog.showErrorBox('No se pudo iniciar Sala de Sesiones', String((e && e.message) || e));
    app.quit();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (servidor) {
    try { await servidor.detener(); } catch (e) { /* no bloquea el cierre */ }
  }
});
