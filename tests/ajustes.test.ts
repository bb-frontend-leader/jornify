import { describe, expect, it } from 'vitest'
import {
  aplicarAjustes,
  aplicarPlantillas,
  ajustesDeConfig,
  validarAjustes,
  validarPlantillas,
  vistaDeAjustes,
  vistaDePlantillas
} from '../src/main/ajustes'
import { configPorDefecto } from '../src/main/configEsquema'

const base = ajustesDeConfig(configPorDefecto())

describe('validarAjustes', () => {
  it('acepta los valores por defecto', () => {
    expect(validarAjustes(base)).toEqual({ ok: true, ajustes: base })
  })

  it('recorta los espacios del nombre a mencionar y permite dejarlo vacío', () => {
    expect(validarAjustes({ ...base, mencionar: '  Ana Pérez ' })).toMatchObject({ ok: true, ajustes: { mencionar: 'Ana Pérez' } })
    expect(validarAjustes({ ...base, mencionar: '' })).toMatchObject({ ok: true })
  })

  it.each([
    [{ jornadaObjetivoHoras: 0 }, 'al menos 1 hora'],
    [{ jornadaObjetivoHoras: 17 }, 'no puede pasar de 16'],
    [{ jornadaObjetivoHoras: Number.NaN }, 'número de horas'],
    [{ recorteLunesHoras: -1 }, 'no puede ser negativo'],
    [{ recorteLunesHoras: 10 }, 'no puede pasar de 8'],
    [{ recorteLunesHoras: 10, jornadaObjetivoHoras: 10 }, 'no puede pasar de 8'],
    [{ recorteLunesHoras: 3, jornadaObjetivoHoras: 3 }, 'menor que la jornada'],
    [{ duracionAlmuerzoMin: 0 }, 'al menos 5'],
    [{ duracionAlmuerzoMin: 300 }, 'no puede pasar de 240'],
    [{ duracionAlmuerzoMin: 30.5 }, 'minutos enteros']
  ])('rechaza %j', (cambio, mensaje) => {
    const resultado = validarAjustes({ ...base, ...cambio })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain(mensaje)
  })

  it('rechaza lo que no es un objeto de ajustes', () => {
    expect(validarAjustes(null)).toMatchObject({ ok: false })
    expect(validarAjustes({ ...base, jornadaObjetivoHoras: '9' })).toMatchObject({ ok: false })
    expect(validarAjustes({ ...base, regresoAlmuerzoAutomatico: 'si' })).toMatchObject({ ok: false })
  })
})

describe('aplicarAjustes', () => {
  it('cambia el horario', () => {
    const config = aplicarAjustes(configPorDefecto(), {
      ...base,
      jornadaObjetivoHoras: 9,
      duracionAlmuerzoMin: 45,
      recorteLunesHoras: 0.5,
      regresoAlmuerzoAutomatico: false,
      mencionar: 'Ana Pérez'
    })
    expect(config.horario).toMatchObject({
      jornadaObjetivoHoras: 9,
      recorteLunesHoras: 0.5,
      duracionAlmuerzoMin: 45,
      regresoAlmuerzoAutomatico: false
    })
    expect(config.teams.mencionar).toBe('Ana Pérez')
  })

  it('no toca lo que no son ajustes (canal, plantillas, app, versión)', () => {
    const original = { ...configPorDefecto(), teams: { ...configPorDefecto().teams, teamId: 'T', channelId: 'C' } }
    const config = aplicarAjustes(original, { ...base, jornadaObjetivoHoras: 8 })
    expect(config.teams).toMatchObject({ teamId: 'T', channelId: 'C', metodo: 'graph' })
    expect(config.plantillas).toEqual(original.plantillas)
    expect(config.app).toEqual(original.app)
    expect(config.version).toBe(original.version)
    expect(config.horario.descontarAusencias).toBe(original.horario.descontarAusencias)
  })
})

describe('vistaDeAjustes', () => {
  it('devuelve los ajustes actuales junto a los valores de fábrica', () => {
    const config = aplicarAjustes(configPorDefecto(), { ...base, jornadaObjetivoHoras: 8, mencionar: 'Ana' })
    const vista = vistaDeAjustes(config)
    expect(vista.actuales).toMatchObject({ jornadaObjetivoHoras: 8, mencionar: 'Ana' })
    expect(vista.porDefecto).toEqual(base)
  })
})

describe('abrirRelojAlIniciar', () => {
  it('se guarda en la sección app y deja intacto el resto de app', () => {
    const original = configPorDefecto()
    const config = aplicarAjustes(original, { ...base, abrirRelojAlIniciar: false })
    expect(config.app).toEqual({ ...original.app, abrirRelojAlIniciar: false })
    expect(ajustesDeConfig(config).abrirRelojAlIniciar).toBe(false)
  })

  it('debe ser un booleano', () => {
    expect(validarAjustes({ ...base, abrirRelojAlIniciar: 'si' })).toMatchObject({ ok: false })
  })
})

describe('respuestasEnHilo', () => {
  it('viene activado de fábrica', () => {
    expect(base.respuestasEnHilo).toBe(true)
  })

  it('se guarda en la sección teams y deja intacto el resto de teams', () => {
    const original = configPorDefecto()
    const config = aplicarAjustes(original, { ...base, respuestasEnHilo: false })
    expect(config.teams).toEqual({ ...original.teams, respuestasEnHilo: false })
    expect(ajustesDeConfig(config).respuestasEnHilo).toBe(false)
  })

  it('debe ser un booleano', () => {
    expect(validarAjustes({ ...base, respuestasEnHilo: 'si' })).toMatchObject({ ok: false })
  })
})

describe('tema', () => {
  it('por defecto sigue la fecha', () => {
    expect(base.tema).toBe('auto')
  })

  it('se guarda en la sección app y deja intacto el resto de app', () => {
    const original = configPorDefecto()
    const config = aplicarAjustes(original, { ...base, tema: 'navidad' })
    expect(config.app).toEqual({ ...original.app, tema: 'navidad' })
    expect(ajustesDeConfig(config).tema).toBe('navidad')
  })

  it('acepta "auto", "clasico" y cualquier tema que exista', () => {
    for (const tema of ['auto', 'clasico', 'otono', 'carnaval']) expect(validarAjustes({ ...base, tema })).toMatchObject({ ok: true })
  })

  it('rechaza un tema que no existe o que no es texto', () => {
    expect(validarAjustes({ ...base, tema: 'pascua' })).toEqual({ ok: false, error: 'El tema no existe' })
    expect(validarAjustes({ ...base, tema: 3 })).toMatchObject({ ok: false })
  })
})

describe('plantillas', () => {
  const porDefecto = configPorDefecto().plantillas

  it('acepta las plantillas de fábrica', () => {
    expect(validarPlantillas(porDefecto)).toEqual({ ok: true, plantillas: porDefecto })
  })

  it('acepta textos propios con cualquier variable conocida, repetida o no', () => {
    const propias = { ...porDefecto, inicio: '{sol} {saludo}! Entro a las {hora} ({fecha}), {nombre}. {mencion} {mencion}' }
    expect(validarPlantillas(propias)).toMatchObject({ ok: true })
    expect(validarPlantillas({ ...porDefecto, ausencia: 'Me ausento: {motivo}' })).toMatchObject({ ok: true })
  })

  it.each([
    [{ inicio: '' }, 'no puede quedar vacío'],
    [{ regreso: '   ' }, 'no puede quedar vacío'],
    [{ fin: 'x'.repeat(501) }, 'no puede pasar de 500'],
    [{ almuerzo: 'A las {hroa}' }, '{hroa}'],
    [{ ausencia: 'Hola {}' }, 'no existe'],
    [{ regresoAlmuerzo: 'Vuelvo {Hora}' }, '{Hora}']
  ])('rechaza %j', (cambio, mensaje) => {
    const resultado = validarPlantillas({ ...porDefecto, ...cambio })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain(mensaje)
  })

  it('el error nombra la acción con el mismo texto del botón', () => {
    const resultado = validarPlantillas({ ...porDefecto, almuerzo: '' })
    expect(resultado.ok === false && resultado.error).toContain('Salir a almorzar')
  })

  it('rechaza lo que no es un objeto de plantillas', () => {
    expect(validarPlantillas(null)).toMatchObject({ ok: false })
    expect(validarPlantillas({ ...porDefecto, inicio: 5 })).toMatchObject({ ok: false })
    const { fin: _fin, ...incompleto } = porDefecto
    expect(validarPlantillas(incompleto)).toMatchObject({ ok: false })
  })

  it('aplicarPlantillas cambia solo las plantillas', () => {
    const original = configPorDefecto()
    const config = aplicarPlantillas(original, { ...porDefecto, inicio: 'Hola {hora}' })
    expect(config.plantillas.inicio).toBe('Hola {hora}')
    expect(config.plantillas.fin).toBe(original.plantillas.fin)
    expect(config.horario).toEqual(original.horario)
    expect(config.teams).toEqual(original.teams)
    expect(config.version).toBe(original.version)
  })

  it('vistaDePlantillas devuelve las actuales junto a las de fábrica', () => {
    const config = aplicarPlantillas(configPorDefecto(), { ...porDefecto, inicio: 'Hola' })
    const vista = vistaDePlantillas(config)
    expect(vista.actuales.inicio).toBe('Hola')
    expect(vista.porDefecto).toEqual(porDefecto)
  })
})
