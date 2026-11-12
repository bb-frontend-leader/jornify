// Identidad del logo y de la insignia de la bandeja de cada tema. SOLO la usa el proceso principal: importa iconos.ts, que
// necesita node:zlib, y la interfaz no puede cargarlo (en `npm run dev` Vite lo rechaza y la ventana queda en blanco).
// Por eso vive aparte de temas.ts, que sí importa la interfaz.
import type { IdentidadVisual } from './iconos'

/**
 * Identidad del logo y de la insignia de la bandeja de cada tema. El logo lleva siempre la J blanca, así que el fondo es oscuro
 * o saturado; la forma ocupa el lugar del punto. El clásico y los ids desconocidos usan `IDENTIDAD_CLASICA`.
 */
const IDENTIDADES: Record<string, IdentidadVisual> = {
  otono: { fondo: ['#b4561f', '#6f3315'], forma: 'hoja', colores: ['#f2b134', '#f2b134', '#f2b134'] },
  invierno: { fondo: ['#3b79b8', '#1e3f66'], forma: 'copo', colores: ['#e3f1ff', '#e3f1ff', '#e3f1ff'] },
  primavera: { fondo: ['#4c9a52', '#2b6a36'], forma: 'flor', colores: ['#ffb3cc', '#ffb3cc', '#ffb3cc'] },
  verano: { fondo: ['#14a0ac', '#0a6670'], forma: 'sol', colores: ['#ffd23f', '#ffd23f', '#ffd23f'] },
  navidad: { fondo: ['#b3112b', '#6e0a1a'], forma: 'estrella', colores: ['#f6c945', '#f6c945', '#f6c945'] },
  velitas: { fondo: ['#8a4a12', '#4e2a0a'], forma: 'llama', colores: ['#ffc933', '#ffc933', '#ffc933'] },
  ano_nuevo: { fondo: ['#34388a', '#1a1c4d'], forma: 'estrella', colores: ['#f0c24b', '#f0c24b', '#f0c24b'] },
  amor_amistad: { fondo: ['#d23f68', '#8f1f43'], forma: 'corazon', colores: ['#ffc2d1', '#ffc2d1', '#ffc2d1'] },
  halloween: { fondo: ['#5f3b91', '#321b52'], forma: 'luna', colores: ['#ff8a1f', '#ff8a1f', '#ff8a1f'] },
  madre: { fondo: ['#c84b76', '#862a4d'], forma: 'flor', colores: ['#ffe1ea', '#ffe1ea', '#ffe1ea'] },
  padre: { fondo: ['#27508a', '#142c52'], forma: 'rombo', colores: ['#e3b948', '#e3b948', '#e3b948'] },
  san_juan_san_pedro: { fondo: ['#e0471f', '#8c220a'], forma: 'sombrero', colores: ['#ffd23f', '#ffd23f', '#ffd23f'] },
  independencia: { fondo: ['#2a2f3a', '#14171d'], forma: 'bandera', colores: ['#fcd116', '#1f56c4', '#ce1126'] },
  boyaca: { fondo: ['#2a2f3a', '#14171d'], forma: 'bandera', colores: ['#fcd116', '#1f56c4', '#ce1126'] },
  carnaval: { fondo: ['#b5006a', '#6e0041'], forma: 'confeti', colores: ['#ffd400', '#00c2e0', '#ff7a00'] }
}

/** La identidad del logo para un tema; `null` si es el clásico (sin insignia en la bandeja). */
export function identidadDelTema(id: string): IdentidadVisual | null {
  return IDENTIDADES[id] ?? null
}
