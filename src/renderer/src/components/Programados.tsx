import { useState } from 'react'
import type { ProgramadoVista } from '../../../preload/tipos'
import { type TipoEvento, etiquetaDeAccion } from '../../../main/estado'
import { formatearHora } from '../../../main/plantillas'
import estilos from './Programados.module.css'

interface Props {
  programados: ProgramadoVista[]
  onVolver: () => void
}

// Las acciones que más se programan van primero.
const TIPOS: TipoEvento[] = ['ausencia', 'regreso', 'almuerzo', 'regreso_almuerzo', 'fin', 'inicio']

/** Próximo múltiplo de 5 minutos a partir de ahora + 5 min, como "HH:MM". */
function horaSugerida(): string {
  const base = new Date(Date.now() + 5 * 60_000)
  const minutos = Math.ceil(base.getMinutes() / 5) * 5
  base.setMinutes(minutos, 0, 0)
  return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`
}

function estadoEnTexto(programado: ProgramadoVista): string {
  switch (programado.estado) {
    case 'ejecutado':
      return 'Enviado'
    case 'cancelado':
      return programado.nota ?? 'Cancelado'
    case 'omitido':
      return programado.nota ?? 'Omitido'
    case 'pendiente':
      return programado.origen === 'automatico' ? 'Automático' : 'Pendiente'
  }
}

/** Mensajes programados de hoy: una acción real (con su mensaje) que se registra sola a la hora elegida. */
export default function Programados({ programados, onVolver }: Props): React.JSX.Element {
  const [tipo, setTipo] = useState<TipoEvento>('ausencia')
  const [hora, setHora] = useState(horaSugerida)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function programar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const resultado = await window.jornify.programar({ tipo, hora, mensaje: mensaje.trim() || undefined })
      if (resultado.ok) setMensaje('')
      else setError(resultado.error)
    } finally {
      setEnviando(false)
    }
  }

  async function cancelar(id: number): Promise<void> {
    const resultado = await window.jornify.cancelarProgramado(id)
    setError(resultado.ok ? null : resultado.error)
  }

  return (
    <section className={estilos.vista} aria-labelledby="titulo-programados">
      <div className={estilos.titular}>
        <button type="button" className={estilos.volver} onClick={onVolver} aria-label="Volver al reloj" title="Volver al reloj">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <h1 id="titulo-programados" className={estilos.titulo}>
          Mensajes programados
        </h1>
      </div>

      <form className={estilos.formulario} onSubmit={(evento) => void programar(evento)}>
        <div className={estilos.fila}>
          <select aria-label="Acción" value={tipo} onChange={(evento) => setTipo(evento.target.value as TipoEvento)}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {etiquetaDeAccion(t)}
              </option>
            ))}
          </select>
          <input aria-label="Hora" type="time" required value={hora} onChange={(evento) => setHora(evento.target.value)} />
        </div>
        <input
          aria-label="Mensaje propio"
          value={mensaje}
          maxLength={500}
          placeholder="Mensaje propio (vacío: el de siempre)"
          onChange={(evento) => setMensaje(evento.target.value)}
        />
        <button type="submit" className={estilos.programar} disabled={enviando || !hora}>
          Programar
        </button>
        {error && (
          <p className={estilos.error} role="alert">
            {error}
          </p>
        )}
      </form>

      {programados.length === 0 ? (
        <p className={estilos.vacio}>
          Nada programado para hoy. Al salir a almorzar, el regreso se programa solo para dentro de una hora.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {programados.map((p) => (
            <li key={p.id} className={`${estilos.item} ${p.estado === 'pendiente' ? '' : estilos.resuelto}`}>
              <span className={estilos.hora}>{formatearHora(new Date(p.horaMs))}</span>
              <span className={estilos.detalle} title={p.mensaje ?? undefined}>
                <span className={estilos.accion}>{p.etiqueta}</span>
                <span className={estilos.estado}>
                  {estadoEnTexto(p)}
                  {p.mensaje ? `: ${p.mensaje}` : ''}
                </span>
              </span>
              {p.estado === 'pendiente' && (
                <button type="button" className={estilos.cancelar} onClick={() => void cancelar(p.id)} aria-label={`Cancelar ${p.etiqueta} de las ${formatearHora(new Date(p.horaMs))}`}>
                  Cancelar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
