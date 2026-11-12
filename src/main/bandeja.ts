import { app, Menu, type MenuItemConstructorOptions, Tray } from 'electron'
import type { Controlador } from './controlador'
import { fijarTemaVisual, iconoDeBandeja } from './identidad'
import { alternarSonidos } from './preferencias'
import { log } from './registro'
import type { Reproductor } from './sonidos'
import { mostrarReloj, refrescarIconoDeVentana } from './ventana'

let bandeja: Tray | null = null

/** Crea el ícono de la bandeja y lo mantiene al día con el estado: color del ícono y acciones válidas del menú. */
export function crearBandeja(controlador: Controlador, reproductor: Reproductor): void {
  if (bandeja) return
  // El tema se fija antes de crear nada para que el primer ícono ya lo lleve.
  fijarTemaVisual(controlador.instantanea().tema)
  const nueva = new Tray(iconoDeBandeja(controlador.estado()))
  bandeja = nueva
  nueva.on('click', () => mostrarReloj())

  const actualizar = (): void => {
    const instantanea = controlador.instantanea()
    // Un tema nuevo (otra fecha o elegido en Ajustes) cambia también el logo de la ventana abierta.
    if (fijarTemaVisual(instantanea.tema)) refrescarIconoDeVentana()
    nueva.setImage(iconoDeBandeja(instantanea.estado))
    nueva.setToolTip(`Jornify – ${instantanea.etiquetaEstado}`)

    const acciones: MenuItemConstructorOptions[] = instantanea.acciones.map(({ tipo, etiqueta }) => ({
      // La ausencia pide un motivo opcional: se pregunta en el reloj, que se abre para eso.
      label: tipo === 'ausencia' ? `${etiqueta}…` : etiqueta,
      click: () => {
        if (tipo === 'ausencia') {
          mostrarReloj({ pedirMotivo: true })
          return
        }
        controlador.ejecutar(tipo).catch((error: unknown) => log.error(`Falló la acción "${tipo}" desde la bandeja`, error))
      }
    }))

    nueva.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Estado: ${instantanea.etiquetaEstado}`, enabled: false },
        { type: 'separator' },
        ...acciones,
        { type: 'separator' },
        { label: 'Sonidos', type: 'checkbox', checked: instantanea.sonidos, click: () => alternarSonidos(controlador, reproductor) },
        { label: 'Abrir reloj', click: () => mostrarReloj() },
        { label: 'Salir de Jornify', click: () => app.quit() }
      ])
    )
  }

  controlador.alCambiar(actualizar)
  actualizar()
}
