import { describe, expect, it } from 'vitest'
import { configPorDefecto } from '../src/main/configEsquema'
import type { TipoEvento } from '../src/main/estado'
import { aIsoConZona } from '../src/main/fechas'
import type { Evento } from '../src/main/historial'
import { rangoDeSemana, vistaDeSemana } from '../src/main/vistaHistorial'

const HORA = 3_600_000

// Noviembre de 2026: el 9 es lunes, el 12 es jueves y el 15 es domingo.
const en = (dia: number, h = 0, m = 0): Date => new Date(2026, 10, dia, h, m)

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

const jornadaCompleta = (dia: number): Evento[] => [
  evento('inicio', en(dia, 8)),
  evento('almuerzo', en(dia, 12)),
  evento('regreso_almuerzo', en(dia, 13)),
  evento('fin', en(dia, 19))
]

describe('vistaDeSemana', () => {
  const config = configPorDefecto()
  const ahora = en(12, 20)

  it('siempre devuelve los siete días, de lunes a domingo, aunque no haya registros', () => {
    const semana = vistaDeSemana([], en(12, 10), ahora, config)
    expect(semana.dias.map((d) => d.fecha)).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'
    ])
    expect(semana.desde).toBe('2026-11-09')
    expect(semana.hasta).toBe('2026-11-15')
    expect(semana.hoy).toBe('2026-11-12')
    expect(semana.dias.every((d) => !d.hayRegistros && d.eventos.length === 0)).toBe(true)
    expect(semana.totales).toEqual({ trabajadoMs: 0, objetivoMs: 0, almuerzoMs: 0, ausenteMs: 0 })
  })

  it('un domingo pertenece a la semana que empezó el lunes anterior', () => {
    expect(vistaDeSemana([], en(15, 22), ahora, config).desde).toBe('2026-11-09')
    expect(vistaDeSemana([], en(16, 1), ahora, config).desde).toBe('2026-11-16')
  })

  it('los días vacíos muestran su meta: 9 h el lunes y 10 h el resto', () => {
    const semana = vistaDeSemana([], en(12), ahora, config)
    expect(semana.dias[0]?.objetivoMs).toBe(9 * HORA)
    expect(semana.dias[1]?.objetivoMs).toBe(10 * HORA)
  })

  it('reparte los eventos por día, en orden, con su etiqueta y estado de envío', () => {
    const eventos = [...jornadaCompleta(10), evento('inicio', en(12, 8, 5), { estadoEnvio: 'pendiente', intentos: 2 })]
    const semana = vistaDeSemana([...eventos].reverse(), en(12), ahora, config)
    const martes = semana.dias[1]
    expect(martes?.hayRegistros).toBe(true)
    expect(martes?.eventos.map((e) => e.tipo)).toEqual(['inicio', 'almuerzo', 'regreso_almuerzo', 'fin'])
    expect(martes?.eventos.map((e) => e.etiqueta)).toEqual([
      'Iniciar jornada', 'Salir a almorzar', 'Regresar de almuerzo', 'Finalizar jornada'
    ])
    expect(martes?.eventos[0]?.ocurridoMs).toBe(en(10, 8).getTime())
    const jueves = semana.dias[3]
    expect(jueves?.eventos[0]).toMatchObject({ estadoEnvio: 'pendiente', intentos: 2 })
    expect(semana.dias[2]?.hayRegistros).toBe(false)
  })

  it('calcula entrada, salida, almuerzo y trabajado de un día cerrado', () => {
    const semana = vistaDeSemana(jornadaCompleta(10), en(10), ahora, config)
    expect(semana.dias[1]).toMatchObject({
      entradaMs: en(10, 8).getTime(),
      salidaMs: en(10, 19).getTime(),
      almuerzoMs: HORA,
      trabajadoMs: 10 * HORA,
      objetivoMs: 10 * HORA,
      observacion: ''
    })
  })

  it('los totales solo suman los días con registros', () => {
    const semana = vistaDeSemana([...jornadaCompleta(9), ...jornadaCompleta(10)], en(12), ahora, config)
    // El lunes 8:00–19:00 con 1 h de almuerzo son 10 h trabajadas contra una meta de 9 h.
    expect(semana.totales).toMatchObject({ trabajadoMs: 20 * HORA, objetivoMs: 19 * HORA, almuerzoMs: 2 * HORA })
  })

  it('señala lo que está en curso y lo que quedó sin cerrar', () => {
    const semana = vistaDeSemana(
      [evento('inicio', en(10, 8)), evento('inicio', en(12, 8))],
      en(12),
      en(12, 10),
      config
    )
    expect(semana.dias[1]?.observacion).toBe('Jornada sin cerrar')
    expect(semana.dias[3]?.observacion).toContain('En curso')
  })

  it('cuenta los mensajes sin publicar', () => {
    const eventos = jornadaCompleta(10).map((e, i) => (i < 2 ? { ...e, estadoEnvio: 'fallido' as const } : e))
    expect(vistaDeSemana(eventos, en(10), ahora, config).dias[1]?.observacion).toBe('2 mensajes sin publicar')
  })

  it('conserva el motivo de una ausencia', () => {
    const eventos = [evento('inicio', en(12, 8)), evento('ausencia', en(12, 9), { motivo: 'Cita médica' })]
    const ausencia = vistaDeSemana(eventos, en(12), ahora, config).dias[3]?.eventos[1]
    expect(ausencia).toMatchObject({ tipo: 'ausencia', motivo: 'Cita médica' })
  })

  it('un evento de la madrugada del domingo no se cuela en el lunes siguiente', () => {
    const semana = vistaDeSemana([evento('inicio', en(15, 23, 59))], en(15), ahora, config)
    expect(semana.dias[6]?.eventos).toHaveLength(1)
    expect(semana.dias.slice(0, 6).every((d) => d.eventos.length === 0)).toBe(true)
  })
})

describe('rangoDeSemana', () => {
  it('va de lunes a lunes siguiente a medianoche', () => {
    expect(rangoDeSemana(en(12, 15))).toEqual({ desde: new Date(2026, 10, 9), hasta: new Date(2026, 10, 16) })
  })
})
