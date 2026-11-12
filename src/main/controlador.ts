// Coordina las acciones de la jornada: valida, guarda en el historial y entrega al publicador.
// Sin dependencias de Electron. La cola con reintentos llega en la Fase 4.
import type { Instantanea } from '../preload/tipos'
import type { Config } from './configEsquema'
import { type Evento, type Historial } from './historial'
import {
  type EstadoJornada,
  type TipoEvento,
  ETIQUETAS_ESTADO,
  accionesValidas,
  almuerzoCompletado,
  etiquetaDeAccion,
  siguienteEstado
} from './estado'
import { Cola } from './cola'
import { construirMensaje, formatearMensaje } from './plantillas'
import type { Publicador } from './publicadores/base'
import type { NombreSonido } from './sonidos'
import { horaDelDia } from './fechas'
import { temaVigente } from './temas'
import { calcularTiempo, calcularTramos, jornadaObjetivoDelDia, recorteDelDia } from './tiempo'

export interface DependenciasControlador {
  historial: Historial
  publicador: Publicador
  obtenerConfig: () => Config
  /** Reloj inyectable para las pruebas. */
  ahora?: () => Date
  nombre?: string
  registrarError?: (mensaje: string, error: unknown) => void
  /** Reproduce un sonido (el controlador solo lo pide si la configuración tiene los sonidos activados). */
  sonar?: (sonido: NombreSonido) => void
}

export interface OpcionesEjecucion {
  /** Texto propio en lugar de la plantilla; admite las mismas variables ({saludo}, {mencion}…). */
  mensaje?: string
}

export interface ResultadoEjecucion {
  evento: Evento
  /** false si el evento quedó guardado pero el publicador falló (queda pendiente). */
  publicado: boolean
}

/** Cuánto espera una acción la entrega al canal antes de seguir: si tarda, el mensaje sale en segundo plano. */
export const ESPERA_ENTREGA_MS = 4000

const LARGO_MAXIMO_MOTIVO = 200
export const LARGO_MAXIMO_MENSAJE = 500

export class Controlador {
  private readonly oyentes = new Set<() => void>()
  private readonly oyentesDeEvento = new Set<(evento: Evento) => void>()
  private readonly ahora: () => Date
  /** Cola de entrega: guarda el orden de los mensajes y reintenta los que no salen. */
  readonly cola: Cola

  constructor(private readonly dependencias: DependenciasControlador) {
    this.ahora = dependencias.ahora ?? (() => new Date())
    this.cola = new Cola({
      historial: dependencias.historial,
      publicador: dependencias.publicador,
      ahora: dependencias.ahora,
      registrarError: dependencias.registrarError
    })
  }

  estado(): EstadoJornada {
    return this.dependencias.historial.estadoActual(this.ahora())
  }

  instantanea(): Instantanea {
    const ahora = this.ahora()
    const config = this.dependencias.obtenerConfig()
    const eventos = this.dependencias.historial.eventosDelDia(ahora)
    // Los lunes la jornada es más corta: se recorta la meta de horas y también la hora de salida planeada.
    const jornadaObjetivoHoras = jornadaObjetivoDelDia(config.horario, ahora)
    const recorteMs = recorteDelDia(ahora, config.horario.recorteLunesHoras) * 3_600_000
    const tiempo = calcularTiempo(eventos, ahora, { ...config.horario, jornadaObjetivoHoras })
    return {
      estado: tiempo.estado,
      etiquetaEstado: ETIQUETAS_ESTADO[tiempo.estado],
      acciones: accionesValidas(tiempo.estado, { almuerzoTomado: almuerzoCompletado(eventos) }).map((tipo) => ({ tipo, etiqueta: etiquetaDeAccion(tipo) })),
      trabajadoMs: tiempo.trabajadoMs,
      objetivoMs: tiempo.objetivoMs,
      calculadoEn: ahora.getTime(),
      corriendo: tiempo.corriendo,
      tramos: calcularTramos(eventos),
      horario: {
        entradaMs: horaDelDia(ahora, config.horario.horaEntrada).getTime(),
        salidaMs: horaDelDia(ahora, config.horario.horaSalida).getTime() - recorteMs
      },
      siempreVisible: config.app.siempreVisible,
      sonidos: config.app.sonidos,
      tema: temaVigente(config.app.tema, ahora)
    }
  }

  /**
   * Registra una acción. Lanza TransicionInvalidaError si no es válida en el estado actual
   * (sin tocar el historial). Si el publicador falla, el evento queda pendiente y no se lanza error.
   */
  async ejecutar(tipo: TipoEvento, motivo?: string, opciones: OpcionesEjecucion = {}): Promise<ResultadoEjecucion> {
    const { historial, obtenerConfig, nombre, registrarError, sonar } = this.dependencias
    const ocurridoEn = this.ahora()
    // Solo se almuerza una vez por jornada: con el almuerzo completo, "almuerzo" ya no es válido.
    siguienteEstado(this.estado(), tipo, { almuerzoTomado: almuerzoCompletado(historial.eventosDelDia(ocurridoEn)) })

    const config = obtenerConfig()
    const motivoLimpio = tipo === 'ausencia' ? motivo?.trim().slice(0, LARGO_MAXIMO_MOTIVO) || undefined : undefined
    const datosMensaje = {
      fecha: ocurridoEn,
      nombre,
      motivo: motivoLimpio,
      mencion: config.teams.mencionar,
      recuperadoMs: tipo === 'fin' ? this.tiempoExtraAl(ocurridoEn, config) : undefined
    }
    const textoPropio = opciones.mensaje?.trim().slice(0, LARGO_MAXIMO_MENSAJE)
    const mensaje = textoPropio
      ? formatearMensaje(textoPropio, datosMensaje)
      : construirMensaje(config.plantillas, tipo, datosMensaje)

    // El guardado es síncrono: una segunda acción ya ve el estado nuevo y se valida contra él.
    let evento = historial.registrarEvento({ tipo, ocurridoEn, motivo: motivoLimpio, mensaje })
    this.notificar()
    this.oyentesDeEvento.forEach((oyente) => {
      try {
        oyente(evento)
      } catch (error) {
        registrarError?.('Falló un oyente de eventos', error)
      }
    })
    // La confirmación suena al registrar, sin esperar a la red; si la publicación falla, suena además el aviso de error.
    if (config.app.sonidos) sonar?.(tipo)

    // La cola entrega en orden (primero lo que quedó pendiente). Si la red tarda, no se hace esperar a la persona:
    // el mensaje sigue en cola y sale en cuanto se pueda.
    let temporizador: NodeJS.Timeout | undefined
    const limite = new Promise<void>((resolver) => {
      temporizador = setTimeout(resolver, ESPERA_ENTREGA_MS)
    })
    await Promise.race([this.cola.procesar(), limite])
    clearTimeout(temporizador)

    evento = historial.obtener(evento.id)
    const publicado = evento.estadoEnvio === 'enviado'
    if (!publicado && obtenerConfig().app.sonidos) sonar?.('fallo')
    return { evento, publicado }
  }

  /**
   * Tiempo de más con el que se cierra la jornada en ese instante (0 si no lo hay): lo trabajado por encima de la
   * meta del día más el tiempo de ausencia que se recuperó saliendo después de la hora de salida planeada (los lunes,
   * con el recorte). Con 30 minutos ausente la meta se cumple 30 minutos después de la salida, y esos 30 minutos
   * cuentan como de más aunque lo trabajado justo iguale la meta; no pasa con quien sale tarde sin haberse ausentado.
   */
  private tiempoExtraAl(instante: Date, config: Config): number {
    const eventos = this.dependencias.historial.eventosDelDia(instante)
    const jornadaObjetivoHoras = jornadaObjetivoDelDia(config.horario, instante)
    const trabajadoDeMas = calcularTiempo(eventos, instante, { ...config.horario, jornadaObjetivoHoras }).extraMs
    if (!config.horario.descontarAusencias) return trabajadoDeMas // la ausencia ya cuenta como trabajada
    const ausenteMs = calcularTramos(eventos)
      .filter((tramo) => tramo.estado === 'ausente')
      .reduce((suma, tramo) => suma + Math.max(0, (tramo.hastaMs ?? instante.getTime()) - tramo.desdeMs), 0)
    const recorteMs = recorteDelDia(instante, config.horario.recorteLunesHoras) * 3_600_000
    const salidaPlaneadaMs = horaDelDia(instante, config.horario.horaSalida).getTime() - recorteMs
    const pasadoDeLaSalidaMs = Math.max(0, instante.getTime() - salidaPlaneadaMs)
    return trabajadoDeMas + Math.min(ausenteMs, pasadoDeLaSalidaMs)
  }

  /** Avisa a los oyentes que la instantánea cambió. */
  notificar(): void {
    this.oyentes.forEach((oyente) => oyente())
  }

  /** Registra un oyente que recibe cada evento al guardarse (antes de publicarlo); devuelve la función para quitarlo. */
  alRegistrar(oyente: (evento: Evento) => void): () => void {
    this.oyentesDeEvento.add(oyente)
    return () => this.oyentesDeEvento.delete(oyente)
  }

  /** Registra un oyente de cambios; devuelve la función para quitarlo. */
  alCambiar(oyente: () => void): () => void {
    this.oyentes.add(oyente)
    return () => this.oyentes.delete(oyente)
  }
}
