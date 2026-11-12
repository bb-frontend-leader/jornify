// Íconos de Jornify dibujados en código, sin dependencias ni Electron: el logo (ventana, barra de tareas, avisos, instalador)
// y los íconos de la bandeja. Cada tema trae su propia identidad visual (degradado de fondo y una forma en lugar del punto).
//
// Este archivo solo usa sintaxis que Node borra sola (sin enums ni importaciones locales), para que los scripts de `scripts/`
// puedan importarlo con `node` directamente y la app y los scripts dibujen exactamente lo mismo.
import { deflateSync } from 'node:zlib'

type RGB = readonly [number, number, number]

export type Forma =
  | 'circulo'
  | 'hoja'
  | 'estrella'
  | 'corazon'
  | 'copo'
  | 'flor'
  | 'sol'
  | 'llama'
  | 'luna'
  | 'rombo'
  | 'bandera'
  | 'confeti'
  | 'sombrero'

export interface IdentidadVisual {
  /** Degradado vertical del fondo del logo, de arriba a abajo ("#rrggbb"). */
  fondo: readonly [string, string]
  /** Forma que ocupa el lugar del punto del logo y va de insignia en la bandeja. */
  forma: Forma
  /** Colores de la forma; la mayoría usa solo el primero. */
  colores: readonly [string, string, string]
}

export const IDENTIDAD_CLASICA: IdentidadVisual = {
  fondo: ['#167058', '#0a4636'],
  forma: 'circulo',
  colores: ['#f2a91f', '#f2a91f', '#f2a91f']
}

export type IconoDeEstado = 'fuera-de-jornada' | 'trabajando' | 'almuerzo' | 'ausente'

const BLANCO: RGB = [255, 255, 255]
const TINTA: RGB = [43, 27, 0]

/** Colores de la bandeja: algo más claros que la cara del reloj para verse sobre barras claras y oscuras. */
const DE_ESTADO: Record<IconoDeEstado, { disco: RGB; manecillas: RGB }> = {
  'fuera-de-jornada': { disco: [107, 124, 135], manecillas: BLANCO },
  trabajando: { disco: [23, 160, 111], manecillas: BLANCO },
  almuerzo: { disco: [242, 169, 31], manecillas: TINTA },
  ausente: { disco: [124, 91, 191], manecillas: BLANCO }
}

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const acotar = (valor: number, minimo: number, maximo: number): number => Math.max(minimo, Math.min(maximo, valor))

// --- Distancias firmadas (negativas = dentro) ---

type Distancia = (x: number, y: number) => number

const circulo =
  (cx: number, cy: number, r: number): Distancia =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) - r

/** Trazo grueso con extremos redondos. */
function capsula(x1: number, y1: number, x2: number, y2: number, grosor: number): Distancia {
  const [dx, dy] = [x2 - x1, y2 - y1]
  return (x, y) => {
    const t = acotar(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy), 0, 1)
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) - grosor / 2
  }
}

/** Rectángulo con las esquinas algo redondeadas. */
function caja(cx: number, cy: number, mitadAncho: number, mitadAlto: number, radio: number): Distancia {
  return (x, y) => {
    const [qx, qy] = [Math.abs(x - cx) - mitadAncho + radio, Math.abs(y - cy) - mitadAlto + radio]
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio
  }
}

/** Lente de dos arcos (hoja, llama): `largo` de punta a punta y `ancho` en el medio, con el eje apuntando a `angulo`. */
function lente(cx: number, cy: number, largo: number, ancho: number, angulo: number): Distancia {
  const mitadLargo = largo / 2
  const sagita = ancho / 2
  const d = (mitadLargo * mitadLargo - sagita * sagita) / (2 * sagita)
  const radio = d + sagita
  const [nx, ny] = [-Math.sin(angulo), Math.cos(angulo)]
  return (x, y) => {
    const [dx, dy] = [x - cx, y - cy]
    return Math.max(Math.hypot(dx - d * nx, dy - d * ny) - radio, Math.hypot(dx + d * nx, dy + d * ny) - radio)
  }
}

/** Estrella de cinco puntas con una punta hacia arriba (y positiva = abajo). */
function estrella(cx: number, cy: number, r: number, fraccion: number): Distancia {
  const [k1x, k1y] = [0.809016994375, -0.587785252292]
  const [k2x, k2y] = [-k1x, k1y]
  const [bax, bay] = [fraccion * -k1y, fraccion * k1x - 1]
  return (px, py) => {
    let [x, y] = [Math.abs(px - cx) / r, -(py - cy) / r]
    let m = 2 * Math.max(k1x * x + k1y * y, 0)
    x -= m * k1x
    y -= m * k1y
    m = 2 * Math.max(k2x * x + k2y * y, 0)
    x -= m * k2x
    y -= m * k2y
    x = Math.abs(x)
    y -= 1
    const h = acotar((x * bax + y * bay) / (bax * bax + bay * bay), 0, 1)
    return Math.hypot(x - bax * h, y - bay * h) * Math.sign(y * bax - x * bay) * r
  }
}

/** Corazón de `alto` píxeles (o unidades) con la punta hacia abajo. */
function corazon(cx: number, cy: number, alto: number): Distancia {
  return (px, py) => {
    const x = Math.abs(px - cx) / alto
    const y = (cy + alto * 0.5 - py) / alto
    const cuadrado = (a: number, b: number): number => a * a + b * b
    let d: number
    if (y + x > 1) d = Math.sqrt(cuadrado(x - 0.25, y - 0.75)) - Math.SQRT2 / 4
    else {
      const medio = 0.5 * Math.max(x + y, 0)
      d = Math.sqrt(Math.min(cuadrado(x, y - 1), cuadrado(x - medio, y - medio))) * Math.sign(x - y)
    }
    return d * alto
  }
}

const union =
  (...distancias: Distancia[]): Distancia =>
  (x, y) =>
    Math.min(...distancias.map((d) => d(x, y)))

interface Pieza {
  distancia: Distancia
  color: RGB
}

/** Las piezas de una forma centrada en (cx, cy), con `r` como radio base. */
function piezasDeForma(forma: Forma, cx: number, cy: number, r: number, colores: IdentidadVisual['colores']): Pieza[] {
  const [c0, c1, c2] = [rgb(colores[0]), rgb(colores[1]), rgb(colores[2])]
  const una = (distancia: Distancia): Pieza[] => [{ distancia, color: c0 }]
  const radianes = (grados: number): number => (grados * Math.PI) / 180
  switch (forma) {
    case 'circulo':
      return una(circulo(cx, cy, r))
    case 'hoja':
      return una(lente(cx, cy, 3.4 * r, 1.7 * r, radianes(-45)))
    case 'llama':
      return una(lente(cx, cy + 0.1 * r, 3.5 * r, 1.9 * r, radianes(-90)))
    case 'estrella':
      return una(estrella(cx, cy + 0.1 * r, 1.65 * r, 0.5))
    case 'corazon':
      return una(corazon(cx, cy, 2.7 * r))
    case 'copo':
      return una(
        union(
          ...[90, 30, 150].map((grados) => {
            const [dx, dy] = [Math.cos(radianes(grados)) * 1.45 * r, Math.sin(radianes(grados)) * 1.45 * r]
            return capsula(cx - dx, cy - dy, cx + dx, cy + dy, 0.6 * r)
          })
        )
      )
    case 'flor':
      return una(
        union(
          circulo(cx, cy, 0.7 * r),
          ...[0, 1, 2, 3, 4].map((i) => circulo(cx + Math.cos(radianes(-90 + 72 * i)) * 0.95 * r, cy + Math.sin(radianes(-90 + 72 * i)) * 0.95 * r, 0.7 * r))
        )
      )
    case 'sol':
      return una(
        union(
          circulo(cx, cy, 0.8 * r),
          ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = radianes(45 * i)
            return capsula(cx + Math.cos(a) * 1.15 * r, cy + Math.sin(a) * 1.15 * r, cx + Math.cos(a) * 1.65 * r, cy + Math.sin(a) * 1.65 * r, 0.4 * r)
          })
        )
      )
    case 'luna': {
      const cuerpo = circulo(cx, cy, 1.3 * r)
      const mordida = circulo(cx + 0.65 * r, cy - 0.4 * r, 1.1 * r)
      return una((x, y) => Math.max(cuerpo(x, y), -mordida(x, y)))
    }
    case 'rombo':
      return una((x, y) => (Math.abs(x - cx) + Math.abs(y - cy) - 1.7 * r) / Math.SQRT2)
    case 'sombrero': {
      // Copa (medio disco) y ala ancha.
      const base = cy + 0.55 * r
      const copa: Distancia = (x, y) => Math.max(Math.hypot(x - cx, y - base) - 1.3 * r, y - base)
      return una(union(copa, capsula(cx - 1.75 * r, base + 0.1 * r, cx + 1.75 * r, base + 0.1 * r, 0.6 * r)))
    }
    case 'bandera':
      // Amarillo el doble de alto que el azul y el rojo, como la bandera.
      return [
        { distancia: caja(cx, cy - 0.75 * r, 1.5 * r, 0.75 * r, 0.25 * r), color: c0 },
        { distancia: caja(cx, cy + 0.375 * r, 1.5 * r, 0.375 * r, 0.12 * r), color: c1 },
        { distancia: caja(cx, cy + 1.125 * r, 1.5 * r, 0.375 * r, 0.12 * r), color: c2 }
      ]
    case 'confeti':
      return [
        { distancia: circulo(cx - 0.9 * r, cy + 0.6 * r, 0.7 * r), color: c0 },
        { distancia: circulo(cx + 0.95 * r, cy - 0.1 * r, 0.6 * r), color: c1 },
        { distancia: capsula(cx - 0.4 * r, cy - 1.1 * r, cx + 0.5 * r, cy - 0.65 * r, 0.65 * r), color: c2 }
      ]
  }
}

// --- Rasterizado ---

/** Cobertura de un borde suavizado: `escala` son los píxeles por unidad de la distancia. */
const cobertura = (distancia: number, escala: number): number => acotar(0.5 - distancia * escala, 0, 1)

const mezclar = (base: RGB, color: RGB, parte: number): RGB => [
  base[0] + (color[0] - base[0]) * parte,
  base[1] + (color[1] - base[1]) * parte,
  base[2] + (color[2] - base[2]) * parte
]

/** El logo a `tam` px de lado, como RGBA (sin filtros de PNG). */
export function pixelesDelLogo(tam: number, identidad: IdentidadVisual = IDENTIDAD_CLASICA): Uint8Array {
  const [arriba, abajo] = [rgb(identidad.fondo[0]), rgb(identidad.fondo[1])]
  // El cuadrado redondeado, la J (barra de arriba, palo y gancho) y la forma, en coordenadas de 0 a 1.
  const cuadrado = caja(0.5, 0.5, 0.455, 0.455, 0.2)
  const grosor = 0.15
  const letra = union(
    capsula(0.46, 0.265, 0.77, 0.265, grosor),
    capsula(0.6, 0.265, 0.6, 0.6, grosor),
    (x, y) => {
      const [cx, cy, radio] = [0.4275, 0.6, 0.1725]
      if (y >= cy) return Math.abs(Math.hypot(x - cx, y - cy) - radio) - grosor / 2
      return Math.min(Math.hypot(x - (cx + radio), y - cy), Math.hypot(x - (cx - radio), y - cy)) - grosor / 2
    }
  )
  const piezas = piezasDeForma(identidad.forma, 0.27, 0.265, 0.066, identidad.colores)

  const datos = new Uint8Array(tam * tam * 4)
  for (let py = 0; py < tam; py++) {
    for (let px = 0; px < tam; px++) {
      const [x, y] = [(px + 0.5) / tam, (py + 0.5) / tam]
      let color = mezclar(arriba, abajo, y)
      color = mezclar(color, BLANCO, cobertura(letra(x, y), tam))
      for (const pieza of piezas) color = mezclar(color, pieza.color, cobertura(pieza.distancia(x, y), tam))
      const i = (py * tam + px) * 4
      datos[i] = Math.round(color[0])
      datos[i + 1] = Math.round(color[1])
      datos[i + 2] = Math.round(color[2])
      datos[i + 3] = Math.round(cobertura(cuadrado(x, y), tam) * 255)
    }
  }
  return datos
}

/** Compone `color` sobre un píxel con transparencia (RGBA en 0 a 255, alfa en 0 a 1). */
function sobre(base: { color: RGB; alfa: number }, color: RGB, parte: number): { color: RGB; alfa: number } {
  const alfa = parte + base.alfa * (1 - parte)
  if (alfa <= 0) return { color: base.color, alfa: 0 }
  const canal = (i: 0 | 1 | 2): number => (color[i] * parte + base.color[i] * base.alfa * (1 - parte)) / alfa
  return { color: [canal(0), canal(1), canal(2)], alfa }
}

export const TAM_BANDEJA = 32

/**
 * Ícono de la bandeja: un disco del color del estado con manecillas de reloj. Con una identidad, lleva además una insignia
 * redonda (fondo del tema, aro blanco y la forma del tema) en la esquina superior derecha; el disco no cambia nunca.
 */
export function pixelesDeBandeja(estado: IconoDeEstado, identidad: IdentidadVisual | null = null): Uint8Array {
  const { disco, manecillas } = DE_ESTADO[estado]
  const centro = (TAM_BANDEJA - 1) / 2
  const radioDisco = TAM_BANDEJA / 2 - 1.5
  const manoLarga = capsula(centro, centro, centro, 7.5, 3.2)
  const manoCorta = capsula(centro, centro, 22, 19.5, 3.2)
  const [bx, by] = [24, 8]
  const fondoInsignia = identidad ? rgb(identidad.fondo[0]) : BLANCO
  const piezas = identidad ? piezasDeForma(identidad.forma, bx, by, 2.5, identidad.colores) : []

  const datos = new Uint8Array(TAM_BANDEJA * TAM_BANDEJA * 4)
  for (let y = 0; y < TAM_BANDEJA; y++) {
    for (let x = 0; x < TAM_BANDEJA; x++) {
      const mano = Math.max(cobertura(manoLarga(x, y), 1), cobertura(manoCorta(x, y), 1))
      let pixel = {
        color: mezclar(disco, manecillas, mano),
        alfa: cobertura(Math.hypot(x - centro, y - centro) - radioDisco, 1)
      }
      if (identidad) {
        const distanciaInsignia = Math.hypot(x - bx, y - by)
        pixel = sobre(pixel, BLANCO, cobertura(distanciaInsignia - 7.3, 1))
        pixel = sobre(pixel, fondoInsignia, cobertura(distanciaInsignia - 6.1, 1))
        for (const pieza of piezas) pixel = sobre(pixel, pieza.color, cobertura(pieza.distancia(x, y), 1))
      }
      const i = (y * TAM_BANDEJA + x) * 4
      datos[i] = Math.round(pixel.color[0])
      datos[i + 1] = Math.round(pixel.color[1])
      datos[i + 2] = Math.round(pixel.color[2])
      datos[i + 3] = Math.round(pixel.alfa * 255)
    }
  }
  return datos
}

// --- PNG e ICO ---

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of datos) c = (TABLA_CRC[(c ^ byte) & 255] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloque(tipo: string, contenido: Buffer): Buffer {
  const cabecera = Buffer.alloc(8)
  cabecera.writeUInt32BE(contenido.length, 0)
  cabecera.write(tipo, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([cabecera.subarray(4), contenido])), 0)
  return Buffer.concat([cabecera, contenido, crc])
}

/** Codifica RGBA (4 bytes por píxel, filas seguidas) como PNG. */
export function codificarPng(rgba: Uint8Array, ancho: number, alto: number): Buffer {
  const filas = Buffer.alloc((ancho * 4 + 1) * alto)
  for (let y = 0; y < alto; y++) {
    const destino = y * (ancho * 4 + 1)
    filas[destino] = 0 // filtro: ninguno
    filas.set(rgba.subarray(y * ancho * 4, (y + 1) * ancho * 4), destino + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8 // profundidad de bits
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(filas, { level: 9 })),
    bloque('IEND', Buffer.alloc(0))
  ])
}

export function pngDelLogo(tam: number, identidad: IdentidadVisual = IDENTIDAD_CLASICA): Buffer {
  return codificarPng(pixelesDelLogo(tam, identidad), tam, tam)
}

export function pngDeBandeja(estado: IconoDeEstado, identidad: IdentidadVisual | null = null): Buffer {
  return codificarPng(pixelesDeBandeja(estado, identidad), TAM_BANDEJA, TAM_BANDEJA)
}

/** Un .ico con una imagen PNG por tamaño (Windows las admite desde Vista). El tamaño 256 se anota como 0. */
export function icoDelLogo(tamanos: readonly number[], identidad: IdentidadVisual = IDENTIDAD_CLASICA): Buffer {
  const imagenes = tamanos.map((tam) => ({ tam, datos: pngDelLogo(tam, identidad) }))
  const cabecera = Buffer.alloc(6 + 16 * imagenes.length)
  cabecera.writeUInt16LE(1, 2) // tipo: ícono
  cabecera.writeUInt16LE(imagenes.length, 4)
  let desplazamiento = cabecera.length
  imagenes.forEach(({ tam, datos }, i) => {
    const entrada = 6 + 16 * i
    cabecera[entrada] = tam >= 256 ? 0 : tam
    cabecera[entrada + 1] = tam >= 256 ? 0 : tam
    cabecera.writeUInt16LE(1, entrada + 4) // planos
    cabecera.writeUInt16LE(32, entrada + 6) // bits por píxel
    cabecera.writeUInt32LE(datos.length, entrada + 8)
    cabecera.writeUInt32LE(desplazamiento, entrada + 12)
    desplazamiento += datos.length
  })
  return Buffer.concat([cabecera, ...imagenes.map(({ datos }) => datos)])
}

export const TAMANOS_DEL_ICO = [16, 24, 32, 48, 64, 128, 256] as const
