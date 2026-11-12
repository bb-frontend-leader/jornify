// Contrato entre el proceso principal, el preload y la interfaz. Solo tipos: sin imports de Electron ni de Node.
import type { EstadoJornada, TipoEvento } from '../main/estado'
import type { TramoJornada } from '../main/tiempo'

export interface InfoApp {
  version: string
  carpetaDatos: string
  /** Instalada (no en desarrollo): solo entonces "Iniciar con Windows" tiene efecto. */
  empaquetada: boolean
}

export interface AccionDisponible {
  tipo: TipoEvento
  etiqueta: string
}

/**
 * Foto del estado de la jornada que recibe la interfaz. El reloj avanza por su cuenta:
 * trabajado ahora = trabajadoMs + (corriendo ? Date.now() - calculadoEn : 0).
 */
export interface Instantanea {
  estado: EstadoJornada
  etiquetaEstado: string
  /** Acciones válidas para el estado actual, en el orden del menú. */
  acciones: AccionDisponible[]
  /** Tiempo trabajado neto en el instante `calculadoEn`. */
  trabajadoMs: number
  objetivoMs: number
  /** Marca de tiempo (ms desde la época) en que se calculó `trabajadoMs`. */
  calculadoEn: number
  /** ¿Está avanzando el tiempo trabajado en este estado? */
  corriendo: boolean
  /** Tramos del día (trabajando, almuerzo, ausente) para dibujar la línea del día; el último puede estar abierto. */
  tramos: TramoJornada[]
  /** Horario planeado de hoy (de la configuración), en ms desde la época. */
  horario: { entradaMs: number; salidaMs: number }
  siempreVisible: boolean
  sonidos: boolean
  /** Id del tema que se aplica hoy ("clasico" = sin tema); ya resuelto según la fecha. */
  tema: string
}

/** Una acción programada tal como la muestra la interfaz. */
export interface ProgramadoVista {
  id: number
  tipo: TipoEvento
  /** Nombre de la acción ("Ausentarme"). */
  etiqueta: string
  /** Hora de ejecución, en ms desde la época. */
  horaMs: number
  /** Texto propio, o null si usa la plantilla de siempre. */
  mensaje: string | null
  origen: 'manual' | 'automatico'
  estado: 'pendiente' | 'ejecutado' | 'omitido' | 'cancelado'
  /** Por qué no se ejecutó. */
  nota: string | null
}

export interface NuevoProgramadoVista {
  tipo: TipoEvento
  /** Hora de hoy, "HH:MM" en 24 h. */
  hora: string
  mensaje?: string
}

/** Lo que se puede cambiar desde la pestaña de ajustes. */
export interface Ajustes {
  /** "HH:MM" en 24 h. */
  horaEntrada: string
  /** Horas netas por jornada, sin contar el almuerzo. */
  jornadaObjetivoHoras: number
  /** Horas que se restan a la jornada los lunes. */
  recorteLunesHoras: number
  duracionAlmuerzoMin: number
  regresoAlmuerzoAutomatico: boolean
  /** Persona a la que mencionan los mensajes; vacío = nadie. */
  mencionar: string
  /** Cada inicio de jornada abre un hilo en el canal y lo que sigue se publica como respuestas; apagado, todo va suelto. */
  respuestasEnHilo: boolean
  /** Mostrar el reloj al arrancar la app (si no, solo queda en la bandeja). */
  abrirRelojAlIniciar: boolean
  /** Abrir Jornify al iniciar sesión en Windows (solo en la app instalada). */
  iniciarConWindows: boolean
  /** Al arrancar, preguntar si se registra el inicio de la jornada. */
  confirmarInicioAlArrancar: boolean
  /** Avisar si pasó la hora de salida y la jornada sigue abierta. */
  recordarSalida: boolean
  /** Avisar si el almuerzo se pasó de la duración configurada. */
  recordarAlmuerzo: boolean
  /** "auto" (según la fecha), "clasico" o el id de un tema. */
  tema: string
}

/** Texto de cada mensaje, con variables como {saludo} o {hora}. */
export interface PlantillasMensajes {
  inicio: string
  almuerzo: string
  regresoAlmuerzo: string
  ausencia: string
  regreso: string
  fin: string
  /** Se usa en lugar de `fin` cuando se trabajó más que la meta del día. */
  finConRecuperacion: string
}

export interface PlantillasVista {
  actuales: PlantillasMensajes
  porDefecto: PlantillasMensajes
}

export interface AjustesVista {
  actuales: Ajustes
  porDefecto: Ajustes
}

export type TipoRangoReporte = 'hoy' | 'semana' | 'mes' | 'personalizado'

export interface SolicitudReporte {
  rango: TipoRangoReporte
  /** "YYYY-MM-DD"; solo con el rango personalizado. */
  desde?: string
  hasta?: string
}

export type ResultadoReporte =
  | { ok: true; cancelado: true }
  | { ok: true; cancelado: false; nombreArchivo: string; dias: number; eventos: number }
  | { ok: false; error: string }

/** Un evento del historial tal como lo muestra la interfaz. */
export interface EventoHistorial {
  id: number
  tipo: TipoEvento
  etiqueta: string
  /** Momento real del evento (ms desde la época). */
  ocurridoMs: number
  motivo: string | null
  mensaje: string
  estadoEnvio: 'pendiente' | 'enviado' | 'fallido'
  intentos: number
}

export interface DiaHistorial {
  /** "YYYY-MM-DD" (día local). */
  fecha: string
  hayRegistros: boolean
  entradaMs: number | null
  salidaMs: number | null
  almuerzoMs: number
  ausenteMs: number
  trabajadoMs: number
  /** Meta del día según los ajustes actuales (los lunes, con el recorte). */
  objetivoMs: number
  /** "En curso (trabajando)", "Jornada sin cerrar", "2 mensajes sin publicar"…; vacío si no hay nada que señalar. */
  observacion: string
  eventos: EventoHistorial[]
}

/** Los siete días (lunes a domingo) de la semana que contiene la fecha pedida. */
export interface SemanaHistorial {
  /** Lunes, "YYYY-MM-DD". */
  desde: string
  /** Domingo, "YYYY-MM-DD". */
  hasta: string
  /** Hoy, "YYYY-MM-DD", para marcar el día y limitar la navegación. */
  hoy: string
  dias: DiaHistorial[]
  /** Suma de los días con registros. */
  totales: { trabajadoMs: number; objetivoMs: number; almuerzoMs: number; ausenteMs: number }
}

export type ResultadoSemana = { ok: true; semana: SemanaHistorial } | { ok: false; error: string }

/** App registrada en Microsoft Entra ID con la que se inicia sesión. */
export interface AppMicrosoft {
  clientId: string
  tenantId: string
}

export interface ElementoTeams {
  id: string
  nombre: string
}

export type ResultadoListado = { ok: true; elementos: ElementoTeams[] } | { ok: false; error: string }

export interface EleccionCanal {
  equipoId: string
  equipoNombre: string
  canalId: string
  canalNombre: string
}

/** Cómo va la conexión con Teams y la cola de mensajes. */
export interface EstadoTeams {
  /** Método de envío configurado (el webhook llega en la Fase 5). */
  metodo: 'graph' | 'webhook'
  clientId: string
  tenantId: string
  /** Cuenta con la sesión iniciada, o null. */
  sesion: { nombre: string; usuario: string } | null
  equipo: ElementoTeams | null
  canal: ElementoTeams | null
  mencionar: string
  /** Si la persona a mencionar se pudo identificar para mencionarla de verdad. */
  menciones: 'sin_nombre' | 'ok' | 'sin_permiso' | 'no_encontrada' | 'desconocido'
  /** ¿Se puede enviar? (hay app, sesión y canal) */
  listo: boolean
  cola: {
    pendientes: number
    fallidos: number
    /** Por qué no sale nada ahora, o null. */
    bloqueo: string | null
    /** Si el bloqueo lo debe resolver la persona (iniciar sesión, elegir canal) en lugar de esperar. */
    requiereAccion: boolean
    /** Próximo reintento automático, en ms desde la época. */
    proximoIntentoEn: number | null
  }
}

export type ResultadoSimple = { ok: true } | { ok: false; error: string }

export type ResultadoAccion = { ok: true; publicado: boolean } | { ok: false; error: string }

export interface ApiJornify {
  /** Datos básicos de la app (versión y carpeta de datos). */
  info: () => Promise<InfoApp>
  /** Estado actual de la jornada. */
  instantanea: () => Promise<Instantanea>
  /** Registra una acción de la jornada; `motivo` solo aplica a la ausencia. */
  ejecutar: (tipo: TipoEvento, motivo?: string) => Promise<ResultadoAccion>
  /** Activa o desactiva "siempre visible" y lo recuerda en la configuración. */
  alternarSiempreVisible: () => Promise<void>
  /** Activa o desactiva los sonidos y lo recuerda en la configuración. */
  alternarSonidos: () => Promise<void>
  /** Ajustes actuales y los valores por defecto. */
  obtenerAjustes: () => Promise<AjustesVista>
  /** Valida y guarda los ajustes; el reloj se actualiza al momento. */
  guardarAjustes: (ajustes: Ajustes) => Promise<ResultadoSimple>
  /** Plantillas de los mensajes actuales y las de fábrica. */
  obtenerPlantillas: () => Promise<PlantillasVista>
  /** Valida y guarda las plantillas; rige para los mensajes que se registren desde ahora. */
  guardarPlantillas: (plantillas: PlantillasMensajes) => Promise<ResultadoSimple>
  /** Historial de la semana (lunes a domingo) que contiene la fecha "YYYY-MM-DD". */
  obtenerHistorial: (fecha: string) => Promise<ResultadoSemana>
  /** Pide dónde guardar y genera el reporte de Excel del rango elegido. */
  exportarReporte: (solicitud: SolicitudReporte) => Promise<ResultadoReporte>
  /** Abre la carpeta del último reporte guardado, con el archivo seleccionado. */
  mostrarReporte: () => Promise<void>
  /** Estado de la conexión con Teams y de la cola de mensajes. */
  estadoTeams: () => Promise<EstadoTeams>
  /** Guarda el ID de la app registrada en Entra ID. */
  guardarAppMicrosoft: (app: AppMicrosoft) => Promise<ResultadoSimple>
  /** Abre el navegador para iniciar sesión con Microsoft. */
  iniciarSesion: () => Promise<ResultadoSimple>
  cerrarSesion: () => Promise<void>
  listarEquipos: () => Promise<ResultadoListado>
  listarCanales: (equipoId: string) => Promise<ResultadoListado>
  elegirCanal: (eleccion: EleccionCanal) => Promise<ResultadoSimple>
  /** Reintenta ya los mensajes pendientes y los que se habían dado por perdidos. */
  reintentarEnvios: () => Promise<void>
  /** Da el permiso para mencionar de verdad a la persona configurada. */
  activarMenciones: () => Promise<ResultadoSimple>
  /** Publica un mensaje de prueba en el canal elegido. */
  enviarPrueba: () => Promise<ResultadoSimple>
  /** Avisa cuando cambia la conexión o la cola. */
  alCambiarTeams: (oyente: (estado: EstadoTeams) => void) => () => void
  /** Acciones programadas de hoy (pendientes primero por hora, luego las ya resueltas). */
  listarProgramados: () => Promise<ProgramadoVista[]>
  /** Programa una acción para una hora de hoy. */
  programar: (datos: NuevoProgramadoVista) => Promise<ResultadoSimple>
  /** Cancela una acción programada que aún está pendiente. */
  cancelarProgramado: (id: number) => Promise<ResultadoSimple>
  /** Avisa cuando cambia la lista de programados (se crea, se ejecuta, se cancela…). */
  alCambiarProgramados: (oyente: (lista: ProgramadoVista[]) => void) => () => void
  /** Avisa cada vez que cambia el estado (desde el reloj o desde la bandeja). Devuelve la función para dejar de escuchar. */
  alCambiar: (oyente: (instantanea: Instantanea) => void) => () => void
  /** El menú de la bandeja pidió ausentarse: la interfaz debe preguntar el motivo. */
  alPedirMotivo: (oyente: () => void) => () => void
  /** La interfaz ya está escuchando; el proceso principal puede enviarle peticiones pendientes. */
  listo: () => void
}
