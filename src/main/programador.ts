// Acciones programadas a una hora del día (p. ej. "ausentarme a la 1:30 p. m.") y regreso automático del almuerzo.
// Sin dependencias de Electron. Un solo temporizador apunta a la próxima hora pendiente: no hay sondeo.
import type { ProgramadoVista, ResultadoSimple } from '../preload/tipos'
import type { Config } from './configEsquema'
import { LARGO_MAXIMO_MENSAJE, type Controlador } from './controlador'
import { ETIQUETAS_ESTADO, TransicionInvalidaError, etiquetaDeAccion, type TipoEvento } from './estado'
import { horaDelDia, limitesDelDia, milisegundosDe } from './fechas'
import type { Evento, Historial, Programado } from './historial'

/** Si una acción se descubre pendiente con más retraso que esto (app cerrada, equipo suspendido), se omite. */
export const TOLERANCIA_RETRASO_MS = 10 * 60_000

/** El temporizador de Node no admite esperas mayores a 2^31 − 1 ms. */
const ESPERA_MAXIMA_MS = 2 ** 31 - 1

export interface DependenciasProgramador {
  historial: Historial
  controlador: Pick<Controlador, 'ejecutar' | 'estado' | 'alRegistrar'>
  obtenerConfig: () => Config
  /** Reloj inyectable para las pruebas. */
  ahora?: () => Date
  registrarError?: (mensaje: string, error: unknown) => void
}

export interface NuevaProgramacion {
  tipo: TipoEvento
  /** Hora de hoy, "HH:MM". */
  hora: string
  mensaje?: string
}

export class Programador {
  private readonly oyentes = new Set<() => void>()
  private readonly ahora: () => Date
  private temporizador: NodeJS.Timeout | null = null
  private activo = false
  private procesando = false
  /** Programado que se está ejecutando: los avisos de eventos no deben cancelarlo. */
  private enProceso: number | null = null

  constructor(private readonly dependencias: DependenciasProgramador) {
    this.ahora = dependencias.ahora ?? (() => new Date())
    dependencias.controlador.alRegistrar((evento) => this.alRegistrarEvento(evento))
  }

  /** Programa una acción para una hora de hoy. */
  programar(datos: NuevaProgramacion): ResultadoSimple {
    const ahora = this.ahora()
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.hora)) return { ok: false, error: 'La hora no es válida' }
    const hora = horaDelDia(ahora, datos.hora)
    if (hora.getTime() <= ahora.getTime()) return { ok: false, error: 'Esa hora ya pasó' }
    const mensaje = datos.mensaje?.trim().slice(0, LARGO_MAXIMO_MENSAJE)
    this.dependencias.historial.crearProgramado({ tipo: datos.tipo, programadoPara: hora, mensaje, creadoEn: ahora })
    this.cambio()
    return { ok: true }
  }

  /** Cancela un programado pendiente. */
  cancelar(id: number): ResultadoSimple {
    const cancelado = this.dependencias.historial.resolverProgramado(id, 'cancelado', 'Cancelado por el usuario')
    if (!cancelado) return { ok: false, error: 'Esa acción ya no está pendiente' }
    this.cambio()
    return { ok: true }
  }

  /** Programados de hoy para la interfaz: primero los pendientes por hora, luego los ya resueltos. */
  vistaDelDia(): ProgramadoVista[] {
    const { desde, hasta } = limitesDelDia(this.ahora())
    const vistas = this.dependencias.historial.programadosEntre(desde, hasta).map(aVista)
    return [...vistas.filter((v) => v.estado === 'pendiente'), ...vistas.filter((v) => v.estado !== 'pendiente')]
  }

  /** Ejecuta los pendientes cuya hora llegó, uno tras otro; los muy atrasados se omiten. */
  async procesarVencidos(): Promise<void> {
    if (this.procesando) return
    this.procesando = true
    try {
      for (;;) {
        const ahora = this.ahora()
        const siguiente = this.dependencias.historial
          .programadosPendientes()
          .find((p) => milisegundosDe(p.programadoPara) <= ahora.getTime())
        if (!siguiente) break
        await this.ejecutarUno(siguiente, ahora)
      }
    } finally {
      this.procesando = false
      this.rearmar()
    }
  }

  /** Empieza a vigilar: atiende lo vencido y deja el temporizador apuntando a lo siguiente. */
  iniciar(): void {
    this.activo = true
    void this.procesarVencidos()
  }

  detener(): void {
    this.activo = false
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = null
  }

  /** Avisa cuando cambia la lista de programados. Devuelve la función para quitar el oyente. */
  alCambiar(oyente: () => void): () => void {
    this.oyentes.add(oyente)
    return () => this.oyentes.delete(oyente)
  }

  /** Avisa a los oyentes sin cambiar nada (p. ej. al cambiar el día, cuando "hoy" es otra lista). */
  notificar(): void {
    this.oyentes.forEach((oyente) => oyente())
  }

  private async ejecutarUno(programado: Programado, ahora: Date): Promise<void> {
    const { historial, controlador, registrarError } = this.dependencias
    const retrasoMs = ahora.getTime() - milisegundosDe(programado.programadoPara)
    if (retrasoMs > TOLERANCIA_RETRASO_MS) {
      historial.resolverProgramado(
        programado.id,
        'omitido',
        'No salió a su hora: la app estaba cerrada o el equipo suspendido'
      )
      this.cambio()
      return
    }

    this.enProceso = programado.id
    try {
      const { evento } = await controlador.ejecutar(programado.tipo, undefined, {
        mensaje: programado.mensaje ?? undefined
      })
      historial.resolverProgramado(programado.id, 'ejecutado', null, evento.id)
    } catch (error) {
      if (error instanceof TransicionInvalidaError) {
        const estado = ETIQUETAS_ESTADO[controlador.estado()].toLowerCase()
        historial.resolverProgramado(programado.id, 'omitido', `Ya no aplicaba: la jornada estaba en «${estado}»`)
      } else {
        registrarError?.(`No se pudo ejecutar la acción programada ${programado.id}`, error)
        historial.resolverProgramado(programado.id, 'omitido', 'Error al registrar la acción')
      }
    } finally {
      this.enProceso = null
      this.cambio()
    }
  }

  /** El regreso del almuerzo se programa solo al salir a almorzar y se retira si se marca a mano antes. */
  private alRegistrarEvento(evento: Evento): void {
    const { historial, obtenerConfig } = this.dependencias
    if (evento.tipo !== 'almuerzo' && evento.tipo !== 'regreso_almuerzo') return

    const retirados = historial
      .programadosPendientes()
      .filter((p) => p.origen === 'automatico' && p.tipo === 'regreso_almuerzo' && p.id !== this.enProceso)
    for (const p of retirados) {
      historial.resolverProgramado(p.id, 'cancelado', evento.tipo === 'almuerzo' ? 'Reemplazado' : 'Se registró a mano antes')
    }

    let creado = false
    if (evento.tipo === 'almuerzo') {
      const { horario } = obtenerConfig()
      if (horario.regresoAlmuerzoAutomatico) {
        const salida = new Date(milisegundosDe(evento.ocurridoEn))
        const regreso = new Date(salida.getTime() + horario.duracionAlmuerzoMin * 60_000)
        // Si el almuerzo cruza la medianoche no se programa: ya no sería "de hoy".
        if (regreso < limitesDelDia(salida).hasta) {
          historial.crearProgramado({
            tipo: 'regreso_almuerzo',
            programadoPara: regreso,
            origen: 'automatico',
            creadoEn: this.ahora()
          })
          creado = true
        }
      }
    }
    if (creado || retirados.length > 0) this.cambio()
  }

  private cambio(): void {
    this.oyentes.forEach((oyente) => oyente())
    this.rearmar()
  }

  /** Deja un único temporizador apuntando a la próxima hora pendiente. */
  private rearmar(): void {
    if (!this.activo) return
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = null
    const proximo = this.dependencias.historial.programadosPendientes()[0]
    if (!proximo) return
    const espera = Math.min(Math.max(0, milisegundosDe(proximo.programadoPara) - this.ahora().getTime()), ESPERA_MAXIMA_MS)
    this.temporizador = setTimeout(() => void this.procesarVencidos(), espera)
    this.temporizador.unref()
  }
}

function aVista(p: Programado): ProgramadoVista {
  return {
    id: p.id,
    tipo: p.tipo,
    etiqueta: etiquetaDeAccion(p.tipo),
    horaMs: milisegundosDe(p.programadoPara),
    mensaje: p.mensaje,
    origen: p.origen,
    estado: p.estado,
    nota: p.nota
  }
}
