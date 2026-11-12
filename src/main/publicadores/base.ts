// Contrato común de los publicadores (Graph, webhook y el de prueba). Sin dependencias de Electron.
import type { TipoEvento } from '../estado'

export interface ContextoPublicacion {
  tipo: TipoEvento
  /** Hora real del evento, que puede ser anterior al momento del envío (p. ej. al reintentar). */
  ocurridoEn: Date
  /** Id del mensaje del canal al que se responde (el que abrió la jornada); null o ausente = este mensaje abre un hilo. */
  hiloEn?: string | null
}

/** Lo que el canal devolvió al publicar: sirve para que los mensajes siguientes del día respondan a este. */
export interface ResultadoPublicacion {
  idMensaje: string
  /** true si salió como mensaje del canal (abre el hilo); false si salió como respuesta a `hiloEn`. */
  esRaiz: boolean
}

export interface Publicador {
  /** Publica el mensaje; rechaza la promesa si no se pudo entregar. Devuelve el id si el canal lo informa. */
  publicar(mensaje: string, contexto: ContextoPublicacion): Promise<ResultadoPublicacion | undefined | void>
}

/**
 * El publicador no puede enviar todavía por algo que el usuario debe resolver (iniciar sesión, elegir el canal…).
 * La cola no cuenta intentos ni reintenta sola: espera a que se le avise que ya está listo.
 */
export class NoListoError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'NoListoError'
  }
}

/** Fallo al entregar el mensaje. `reintentable` es false cuando reintentar igual no servirá (p. ej. permisos o canal inexistente). */
export class ErrorDePublicacion extends Error {
  constructor(
    mensaje: string,
    readonly reintentable: boolean
  ) {
    super(mensaje)
    this.name = 'ErrorDePublicacion'
  }
}
