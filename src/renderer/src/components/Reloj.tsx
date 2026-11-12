import { formatearHora } from '../../../main/plantillas'
import { derivarProgreso, formatearDuracion } from '../../../main/tiempo'
import type { Instantanea } from '../../../preload/tipos'
import estilos from './Reloj.module.css'

interface Props {
  instantanea: Instantanea
  /** Hora actual en ms; la actualiza useAhora. */
  ahora: number
}

/** Texto de apoyo de la esquina superior derecha de la cara. */
function textoDesde(instantanea: Instantanea): string {
  const ultimo = instantanea.tramos.at(-1)
  if (instantanea.estado !== 'fuera_de_jornada') return ultimo ? `desde ${formatearHora(new Date(ultimo.desdeMs))}` : ''
  if (ultimo?.hastaMs != null) return `terminó ${formatearHora(new Date(ultimo.hastaMs))}`
  return 'sin registrar hoy'
}

/**
 * La cara del reloj: un bloque cuyo color es el estado de la jornada, con el tiempo trabajado en grande,
 * lo que falta (u horas extra), la salida estimada y el avance.
 */
export default function Reloj({ instantanea, ahora }: Props): React.JSX.Element {
  const { estado, etiquetaEstado, trabajadoMs, calculadoEn, corriendo, objetivoMs, tramos } = instantanea

  // El reloj avanza aquí mismo a partir de la foto del proceso principal; no se le pide nada cada segundo.
  const trabajado = trabajadoMs + (corriendo ? Math.max(0, ahora - calculadoEn) : 0)
  const progreso = derivarProgreso(trabajado, objetivoMs / 3_600_000, estado, ahora)
  const enHorasExtra = progreso.extraMs > 0
  const terminada = estado === 'fuera_de_jornada' && tramos.length > 0
  const porcentaje = Math.round(progreso.progreso * 100)
  const enPausa = !corriendo && estado !== 'fuera_de_jornada'

  return (
    <section className={estilos.cara} data-estado={estado} aria-label="Reloj de jornada">
      <header className={estilos.encabezado}>
        <h1 className={estilos.estado}>{etiquetaEstado}</h1>
        <p className={estilos.desde}>{textoDesde(instantanea)}</p>
      </header>

      <p className={estilos.digital} aria-label="Tiempo trabajado hoy">
        {formatearDuracion(trabajado)}
      </p>

      <div className={estilos.fila}>
        <p>{enPausa ? 'trabajado hoy, en pausa' : 'trabajado hoy'}</p>
        {/* Con la meta cumplida la "salida estimada" sería la hora actual: no informa nada. */}
        <p>
          {enHorasExtra
            ? 'Jornada cumplida'
            : progreso.salidaEstimada
              ? `Salida ${formatearHora(progreso.salidaEstimada)}`
              : ''}
        </p>
      </div>

      <div className={estilos.restante}>
        {enHorasExtra ? (
          <p className={estilos.extra}>
            Horas extra <strong>{formatearDuracion(progreso.extraMs)}</strong>
          </p>
        ) : (
          <p>
            {terminada ? 'Faltaron' : 'Faltan'} <strong>{formatearDuracion(progreso.restanteMs)}</strong>
          </p>
        )}
      </div>

      <div
        className={estilos.riel}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
        aria-label="Avance de la jornada"
      >
        <div className={estilos.relleno} style={{ width: `${porcentaje}%` }} />
      </div>
    </section>
  )
}
