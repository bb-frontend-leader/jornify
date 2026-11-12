import Store from 'electron-store'
import { type Config, configPorDefecto, esquemaConfig, migrarConfig } from './configEsquema'
import { log } from './registro'

let almacen: Store<Config> | null = null
let enMemoria: Config | null = null

function obtenerAlmacen(): Store<Config> {
  // electron-store crea config.json dentro de userData (%APPDATA%\Jornify). Sin `defaults`: los valores por defecto
  // y la versión los pone zod, y mezclarlos aquí taparía la versión del archivo e impediría migrar (migrarConfig).
  almacen ??= new Store<Config>({ name: 'config' })
  return almacen
}

/**
 * Lee y valida config.json la primera vez y la guarda en memoria; las siguientes llamadas no tocan el disco.
 * Si el archivo está dañado o es inválido, se restablece a los valores por defecto.
 */
export function cargarConfig(): Config {
  if (enMemoria) return enMemoria
  const almacenConfig = obtenerAlmacen()
  const resultado = esquemaConfig.safeParse(migrarConfig(almacenConfig.store))
  if (resultado.success) {
    // Reescribe para completar con valores por defecto las claves que falten.
    almacenConfig.store = resultado.data
    enMemoria = resultado.data
  } else {
    log.warn('config.json inválido; se restablece a los valores por defecto', resultado.error.issues)
    enMemoria = configPorDefecto()
    almacenConfig.store = enMemoria
  }
  return enMemoria
}

export function guardarConfig(config: Config): Config {
  const validada = esquemaConfig.parse(config)
  obtenerAlmacen().store = validada
  enMemoria = validada
  return validada
}
