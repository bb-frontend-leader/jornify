import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Controlador } from '../src/main/controlador'
import { configPorDefecto } from '../src/main/configEsquema'
import { TransicionInvalidaError } from '../src/main/estado'
import { Historial } from '../src/main/historial'
import type { ContextoPublicacion, Publicador } from '../src/main/publicadores/base'

const HORA = 3_600_000

class PublicadorFalso implements Publicador {
  mensajes: string[] = []
  contextos: ContextoPublicacion[] = []
  fallar = false

  publicar(mensaje: string, contexto: ContextoPublicacion): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('sin internet'))
    this.mensajes.push(mensaje)
    this.contextos.push(contexto)
    return Promise.resolve()
  }
}

describe('Controlador', () => {
  let historial: Historial
  let publicador: PublicadorFalso
  let reloj: Date
  let controlador: Controlador
  const errores: string[] = []

  const avanzar = (h: number, m = 0): void => {
    reloj = new Date(2026, 10, 6, h, m)
  }
  const crear = (): Controlador =>
    new Controlador({
      historial,
      publicador,
      obtenerConfig: configPorDefecto,
      ahora: () => reloj,
      nombre: 'Ale',
      registrarError: (mensaje) => errores.push(mensaje)
    })

  beforeEach(() => {
    historial = Historial.abrir(':memory:')
    publicador = new PublicadorFalso()
    errores.length = 0
    avanzar(8, 2)
    controlador = crear()
  })

  it('la instantánea trae el tema de hoy, y el clásico si se elige', () => {
    // 6 de noviembre de 2026: otoño.
    expect(controlador.instantanea().tema).toBe('otono')
    const config = configPorDefecto()
    const conTema = (tema: string): Controlador =>
      new Controlador({ historial, publicador, obtenerConfig: () => ({ ...config, app: { ...config.app, tema } }), ahora: () => reloj, nombre: 'Ale', registrarError: () => undefined })
    expect(conTema('clasico').instantanea().tema).toBe('clasico')
    expect(conTema('verano').instantanea().tema).toBe('verano')
    reloj = new Date(2026, 11, 7, 9, 0)
    expect(controlador.instantanea().tema).toBe('velitas')
  })

  it('arranca fuera de jornada y solo ofrece iniciar', () => {
    const foto = controlador.instantanea()
    expect(foto.estado).toBe('fuera_de_jornada')
    expect(foto.etiquetaEstado).toBe('Fuera de jornada')
    expect(foto.acciones).toEqual([{ tipo: 'inicio', etiqueta: 'Iniciar jornada' }])
    expect(foto.corriendo).toBe(false)
    expect(foto.trabajadoMs).toBe(0)
    expect(foto.objetivoMs).toBe(10 * HORA) // viernes: 10 h netas
  })

  it('registra la acción en el historial, la publica con la hora del evento y la marca como enviada', async () => {
    const { evento, publicado } = await controlador.ejecutar('inicio')
    expect(publicado).toBe(true)
    const esperado = '🌅 Buenos días, inicio mi jornada (8:02 a. m.) @Angela Ortiz Peña'
    expect(publicador.mensajes).toEqual([esperado])
    expect(publicador.contextos[0]?.ocurridoEn).toEqual(reloj)
    expect(evento).toMatchObject({ tipo: 'inicio', estadoEnvio: 'enviado', mensaje: esperado })
    expect(historial.eventosDelDia(reloj)).toHaveLength(1)
    expect(controlador.estado()).toBe('trabajando')
  })

  it('cambia las acciones disponibles según el estado', async () => {
    await controlador.ejecutar('inicio')
    expect(controlador.instantanea().acciones.map((a) => a.tipo)).toEqual(['almuerzo', 'ausencia', 'fin'])

    avanzar(12, 30)
    await controlador.ejecutar('almuerzo')
    expect(controlador.instantanea().acciones.map((a) => a.tipo)).toEqual(['regreso_almuerzo'])
    expect(controlador.instantanea().etiquetaEstado).toBe('En almuerzo')
  })

  it('rechaza una acción inválida sin guardar ni publicar nada', async () => {
    await expect(controlador.ejecutar('fin')).rejects.toBeInstanceOf(TransicionInvalidaError)
    await expect(controlador.ejecutar('regreso_almuerzo')).rejects.toBeInstanceOf(TransicionInvalidaError)
    expect(historial.ultimoEvento()).toBeNull()
    expect(publicador.mensajes).toHaveLength(0)
  })

  it('dos clics seguidos en la misma acción registran un solo evento', async () => {
    const resultados = await Promise.allSettled([controlador.ejecutar('inicio'), controlador.ejecutar('inicio')])
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(historial.eventosDelDia(reloj)).toHaveLength(1)
  })

  it('guarda el motivo de la ausencia en el historial aunque la plantilla por defecto no lo muestre', async () => {
    await controlador.ejecutar('inicio')
    avanzar(15, 10)
    const { evento } = await controlador.ejecutar('ausencia', '  Cita médica ')
    expect(evento.motivo).toBe('Cita médica')
    expect(publicador.mensajes.at(-1)).toBe('⏸️ Buenas tardes, me ausento un momento (3:10 p. m.) @Angela Ortiz Peña')
  })

  it('cada acción saluda según la hora y menciona a la persona configurada', async () => {
    await controlador.ejecutar('inicio') // 8:02
    avanzar(12, 30)
    await controlador.ejecutar('almuerzo')
    avanzar(13, 30)
    await controlador.ejecutar('regreso_almuerzo')
    avanzar(15, 10)
    await controlador.ejecutar('ausencia')
    avanzar(15, 40)
    await controlador.ejecutar('regreso')
    expect(publicador.mensajes).toEqual([
      '🌅 Buenos días, inicio mi jornada (8:02 a. m.) @Angela Ortiz Peña',
      '🍲 Buenas tardes, inicio mi hora de almuerzo (12:30 p. m.) @Angela Ortiz Peña',
      '🍽️ Buenas tardes, termino mi hora de almuerzo (1:30 p. m.) @Angela Ortiz Peña',
      '⏸️ Buenas tardes, me ausento un momento (3:10 p. m.) @Angela Ortiz Peña',
      '▶️ Buenas tardes, regreso (3:40 p. m.) @Angela Ortiz Peña'
    ])
  })

  it('al finalizar sin tiempo de más usa el mensaje normal', async () => {
    await controlador.ejecutar('inicio') // 8:02
    avanzar(18, 2) // exactamente 10 h
    await controlador.ejecutar('fin')
    expect(publicador.mensajes.at(-1)).toBe('🌇 Buenas tardes, termino mi jornada (6:02 p. m.) @Angela Ortiz Peña')
  })

  it('al finalizar con tiempo de más anuncia cuánto recupera', async () => {
    await controlador.ejecutar('inicio') // 8:02
    avanzar(19, 32) // 11 h 30 min de reloj
    await controlador.ejecutar('fin')
    expect(publicador.mensajes.at(-1)).toBe(
      '⏱️ Buenas tardes, termino mi jornada (7:32 p. m.) y recupero 1 hora y 30 minutos de hoy @Angela Ortiz Peña'
    )
  })

  it('los lunes el tiempo de más cuenta desde la jornada recortada', async () => {
    reloj = new Date(2026, 10, 9, 8, 0) // lunes: meta de 9 h
    await controlador.ejecutar('inicio')
    reloj = new Date(2026, 10, 9, 17, 45) // 9 h 45 min
    await controlador.ejecutar('fin')
    expect(publicador.mensajes.at(-1)).toBe(
      '⏱️ Buenas tardes, termino mi jornada (5:45 p. m.) y recupero 45 minutos de hoy @Angela Ortiz Peña'
    )
  })

  it('sin persona a mencionar el mensaje queda sin arroba ni espacios sobrantes', async () => {
    const config = { ...configPorDefecto(), teams: { ...configPorDefecto().teams, mencionar: '' } }
    const sinMencion = new Controlador({ historial, publicador, obtenerConfig: () => config, ahora: () => reloj })
    await sinMencion.ejecutar('inicio')
    expect(publicador.mensajes.at(-1)).toBe('🌅 Buenos días, inicio mi jornada (8:02 a. m.)')
  })

  it('ignora el motivo en acciones que no son ausencias', async () => {
    const { evento } = await controlador.ejecutar('inicio', 'algo')
    expect(evento.motivo).toBeNull()
  })

  it('si el publicador falla deja el evento pendiente, cuenta el intento y registra el error', async () => {
    publicador.fallar = true
    const { evento, publicado } = await controlador.ejecutar('inicio')
    expect(publicado).toBe(false)
    expect(evento).toMatchObject({ estadoEnvio: 'pendiente', intentos: 1 })
    expect(errores).toHaveLength(1)
    // La jornada sí quedó iniciada: la publicación es independiente del estado.
    expect(controlador.estado()).toBe('trabajando')
    expect(historial.pendientes()).toHaveLength(1)
  })

  it('sin internet varias acciones se acumulan y al volver salen en orden, con su hora original', async () => {
    publicador.fallar = true
    await controlador.ejecutar('inicio')
    avanzar(12, 0)
    await controlador.ejecutar('almuerzo')
    avanzar(13, 0)
    await controlador.ejecutar('regreso_almuerzo')
    expect(publicador.mensajes).toEqual([])
    expect(historial.pendientes().map((e) => e.tipo)).toEqual(['inicio', 'almuerzo', 'regreso_almuerzo'])

    publicador.fallar = false
    avanzar(13, 30)
    await controlador.cola.reintentarAhora()
    expect(historial.pendientes()).toHaveLength(0)
    expect(publicador.mensajes).toEqual([
      '🌅 Buenos días, inicio mi jornada (8:02 a. m.) @Angela Ortiz Peña',
      '🍲 Buenas tardes, inicio mi hora de almuerzo (12:00 p. m.) @Angela Ortiz Peña',
      '🍽️ Buenas tardes, termino mi hora de almuerzo (1:00 p. m.) @Angela Ortiz Peña'
    ])
    expect(publicador.contextos.map((c) => c.ocurridoEn.getHours())).toEqual([8, 12, 13])
  })

  it('la instantánea corre mientras se trabaja y se pausa en almuerzo y ausencia', async () => {
    await controlador.ejecutar('inicio') // 8:02
    avanzar(10, 2)
    let foto = controlador.instantanea()
    expect(foto.corriendo).toBe(true)
    expect(foto.trabajadoMs).toBe(2 * HORA)
    expect(foto.calculadoEn).toBe(reloj.getTime())

    await controlador.ejecutar('almuerzo') // 10:02
    avanzar(11, 2)
    foto = controlador.instantanea()
    expect(foto.estado).toBe('en_almuerzo')
    expect(foto.corriendo).toBe(false)
    expect(foto.trabajadoMs).toBe(2 * HORA)

    await controlador.ejecutar('regreso_almuerzo') // 11:02
    avanzar(11, 32)
    await controlador.ejecutar('ausencia')
    avanzar(12, 32)
    foto = controlador.instantanea()
    expect(foto.estado).toBe('ausente')
    expect(foto.corriendo).toBe(false)
    expect(foto.trabajadoMs).toBe(2.5 * HORA)
  })

  it('avisa a los oyentes en cada acción y deja de avisar al desuscribirse', async () => {
    const oyente = vi.fn()
    const quitar = controlador.alCambiar(oyente)
    await controlador.ejecutar('inicio')
    expect(oyente).toHaveBeenCalledTimes(1)
    quitar()
    avanzar(12)
    await controlador.ejecutar('almuerzo')
    expect(oyente).toHaveBeenCalledTimes(1)
  })

  it('un controlador nuevo retoma el estado del historial (reinicio a mitad de jornada)', async () => {
    await controlador.ejecutar('inicio')
    avanzar(12, 30)
    await controlador.ejecutar('almuerzo')

    avanzar(13, 0)
    const reiniciado = crear()
    expect(reiniciado.estado()).toBe('en_almuerzo')
    expect(reiniciado.instantanea().acciones.map((a) => a.tipo)).toEqual(['regreso_almuerzo'])
  })

  it('refleja "siempre visible" y la jornada objetivo de la configuración', () => {
    const config = configPorDefecto()
    config.app.siempreVisible = true
    config.horario.jornadaObjetivoHoras = 6
    const conConfig = new Controlador({ historial, publicador, obtenerConfig: () => config, ahora: () => reloj })
    const foto = conConfig.instantanea()
    expect(foto.siempreVisible).toBe(true)
    expect(foto.objetivoMs).toBe(6 * HORA)
  })
})

describe('Controlador: tiempo de más al recuperar una ausencia', () => {
  /** Jornada de un viernes: entra a las 8:00, almuerza de 12:00 a 13:00 y se ausenta 30 minutos de 15:00 a 15:30. */
  async function jornadaConAusencia(horaFin: [number, number]): Promise<string> {
    const historial = Historial.abrir(':memory:')
    const publicador = new PublicadorFalso()
    let reloj = new Date(2026, 10, 6, 8, 0)
    const controlador = new Controlador({ historial, publicador, obtenerConfig: configPorDefecto, ahora: () => reloj, nombre: 'Ale', registrarError: () => undefined })
    for (const [tipo, h, m] of [['inicio', 8, 0], ['almuerzo', 12, 0], ['regreso_almuerzo', 13, 0], ['ausencia', 15, 0], ['regreso', 15, 30]] as const) {
      reloj = new Date(2026, 10, 6, h, m)
      await controlador.ejecutar(tipo)
    }
    reloj = new Date(2026, 10, 6, horaFin[0], horaFin[1])
    await controlador.ejecutar('fin')
    return publicador.mensajes.at(-1) ?? ''
  }

  it('con 30 minutos ausente la salida pasa de las 7:00 a las 7:30 p. m. y el mensaje dice que recupera esos 30 minutos', async () => {
    expect(await jornadaConAusencia([19, 30])).toBe(
      '⏱️ Buenas tardes, termino mi jornada (7:30 p. m.) y recupero 30 minutos de hoy @Angela Ortiz Peña'
    )
  })

  it('si sale a la hora de siempre, sin recuperar la ausencia, el mensaje es el normal', async () => {
    expect(await jornadaConAusencia([19, 0])).toBe('🌇 Buenas tardes, termino mi jornada (7:00 p. m.) @Angela Ortiz Peña')
  })

  it('cuenta lo que se recupera de la ausencia aunque lo trabajado aún no llegue a la meta', async () => {
    expect(await jornadaConAusencia([19, 15])).toBe(
      '⏱️ Buenas tardes, termino mi jornada (7:15 p. m.) y recupero 15 minutos de hoy @Angela Ortiz Peña'
    )
  })

  it('el tiempo trabajado de más y la ausencia recuperada se suman', async () => {
    // 30 min ausente: la meta se cumple a las 7:30 p. m.; a las 7:45 hay 15 min trabajados de más y 30 de ausencia recuperada.
    expect(await jornadaConAusencia([19, 45])).toBe(
      '⏱️ Buenas tardes, termino mi jornada (7:45 p. m.) y recupero 45 minutos de hoy @Angela Ortiz Peña'
    )
  })

  it('sin ausencias, salir después de la hora de salida no cuenta como recuperación si lo trabajado no pasa la meta', async () => {
    const historial = Historial.abrir(':memory:')
    const publicador = new PublicadorFalso()
    let reloj = new Date(2026, 10, 6, 9, 0)
    const controlador = new Controlador({ historial, publicador, obtenerConfig: configPorDefecto, ahora: () => reloj, nombre: 'Ale', registrarError: () => undefined })
    // Llegó una hora tarde: 9:00 a 20:00 con 1 h de almuerzo son 10 h netas, así que no hay tiempo de más.
    for (const [tipo, h] of [['inicio', 9], ['almuerzo', 13], ['regreso_almuerzo', 14], ['fin', 20]] as const) {
      reloj = new Date(2026, 10, 6, h, 0)
      await controlador.ejecutar(tipo)
    }
    expect(publicador.mensajes.at(-1)).toBe('🌇 Buenas tardes, termino mi jornada (8:00 p. m.) @Angela Ortiz Peña')
  })

  it('si las ausencias cuentan como trabajadas no hay nada que recuperar', async () => {
    const config = configPorDefecto()
    const historial = Historial.abrir(':memory:')
    const publicador = new PublicadorFalso()
    let reloj = new Date(2026, 10, 6, 8, 0)
    const controlador = new Controlador({
      historial,
      publicador,
      obtenerConfig: () => ({ ...config, horario: { ...config.horario, descontarAusencias: false } }),
      ahora: () => reloj,
      nombre: 'Ale',
      registrarError: () => undefined
    })
    for (const [tipo, h, m] of [['inicio', 8, 0], ['ausencia', 15, 0], ['regreso', 15, 30], ['fin', 19, 15]] as const) {
      reloj = new Date(2026, 10, 6, h, m)
      await controlador.ejecutar(tipo)
    }
    // 11 h 15 min de reloj, todas trabajadas: 1 h 15 min sobre la meta, sin sumar la ausencia.
    expect(publicador.mensajes.at(-1)).toBe(
      '⏱️ Buenas tardes, termino mi jornada (7:15 p. m.) y recupero 1 hora y 15 minutos de hoy @Angela Ortiz Peña'
    )
  })
})

describe('Controlador: un solo almuerzo por jornada', () => {
  it('tras salir y regresar de almorzar ya no se ofrece ni se acepta otro almuerzo', async () => {
    const historial = Historial.abrir(':memory:')
    let reloj = new Date(2026, 10, 6, 8, 0)
    const controlador = new Controlador({
      historial,
      publicador: new PublicadorFalso(),
      obtenerConfig: configPorDefecto,
      ahora: () => reloj,
      nombre: 'Ale',
      registrarError: () => undefined
    })
    const tipos = (): string[] => controlador.instantanea().acciones.map((a) => a.tipo)
    await controlador.ejecutar('inicio')
    expect(tipos()).toEqual(['almuerzo', 'ausencia', 'fin'])
    reloj = new Date(2026, 10, 6, 12, 0)
    await controlador.ejecutar('almuerzo')
    expect(tipos()).toEqual(['regreso_almuerzo'])
    reloj = new Date(2026, 10, 6, 13, 0)
    await controlador.ejecutar('regreso_almuerzo')
    expect(tipos()).toEqual(['ausencia', 'fin'])
    await expect(controlador.ejecutar('almuerzo')).rejects.toBeInstanceOf(TransicionInvalidaError)
    expect(historial.eventosDelDia(reloj).map((e) => e.tipo)).toEqual(['inicio', 'almuerzo', 'regreso_almuerzo'])
    // Una ausencia no devuelve el almuerzo.
    await controlador.ejecutar('ausencia')
    await controlador.ejecutar('regreso')
    expect(tipos()).toEqual(['ausencia', 'fin'])
    // Cerrar la jornada y abrir otra el mismo día trae un almuerzo nuevo.
    reloj = new Date(2026, 10, 6, 14, 0)
    await controlador.ejecutar('fin')
    reloj = new Date(2026, 10, 6, 15, 0)
    await controlador.ejecutar('inicio')
    expect(tipos()).toEqual(['almuerzo', 'ausencia', 'fin'])
  })
})

describe('Controlador: datos para la línea del día', () => {
  it('incluye los tramos del día y el horario planeado de la configuración', async () => {
    const historial = Historial.abrir(':memory:')
    let reloj = new Date(2026, 10, 6, 8, 0)
    const publicador: Publicador = { publicar: () => Promise.resolve() }
    const controlador = new Controlador({ historial, publicador, obtenerConfig: configPorDefecto, ahora: () => reloj })

    await controlador.ejecutar('inicio')
    reloj = new Date(2026, 10, 6, 12, 30)
    await controlador.ejecutar('almuerzo')
    reloj = new Date(2026, 10, 6, 12, 45)

    const foto = controlador.instantanea()
    expect(foto.tramos).toEqual([
      { estado: 'trabajando', desdeMs: new Date(2026, 10, 6, 8, 0).getTime(), hastaMs: new Date(2026, 10, 6, 12, 30).getTime() },
      { estado: 'en_almuerzo', desdeMs: new Date(2026, 10, 6, 12, 30).getTime(), hastaMs: null }
    ])
    expect(foto.horario).toEqual({
      entradaMs: new Date(2026, 10, 6, 8, 0).getTime(),
      salidaMs: new Date(2026, 10, 6, 19, 0).getTime() // 8:00 + 10 h + 1 h de almuerzo
    })
    historial.cerrar()
  })
})

describe('Controlador: sonidos', () => {
  let historial: Historial
  let reloj: Date
  const sonidos: string[] = []
  let falla = false
  const publicador: Publicador = {
    publicar: () => (falla ? Promise.reject(new Error('sin internet')) : Promise.resolve())
  }
  const crear = (sonidosActivos: boolean): Controlador => {
    const config = configPorDefecto()
    config.app.sonidos = sonidosActivos
    return new Controlador({
      historial,
      publicador,
      obtenerConfig: () => config,
      ahora: () => reloj,
      sonar: (sonido) => sonidos.push(sonido)
    })
  }

  beforeEach(() => {
    historial = Historial.abrir(':memory:')
    reloj = new Date(2026, 10, 6, 8, 0)
    sonidos.length = 0
    falla = false
  })

  it('suena el sonido de cada acción, en el orden en que se registran', async () => {
    const controlador = crear(true)
    await controlador.ejecutar('inicio')
    reloj = new Date(2026, 10, 6, 12, 0)
    await controlador.ejecutar('almuerzo')
    reloj = new Date(2026, 10, 6, 13, 0)
    await controlador.ejecutar('regreso_almuerzo')
    expect(sonidos).toEqual(['inicio', 'almuerzo', 'regreso_almuerzo'])
  })

  it('no suena si los sonidos están desactivados en la configuración', async () => {
    const controlador = crear(false)
    await controlador.ejecutar('inicio')
    expect(sonidos).toEqual([])
    expect(controlador.instantanea().sonidos).toBe(false)
  })

  it('una acción rechazada no hace sonar nada', async () => {
    const controlador = crear(true)
    await expect(controlador.ejecutar('fin')).rejects.toBeInstanceOf(TransicionInvalidaError)
    expect(sonidos).toEqual([])
  })

  it('si la publicación falla suena además el aviso de error', async () => {
    falla = true
    await crear(true).ejecutar('inicio')
    expect(sonidos).toEqual(['inicio', 'fallo'])
  })

  it('con los sonidos desactivados tampoco suena el aviso de error', async () => {
    falla = true
    await crear(false).ejecutar('inicio')
    expect(sonidos).toEqual([])
  })
})

describe('Controlador: jornada de 10 h y recorte de los lunes', () => {
  const controladorEn = (dia: Date, ajustar?: (c: ReturnType<typeof configPorDefecto>) => void): Controlador => {
    const config = configPorDefecto()
    ajustar?.(config)
    const publicador: Publicador = { publicar: () => Promise.resolve() }
    return new Controlador({ historial: Historial.abrir(':memory:'), publicador, obtenerConfig: () => config, ahora: () => dia })
  }
  const LUNES = new Date(2026, 10, 9, 8, 0)
  const MARTES = new Date(2026, 10, 10, 8, 0)

  it('de martes a domingo la meta es de 10 h netas y la salida planeada las 19:00', () => {
    for (let dia = 10; dia <= 15; dia++) {
      const foto = controladorEn(new Date(2026, 10, dia, 8, 0)).instantanea()
      expect(foto.objetivoMs).toBe(10 * HORA)
      expect(foto.horario.salidaMs).toBe(new Date(2026, 10, dia, 19, 0).getTime())
    }
  })

  it('los lunes la meta baja a 9 h y la salida planeada a las 18:00', () => {
    const foto = controladorEn(LUNES).instantanea()
    expect(foto.objetivoMs).toBe(9 * HORA)
    expect(foto.horario.salidaMs).toBe(new Date(2026, 10, 9, 18, 0).getTime())
    expect(foto.horario.entradaMs).toBe(new Date(2026, 10, 9, 8, 0).getTime())
  })

  it('el lunes se pasa a horas extra una hora antes que el resto de la semana', async () => {
    for (const [dia, extra] of [[LUNES, true], [MARTES, false]] as const) {
      let reloj = dia
      const config = configPorDefecto()
      const publicador: Publicador = { publicar: () => Promise.resolve() }
      const controlador = new Controlador({ historial: Historial.abrir(':memory:'), publicador, obtenerConfig: () => config, ahora: () => reloj })
      await controlador.ejecutar('inicio')
      reloj = new Date(dia.getTime() + 9.5 * HORA) // 9 h 30 min trabajadas, sin almuerzo
      const foto = controlador.instantanea()
      expect(foto.trabajadoMs >= foto.objetivoMs).toBe(extra)
    }
  })

  it('el recorte es configurable y 0 lo desactiva', () => {
    expect(controladorEn(LUNES, (c) => (c.horario.recorteLunesHoras = 0)).instantanea().objetivoMs).toBe(10 * HORA)
    expect(controladorEn(LUNES, (c) => (c.horario.recorteLunesHoras = 2)).instantanea().objetivoMs).toBe(8 * HORA)
  })
})

describe('Controlador: texto propio y oyentes de eventos', () => {
  const crearConReloj = (): { controlador: Controlador; publicador: PublicadorFalso; historial: Historial } => {
    const historial = Historial.abrir(':memory:')
    const publicador = new PublicadorFalso()
    const controlador = new Controlador({
      historial,
      publicador,
      obtenerConfig: configPorDefecto,
      ahora: () => new Date(2026, 10, 6, 15, 10)
    })
    return { controlador, publicador, historial }
  }

  it('un texto propio reemplaza a la plantilla y admite variables', async () => {
    const { controlador, publicador, historial } = crearConReloj()
    await controlador.ejecutar('inicio', undefined, { mensaje: '  {saludo}, llegué con {mencion}  ' })
    expect(publicador.mensajes).toEqual(['Buenas tardes, llegué con @Angela Ortiz Peña'])
    expect(historial.ultimoEvento()?.mensaje).toBe('Buenas tardes, llegué con @Angela Ortiz Peña')
  })

  it('un texto propio vacío usa la plantilla', async () => {
    const { controlador, publicador } = crearConReloj()
    await controlador.ejecutar('inicio', undefined, { mensaje: '   ' })
    expect(publicador.mensajes[0]).toContain('inicio mi jornada')
  })

  it('avisa cada evento guardado y un oyente que falla no impide registrarlo', async () => {
    const { controlador, historial } = crearConReloj()
    const tipos: string[] = []
    controlador.alRegistrar((evento) => tipos.push(evento.tipo))
    controlador.alRegistrar(() => {
      throw new Error('falla')
    })
    await controlador.ejecutar('inicio')
    expect(tipos).toEqual(['inicio'])
    expect(historial.eventosDelDia(new Date(2026, 10, 6, 12))).toHaveLength(1)
  })
})
