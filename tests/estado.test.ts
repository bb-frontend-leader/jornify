import { describe, expect, it } from 'vitest'
import {
  type EstadoJornada,
  type TipoEvento,
  TIPOS_EVENTO,
  TransicionInvalidaError,
  accionesValidas,
  almuerzoCompletado,
  esTipoEvento,
  estadoDesdeEventos,
  etiquetaDeAccion,
  siguienteEstado
} from '../src/main/estado'
import { aIsoConZona } from '../src/main/fechas'

const hora = (h: number, m = 0): string => aIsoConZona(new Date(2026, 10, 6, h, m))

describe('siguienteEstado', () => {
  const validas: [EstadoJornada, TipoEvento, EstadoJornada][] = [
    ['fuera_de_jornada', 'inicio', 'trabajando'],
    ['trabajando', 'almuerzo', 'en_almuerzo'],
    ['en_almuerzo', 'regreso_almuerzo', 'trabajando'],
    ['trabajando', 'ausencia', 'ausente'],
    ['ausente', 'regreso', 'trabajando'],
    ['trabajando', 'fin', 'fuera_de_jornada']
  ]

  it.each(validas)('desde %s con "%s" pasa a %s', (desde, tipo, hacia) => {
    expect(siguienteEstado(desde, tipo)).toBe(hacia)
  })

  it('rechaza todas las transiciones que no están en la tabla de la especificación', () => {
    const estados: EstadoJornada[] = ['fuera_de_jornada', 'trabajando', 'en_almuerzo', 'ausente']
    const permitidas = new Set(validas.map(([desde, tipo]) => `${desde}|${tipo}`))
    let rechazadas = 0
    for (const estado of estados) {
      for (const tipo of TIPOS_EVENTO) {
        if (permitidas.has(`${estado}|${tipo}`)) continue
        expect(() => siguienteEstado(estado, tipo)).toThrow(TransicionInvalidaError)
        rechazadas++
      }
    }
    expect(rechazadas).toBe(4 * 6 - 6)
  })

  it('el error indica el estado y el evento rechazados', () => {
    try {
      siguienteEstado('en_almuerzo', 'fin')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(TransicionInvalidaError)
      expect((error as TransicionInvalidaError).estado).toBe('en_almuerzo')
      expect((error as TransicionInvalidaError).tipo).toBe('fin')
    }
  })
})

describe('accionesValidas', () => {
  it('ofrece solo las acciones del estado actual, en el orden de la especificación', () => {
    expect(accionesValidas('fuera_de_jornada')).toEqual(['inicio'])
    expect(accionesValidas('trabajando')).toEqual(['almuerzo', 'ausencia', 'fin'])
    expect(accionesValidas('en_almuerzo')).toEqual(['regreso_almuerzo'])
    expect(accionesValidas('ausente')).toEqual(['regreso'])
  })

  it('cada acción tiene su etiqueta', () => {
    expect(etiquetaDeAccion('inicio')).toBe('Iniciar jornada')
    expect(etiquetaDeAccion('regreso_almuerzo')).toBe('Regresar de almuerzo')
  })
})

describe('estadoDesdeEventos', () => {
  it('sin eventos está fuera de jornada', () => {
    expect(estadoDesdeEventos([])).toBe('fuera_de_jornada')
  })

  it('toma el estado que deja el último evento', () => {
    expect(estadoDesdeEventos([{ tipo: 'inicio', ocurridoEn: hora(8) }])).toBe('trabajando')
    expect(
      estadoDesdeEventos([
        { tipo: 'inicio', ocurridoEn: hora(8) },
        { tipo: 'almuerzo', ocurridoEn: hora(12, 30) }
      ])
    ).toBe('en_almuerzo')
  })

  it('usa la hora real y no el orden de la lista', () => {
    expect(
      estadoDesdeEventos([
        { tipo: 'almuerzo', ocurridoEn: hora(12, 30) },
        { tipo: 'inicio', ocurridoEn: hora(8) }
      ])
    ).toBe('en_almuerzo')
  })

  it('recorre una jornada completa hasta terminar fuera de jornada', () => {
    const eventos = (['inicio', 'almuerzo', 'regreso_almuerzo', 'ausencia', 'regreso', 'fin'] as const).map(
      (tipo, i) => ({ tipo, ocurridoEn: hora(8 + i) })
    )
    expect(estadoDesdeEventos(eventos)).toBe('fuera_de_jornada')
  })
})

describe('esTipoEvento', () => {
  it('reconoce solo los tipos definidos', () => {
    expect(esTipoEvento('ausencia')).toBe(true)
    expect(esTipoEvento('descanso')).toBe(false)
    expect(esTipoEvento(undefined)).toBe(false)
  })
})

describe('solo se almuerza una vez por jornada', () => {
  const ev = (tipo: TipoEvento, h: number, m = 0) => ({ tipo, ocurridoEn: hora(h, m) })

  it('con el almuerzo completo ya no se ofrece salir a almorzar', () => {
    expect(accionesValidas('trabajando')).toEqual(['almuerzo', 'ausencia', 'fin'])
    expect(accionesValidas('trabajando', { almuerzoTomado: true })).toEqual(['ausencia', 'fin'])
    expect(() => siguienteEstado('trabajando', 'almuerzo', { almuerzoTomado: true })).toThrow(TransicionInvalidaError)
  })

  it('no cambia las demás acciones', () => {
    for (const estado of ['fuera_de_jornada', 'en_almuerzo', 'ausente'] as const) {
      expect(accionesValidas(estado, { almuerzoTomado: true })).toEqual(accionesValidas(estado))
    }
  })

  it('almuerzoCompletado cuenta el regreso, no solo la salida', () => {
    expect(almuerzoCompletado([])).toBe(false)
    expect(almuerzoCompletado([ev('inicio', 8)])).toBe(false)
    expect(almuerzoCompletado([ev('inicio', 8), ev('almuerzo', 12)])).toBe(false)
    expect(almuerzoCompletado([ev('inicio', 8), ev('almuerzo', 12), ev('regreso_almuerzo', 13)])).toBe(true)
  })

  it('un nuevo inicio abre una jornada con su propio almuerzo', () => {
    const jornada1 = [ev('inicio', 8), ev('almuerzo', 12), ev('regreso_almuerzo', 13), ev('fin', 14)]
    expect(almuerzoCompletado(jornada1)).toBe(true)
    expect(almuerzoCompletado([...jornada1, ev('inicio', 16)])).toBe(false)
    expect(almuerzoCompletado([...jornada1, ev('inicio', 16), ev('almuerzo', 17), ev('regreso_almuerzo', 18)])).toBe(true)
  })
})
