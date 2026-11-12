// Datos del reporte de jornadas: rangos de fechas y resumen por día. Sin dependencias de Electron ni del libro de Excel.
// La interfaz importa este módulo para mostrar el rango elegido, así que solo usa módulos puros.
import type { Config } from './configEsquema'
import { type EventoJornada, ETIQUETAS_ESTADO } from './estado'
import { milisegundosDe, limitesDelDia } from './fechas'
import type { Evento } from './historial'
import { calcularTiempo, calcularTramos, jornadaObjetivoDelDia } from './tiempo'

export type TipoRango = 'hoy' | 'semana' | 'mes' | 'personalizado'

/** Rango de días locales: `desde` inclusive y `hasta` exclusivo, ambos a medianoche. */
export interface Rango {
  desde: Date
  hasta: Date
}

export interface FechasPersonalizadas {
  /** "YYYY-MM-DD", inclusive. */
  desde: string
  /** "YYYY-MM-DD", inclusive. */
  hasta: string
}

export type ResultadoRango = { ok: true; rango: Rango } | { ok: false; error: string }

/** Máximo de días de un reporte (evita archivos enormes por un error de fechas). */
export const DIAS_MAXIMOS_REPORTE = 366

export function fechaDeTexto(texto: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!partes) return null
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  const fecha = new Date(anio, mes - 1, dia)
  // new Date corrige "31 de febrero" en lugar de fallar: se descarta si el día cambió.
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia ? fecha : null
}

/** Rango de días que cubre un reporte: hoy, la semana (lunes a domingo), el mes o fechas elegidas. */
export function rangoDeReporte(tipo: TipoRango, ahora: Date, personalizadas?: FechasPersonalizadas): ResultadoRango {
  const anio = ahora.getFullYear()
  const mes = ahora.getMonth()
  switch (tipo) {
    case 'hoy': {
      const { desde, hasta } = limitesDelDia(ahora)
      return { ok: true, rango: { desde, hasta } }
    }
    case 'semana': {
      const diasDesdeLunes = (ahora.getDay() + 6) % 7
      const desde = new Date(anio, mes, ahora.getDate() - diasDesdeLunes)
      return { ok: true, rango: { desde, hasta: new Date(anio, mes, ahora.getDate() - diasDesdeLunes + 7) } }
    }
    case 'mes':
      return { ok: true, rango: { desde: new Date(anio, mes, 1), hasta: new Date(anio, mes + 1, 1) } }
    case 'personalizado': {
      const desde = personalizadas ? fechaDeTexto(personalizadas.desde) : null
      const ultimo = personalizadas ? fechaDeTexto(personalizadas.hasta) : null
      if (!desde || !ultimo) return { ok: false, error: 'Elige las dos fechas' }
      if (ultimo < desde) return { ok: false, error: 'La fecha final no puede ser anterior a la inicial' }
      const hasta = new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() + 1)
      const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000)
      if (dias > DIAS_MAXIMOS_REPORTE) {
        return { ok: false, error: `El rango no puede pasar de ${DIAS_MAXIMOS_REPORTE} días` }
      }
      return { ok: true, rango: { desde, hasta } }
    }
  }
}

export interface DiaReporte {
  /** Medianoche local del día. */
  fecha: Date
  /** Primer inicio del día. */
  entrada: Date | null
  /** Último fin del día. */
  salida: Date | null
  almuerzoMs: number
  ausenteMs: number
  /** Tiempo trabajado neto (sin almuerzo y, según la configuración, sin ausencias). */
  trabajadoMs: number
  /** Meta del día según los ajustes de hoy (los lunes, con el recorte). */
  objetivoMs: number
  /** Texto para el reporte: "Jornada sin cerrar", "En curso", mensajes sin publicar… */
  observacion: string
}

export interface TotalesReporte {
  trabajadoMs: number
  objetivoMs: number
  almuerzoMs: number
  ausenteMs: number
}

export interface Reporte {
  rango: Rango
  generadoEn: Date
  /** Solo los días con al menos un evento, en orden cronológico. */
  dias: DiaReporte[]
  eventos: Evento[]
  totales: TotalesReporte
  /** Jornada y recorte con que se calculó la meta de cada día (se anotan en el archivo). */
  jornadaObjetivoHoras: number
  recorteLunesHoras: number
}

const claveDelDia = (fecha: Date): string => `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`

function resumirDia(eventos: Evento[], ahora: Date, config: Config): DiaReporte {
  const primero = eventos[0] as Evento
  const dia = limitesDelDia(new Date(milisegundosDe(primero.ocurridoEn))).desde
  const ultimo = eventos[eventos.length - 1] as Evento
  const esHoy = claveDelDia(dia) === claveDelDia(ahora)
  // Un día pasado sin cerrar no se extiende hasta "ahora": solo cuenta hasta su último evento.
  const instante = esHoy ? ahora : new Date(milisegundosDe(ultimo.ocurridoEn))

  const jornadaObjetivoHoras = jornadaObjetivoDelDia(config.horario, dia)
  const tiempo = calcularTiempo(eventos as EventoJornada[], instante, {
    jornadaObjetivoHoras,
    descontarAusencias: config.horario.descontarAusencias
  })

  let almuerzoMs = 0
  let ausenteMs = 0
  for (const tramo of calcularTramos(eventos as EventoJornada[])) {
    const duracion = Math.max(0, (tramo.hastaMs ?? instante.getTime()) - tramo.desdeMs)
    if (tramo.estado === 'en_almuerzo') almuerzoMs += duracion
    else if (tramo.estado === 'ausente') ausenteMs += duracion
  }

  const inicio = eventos.find((e) => e.tipo === 'inicio')
  const fin = [...eventos].reverse().find((e) => e.tipo === 'fin')
  const observaciones: string[] = []
  if (!fin) {
    observaciones.push(esHoy ? `En curso (${ETIQUETAS_ESTADO[tiempo.estado].toLowerCase()})` : 'Jornada sin cerrar')
  }
  const sinPublicar = eventos.filter((e) => e.estadoEnvio !== 'enviado').length
  if (sinPublicar > 0) observaciones.push(`${sinPublicar} mensaje${sinPublicar === 1 ? '' : 's'} sin publicar`)

  return {
    fecha: dia,
    entrada: inicio ? new Date(milisegundosDe(inicio.ocurridoEn)) : null,
    salida: fin ? new Date(milisegundosDe(fin.ocurridoEn)) : null,
    almuerzoMs,
    ausenteMs,
    trabajadoMs: tiempo.trabajadoMs,
    objetivoMs: tiempo.objetivoMs,
    observacion: observaciones.join('; ')
  }
}

/** Arma el reporte a partir de los eventos del rango (en cualquier orden). */
export function construirReporte(eventos: readonly Evento[], rango: Rango, ahora: Date, config: Config): Reporte {
  const ordenados = [...eventos].sort((a, b) => milisegundosDe(a.ocurridoEn) - milisegundosDe(b.ocurridoEn) || a.id - b.id)

  const porDia = new Map<string, Evento[]>()
  for (const evento of ordenados) {
    const clave = claveDelDia(new Date(milisegundosDe(evento.ocurridoEn)))
    porDia.set(clave, [...(porDia.get(clave) ?? []), evento])
  }
  const dias = [...porDia.values()].map((delDia) => resumirDia(delDia, ahora, config))

  const totales = dias.reduce<TotalesReporte>(
    (suma, dia) => ({
      trabajadoMs: suma.trabajadoMs + dia.trabajadoMs,
      objetivoMs: suma.objetivoMs + dia.objetivoMs,
      almuerzoMs: suma.almuerzoMs + dia.almuerzoMs,
      ausenteMs: suma.ausenteMs + dia.ausenteMs
    }),
    { trabajadoMs: 0, objetivoMs: 0, almuerzoMs: 0, ausenteMs: 0 }
  )

  return {
    rango,
    generadoEn: ahora,
    dias,
    eventos: ordenados,
    totales,
    jornadaObjetivoHoras: config.horario.jornadaObjetivoHoras,
    recorteLunesHoras: config.horario.recorteLunesHoras
  }
}

export const dosDigitos = (n: number): string => String(n).padStart(2, '0')
export const textoDeFecha = (fecha: Date): string => `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`

/** Nombre sugerido para el archivo, p. ej. "Jornify 2026-11-09 a 2026-11-15.xlsx". */
export function nombreArchivoReporte(tipo: TipoRango, rango: Rango): string {
  const primero = rango.desde
  const ultimo = new Date(rango.hasta.getFullYear(), rango.hasta.getMonth(), rango.hasta.getDate() - 1)
  switch (tipo) {
    case 'hoy':
      return `Jornify ${textoDeFecha(primero)}.xlsx`
    case 'mes':
      return `Jornify ${primero.getFullYear()}-${dosDigitos(primero.getMonth() + 1)}.xlsx`
    case 'semana':
    case 'personalizado':
      return `Jornify ${textoDeFecha(primero)} a ${textoDeFecha(ultimo)}.xlsx`
  }
}
