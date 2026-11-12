// Genera el logo clásico de Jornify en resources/: icono.png (256 px) e icono.ico (16 a 256 px, para el instalador y el .exe).
// Lo dibuja src/main/iconos.ts, el mismo código que usa la app para pintar el logo de cada tema en tiempo de ejecución.
// Uso: node scripts/generar-logo.mjs [carpeta-de-salida]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IDENTIDAD_CLASICA, TAMANOS_DEL_ICO, icoDelLogo, pngDelLogo } from '../src/main/iconos.ts'

const destino = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
mkdirSync(destino, { recursive: true })
writeFileSync(join(destino, 'icono.png'), pngDelLogo(256, IDENTIDAD_CLASICA))
writeFileSync(join(destino, 'icono.ico'), icoDelLogo(TAMANOS_DEL_ICO, IDENTIDAD_CLASICA))
console.log(`${destino}: icono.png e icono.ico`)
