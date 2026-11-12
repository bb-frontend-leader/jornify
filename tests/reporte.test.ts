import { describe, expect, it } from 'vitest'
import { configPorDefecto } from '../src/main/configEsquema'
import type { TipoEvento } from '../src/main/estado'
import { aIsoConZona } from '../src/main/fechas'
import type { Evento } from '../src/main/historial'
import {
  DIAS_MAXIMOS_REPORTE,
  construirReporte,
  nombreArchivoReporte,
  rangoDeReporte
} from '../src/main/reporte'

const HORA = 3_600_000
const MIN = 60_000

// Noviembre de 2026: el 9 es lunes, el 12 es jueves y el 15 es domingo.
const en = (dia: number, h: number, m = 0): Date => new Date(2026, 10, dia, h, m)

let contador = 0
function evento(tipo: TipoEvento, cuando: Date, extra: Partial<Evento> = {}): Evento {
  contador++
  return {
    id: contador,
    tipo,
    ocurridoEn: aIsoConZona(cuando),
    motivo: null,
    mensaje: `mensaje ${tipo}`,
    estadoEnvio: 'enviado',
    enviadoEn: aIsoConZona(cuando),
    intentos: 0,
    ...extra
  }
}

const dia = (n: number): Date => new Date(2026, 10, n)

describe('rangoDeReporte', () => {
  const ahora = en(12, 15, 30) // jueves

  it('hoy es el día completo', () => {
    expect(rangoDeReporte('hoy', ahora)).toEqual({ ok: true, rango: { desde: dia(12), hasta: dia(13) } })
  })

  it('la semana va de lunes a domingo', () => {
    expect(rangoDeReporte('semana', ahora)).toEqual({ ok: true, rango: { desde: dia(9), hasta: dia(16) } })
    // Un domingo pertenece a la semana que empezó el lunes anterior.
    expect(rangoDeReporte('semana', en(15, 20))).toEqual({ ok: true, rango: { desde: dia(9), hasta: dia(16) } })
    // Un lunes es el primer día de su semana.
    expect(rangoDeReporte('semana', en(9, 0))).toEqual({ ok: true, rango: { desde: dia(9), hasta: dia(16) } })
  })

  it('la semana cruza el cambio de mes', () => {
    const resultado = rangoDeReporte('semana', new Date(2026, 11, 2)) // miércoles 2 de diciembre
    expect(resultado).toEqual({ ok: true, rango: { desde: new Date(2026, 10, 30), hasta: new Date(2026, 11, 7) } })
  })

  it('el mes va del 1 al 1 del mes siguiente, también en diciembre', () => {
    expect(rangoDeReporte('mes', ahora)).toEqual({ ok: true, rango: { desde: dia(1), hasta: new Date(2026, 11, 1) } })
    expect(rangoDeReporte('mes', new Date(2026, 11, 20))).toEqual({
      ok: true,
      rango: { desde: new Date(2026, 11, 1), hasta: new Date(2027, 0, 1) }
    })
  })

  it('las fechas elegidas incluyen el día final', () => {
    expect(rangoDeReporte('personalizado', ahora, { desde: '2026-11-03', hasta: '2026-11-05' })).toEqual({
      ok: true,
      rango: { desde: dia(3), hasta: dia(6) }
    })
    expect(rangoDeReporte('personalizado', ahora, { desde: '2026-11-03', hasta: '2026-11-03' })).toMatchObject({ ok: true })
  })

  it.each([
    [undefined, 'Elige las dos fechas'],
    [{ desde: '', hasta: '2026-11-05' }, 'Elige las dos fechas'],
    [{ desde: '2026-02-31', hasta: '2026-03-02' }, 'Elige las dos fechas'],
    [{ desde: '2026-11-05', hasta: '2026-11-03' }, 'anterior'],
    [{ desde: '2025-01-01', hasta: '2026-11-03' }, `${DIAS_MAXIMOS_REPORTE} días`]
  ])('rechaza las fechas %j', (fechas, mensaje) => {
    const resultado = rangoDeReporte('personalizado', ahora, fechas)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain(mensaje)
  })
})

describe('nombreArchivoReporte', () => {
  const ahora = en(12, 10)
  const rango = (tipo: Parameters<typeof rangoDeReporte>[0]) => {
    const r = rangoDeReporte(tipo, ahora)
    if (!r.ok) throw new Error('rango')
    return r.rango
  }

  it('lleva las fechas del rango', () => {
    expect(nombreArchivoReporte('hoy', rango('hoy'))).toBe('Jornify 2026-11-12.xlsx')
    expect(nombreArchivoReporte('semana', rango('semana'))).toBe('Jornify 2026-11-09 a 2026-11-15.xlsx')
    expect(nombreArchivoReporte('mes', rango('mes'))).toBe('Jornify 2026-11.xlsx')
    expect(nombreArchivoReporte('personalizado', { desde: dia(3), hasta: dia(6) })).toBe('Jornify 2026-11-03 a 2026-11-05.xlsx')
  })
})

describe('construirReporte', () => {
  const config = configPorDefecto() // 10 h netas; los lunes 9 h
  const ahora = en(12, 9, 0) // jueves 9:00
  const rango = { desde: dia(9), hasta: dia(13) }

  const eventos: Evento[] = [
    // Lunes 9: 8:00–12:00, almuerzo 1 h, 13:00–15:00, ausente 30 min, 15:30–17:30, fin.
    evento('inicio', en(9, 8)),
    evento('almuerzo', en(9, 12)),
    evento('regreso_almuerzo', en(9, 13)),
    evento('ausencia', en(9, 15), { motivo: 'Cita' }),
    evento('regreso', en(9, 15, 30)),
    evento('fin', en(9, 17, 30)),
    // Martes 10: 9,5 h netas.
    evento('inicio', en(10, 8)),
    evento('almuerzo', en(10, 12)),
    evento('regreso_almuerzo', en(10, 13)),
    evento('fin', en(10, 18, 30)),
    // Miércoles 11: se inició y nunca se cerró.
    evento('inicio', en(11, 8), { estadoEnvio: 'pendiente', enviadoEn: null, intentos: 2 }),
    // Hoy (jueves 12): en curso.
    evento('inicio', en(12, 8))
  ]

  const reporte = construirReporte([...eventos].reverse(), rango, ahora, config)

  it('arma una fila por día con eventos, en orden cronológico', () => {
    expect(reporte.dias.map((d) => d.fecha.getDate())).toEqual([9, 10, 11, 12])
    expect(reporte.eventos.map((e) => e.id)).toEqual(eventos.map((e) => e.id))
  })

  it('el lunes: tiempos, entrada y salida, con la meta recortada', () => {
    const lunes = reporte.dias[0]!
    expect(lunes.entrada).toEqual(en(9, 8))
    expect(lunes.salida).toEqual(en(9, 17, 30))
    expect(lunes.almuerzoMs).toBe(HORA)
    expect(lunes.ausenteMs).toBe(30 * MIN)
    expect(lunes.trabajadoMs).toBe(8 * HORA)
    expect(lunes.objetivoMs).toBe(9 * HORA)
    expect(lunes.observacion).toBe('')
  })

  it('el martes: meta completa de 10 h', () => {
    const martes = reporte.dias[1]!
    expect(martes.trabajadoMs).toBe(9.5 * HORA)
    expect(martes.objetivoMs).toBe(10 * HORA)
    expect(martes.almuerzoMs).toBe(HORA)
    expect(martes.ausenteMs).toBe(0)
  })

  it('un día pasado sin cerrar cuenta solo hasta su último evento y se señala', () => {
    const miercoles = reporte.dias[2]!
    expect(miercoles.salida).toBeNull()
    expect(miercoles.trabajadoMs).toBe(0)
    expect(miercoles.observacion).toBe('Jornada sin cerrar; 1 mensaje sin publicar')
  })

  it('hoy cuenta hasta ahora y se marca como en curso', () => {
    const hoy = reporte.dias[3]!
    expect(hoy.trabajadoMs).toBe(HORA)
    expect(hoy.observacion).toBe('En curso (trabajando)')
  })

  it('suma los totales de todos los días', () => {
    expect(reporte.totales).toEqual({
      trabajadoMs: 8 * HORA + 9.5 * HORA + 0 + HORA,
      objetivoMs: 9 * HORA + 10 * HORA + 10 * HORA + 10 * HORA,
      almuerzoMs: 2 * HORA,
      ausenteMs: 30 * MIN
    })
  })

  it('anota los ajustes con que se calculó la meta', () => {
    expect(reporte).toMatchObject({ jornadaObjetivoHoras: 10, recorteLunesHoras: 1 })
  })

  it('un rango sin eventos da un reporte vacío', () => {
    const vacio = construirReporte([], rango, ahora, config)
    expect(vacio.dias).toEqual([])
    expect(vacio.totales.trabajadoMs).toBe(0)
  })

  it('si no se descuentan las ausencias, el tiempo ausente cuenta como trabajado', () => {
    const sin = { ...config, horario: { ...config.horario, descontarAusencias: false } }
    const r = construirReporte(eventos.slice(0, 6), rango, ahora, sin)
    expect(r.dias[0]!.trabajadoMs).toBe(8.5 * HORA)
    expect(r.dias[0]!.ausenteMs).toBe(30 * MIN)
  })
})
