'use strict';

/** Genera build/icon.ico sin dependencias externas (ICO de 256×256, 32 bits). */
const fs = require('node:fs');
const path = require('node:path');

const TAM = 256;
const letraS = [
  '01111',
  '10000',
  '10000',
  '01110',
  '00001',
  '00001',
  '11110',
];
const ESCALA = 11;
const anchoLetra = 5 * ESCALA;
const altoLetra = 7 * ESCALA;
const x0 = Math.floor((TAM - anchoLetra) / 2);
const y0 = Math.floor((TAM - altoLetra) / 2);

function pixel(x, y) {
  const borde = x < 10 || y < 10 || x >= TAM - 10 || y >= TAM - 10;
  const esquina = (x < 34 && y < 34) || (x >= TAM - 34 && y < 34)
    || (x < 34 && y >= TAM - 34) || (x >= TAM - 34 && y >= TAM - 34);
  if (esquina) return [10, 16, 24];
  if (borde) return [215, 171, 98];
  if (x >= x0 && x < x0 + anchoLetra && y >= y0 && y < y0 + altoLetra) {
    const fila = Math.floor((y - y0) / ESCALA);
    const col = Math.floor((x - x0) / ESCALA);
    if (letraS[fila][col] === '1') return [240, 214, 164];
  }
  return [16, 30, 44];
}

const xor = Buffer.alloc(TAM * TAM * 4);
for (let y = 0; y < TAM; y++) {
  const filaDestino = TAM - 1 - y; // ICO guarda las filas de abajo hacia arriba
  for (let x = 0; x < TAM; x++) {
    const [r, g, b] = pixel(x, y);
    const i = (filaDestino * TAM + x) * 4;
    xor[i] = b; xor[i + 1] = g; xor[i + 2] = r; xor[i + 3] = 255;
  }
}

const cabecera = Buffer.alloc(40);
cabecera.writeUInt32LE(40, 0);
cabecera.writeInt32LE(TAM, 4);
cabecera.writeInt32LE(TAM * 2, 8); // altura doble: XOR + máscara AND
cabecera.writeUInt16LE(1, 12);
cabecera.writeUInt16LE(32, 14);
cabecera.writeUInt32LE(0, 16);
cabecera.writeUInt32LE(xor.length, 20);

const entrada = Buffer.alloc(16);
entrada[0] = 0;  // 256
entrada[1] = 0;  // 256
entrada[2] = 0;
entrada[3] = 0;
entrada.writeUInt16LE(1, 4);
entrada.writeUInt16LE(32, 6);
entrada.writeUInt32LE(40 + xor.length + TAM * TAM / 8, 8);
entrada.writeUInt32LE(22, 12);

const ico = Buffer.concat([
  Buffer.from([0, 0, 1, 0, 1, 0]),
  entrada,
  cabecera,
  xor,
  Buffer.alloc(TAM * TAM / 8),
]);

const destino = path.join(__dirname, 'icon.ico');
fs.writeFileSync(destino, ico);
console.log(`Icono generado: ${destino} (${ico.length} bytes)`);
