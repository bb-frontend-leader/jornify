// Cálculo del tiempo trabajado y restante. Sin dependencias de Electron.
// La interfaz también importa este módulo para avanzar el reloj sin pedir datos al proceso principal.
import { type EstadoJornada, type EventoJornada, estadoDesdeEventos, estadoTras } from './estado'
import { milisegundosDe } from './fechas'

export interface OpcionesTiempo {
  jornadaObjetivoHoras: number
  /** Si es true, el tiempo ausente no cuenta como trabajado. */
  descontarAusencias: boolean
}

/** Lo que se deriva del tiempo trabajado y el objetivo en un instante dado. */
export interface ProgresoJornada {
  objetivoMs: number
  /** Lo que falta para la jornada objetivo; 0 si ya se superó. */
  restanteMs: number
  /** Horas extra: lo trabajado por encima del objetivo; 0 si aún no se llega. */
  extraMs: number
  /** Avance de 0 a 1 (se queda en 1 al superar el objetivo). */
  progreso: number
  /** `ahora` más el tiempo que falta; null si la jornada no está en curso. */
  salidaEstimada: Date | null
}

export interface ResultadoTiempo extends ProgresoJornada {
  estado: EstadoJornada
  /** Tiempo trabajado neto hasta `ahora` (sin almuerzo y, según la opción, sin ausencias). */
  trabajadoMs: number
  /** ¿Está avanzando el tiempo trabajado en este estado? */
  corriendo: boolean
}

const MS_POR_HORA = 3_600_000

/** ¿Suma tiempo trabajado mientras la jornada está en este estado? */
export function estaCorriendo(estado: EstadoJornada, opciones: Pick<OpcionesTiempo, 'descontarAusencias'>): boolean {
  return estado === 'trabajando' || (estado === 'ausente' && !opciones.descontarAusencias)
}

/** Restante, horas extra, progreso y salida estimada a partir del tiempo trabajado. */
export function derivarProgreso(
  trabajadoMs: number,
  jornadaObjetivoHoras: number,
  estado: EstadoJornada,
  ahoraMs: number
): ProgresoJornada {
  const objetivoMs = jornadaObjetivoHoras * MS_POR_HORA
  const restanteMs = Math.max(0, objetivoMs - trabajadoMs)
  return {
    objetivoMs,
    restanteMs,
    extraMs: Math.max(0, trabajadoMs - objetivoMs),
    progreso: objetivoMs > 0 ? Math.min(1, trabajadoMs / objetivoMs) : 1,
    salidaEstimada: estado === 'fuera_de_jornada' ? null : new Date(ahoraMs + restanteMs)
  }
}

/**
 * Calcula el tiempo de un día a partir de sus eventos.
 * Cada tramo entre dos eventos se asigna al estado en que dejó la jornada el primero;
 * el último tramo llega hasta `ahora` si la jornada sigue abierta.
 */
export function calcularTiempo(
  eventos: readonly EventoJornada[],
  ahora: Date,
  opciones: OpcionesTiempo
): ResultadoTiempo {
  const ordenados = eventos
    .map((evento) => ({ evento, ms: milisegundosDe(evento.ocurridoEn) }))
    .sort((a, b) => a.ms - b.ms)
  const ahoraMs = ahora.getTime()
  const estado = estadoDesdeEventos(eventos)

  let trabajadoMs = 0
  ordenados.forEach(({ evento, ms }, indice) => {
    const siguiente = ordenados[indice + 1]
    const finTramo = siguiente ? siguiente.ms : ahoraMs
    if (estaCorriendo(estadoTras(evento.tipo), opciones)) trabajadoMs += Math.max(0, finTramo - ms)
  })

  return {
    estado,
    trabajadoMs,
    corriendo: estaCorriendo(estado, opciones),
    ...derivarProgreso(trabajadoMs, opciones.jornadaObjetivoHoras, estado, ahoraMs)
  }
}

/** Duración como HH:MM:SS (las horas pueden pasar de 99). Los milisegundos sobrantes se descartan. */
export function formatearDuracion(ms: number): string {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000))
  const horas = Math.floor(totalSegundos / 3600)
  const minutos = Math.floor((totalSegundos % 3600) / 60)
  const segundos = totalSegundos % 60
  return [horas, minutos, segundos].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Tramo de la jornada en un estado activo (la línea del día los dibuja como segmentos). */
export interface TramoJornada {
  estado: Exclude<EstadoJornada, 'fuera_de_jornada'>
  desdeMs: number
  /** null mientras el tramo sigue abierto (llega hasta "ahora"). */
  hastaMs: number | null
}

/** Tramos trabajando / en almuerzo / ausente del día, en orden cronológico. Fuera de jornada no genera tramo. */
export function calcularTramos(eventos: readonly EventoJornada[]): TramoJornada[] {
  const ordenados = eventos
    .map((evento) => ({ evento, ms: milisegundosDe(evento.ocurridoEn) }))
    .sort((a, b) => a.ms - b.ms)
  const tramos: TramoJornada[] = []
  ordenados.forEach(({ evento, ms }, indice) => {
    const estado = estadoTras(evento.tipo)
    if (estado === 'fuera_de_jornada') return
    tramos.push({ estado, desdeMs: ms, hastaMs: ordenados[indice + 1]?.ms ?? null })
  })
  return tramos
}

export interface EscalaDia {
  inicioMs: number
  finMs: number
}

const MS_HORA = 3_600_000

/**
 * Rango horario que muestra la línea del día: desde la hora de entrada (o el primer tramo, si fue antes)
 * hasta la hora de salida (o la salida estimada o "ahora", si pasan de ahí), redondeado a horas enteras.
 */
export function escalaDelDia(
  tramos: readonly TramoJornada[],
  horario: { entradaMs: number; salidaMs: number },
  ahoraMs: number,
  salidaEstimadaMs: number | null
): EscalaDia {
  const primero = tramos[0]?.desdeMs ?? Infinity
  const inicio = new Date(Math.min(horario.entradaMs, primero))
  inicio.setMinutes(0, 0, 0)
  const fin = new Date(Math.max(horario.salidaMs, salidaEstimadaMs ?? 0, ahoraMs))
  if (fin.getMinutes() !== 0 || fin.getSeconds() !== 0 || fin.getMilliseconds() !== 0) {
    fin.setHours(fin.getHours() + 1, 0, 0, 0)
  }
  // Un mínimo de 4 horas evita una cinta demasiado corta si el horario es raro.
  return { inicioMs: inicio.getTime(), finMs: Math.max(fin.getTime(), inicio.getTime() + 4 * MS_HORA) }
}

/** Horas enteras (en ms) para rotular la cinta, con un paso que deja como máximo `maxMarcas`. */
export function marcasDeHora(escala: EscalaDia, maxMarcas = 5): number[] {
  const horas = Math.round((escala.finMs - escala.inicioMs) / MS_HORA)
  let paso = 1
  while (Math.floor(horas / paso) + 1 > maxMarcas) paso++
  const marcas: number[] = []
  for (let h = 0; h <= horas; h += paso) marcas.push(escala.inicioMs + h * MS_HORA)
  return marcas
}

/**
 * Hora de salida planeada ("HH:MM"): entrada + jornada neta + almuerzo.
 * Devuelve null si no cabe en el mismo día (llegaría a las 24:00 o después) o si la entrada no es válida.
 */
export function salidaPlaneada(horaEntrada: string, jornadaHoras: number, almuerzoMin: number): string | null {
  const partes = /^([0-2][0-9]):([0-5][0-9])$/.exec(horaEntrada)
  if (!partes || !Number.isFinite(jornadaHoras) || !Number.isFinite(almuerzoMin)) return null
  const total = Number(partes[1]) * 60 + Number(partes[2]) + Math.round(jornadaHoras * 60) + Math.round(almuerzoMin)
  if (total >= 24 * 60) return null
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export interface HorarioSemanal {
  jornadaObjetivoHoras: number
  recorteLunesHoras: number
}

/** Horas que se recortan a la jornada de ese día: `recorteLunesHoras` los lunes y nada el resto de la semana. */
export function recorteDelDia(fecha: Date, recorteLunesHoras: number): number {
  return fecha.getDay() === 1 ? recorteLunesHoras : 0
}

/** Horas netas (sin almuerzo) que hay que trabajar ese día; nunca menos de 0. */
export function jornadaObjetivoDelDia(horario: HorarioSemanal, fecha: Date): number {
  return Math.max(0, horario.jornadaObjetivoHoras - recorteDelDia(fecha, horario.recorteLunesHoras))
}
