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
