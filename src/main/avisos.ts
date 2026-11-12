// Avisos al usuario con Electron: notificaciones de Windows, la pregunta del arranque y el inicio con Windows.
// Es la capa fina; la lógica vive en recordatorios.ts y arranque.ts.
import { Notification, app, dialog } from 'electron'
import { ARGUMENTO_INICIO_AUTOMATICO, type AdaptadorInicioWindows } from './arranque'
import { iconoDeApp } from './identidad'
import { formatearHora } from './plantillas'
import { log } from './registro'
import type { Aviso } from './recordatorios'
import { mostrarReloj } from './ventana'

// Se guardan mientras estén en pantalla: si el recolector las libera, Windows pierde el clic.
const enPantalla = new Set<Notification>()

/** Notificación nativa de Windows; al tocarla se abre el reloj. Todo aviso queda además en el log. */
export function mostrarAviso(aviso: Aviso, silencioso: boolean): void {
  log.info(`[aviso] ${aviso.titulo}: ${aviso.cuerpo}`)
  if (!Notification.isSupported()) {
    log.warn('Este equipo no admite notificaciones; el aviso solo queda en el log')
    return
  }
  const notificacion = new Notification({
    title: aviso.titulo,
    body: aviso.cuerpo,
    silent: silencioso,
    icon: iconoDeApp()
  })
  enPantalla.add(notificacion)
  const soltar = (): void => void enPantalla.delete(notificacion)
  notificacion.on('click', () => {
    soltar()
    mostrarReloj()
  })
  notificacion.on('close', soltar)
  notificacion.on('failed', (_evento, error) => {
    soltar()
    log.warn('Windows no mostró la notificación', error)
  })
  notificacion.show()
}

/**
 * Pregunta "¿Registrar inicio de jornada?" con un cuadro nativo (sin abrir el reloj, para no gastar memoria al arrancar).
 * JORNIFY_RESPUESTA_INICIO=registrar|no contesta solo (pruebas automáticas, donde nadie puede pulsar el cuadro).
 */
export async function preguntarInicio(ahora: Date): Promise<boolean> {
  const forzada = process.env['JORNIFY_RESPUESTA_INICIO']
  if (forzada === 'registrar') return true
  if (forzada === 'no') return false
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Jornify',
    message: '¿Registrar inicio de jornada?',
    detail: `Son las ${formatearHora(ahora)}. Si aceptas, se publica el mensaje de inicio en Teams.`,
    buttons: ['Registrar inicio', 'Ahora no'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  return response === 0
}

/** Inicio con Windows: Electron escribe la clave Run del usuario; el argumento distingue el arranque automático. */
export function adaptadorInicioWindows(): AdaptadorInicioWindows {
  const args = [ARGUMENTO_INICIO_AUTOMATICO]
  return {
    empaquetada: app.isPackaged,
    leer: () => app.getLoginItemSettings({ args }).openAtLogin,
    escribir: (abrirAlIniciar) => app.setLoginItemSettings({ openAtLogin: abrirAlIniciar, args })
  }
}
