// Escribe el reporte como libro de Excel (.xlsx) con exceljs. Sin dependencias de Electron.
import type ExcelJS from 'exceljs'
import { etiquetaDeAccion } from './estado'
import { milisegundosDe } from './fechas'
import type { Evento } from './historial'
import { type Reporte } from './reporte'

const MS_POR_DIA = 86_400_000

const FORMATO_FECHA = 'dd/mm/yyyy'
const FORMATO_HORA = 'hh:mm'
const FORMATO_FECHA_HORA = 'dd/mm/yyyy hh:mm'
const FORMATO_DURACION = '[h]:mm'
/** Diferencia en horas decimales: la negativa en rojo (un formato de duración no admite negativos). */
const FORMATO_DIFERENCIA = '+0.00;[Red]-0.00;0.00'

const TEXTO_ENVIO: Record<Evento['estadoEnvio'], string> = {
  enviado: 'Enviado',
  pendiente: 'Pendiente',
  fallido: 'Fallido'
}

const nombreDelDia = (fecha: Date): string => {
  const nombre = new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(fecha)
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

/**
 * exceljs guarda las fechas como UTC: una fecha local se desplazaría por la zona horaria.
 * Se entrega una fecha UTC con los mismos números de calendario y reloj que la local.
 */
const comoFechaDeCelda = (fecha: Date): Date =>
  new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), fecha.getHours(), fecha.getMinutes(), fecha.getSeconds()))

/** Hora del día como fracción de día, que es como Excel guarda las horas. */
const comoHoraDeCelda = (fecha: Date): number =>
  (fecha.getHours() * 3600 + fecha.getMinutes() * 60 + fecha.getSeconds()) / 86_400

const comoDuracion = (ms: number): number => ms / MS_POR_DIA

const comoHorasDecimales = (ms: number): number => Math.round((ms / 3_600_000) * 100) / 100

function darFormatoEncabezado(hoja: ExcelJS.Worksheet): void {
  const fila = hoja.getRow(1)
  fila.font = { bold: true }
  fila.alignment = { vertical: 'middle' }
  fila.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E5DF' } }
    celda.border = { bottom: { style: 'thin' } }
  })
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
}

/** Construye el libro con las hojas "Resumen" y "Eventos". */
export async function construirLibro(reporte: Reporte): Promise<ExcelJS.Workbook> {
  // exceljs es CommonJS: en el paquete del main solo se puede contar con su exportación por defecto.
  const { Workbook } = (await import('exceljs')).default
  const libro = new Workbook()
  libro.creator = 'Jornify'
  libro.created = reporte.generadoEn

  // --- Resumen: una fila por día con eventos ---
  const resumen = libro.addWorksheet('Resumen')
  resumen.columns = [
    { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: FORMATO_FECHA } },
    { header: 'Día', key: 'dia', width: 12 },
    { header: 'Entrada', key: 'entrada', width: 10, style: { numFmt: FORMATO_HORA } },
    { header: 'Salida', key: 'salida', width: 10, style: { numFmt: FORMATO_HORA } },
    { header: 'Almuerzo', key: 'almuerzo', width: 11, style: { numFmt: FORMATO_DURACION } },
    { header: 'Ausencias', key: 'ausencias', width: 11, style: { numFmt: FORMATO_DURACION } },
    { header: 'Trabajado', key: 'trabajado', width: 11, style: { numFmt: FORMATO_DURACION } },
    { header: 'Meta del día', key: 'meta', width: 13, style: { numFmt: FORMATO_DURACION } },
    { header: 'Diferencia (h)', key: 'diferencia', width: 15, style: { numFmt: FORMATO_DIFERENCIA } },
    { header: 'Observación', key: 'observacion', width: 38 }
  ]
  darFormatoEncabezado(resumen)

  for (const dia of reporte.dias) {
    resumen.addRow({
      fecha: comoFechaDeCelda(dia.fecha),
      dia: nombreDelDia(dia.fecha),
      entrada: dia.entrada ? comoHoraDeCelda(dia.entrada) : null,
      salida: dia.salida ? comoHoraDeCelda(dia.salida) : null,
      almuerzo: comoDuracion(dia.almuerzoMs),
      ausencias: comoDuracion(dia.ausenteMs),
      trabajado: comoDuracion(dia.trabajadoMs),
      meta: comoDuracion(dia.objetivoMs),
      diferencia: comoHorasDecimales(dia.trabajadoMs - dia.objetivoMs),
      observacion: dia.observacion
    })
  }

  const totales = resumen.addRow({
    fecha: 'Total',
    dia: `${reporte.dias.length} ${reporte.dias.length === 1 ? 'día' : 'días'}`,
    almuerzo: comoDuracion(reporte.totales.almuerzoMs),
    ausencias: comoDuracion(reporte.totales.ausenteMs),
    trabajado: comoDuracion(reporte.totales.trabajadoMs),
    meta: comoDuracion(reporte.totales.objetivoMs),
    diferencia: comoHorasDecimales(reporte.totales.trabajadoMs - reporte.totales.objetivoMs)
  })
  totales.font = { bold: true }
  totales.eachCell({ includeEmpty: true }, (celda) => {
    celda.border = { top: { style: 'thin' } }
  })

  const nota = resumen.addRow([])
  nota.getCell(1).value =
    `La meta de cada día usa los ajustes actuales: ${reporte.jornadaObjetivoHoras} h netas` +
    (reporte.recorteLunesHoras > 0 ? `, los lunes ${reporte.jornadaObjetivoHoras - reporte.recorteLunesHoras} h.` : '.') +
    ' Solo aparecen los días con registros. Los días sin cerrar cuentan hasta su último evento.'
  nota.getCell(1).font = { italic: true, color: { argb: 'FF4F5D58' } }
  resumen.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + reporte.dias.length, column: 10 } }

  // --- Eventos: el detalle de cada acción ---
  const detalle = libro.addWorksheet('Eventos')
  detalle.columns = [
    { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: FORMATO_FECHA } },
    { header: 'Hora', key: 'hora', width: 10, style: { numFmt: FORMATO_HORA } },
    { header: 'Acción', key: 'accion', width: 22 },
    { header: 'Motivo', key: 'motivo', width: 28 },
    { header: 'Mensaje', key: 'mensaje', width: 70 },
    { header: 'Envío', key: 'envio', width: 11 },
    { header: 'Enviado en', key: 'enviadoEn', width: 18, style: { numFmt: FORMATO_FECHA_HORA } },
    { header: 'Intentos', key: 'intentos', width: 9 }
  ]
  darFormatoEncabezado(detalle)

  for (const evento of reporte.eventos) {
    const ocurrido = new Date(milisegundosDe(evento.ocurridoEn))
    detalle.addRow({
      fecha: comoFechaDeCelda(ocurrido),
      hora: comoHoraDeCelda(ocurrido),
      accion: etiquetaDeAccion(evento.tipo),
      motivo: evento.motivo,
      mensaje: evento.mensaje,
      envio: TEXTO_ENVIO[evento.estadoEnvio],
      enviadoEn: evento.enviadoEn ? comoFechaDeCelda(new Date(milisegundosDe(evento.enviadoEn))) : null,
      intentos: evento.intentos
    })
  }
  detalle.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + reporte.eventos.length, column: 8 } }

  return libro
}

/** Escribe el reporte en un archivo .xlsx. */
export async function escribirExcel(reporte: Reporte, ruta: string): Promise<void> {
  const libro = await construirLibro(reporte)
  await libro.xlsx.writeFile(ruta)
}
