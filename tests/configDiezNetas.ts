import { type Config, configPorDefecto as configBase } from '../src/main/configEsquema'

/**
 * Config por defecto con la jornada de 11 h (almuerzo de 1 h incluido): 10 h netas, entrada 08:00 y salida 19:00.
 * Las pruebas que cuentan horas con esos números parten de aquí; el valor por defecto real (10 h con almuerzo) se prueba aparte.
 */
export function configPorDefecto(): Config {
  const config = configBase()
  config.horario.jornadaObjetivoHoras = 11
  config.horario.horaSalida = '19:00'
  return config
}
