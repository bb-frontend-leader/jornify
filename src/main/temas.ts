// Temas de temporada y festividades de Colombia. Lógica pura (sin Electron): la interfaz también la importa.
//
// Regla de diseño: el color de ESTADO (pino, azafrán, ciruela, pizarra) nunca cambia. El tema solo viste lo neutro
// (fondo, superficies, bordes, foco) y pone un friso decorativo al pie de la ventana.
// Cada tema fija un matiz y un croma; las luminosidades son las mismas en todos, así el contraste es parejo por construcción.

export type Motivo =
  | 'hojas'
  | 'copos'
  | 'flores'
  | 'corazones'
  | 'rayos'
  | 'luces'
  | 'llamas'
  | 'confeti'
  | 'franjas'
  | 'dientes'
  | 'rombos'
  | 'cintas'

export interface Tema {
  id: string
  nombre: string
  motivo: Motivo
  /** Tres colores del friso; se leen bien sobre fondo claro y oscuro. */
  acentos: readonly [string, string, string]
  /** Matiz (0 a 360) y croma de las superficies. */
  matiz: number
  croma: number
  /** Matiz y croma del color de foco (anillo de teclado, enlaces). */
  matizFoco: number
  cromaFoco: number
}

export const ID_CLASICO = 'clasico'
export const PREFERENCIA_AUTOMATICA = 'auto'

const franjaTricolor = ['#f2bd00', '#2f6fd0', '#ce1126'] as const

export const TEMAS: readonly Tema[] = [
  { id: 'otono', nombre: 'Otoño', motivo: 'hojas', acentos: ['#c0602a', '#dc9a24', '#7d8a3a'], matiz: 76, croma: 0.02, matizFoco: 52, cromaFoco: 0.11 },
  { id: 'invierno', nombre: 'Invierno', motivo: 'copos', acentos: ['#3d7bbd', '#8fbbe3', '#7fa9d0'], matiz: 255, croma: 0.022, matizFoco: 252, cromaFoco: 0.12 },
  { id: 'primavera', nombre: 'Primavera', motivo: 'flores', acentos: ['#e8688f', '#f2b632', '#6fb35f'], matiz: 350, croma: 0.02, matizFoco: 150, cromaFoco: 0.11 },
  { id: 'verano', nombre: 'Verano', motivo: 'rayos', acentos: ['#f5b82e', '#ff7f50', '#18a6b3'], matiz: 198, croma: 0.022, matizFoco: 210, cromaFoco: 0.1 },
  { id: 'navidad', nombre: 'Navidad', motivo: 'luces', acentos: ['#c4122f', '#2e8b57', '#e2b13c'], matiz: 25, croma: 0.005, matizFoco: 152, cromaFoco: 0.1 },
  { id: 'velitas', nombre: 'Día de las Velitas', motivo: 'llamas', acentos: ['#f4b942', '#e8892a', '#c76a12'], matiz: 82, croma: 0.026, matizFoco: 58, cromaFoco: 0.1 },
  { id: 'ano_nuevo', nombre: 'Año nuevo', motivo: 'luces', acentos: ['#d4a62a', '#6a70c0', '#a9aedb'], matiz: 280, croma: 0.02, matizFoco: 285, cromaFoco: 0.13 },
  { id: 'amor_amistad', nombre: 'Amor y Amistad', motivo: 'corazones', acentos: ['#e0557a', '#ff9db5', '#b3203f'], matiz: 8, croma: 0.022, matizFoco: 15, cromaFoco: 0.15 },
  { id: 'halloween', nombre: 'Halloween', motivo: 'dientes', acentos: ['#f27a1a', '#8a5cc8', '#e9a35a'], matiz: 305, croma: 0.022, matizFoco: 305, cromaFoco: 0.13 },
  { id: 'madre', nombre: 'Día de la Madre', motivo: 'flores', acentos: ['#d94f7a', '#f3a8bf', '#4f9a5b'], matiz: 15, croma: 0.022, matizFoco: 8, cromaFoco: 0.14 },
  { id: 'padre', nombre: 'Día del Padre', motivo: 'rombos', acentos: ['#3f6fb0', '#7fa6d6', '#c9a24a'], matiz: 248, croma: 0.018, matizFoco: 255, cromaFoco: 0.12 },
  { id: 'san_juan_san_pedro', nombre: 'San Juan y San Pedro', motivo: 'cintas', acentos: ['#d9381e', '#f2a900', '#2f9e6a'], matiz: 40, croma: 0.024, matizFoco: 35, cromaFoco: 0.13 },
  { id: 'independencia', nombre: 'Día de la Independencia', motivo: 'franjas', acentos: franjaTricolor, matiz: 100, croma: 0.008, matizFoco: 262, cromaFoco: 0.17 },
  { id: 'boyaca', nombre: 'Batalla de Boyacá', motivo: 'franjas', acentos: franjaTricolor, matiz: 100, croma: 0.008, matizFoco: 262, cromaFoco: 0.17 },
  { id: 'carnaval', nombre: 'Carnaval de Barranquilla', motivo: 'confeti', acentos: ['#e6007e', '#00a6d6', '#ffb800'], matiz: 330, croma: 0.02, matizFoco: 322, cromaFoco: 0.17 }
]

/** Para el selector de Ajustes: la preferencia y su nombre. "auto" y "clásico" van primero. */
export function opcionesDePreferencia(): { valor: string; nombre: string }[] {
  return [
    { valor: PREFERENCIA_AUTOMATICA, nombre: 'Según la fecha' },
    { valor: ID_CLASICO, nombre: 'Clásico (sin tema)' },
    ...TEMAS.map((tema) => ({ valor: tema.id, nombre: tema.nombre }))
  ]
}

export function esPreferenciaDeTema(valor: string): boolean {
  return valor === PREFERENCIA_AUTOMATICA || valor === ID_CLASICO || TEMAS.some((tema) => tema.id === valor)
}

/** El tema con ese id, o null si es el clásico (o un id desconocido): sin tema no se toca la paleta de base. */
export function temaPorId(id: string): Tema | null {
  return TEMAS.find((tema) => tema.id === id) ?? null
}

// --- Calendario ---

const clave = (fecha: Date): number => fecha.getFullYear() * 10_000 + (fecha.getMonth() + 1) * 100 + fecha.getDate()
const dia = (anio: number, mes: number, diaDelMes: number): Date => new Date(anio, mes - 1, diaDelMes)
const sumarDias = (fecha: Date, dias: number): Date => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias)

/** El n-ésimo día de la semana (0 = domingo) de un mes. */
function enesimoDiaDeSemana(anio: number, mes: number, diaDeSemana: number, n: number): Date {
  const primero = dia(anio, mes, 1)
  const desplazamiento = (diaDeSemana - primero.getDay() + 7) % 7
  return dia(anio, mes, 1 + desplazamiento + 7 * (n - 1))
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const diaDelMes = ((h + l - 7 * m + 114) % 31) + 1
  return dia(anio, mes, diaDelMes)
}

interface Festividad {
  id: string
  desde: (anio: number) => Date
  hasta: (anio: number) => Date
}

/** En orden de prioridad: una festividad le gana a la temporada. */
const FESTIVIDADES: readonly Festividad[] = [
  { id: 'ano_nuevo', desde: (a) => dia(a, 12, 31), hasta: (a) => dia(a, 12, 31) },
  { id: 'ano_nuevo', desde: (a) => dia(a, 1, 1), hasta: (a) => dia(a, 1, 1) },
  // Noche de velitas (7 de diciembre) y la Inmaculada (8).
  { id: 'velitas', desde: (a) => dia(a, 12, 7), hasta: (a) => dia(a, 12, 8) },
  // Carnaval de Barranquilla: del sábado al martes antes del Miércoles de Ceniza (46 días antes de Pascua).
  { id: 'carnaval', desde: (a) => sumarDias(domingoDePascua(a), -50), hasta: (a) => sumarDias(domingoDePascua(a), -47) },
  // Semana (lunes a domingo) del Día de la Madre: segundo domingo de mayo.
  { id: 'madre', desde: (a) => sumarDias(enesimoDiaDeSemana(a, 5, 0, 2), -6), hasta: (a) => enesimoDiaDeSemana(a, 5, 0, 2) },
  // Semana del Día del Padre: tercer domingo de junio.
  { id: 'padre', desde: (a) => sumarDias(enesimoDiaDeSemana(a, 6, 0, 3), -6), hasta: (a) => enesimoDiaDeSemana(a, 6, 0, 3) },
  // Fiestas sanjuaneras del Tolima y el Huila: San Juan (24 de junio) hasta San Pedro (29).
  { id: 'san_juan_san_pedro', desde: (a) => dia(a, 6, 24), hasta: (a) => dia(a, 6, 29) },
  { id: 'independencia', desde: (a) => dia(a, 7, 20), hasta: (a) => dia(a, 7, 20) },
  { id: 'boyaca', desde: (a) => dia(a, 8, 7), hasta: (a) => dia(a, 8, 7) },
  // Semana (lunes a domingo) del Día de Amor y Amistad: tercer sábado de septiembre.
  { id: 'amor_amistad', desde: (a) => sumarDias(enesimoDiaDeSemana(a, 9, 6, 3), -5), hasta: (a) => sumarDias(enesimoDiaDeSemana(a, 9, 6, 3), 1) },
  { id: 'halloween', desde: (a) => dia(a, 10, 28), hasta: (a) => dia(a, 10, 31) }
]

/** Temporada por mes: como el hemisferio norte, que es lo que se pidió (Colombia no tiene estaciones). */
function temporadaDelMes(mes: number): string {
  if (mes === 12) return 'navidad'
  if (mes <= 2) return 'invierno'
  if (mes <= 5) return 'primavera'
  if (mes <= 8) return 'verano'
  return 'otono'
}

/** Id del tema que toca en esa fecha: la festividad del día, o si no la temporada del mes. */
export function temaDeLaFecha(fecha: Date): string {
  const hoy = clave(fecha)
  const anio = fecha.getFullYear()
  const festividad = FESTIVIDADES.find((f) => clave(f.desde(anio)) <= hoy && hoy <= clave(f.hasta(anio)))
  return festividad?.id ?? temporadaDelMes(fecha.getMonth() + 1)
}

/** El tema que se aplica según la preferencia guardada ("auto", "clasico" o el id de un tema). */
export function temaVigente(preferencia: string, fecha: Date): string {
  if (preferencia === PREFERENCIA_AUTOMATICA) return temaDeLaFecha(fecha)
  return esPreferenciaDeTema(preferencia) ? preferencia : ID_CLASICO
}

// --- Color ---

/** OKLCH a sRGB en hexadecimal, recortado al gamut. */
export function oklchAHex(luminosidad: number, croma: number, matiz: number): string {
  const radianes = (matiz * Math.PI) / 180
  const a = croma * Math.cos(radianes)
  const b = croma * Math.sin(radianes)
  const l = (luminosidad + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (luminosidad - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (luminosidad - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lineal = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
  const codificar = (valor: number): string => {
    const acotado = Math.min(1, Math.max(0, valor))
    const gamma = acotado <= 0.0031308 ? 12.92 * acotado : 1.055 * acotado ** (1 / 2.4) - 0.055
    return Math.round(gamma * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${lineal.map(codificar).join('')}`
}

export type ModoColor = 'claro' | 'oscuro'

export interface Paleta {
  fondo: string
  superficie: string
  texto: string
  suave: string
  borde: string
  riel: string
  foco: string
}

/** Las superficies y el foco del tema, con las mismas luminosidades en todos los temas. */
export function paleta(tema: Tema, modo: ModoColor): Paleta {
  const { matiz: h, croma: c, matizFoco, cromaFoco } = tema
  if (modo === 'claro') {
    return {
      fondo: oklchAHex(0.94, c, h),
      superficie: oklchAHex(0.995, c * 0.25, h),
      texto: oklchAHex(0.24, c * 1.3, h),
      suave: oklchAHex(0.46, c * 1.4, h),
      borde: oklchAHex(0.79, c * 1.1, h),
      riel: oklchAHex(0.87, c, h),
      foco: oklchAHex(0.44, cromaFoco, matizFoco)
    }
  }
  return {
    fondo: oklchAHex(0.27, c * 1.4, h),
    superficie: oklchAHex(0.32, c * 1.4, h),
    texto: oklchAHex(0.95, c * 0.4, h),
    suave: oklchAHex(0.77, c * 0.8, h),
    borde: oklchAHex(0.44, c * 1.2, h),
    riel: oklchAHex(0.38, c * 1.2, h),
    foco: oklchAHex(0.8, cromaFoco, matizFoco)
  }
}

function variables(paletaDelModo: Paleta): string {
  return Object.entries(paletaDelModo)
    .map(([nombre, valor]) => `--${nombre}:${valor}`)
    .join(';')
}

/**
 * Hoja de estilos del tema: redefine las variables neutras de `estilos.css` (claro y oscuro).
 * Devuelve '' para el clásico, que conserva la paleta de base.
 */
export function cssDelTema(id: string): string {
  const tema = temaPorId(id)
  if (!tema) return ''
  return `:root{${variables(paleta(tema, 'claro'))}}@media (prefers-color-scheme: dark){:root{${variables(paleta(tema, 'oscuro'))}}}`
}
