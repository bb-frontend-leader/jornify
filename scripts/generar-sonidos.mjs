// Genera los sonidos de Jornify (WAV mono, 16 bits, 44,1 kHz) en resources/sonidos/.
// Regla: lo que empieza o retoma el trabajo sube de tono; lo que lo pausa baja; el fin cierra con un arpegio descendente.
// Uso: node scripts/generar-sonidos.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRECUENCIA_MUESTREO = 44_100
const VOLUMEN = 0.32

const NOTA = { sol4: 392, la4: 440, mi5: 659.25, re5: 587.33, do5: 523.25, sol5: 783.99, la5: 880, do6: 1046.5, mi4: 329.63 }

// Cada sonido es una lista de notas: [frecuencia, inicio en segundos, duración en segundos, timbre].
const sonidos = {
  inicio: [[NOTA.do5, 0, 0.3], [NOTA.sol5, 0.13, 0.5]],
  regreso_almuerzo: [[NOTA.mi5, 0, 0.3], [NOTA.la5, 0.13, 0.5]],
  regreso: [[NOTA.la4, 0, 0.28], [NOTA.re5, 0.12, 0.45]],
  almuerzo: [[NOTA.sol5, 0, 0.3], [NOTA.mi5, 0.13, 0.5]],
  ausencia: [[NOTA.re5, 0, 0.28], [NOTA.la4, 0.12, 0.45]],
  fin: [[NOTA.do6, 0, 0.3], [NOTA.sol5, 0.11, 0.3], [NOTA.mi5, 0.22, 0.3], [NOTA.do5, 0.33, 0.7]],
  // Error: dos pulsos graves con timbre más áspero (triangular), claramente distinto de los demás.
  fallo: [[NOTA.sol4, 0, 0.18, 'aspero'], [NOTA.mi4, 0.2, 0.3, 'aspero']],
  // Confirmación al activar los sonidos desde el interruptor.
  activado: [[NOTA.do6, 0, 0.18]]
}

/** Tono suave tipo marimba: fundamental + segundo armónico, ataque corto y caída exponencial. */
function muestra(frecuencia, t, duracion, timbre) {
  const ataque = Math.min(1, t / 0.008)
  const caida = Math.exp(-t * (timbre === 'aspero' ? 11 : 6.5))
  const salida = Math.min(1, (duracion - t) / 0.03) // evita el "clic" al cortar
  const fase = 2 * Math.PI * frecuencia * t
  const onda =
    timbre === 'aspero'
      ? (2 / Math.PI) * Math.asin(Math.sin(fase))
      : Math.sin(fase) + 0.28 * Math.sin(2 * fase) + 0.08 * Math.sin(3 * fase)
  return onda * ataque * caida * Math.max(0, salida)
}

function sintetizar(notas) {
  const total = Math.max(...notas.map(([, inicio, dur]) => inicio + dur)) + 0.05
  const datos = new Float64Array(Math.ceil(total * FRECUENCIA_MUESTREO))
  for (const [frecuencia, inicio, duracion, timbre] of notas) {
    const desde = Math.floor(inicio * FRECUENCIA_MUESTREO)
    const cuantas = Math.floor(duracion * FRECUENCIA_MUESTREO)
    for (let i = 0; i < cuantas && desde + i < datos.length; i++) {
      datos[desde + i] += muestra(frecuencia, i / FRECUENCIA_MUESTREO, duracion, timbre)
    }
  }
  const pico = Math.max(...datos.map(Math.abs)) || 1
  return Int16Array.from(datos, (valor) => Math.round((valor / pico) * VOLUMEN * 32767))
}

function aWav(muestras) {
  const bytes = muestras.length * 2
  const wav = Buffer.alloc(44 + bytes)
  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + bytes, 4)
  wav.write('WAVEfmt ', 8, 'ascii')
  wav.writeUInt32LE(16, 16) // tamaño del bloque fmt
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(FRECUENCIA_MUESTREO, 24)
  wav.writeUInt32LE(FRECUENCIA_MUESTREO * 2, 28) // bytes por segundo
  wav.writeUInt16LE(2, 32) // bytes por muestra
  wav.writeUInt16LE(16, 34) // bits por muestra
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(bytes, 40)
  muestras.forEach((valor, i) => wav.writeInt16LE(valor, 44 + i * 2))
  return wav
}

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'sonidos')
mkdirSync(destino, { recursive: true })
for (const [nombre, notas] of Object.entries(sonidos)) {
  const wav = aWav(sintetizar(notas))
  writeFileSync(join(destino, `${nombre}.wav`), wav)
  console.log(`resources/sonidos/${nombre}.wav  ${(wav.length / 1024).toFixed(0)} KB`)
}
