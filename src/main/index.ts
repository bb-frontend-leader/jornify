import { mkdirSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { app, powerMonitor, safeStorage, shell } from 'electron'
import { aplicarInicioConWindows, revisarInicioAlArrancar } from './arranque'
import { ServicioAuth } from './auth'
import { adaptadorInicioWindows, mostrarAviso, preguntarInicio } from './avisos'
import { crearBandeja } from './bandeja'
import { cargarConfig, guardarConfig } from './config'
import { Controlador } from './controlador'
import { Historial } from './historial'
import { registrarIpc } from './ipc'
import { Programador } from './programador'
import { PublicadorGraph } from './publicadores/graph'
import { PublicadorLog } from './publicadores/log'
import { Recordatorios } from './recordatorios'
import { iniciarRegistro, log } from './registro'
import { carpetaDeRecursos, idDeAplicacion } from './identidad'
import { crearReproductor, reproductorSilencioso } from './sonidos'
import { ServicioTeams } from './teams'
import { mostrarReloj } from './ventana'

// Los datos viven en %APPDATA%\Jornify (config.json, historial.db y logs/), no en %APPDATA%\jornify.
// JORNIFY_CARPETA_DATOS permite usar otra carpeta (pruebas manuales) sin tocar los datos reales.
app.setPath('userData', process.env['JORNIFY_CARPETA_DATOS'] ?? join(app.getPath('appData'), 'Jornify'))
// En desarrollo las notificaciones de Windows solo salen si el identificador es el del ejecutable.
app.setAppUserModelId(idDeAplicacion())

/** Programa un aviso a las 00:00 para que el reloj y la bandeja pasen al día nuevo. */
function vigilarCambioDeDia(controlador: Controlador, programador: Programador, recordatorios: Recordatorios): void {
  const ahora = new Date()
  const medianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 1)
  setTimeout(() => {
    controlador.notificar()
    // La lista de programados es "de hoy": al cambiar el día se vacía (lo pendiente viejo se omite).
    void programador.procesarVencidos().then(() => programador.notificar())
    recordatorios.revisar()
    vigilarCambioDeDia(controlador, programador, recordatorios)
  }, medianoche.getTime() - ahora.getTime()).unref()
}

// Instancia única: abrir la app otra vez solo muestra el reloj de la instancia en ejecución.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => mostrarReloj())

  // La app vive en la bandeja: cerrar el reloj no la termina.
  app.on('window-all-closed', () => {})

  void app.whenReady().then(() => {
    mkdirSync(join(app.getPath('userData'), 'logs'), { recursive: true })
    iniciarRegistro()
    log.info(`Jornify ${app.getVersion()} iniciado; datos en ${app.getPath('userData')}`)

    const config = cargarConfig()
    const historial = Historial.abrir(join(app.getPath('userData'), 'historial.db'))
    app.on('will-quit', () => historial.cerrar())

    // JORNIFY_SIN_SONIDOS=1 silencia la app (pruebas automáticas).
    const reproductor =
      process.env['JORNIFY_SIN_SONIDOS'] === '1'
        ? reproductorSilencioso
        : crearReproductor({
            directorio: join(carpetaDeRecursos(), 'sonidos'),
            alErrorar: (error) => log.warn('No se pudo reproducir el sonido', error)
          })

    // Inicio de sesión con Microsoft: la caché de tokens va cifrada con safeStorage (DPAPI de Windows).
    const auth = new ServicioAuth({
      obtenerApp: () => {
        const { clientId, tenantId } = cargarConfig().teams
        return { clientId, tenantId }
      },
      rutaCache: join(app.getPath('userData'), 'tokens.bin'),
      cifrador: {
        disponible: () => safeStorage.isEncryptionAvailable(),
        cifrar: (texto) => safeStorage.encryptString(texto),
        descifrar: (datos) => safeStorage.decryptString(datos)
      },
      abrirNavegador: (url) => shell.openExternal(url),
      registrar: (mensaje, error) => log.warn(mensaje, error)
    })
    const publicadorGraph = new PublicadorGraph({
      obtenerToken: (alcances) => auth.obtenerToken(alcances),
      obtenerConfig: cargarConfig,
      registrar: (mensaje, error) => log.warn(mensaje, error)
    })

    // JORNIFY_PUBLICADOR_LOG=1 cambia Teams por el publicador de prueba, que solo escribe en el log (desarrollo y pruebas).
    const publicador =
      process.env['JORNIFY_PUBLICADOR_LOG'] === '1' ? new PublicadorLog((texto) => log.info(texto)) : publicadorGraph

    const controlador = new Controlador({
      historial,
      publicador,
      obtenerConfig: cargarConfig,
      nombre: userInfo().username,
      registrarError: (mensaje, error) => log.error(mensaje, error),
      sonar: (sonido) => reproductor.reproducir(sonido)
    })

    const programador = new Programador({
      historial,
      controlador,
      obtenerConfig: cargarConfig,
      registrarError: (mensaje, error) => log.error(mensaje, error)
    })
    app.on('will-quit', () => programador.detener())
    // Al despertar el equipo, los temporizadores pueden haberse atrasado: se atiende lo vencido.
    powerMonitor.on('resume', () => void programador.procesarVencidos())

    const teams = new ServicioTeams({
      auth,
      publicador: publicadorGraph,
      cola: controlador.cola,
      obtenerConfig: cargarConfig,
      guardarConfig,
      registrar: (mensaje, error) => log.warn(mensaje, error)
    })
    // Lo que quedó pendiente de la sesión anterior sale al arrancar; al despertar el equipo se reintenta ya.
    controlador.cola.iniciar()
    app.on('will-quit', () => controlador.cola.detener())
    powerMonitor.on('resume', () => void controlador.cola.reintentarAhora())

    // Recordatorios (pasó la hora de salida, almuerzo largo): un solo temporizador que se recalcula cuando algo cambia.
    const recordatorios = new Recordatorios({
      historial,
      obtenerConfig: cargarConfig,
      avisar: (aviso) => mostrarAviso(aviso, !cargarConfig().app.sonidos),
      registrarError: (mensaje, error) => log.error(mensaje, error)
    })
    controlador.alCambiar(() => recordatorios.revisar())
    powerMonitor.on('resume', () => recordatorios.revisar())
    app.on('will-quit', () => recordatorios.detener())

    // Inicio con Windows: se aplica al arrancar y cada vez que se guardan los ajustes (solo en la app instalada).
    const aplicarInicio = (): void => {
      const resultado = aplicarInicioConWindows(cargarConfig().app.iniciarConWindows, adaptadorInicioWindows())
      if (resultado === 'aplicado') log.info('Inicio con Windows actualizado')
    }
    aplicarInicio()

    registrarIpc(controlador, reproductor, programador, historial, teams, aplicarInicio)
    crearBandeja(controlador, reproductor)
    vigilarCambioDeDia(controlador, programador, recordatorios)
    programador.iniciar()
    recordatorios.iniciar()
    if (config.app.abrirRelojAlIniciar) mostrarReloj()

    // Nunca se publica sin confirmación: al arrancar solo se pregunta, y el inicio se registra si se acepta.
    const hoy = new Date()
    void revisarInicioAlArrancar({
      config,
      estado: controlador.estado(),
      eventosDeHoy: historial.eventosDelDia(hoy),
      preguntar: () => preguntarInicio(hoy),
      registrarInicio: () => controlador.ejecutar('inicio'),
      registrarError: (mensaje, error) => log.error(mensaje, error)
    }).then((resultado) => log.info(`Inicio al arrancar: ${resultado}`))
  })
}
