import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TokenCacheContext } from '@azure/msal-node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Cifrador, borrarCacheTokens, crearPluginCache } from '../src/main/cacheTokens'

/** Cifrador de mentira reversible: invierte los bytes y lleva un prefijo reconocible. */
function cifradorFalso(disponible = true): Cifrador {
  return {
    disponible: () => disponible,
    cifrar: (texto) => Buffer.from('ENC:' + texto, 'utf8'),
    descifrar: (datos) => {
      const texto = datos.toString('utf8')
      if (!texto.startsWith('ENC:')) throw new Error('no se puede descifrar')
      return texto.slice(4)
    }
  }
}

function contextoFalso(contenido = '{"vacio":true}', cambio = true) {
  const deserialize = vi.fn()
  const contexto = {
    cacheHasChanged: cambio,
    tokenCache: { deserialize, serialize: () => contenido }
  } as unknown as TokenCacheContext
  return { contexto, deserialize }
}

describe('cacheTokens', () => {
  let carpeta: string
  let ruta: string

  beforeEach(() => {
    carpeta = mkdtempSync(join(tmpdir(), 'jornify-tokens-'))
    ruta = join(carpeta, 'sub', 'tokens.bin')
  })

  afterEach(() => rmSync(carpeta, { recursive: true, force: true }))

  it('guarda la caché cifrada: el archivo nunca contiene los tokens en claro', async () => {
    const plugin = crearPluginCache(ruta, cifradorFalso())
    const { contexto } = contextoFalso('{"access_token":"secreto"}')
    await plugin.afterCacheAccess(contexto)
    const bruto = readFileSync(ruta, 'utf8')
    expect(bruto.startsWith('ENC:')).toBe(true)
  })

  it('crea la carpeta si no existe', async () => {
    const plugin = crearPluginCache(ruta, cifradorFalso())
    await plugin.afterCacheAccess(contextoFalso().contexto)
    expect(existsSync(ruta)).toBe(true)
  })

  it('no escribe si la caché no cambió', async () => {
    const plugin = crearPluginCache(ruta, cifradorFalso())
    await plugin.afterCacheAccess(contextoFalso('x', false).contexto)
    expect(existsSync(ruta)).toBe(false)
  })

  it('sin cifrado disponible no guarda nada y lo registra', async () => {
    const registrar = vi.fn()
    const plugin = crearPluginCache(ruta, cifradorFalso(false), registrar)
    await plugin.afterCacheAccess(contextoFalso().contexto)
    expect(existsSync(ruta)).toBe(false)
    expect(registrar).toHaveBeenCalledOnce()
  })

  it('lo guardado se vuelve a leer en la siguiente sesión', async () => {
    const plugin = crearPluginCache(ruta, cifradorFalso())
    await plugin.afterCacheAccess(contextoFalso('{"cuenta":1}').contexto)
    const { contexto, deserialize } = contextoFalso()
    await plugin.beforeCacheAccess(contexto)
    expect(deserialize).toHaveBeenCalledWith('{"cuenta":1}')
  })

  it('sin archivo no carga nada', async () => {
    const plugin = crearPluginCache(ruta, cifradorFalso())
    const { contexto, deserialize } = contextoFalso()
    await plugin.beforeCacheAccess(contexto)
    expect(deserialize).not.toHaveBeenCalled()
  })

  it('un archivo dañado se descarta y avisa en lugar de romper el inicio', async () => {
    const registrar = vi.fn()
    await crearPluginCache(ruta, cifradorFalso()).afterCacheAccess(contextoFalso().contexto)
    writeFileSync(ruta, 'basura sin cifrar')
    const { contexto, deserialize } = contextoFalso()
    await expect(crearPluginCache(ruta, cifradorFalso(), registrar).beforeCacheAccess(contexto)).resolves.toBeUndefined()
    expect(deserialize).not.toHaveBeenCalled()
    expect(existsSync(ruta)).toBe(false)
    expect(registrar).toHaveBeenCalledOnce()
  })

  it('borrarCacheTokens elimina el archivo y no falla si ya no está', async () => {
    await crearPluginCache(ruta, cifradorFalso()).afterCacheAccess(contextoFalso().contexto)
    borrarCacheTokens(ruta)
    expect(existsSync(ruta)).toBe(false)
    expect(() => borrarCacheTokens(ruta)).not.toThrow()
  })
})
