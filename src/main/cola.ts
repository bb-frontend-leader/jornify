// Cola de entrega: envía los eventos pendientes al publicador en orden cronológico y reintenta con espera creciente.
// Sin dependencias de Electron. El historial es la cola: un evento "pendiente" es un mensaje por enviar.
import { milisegundosDe } from './fechas'
import type { Evento, Historial } from './historial'
import { formatearHora } from './plantillas'
import { ErrorDePublicacion, NoListoError, type Publicador } from './publicadores/base'

/** Esperas entre reintentos del mismo mensaje; la última se repite. */
export const ESPERAS_REINTENTO_MS = [15_000, 30_000, 60_000, 120_000, 300_000]

/** Intentos tras los que un error que no tiene remedio (permisos, canal inexistente) deja el mensaje como "fallido". */
export const INTENTOS_ERROR_PERMANENTE = 3

/** Un mensaje que sale con más retraso que esto lleva la hora original del evento. */
export const UMBRAL_RETRASO_MS = 5 * 60_000

export interface EstadoCola {
  /** Mensajes esperando salir. */
  pendientes: number
  /** Mensajes que se dejaron de reintentar. */
  fallidos: number
  /** Por qué no sale nada ahora (null si todo fluye). */
  bloqueo: { motivo: string; requiereAccion: boolean } | null
  /** Cuándo es el próximo reintento automático (ms desde la época), si lo hay. */
  proximoIntentoEn: number | null
}

export interface DependenciasCola {
  historial: Historial
  publicador: Publicador
  /** Reloj inyectable para las pruebas. */
  ahora?: () => Date
  registrarError?: (mensaje: string, error: unknown) => void
  esperasMs?: readonly number[]
}

export class Cola {
  private readonly ahora: () => Date
  private readonly esperasMs: readonly number[]
  private readonly oyentes = new Set<() => void>()
  private temporizador: NodeJS.Timeout | null = null
  private enCurso: Promise<void> | null = null
  private otraVuelta = false
  private activa = false
  private fallosSeguidos = 0
  private bloqueo: EstadoCola['bloqueo'] = null
  private proximoIntentoEn: number | null = null

  constructor(private readonly dependencias: DependenciasCola) {
    this.ahora = dependencias.ahora ?? (() => new Date())
    this.esperasMs = dependencias.esperasMs ?? ESPERAS_REINTENTO_MS
  }

  estado(): EstadoCola {
    return {
      pendientes: this.dependencias.historial.pendientes().length,
      fallidos: this.dependencias.historial.contarFallidos(),
      bloqueo: this.bloqueo,
      proximoIntentoEn: this.proximoIntentoEn
    }
  }

  /** Avisa cuando cambia algo visible: pendientes, fallidos o el bloqueo. Devuelve la función para quitar el oyente. */
  alCambiar(oyente: () => void): () => void {
    this.oyentes.add(oyente)
    return () => this.oyentes.delete(oyente)
  }

  private avisar(): void {
    this.oyentes.forEach((oyente) => oyente())
  }

  /** Empieza a vigilar: entrega lo que haya pendiente (p. ej. lo que quedó de la sesión anterior). */
  iniciar(): void {
    this.activa = true
    void this.procesar()
  }

  detener(): void {
    this.activa = false
    this.cancelarTemporizador()
  }

  /**
   * Entrega los pendientes en orden hasta que se acaben o uno falle (los siguientes esperan, para no
   * desordenar el canal). Varias llamadas a la vez comparten la misma pasada.
   */
  procesar(): Promise<void> {
    if (this.enCurso) {
      this.otraVuelta = true
      return this.enCurso
    }
    this.enCurso = this.vueltas().finally(() => {
      this.enCurso = null
    })
    return this.enCurso
  }

  /** Reintenta ya, sin esperar el temporizador. Con `incluirFallidos` también los que se habían dado por perdidos. */
  reintentarAhora(incluirFallidos = false): Promise<void> {
    if (incluirFallidos) this.dependencias.historial.reencolarFallidos()
    this.fallosSeguidos = 0
    this.cancelarTemporizador()
    return this.procesar()
  }

  private async vueltas(): Promise<void> {
    do {
      this.otraVuelta = false
      await this.entregar()
    } while (this.otraVuelta)
  }

  private async entregar(): Promise<void> {
    const { historial, publicador, registrarError } = this.dependencias
    for (;;) {
      const [siguiente] = historial.pendientes()
      if (!siguiente) {
        this.fijarBloqueo(null)
        break
      }
      try {
        const ocurridoEn = new Date(milisegundosDe(siguiente.ocurridoEn))
        const publicado = await publicador.publicar(this.textoParaEnviar(siguiente), {
          tipo: siguiente.tipo,
          ocurridoEn,
          // Cada inicio de jornada abre un hilo nuevo; el resto responde al último que se abrió.
          hiloEn: siguiente.tipo === 'inicio' ? null : historial.hiloVigente(ocurridoEn)
        })
        historial.marcarEnviado(
          siguiente.id,
          this.ahora(),
          publicado ? { id: publicado.idMensaje, esRaiz: publicado.esRaiz } : undefined
        )
        this.fallosSeguidos = 0
        this.fijarBloqueo(null)
        this.avisar()
      } catch (error) {
        if (error instanceof NoListoError) {
          // Nada que reintentar solo: se espera a que el usuario resuelva (iniciar sesión, elegir canal).
          this.cancelarTemporizador()
          this.fijarBloqueo({ motivo: error.message, requiereAccion: true })
          return
        }
        registrarError?.(`No se pudo publicar el evento ${siguiente.id} (${siguiente.tipo})`, error)
        const sinRemedio = error instanceof ErrorDePublicacion && !error.reintentable
        const intentos = siguiente.intentos + 1
        const definitivo = sinRemedio && intentos >= INTENTOS_ERROR_PERMANENTE
        historial.registrarIntentoFallido(siguiente.id, definitivo)
        this.avisar()
        if (definitivo) continue // este no tiene remedio: se sigue con el siguiente
        this.fijarBloqueo({ motivo: mensajeDe(error), requiereAccion: sinRemedio })
        this.programarReintento()
        return
      }
    }
  }

  private fijarBloqueo(bloqueo: EstadoCola['bloqueo']): void {
    const cambio = this.bloqueo?.motivo !== bloqueo?.motivo
    this.bloqueo = bloqueo
    if (bloqueo === null) this.proximoIntentoEn = null
    if (cambio) this.avisar()
  }

  private programarReintento(): void {
    this.cancelarTemporizador()
    if (!this.activa) return
    const indice = Math.min(this.fallosSeguidos, this.esperasMs.length - 1)
    const espera = this.esperasMs[indice] ?? 60_000
    this.fallosSeguidos++
    this.proximoIntentoEn = this.ahora().getTime() + espera
    this.temporizador = setTimeout(() => {
      this.temporizador = null
      void this.procesar()
    }, espera)
    this.temporizador.unref()
    this.avisar()
  }

  private cancelarTemporizador(): void {
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = null
    this.proximoIntentoEn = null
  }

  /** El mensaje guardado, con la hora original si sale mucho después de ocurrir el evento. */
  private textoParaEnviar(evento: Evento): string {
    const ocurrido = new Date(milisegundosDe(evento.ocurridoEn))
    if (this.ahora().getTime() - ocurrido.getTime() <= UMBRAL_RETRASO_MS) return evento.mensaje
    return `${evento.mensaje} (registrado a las ${formatearHora(ocurrido)})`
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido'
}
