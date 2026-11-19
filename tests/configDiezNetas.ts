import { type Config, configPorDefecto as configBase } from '../src/main/configEsquema'

/**
 * Config por defecto con la jornada de 11 h (almuerzo de 1 h incluido): 10 h netas (salida 19:00 si se inicia a las 8:00).
 * Las pruebas que cuentan horas con esos números parten de aquí; el valor por defecto real (10 h con almuerzo) se prueba aparte.
 */
export function configPorDefecto(): Config {
  const config = configBase()
  config.horario.jornadaObjetivoHoras = 11
  return config
}
