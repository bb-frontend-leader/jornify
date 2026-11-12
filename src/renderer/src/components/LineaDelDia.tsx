import { formatearHora, formatearHoraEntera } from '../../../main/plantillas'
import { type TramoJornada, derivarProgreso, escalaDelDia, marcasDeHora } from '../../../main/tiempo'
import type { Instantanea } from '../../../preload/tipos'
import estilos from './LineaDelDia.module.css'

interface Props {
  instantanea: Instantanea
  ahora: number
}

const NOMBRE_TRAMO: Record<TramoJornada['estado'], string> = {
  trabajando: 'Trabajo',
  en_almuerzo: 'Almuerzo',
  ausente: 'Ausencia'
}

const hora = (ms: number): string => formatearHora(new Date(ms))

/**
 * La jornada de hoy como una cinta horizontal: tramos de trabajo, almuerzo y ausencia sobre el horario,
 * con la marca de "ahora" y la de la salida estimada.
 */
export default function LineaDelDia({ instantanea, ahora }: Props): React.JSX.Element {
  const { estado, tramos, horario, trabajadoMs, calculadoEn, corriendo, objetivoMs } = instantanea
  const enCurso = estado !== 'fuera_de_jornada'

  const trabajado = trabajadoMs + (corriendo ? Math.max(0, ahora - calculadoEn) : 0)
  const progreso = derivarProgreso(trabajado, objetivoMs / 3_600_000, estado, ahora)
  // Con la meta cumplida ya no hay salida que estimar (coincidiría con "ahora").
  const salidaEstimada = progreso.restanteMs > 0 ? (progreso.salidaEstimada?.getTime() ?? null) : null

  const escala = escalaDelDia(tramos, horario, ahora, salidaEstimada)
  const duracion = escala.finMs - escala.inicioMs
  const posicion = (ms: number): number => Math.min(100, Math.max(0, ((ms - escala.inicioMs) / duracion) * 100))
  const marcas = marcasDeHora(escala)

  const resumen =
    tramos.length === 0
      ? `Sin actividad hoy. Horario de ${hora(horario.entradaMs)} a ${hora(horario.salidaMs)}.`
      : tramos
          .map((t) => `${NOMBRE_TRAMO[t.estado]} desde ${hora(t.desdeMs)} ${t.hastaMs === null ? 'hasta ahora' : `hasta ${hora(t.hastaMs)}`}`)
          .join('. ')

  return (
    <div className={estilos.linea} role="img" aria-label={`Línea del día. ${resumen}`}>
      <div className={estilos.pista}>
        {tramos.map((tramo) => {
          const desde = posicion(tramo.desdeMs)
          const hasta = posicion(tramo.hastaMs ?? ahora)
          return (
            <span
              key={tramo.desdeMs}
              className={`${estilos.tramo} ${estilos[tramo.estado]}`}
              style={{ left: `${desde}%`, width: `${Math.max(0, hasta - desde)}%` }}
              title={`${NOMBRE_TRAMO[tramo.estado]}: ${hora(tramo.desdeMs)} a ${tramo.hastaMs === null ? 'ahora' : hora(tramo.hastaMs)}`}
            />
          )
        })}
      </div>

      {salidaEstimada !== null && (
        <span className={estilos.salida} style={{ left: `${posicion(salidaEstimada)}%` }} title={`Salida estimada ${hora(salidaEstimada)}`} />
      )}
      {enCurso && <span className={estilos.ahora} style={{ left: `${posicion(ahora)}%` }} title="Ahora" />}

      <div className={estilos.horas} aria-hidden="true">
        {marcas.map((marca, indice) => (
          <span
            key={marca}
            className={indice === 0 ? estilos.primera : indice === marcas.length - 1 ? estilos.ultima : ''}
            style={{ left: `${posicion(marca)}%` }}
          >
            {formatearHoraEntera(marca)}
          </span>
        ))}
      </div>
    </div>
  )
}
