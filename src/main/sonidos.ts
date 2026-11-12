// Reproducción de los sonidos de la app. Sin dependencias de Electron.
// Electron no trae un reproductor de audio para el proceso principal, y la ventana del reloj se destruye al cerrarse,
// así que cada sonido se toca con System.Media.SoundPlayer de Windows en un PowerShell breve: sin procesos residentes.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { TipoEvento } from './estado'

/** Un sonido por tipo de evento, más el de error de publicación y la confirmación de "sonidos activados". */
export type NombreSonido = TipoEvento | 'fallo' | 'activado'

export interface Reproductor {
  reproducir(sonido: NombreSonido): void
}

/** Lanza un proceso en segundo plano; se inyecta para poder probar sin ejecutar nada. */
export type Lanzador = (comando: string, args: string[], env: NodeJS.ProcessEnv) => void

const lanzarEnSegundoPlano: Lanzador = (comando, args, env) => {
  const proceso = spawn(comando, args, { env, windowsHide: true, stdio: 'ignore' })
  proceso.on('error', () => {})
  proceso.unref()
}

export interface OpcionesReproductor {
  /** Carpeta con los archivos .wav (resources/sonidos). */
  directorio: string
  lanzar?: Lanzador
  alErrorar?: (error: unknown) => void
}

// La ruta viaja en una variable de entorno: así no hay que escapar comillas ni caracteres raros del nombre de usuario.
const ORDEN_POWERSHELL = '(New-Object System.Media.SoundPlayer $env:JORNIFY_SONIDO).PlaySync()'

export function crearReproductor({ directorio, lanzar = lanzarEnSegundoPlano, alErrorar }: OpcionesReproductor): Reproductor {
  return {
    reproducir(sonido) {
      try {
        lanzar(
          'powershell.exe',
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ORDEN_POWERSHELL],
          { ...process.env, JORNIFY_SONIDO: join(directorio, `${sonido}.wav`) }
        )
      } catch (error) {
        alErrorar?.(error)
      }
    }
  }
}

/** Reproductor que no hace nada (pruebas automáticas y JORNIFY_SIN_SONIDOS=1). */
export const reproductorSilencioso: Reproductor = { reproducir: () => {} }
