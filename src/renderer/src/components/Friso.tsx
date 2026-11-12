import { useId } from 'react'
import { type Motivo, type Tema, temaPorId } from '../../../main/temas'
import estilos from './Friso.module.css'

const ANCHO = 32
const ALTO = 8
/** La baldosa se dibuja en 32 × 8 y se amplía para que el motivo se lea a la altura de la cinta (11 px). */
const ESCALA = 1.375

/** Una baldosa que se repite a lo ancho; cada motivo dibuja con los tres acentos del tema. */
function baldosa(motivo: Motivo, [a, b, c]: Tema['acentos']): React.JSX.Element | null {
  switch (motivo) {
    case 'hojas':
      return (
        <>
          <ellipse cx="6" cy="4" rx="4" ry="2" transform="rotate(-30 6 4)" fill={a} />
          <ellipse cx="17" cy="4" rx="4" ry="2" transform="rotate(25 17 4)" fill={b} />
          <ellipse cx="27" cy="4" rx="3.5" ry="1.8" transform="rotate(-15 27 4)" fill={c} />
        </>
      )
    case 'copos':
      return (
        <>
          <circle cx="5" cy="3" r="1.7" fill={a} />
          <circle cx="14" cy="5.5" r="1" fill={b} />
          <circle cx="22" cy="2.5" r="1.4" fill={c} />
          <circle cx="28" cy="5.5" r="0.9" fill={a} />
        </>
      )
    case 'flores':
      return (
        <>
          {[8, 24].map((x, i) => (
            <g key={x}>
              {[
                [-2.2, 0],
                [2.2, 0],
                [0, -2.2],
                [0, 2.2]
              ].map(([dx, dy]) => (
                <circle key={`${dx}${dy}`} cx={x + (dx ?? 0)} cy={4 + (dy ?? 0)} r="1.7" fill={i === 0 ? a : b} />
              ))}
              <circle cx={x} cy="4" r="1.2" fill={c} />
            </g>
          ))}
        </>
      )
    case 'corazones':
      return (
        <>
          {[8, 24].map((x, i) => (
            <path key={x} d={`M${x} 7 C${x - 5} 3.6 ${x - 2.6} 0.6 ${x} 2.9 C${x + 2.6} 0.6 ${x + 5} 3.6 ${x} 7Z`} fill={i === 0 ? a : b} />
          ))}
          <circle cx="16" cy="4" r="1" fill={c} />
        </>
      )
    case 'rayos':
      return (
        <>
          {[a, b, c, b].map((color, i) => (
            <path key={i} d={`M${i * 8} 8 L${i * 8 + 4} 1 L${i * 8 + 8} 8Z`} fill={color} />
          ))}
        </>
      )
    case 'luces':
      return (
        <>
          <path d="M0 1.5 Q8 4 16 1.5 T32 1.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.8" />
          <circle cx="4" cy="4.6" r="2" fill={a} />
          <circle cx="12" cy="5" r="2" fill={b} />
          <circle cx="20" cy="5" r="2" fill={c} />
          <circle cx="28" cy="4.6" r="2" fill={b} />
        </>
      )
    case 'llamas':
      return (
        <>
          {[5, 13, 21, 29].map((x, i) => (
            <path
              key={x}
              d={`M${x} 0.8 C${x + 2.4} 3.5 ${x + 2.2} 7.2 ${x} 7.2 C${x - 2.2} 7.2 ${x - 2.4} 3.5 ${x} 0.8Z`}
              fill={i % 2 === 0 ? a : b}
            />
          ))}
          <circle cx="9" cy="6" r="0.9" fill={c} />
          <circle cx="25" cy="6" r="0.9" fill={c} />
        </>
      )
    case 'confeti':
      return (
        <>
          <rect x="3" y="2" width="3.4" height="1.6" rx="0.4" transform="rotate(30 4.7 2.8)" fill={a} />
          <circle cx="11" cy="5" r="1.3" fill={b} />
          <rect x="17" y="4" width="3.4" height="1.6" rx="0.4" transform="rotate(-40 18.7 4.8)" fill={c} />
          <circle cx="25" cy="2.5" r="1.2" fill={a} />
          <rect x="27.5" y="5" width="3" height="1.4" rx="0.4" transform="rotate(20 29 5.7)" fill={b} />
        </>
      )
    case 'dientes':
      return (
        <>
          {[a, b, c, b].map((color, i) => (
            <path key={i} d={`M${i * 8} 0 L${i * 8 + 4} 7.5 L${i * 8 + 8} 0Z`} fill={color} />
          ))}
        </>
      )
    case 'rombos':
      return (
        <>
          <path d="M4 0 L8 4 L4 8 L0 4Z" fill={a} />
          <path d="M13 2 L16 4 L13 6 L10 4Z" fill={c} />
          <path d="M20 0 L24 4 L20 8 L16 4Z" fill={b} />
          <path d="M29 2 L32 4 L29 6 L26 4Z" fill={c} />
        </>
      )
    case 'cintas':
      return (
        <>
          <path d="M0 4 Q8 -1 16 4 T32 4" fill="none" stroke={a} strokeWidth="1.9" />
          <path d="M0 4 Q8 9 16 4 T32 4" fill="none" stroke={b} strokeWidth="1.9" />
          <circle cx="8" cy="1.6" r="0.9" fill={c} />
          <circle cx="24" cy="6.4" r="0.9" fill={c} />
        </>
      )
    case 'franjas':
      return null
  }
}

export default function Friso({ id }: { id: string }): React.JSX.Element | null {
  const patron = `friso${useId().replace(/:/g, '')}`
  const tema = temaPorId(id)
  if (!tema) return null
  const [a, b, c] = tema.acentos
  return (
    <svg className={estilos.friso} aria-hidden="true" focusable="false" data-motivo={tema.motivo}>
      {tema.motivo === 'franjas' ? (
        // Bandera: amarillo el doble de alto que el azul y el rojo.
        <>
          <rect width="100%" height="5.5" y="0.5" fill={a} />
          <rect width="100%" height="2.75" y="6" fill={b} />
          <rect width="100%" height="2.75" y="8.75" fill={c} />
        </>
      ) : (
        <>
          <defs>
            <pattern id={patron} width={ANCHO} height={ALTO} patternUnits="userSpaceOnUse" patternTransform={`scale(${ESCALA})`}>
              {baldosa(tema.motivo, tema.acentos)}
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${patron})`} />
        </>
      )}
    </svg>
  )
}
