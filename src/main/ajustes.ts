// Ajustes que el usuario cambia desde la ventana: validación y paso desde/hacia config.json. Sin Electron.
import { z } from 'zod'
import type { Ajustes, AjustesVista, PlantillasMensajes, PlantillasVista } from '../preload/tipos'
import { type Config, configPorDefecto } from './configEsquema'
import { LARGO_MAXIMO_MENSAJE } from './controlador'
import { VARIABLES_PLANTILLA } from './plantillas'
import { esPreferenciaDeTema } from './temas'
import { salidaPlaneada } from './tiempo'

const esquemaAjustes = z
  .object({
    horaEntrada: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora de entrada no es válida'),
    jornadaObjetivoHoras: z
      .number('La jornada debe ser un número de horas')
      .min(1, 'La jornada debe ser de al menos 1 hora')
      .max(16, 'La jornada no puede pasar de 16 horas'),
    recorteLunesHoras: z
      .number('El recorte de los lunes debe ser un número de horas')
      .min(0, 'El recorte de los lunes no puede ser negativo')
      .max(8, 'El recorte de los lunes no puede pasar de 8 horas'),
    duracionAlmuerzoMin: z
      .number('El almuerzo debe ser un número de minutos')
      .int('El almuerzo se da en minutos enteros')
      .min(5, 'El almuerzo debe durar al menos 5 minutos')
      .max(240, 'El almuerzo no puede pasar de 240 minutos'),
    regresoAlmuerzoAutomatico: z.boolean(),
    mencionar: z.string().max(80, 'El nombre a mencionar es demasiado largo'),
    respuestasEnHilo: z.boolean(),
    abrirRelojAlIniciar: z.boolean(),
    iniciarConWindows: z.boolean(),
    confirmarInicioAlArrancar: z.boolean(),
    recordarSalida: z.boolean(),
    recordarAlmuerzo: z.boolean(),
    tema: z.string().refine(esPreferenciaDeTema, "El tema no existe")
  })
  .superRefine((ajustes, contexto) => {
    if (ajustes.recorteLunesHoras >= ajustes.jornadaObjetivoHoras) {
      contexto.addIssue({ code: 'custom', message: 'El recorte de los lunes debe ser menor que la jornada' })
    }
    if (salidaPlaneada(ajustes.horaEntrada, ajustes.jornadaObjetivoHoras, ajustes.duracionAlmuerzoMin) === null) {
      contexto.addIssue({ code: 'custom', message: 'Entrada, jornada y almuerzo no caben en el mismo día' })
    }
  })

export type ResultadoValidacion = { ok: true; ajustes: Ajustes } | { ok: false; error: string }

/** Valida lo que llega de la interfaz; devuelve el primer problema en español. */
export function validarAjustes(crudo: unknown): ResultadoValidacion {
  const resultado = esquemaAjustes.safeParse(crudo)
  if (!resultado.success) return { ok: false, error: resultado.error.issues[0]?.message ?? 'Los ajustes no son válidos' }
  return { ok: true, ajustes: { ...resultado.data, mencionar: resultado.data.mencionar.trim() } }
}

export function ajustesDeConfig(config: Config): Ajustes {
  return {
    horaEntrada: config.horario.horaEntrada,
    jornadaObjetivoHoras: config.horario.jornadaObjetivoHoras,
    recorteLunesHoras: config.horario.recorteLunesHoras,
    duracionAlmuerzoMin: config.horario.duracionAlmuerzoMin,
    regresoAlmuerzoAutomatico: config.horario.regresoAlmuerzoAutomatico,
    mencionar: config.teams.mencionar,
    respuestasEnHilo: config.teams.respuestasEnHilo,
    abrirRelojAlIniciar: config.app.abrirRelojAlIniciar,
    iniciarConWindows: config.app.iniciarConWindows,
    confirmarInicioAlArrancar: config.app.confirmarInicioAlArrancar,
    recordarSalida: config.app.recordarSalida,
    recordarAlmuerzo: config.app.recordarAlmuerzo,
    tema: config.app.tema
  }
}

export function vistaDeAjustes(config: Config): AjustesVista {
  return { actuales: ajustesDeConfig(config), porDefecto: ajustesDeConfig(configPorDefecto()) }
}

/**
 * Config con los ajustes aplicados. La hora de salida se recalcula (entrada + jornada + almuerzo)
 * para que la línea del día y la salida planeada sigan al horario nuevo.
 */
export function aplicarAjustes(config: Config, ajustes: Ajustes): Config {
  const horaSalida = salidaPlaneada(ajustes.horaEntrada, ajustes.jornadaObjetivoHoras, ajustes.duracionAlmuerzoMin)
  if (horaSalida === null) throw new RangeError('La jornada no cabe en el día')
  return {
    ...config,
    teams: { ...config.teams, mencionar: ajustes.mencionar, respuestasEnHilo: ajustes.respuestasEnHilo },
    app: {
      ...config.app,
      abrirRelojAlIniciar: ajustes.abrirRelojAlIniciar,
      iniciarConWindows: ajustes.iniciarConWindows,
      confirmarInicioAlArrancar: ajustes.confirmarInicioAlArrancar,
      recordarSalida: ajustes.recordarSalida,
      recordarAlmuerzo: ajustes.recordarAlmuerzo,
      tema: ajustes.tema
    },
    horario: {
      ...config.horario,
      horaEntrada: ajustes.horaEntrada,
      horaSalida,
      jornadaObjetivoHoras: ajustes.jornadaObjetivoHoras,
      recorteLunesHoras: ajustes.recorteLunesHoras,
      duracionAlmuerzoMin: ajustes.duracionAlmuerzoMin,
      regresoAlmuerzoAutomatico: ajustes.regresoAlmuerzoAutomatico
    }
  }
}

// --- Plantillas de los mensajes ---

const NOMBRES_PLANTILLAS: Record<keyof PlantillasMensajes, string> = {
  inicio: 'Iniciar jornada',
  almuerzo: 'Salir a almorzar',
  regresoAlmuerzo: 'Regresar de almuerzo',
  ausencia: 'Ausentarme',
  regreso: 'Regresar',
  fin: 'Finalizar jornada',
  finConRecuperacion: 'Finalizar con tiempo de más'
}

const VARIABLES_CONOCIDAS: readonly string[] = VARIABLES_PLANTILLA.map((variable) => variable.nombre)

/** Primer problema de una plantilla, o null si sirve. */
function problemaDePlantilla(clave: keyof PlantillasMensajes, texto: string): string | null {
  const nombre = NOMBRES_PLANTILLAS[clave]
  if (texto.trim() === '') return `El mensaje de «${nombre}» no puede quedar vacío`
  if (texto.length > LARGO_MAXIMO_MENSAJE) {
    return `El mensaje de «${nombre}» no puede pasar de ${LARGO_MAXIMO_MENSAJE} caracteres`
  }
  for (const [, variable = ''] of texto.matchAll(/{([^{}]*)}/g)) {
    if (!VARIABLES_CONOCIDAS.includes(variable)) return `«${nombre}» usa una variable que no existe: {${variable}}`
  }
  return null
}

const esquemaPlantillas = z.object({
  inicio: z.string(),
  almuerzo: z.string(),
  regresoAlmuerzo: z.string(),
  ausencia: z.string(),
  regreso: z.string(),
  fin: z.string(),
  finConRecuperacion: z.string()
})

export type ResultadoPlantillas = { ok: true; plantillas: PlantillasMensajes } | { ok: false; error: string }

/** Valida lo que llega de la interfaz: textos no vacíos, de largo razonable y solo con variables que existen. */
export function validarPlantillas(crudo: unknown): ResultadoPlantillas {
  const resultado = esquemaPlantillas.safeParse(crudo)
  if (!resultado.success) return { ok: false, error: 'Las plantillas no son válidas' }
  for (const clave of Object.keys(NOMBRES_PLANTILLAS) as (keyof PlantillasMensajes)[]) {
    const problema = problemaDePlantilla(clave, resultado.data[clave])
    if (problema) return { ok: false, error: problema }
  }
  return { ok: true, plantillas: resultado.data }
}

export function vistaDePlantillas(config: Config): PlantillasVista {
  return { actuales: { ...config.plantillas }, porDefecto: { ...configPorDefecto().plantillas } }
}

export function aplicarPlantillas(config: Config, plantillas: PlantillasMensajes): Config {
  return { ...config, plantillas: { ...plantillas } }
}
