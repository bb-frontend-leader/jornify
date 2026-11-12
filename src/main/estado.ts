// Máquina de estados de la jornada. Sin dependencias de Electron.
import { milisegundosDe } from './fechas'

export const TIPOS_EVENTO = ['inicio', 'almuerzo', 'regreso_almuerzo', 'ausencia', 'regreso', 'fin'] as const
export type TipoEvento = (typeof TIPOS_EVENTO)[number]

export type EstadoJornada = 'fuera_de_jornada' | 'trabajando' | 'en_almuerzo' | 'ausente'

/** Lo mínimo que se necesita de un evento para calcular estado y tiempos. */
export interface EventoJornada {
  tipo: TipoEvento
  /** ISO 8601 con zona horaria. */
  ocurridoEn: string
}

interface Transicion {
  desde: EstadoJornada
  hacia: EstadoJornada
  /** Texto de la acción en el menú y los botones. */
  etiqueta: string
}

// El orden de las claves es el orden en que se ofrecen las acciones.
const TRANSICIONES: Record<TipoEvento, Transicion> = {
  inicio: { desde: 'fuera_de_jornada', hacia: 'trabajando', etiqueta: 'Iniciar jornada' },
  almuerzo: { desde: 'trabajando', hacia: 'en_almuerzo', etiqueta: 'Salir a almorzar' },
  regreso_almuerzo: { desde: 'en_almuerzo', hacia: 'trabajando', etiqueta: 'Regresar de almuerzo' },
  ausencia: { desde: 'trabajando', hacia: 'ausente', etiqueta: 'Ausentarme' },
  regreso: { desde: 'ausente', hacia: 'trabajando', etiqueta: 'Regresar' },
  fin: { desde: 'trabajando', hacia: 'fuera_de_jornada', etiqueta: 'Finalizar jornada' }
}

export const ETIQUETAS_ESTADO: Record<EstadoJornada, string> = {
  fuera_de_jornada: 'Fuera de jornada',
  trabajando: 'Trabajando',
  en_almuerzo: 'En almuerzo',
  ausente: 'Ausente'
}

export class TransicionInvalidaError extends Error {
  constructor(
    readonly estado: EstadoJornada,
    readonly tipo: TipoEvento
  ) {
    super(`No se puede registrar "${tipo}" cuando el estado es "${estado}"`)
    this.name = 'TransicionInvalidaError'
  }
}

export function esTipoEvento(valor: unknown): valor is TipoEvento {
  return typeof valor === 'string' && (TIPOS_EVENTO as readonly string[]).includes(valor)
}

export function etiquetaDeAccion(tipo: TipoEvento): string {
  return TRANSICIONES[tipo].etiqueta
}

/** Estado en el que queda la jornada después de un evento. */
export function estadoTras(tipo: TipoEvento): EstadoJornada {
  return TRANSICIONES[tipo].hacia
}

/** Contexto de la jornada que, además del estado, decide qué acciones se ofrecen. */
export interface ContextoAcciones {
  /** La jornada en curso ya tuvo su almuerzo completo (salida y regreso): solo se almuerza una vez. */
  almuerzoTomado?: boolean
}

/** ¿Es válido registrar este evento en el estado dado? */
export function esTransicionValida(estado: EstadoJornada, tipo: TipoEvento, contexto: ContextoAcciones = {}): boolean {
  if (tipo === 'almuerzo' && contexto.almuerzoTomado) return false
  return TRANSICIONES[tipo].desde === estado
}

/** Nuevo estado tras aplicar el evento; lanza TransicionInvalidaError si no corresponde. */
export function siguienteEstado(estado: EstadoJornada, tipo: TipoEvento, contexto: ContextoAcciones = {}): EstadoJornada {
  if (!esTransicionValida(estado, tipo, contexto)) throw new TransicionInvalidaError(estado, tipo)
  return estadoTras(tipo)
}

/** Acciones que se pueden ofrecer en el estado dado, en el orden de la especificación. */
export function accionesValidas(estado: EstadoJornada, contexto: ContextoAcciones = {}): TipoEvento[] {
  return TIPOS_EVENTO.filter((tipo) => esTransicionValida(estado, tipo, contexto))
}

/**
 * ¿La jornada en curso (desde el último inicio) ya tuvo su almuerzo completo? Cuenta el regreso, no la salida:
 * mientras se está almorzando todavía hay que poder regresar. Un nuevo inicio abre una jornada nueva, con su almuerzo.
 */
export function almuerzoCompletado(eventos: readonly EventoJornada[]): boolean {
  let inicioMs = -Infinity
  for (const evento of eventos) {
    if (evento.tipo === 'inicio') inicioMs = Math.max(inicioMs, milisegundosDe(evento.ocurridoEn))
  }
  return eventos.some((evento) => evento.tipo === 'regreso_almuerzo' && milisegundosDe(evento.ocurridoEn) >= inicioMs)
}

/** Estado derivado del último evento (por hora real); sin eventos, fuera de jornada. */
export function estadoDesdeEventos(eventos: readonly EventoJornada[]): EstadoJornada {
  let ultimo: EventoJornada | undefined
  let ultimoMs = -Infinity
  for (const evento of eventos) {
    const ms = milisegundosDe(evento.ocurridoEn)
    // Con la misma hora gana el que aparece después en la lista.
    if (ms >= ultimoMs) {
      ultimo = evento
      ultimoMs = ms
    }
  }
  return ultimo ? estadoTras(ultimo.tipo) : 'fuera_de_jornada'
}
