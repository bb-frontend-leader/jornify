import { BrowserWindow, app, ipcMain } from 'electron'
import { z } from 'zod'
import type { ResultadoAccion, ResultadoReporte, ResultadoSemana, ResultadoSimple } from '../preload/tipos'
import { CANALES } from './canales'
import { LARGO_MAXIMO_MENSAJE, type Controlador } from './controlador'
import { TIPOS_EVENTO, TransicionInvalidaError } from './estado'
import { exportarReporte, mostrarUltimoReporte } from './exportar'
import type { Historial } from './historial'
import { vistaDeAjustes, vistaDePlantillas } from './ajustes'
import { cargarConfig } from './config'
import { alternarSiempreVisible, alternarSonidos, guardarAjustes, guardarPlantillas } from './preferencias'
import type { Programador } from './programador'
import { fechaDeTexto } from './reporte'
import { rangoDeSemana, vistaDeSemana } from './vistaHistorial'
import type { ServicioTeams } from './teams'
import { log } from './registro'
import type { Reproductor } from './sonidos'
import { enviarAVentana, marcarInterfazLista } from './ventana'

// Todo lo que llega de la interfaz se valida: no se confía en el renderer.
const esquemaEjecutar = z.object({
  tipo: z.enum(TIPOS_EVENTO),
  motivo: z.string().max(500).optional()
})

const esquemaProgramar = z.object({
  tipo: z.enum(TIPOS_EVENTO),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  mensaje: z.string().max(LARGO_MAXIMO_MENSAJE).optional()
})

const fechaISO = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
const esquemaHistorial = z.object({ fecha: fechaISO })
const esquemaReporte = z.object({
  rango: z.enum(['hoy', 'semana', 'mes', 'personalizado']),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional()
})

const texto = (largo: number) => z.string().max(largo)
const esquemaAppMicrosoft = z.object({ clientId: texto(100), tenantId: texto(100) })
const esquemaEquipo = z.object({ equipoId: z.string().min(1).max(200) })
const esquemaCanal = z.object({
  equipoId: z.string().min(1).max(200),
  equipoNombre: texto(300),
  canalId: z.string().min(1).max(200),
  canalNombre: texto(300)
})

const esquemaCancelar = z.object({ id: z.number().int().positive() })

export function registrarIpc(
  controlador: Controlador,
  reproductor: Reproductor,
  programador: Programador,
  historial: Historial,
  teams: ServicioTeams,
  alGuardarAjustes: () => void
): void {
  ipcMain.handle(CANALES.appInfo, () => ({
    version: app.getVersion(),
    carpetaDatos: app.getPath('userData'),
    empaquetada: app.isPackaged
  }))

  ipcMain.handle(CANALES.instantanea, () => controlador.instantanea())

  ipcMain.handle(CANALES.ejecutar, async (_evento, carga: unknown): Promise<ResultadoAccion> => {
    const datos = esquemaEjecutar.safeParse(carga)
    if (!datos.success) return { ok: false, error: 'Acción no válida' }
    try {
      const { publicado } = await controlador.ejecutar(datos.data.tipo, datos.data.motivo)
      return { ok: true, publicado }
    } catch (error) {
      if (error instanceof TransicionInvalidaError) return { ok: false, error: 'Esa acción no está disponible ahora' }
      log.error('Error al ejecutar la acción', error)
      return { ok: false, error: 'No se pudo registrar la acción' }
    }
  })

  ipcMain.handle(CANALES.alternarSiempreVisible, () => alternarSiempreVisible(controlador))
  ipcMain.handle(CANALES.alternarSonidos, () => alternarSonidos(controlador, reproductor))

  ipcMain.handle(CANALES.obtenerAjustes, () => vistaDeAjustes(cargarConfig()))
  ipcMain.handle(CANALES.guardarAjustes, (_evento, carga: unknown): ResultadoSimple => {
    const resultado = guardarAjustes(controlador, carga)
    if (resultado.ok) alGuardarAjustes()
    return resultado
  })

  ipcMain.handle(CANALES.obtenerPlantillas, () => vistaDePlantillas(cargarConfig()))
  ipcMain.handle(CANALES.guardarPlantillas, (_evento, carga: unknown): ResultadoSimple => guardarPlantillas(carga))

  const invalido = { ok: false, error: 'Los datos no son válidos' } as const
  ipcMain.handle(CANALES.estadoTeams, () => teams.estado())
  ipcMain.handle(CANALES.guardarAppMicrosoft, (_e, carga: unknown) => {
    const datos = esquemaAppMicrosoft.safeParse(carga)
    return datos.success ? teams.guardarApp(datos.data) : invalido
  })
  ipcMain.handle(CANALES.iniciarSesion, () => teams.iniciarSesion())
  ipcMain.handle(CANALES.cerrarSesion, () => teams.cerrarSesion())
  ipcMain.handle(CANALES.listarEquipos, () => teams.listarEquipos())
  ipcMain.handle(CANALES.listarCanales, (_e, carga: unknown) => {
    const datos = esquemaEquipo.safeParse(carga)
    return datos.success ? teams.listarCanales(datos.data.equipoId) : invalido
  })
  ipcMain.handle(CANALES.elegirCanal, (_e, carga: unknown) => {
    const datos = esquemaCanal.safeParse(carga)
    return datos.success ? teams.elegirCanal(datos.data) : invalido
  })
  ipcMain.handle(CANALES.reintentarEnvios, () => teams.reintentar())
  ipcMain.handle(CANALES.activarMenciones, () => teams.activarMenciones())
  ipcMain.handle(CANALES.enviarPrueba, () => teams.enviarPrueba())

  ipcMain.handle(CANALES.obtenerHistorial, (_evento, carga: unknown): ResultadoSemana => {
    const datos = esquemaHistorial.safeParse(carga)
    const fecha = datos.success ? fechaDeTexto(datos.data.fecha) : null
    if (!fecha) return { ok: false, error: 'La fecha no es válida' }
    try {
      const { desde, hasta } = rangoDeSemana(fecha)
      return { ok: true, semana: vistaDeSemana(historial.eventosEntre(desde, hasta), fecha, new Date(), cargarConfig()) }
    } catch (error) {
      log.error('Error al leer el historial', error)
      return { ok: false, error: 'No se pudo leer el historial' }
    }
  })

  ipcMain.handle(CANALES.exportarReporte, async (evento, carga: unknown): Promise<ResultadoReporte> => {
    const datos = esquemaReporte.safeParse(carga)
    if (!datos.success) return { ok: false, error: 'Los datos no son válidos' }
    try {
      return await exportarReporte(historial, cargarConfig(), BrowserWindow.fromWebContents(evento.sender), datos.data)
    } catch (error) {
      log.error('Error al exportar el reporte', error)
      return { ok: false, error: 'No se pudo generar el reporte' }
    }
  })
  ipcMain.handle(CANALES.mostrarReporte, () => mostrarUltimoReporte())

  ipcMain.handle(CANALES.listarProgramados, () => programador.vistaDelDia())

  ipcMain.handle(CANALES.programar, (_evento, carga: unknown): ResultadoSimple => {
    const datos = esquemaProgramar.safeParse(carga)
    if (!datos.success) return { ok: false, error: 'Los datos no son válidos' }
    return programador.programar(datos.data)
  })

  ipcMain.handle(CANALES.cancelarProgramado, (_evento, carga: unknown): ResultadoSimple => {
    const datos = esquemaCancelar.safeParse(carga)
    if (!datos.success) return { ok: false, error: 'Los datos no son válidos' }
    return programador.cancelar(datos.data.id)
  })

  ipcMain.on(CANALES.listo, (evento) => marcarInterfazLista(evento.sender.id))

  controlador.alCambiar(() => enviarAVentana(CANALES.cambio, controlador.instantanea()))
  teams.alCambiar(() => void teams.estado().then((estado) => enviarAVentana(CANALES.cambioTeams, estado)))
  programador.alCambiar(() => enviarAVentana(CANALES.cambioProgramados, programador.vistaDelDia()))
}
