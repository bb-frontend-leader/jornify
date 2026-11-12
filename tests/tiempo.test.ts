import { describe, expect, it } from 'vitest'
import type { EventoJornada, TipoEvento } from '../src/main/estado'
import { aIsoConZona } from '../src/main/fechas'
import {
  type OpcionesTiempo,
  calcularTiempo,
  calcularTramos,
  derivarProgreso,
  escalaDelDia,
  estaCorriendo,
  formatearDuracion,
  jornadaObjetivoDelDia,
  marcasDeHora,
  recorteDelDia
} from '../src/main/tiempo'

const MIN = 60_000
const HORA = 60 * MIN

const en = (h: number, m = 0, s = 0): Date => new Date(2026, 10, 6, h, m, s)
const ev = (tipo: TipoEvento, h: number, m = 0): EventoJornada => ({ tipo, ocurridoEn: aIsoConZona(en(h, m)) })
const opciones: OpcionesTiempo = { jornadaObjetivoHoras: 8, descontarAusencias: true }

describe('calcularTiempo', () => {
  it('sin eventos: nada trabajado, falta toda la jornada y no hay salida estimada', () => {
    const r = calcularTiempo([], en(9), opciones)
    expect(r.estado).toBe('fuera_de_jornada')
    expect(r.trabajadoMs).toBe(0)
    expect(r.restanteMs).toBe(8 * HORA)
    expect(r.extraMs).toBe(0)
    expect(r.progreso).toBe(0)
    expect(r.salidaEstimada).toBeNull()
  })

  it('trabajando: cuenta desde el inicio hasta ahora y estima la salida', () => {
    const r = calcularTiempo([ev('inicio', 8)], en(10, 30), opciones)
    expect(r.estado).toBe('trabajando')
    expect(r.trabajadoMs).toBe(2.5 * HORA)
    expect(r.restanteMs).toBe(5.5 * HORA)
    expect(r.progreso).toBeCloseTo(2.5 / 8)
    expect(r.salidaEstimada).toEqual(en(16))
  })

  it('cuenta los segundos para que el reloj avance', () => {
    const r = calcularTiempo([ev('inicio', 8)], en(8, 0, 37), opciones)
    expect(r.trabajadoMs).toBe(37_000)
  })

  it('descuenta el almuerzo ya terminado', () => {
    const eventos = [ev('inicio', 8), ev('almuerzo', 12), ev('regreso_almuerzo', 13)]
    const r = calcularTiempo(eventos, en(15), opciones)
    expect(r.estado).toBe('trabajando')
    expect(r.trabajadoMs).toBe(6 * HORA) // 4 h de mañana + 2 h de tarde
  })

  it('se pausa durante el almuerzo en curso', () => {
    const eventos = [ev('inicio', 8), ev('almuerzo', 12)]
    const alMediodia = calcularTiempo(eventos, en(12, 10), opciones)
    const alasUna = calcularTiempo(eventos, en(13), opciones)
    expect(alMediodia.estado).toBe('en_almuerzo')
    expect(alMediodia.trabajadoMs).toBe(4 * HORA)
    expect(alasUna.trabajadoMs).toBe(4 * HORA)
  })

  it('descuenta las ausencias cuando la opción está activa', () => {
    const eventos = [ev('inicio', 8), ev('ausencia', 10), ev('regreso', 10, 30)]
    const r = calcularTiempo(eventos, en(12), opciones)
    expect(r.trabajadoMs).toBe(3.5 * HORA)
  })

  it('cuenta las ausencias como trabajadas cuando descontarAusencias es false', () => {
    const eventos = [ev('inicio', 8), ev('ausencia', 10), ev('regreso', 10, 30)]
    const r = calcularTiempo(eventos, en(12), { ...opciones, descontarAusencias: false })
    expect(r.trabajadoMs).toBe(4 * HORA)
  })

  it('se pausa durante una ausencia en curso', () => {
    const eventos = [ev('inicio', 8), ev('ausencia', 10)]
    const r = calcularTiempo(eventos, en(11), opciones)
    expect(r.estado).toBe('ausente')
    expect(r.trabajadoMs).toBe(2 * HORA)
  })

  it('combina almuerzo y varias ausencias en una jornada completa', () => {
    const eventos = [
      ev('inicio', 8, 2),
      ev('ausencia', 9, 30),
      ev('regreso', 9, 45), // -15 min
      ev('almuerzo', 12, 30),
      ev('regreso_almuerzo', 13, 30), // -60 min
      ev('ausencia', 15, 10),
      ev('regreso', 15, 45), // -35 min
      ev('fin', 17, 5)
    ]
    const r = calcularTiempo(eventos, en(20), opciones)
    // 8:02 -> 17:05 = 9 h 3 min brutos, menos 110 min = 7 h 13 min
    expect(r.estado).toBe('fuera_de_jornada')
    expect(r.trabajadoMs).toBe(7 * HORA + 13 * MIN)
    expect(r.restanteMs).toBe(47 * MIN)
    expect(r.salidaEstimada).toBeNull()
  })

  it('tras finalizar la jornada el tiempo ya no sigue corriendo', () => {
    const eventos = [ev('inicio', 8), ev('fin', 12)]
    expect(calcularTiempo(eventos, en(12, 1), opciones).trabajadoMs).toBe(4 * HORA)
    expect(calcularTiempo(eventos, en(23), opciones).trabajadoMs).toBe(4 * HORA)
  })

  it('al superar el objetivo el restante es 0 y aparecen las horas extra', () => {
    const r = calcularTiempo([ev('inicio', 8)], en(17, 30), opciones)
    expect(r.trabajadoMs).toBe(9.5 * HORA)
    expect(r.restanteMs).toBe(0)
    expect(r.extraMs).toBe(1.5 * HORA)
    expect(r.progreso).toBe(1)
    expect(r.salidaEstimada).toEqual(en(17, 30))
  })

  it('respeta una jornada objetivo distinta de 8 horas', () => {
    const r = calcularTiempo([ev('inicio', 8)], en(10), { ...opciones, jornadaObjetivoHoras: 6 })
    expect(r.objetivoMs).toBe(6 * HORA)
    expect(r.restanteMs).toBe(4 * HORA)
    expect(r.salidaEstimada).toEqual(en(14))
  })

  it('no depende del orden en que llegan los eventos', () => {
    const eventos = [ev('almuerzo', 12), ev('inicio', 8), ev('regreso_almuerzo', 13)]
    expect(calcularTiempo(eventos, en(15), opciones).trabajadoMs).toBe(6 * HORA)
  })

  it('un reloj atrasado (ahora anterior al último evento) no produce tiempo negativo', () => {
    const r = calcularTiempo([ev('inicio', 10)], en(9), opciones)
    expect(r.trabajadoMs).toBe(0)
  })

  it('lanza un error claro si un evento tiene una fecha inválida', () => {
    expect(() => calcularTiempo([{ tipo: 'inicio', ocurridoEn: 'ayer' }], en(9), opciones)).toThrow(RangeError)
  })
})

describe('formatearDuracion', () => {
  it('escribe HH:MM:SS', () => {
    expect(formatearDuracion(0)).toBe('00:00:00')
    expect(formatearDuracion(37_000)).toBe('00:00:37')
    expect(formatearDuracion(2.5 * HORA)).toBe('02:30:00')
    expect(formatearDuracion(7 * HORA + 13 * MIN + 5_999)).toBe('07:13:05')
  })

  it('no baja de cero y admite más de 99 horas', () => {
    expect(formatearDuracion(-5000)).toBe('00:00:00')
    expect(formatearDuracion(100 * HORA)).toBe('100:00:00')
  })
})

describe('derivarProgreso y estaCorriendo', () => {
  it('deriva restante, extra, progreso y salida a partir del tiempo trabajado', () => {
    const ahora = en(10).getTime()
    const p = derivarProgreso(2 * HORA, 8, 'trabajando', ahora)
    expect(p.restanteMs).toBe(6 * HORA)
    expect(p.extraMs).toBe(0)
    expect(p.progreso).toBe(0.25)
    expect(p.salidaEstimada).toEqual(en(16))
    expect(derivarProgreso(9 * HORA, 8, 'trabajando', ahora)).toMatchObject({ restanteMs: 0, extraMs: HORA, progreso: 1 })
    expect(derivarProgreso(2 * HORA, 8, 'fuera_de_jornada', ahora).salidaEstimada).toBeNull()
  })

  it('el tiempo corre solo trabajando (y ausente si no se descuentan las ausencias)', () => {
    expect(estaCorriendo('trabajando', { descontarAusencias: true })).toBe(true)
    expect(estaCorriendo('en_almuerzo', { descontarAusencias: false })).toBe(false)
    expect(estaCorriendo('fuera_de_jornada', { descontarAusencias: false })).toBe(false)
    expect(estaCorriendo('ausente', { descontarAusencias: true })).toBe(false)
    expect(estaCorriendo('ausente', { descontarAusencias: false })).toBe(true)
  })
})

describe('calcularTramos', () => {
  it('genera un tramo por estado activo y deja abierto el último', () => {
    const tramos = calcularTramos([ev('inicio', 8), ev('almuerzo', 12), ev('regreso_almuerzo', 13)])
    expect(tramos).toEqual([
      { estado: 'trabajando', desdeMs: en(8).getTime(), hastaMs: en(12).getTime() },
      { estado: 'en_almuerzo', desdeMs: en(12).getTime(), hastaMs: en(13).getTime() },
      { estado: 'trabajando', desdeMs: en(13).getTime(), hastaMs: null }
    ])
  })

  it('el fin de jornada cierra el último tramo y no crea otro', () => {
    const tramos = calcularTramos([ev('inicio', 8), ev('ausencia', 10), ev('regreso', 10, 30), ev('fin', 17)])
    expect(tramos.map((t) => t.estado)).toEqual(['trabajando', 'ausente', 'trabajando'])
    expect(tramos[2]?.hastaMs).toBe(en(17).getTime())
  })

  it('sin eventos no hay tramos y no depende del orden de entrada', () => {
    expect(calcularTramos([])).toEqual([])
    expect(calcularTramos([ev('almuerzo', 12), ev('inicio', 8)]).map((t) => t.estado)).toEqual(['trabajando', 'en_almuerzo'])
  })
})

describe('escalaDelDia y marcasDeHora', () => {
  const horario = { entradaMs: en(8).getTime(), salidaMs: en(17).getTime() }

  it('sin tramos muestra el horario planeado', () => {
    const escala = escalaDelDia([], horario, en(7, 30).getTime(), null)
    expect(escala).toEqual({ inicioMs: en(8).getTime(), finMs: en(17).getTime() })
  })

  it('se amplía si se empezó antes, si se pasa de la hora de salida o si la salida estimada cae después', () => {
    const temprano = calcularTramos([ev('inicio', 7, 20)])
    expect(escalaDelDia(temprano, horario, en(9).getTime(), null).inicioMs).toBe(en(7).getTime())
    expect(escalaDelDia([], horario, en(18, 10).getTime(), null).finMs).toBe(en(19).getTime())
    expect(escalaDelDia([], horario, en(10).getTime(), en(17, 40).getTime()).finMs).toBe(en(18).getTime())
  })

  it('la cinta dura al menos 4 horas', () => {
    const corto = { entradaMs: en(8).getTime(), salidaMs: en(9).getTime() }
    expect(escalaDelDia([], corto, en(8, 5).getTime(), null)).toEqual({ inicioMs: en(8).getTime(), finMs: en(12).getTime() })
  })

  it('reparte las marcas de hora con un paso que no pase del máximo', () => {
    const escala = { inicioMs: en(8).getTime(), finMs: en(17).getTime() }
    expect(marcasDeHora(escala).map((m) => new Date(m).getHours())).toEqual([8, 10, 12, 14, 16])
    expect(marcasDeHora({ inicioMs: en(8).getTime(), finMs: en(12).getTime() }).map((m) => new Date(m).getHours())).toEqual([
      8, 9, 10, 11, 12
    ])
  })
})

describe('jornadaObjetivoDelDia y recorteDelDia', () => {
  const horario = { jornadaObjetivoHoras: 10, recorteLunesHoras: 1 }
  const dia = (n: number): Date => new Date(2026, 10, n, 9, 0) // 9 nov 2026 es lunes

  it('los lunes se recorta la jornada y el resto de los días no', () => {
    expect(new Date(2026, 10, 9).getDay()).toBe(1)
    expect(jornadaObjetivoDelDia(horario, dia(9))).toBe(9)
    for (const n of [10, 11, 12, 13, 14, 15]) expect(jornadaObjetivoDelDia(horario, dia(n))).toBe(10)
    expect(recorteDelDia(dia(9), 1)).toBe(1)
    expect(recorteDelDia(dia(10), 1)).toBe(0)
  })

  it('admite recortes fraccionarios y nunca baja de 0', () => {
    expect(jornadaObjetivoDelDia({ ...horario, recorteLunesHoras: 0.5 }, dia(9))).toBe(9.5)
    expect(jornadaObjetivoDelDia({ jornadaObjetivoHoras: 1, recorteLunesHoras: 3 }, dia(9))).toBe(0)
  })
})
