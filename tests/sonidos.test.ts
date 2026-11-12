import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TIPOS_EVENTO } from '../src/main/estado'
import { type NombreSonido, crearReproductor } from '../src/main/sonidos'

const CARPETA = join(__dirname, '..', 'resources', 'sonidos')

describe('crearReproductor', () => {
  it('lanza PowerShell en segundo plano y pasa la ruta del .wav por variable de entorno', () => {
    const llamadas: { comando: string; args: string[]; env: NodeJS.ProcessEnv }[] = []
    const reproductor = crearReproductor({
      directorio: "C:\\Users\\O'Brien\\Jornify\\sonidos",
      lanzar: (comando, args, env) => llamadas.push({ comando, args, env })
    })

    reproductor.reproducir('regreso_almuerzo')

    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]?.comando).toBe('powershell.exe')
    expect(llamadas[0]?.args).toContain('-NoProfile')
    expect(llamadas[0]?.args.at(-1)).toContain('$env:JORNIFY_SONIDO')
    // Un apóstrofo en la ruta no rompe nada porque la ruta no va dentro del comando.
    expect(llamadas[0]?.args.join(' ')).not.toContain("O'Brien")
    expect(llamadas[0]?.env['JORNIFY_SONIDO']).toBe("C:\\Users\\O'Brien\\Jornify\\sonidos\\regreso_almuerzo.wav")
  })

  it('si no se puede lanzar el proceso avisa del error y no lo propaga', () => {
    const errores: unknown[] = []
    const reproductor = crearReproductor({
      directorio: CARPETA,
      lanzar: () => {
        throw new Error('sin powershell')
      },
      alErrorar: (error) => errores.push(error)
    })
    expect(() => reproductor.reproducir('inicio')).not.toThrow()
    expect(errores).toHaveLength(1)
  })
})

describe('archivos de sonido', () => {
  const nombres: NombreSonido[] = [...TIPOS_EVENTO, 'fallo', 'activado']

  it.each(nombres)('existe resources/sonidos/%s.wav y es un WAV PCM mono de 16 bits válido', (nombre) => {
    const wav = readFileSync(join(CARPETA, `${nombre}.wav`))
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt16LE(20)).toBe(1) // PCM
    expect(wav.readUInt16LE(22)).toBe(1) // mono
    expect(wav.readUInt16LE(34)).toBe(16) // bits
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44) // tamaño declarado = datos reales
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8)
  })

  it('ningún sonido pasa de 1,2 s ni supera un volumen moderado', () => {
    for (const nombre of nombres) {
      const wav = readFileSync(join(CARPETA, `${nombre}.wav`))
      const muestras = (wav.length - 44) / 2
      expect(muestras / wav.readUInt32LE(24)).toBeLessThan(1.2)
      let pico = 0
      for (let i = 0; i < muestras; i++) pico = Math.max(pico, Math.abs(wav.readInt16LE(44 + i * 2)))
      expect(pico / 32767).toBeLessThanOrEqual(0.35)
      expect(pico / 32767).toBeGreaterThan(0.1) // y no es un archivo mudo
    }
  })
})
