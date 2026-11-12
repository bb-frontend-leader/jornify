// Preferencias que se cambian desde la ventana y desde el menú de la bandeja, con un único código para ambos.
import type { ResultadoSimple } from '../preload/tipos'
import { aplicarAjustes, aplicarPlantillas, validarAjustes, validarPlantillas } from './ajustes'
import { cargarConfig, guardarConfig } from './config'
import type { Controlador } from './controlador'
import type { Reproductor } from './sonidos'
import { aplicarSiempreVisible } from './ventana'

export function alternarSiempreVisible(controlador: Controlador): void {
  const config = cargarConfig()
  const siempreVisible = !config.app.siempreVisible
  guardarConfig({ ...config, app: { ...config.app, siempreVisible } })
  aplicarSiempreVisible(siempreVisible)
  controlador.notificar()
}

/** Al activarlos suena una confirmación, para que se note que quedaron encendidos. */
export function alternarSonidos(controlador: Controlador, reproductor: Reproductor): void {
  const config = cargarConfig()
  const sonidos = !config.app.sonidos
  guardarConfig({ ...config, app: { ...config.app, sonidos } })
  controlador.notificar()
  if (sonidos) reproductor.reproducir('activado')
}

/** Valida y guarda los ajustes de horario y mensajes; el reloj y la bandeja se refrescan al momento. */
export function guardarAjustes(controlador: Controlador, crudo: unknown): ResultadoSimple {
  const validacion = validarAjustes(crudo)
  if (!validacion.ok) return { ok: false, error: validacion.error }
  guardarConfig(aplicarAjustes(cargarConfig(), validacion.ajustes))
  controlador.notificar()
  return { ok: true }
}

/** Valida y guarda las plantillas; rigen para los mensajes que se registren desde ahora (los ya guardados no cambian). */
export function guardarPlantillas(crudo: unknown): ResultadoSimple {
  const validacion = validarPlantillas(crudo)
  if (!validacion.ok) return { ok: false, error: validacion.error }
  guardarConfig(aplicarPlantillas(cargarConfig(), validacion.plantillas))
  return { ok: true }
}
