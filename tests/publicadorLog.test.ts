import { describe, expect, it } from 'vitest'
import { PublicadorLog } from '../src/main/publicadores/log'

describe('PublicadorLog', () => {
  it('solo escribe el mensaje en el registro y resuelve sin enviar nada', async () => {
    const lineas: string[] = []
    const publicador = new PublicadorLog((texto) => lineas.push(texto))
    await expect(
      publicador.publicar('🟢 Inicio de jornada – 8:02 a. m.', { tipo: 'inicio', ocurridoEn: new Date(2026, 10, 6, 8, 2) })
    ).resolves.toBeUndefined()
    expect(lineas).toEqual(['[publicador de prueba] inicio → 🟢 Inicio de jornada – 8:02 a. m.'])
  })
})
