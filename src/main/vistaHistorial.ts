// Historial de una semana listo para la interfaz: los siete días con sus eventos y totales. Sin dependencias de Electron.
import type { DiaHistorial, EventoHistorial, SemanaHistorial } from '../preload/tipos'
import type { Config } from './configEsquema'
import { etiquetaDeAccion } from './estado'
import { milisegundosDe } from './fechas'
import type { Evento } from './historial'
import { construirReporte, rangoDeReporte, textoDeFecha } from './reporte'
import { jornadaObjetivoDelDia } from './tiempo'

const HORA_MS = 3_600_000

function eventoVista(evento: Evento): EventoHistorial {
  return {
    id: evento.id,
    tipo: evento.tipo,
    etiqueta: etiquetaDeAccion(evento.tipo),
    ocurridoMs: milisegundosDe(evento.ocurridoEn),
    motivo: evento.motivo,
    mensaje: evento.mensaje,
    estadoEnvio: evento.estadoEnvio,
    intentos: evento.intentos
  }
}

/** Primer y último instante (inclusive/exclusivo) de la semana que contiene la fecha. */
export function rangoDeSemana(fecha: Date): { desde: Date; hasta: Date } {
  const resultado = rangoDeReporte('semana', fecha)
  if (!resultado.ok) throw new RangeError(resultado.error)
  return resultado.rango
}

/**
 * Historial de la semana (lunes a domingo) que contiene `fecha`. `eventos` son los de esa semana, en cualquier orden.
 * Los días sin registros se incluyen igual (con su meta) para que la semana se vea completa; los totales solo suman
 * los días con registros, igual que el reporte de Excel.
 */
export function vistaDeSemana(eventos: readonly Evento[], fecha: Date, ahora: Date, config: Config): SemanaHistorial {
  const rango = rangoDeSemana(fecha)
  const reporte = construirReporte(eventos, rango, ahora, config)
  const resumenes = new Map(reporte.dias.map((dia) => [textoDeFecha(dia.fecha), dia]))

  const vistas = new Map<string, EventoHistorial[]>()
  for (const evento of reporte.eventos) {
    const clave = textoDeFecha(new Date(milisegundosDe(evento.ocurridoEn)))
    vistas.set(clave, [...(vistas.get(clave) ?? []), eventoVista(evento)])
  }

  const dias: DiaHistorial[] = []
  for (let i = 0; i < 7; i++) {
    const dia = new Date(rango.desde.getFullYear(), rango.desde.getMonth(), rango.desde.getDate() + i)
    const clave = textoDeFecha(dia)
    const resumen = resumenes.get(clave)
    dias.push({
      fecha: clave,
      hayRegistros: resumen !== undefined,
      entradaMs: resumen?.entrada?.getTime() ?? null,
      salidaMs: resumen?.salida?.getTime() ?? null,
      almuerzoMs: resumen?.almuerzoMs ?? 0,
      ausenteMs: resumen?.ausenteMs ?? 0,
      trabajadoMs: resumen?.trabajadoMs ?? 0,
      objetivoMs: resumen?.objetivoMs ?? jornadaObjetivoDelDia(config.horario, dia) * HORA_MS,
      observacion: resumen?.observacion ?? '',
      eventos: vistas.get(clave) ?? []
    })
  }

  return {
    desde: textoDeFecha(rango.desde),
    hasta: dias[6]?.fecha ?? textoDeFecha(rango.desde),
    hoy: textoDeFecha(ahora),
    dias,
    totales: reporte.totales
  }
}
