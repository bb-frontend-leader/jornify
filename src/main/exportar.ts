// Exportación del reporte a Excel desde la ventana: pide dónde guardar, genera el archivo y lo muestra.
// Es la capa fina con Electron; los datos y el libro viven en reporte.ts y excel.ts.
import { type BrowserWindow, app, dialog, shell } from 'electron'
import { join } from 'node:path'
import type { ResultadoReporte, SolicitudReporte } from '../preload/tipos'
import type { Config } from './configEsquema'
import { escribirExcel } from './excel'
import type { Historial } from './historial'
import { log } from './registro'
import { construirReporte, nombreArchivoReporte, rangoDeReporte } from './reporte'

let ultimaRuta: string | null = null

function mensajeDeError(error: unknown): string {
  const codigo = (error as NodeJS.ErrnoException | undefined)?.code
  if (codigo === 'EBUSY' || codigo === 'EPERM' || codigo === 'EACCES') {
    return 'No se pudo guardar el archivo. Si está abierto en Excel, ciérralo e inténtalo de nuevo.'
  }
  return 'No se pudo generar el reporte'
}

export async function exportarReporte(
  historial: Historial,
  config: Config,
  ventana: BrowserWindow | null,
  solicitud: SolicitudReporte
): Promise<ResultadoReporte> {
  const ahora = new Date()
  const fechas = solicitud.desde && solicitud.hasta ? { desde: solicitud.desde, hasta: solicitud.hasta } : undefined
  const resultadoRango = rangoDeReporte(solicitud.rango, ahora, fechas)
  if (!resultadoRango.ok) return { ok: false, error: resultadoRango.error }
  const { rango } = resultadoRango

  const eventos = historial.eventosEntre(rango.desde, rango.hasta)
  if (eventos.length === 0) return { ok: false, error: 'No hay registros en ese rango' }
  const reporte = construirReporte(eventos, rango, ahora, config)

  const nombreArchivo = nombreArchivoReporte(solicitud.rango, rango)
  const opciones = {
    title: 'Guardar reporte de Jornify',
    defaultPath: join(app.getPath('documents'), nombreArchivo),
    filters: [{ name: 'Libro de Excel', extensions: ['xlsx'] }]
  }
  // JORNIFY_RUTA_REPORTE salta el diálogo de guardar (pruebas automáticas, donde nadie puede pulsarlo).
  const rutaForzada = process.env['JORNIFY_RUTA_REPORTE']
  const destino = rutaForzada
    ? { canceled: false, filePath: rutaForzada }
    : ventana
      ? await dialog.showSaveDialog(ventana, opciones)
      : await dialog.showSaveDialog(opciones)
  if (destino.canceled || !destino.filePath) return { ok: true, cancelado: true }

  try {
    await escribirExcel(reporte, destino.filePath)
  } catch (error) {
    log.error('No se pudo escribir el reporte', error)
    return { ok: false, error: mensajeDeError(error) }
  }
  ultimaRuta = destino.filePath
  log.info(`Reporte guardado (${reporte.dias.length} días, ${reporte.eventos.length} eventos)`)
  return {
    ok: true,
    cancelado: false,
    nombreArchivo: destino.filePath.split(/[\\/]/).pop() ?? nombreArchivo,
    dias: reporte.dias.length,
    eventos: reporte.eventos.length
  }
}

/** Abre la carpeta del último reporte guardado. La ruta no viene de la interfaz: se recuerda aquí. */
export function mostrarUltimoReporte(): void {
  if (ultimaRuta) shell.showItemInFolder(ultimaRuta)
}
