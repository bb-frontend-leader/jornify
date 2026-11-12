import { describe, expect, it, vi } from 'vitest'
import {
  type AdaptadorInicioWindows,
  aplicarInicioConWindows,
  debePreguntarInicio,
  revisarInicioAlArrancar
} from '../src/main/arranque'
import { type Config, configPorDefecto } from '../src/main/configEsquema'
import type { Evento } from '../src/main/historial'

const evento = { id: 1, tipo: 'inicio', ocurridoEn: '2026-11-12T08:00:00.000-05:00', motivo: null, mensaje: '', estadoEnvio: 'enviado', enviadoEn: null, intentos: 0 } as const satisfies Evento

const conConfirmacion = (activa: boolean): Config => {
  const base = configPorDefecto()
  return { ...base, app: { ...base.app, confirmarInicioAlArrancar: activa } }
}

describe('debePreguntarInicio', () => {
  it('pregunta si la opción está activa y hoy no hay nada registrado', () => {
    expect(debePreguntarInicio(conConfirmacion(true), 'fuera_de_jornada', [])).toBe(true)
  })

  it('no pregunta con la opción desactivada', () => {
    expect(debePreguntarInicio(conConfirmacion(false), 'fuera_de_jornada', [])).toBe(false)
  })

  it('a mitad de jornada retoma el estado en lugar de preguntar', () => {
    expect(debePreguntarInicio(conConfirmacion(true), 'trabajando', [evento])).toBe(false)
    expect(debePreguntarInicio(conConfirmacion(true), 'en_almuerzo', [evento])).toBe(false)
  })

  it('si hoy ya se finalizó, no se vuelve a ofrecer', () => {
    expect(debePreguntarInicio(conConfirmacion(true), 'fuera_de_jornada', [evento, { ...evento, id: 2, tipo: 'fin' }])).toBe(false)
  })
})

describe('revisarInicioAlArrancar', () => {
  const base = { config: conConfirmacion(true), estado: 'fuera_de_jornada' as const, eventosDeHoy: [] as Evento[] }

  it('registra el inicio solo si la persona acepta', async () => {
    const registrarInicio = vi.fn(() => Promise.resolve())
    const resultado = await revisarInicioAlArrancar({ ...base, preguntar: () => Promise.resolve(true), registrarInicio })
    expect(resultado).toBe('registrado')
    expect(registrarInicio).toHaveBeenCalledOnce()
  })

  it('nunca publica sin confirmación: si dice que no, no registra nada', async () => {
    const registrarInicio = vi.fn(() => Promise.resolve())
    const resultado = await revisarInicioAlArrancar({ ...base, preguntar: () => Promise.resolve(false), registrarInicio })
    expect(resultado).toBe('rechazado')
    expect(registrarInicio).not.toHaveBeenCalled()
  })

  it('si no corresponde preguntar, ni siquiera pregunta', async () => {
    const preguntar = vi.fn(() => Promise.resolve(true))
    const registrarInicio = vi.fn(() => Promise.resolve())
    const resultado = await revisarInicioAlArrancar({ ...base, estado: 'trabajando', eventosDeHoy: [evento], preguntar, registrarInicio })
    expect(resultado).toBe('no_pregunta')
    expect(preguntar).not.toHaveBeenCalled()
    expect(registrarInicio).not.toHaveBeenCalled()
  })

  it('un error al preguntar o registrar se informa y no se propaga', async () => {
    const errores: string[] = []
    const resultado = await revisarInicioAlArrancar({
      ...base,
      preguntar: () => Promise.resolve(true),
      registrarInicio: () => Promise.reject(new Error('boom')),
      registrarError: (mensaje) => errores.push(mensaje)
    })
    expect(resultado).toBe('fallo')
    expect(errores).toHaveLength(1)
  })
})

describe('aplicarInicioConWindows', () => {
  const adaptador = (empaquetada: boolean, actual: boolean) => {
    const escribir = vi.fn()
    const datos: AdaptadorInicioWindows = { empaquetada, leer: () => actual, escribir }
    return { datos, escribir }
  }

  it('en desarrollo no toca el registro de Windows (registraría electron.exe)', () => {
    const { datos, escribir } = adaptador(false, false)
    expect(aplicarInicioConWindows(true, datos)).toBe('omitido_en_desarrollo')
    expect(escribir).not.toHaveBeenCalled()
  })

  it('instalada, activa el inicio si no estaba', () => {
    const { datos, escribir } = adaptador(true, false)
    expect(aplicarInicioConWindows(true, datos)).toBe('aplicado')
    expect(escribir).toHaveBeenCalledWith(true)
  })

  it('instalada, lo quita si estaba y se desactiva', () => {
    const { datos, escribir } = adaptador(true, true)
    expect(aplicarInicioConWindows(false, datos)).toBe('aplicado')
    expect(escribir).toHaveBeenCalledWith(false)
  })

  it('si ya está como se pidió, no escribe', () => {
    const { datos, escribir } = adaptador(true, true)
    expect(aplicarInicioConWindows(true, datos)).toBe('sin_cambios')
    expect(escribir).not.toHaveBeenCalled()
  })
})
