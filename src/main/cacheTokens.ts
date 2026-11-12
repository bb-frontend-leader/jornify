// Caché de tokens de MSAL cifrada en disco. Sin dependencias de Electron: el cifrador se inyecta
// (en la app es safeStorage, que usa DPAPI de Windows; los tokens nunca se guardan en claro).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node'

export interface Cifrador {
  /** ¿Se puede cifrar en este equipo? Si no, los tokens no se guardan. */
  disponible: () => boolean
  cifrar: (texto: string) => Buffer
  descifrar: (datos: Buffer) => string
}

/** Plugin de caché para MSAL: lee la caché cifrada antes de usarla y la vuelve a guardar si cambió. */
export function crearPluginCache(
  ruta: string,
  cifrador: Cifrador,
  registrar?: (mensaje: string, error?: unknown) => void
): ICachePlugin {
  return {
    beforeCacheAccess: (contexto: TokenCacheContext): Promise<void> => {
      if (existsSync(ruta) && cifrador.disponible()) {
        try {
          contexto.tokenCache.deserialize(cifrador.descifrar(readFileSync(ruta)))
        } catch (error) {
          // Archivo dañado o cifrado con otra cuenta de Windows: se descarta y habrá que iniciar sesión de nuevo.
          registrar?.('La caché de tokens no se pudo leer; se descarta', error)
          rmSync(ruta, { force: true })
        }
      }
      return Promise.resolve()
    },
    afterCacheAccess: (contexto: TokenCacheContext): Promise<void> => {
      if (!contexto.cacheHasChanged) return Promise.resolve()
      if (!cifrador.disponible()) {
        registrar?.('No hay cifrado disponible en este equipo: la sesión no se guardará')
        return Promise.resolve()
      }
      mkdirSync(dirname(ruta), { recursive: true })
      writeFileSync(ruta, cifrador.cifrar(contexto.tokenCache.serialize()))
      return Promise.resolve()
    }
  }
}

/** Borra la caché de tokens del disco (cerrar sesión). */
export function borrarCacheTokens(ruta: string): void {
  rmSync(ruta, { force: true })
}
