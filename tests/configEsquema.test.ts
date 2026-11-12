import { describe, expect, it } from 'vitest'
import { configPorDefecto, esquemaConfig, migrarConfig } from '../src/main/configEsquema'

describe('esquemaConfig', () => {
  it('genera la configuración completa por defecto a partir de un objeto vacío', () => {
    const config = configPorDefecto()
    expect(config.teams.metodo).toBe('graph')
    expect(config.horario.jornadaObjetivoHoras).toBe(10)
    expect(config.horario.recorteLunesHoras).toBe(1)
    expect(config.horario.horaSalida).toBe('19:00')
    expect(config.version).toBe(5)
    expect(config.teams.mencionar).toBe('Angela Ortiz Peña')
    expect(config.plantillas.inicio).toBe('{sol} {saludo}, inicio mi jornada ({hora}) {mencion}')
    expect(config.plantillas.finConRecuperacion).toBe('⏱️ {saludo}, termino mi jornada ({hora}) y recupero {tiempo} de hoy {mencion}')
    expect(config.app.iniciarConWindows).toBe(true)
    expect(config.app.siempreVisible).toBe(false)
  })

  it('conserva los valores válidos y completa los que faltan', () => {
    const config = esquemaConfig.parse({ horario: { jornadaObjetivoHoras: 6 }, app: { siempreVisible: true } })
    expect(config.horario.jornadaObjetivoHoras).toBe(6)
    expect(config.horario.horaEntrada).toBe('08:00')
    expect(config.app.siempreVisible).toBe(true)
    expect(config.app.confirmarInicioAlArrancar).toBe(true)
  })

  it('rechaza valores inválidos', () => {
    expect(esquemaConfig.safeParse({ teams: { metodo: 'correo' } }).success).toBe(false)
    expect(esquemaConfig.safeParse({ horario: { horaEntrada: '8am' } }).success).toBe(false)
    expect(esquemaConfig.safeParse({ horario: { jornadaObjetivoHoras: -1 } }).success).toBe(false)
  })
})

describe('app.sonidos', () => {
  it('viene activado por defecto y una config antigua sin la clave lo recibe activado', () => {
    expect(configPorDefecto().app.sonidos).toBe(true)
    expect(esquemaConfig.parse({ app: { siempreVisible: true } }).app.sonidos).toBe(true)
    expect(esquemaConfig.parse({ app: { sonidos: false } }).app.sonidos).toBe(false)
  })
})

describe('migrarConfig: plantillas de la v2 a la v4', () => {
  const plantillasV2 = {
    inicio: '🟢 Inicio de jornada – {hora}',
    almuerzo: '🍽️ Salgo a almorzar – {hora}',
    regresoAlmuerzo: '🔙 Regreso de almuerzo – {hora}',
    ausencia: '⏸️ Me ausento – {hora}. {motivo}',
    regreso: '▶️ Regreso – {hora}',
    fin: '🔴 Fin de jornada – {hora}'
  }

  it('las plantillas sin editar pasan a los mensajes nuevos', () => {
    const config = esquemaConfig.parse(migrarConfig({ version: 2, plantillas: plantillasV2 }))
    expect(config.version).toBe(5)
    expect(config.plantillas.inicio).toBe('{sol} {saludo}, inicio mi jornada ({hora}) {mencion}')
    expect(config.plantillas.ausencia).toBe('⏸️ {saludo}, me ausento un momento ({hora}) {mencion}')
    expect(config.plantillas.fin).toBe('{sol} {saludo}, termino mi jornada ({hora}) {mencion}')
  })

  it('respeta las plantillas que el usuario editó y cambia solo las demás', () => {
    const config = esquemaConfig.parse(
      migrarConfig({ version: 2, plantillas: { ...plantillasV2, inicio: 'Llegué – {hora}' }, teams: { channelId: 'C' } })
    )
    expect(config.plantillas.inicio).toBe('Llegué – {hora}')
    expect(config.plantillas.regreso).toBe('▶️ {saludo}, regreso ({hora}) {mencion}')
    expect(config.teams.channelId).toBe('C')
  })

  it('un config v1 recorre las dos migraciones', () => {
    const config = esquemaConfig.parse(
      migrarConfig({ horario: { horaSalida: '17:00', jornadaObjetivoHoras: 8 }, plantillas: plantillasV2 })
    )
    expect(config.horario.jornadaObjetivoHoras).toBe(10)
    expect(config.plantillas.fin).toBe('{sol} {saludo}, termino mi jornada ({hora}) {mencion}')
    expect(config.version).toBe(5)
  })
})

describe('migrarConfig', () => {
  const v1Antiguo = {
    teams: { metodo: 'graph', teamId: 'T', channelId: 'C' },
    horario: { horaEntrada: '08:00', horaSalida: '17:00', jornadaObjetivoHoras: 8, duracionAlmuerzoMin: 60, descontarAusencias: true }
  }

  it('un config v1 con los valores antiguos (8 h, salida 17:00) pasa a los nuevos y conserva lo demás', () => {
    const config = esquemaConfig.parse(migrarConfig(v1Antiguo))
    expect(config.horario.jornadaObjetivoHoras).toBe(10)
    expect(config.horario.horaSalida).toBe('19:00')
    expect(config.horario.recorteLunesHoras).toBe(1)
    expect(config.teams.teamId).toBe('T')
    expect(config.version).toBe(5)
  })

  it('respeta lo que el usuario cambió a mano', () => {
    const personalizado = { horario: { horaSalida: '16:00', jornadaObjetivoHoras: 7 } }
    const config = esquemaConfig.parse(migrarConfig(personalizado))
    expect(config.horario.horaSalida).toBe('16:00')
    expect(config.horario.jornadaObjetivoHoras).toBe(7)
  })

  it('solo migra una vez: en v5 un valor de 8 h se respeta y el objeto no se toca', () => {
    const v5 = { version: 5, horario: { horaSalida: '17:00', jornadaObjetivoHoras: 8 } }
    expect(migrarConfig(v5)).toBe(v5)
    expect(esquemaConfig.parse(migrarConfig(v5)).horario.jornadaObjetivoHoras).toBe(8)
  })

  it('en v2 ya no repite la migración de horario (8 h se respeta)', () => {
    const v2 = { version: 2, horario: { horaSalida: '17:00', jornadaObjetivoHoras: 8 } }
    expect(esquemaConfig.parse(migrarConfig(v2)).horario.jornadaObjetivoHoras).toBe(8)
  })

  it('migra aunque el archivo no tenga la sección horario, y tolera basura', () => {
    expect(esquemaConfig.parse(migrarConfig({})).version).toBe(5)
    expect(migrarConfig(null)).toBeNull()
    expect(migrarConfig('texto')).toBe('texto')
  })
})

describe('migrarConfig: plantillas de la v3 a la v4', () => {
  const plantillasV3 = {
    inicio: '{saludo}, inicio mi jornada {mencion}',
    almuerzo: '{saludo}, inicio mi hora de almuerzo {mencion}',
    regresoAlmuerzo: '{saludo}, termino mi hora de almuerzo {mencion}',
    ausencia: '{saludo}, me ausento un momento {mencion}',
    regreso: '{saludo}, regreso {mencion}',
    fin: '{saludo}, termino mi jornada {mencion}',
    finConRecuperacion: '{saludo}, termino mi jornada y recupero {tiempo} de hoy {mencion}'
  }

  it('las plantillas v3 sin editar pasan a las que llevan emoji', () => {
    const config = esquemaConfig.parse(migrarConfig({ version: 3, plantillas: plantillasV3 }))
    expect(config.version).toBe(5)
    expect(config.plantillas.almuerzo).toBe('🍲 {saludo}, inicio mi hora de almuerzo ({hora}) {mencion}')
    expect(config.plantillas.regresoAlmuerzo).toBe('🍽️ {saludo}, termino mi hora de almuerzo ({hora}) {mencion}')
  })

  it('respeta una plantilla v3 editada a mano', () => {
    const config = esquemaConfig.parse(
      migrarConfig({ version: 3, plantillas: { ...plantillasV3, fin: 'Me voy {mencion}' } })
    )
    expect(config.plantillas.fin).toBe('Me voy {mencion}')
    expect(config.plantillas.inicio).toBe('{sol} {saludo}, inicio mi jornada ({hora}) {mencion}')
  })
})

describe('migrarConfig: plantillas de la v4 a la v5 (con la hora)', () => {
  const plantillasV4 = {
    inicio: '{sol} {saludo}, inicio mi jornada {mencion}',
    almuerzo: '🍲 {saludo}, inicio mi hora de almuerzo {mencion}',
    regresoAlmuerzo: '🍽️ {saludo}, termino mi hora de almuerzo {mencion}',
    ausencia: '⏸️ {saludo}, me ausento un momento {mencion}',
    regreso: '▶️ {saludo}, regreso {mencion}',
    fin: '{sol} {saludo}, termino mi jornada {mencion}',
    finConRecuperacion: '⏱️ {saludo}, termino mi jornada y recupero {tiempo} de hoy {mencion}'
  }

  it('las plantillas v4 sin editar pasan a las que llevan la hora', () => {
    const config = esquemaConfig.parse(migrarConfig({ version: 4, plantillas: plantillasV4 }))
    expect(config.version).toBe(5)
    expect(config.plantillas.inicio).toBe('{sol} {saludo}, inicio mi jornada ({hora}) {mencion}')
    expect(config.plantillas.regresoAlmuerzo).toBe('🍽️ {saludo}, termino mi hora de almuerzo ({hora}) {mencion}')
    expect(config.plantillas.finConRecuperacion).toBe('⏱️ {saludo}, termino mi jornada ({hora}) y recupero {tiempo} de hoy {mencion}')
  })

  it('respeta una plantilla v4 editada a mano y cambia solo las demás', () => {
    const config = esquemaConfig.parse(migrarConfig({ version: 4, plantillas: { ...plantillasV4, fin: 'Me voy {mencion}' } }))
    expect(config.plantillas.fin).toBe('Me voy {mencion}')
    expect(config.plantillas.regreso).toBe('▶️ {saludo}, regreso ({hora}) {mencion}')
  })
})
