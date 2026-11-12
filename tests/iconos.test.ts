import { describe, expect, it } from 'vitest'
import {
  IDENTIDAD_CLASICA,
  TAMANOS_DEL_ICO,
  TAM_BANDEJA,
  type IconoDeEstado,
  icoDelLogo,
  pngDeBandeja,
  pngDelLogo,
  pixelesDeBandeja,
  pixelesDelLogo
} from '../src/main/iconos'
import { identidadDelTema } from '../src/main/identidadesDeTemas'
import { TEMAS } from '../src/main/temas'

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ESTADOS: IconoDeEstado[] = ['fuera-de-jornada', 'trabajando', 'almuerzo', 'ausente']

/** El píxel (x, y) de un RGBA cuadrado de lado `lado`. */
const pixel = (rgba: Uint8Array, lado: number, x: number, y: number): number[] => Array.from(rgba.subarray((y * lado + x) * 4, (y * lado + x) * 4 + 4))

describe('PNG e ICO', () => {
  it('el PNG del logo es un PNG con el tamaño pedido', () => {
    const png = pngDelLogo(48)
    expect(png.subarray(0, 8).equals(FIRMA_PNG)).toBe(true)
    expect(png.readUInt32BE(16)).toBe(48)
    expect(png.readUInt32BE(20)).toBe(48)
  })

  it('el PNG de la bandeja es de 32 × 32', () => {
    const png = pngDeBandeja('trabajando', identidadDelTema('navidad'))
    expect(png.subarray(0, 8).equals(FIRMA_PNG)).toBe(true)
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([TAM_BANDEJA, TAM_BANDEJA])
  })

  it('el ICO trae una imagen PNG por tamaño, bien apuntada', () => {
    const ico = icoDelLogo(TAMANOS_DEL_ICO, identidadDelTema('otono') ?? IDENTIDAD_CLASICA)
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, TAMANOS_DEL_ICO.length])
    TAMANOS_DEL_ICO.forEach((tam, i) => {
      const entrada = 6 + 16 * i
      expect(ico[entrada]).toBe(tam >= 256 ? 0 : tam)
      const [largo, desde] = [ico.readUInt32LE(entrada + 8), ico.readUInt32LE(entrada + 12)]
      const imagen = ico.subarray(desde, desde + largo)
      expect(imagen.subarray(0, 8).equals(FIRMA_PNG)).toBe(true)
      expect(imagen.readUInt32BE(16)).toBe(tam)
    })
  })

  it('dibujar dos veces da exactamente lo mismo', () => {
    expect(pngDelLogo(64, identidadDelTema('verano') ?? IDENTIDAD_CLASICA).equals(pngDelLogo(64, identidadDelTema('verano') ?? IDENTIDAD_CLASICA))).toBe(true)
  })
})

describe('logo', () => {
  const lado = 100

  it('es un cuadrado redondeado: las esquinas son transparentes y el centro opaco', () => {
    const logo = pixelesDelLogo(lado)
    expect(pixel(logo, lado, 0, 0)[3]).toBe(0)
    expect(pixel(logo, lado, lado - 1, lado - 1)[3]).toBe(0)
    expect(pixel(logo, lado, 50, 50)[3]).toBe(255)
  })

  it('la J es blanca en todos los temas', () => {
    for (const tema of TEMAS) {
      const logo = pixelesDelLogo(lado, identidadDelTema(tema.id) ?? IDENTIDAD_CLASICA)
      expect(pixel(logo, lado, 60, 40).slice(0, 3), tema.id).toEqual([255, 255, 255])
    }
  })

  it('cada tema se ve distinto del clásico y de los demás', () => {
    const huellas = new Set<string>([Buffer.from(pixelesDelLogo(lado)).toString('base64')])
    for (const tema of TEMAS.filter((t) => t.id !== 'boyaca')) {
      huellas.add(Buffer.from(pixelesDelLogo(lado, identidadDelTema(tema.id) ?? IDENTIDAD_CLASICA)).toString('base64'))
    }
    // Boyacá comparte logo con Independencia a propósito.
    expect(huellas.size).toBe(TEMAS.length)
  })

  it('la forma del tema cae donde iba el punto (arriba a la izquierda)', () => {
    const clasico = pixelesDelLogo(lado)
    const navidad = pixelesDelLogo(lado, identidadDelTema('navidad') ?? IDENTIDAD_CLASICA)
    // Centro del punto: (0.27, 0.265) → píxel (27, 26). Clásico: azafrán; Navidad: la estrella dorada.
    expect(pixel(clasico, lado, 27, 26).slice(0, 3)).toEqual([242, 169, 31])
    expect(pixel(navidad, lado, 27, 27).slice(0, 3)).toEqual([246, 201, 69])
  })
})

describe('bandeja', () => {
  it.each(ESTADOS)('%s: el disco conserva el color del estado en todos los temas', (estado) => {
    const clasico = pixelesDeBandeja(estado)
    // (6, 20): dentro del disco, lejos de las manecillas y de la insignia.
    const esperado = pixel(clasico, TAM_BANDEJA, 6, 20)
    expect(esperado[3]).toBe(255)
    for (const tema of TEMAS) {
      const conTema = pixelesDeBandeja(estado, identidadDelTema(tema.id))
      expect(pixel(conTema, TAM_BANDEJA, 6, 20), tema.id).toEqual(esperado)
      // Las manecillas tampoco se tocan: píxel sobre la manecilla corta, abajo a la derecha del centro.
      expect(pixel(conTema, TAM_BANDEJA, 19, 18), tema.id).toEqual(pixel(clasico, TAM_BANDEJA, 19, 18))
    }
  })

  it('el clásico no lleva insignia y un tema sí', () => {
    const clasico = pixelesDeBandeja('trabajando')
    const conTema = pixelesDeBandeja('trabajando', identidadDelTema('halloween'))
    // Esquina superior derecha: fuera del disco (transparente) en el clásico; aro blanco de la insignia con tema.
    expect(pixel(clasico, TAM_BANDEJA, 29, 3)[3]).toBe(0)
    expect(pixel(conTema, TAM_BANDEJA, 29, 3)[3]).toBeGreaterThan(100)
  })

  it('cada tema deja una insignia distinta en la bandeja', () => {
    const huellas = new Set(TEMAS.filter((t) => t.id !== 'boyaca').map((t) => Buffer.from(pixelesDeBandeja('trabajando', identidadDelTema(t.id))).toString('base64')))
    expect(huellas.size).toBe(TEMAS.length - 1)
  })
})
