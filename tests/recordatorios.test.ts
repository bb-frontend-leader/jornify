import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, configPorDefecto } from '../src/main/configEsquema'
import type { TipoEvento } from '../src/main/estado'
import { aIsoConZona } from '../src/main/fechas'
import { Historial } from '../src/main/historial'
import {
  type Aviso,
  GRACIA_ALMUERZO_MS,
  Recordatorios,
  calcularRecordatorios,
  redactarAviso,
  salidaPlaneadaDelDia
} from '../src/main/recordatorios'

const MIN = 60_000

// Noviembre de 2026: el 9 es lunes y el 12 es jueves.
const en = (dia: number, h: number, m = 0, s = 0): Date => new Date(2026, 10, dia, h, m, s)

let contador = 0
const evento = (tipo: TipoEvento, cuando: Date) => ({
  id: ++contador,
  tipo,
  ocurridoEn: aIsoConZona(cuando),
  motivo: null,
  mensaje: '',
  estadoEnvio: 'enviado' as const,
  enviadoEn: null,
  intentos: 0
})

const sinRecordatorios = (cambios: Partial<Config['app']>): Config => {
  const base = configPorDefecto()
  return { ...base, app: { ...base.app, ...cambios } }
}

describe('salidaPlaneadaDelDia', () => {
  const config = configPorDefecto()
  it('es la hora de salida configurada, y el lunes una hora antes', () => {
    expect(salidaPlaneadaDelDia(en(12, 10), config)).toEqual(en(12, 19))
    expect(salidaPlaneadaDelDia(en(9, 10), config)).toEqual(en(9, 18))
  })
})

describe('calcularRecordatorios', () => {
  const config = configPorDefecto()

  it('fuera de jornada no hay nada que recordar', () => {
    expect(calcularRecordatorios([], en(12, 9), config)).toEqual([])
    const cerrada = [evento('inicio', en(12, 8)), evento('fin', en(12, 17))]
    expect(calcularRecordatorios(cerrada, en(12, 20), config)).toEqual([])
  })

  it('con la jornada abierta, avisa de la salida a la hora planeada', () => {
    const pendientes = calcularRecordatorios([evento('inicio', en(12, 8))], en(12, 9), config)
    expect(pendientes).toEqual([
      { clave: 'salida-2026-11-12', tipo: 'salida', cuandoMs: en(12, 19).getTime(), referenciaMs: en(12, 19).getTime() }
    ])
  })

  it('el lunes la salida es una hora antes', () => {
    const [salida] = calcularRecordatorios([evento('inicio', en(9, 8))], en(9, 9), config)
    expect(salida?.cuandoMs).toBe(en(9, 18).getTime())
  })

  it('quien empieza después de la hora de salida (recuperando tiempo) no recibe aviso de salida', () => {
    expect(calcularRecordatorios([evento('inicio', en(12, 19, 30))], en(12, 20), config)).toEqual([])
  })

  it('en ausencia o almuerzo la jornada sigue abierta y el aviso de salida también vale', () => {
    const eventos = [evento('inicio', en(12, 8)), evento('ausencia', en(12, 18, 30))]
    expect(calcularRecordatorios(eventos, en(12, 18, 40), config).map((p) => p.tipo)).toEqual(['salida'])
  })

  it('durante el almuerzo avisa cuando pasa la duración más el margen', () => {
    const eventos = [evento('inicio', en(12, 8)), evento('almuerzo', en(12, 12))]
    const pendientes = calcularRecordatorios(eventos, en(12, 12, 10), config)
    const almuerzo = pendientes.find((p) => p.tipo === 'almuerzo')
    expect(almuerzo?.cuandoMs).toBe(en(12, 12).getTime() + 60 * MIN + GRACIA_ALMUERZO_MS)
    expect(almuerzo?.clave).toBe(`almuerzo-${eventos[1]?.id}`)
  })

  it('usa la duración de almuerzo configurada', () => {
    const base = configPorDefecto()
    const corto = { ...base, horario: { ...base.horario, duracionAlmuerzoMin: 30 } }
    const eventos = [evento('inicio', en(12, 8)), evento('almuerzo', en(12, 12))]
    const almuerzo = calcularRecordatorios(eventos, en(12, 12, 1), corto).find((p) => p.tipo === 'almuerzo')
    expect(almuerzo?.cuandoMs).toBe(en(12, 12, 31).getTime())
  })

  it('tras regresar del almuerzo ya no hay aviso de almuerzo', () => {
    const eventos = [evento('inicio', en(12, 8)), evento('almuerzo', en(12, 12)), evento('regreso_almuerzo', en(12, 13))]
    expect(calcularRecordatorios(eventos, en(12, 13, 5), config).map((p) => p.tipo)).toEqual(['salida'])
  })

  it('respeta las opciones para desactivar cada aviso', () => {
    const eventos = [evento('inicio', en(12, 8)), evento('almuerzo', en(12, 12))]
    expect(calcularRecordatorios(eventos, en(12, 12, 1), sinRecordatorios({ recordarSalida: false })).map((p) => p.tipo)).toEqual(['almuerzo'])
    expect(calcularRecordatorios(eventos, en(12, 12, 1), sinRecordatorios({ recordarAlmuerzo: false })).map((p) => p.tipo)).toEqual(['salida'])
    expect(calcularRecordatorios(eventos, en(12, 12, 1), sinRecordatorios({ recordarSalida: false, recordarAlmuerzo: false }))).toEqual([])
  })
})

describe('redactarAviso', () => {
  const config = configPorDefecto()

  it('el de salida dice a qué hora era', () => {
    const aviso = redactarAviso({ clave: 'k', tipo: 'salida', cuandoMs: 0, referenciaMs: en(12, 19).getTime() }, en(12, 19, 1), config)
    expect(aviso.titulo).toBe('Ya pasó tu hora de salida')
    expect(aviso.cuerpo).toContain('7:00 p. m.')
  })

  it('el de almuerzo dice cuánto lleva y cuánto estaba previsto', () => {
    const aviso = redactarAviso({ clave: 'k', tipo: 'almuerzo', cuandoMs: 0, referenciaMs: en(12, 12).getTime() }, en(12, 13, 5), config)
    expect(aviso.titulo).toBe('Tu almuerzo ya se pasó')
    expect(aviso.cuerpo).toContain('Llevas 1 hora y 5 minutos de almuerzo')
    expect(aviso.cuerpo).toContain('previstos 1 hora')
  })
})

describe('Recordatorios', () => {
  let historial: Historial
  let reloj: Date
  let avisos: Aviso[]
  let config: Config
  let recordatorios: Recordatorios

  const registrar = (tipo: TipoEvento, cuando: Date): void => {
    historial.registrarEvento({ tipo, ocurridoEn: cuando, mensaje: tipo })
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: en(12, 8) })
    historial = Historial.abrir(':memory:')
    reloj = en(12, 8)
    avisos = []
    config = configPorDefecto()
    recordatorios = new Recordatorios({
      historial,
      obtenerConfig: () => config,
      avisar: (aviso) => avisos.push(aviso),
      ahora: () => new Date(Date.now())
    })
  })

  afterEach(() => {
    recordatorios.detener()
    vi.useRealTimers()
  })

  const irA = async (fecha: Date): Promise<void> => {
    await vi.advanceTimersByTimeAsync(fecha.getTime() - Date.now())
  }

  it('sin jornada abierta no programa ningún temporizador', () => {
    recordatorios.iniciar()
    expect(vi.getTimerCount()).toBe(0)
    expect(avisos).toEqual([])
  })

  it('avisa una sola vez, a la hora de salida', async () => {
    registrar('inicio', en(12, 8))
    recordatorios.iniciar()
    await irA(en(12, 18, 59))
    expect(avisos).toEqual([])
    await irA(en(12, 19, 1))
    expect(avisos.map((a) => a.tipo)).toEqual(['salida'])
    // No se repite aunque sigan cambiando las cosas ni pase el tiempo.
    recordatorios.revisar()
    await irA(en(12, 23))
    expect(avisos).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('si se finaliza antes de la hora de salida no avisa', async () => {
    registrar('inicio', en(12, 8))
    recordatorios.iniciar()
    await irA(en(12, 17))
    registrar('fin', en(12, 17))
    recordatorios.revisar()
    await irA(en(12, 20))
    expect(avisos).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('avisa del almuerzo pasado y no si se regresó a tiempo', async () => {
    registrar('inicio', en(12, 8))
    registrar('almuerzo', en(12, 12))
    vi.setSystemTime(en(12, 12))
    recordatorios.iniciar()
    await irA(en(12, 13, 0, 30))
    expect(avisos).toEqual([])
    await irA(en(12, 13, 1, 1))
    expect(avisos.map((a) => a.tipo)).toEqual(['almuerzo'])
    expect(avisos[0]?.cuerpo).toContain('1 hora y 1 minuto')
  })

  it('el regreso a mano antes de tiempo cancela el aviso del almuerzo', async () => {
    registrar('inicio', en(12, 8))
    registrar('almuerzo', en(12, 12))
    vi.setSystemTime(en(12, 12))
    recordatorios.iniciar()
    await irA(en(12, 12, 50))
    registrar('regreso_almuerzo', en(12, 12, 50))
    recordatorios.revisar()
    await irA(en(12, 14))
    expect(avisos).toEqual([])
  })

  it('un segundo almuerzo del mismo día vuelve a avisar', async () => {
    registrar('inicio', en(12, 8))
    registrar('almuerzo', en(12, 12))
    vi.setSystemTime(en(12, 12))
    recordatorios.iniciar()
    await irA(en(12, 13, 2))
    registrar('regreso_almuerzo', en(12, 13, 2))
    registrar('almuerzo', en(12, 15))
    recordatorios.revisar()
    await irA(en(12, 16, 2))
    expect(avisos.map((a) => a.tipo)).toEqual(['almuerzo', 'almuerzo'])
  })

  it('al arrancar con la hora de salida ya pasada y la jornada abierta avisa enseguida', () => {
    registrar('inicio', en(12, 8))
    vi.setSystemTime(en(12, 19, 40))
    recordatorios.iniciar()
    expect(avisos.map((a) => a.tipo)).toEqual(['salida'])
  })

  it('al cambiar los ajustes se recalcula (desactivar el aviso lo cancela)', async () => {
    registrar('inicio', en(12, 8))
    recordatorios.iniciar()
    expect(vi.getTimerCount()).toBe(1)
    config = sinRecordatorios({ recordarSalida: false })
    recordatorios.revisar()
    expect(vi.getTimerCount()).toBe(0)
    await irA(en(12, 20))
    expect(avisos).toEqual([])
  })

  it('un aviso que falla no rompe el vigilante ni se reintenta', async () => {
    const errores: string[] = []
    const fallido = new Recordatorios({
      historial,
      obtenerConfig: () => config,
      avisar: () => {
        throw new Error('sin notificaciones')
      },
      ahora: () => new Date(Date.now()),
      registrarError: (mensaje) => errores.push(mensaje)
    })
    registrar('inicio', en(12, 8))
    fallido.iniciar()
    await irA(en(12, 19, 1))
    fallido.revisar()
    expect(errores).toHaveLength(1)
    fallido.detener()
  })

  it('detener apaga todo y revisar no hace nada', () => {
    registrar('inicio', en(12, 8))
    recordatorios.iniciar()
    recordatorios.detener()
    expect(vi.getTimerCount()).toBe(0)
    recordatorios.revisar()
    expect(vi.getTimerCount()).toBe(0)
  })
})
