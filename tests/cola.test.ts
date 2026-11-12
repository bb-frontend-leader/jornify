import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cola, ESPERAS_REINTENTO_MS, INTENTOS_ERROR_PERMANENTE, UMBRAL_RETRASO_MS } from '../src/main/cola'
import { Historial } from '../src/main/historial'
import { ErrorDePublicacion, NoListoError } from '../src/main/publicadores/base'
import type { ContextoPublicacion, Publicador } from '../src/main/publicadores/base'

const en = (h: number, m = 0, s = 0): Date => new Date(2026, 10, 6, h, m, s)

class PublicadorGuion implements Publicador {
  enviados: string[] = []
  llamadas = 0
  /** Cola de comportamientos: cada llamada consume uno; sin más, tiene éxito. */
  guion: (Error | 'ok')[] = []
  publicar(mensaje: string, _contexto: ContextoPublicacion): Promise<void> {
    this.llamadas++
    const paso = this.guion.shift() ?? 'ok'
    if (paso !== 'ok') return Promise.reject(paso)
    this.enviados.push(mensaje)
    return Promise.resolve()
  }
}

/** Publicador que, como Graph, abre el hilo con el primer mensaje y responde a él con los siguientes. */
class PublicadorConHilos implements Publicador {
  contextos: { mensaje: string; hiloEn: string | null | undefined }[] = []
  private n = 0
  publicar(mensaje: string, contexto: ContextoPublicacion): Promise<{ idMensaje: string; esRaiz: boolean }> {
    this.contextos.push({ mensaje, hiloEn: contexto.hiloEn })
    this.n++
    return Promise.resolve({ idMensaje: `m${this.n}`, esRaiz: !contexto.hiloEn })
  }
}

describe('Cola: hilo de la jornada', () => {
  it('cada inicio abre un hilo nuevo, el resto responde a él y el fin es su última respuesta', async () => {
    const historial = Historial.abrir(':memory:')
    const publicador = new PublicadorConHilos()
    const cola = new Cola({ historial, publicador, ahora: () => new Date(2026, 10, 7, 9, 0) })
    const registrar = (tipo: 'inicio' | 'almuerzo' | 'regreso_almuerzo' | 'fin', cuando: Date): void => {
      historial.registrarEvento({ tipo, ocurridoEn: cuando, mensaje: tipo })
    }
    registrar('inicio', en(8, 0))
    registrar('almuerzo', en(12, 0))
    registrar('regreso_almuerzo', en(13, 0))
    registrar('fin', en(17, 0))
    registrar('inicio', en(18, 0)) // otra jornada el mismo día: hilo nuevo
    registrar('fin', en(19, 0))
    registrar('inicio', new Date(2026, 10, 7, 8, 5)) // al día siguiente
    registrar('almuerzo', new Date(2026, 10, 7, 12, 0))
    await cola.procesar()
    expect(publicador.contextos.map((c) => [c.mensaje.slice(0, 6), c.hiloEn])).toEqual([
      ['inicio', null],
      ['almuer', 'm1'],
      ['regres', 'm1'],
      ['fin (r', 'm1'],
      ['inicio', null],
      ['fin (r', 'm5'],
      ['inicio', null],
      ['almuer', 'm7']
    ])
  })

  it('una jornada que cruza la medianoche sigue en el mismo hilo', async () => {
    const historial = Historial.abrir(':memory:')
    const publicador = new PublicadorConHilos()
    const cola = new Cola({ historial, publicador, ahora: () => new Date(2026, 10, 7, 3, 0) })
    historial.registrarEvento({ tipo: 'inicio', ocurridoEn: en(22, 0), mensaje: 'inicio' })
    historial.registrarEvento({ tipo: 'fin', ocurridoEn: new Date(2026, 10, 7, 1, 0), mensaje: 'fin' })
    await cola.procesar()
    expect(publicador.contextos.map((c) => c.hiloEn)).toEqual([null, 'm1'])
  })

  it('sin un hilo abierto (p. ej. mensajes de antes de esta función) el mensaje sale al canal y abre uno', async () => {
    const historial = Historial.abrir(':memory:')
    const publicador = new PublicadorConHilos()
    const cola = new Cola({ historial, publicador, ahora: () => en(12, 1) })
    historial.registrarEvento({ tipo: 'almuerzo', ocurridoEn: en(12, 0), mensaje: 'almuerzo' })
    await cola.procesar()
    expect(publicador.contextos.map((c) => c.hiloEn)).toEqual([null])
    expect(historial.hiloVigente(en(12, 30))).toBe('m1')
  })

  it('si el hilo se perdió y un mensaje abrió otro, los siguientes responden al nuevo', () => {
    const historial = Historial.abrir(':memory:')
    const inicio = historial.registrarEvento({ tipo: 'inicio', ocurridoEn: en(8, 0), mensaje: 'a' })
    historial.marcarEnviado(inicio.id, en(8, 0), { id: 'vieja', esRaiz: true })
    const almuerzo = historial.registrarEvento({ tipo: 'almuerzo', ocurridoEn: en(12, 0), mensaje: 'b' })
    historial.marcarEnviado(almuerzo.id, en(12, 0), { id: 'nueva', esRaiz: true })
    expect(historial.hiloVigente(en(13, 0))).toBe('nueva')
    expect(historial.hiloVigente(en(11, 0))).toBe('vieja')
    expect(historial.hiloVigente(en(7, 0))).toBeNull()
  })

  it('un publicador que no informa ids deja los mensajes sueltos, como antes', async () => {
    const historial = Historial.abrir(':memory:')
    const publicador = new PublicadorGuion()
    const cola = new Cola({ historial, publicador, ahora: () => en(12, 1) })
    historial.registrarEvento({ tipo: 'inicio', ocurridoEn: en(8, 0), mensaje: 'a' })
    historial.registrarEvento({ tipo: 'almuerzo', ocurridoEn: en(12, 0), mensaje: 'b' })
    await cola.procesar()
    expect(historial.hiloVigente(en(12, 30))).toBeNull()
    expect(historial.pendientes()).toHaveLength(0)
  })
})

describe('Cola', () => {
  let historial: Historial
  let publicador: PublicadorGuion
  let reloj: Date
  let errores: string[]
  let cola: Cola

  const registrar = (tipo: 'inicio' | 'almuerzo' | 'regreso_almuerzo' | 'fin', cuando: Date, mensaje = `msg ${tipo}`): number =>
    historial.registrarEvento({ tipo, ocurridoEn: cuando, mensaje }).id

  beforeEach(() => {
    historial = Historial.abrir(':memory:')
    publicador = new PublicadorGuion()
    reloj = en(8, 1)
    errores = []
    cola = new Cola({ historial, publicador, ahora: () => reloj, registrarError: (m) => errores.push(m) })
  })

  afterEach(() => {
    cola.detener()
    vi.useRealTimers()
  })

  it('entrega los pendientes en orden cronológico y los marca como enviados', async () => {
    registrar('almuerzo', en(12, 0))
    registrar('inicio', en(8, 0))
    reloj = en(12, 1)
    await cola.procesar()
    expect(publicador.enviados).toEqual(['msg inicio (registrado a las 8:00 a. m.)', 'msg almuerzo'])
    expect(historial.pendientes()).toHaveLength(0)
    expect(cola.estado()).toMatchObject({ pendientes: 0, fallidos: 0, bloqueo: null })
  })

  it('un fallo detiene la cola: los siguientes esperan para no desordenar el canal', async () => {
    registrar('inicio', en(8, 0))
    registrar('almuerzo', en(8, 0, 30))
    publicador.guion = [new ErrorDePublicacion('sin internet', true)]
    await cola.procesar()
    expect(publicador.llamadas).toBe(1)
    expect(historial.pendientes().map((e) => [e.tipo, e.intentos])).toEqual([
      ['inicio', 1],
      ['almuerzo', 0]
    ])
    expect(cola.estado().bloqueo).toEqual({ motivo: 'sin internet', requiereAccion: false })
    expect(errores).toHaveLength(1)

    await cola.reintentarAhora()
    expect(publicador.enviados).toEqual(['msg inicio', 'msg almuerzo'])
    expect(cola.estado().bloqueo).toBeNull()
  })

  it('un mensaje con retraso lleva la hora original, y uno reciente no', async () => {
    registrar('inicio', en(8, 0))
    reloj = new Date(en(8, 0).getTime() + UMBRAL_RETRASO_MS - 1000)
    await cola.procesar()
    registrar('almuerzo', en(8, 10))
    reloj = new Date(en(8, 10).getTime() + UMBRAL_RETRASO_MS + 1000)
    await cola.procesar()
    expect(publicador.enviados).toEqual(['msg inicio', 'msg almuerzo (registrado a las 8:10 a. m.)'])
  })

  it('el contexto lleva la hora real del evento, no la del envío', async () => {
    registrar('inicio', en(8, 0))
    const contextos: ContextoPublicacion[] = []
    publicador.publicar = (_m, contexto) => {
      contextos.push(contexto)
      return Promise.resolve()
    }
    reloj = en(9, 30)
    await cola.procesar()
    expect(contextos[0]?.ocurridoEn).toEqual(en(8, 0))
  })

  describe('cuando falta iniciar sesión o elegir canal', () => {
    it('no cuenta intentos, pide una acción y no programa reintentos', async () => {
      vi.useFakeTimers()
      cola.iniciar()
      registrar('inicio', en(8, 0))
      publicador.guion = [new NoListoError('Inicia sesión con Microsoft (Teams)')]
      await cola.procesar()
      expect(historial.pendientes()[0]?.intentos).toBe(0)
      expect(cola.estado()).toMatchObject({
        pendientes: 1,
        bloqueo: { motivo: 'Inicia sesión con Microsoft (Teams)', requiereAccion: true },
        proximoIntentoEn: null
      })
      expect(vi.getTimerCount()).toBe(0)
      expect(errores).toEqual([])
    })

    it('al avisar que ya está listo, entrega lo acumulado', async () => {
      registrar('inicio', en(8, 0))
      registrar('almuerzo', en(8, 1))
      publicador.guion = [new NoListoError('x')]
      await cola.procesar()
      await cola.reintentarAhora()
      expect(publicador.enviados).toHaveLength(2)
      expect(cola.estado().bloqueo).toBeNull()
    })
  })

  describe('errores sin remedio', () => {
    it(`tras ${INTENTOS_ERROR_PERMANENTE} intentos el mensaje queda como fallido y sigue el siguiente`, async () => {
      const primero = registrar('inicio', en(8, 0))
      registrar('almuerzo', en(8, 1))
      publicador.guion = Array.from({ length: INTENTOS_ERROR_PERMANENTE }, () => new ErrorDePublicacion('403', false))
      for (let i = 0; i < INTENTOS_ERROR_PERMANENTE - 1; i++) {
        await cola.procesar()
        expect(cola.estado().bloqueo).toMatchObject({ requiereAccion: true })
      }
      expect(publicador.enviados).toEqual([])
      await cola.procesar()
      expect(historial.obtener(primero)).toMatchObject({ estadoEnvio: 'fallido', intentos: INTENTOS_ERROR_PERMANENTE })
      expect(publicador.enviados).toEqual(['msg almuerzo'])
      expect(cola.estado()).toMatchObject({ pendientes: 0, fallidos: 1 })
    })

    it('«reintentar» devuelve los fallidos a la cola', async () => {
      const id = registrar('inicio', en(8, 0))
      publicador.guion = Array.from({ length: INTENTOS_ERROR_PERMANENTE }, () => new ErrorDePublicacion('403', false))
      for (let i = 0; i < INTENTOS_ERROR_PERMANENTE; i++) await cola.procesar()
      expect(historial.obtener(id).estadoEnvio).toBe('fallido')

      await cola.reintentarAhora(true)
      expect(historial.obtener(id)).toMatchObject({ estadoEnvio: 'enviado' })
    })

    it('un error de red nunca pasa a fallido por mucho que se repita', async () => {
      const id = registrar('inicio', en(8, 0))
      publicador.guion = Array.from({ length: 10 }, () => new ErrorDePublicacion('red', true))
      for (let i = 0; i < 10; i++) await cola.procesar()
      expect(historial.obtener(id)).toMatchObject({ estadoEnvio: 'pendiente', intentos: 10 })
    })
  })

  describe('reintentos automáticos', () => {
    beforeEach(() => vi.useFakeTimers({ now: en(8, 0) }))

    it('espera cada vez más entre intentos y entrega apenas se recupera', async () => {
      const real = new Cola({ historial, publicador, registrarError: (m) => errores.push(m) })
      real.iniciar()
      registrar('inicio', en(8, 0))
      publicador.guion = [new ErrorDePublicacion('red', true), new ErrorDePublicacion('red', true)]

      await real.procesar() // 1.º fallo → espera 15 s
      expect(real.estado().proximoIntentoEn).toBe(Date.now() + ESPERAS_REINTENTO_MS[0]!)
      await vi.advanceTimersByTimeAsync(ESPERAS_REINTENTO_MS[0]! - 1)
      expect(publicador.llamadas).toBe(1)
      await vi.advanceTimersByTimeAsync(1) // 2.º intento, falla → espera 30 s
      expect(publicador.llamadas).toBe(2)
      expect(real.estado().proximoIntentoEn).toBe(Date.now() + ESPERAS_REINTENTO_MS[1]!)
      await vi.advanceTimersByTimeAsync(ESPERAS_REINTENTO_MS[1]!) // 3.º intento, sale
      expect(publicador.enviados).toHaveLength(1)
      expect(real.estado()).toMatchObject({ pendientes: 0, bloqueo: null, proximoIntentoEn: null })
      expect(vi.getTimerCount()).toBe(0)
      real.detener()
    })

    it('las esperas crecen y se quedan en la última del arreglo', async () => {
      const real = new Cola({ historial, publicador })
      real.iniciar()
      registrar('inicio', en(8, 0))
      publicador.guion = Array.from({ length: 20 }, () => new ErrorDePublicacion('red', true))
      await real.procesar()
      const esperas: number[] = []
      for (let i = 0; i < ESPERAS_REINTENTO_MS.length + 3; i++) {
        const espera = real.estado().proximoIntentoEn! - Date.now()
        esperas.push(espera)
        await vi.advanceTimersByTimeAsync(espera)
      }
      expect(esperas).toEqual([...ESPERAS_REINTENTO_MS, ...Array(3).fill(ESPERAS_REINTENTO_MS.at(-1))])
      real.detener()
    })

    it('sin iniciar no programa temporizadores', async () => {
      registrar('inicio', en(8, 0))
      publicador.guion = [new ErrorDePublicacion('red', true)]
      await cola.procesar()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('varias llamadas a la vez no envían dos veces el mismo mensaje', async () => {
    registrar('inicio', en(8, 0))
    registrar('almuerzo', en(8, 1))
    await Promise.all([cola.procesar(), cola.procesar(), cola.procesar()])
    expect(publicador.enviados).toHaveLength(2)
    expect(publicador.llamadas).toBe(2)
  })

  it('un evento registrado mientras se entrega otro sale en la misma pasada', async () => {
    registrar('inicio', en(8, 0))
    let liberar: () => void = () => undefined
    const original = publicador.publicar.bind(publicador)
    publicador.publicar = (mensaje, contexto) =>
      mensaje === 'msg inicio' ? new Promise<void>((r) => (liberar = r)).then(() => original(mensaje, contexto)) : original(mensaje, contexto)
    const pasada = cola.procesar()
    registrar('almuerzo', en(8, 0, 30))
    const segunda = cola.procesar()
    liberar()
    await Promise.all([pasada, segunda])
    expect(publicador.enviados).toEqual(['msg inicio', 'msg almuerzo'])
  })

  it('avisa a los oyentes cuando cambia el estado', async () => {
    const oyente = vi.fn()
    cola.alCambiar(oyente)
    registrar('inicio', en(8, 0))
    publicador.guion = [new ErrorDePublicacion('red', true)]
    await cola.procesar()
    expect(oyente).toHaveBeenCalled()
  })
})
