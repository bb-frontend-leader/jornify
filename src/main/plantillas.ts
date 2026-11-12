// Formateo de los mensajes que se publican en el canal. Sin dependencias de Electron.
import type { Config } from './configEsquema'
import type { TipoEvento } from './estado'

export interface DatosMensaje {
  /** Momento real del evento (no el del envío). */
  fecha: Date
  nombre?: string
  motivo?: string
  /** Persona a la que se menciona, sin la arroba (p. ej. "Angela Ortiz Peña"). */
  mencion?: string
  /** Tiempo trabajado por encima de la meta del día. Solo importa al finalizar la jornada. */
  recuperadoMs?: number
}

/** Desde cuánto tiempo extra el fin de jornada se anuncia como recuperación (1 minuto). */
export const RECUPERACION_MINIMA_MS = 60_000

type Plantillas = Config['plantillas']

/** Variables que se pueden usar en una plantilla, con lo que significan (la interfaz las ofrece como atajos). */
export const VARIABLES_PLANTILLA = [
  { nombre: 'saludo', ayuda: 'Buenos días o Buenas tardes' },
  { nombre: 'sol', ayuda: 'amanecer 🌅 o atardecer 🌇' },
  { nombre: 'hora', ayuda: 'hora del evento' },
  { nombre: 'fecha', ayuda: 'fecha del evento' },
  { nombre: 'nombre', ayuda: 'tu nombre' },
  { nombre: 'mencion', ayuda: '@ más la persona a mencionar' },
  { nombre: 'tiempo', ayuda: 'tiempo de más (solo al terminar con recuperación)' },
  { nombre: 'motivo', ayuda: 'motivo de la ausencia' }
] as const

const CLAVE_PLANTILLA: Record<TipoEvento, keyof Plantillas> = {
  inicio: 'inicio',
  almuerzo: 'almuerzo',
  regreso_almuerzo: 'regresoAlmuerzo',
  ausencia: 'ausencia',
  regreso: 'regreso',
  fin: 'fin'
}

const LOCALE = 'es-CO'

// Intl separa la hora y "a. m." con espacios no separables; se normalizan a espacios normales.
function normalizarEspacios(texto: string): string {
  return texto.replace(/[  ]/g, ' ')
}

/** Hora en formato 12 h, p. ej. "8:02 a. m.". */
export function formatearHora(fecha: Date): string {
  return normalizarEspacios(
    new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', hour12: true }).format(fecha)
  )
}

/** Fecha larga, p. ej. "6 de noviembre de 2026". */
export function formatearFecha(fecha: Date): string {
  return normalizarEspacios(new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long' }).format(fecha))
}

/** Saludo según la hora del día: "Buenos días" hasta antes de las 12:00 y "Buenas tardes" desde entonces. */
export function saludoDelDia(fecha: Date): string {
  return fecha.getHours() < 12 ? 'Buenos días' : 'Buenas tardes'
}

/** Emoji del sol según la hora: amanecer (🌅) antes de las 12:00 y atardecer (🌇) desde entonces. */
export function emojiDelSol(fecha: Date): string {
  return fecha.getHours() < 12 ? '🌅' : '🌇'
}

/** Duración en palabras, p. ej. "45 minutos", "1 hora" o "1 hora y 30 minutos" (se descartan los segundos). */
export function formatearDuracionEnPalabras(ms: number): string {
  const totalMinutos = Math.max(0, Math.floor(ms / 60_000))
  const horas = Math.floor(totalMinutos / 60)
  const minutos = totalMinutos % 60
  const partes: string[] = []
  if (horas > 0) partes.push(horas === 1 ? '1 hora' : `${horas} horas`)
  if (minutos > 0 || horas === 0) partes.push(minutos === 1 ? '1 minuto' : `${minutos} minutos`)
  return partes.join(' y ')
}

/**
 * Sustituye {saludo}, {sol}, {hora}, {fecha}, {nombre}, {mencion}, {tiempo} y {motivo} en una plantilla.
 * - {mencion} es "@" más el nombre de la persona mencionada; sin nombre queda vacío.
 * - Si no hay motivo, se quita {motivo} junto con la puntuación y los espacios que lo preceden.
 * - Un punto de la plantilla pegado a una variable que ya termina en punto ("p. m.") no se duplica.
 * - Las variables desconocidas se dejan tal cual y el texto sustituido no se vuelve a interpretar.
 */
export function formatearMensaje(plantilla: string, datos: DatosMensaje): string {
  const mencion = datos.mencion?.trim().replace(/^@+/, '')
  const valores: Record<string, string> = {
    saludo: saludoDelDia(datos.fecha),
    sol: emojiDelSol(datos.fecha),
    hora: formatearHora(datos.fecha),
    fecha: formatearFecha(datos.fecha),
    nombre: datos.nombre?.trim() ?? '',
    mencion: mencion ? `@${mencion}` : '',
    tiempo: formatearDuracionEnPalabras(datos.recuperadoMs ?? 0),
    motivo: datos.motivo?.trim() ?? ''
  }

  const base = valores['motivo'] ? plantilla : plantilla.replace(/[\s.,;:–-]*\{motivo\}/g, '')

  return base
    .replace(
      /\{(saludo|sol|hora|fecha|nombre|mencion|tiempo|motivo)\}(\.?)/g,
      (_coincidencia, variable: string, punto: string) => {
        const valor = valores[variable] ?? ''
        return punto && !valor.endsWith('.') ? `${valor}.` : valor
      }
    )
    .replace(/ {2,}/g, ' ')
    .trim()
}

/**
 * Mensaje final para un tipo de evento usando las plantillas de la configuración.
 * Al finalizar con tiempo extra (`recuperadoMs` de al menos un minuto) se usa la plantilla de recuperación.
 */
export function construirMensaje(plantillas: Plantillas, tipo: TipoEvento, datos: DatosMensaje): string {
  const recupera = tipo === 'fin' && (datos.recuperadoMs ?? 0) >= RECUPERACION_MINIMA_MS
  return formatearMensaje(recupera ? plantillas.finConRecuperacion : plantillas[CLAVE_PLANTILLA[tipo]], datos)
}

/** Hora entera para rotular ejes, p. ej. "8 a. m.". */
export function formatearHoraEntera(ms: number): string {
  return normalizarEspacios(new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', hour12: true }).format(new Date(ms)))
}
