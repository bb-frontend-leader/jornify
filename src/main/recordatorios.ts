// Recordatorios de la jornada: aviso si pasó la hora de salida sin finalizar y si el almuerzo se pasó.
// Sin dependencias de Electron: el aviso se entrega con una función inyectada (en la app, una notificación de Windows).
import type { Config } from './configEsquema'
import { estadoDesdeEventos } from './estado'
import { horaDelDia, milisegundosDe } from './fechas'
import type { Evento, Historial } from './historial'
import { formatearDuracionEnPalabras, formatearHora } from './plantillas'
import { recorteDelDia } from './tiempo'

/**
 * Margen tras la duración del almuerzo antes de avisar. Con el regreso automático activado el `Programador` marca el
 * regreso justo a esa hora; con este margen ya habrá cambiado el estado y no hay aviso (solo avisa si no se pudo marcar).
 */
export const GRACIA_ALMUERZO_MS = 60_000

/** Un temporizador no admite más de ~24,8 días; se vuelve a calcular mucho antes. */
const ESPERA_MAXIMA_MS = 6 * 3_600_000

export type TipoAviso = 'salida' | 'almuerzo'

export interface Aviso {
  /** Identifica el aviso para no repetirlo ("salida-2026-11-12", "almuerzo-17"). */
  clave: string
  tipo: TipoAviso
  titulo: string
  cuerpo: string
}

export interface RecordatorioPendiente {
  clave: string
  tipo: TipoAviso
  /** Cuándo toca avisar (ms desde la época). */
  cuandoMs: number
  /** Hora de salida planeada (salida) o inicio del almuerzo (almuerzo), en ms: sirve para redactar el aviso. */
  referenciaMs: number
}

const dosDigitos = (n: number): string => String(n).padStart(2, '0')
const claveDeFecha = (f: Date): string => `${f.getFullYear()}-${dosDigitos(f.getMonth() + 1)}-${dosDigitos(f.getDate())}`

/** Hora de salida planeada de ese día (los lunes, con el recorte), como en el reloj. */
export function salidaPlaneadaDelDia(dia: Date, config: Config): Date {
  const recorteMs = recorteDelDia(dia, config.horario.recorteLunesHoras) * 3_600_000
  return new Date(horaDelDia(dia, config.horario.horaSalida).getTime() - recorteMs)
}

/**
 * Recordatorios que todavía pueden hacer falta, a partir de los eventos del día (en orden):
 * - Salida: la jornada sigue abierta y empezó antes de la hora de salida (quien arranca ya pasada la hora, recuperando
 *   tiempo, no recibe el aviso). Uno por día.
 * - Almuerzo: se está almorzando y ya pasó la duración configurada (más `GRACIA_ALMUERZO_MS`). Uno por salida a almorzar.
 */
export function calcularRecordatorios(eventos: readonly Evento[], ahora: Date, config: Config): RecordatorioPendiente[] {
  if (estadoDesdeEventos(eventos) === 'fuera_de_jornada') return []
  const pendientes: RecordatorioPendiente[] = []

  const inicio = [...eventos].reverse().find((evento) => evento.tipo === 'inicio')
  if (config.app.recordarSalida && inicio) {
    const salida = salidaPlaneadaDelDia(ahora, config).getTime()
    if (milisegundosDe(inicio.ocurridoEn) < salida) {
      pendientes.push({ clave: `salida-${claveDeFecha(ahora)}`, tipo: 'salida', cuandoMs: salida, referenciaMs: salida })
    }
  }

  const ultimo = eventos[eventos.length - 1]
  if (config.app.recordarAlmuerzo && ultimo?.tipo === 'almuerzo') {
    const inicioAlmuerzo = milisegundosDe(ultimo.ocurridoEn)
    pendientes.push({
      clave: `almuerzo-${ultimo.id}`,
      tipo: 'almuerzo',
      cuandoMs: inicioAlmuerzo + config.horario.duracionAlmuerzoMin * 60_000 + GRACIA_ALMUERZO_MS,
      referenciaMs: inicioAlmuerzo
    })
  }
  return pendientes
}

/** Redacta el aviso con lo que falta saber al momento de darlo. */
export function redactarAviso(pendiente: RecordatorioPendiente, ahora: Date, config: Config): Aviso {
  if (pendiente.tipo === 'salida') {
    return {
      clave: pendiente.clave,
      tipo: 'salida',
      titulo: 'Ya pasó tu hora de salida',
      cuerpo: `Eran las ${formatearHora(new Date(pendiente.referenciaMs))} y tu jornada sigue abierta. Abre el reloj para finalizarla.`
    }
  }
  const llevaMs = Math.max(0, ahora.getTime() - pendiente.referenciaMs)
  const previsto = formatearDuracionEnPalabras(config.horario.duracionAlmuerzoMin * 60_000)
  return {
    clave: pendiente.clave,
    tipo: 'almuerzo',
    titulo: 'Tu almuerzo ya se pasó',
    cuerpo: `Llevas ${formatearDuracionEnPalabras(llevaMs)} de almuerzo y estaban previstos ${previsto}. Abre el reloj para regresar.`
  }
}

export interface DependenciasRecordatorios {
  historial: Pick<Historial, 'eventosDelDia'>
  obtenerConfig: () => Config
  /** Entrega el aviso a la persona (notificación de Windows). */
  avisar: (aviso: Aviso) => void
  ahora?: () => Date
  registrarError?: (mensaje: string, error: unknown) => void
}

/** Vigila la jornada con un solo temporizador que apunta al próximo aviso (sin sondeo). */
export class Recordatorios {
  private readonly ahora: () => Date
  private readonly avisados = new Set<string>()
  private temporizador: ReturnType<typeof setTimeout> | null = null
  private activo = false

  constructor(private readonly dependencias: DependenciasRecordatorios) {
    this.ahora = dependencias.ahora ?? (() => new Date())
  }

  iniciar(): void {
    this.activo = true
    this.revisar()
  }

  detener(): void {
    this.activo = false
    this.apagar()
  }

  /**
   * Da los avisos que ya tocan y apunta el temporizador al siguiente. Se llama al arrancar y cada vez que algo cambia:
   * una acción, los ajustes, el cambio de día o el despertar del equipo.
   */
  revisar(): void {
    if (!this.activo) return
    this.apagar()
    const ahora = this.ahora()
    const config = this.dependencias.obtenerConfig()
    const pendientes = calcularRecordatorios(this.dependencias.historial.eventosDelDia(ahora), ahora, config).filter(
      (pendiente) => !this.avisados.has(pendiente.clave)
    )

    for (const pendiente of pendientes) {
      if (pendiente.cuandoMs > ahora.getTime()) continue
      this.avisados.add(pendiente.clave)
      try {
        this.dependencias.avisar(redactarAviso(pendiente, ahora, config))
      } catch (error) {
        this.dependencias.registrarError?.('No se pudo mostrar el recordatorio', error)
      }
    }

    const siguiente = pendientes.filter((p) => p.cuandoMs > ahora.getTime()).map((p) => p.cuandoMs)
    if (siguiente.length > 0) {
      const espera = Math.min(Math.min(...siguiente) - ahora.getTime(), ESPERA_MAXIMA_MS)
      this.temporizador = setTimeout(() => this.revisar(), Math.max(espera, 1_000))
      this.temporizador.unref?.()
    }
  }

  private apagar(): void {
    if (this.temporizador) clearTimeout(this.temporizador)
    this.temporizador = null
  }
}
