import { contextBridge, ipcRenderer } from 'electron'
import { CANALES } from '../main/canales'
import type { ApiJornify } from './tipos'

/** Suscribe un oyente a un canal main → interfaz sin exponer el evento de IPC. */
function escuchar<T extends unknown[]>(canal: string, oyente: (...args: T) => void): () => void {
  const manejador = (_evento: unknown, ...args: unknown[]): void => oyente(...(args as T))
  ipcRenderer.on(canal, manejador)
  return () => {
    ipcRenderer.removeListener(canal, manejador)
  }
}

// Única superficie que la interfaz puede usar: no se expone ipcRenderer ni Node.
const api: ApiJornify = {
  info: () => ipcRenderer.invoke(CANALES.appInfo),
  instantanea: () => ipcRenderer.invoke(CANALES.instantanea),
  ejecutar: (tipo, motivo) => ipcRenderer.invoke(CANALES.ejecutar, { tipo, motivo }),
  alternarSiempreVisible: () => ipcRenderer.invoke(CANALES.alternarSiempreVisible),
  alternarSonidos: () => ipcRenderer.invoke(CANALES.alternarSonidos),
  obtenerAjustes: () => ipcRenderer.invoke(CANALES.obtenerAjustes),
  guardarAjustes: (ajustes) => ipcRenderer.invoke(CANALES.guardarAjustes, ajustes),
  obtenerPlantillas: () => ipcRenderer.invoke(CANALES.obtenerPlantillas),
  guardarPlantillas: (plantillas) => ipcRenderer.invoke(CANALES.guardarPlantillas, plantillas),
  estadoTeams: () => ipcRenderer.invoke(CANALES.estadoTeams),
  guardarAppMicrosoft: (app) => ipcRenderer.invoke(CANALES.guardarAppMicrosoft, app),
  iniciarSesion: () => ipcRenderer.invoke(CANALES.iniciarSesion),
  cerrarSesion: () => ipcRenderer.invoke(CANALES.cerrarSesion),
  listarEquipos: () => ipcRenderer.invoke(CANALES.listarEquipos),
  listarCanales: (equipoId) => ipcRenderer.invoke(CANALES.listarCanales, { equipoId }),
  elegirCanal: (eleccion) => ipcRenderer.invoke(CANALES.elegirCanal, eleccion),
  reintentarEnvios: () => ipcRenderer.invoke(CANALES.reintentarEnvios),
  activarMenciones: () => ipcRenderer.invoke(CANALES.activarMenciones),
  enviarPrueba: () => ipcRenderer.invoke(CANALES.enviarPrueba),
  alCambiarTeams: (oyente) => escuchar(CANALES.cambioTeams, oyente),
  obtenerHistorial: (fecha) => ipcRenderer.invoke(CANALES.obtenerHistorial, { fecha }),
  exportarReporte: (solicitud) => ipcRenderer.invoke(CANALES.exportarReporte, solicitud),
  mostrarReporte: () => ipcRenderer.invoke(CANALES.mostrarReporte),
  listarProgramados: () => ipcRenderer.invoke(CANALES.listarProgramados),
  programar: (datos) => ipcRenderer.invoke(CANALES.programar, datos),
  cancelarProgramado: (id) => ipcRenderer.invoke(CANALES.cancelarProgramado, { id }),
  alCambiarProgramados: (oyente) => escuchar(CANALES.cambioProgramados, oyente),
  alCambiar: (oyente) => escuchar(CANALES.cambio, oyente),
  alPedirMotivo: (oyente) => escuchar(CANALES.pedirMotivo, oyente),
  listo: () => ipcRenderer.send(CANALES.listo)
}

contextBridge.exposeInMainWorld('jornify', api)
