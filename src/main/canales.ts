// Nombres de los canales IPC compartidos entre main y preload.
export const CANALES = {
  appInfo: 'app:info',
  instantanea: 'jornada:instantanea',
  ejecutar: 'jornada:ejecutar',
  alternarSiempreVisible: 'ventana:alternar-siempre-visible',
  alternarSonidos: 'app:alternar-sonidos',
  obtenerAjustes: 'ajustes:obtener',
  guardarAjustes: 'ajustes:guardar',
  obtenerPlantillas: 'plantillas:obtener',
  guardarPlantillas: 'plantillas:guardar',
  estadoTeams: 'teams:estado',
  guardarAppMicrosoft: 'teams:guardar-app',
  iniciarSesion: 'teams:iniciar-sesion',
  cerrarSesion: 'teams:cerrar-sesion',
  listarEquipos: 'teams:listar-equipos',
  listarCanales: 'teams:listar-canales',
  elegirCanal: 'teams:elegir-canal',
  reintentarEnvios: 'teams:reintentar',
  activarMenciones: 'teams:activar-menciones',
  enviarPrueba: 'teams:enviar-prueba',
  /** main → interfaz: cambió la conexión con Teams o la cola. */
  cambioTeams: 'teams:cambio',
  obtenerHistorial: 'historial:semana',
  exportarReporte: 'reporte:exportar',
  mostrarReporte: 'reporte:mostrar',
  listarProgramados: 'programados:listar',
  programar: 'programados:crear',
  cancelarProgramado: 'programados:cancelar',
  /** main → interfaz: cambió la lista de programados. */
  cambioProgramados: 'programados:cambio',
  /** main → interfaz: cambió el estado de la jornada. */
  cambio: 'jornada:cambio',
  /** main → interfaz: la bandeja pidió ausentarse y falta el motivo. */
  pedirMotivo: 'jornada:pedir-motivo',
  /** interfaz → main: la interfaz ya escucha eventos. */
  listo: 'ventana:listo'
} as const
