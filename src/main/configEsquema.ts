// Esquema y valores por defecto de config.json. No importa nada de Electron para poder probarlo con Vitest.
import { z } from 'zod'

const horaHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Se espera el formato HH:MM')

/** Versión actual del formato de config.json (ver migrarConfig). */
export const VERSION_CONFIG = 4

/**
 * Variables: {saludo} es "Buenos días" o "Buenas tardes" según la hora; {sol} es 🌅 por la mañana y 🌇 por la tarde;
 * {mencion} es "@" más teams.mencionar; {tiempo} (solo en finConRecuperacion) es el tiempo trabajado de más.
 */
const PLANTILLAS_POR_DEFECTO = {
  inicio: '{sol} {saludo}, inicio mi jornada {mencion}',
  almuerzo: '🍲 {saludo}, inicio mi hora de almuerzo {mencion}',
  regresoAlmuerzo: '🍽️ {saludo}, termino mi hora de almuerzo {mencion}',
  ausencia: '⏸️ {saludo}, me ausento un momento {mencion}',
  regreso: '▶️ {saludo}, regreso {mencion}',
  fin: '{sol} {saludo}, termino mi jornada {mencion}',
  finConRecuperacion: '⏱️ {saludo}, termino mi jornada y recupero {tiempo} de hoy {mencion}'
} as const

/** Las plantillas por defecto de la v3 (sin emojis), para que migrarConfig reconozca las que nadie editó. */
const PLANTILLAS_V3 = {
  inicio: '{saludo}, inicio mi jornada {mencion}',
  almuerzo: '{saludo}, inicio mi hora de almuerzo {mencion}',
  regresoAlmuerzo: '{saludo}, termino mi hora de almuerzo {mencion}',
  ausencia: '{saludo}, me ausento un momento {mencion}',
  regreso: '{saludo}, regreso {mencion}',
  fin: '{saludo}, termino mi jornada {mencion}',
  finConRecuperacion: '{saludo}, termino mi jornada y recupero {tiempo} de hoy {mencion}'
} as const

/** Las plantillas por defecto de la v2, para que migrarConfig reconozca las que nadie editó. */
const PLANTILLAS_V2 = {
  inicio: '🟢 Inicio de jornada – {hora}',
  almuerzo: '🍽️ Salgo a almorzar – {hora}',
  regresoAlmuerzo: '🔙 Regreso de almuerzo – {hora}',
  ausencia: '⏸️ Me ausento – {hora}. {motivo}',
  regreso: '▶️ Regreso – {hora}',
  fin: '🔴 Fin de jornada – {hora}'
} as const

export const esquemaConfig = z.object({
  version: z.number().int().default(VERSION_CONFIG),
  teams: z
    .object({
      metodo: z.enum(['graph', 'webhook']).default('graph'),
      /** ID de aplicación (cliente) de la app registrada en Microsoft Entra ID. */
      clientId: z.string().default(''),
      /** Inquilino de Entra ID: "organizations" (cualquier cuenta de trabajo), "common" o el ID/dominio de la empresa. */
      tenantId: z.string().default('organizations'),
      teamId: z.string().default(''),
      /** Nombre del equipo elegido, solo para mostrarlo sin consultar a Graph. */
      nombreEquipo: z.string().default(''),
      channelId: z.string().default(''),
      nombreCanal: z.string().default(''),
      /** Persona a la que mencionan los mensajes (la variable {mencion}); vacío = sin mención. */
      mencionar: z.string().default('Angela Ortiz Peña'),
      /** Cada inicio de jornada abre un hilo en el canal y los mensajes que le siguen (hasta el fin) responden a él. */
      respuestasEnHilo: z.boolean().default(true)
    })
    .prefault({}),
  horario: z
    .object({
      horaEntrada: horaHHMM.default('08:00'),
      // 8:00 + 10 h netas + 1 h de almuerzo = 19:00 (los lunes se recorta, ver recorteLunesHoras).
      horaSalida: horaHHMM.default('19:00'),
      /** Horas netas por jornada, sin contar el almuerzo. */
      jornadaObjetivoHoras: z.number().positive().max(24).default(10),
      /** Horas que se restan a la jornada (y a la hora de salida) los lunes. */
      recorteLunesHoras: z.number().min(0).max(24).default(1),
      duracionAlmuerzoMin: z.number().int().positive().default(60),
      /** Al salir a almorzar se programa solo el regreso para dentro de `duracionAlmuerzoMin` (se puede marcar antes a mano). */
      regresoAlmuerzoAutomatico: z.boolean().default(true),
      descontarAusencias: z.boolean().default(true)
    })
    .prefault({}),
  plantillas: z
    .object({
      inicio: z.string().default(PLANTILLAS_POR_DEFECTO.inicio),
      almuerzo: z.string().default(PLANTILLAS_POR_DEFECTO.almuerzo),
      regresoAlmuerzo: z.string().default(PLANTILLAS_POR_DEFECTO.regresoAlmuerzo),
      ausencia: z.string().default(PLANTILLAS_POR_DEFECTO.ausencia),
      regreso: z.string().default(PLANTILLAS_POR_DEFECTO.regreso),
      fin: z.string().default(PLANTILLAS_POR_DEFECTO.fin),
      /** Se usa en lugar de `fin` cuando se trabajó más que la meta del día ({tiempo} = lo trabajado de más). */
      finConRecuperacion: z.string().default(PLANTILLAS_POR_DEFECTO.finConRecuperacion)
    })
    .prefault({}),
  app: z
    .object({
      iniciarConWindows: z.boolean().default(true),
      confirmarInicioAlArrancar: z.boolean().default(true),
      abrirRelojAlIniciar: z.boolean().default(true),
      siempreVisible: z.boolean().default(false),
      sonidos: z.boolean().default(true),
      /** Avisar si pasó la hora de salida y la jornada sigue abierta. */
      recordarSalida: z.boolean().default(true),
      /** Avisar si el almuerzo se pasó de la duración configurada. */
      recordarAlmuerzo: z.boolean().default(true),
      /** "auto" (según la fecha), "clasico" o el id de un tema de temas.ts; un valor desconocido se trata como clásico. */
      tema: z.string().default("auto")
    })
    .prefault({})
})

export type Config = z.infer<typeof esquemaConfig>

/** Devuelve la configuración completa; cualquier campo ausente o inválido se rellena con su valor por defecto. */
export function configPorDefecto(): Config {
  return esquemaConfig.parse({})
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function deV1aV2(config: Record<string, unknown>): Record<string, unknown> {
  let horario = config['horario']
  if (esObjeto(horario) && horario['jornadaObjetivoHoras'] === 8 && horario['horaSalida'] === '17:00') {
    const { jornadaObjetivoHoras: _horas, horaSalida: _salida, ...resto } = horario
    horario = resto
  }
  return { ...config, ...(horario === undefined ? {} : { horario }), version: 2 }
}

/** Quita las plantillas que siguen idénticas a las `antiguas` (nadie las editó); las editadas a mano se respetan. */
function quitarPlantillasSinEditar(
  config: Record<string, unknown>,
  antiguas: Readonly<Record<string, string>>,
  version: number
): Record<string, unknown> {
  let plantillas = config['plantillas']
  if (esObjeto(plantillas)) {
    const conservadas = { ...plantillas }
    for (const [clave, antigua] of Object.entries(antiguas)) {
      if (conservadas[clave] === antigua) delete conservadas[clave]
    }
    plantillas = conservadas
  }
  return { ...config, ...(plantillas === undefined ? {} : { plantillas }), version }
}

/**
 * Actualiza un config.json guardado con una versión anterior, antes de validarlo. Aplica los pasos en cadena:
 * - v1 → v2: la jornada pasó de 8 h (salida 17:00) a 10 h (salida 19:00). Si el archivo todavía tiene
 *   exactamente esos valores antiguos se quitan para que rijan los nuevos.
 * - v2 → v3: los mensajes pasaron a saludar y mencionar a una persona. Las plantillas que sigan iguales a
 *   las de la v2 se quitan para que rijan las nuevas.
 * - v3 → v4: los mensajes ganaron un emoji. Lo mismo con las plantillas iguales a las de la v3.
 * En todos los casos nadie pudo haber elegido esos valores (aún no hay pantalla de configuración); cualquier
 * otro valor se respeta, y al quedar en la versión actual no se toca más.
 */
export function migrarConfig(crudo: unknown): unknown {
  if (!esObjeto(crudo)) return crudo
  let config = crudo
  let version = typeof config['version'] === 'number' ? config['version'] : 1
  if (version < 2) {
    config = deV1aV2(config)
    version = 2
  }
  if (version < 3) {
    config = quitarPlantillasSinEditar(config, PLANTILLAS_V2, 3)
    version = 3
  }
  if (version < 4) config = quitarPlantillasSinEditar(config, PLANTILLAS_V3, 4)
  return config
}
