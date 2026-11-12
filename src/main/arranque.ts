// Qué hacer al arrancar la app y cómo se activa el inicio con Windows. Sin dependencias de Electron.
import type { Config } from './configEsquema'
import type { EstadoJornada } from './estado'
import type { Evento } from './historial'

/**
 * ¿Hay que preguntar "¿Registrar inicio de jornada?"? Solo si la opción está activa y hoy todavía no hay nada
 * registrado: a mitad de jornada se retoma el estado, y si ya se finalizó hoy no se vuelve a ofrecer.
 */
export function debePreguntarInicio(config: Config, estado: EstadoJornada, eventosDeHoy: readonly Evento[]): boolean {
  return config.app.confirmarInicioAlArrancar && estado === 'fuera_de_jornada' && eventosDeHoy.length === 0
}

export interface DependenciasArranque {
  config: Config
  estado: EstadoJornada
  eventosDeHoy: readonly Evento[]
  /** Pregunta a la persona; true = registrar el inicio. */
  preguntar: () => Promise<boolean>
  /** Registra el inicio de la jornada (publica en Teams). */
  registrarInicio: () => Promise<unknown>
  registrarError?: (mensaje: string, error: unknown) => void
}

export type ResultadoArranque = 'no_pregunta' | 'registrado' | 'rechazado' | 'fallo'

/** Nunca publica sin confirmación: solo registra el inicio si la persona lo acepta. */
export async function revisarInicioAlArrancar(dependencias: DependenciasArranque): Promise<ResultadoArranque> {
  const { config, estado, eventosDeHoy } = dependencias
  if (!debePreguntarInicio(config, estado, eventosDeHoy)) return 'no_pregunta'
  try {
    if (!(await dependencias.preguntar())) return 'rechazado'
    await dependencias.registrarInicio()
    return 'registrado'
  } catch (error) {
    dependencias.registrarError?.('No se pudo registrar el inicio al arrancar', error)
    return 'fallo'
  }
}

/** Argumento con el que Windows lanza la app al iniciar sesión (así se distingue de abrirla a mano). */
export const ARGUMENTO_INICIO_AUTOMATICO = '--inicio-automatico'

export interface AdaptadorInicioWindows {
  /** Instalada: en desarrollo se registraría electron.exe, que no es la app. */
  empaquetada: boolean
  leer: () => boolean
  escribir: (abrirAlIniciar: boolean) => void
}

export type ResultadoInicioWindows = 'aplicado' | 'sin_cambios' | 'omitido_en_desarrollo'

/** Registra o quita la app del inicio de Windows, solo si hace falta y solo en la app instalada. */
export function aplicarInicioConWindows(activado: boolean, adaptador: AdaptadorInicioWindows): ResultadoInicioWindows {
  if (!adaptador.empaquetada) return 'omitido_en_desarrollo'
  if (adaptador.leer() === activado) return 'sin_cambios'
  adaptador.escribir(activado)
  return 'aplicado'
}
