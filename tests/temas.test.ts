import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { identidadDelTema } from '../src/main/identidadesDeTemas'
import {
  ID_CLASICO,
  TEMAS,
  cssDelTema,
  domingoDePascua,
  esPreferenciaDeTema,
  oklchAHex,
  opcionesDePreferencia,
  paleta,
  temaDeLaFecha,
  temaPorId,
  temaVigente,
  type ModoColor
} from '../src/main/temas'

const f = (anio: number, mes: number, dia: number): Date => new Date(anio, mes - 1, dia, 10, 0, 0)

/** Contraste WCAG entre dos colores "#rrggbb". */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string): number => {
    const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const [r, g, bl] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [luminancia(a), luminancia(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('temas.ts en la interfaz', () => {
  // La interfaz importa temas.ts. Si este archivo (o iconos.ts) trae un módulo de Node, `npm run dev` deja la ventana en blanco
  // (en el build de producción no se nota, por eso hace falta esta guarda).
  it.each(['temas.ts', 'useTema.ts'])('%s no importa módulos de Node ni iconos.ts', (archivo) => {
    const ruta = archivo === 'useTema.ts' ? '../src/renderer/src/useTema.ts' : `../src/main/${archivo}`
    const fuente = readFileSync(new URL(ruta, import.meta.url), 'utf8')
    expect(fuente).not.toMatch(/from '(node:|fs|path|zlib|electron)/)
    expect(fuente).not.toMatch(/from '\.\/(iconos|identidad)/)
  })
})

describe('calendario de temas', () => {
  it('calcula el domingo de Pascua', () => {
    expect(domingoDePascua(2026)).toEqual(new Date(2026, 3, 5))
    expect(domingoDePascua(2025)).toEqual(new Date(2025, 3, 20))
    expect(domingoDePascua(2024)).toEqual(new Date(2024, 2, 31))
  })

  it('usa la estación del mes cuando no hay festividad', () => {
    expect(temaDeLaFecha(f(2026, 11, 12))).toBe('otono')
    expect(temaDeLaFecha(f(2026, 9, 1))).toBe('otono')
    expect(temaDeLaFecha(f(2026, 12, 15))).toBe('navidad')
    expect(temaDeLaFecha(f(2027, 1, 20))).toBe('invierno')
    expect(temaDeLaFecha(f(2026, 2, 5))).toBe('invierno')
    expect(temaDeLaFecha(f(2026, 3, 10))).toBe('primavera')
    expect(temaDeLaFecha(f(2026, 5, 31))).toBe('primavera')
    expect(temaDeLaFecha(f(2026, 6, 1))).toBe('verano')
    expect(temaDeLaFecha(f(2026, 8, 31))).toBe('verano')
  })

  it('las festividades le ganan a la estación', () => {
    expect(temaDeLaFecha(f(2026, 12, 7))).toBe('velitas')
    expect(temaDeLaFecha(f(2026, 12, 8))).toBe('velitas')
    expect(temaDeLaFecha(f(2026, 12, 9))).toBe('navidad')
    expect(temaDeLaFecha(f(2026, 12, 31))).toBe('ano_nuevo')
    expect(temaDeLaFecha(f(2027, 1, 1))).toBe('ano_nuevo')
    expect(temaDeLaFecha(f(2027, 1, 2))).toBe('invierno')
    expect(temaDeLaFecha(f(2026, 7, 20))).toBe('independencia')
    expect(temaDeLaFecha(f(2026, 7, 21))).toBe('verano')
    expect(temaDeLaFecha(f(2026, 8, 7))).toBe('boyaca')
    expect(temaDeLaFecha(f(2026, 10, 31))).toBe('halloween')
    expect(temaDeLaFecha(f(2026, 10, 27))).toBe('otono')
  })

  it('el Carnaval va del sábado al martes antes del Miércoles de Ceniza', () => {
    // Pascua 2026 = 5 de abril → Carnaval del 14 al 17 de febrero.
    expect(temaDeLaFecha(f(2026, 2, 13))).toBe('invierno')
    expect(temaDeLaFecha(f(2026, 2, 14))).toBe('carnaval')
    expect(temaDeLaFecha(f(2026, 2, 17))).toBe('carnaval')
    expect(temaDeLaFecha(f(2026, 2, 18))).toBe('invierno')
  })

  it('la semana del Día de la Madre termina el segundo domingo de mayo', () => {
    // 2026: segundo domingo = 10 de mayo.
    expect(temaDeLaFecha(f(2026, 5, 3))).toBe('primavera')
    expect(temaDeLaFecha(f(2026, 5, 4))).toBe('madre')
    expect(temaDeLaFecha(f(2026, 5, 10))).toBe('madre')
    expect(temaDeLaFecha(f(2026, 5, 11))).toBe('primavera')
  })

  it('la semana del Día del Padre termina el tercer domingo de junio', () => {
    // 2026: tercer domingo = 21 de junio.
    expect(temaDeLaFecha(f(2026, 6, 14))).toBe('verano')
    expect(temaDeLaFecha(f(2026, 6, 15))).toBe('padre')
    expect(temaDeLaFecha(f(2026, 6, 21))).toBe('padre')
    expect(temaDeLaFecha(f(2026, 6, 22))).toBe('verano')
  })

  it('la semana de Amor y Amistad es la del tercer sábado de septiembre', () => {
    // 2026: tercer sábado = 19 de septiembre → lunes 14 a domingo 20.
    expect(temaDeLaFecha(f(2026, 9, 13))).toBe('otono')
    expect(temaDeLaFecha(f(2026, 9, 14))).toBe('amor_amistad')
    expect(temaDeLaFecha(f(2026, 9, 20))).toBe('amor_amistad')
    expect(temaDeLaFecha(f(2026, 9, 21))).toBe('otono')
  })

  it('San Juan y San Pedro van del 24 al 29 de junio', () => {
    expect(temaDeLaFecha(f(2026, 6, 23))).toBe('verano')
    expect(temaDeLaFecha(f(2026, 6, 24))).toBe('san_juan_san_pedro')
    expect(temaDeLaFecha(f(2026, 6, 29))).toBe('san_juan_san_pedro')
    expect(temaDeLaFecha(f(2026, 6, 30))).toBe('verano')
    // El Día del Padre (tercer domingo) nunca cae encima: termina a lo sumo el 21.
    for (const anio of [2024, 2025, 2026, 2027, 2028, 2029, 2030]) expect(temaDeLaFecha(f(anio, 6, 22))).toBe('verano')
  })

  it('cada día del año resuelve a un tema que existe', () => {
    for (let dia = new Date(2026, 0, 1); dia.getFullYear() === 2026; dia.setDate(dia.getDate() + 1)) {
      expect(temaPorId(temaDeLaFecha(dia)), dia.toDateString()).not.toBeNull()
    }
  })
})

describe('preferencia de tema', () => {
  it('"auto" sigue la fecha; un id fijo se respeta; el clásico no tiene tema', () => {
    expect(temaVigente('auto', f(2026, 11, 12))).toBe('otono')
    expect(temaVigente('invierno', f(2026, 11, 12))).toBe('invierno')
    expect(temaVigente('clasico', f(2026, 11, 12))).toBe(ID_CLASICO)
    expect(temaPorId(ID_CLASICO)).toBeNull()
    expect(cssDelTema(ID_CLASICO)).toBe('')
  })

  it('un valor desconocido cae al clásico', () => {
    expect(temaVigente('navidad_2099', f(2026, 11, 12))).toBe(ID_CLASICO)
    expect(esPreferenciaDeTema('navidad_2099')).toBe(false)
    expect(esPreferenciaDeTema('auto')).toBe(true)
    expect(esPreferenciaDeTema('boyaca')).toBe(true)
  })

  it('el selector ofrece "según la fecha", "clásico" y todos los temas, sin repetir', () => {
    const opciones = opcionesDePreferencia()
    expect(opciones.slice(0, 2).map((o) => o.valor)).toEqual(['auto', 'clasico'])
    expect(opciones).toHaveLength(TEMAS.length + 2)
    expect(new Set(opciones.map((o) => o.valor)).size).toBe(opciones.length)
  })
})

describe('colores de los temas', () => {
  it('convierte OKLCH a hexadecimal', () => {
    expect(oklchAHex(1, 0, 0)).toBe('#ffffff')
    expect(oklchAHex(0, 0, 0)).toBe('#000000')
  })

  it('los ids son únicos y los matices válidos', () => {
    expect(new Set(TEMAS.map((t) => t.id)).size).toBe(TEMAS.length)
    for (const tema of TEMAS) {
      expect(tema.matiz).toBeGreaterThanOrEqual(0)
      expect(tema.matiz).toBeLessThan(360)
      for (const acento of tema.acentos) expect(acento).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  describe.each(TEMAS.map((t) => [t.nombre, t] as const))('%s', (_nombre, tema) => {
    describe.each<ModoColor>(['claro', 'oscuro'])('modo %s', (modo) => {
      const p = paleta(tema, modo)
      it('el texto se lee (AAA) y lo suave también (AA) sobre fondo y superficie', () => {
        expect(contraste(p.texto, p.fondo)).toBeGreaterThanOrEqual(7)
        expect(contraste(p.texto, p.superficie)).toBeGreaterThanOrEqual(7)
        expect(contraste(p.suave, p.fondo)).toBeGreaterThanOrEqual(4.5)
        expect(contraste(p.suave, p.superficie)).toBeGreaterThanOrEqual(4.5)
      })
      it('el foco y el borde se distinguen del fondo', () => {
        expect(contraste(p.foco, p.fondo)).toBeGreaterThanOrEqual(3)
        expect(contraste(p.foco, p.superficie)).toBeGreaterThanOrEqual(3)
        expect(contraste(p.borde, p.fondo)).toBeGreaterThanOrEqual(1.25)
      })
      it('los tres colores del friso se ven sobre el fondo', () => {
        for (const acento of tema.acentos) expect(contraste(acento, p.fondo), acento).toBeGreaterThanOrEqual(1.3)
      })
    })
  })

  it('cada tema tiene identidad para el logo y el clásico no', () => {
    expect(identidadDelTema(ID_CLASICO)).toBeNull()
    for (const tema of TEMAS) {
      const identidad = identidadDelTema(tema.id)
      expect(identidad, tema.id).not.toBeNull()
      for (const color of [...(identidad?.fondo ?? []), ...(identidad?.colores ?? [])]) expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('la forma del logo se distingue del fondo y la J blanca también', () => {
    for (const tema of TEMAS) {
      const identidad = identidadDelTema(tema.id)
      for (const fondo of identidad?.fondo ?? []) {
        expect(contraste('#ffffff', fondo), `${tema.id} J`).toBeGreaterThanOrEqual(3)
        expect(contraste(identidad?.colores[0] ?? '#000000', fondo), `${tema.id} forma`).toBeGreaterThanOrEqual(1.8)
      }
    }
  })

  it('el CSS redefine las variables en claro y en oscuro', () => {
    const css = cssDelTema('otono')
    expect(css).toMatch(/^:root\{--fondo:#[0-9a-f]{6};/)
    expect(css).toContain('@media (prefers-color-scheme: dark){:root{--fondo:')
    for (const nombre of ['fondo', 'superficie', 'texto', 'suave', 'borde', 'riel', 'foco']) expect(css).toContain(`--${nombre}:`)
  })

  it('el tema no toca los colores de estado ni los de error', () => {
    for (const tema of TEMAS) {
      const css = cssDelTema(tema.id)
      expect(css).not.toContain('--tramo')
      expect(css).not.toContain('--cara')
    }
  })
})
