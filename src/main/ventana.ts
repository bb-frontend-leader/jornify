import { join } from 'node:path'
import { BrowserWindow, app, nativeTheme, shell } from 'electron'
import { CANALES } from './canales'
import { cargarConfig } from './config'
import { iconoDeApp, idDeAplicacion, rutaIcoDeApp } from './identidad'

let ventana: BrowserWindow | null = null
/** La interfaz ya registró sus oyentes y puede recibir peticiones del proceso principal. */
let interfazLista = false
let motivoPendiente = false

function ventanaViva(): BrowserWindow | null {
  return ventana && !ventana.isDestroyed() ? ventana : null
}

interface OpcionesReloj {
  /** Pide a la interfaz que pregunte el motivo de la ausencia. */
  pedirMotivo?: boolean
}

/** Muestra el reloj; si ya existe lo trae al frente. Al cerrarla se destruye para liberar su proceso. */
export function mostrarReloj(opciones: OpcionesReloj = {}): void {
  const existente = ventanaViva()
  if (existente) {
    if (existente.isMinimized()) existente.restore()
    existente.show()
    existente.focus()
  } else {
    crearVentana()
  }
  if (opciones.pedirMotivo) {
    if (interfazLista) enviarAVentana(CANALES.pedirMotivo)
    else motivoPendiente = true
  }
}

/** Envía un mensaje a la interfaz si la ventana está abierta; si no, no hace nada. */
export function enviarAVentana(canal: string, ...args: unknown[]): void {
  ventanaViva()?.webContents.send(canal, ...args)
}

/** Llamado cuando la interfaz avisa que ya escucha; entrega la petición de motivo que estuviera pendiente. */
export function marcarInterfazLista(idContenido: number): void {
  const actual = ventanaViva()
  if (!actual || actual.webContents.id !== idContenido) return
  interfazLista = true
  if (motivoPendiente) {
    motivoPendiente = false
    enviarAVentana(CANALES.pedirMotivo)
  }
}

export function aplicarSiempreVisible(valor: boolean): void {
  ventanaViva()?.setAlwaysOnTop(valor)
}

/** Logo del tema en la ventana y en la barra de tareas. Sin setAppDetails, en desarrollo la barra muestra el ícono de electron.exe. */
function aplicarIconosA(destino: BrowserWindow): void {
  destino.setIcon(iconoDeApp())
  destino.setAppDetails({ appId: idDeAplicacion(), appIconPath: rutaIcoDeApp(), appIconIndex: 0 })
}

/** Repinta el ícono de la ventana abierta tras un cambio de tema. */
export function refrescarIconoDeVentana(): void {
  const abierta = ventanaViva()
  if (abierta) aplicarIconosA(abierta)
}

function crearVentana(): void {
  const { app: opciones } = cargarConfig()
  const nueva = new BrowserWindow({
    // 380 × 420 de área útil (sin contar el marco de la ventana).
    useContentSize: true,
    width: 380,
    height: 420,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    title: 'Jornify',
    icon: iconoDeApp(),
    alwaysOnTop: opciones.siempreVisible,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1f' : '#f5f5f7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  interfazLista = false
  nueva.setMenu(null)
  // Sin esto, en desarrollo la barra de tareas muestra el ícono de electron.exe (el id de la app es su ruta).
  aplicarIconosA(nueva)
  nueva.once('ready-to-show', () => nueva.show())
  nueva.on('closed', () => {
    ventana = null
    interfazLista = false
    motivoPendiente = false
  })

  // La interfaz no navega ni abre ventanas nuevas; los enlaces externos van al navegador del sistema.
  nueva.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  nueva.webContents.on('will-navigate', (evento) => evento.preventDefault())

  const urlDesarrollo = process.env['ELECTRON_RENDERER_URL']
  if (urlDesarrollo) {
    void nueva.loadURL(urlDesarrollo)
  } else {
    void nueva.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ventana = nueva
}
