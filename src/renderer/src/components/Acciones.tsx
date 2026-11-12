import { useEffect, useRef, useState } from 'react'
import type { AccionDisponible } from '../../../preload/tipos'
import estilos from './Acciones.module.css'

interface Props {
  acciones: AccionDisponible[]
  ocupado: boolean
  /** Muestra el cuadro del motivo de ausencia (lo activa el botón o el menú de la bandeja). */
  pidiendoMotivo: boolean
  onPedirMotivo: (valor: boolean) => void
  onEjecutar: (tipo: AccionDisponible['tipo'], motivo?: string) => void
}

/** Acciones válidas del estado actual: la primera es la principal; la ausencia pide un motivo opcional. */
export default function Acciones({ acciones, ocupado, pidiendoMotivo, onPedirMotivo, onEjecutar }: Props): React.JSX.Element {
  const [motivo, setMotivo] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pidiendoMotivo) campo.current?.focus()
    else setMotivo('')
  }, [pidiendoMotivo])

  // Si la ausencia ya no es una acción válida (cambió el estado), se cierra el cuadro.
  const ausenciaDisponible = acciones.some((accion) => accion.tipo === 'ausencia')
  useEffect(() => {
    if (!ausenciaDisponible) onPedirMotivo(false)
  }, [ausenciaDisponible, onPedirMotivo])

  if (pidiendoMotivo && ausenciaDisponible) {
    return (
      <form
        className={estilos.motivo}
        onSubmit={(evento) => {
          evento.preventDefault()
          onEjecutar('ausencia', motivo)
        }}
      >
        <label htmlFor="motivo">Motivo de la ausencia (opcional)</label>
        <input
          id="motivo"
          ref={campo}
          value={motivo}
          maxLength={200}
          placeholder="Reunión, cita médica…"
          onChange={(evento) => setMotivo(evento.target.value)}
          onKeyDown={(evento) => evento.key === 'Escape' && onPedirMotivo(false)}
        />
        <div className={estilos.par}>
          <button type="button" className={estilos.secundario} onClick={() => onPedirMotivo(false)}>
            Cancelar
          </button>
          <button type="submit" className={estilos.principal} disabled={ocupado}>
            Ausentarme
          </button>
        </div>
      </form>
    )
  }

  const [principal, ...otras] = acciones
  return (
    <div className={estilos.acciones}>
      {principal && (
        <button
          type="button"
          disabled={ocupado}
          className={estilos.principal}
          onClick={() => (principal.tipo === 'ausencia' ? onPedirMotivo(true) : onEjecutar(principal.tipo))}
        >
          {principal.etiqueta}
        </button>
      )}
      {otras.length > 0 && (
        <div className={estilos.par}>
          {otras.map(({ tipo, etiqueta }) => (
            <button
              key={tipo}
              type="button"
              disabled={ocupado}
              className={estilos.secundario}
              onClick={() => (tipo === 'ausencia' ? onPedirMotivo(true) : onEjecutar(tipo))}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
