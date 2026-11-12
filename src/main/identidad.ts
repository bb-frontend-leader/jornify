// Identidad de la app ante Windows: el AppUserModelId (agrupa las ventanas en la barra de tareas y habilita las notificaciones)
// y los íconos, que cambian con el tema: el logo (ventana, barra de tareas, avisos) y la bandeja. Se dibujan en memoria
// con iconos.ts, así no dependen de archivos dentro del asar.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'
import type { EstadoJornada } from './estado'
import {
  IDENTIDAD_CLASICA,
  TAMANOS_DEL_ICO,
  type IconoDeEstado,
  icoDelLogo,
  pngDeBandeja,
  pngDelLogo
} from './iconos'
import { log } from './registro'
import { ID_CLASICO } from './temas'
import { identidadDelTema } from './identidadesDeTemas'

/**
 * Carpeta de los archivos que viajan fuera del asar (sonidos, ícono del instalador). Empaquetada es `resources/` junto al
 * ejecutable (`extraResources` de electron-builder); en desarrollo, `resources/` del proyecto. Todo lo que lea PowerShell u otro
 * programa externo debe estar aquí: no pueden leer de dentro del asar.
 */
export function carpetaDeRecursos(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

/** Empaquetada es el id fijo; en desarrollo Windows solo muestra notificaciones si el id es el del ejecutable. */
export function idDeAplicacion(): string {
  return app.isPackaged ? 'com.jornify.app' : process.execPath
}

const ICONO_DE_ESTADO: Record<EstadoJornada, IconoDeEstado> = {
  fuera_de_jornada: 'fuera-de-jornada',
  trabajando: 'trabajando',
  en_almuerzo: 'almuerzo',
  ausente: 'ausente'
}

let temaVisual = ID_CLASICO
const imagenes = new Map<string, NativeImage>()

/** Fija el tema de los íconos. Devuelve true si cambió (quien lo llama debe refrescar lo que ya está en pantalla). */
export function fijarTemaVisual(id: string): boolean {
  if (id === temaVisual) return false
  temaVisual = id
  return true
}

function guardada(clave: string, crear: () => Buffer): NativeImage {
  let imagen = imagenes.get(clave)
  if (!imagen) {
    imagen = nativeImage.createFromBuffer(crear())
    imagenes.set(clave, imagen)
  }
  return imagen
}

/** Logo del tema actual a 256 px: ventana y avisos. */
export function iconoDeApp(): NativeImage {
  return guardada(`logo:${temaVisual}`, () => pngDelLogo(256, identidadDelTema(temaVisual) ?? IDENTIDAD_CLASICA))
}

/**
 * Ruta de un .ico con el logo del tema actual: la barra de tareas solo lo acepta como archivo.
 * Se escribe una vez por tema en la carpeta de datos; si no se puede, queda el del instalador.
 */
export function rutaIcoDeApp(): string {
  const ruta = join(app.getPath('userData'), 'iconos', `icono-${temaVisual}.ico`)
  try {
    if (!existsSync(ruta)) {
      mkdirSync(join(app.getPath('userData'), 'iconos'), { recursive: true })
      writeFileSync(ruta, icoDelLogo(TAMANOS_DEL_ICO, identidadDelTema(temaVisual) ?? IDENTIDAD_CLASICA))
    }
    return ruta
  } catch (error) {
    log.warn('No se pudo escribir el ícono del tema; la barra de tareas usa el de siempre', error)
    return join(carpetaDeRecursos(), 'icono.ico')
  }
}

/** Ícono de la bandeja: el color lo pone el estado; el tema añade una insignia (el clásico no lleva). */
export function iconoDeBandeja(estado: EstadoJornada): NativeImage {
  const icono = ICONO_DE_ESTADO[estado]
  return guardada(`bandeja:${temaVisual}:${icono}`, () => pngDeBandeja(icono, identidadDelTema(temaVisual)))
}
