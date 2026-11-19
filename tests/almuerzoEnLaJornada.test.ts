import { beforeEach, describe, expect, it } from 'vitest'
import { configPorDefecto } from '../src/main/configEsquema'
import { Controlador } from '../src/main/controlador'
import { Historial } from '../src/main/historial'
import type { Publicador } from '../src/main/publicadores/base'
import { derivarProgreso, jornadaObjetivoDelDia, salidaPlaneada } from '../src/main/tiempo'
import { validarAjustes, ajustesDeConfig } from '../src/main/ajustes'

const MIN = 60_000
const HORA = 60 * MIN

// El almuerzo está dentro de la jornada: tomarlo no corre la hora de salida.
describe('el almuerzo no alarga la jornada', () => {
  it('por defecto: 10 h con el almuerzo dentro son 9 h netas y la salida es entrada + 10 h', () => {
    const config = configPorDefecto()
    expect(config.horario.jornadaObjetivoHoras).toBe(10)
    expect(config.horario.horaSalida).toBe('18:00')
    expect(jornadaObjetivoDelDia(config.horario, new Date(2026, 10, 10))).toBe(9)
    expect(jornadaObjetivoDelDia(config.horario, new Date(2026, 10, 9))).toBe(8) // lunes: 1 h menos
    expect(salidaPlaneada('06:39', 10)).toBe('16:39')
  })

  describe('salida estimada', () => {
    const entrada = new Date(2026, 10, 10, 6, 39).getTime()
    const salida = entrada + 10 * HORA // 16:39
    const almuerzo = 60 * MIN

    it('antes de almorzar ya cuenta el almuerzo previsto', () => {
      const p = derivarProgreso(0, 9, 'trabajando', entrada, { porTomarMs: almuerzo, terminaEnMs: null })
      expect(p.salidaEstimada?.getTime()).toBe(salida)
    })

    it('durante el almuerzo no se corre mientras dure lo previsto', () => {
      // Sale a almorzar a las 11:39 con 5 h trabajadas; el almuerzo previsto termina a las 12:39.
      const salio = entrada + 5 * HORA
      const termina = salio + almuerzo
      for (const minutos of [0, 20, 59]) {
        const ahora = salio + minutos * MIN
        const p = derivarProgreso(5 * HORA, 9, 'en_almuerzo', ahora, { porTomarMs: 0, terminaEnMs: termina })
        expect(p.salidaEstimada?.getTime()).toBe(salida)
      }
    })

    it('si el almuerzo se pasa de lo previsto, la salida se corre lo que se pasó', () => {
      const salio = entrada + 5 * HORA
      const ahora = salio + 80 * MIN
      const p = derivarProgreso(5 * HORA, 9, 'en_almuerzo', ahora, { porTomarMs: 0, terminaEnMs: salio + almuerzo })
      expect(p.salidaEstimada?.getTime()).toBe(salida + 20 * MIN)
    })

    it('después de almorzar sigue en la misma hora', () => {
      const ahora = entrada + 6 * HORA + 30 * MIN // 13:09: 5 h antes del almuerzo y media hora después
      const trabajado = 5.5 * HORA
      const p = derivarProgreso(trabajado, 9, 'trabajando', ahora, { porTomarMs: 0, terminaEnMs: null })
      expect(p.salidaEstimada?.getTime()).toBe(ahora + 3.5 * HORA)
    })
  })

  describe('en el controlador', () => {
    let reloj: Date
    let controlador: Controlador
    const publicador: Publicador = { publicar: () => Promise.resolve() }
    const en = (h: number, m: number): Date => new Date(2026, 10, 10, h, m)
    /** Hora de salida que muestra el reloj ahora, como lo calcula la interfaz. */
    const salidaMostrada = (): Date | null => {
      const foto = controlador.instantanea()
      const trabajado = foto.trabajadoMs + (foto.corriendo ? reloj.getTime() - foto.calculadoEn : 0)
      return derivarProgreso(trabajado, foto.objetivoMs / HORA, foto.estado, reloj.getTime(), {
        porTomarMs: foto.almuerzoPorTomarMs,
        terminaEnMs: foto.almuerzoTerminaEnMs
      }).salidaEstimada
    }

    beforeEach(() => {
      reloj = en(6, 39)
      controlador = new Controlador({
        historial: Historial.abrir(':memory:'),
        publicador,
        obtenerConfig: configPorDefecto,
        ahora: () => reloj,
        registrarError: () => undefined
      })
    })

    it('entrar a las 6:39 da salida 16:39 antes, durante y después del almuerzo', async () => {
      await controlador.ejecutar('inicio')
      expect(salidaMostrada()).toEqual(en(16, 39))

      reloj = en(11, 39)
      expect(salidaMostrada()).toEqual(en(16, 39))
      await controlador.ejecutar('almuerzo')
      expect(controlador.instantanea().almuerzoTerminaEnMs).toBe(en(12, 39).getTime())
      reloj = en(12, 10)
      expect(salidaMostrada()).toEqual(en(16, 39))

      reloj = en(12, 39)
      await controlador.ejecutar('regreso_almuerzo')
      expect(controlador.instantanea().almuerzoPorTomarMs).toBe(0)
      expect(salidaMostrada()).toEqual(en(16, 39))
      reloj = en(14, 0)
      expect(salidaMostrada()).toEqual(en(16, 39))
    })

    it('fuera de jornada no hay almuerzo por tomar', () => {
      expect(controlador.instantanea().almuerzoPorTomarMs).toBe(0)
      expect(controlador.instantanea().almuerzoTerminaEnMs).toBeNull()
    })
  })

  describe('ajustes', () => {
    it('rechaza un almuerzo que no cabe en la jornada', () => {
      const base = ajustesDeConfig(configPorDefecto())
      expect(validarAjustes({ ...base, jornadaObjetivoHoras: 2, recorteLunesHoras: 0, duracionAlmuerzoMin: 120 })).toMatchObject({ ok: false })
      expect(validarAjustes({ ...base, jornadaObjetivoHoras: 10, recorteLunesHoras: 0, duracionAlmuerzoMin: 60 })).toMatchObject({ ok: true })
    })
  })
})

// La salida planeada del mensaje de fin sale de cuándo se empezó, no de la hora de entrada de Ajustes.
describe('mensaje de fin al recuperar una ausencia entrando a otra hora', () => {
  async function jornada(pasos: [string, number, number][]): Promise<string> {
    let reloj = new Date(2026, 10, 10, 6, 0)
    const mensajes: string[] = []
    const publicador: Publicador = {
      publicar: (mensaje) => {
        mensajes.push(mensaje)
        return Promise.resolve()
      }
    }
    // Config por defecto: entrada de Ajustes a las 8:00 y jornada de 10 h (salida 18:00), pero se entra a las 6:00.
    const controlador = new Controlador({
      historial: Historial.abrir(':memory:'),
      publicador,
      obtenerConfig: configPorDefecto,
      ahora: () => reloj,
      nombre: 'Ale',
      registrarError: () => undefined
    })
    for (const [tipo, h, m] of pasos) {
      reloj = new Date(2026, 10, 10, h, m)
      await controlador.ejecutar(tipo as 'inicio')
    }
    return mensajes.at(-1) ?? ''
  }
  const base: [string, number, number][] = [['inicio', 6, 0], ['almuerzo', 11, 0], ['regreso_almuerzo', 12, 0], ['ausencia', 14, 0], ['regreso', 14, 20]]

  it('entra a las 6:00, se ausenta 20 minutos y sale a las 4:20 p. m.: dice que recupera 20 minutos', async () => {
    expect(await jornada([...base, ['fin', 16, 20]])).toBe(
      '⏱️ Buenas tardes, termino mi jornada (4:20 p. m.) y recupero 20 minutos de hoy @Angela Ortiz Peña'
    )
  })

  it('sale a las 4:00 p. m. sin recuperar la ausencia: mensaje normal', async () => {
    expect(await jornada([...base, ['fin', 16, 0]])).toBe('🌇 Buenas tardes, termino mi jornada (4:00 p. m.) @Angela Ortiz Peña')
  })

  it('un almuerzo que se pasa corre la salida sin ser tiempo recuperado', async () => {
    // Almuerzo de 1 h 30 min y sin ausencias: sale a las 4:30 p. m. sin nada que recuperar.
    const pasos: [string, number, number][] = [['inicio', 6, 0], ['almuerzo', 11, 0], ['regreso_almuerzo', 12, 30], ['fin', 16, 30]]
    expect(await jornada(pasos)).toBe('🌇 Buenas tardes, termino mi jornada (4:30 p. m.) @Angela Ortiz Peña')
  })

  it('con almuerzo pasado y ausencia, solo cuenta la ausencia recuperada', async () => {
    // Almuerzo de 1 h 30 min (30 de más) y 20 min ausente: la salida planeada pasa a las 4:30; a las 4:50 recupera 20.
    const pasos: [string, number, number][] = [['inicio', 6, 0], ['almuerzo', 11, 0], ['regreso_almuerzo', 12, 30], ['ausencia', 14, 0], ['regreso', 14, 20], ['fin', 16, 50]]
    expect(await jornada(pasos)).toBe('⏱️ Buenas tardes, termino mi jornada (4:50 p. m.) y recupero 20 minutos de hoy @Angela Ortiz Peña')
  })
})
