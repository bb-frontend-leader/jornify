import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Controlador } from '../src/main/controlador'
import { type Config, configPorDefecto } from '../src/main/configEsquema'
import { TransicionInvalidaError } from '../src/main/estado'
import { Historial } from '../src/main/historial'
import type { ContextoPublicacion, Publicador } from '../src/main/publicadores/base'
import { Programador, TOLERANCIA_RETRASO_MS } from '../src/main/programador'

class PublicadorFalso implements Publicador {
  mensajes: string[] = []
  publicar(mensaje: string, _contexto: ContextoPublicacion): Promise<void> {
    this.mensajes.push(mensaje)
    return Promise.resolve()
  }
}

// Viernes 6 de noviembre de 2026.
const en = (h: number, m = 0, s = 0): Date => new Date(2026, 10, 6, h, m, s)

describe('Programador', () => {
  let historial: Historial
  let publicador: PublicadorFalso
  let reloj: Date
  let config: Config
  let controlador: Controlador
  let programador: Programador
  const errores: string[] = []

  const irA = (h: number, m = 0, s = 0): void => {
    reloj = en(h, m, s)
  }

  beforeEach(() => {
    historial = Historial.abrir(':memory:')
    publicador = new PublicadorFalso()
    config = configPorDefecto()
    errores.length = 0
    irA(8, 0)
    controlador = new Controlador({
      historial,
      publicador,
      obtenerConfig: () => config,
      ahora: () => reloj,
      registrarError: (mensaje) => errores.push(mensaje)
    })
    programador = new Programador({
      historial,
      controlador,
      obtenerConfig: () => config,
      ahora: () => reloj,
      registrarError: (mensaje) => errores.push(mensaje)
    })
  })

  const pendientes = (): { tipo: string; origen: string }[] =>
    historial.programadosPendientes().map((p) => ({ tipo: p.tipo, origen: p.origen }))

  describe('programar', () => {
    it('acepta una hora de hoy que aún no llega y la deja pendiente', () => {
      expect(programador.programar({ tipo: 'ausencia', hora: '13:30' })).toEqual({ ok: true })
      const [programado] = historial.programadosPendientes()
      expect(programado).toMatchObject({ tipo: 'ausencia', origen: 'manual', estado: 'pendiente', mensaje: null })
      expect(new Date(programado!.programadoPara).getTime()).toBe(en(13, 30).getTime())
    })

    it('rechaza una hora que ya pasó, la hora actual y las horas mal escritas', () => {
      irA(10, 0)
      expect(programador.programar({ tipo: 'ausencia', hora: '09:59' })).toEqual({ ok: false, error: 'Esa hora ya pasó' })
      expect(programador.programar({ tipo: 'ausencia', hora: '10:00' })).toEqual({ ok: false, error: 'Esa hora ya pasó' })
      expect(programador.programar({ tipo: 'ausencia', hora: '25:00' })).toMatchObject({ ok: false })
      expect(programador.programar({ tipo: 'ausencia', hora: '9:5' })).toMatchObject({ ok: false })
      expect(historial.programadosPendientes()).toHaveLength(0)
    })

    it('guarda el texto propio recortado y lo ignora si queda vacío', () => {
      programador.programar({ tipo: 'ausencia', hora: '13:30', mensaje: '  En reunión  ' })
      programador.programar({ tipo: 'regreso', hora: '14:00', mensaje: '   ' })
      const [primero, segundo] = historial.programadosPendientes()
      expect(primero?.mensaje).toBe('En reunión')
      expect(segundo?.mensaje).toBeNull()
    })

    it('avisa a los oyentes', () => {
      const oyente = vi.fn()
      programador.alCambiar(oyente)
      programador.programar({ tipo: 'ausencia', hora: '13:30' })
      expect(oyente).toHaveBeenCalledTimes(1)
    })
  })

  describe('cancelar', () => {
    it('cancela un pendiente y no deja cancelar dos veces', () => {
      programador.programar({ tipo: 'ausencia', hora: '13:30' })
      const id = historial.programadosPendientes()[0]!.id
      expect(programador.cancelar(id)).toEqual({ ok: true })
      expect(historial.obtenerProgramado(id)).toMatchObject({ estado: 'cancelado', nota: 'Cancelado por el usuario' })
      expect(programador.cancelar(id)).toMatchObject({ ok: false })
    })
  })

  describe('regreso automático del almuerzo', () => {
    beforeEach(async () => {
      await controlador.ejecutar('inicio') // 8:00
      irA(12, 0)
      await controlador.ejecutar('almuerzo')
    })

    it('al salir a almorzar programa el regreso una hora después', () => {
      const [regreso] = historial.programadosPendientes()
      expect(regreso).toMatchObject({ tipo: 'regreso_almuerzo', origen: 'automatico' })
      expect(new Date(regreso!.programadoPara).getTime()).toBe(en(13, 0).getTime())
    })

    it('a la hora registra el regreso y publica el mensaje de siempre', async () => {
      irA(12, 59, 59)
      await programador.procesarVencidos()
      expect(controlador.estado()).toBe('en_almuerzo')

      irA(13, 0, 1)
      await programador.procesarVencidos()
      expect(controlador.estado()).toBe('trabajando')
      expect(publicador.mensajes.at(-1)).toBe('🍽️ Buenas tardes, termino mi hora de almuerzo @Angela Ortiz Peña')
      const programado = historial.obtenerProgramado(1)
      expect(programado).toMatchObject({ estado: 'ejecutado', nota: null })
      expect(programado.eventoId).not.toBeNull()
      // Su propio aviso de "regreso registrado" no debe haberlo cancelado.
      expect(historial.programadosPendientes()).toHaveLength(0)
    })

    it('el almuerzo cuenta lo que dura: el tiempo no corre mientras tanto y vuelve a correr después', async () => {
      irA(13, 0)
      await programador.procesarVencidos()
      irA(14, 0)
      // 8:00–12:00 + 13:00–14:00 = 5 h
      expect(controlador.instantanea().trabajadoMs).toBe(5 * 3_600_000)
    })

    it('si se marca a mano antes, el automático se retira y no hace nada después', async () => {
      irA(12, 40)
      await controlador.ejecutar('regreso_almuerzo')
      expect(historial.obtenerProgramado(1)).toMatchObject({ estado: 'cancelado', nota: 'Se registró a mano antes' })

      const mensajes = publicador.mensajes.length
      irA(13, 5)
      await programador.procesarVencidos()
      expect(publicador.mensajes).toHaveLength(mensajes)
      expect(errores).toEqual([])
    })

    it('el almuerzo de una jornada nueva programa su propio regreso automático', async () => {
      irA(12, 30)
      await controlador.ejecutar('regreso_almuerzo')
      irA(14, 0)
      await controlador.ejecutar('fin')
      irA(14, 30)
      await controlador.ejecutar('inicio')
      irA(15, 0)
      await controlador.ejecutar('almuerzo')
      expect(pendientes()).toEqual([{ tipo: 'regreso_almuerzo', origen: 'automatico' }])
      expect(new Date(historial.programadosPendientes()[0]!.programadoPara).getTime()).toBe(en(16, 0).getTime())
    })

    it('un segundo almuerzo en la misma jornada no se acepta ni programa otro regreso', async () => {
      irA(12, 30)
      await controlador.ejecutar('regreso_almuerzo')
      irA(15, 0)
      await expect(controlador.ejecutar('almuerzo')).rejects.toBeInstanceOf(TransicionInvalidaError)
      expect(pendientes()).toEqual([])
    })

    it('un regreso programado a mano no se cancela al registrar el regreso', async () => {
      programador.programar({ tipo: 'regreso_almuerzo', hora: '12:50' })
      irA(12, 40)
      await controlador.ejecutar('regreso_almuerzo')
      expect(pendientes()).toEqual([{ tipo: 'regreso_almuerzo', origen: 'manual' }])
    })
  })

  it('no programa el regreso si está desactivado en la configuración', async () => {
    config = { ...config, horario: { ...config.horario, regresoAlmuerzoAutomatico: false } }
    await controlador.ejecutar('inicio')
    irA(12, 0)
    await controlador.ejecutar('almuerzo')
    expect(historial.programadosPendientes()).toHaveLength(0)
  })

  it('usa la duración de almuerzo configurada', async () => {
    config = { ...config, horario: { ...config.horario, duracionAlmuerzoMin: 45 } }
    await controlador.ejecutar('inicio')
    irA(12, 0)
    await controlador.ejecutar('almuerzo')
    expect(new Date(historial.programadosPendientes()[0]!.programadoPara).getTime()).toBe(en(12, 45).getTime())
  })

  it('no programa el regreso si el almuerzo cruzaría la medianoche', async () => {
    await controlador.ejecutar('inicio')
    irA(23, 30)
    await controlador.ejecutar('almuerzo')
    expect(historial.programadosPendientes()).toHaveLength(0)
  })

  describe('el escenario completo: almuerzo, regreso automático y ausencia programada', () => {
    it('después de regresar del almuerzo se ausenta a la hora programada, con el texto propio', async () => {
      await controlador.ejecutar('inicio') // 8:00
      irA(12, 0)
      await controlador.ejecutar('almuerzo')
      // El desarrollador programa su ausencia mientras está almorzando.
      programador.programar({ tipo: 'ausencia', hora: '13:30', mensaje: '{sol} {saludo}, me ausento por la reunión {mencion}' })

      irA(13, 0)
      await programador.procesarVencidos()
      expect(controlador.estado()).toBe('trabajando')

      irA(13, 30)
      await programador.procesarVencidos()
      expect(controlador.estado()).toBe('ausente')
      expect(publicador.mensajes.at(-1)).toBe('🌇 Buenas tardes, me ausento por la reunión @Angela Ortiz Peña')
      expect(historial.programadosEntre(en(0), en(23, 59)).map((p) => p.estado)).toEqual(['ejecutado', 'ejecutado'])
    })

    it('sin texto propio usa la plantilla de ausencia', async () => {
      await controlador.ejecutar('inicio')
      programador.programar({ tipo: 'ausencia', hora: '10:00' })
      irA(10, 0)
      await programador.procesarVencidos()
      expect(publicador.mensajes.at(-1)).toBe('⏸️ Buenos días, me ausento un momento @Angela Ortiz Peña')
    })
  })

  describe('cuando la acción ya no aplica o llega tarde', () => {
    it('se omite si no es válida en el estado de ese momento y explica por qué', async () => {
      // "Regresar" estando fuera de jornada.
      programador.programar({ tipo: 'regreso', hora: '09:00' })
      irA(9, 0)
      await programador.procesarVencidos()
      expect(historial.obtenerProgramado(1)).toMatchObject({
        estado: 'omitido',
        nota: 'Ya no aplicaba: la jornada estaba en «fuera de jornada»'
      })
      expect(publicador.mensajes).toHaveLength(0)
      expect(controlador.estado()).toBe('fuera_de_jornada')
    })

    it('se omite si se descubre con más retraso que la tolerancia (app cerrada o equipo suspendido)', async () => {
      await controlador.ejecutar('inicio')
      programador.programar({ tipo: 'ausencia', hora: '10:00' })
      reloj = new Date(en(10, 0).getTime() + TOLERANCIA_RETRASO_MS + 1000)
      await programador.procesarVencidos()
      expect(historial.obtenerProgramado(1)).toMatchObject({ estado: 'omitido' })
      expect(historial.obtenerProgramado(1).nota).toContain('estaba cerrada')
      expect(controlador.estado()).toBe('trabajando')
    })

    it('con un retraso dentro de la tolerancia sí se ejecuta', async () => {
      await controlador.ejecutar('inicio')
      programador.programar({ tipo: 'ausencia', hora: '10:00' })
      irA(10, 5)
      await programador.procesarVencidos()
      expect(controlador.estado()).toBe('ausente')
    })

    it('un error inesperado se registra y no detiene los demás', async () => {
      await controlador.ejecutar('inicio')
      programador.programar({ tipo: 'ausencia', hora: '10:25' })
      programador.programar({ tipo: 'regreso', hora: '10:30' })
      const original = controlador.ejecutar.bind(controlador)
      let llamadas = 0
      vi.spyOn(controlador, 'ejecutar').mockImplementation((...args) => {
        llamadas++
        if (llamadas === 1) return Promise.reject(new Error('disco lleno'))
        return original(...args)
      })
      irA(10, 30)
      await programador.procesarVencidos()
      expect(historial.obtenerProgramado(1)).toMatchObject({ estado: 'omitido', nota: 'Error al registrar la acción' })
      expect(errores).toHaveLength(1)
      // El regreso tampoco aplicaba (la ausencia falló), pero se procesó.
      expect(historial.obtenerProgramado(2).estado).toBe('omitido')
    })
  })

  it('ejecuta varios vencidos en orden de hora, y por creación si empatan', async () => {
    await controlador.ejecutar('inicio')
    programador.programar({ tipo: 'regreso', hora: '10:30' })
    programador.programar({ tipo: 'ausencia', hora: '10:25' })
    irA(10, 30)
    await programador.procesarVencidos()
    expect(publicador.mensajes.slice(-2)).toEqual([
      '⏸️ Buenos días, me ausento un momento @Angela Ortiz Peña',
      '▶️ Buenos días, regreso @Angela Ortiz Peña'
    ])
    expect(controlador.estado()).toBe('trabajando')
  })

  it('no ejecuta dos veces una acción si procesarVencidos se llama a la vez', async () => {
    await controlador.ejecutar('inicio')
    programador.programar({ tipo: 'ausencia', hora: '10:00' })
    irA(10, 0)
    await Promise.all([programador.procesarVencidos(), programador.procesarVencidos()])
    expect(publicador.mensajes.filter((m) => m.includes('me ausento'))).toHaveLength(1)
  })

  describe('vistaDelDia', () => {
    it('lista pendientes por hora y luego los resueltos, solo los de hoy', async () => {
      await controlador.ejecutar('inicio')
      programador.programar({ tipo: 'regreso', hora: '15:00' })
      programador.programar({ tipo: 'ausencia', hora: '10:00' })
      programador.programar({ tipo: 'fin', hora: '18:00' })
      // Uno de ayer no debe aparecer.
      historial.crearProgramado({ tipo: 'fin', programadoPara: new Date(2026, 10, 5, 18, 0), creadoEn: new Date(2026, 10, 5, 8, 0) })
      irA(10, 0)
      await programador.procesarVencidos()
      const vista = programador.vistaDelDia()
      expect(vista.map((v) => [v.etiqueta, v.estado])).toEqual([
        ['Regresar', 'pendiente'],
        ['Finalizar jornada', 'pendiente'],
        ['Ausentarme', 'ejecutado']
      ])
      expect(vista[0]).toMatchObject({ horaMs: en(15, 0).getTime(), origen: 'manual', mensaje: null })
    })
  })

  describe('temporizador', () => {
    beforeEach(() => vi.useFakeTimers({ now: en(8, 0) }))
    afterEach(() => {
      programador.detener()
      vi.useRealTimers()
    })

    it('despierta una sola vez a la hora justa, sin sondeo', async () => {
      const real = new Programador({
        historial,
        controlador,
        obtenerConfig: () => config,
        ahora: () => new Date()
      })
      await controlador.ejecutar('inicio')
      real.iniciar()
      real.programar({ tipo: 'ausencia', hora: '08:30' })
      expect(vi.getTimerCount()).toBe(1)

      await vi.advanceTimersByTimeAsync(29 * 60_000)
      expect(controlador.estado()).toBe('trabajando')
      await vi.advanceTimersByTimeAsync(61_000)
      expect(controlador.estado()).toBe('ausente')
      // Ya no quedan pendientes: no queda ningún temporizador armado.
      expect(vi.getTimerCount()).toBe(0)
      real.detener()
    })
  })
})
