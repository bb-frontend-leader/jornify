import { join } from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'

/** Configura electron-log: archivo en %APPDATA%\Jornify\logs con rotación por tamaño (main.log -> main.old.log). */
export function iniciarRegistro(): typeof log {
  log.transports.file.resolvePathFn = () => join(app.getPath('userData'), 'logs', 'main.log')
  log.transports.file.maxSize = 1024 * 1024
  log.initialize()
  log.errorHandler.startCatching()
  return log
}

export { log }
