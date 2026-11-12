import { useState } from 'react'
import type { ResultadoReporte, TipoRangoReporte } from '../../../preload/tipos'
import { rangoDeReporte } from '../../../main/reporte'
import estilos from './Reporte.module.css'

interface Props {
  onVolver: () => void
}

const OPCIONES: { valor: TipoRangoReporte; texto: string }[] = [
  { valor: 'hoy', texto: 'Hoy' },
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
  { valor: 'personalizado', texto: 'Fechas' }
]

const formatoLargo = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'long' })
const formatoCorto = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' })

function hoyComoTexto(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

/** Exportar a Excel las jornadas de un rango: hoy, la semana, el mes o dos fechas. */
export default function Reporte({ onVolver }: Props): React.JSX.Element {
  const [tipo, setTipo] = useState<TipoRangoReporte>('semana')
  const [desde, setDesde] = useState(hoyComoTexto)
  const [hasta, setHasta] = useState(hoyComoTexto)
  const [exportando, setExportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoReporte | null>(null)

  const rango = rangoDeReporte(tipo, new Date(), tipo === 'personalizado' ? { desde, hasta } : undefined)
  let descripcion = 'Elige las dos fechas'
  if (rango.ok) {
    const ultimo = new Date(rango.rango.hasta.getFullYear(), rango.rango.hasta.getMonth(), rango.rango.hasta.getDate() - 1)
    descripcion =
      ultimo.getTime() === rango.rango.desde.getTime()
        ? formatoLargo.format(rango.rango.desde)
        : `Del ${formatoCorto.format(rango.rango.desde)} al ${formatoCorto.format(ultimo)}`
  } else if (desde && hasta) {
    descripcion = rango.error
  }

  async function exportar(): Promise<void> {
    setExportando(true)
    setResultado(null)
    try {
      setResultado(await window.jornify.exportarReporte({ rango: tipo, ...(tipo === 'personalizado' ? { desde, hasta } : {}) }))
    } finally {
      setExportando(false)
    }
  }

  return (
    <section className={estilos.vista} aria-labelledby="titulo-reporte">
      <div className={estilos.titular}>
        <button type="button" className={estilos.volver} onClick={onVolver} aria-label="Volver al historial" title="Volver al historial">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <h1 id="titulo-reporte" className={estilos.titulo}>
          Reporte de jornadas
        </h1>
      </div>

      <div className={estilos.opciones} role="radiogroup" aria-label="Período del reporte">
        {OPCIONES.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            role="radio"
            aria-checked={tipo === opcion.valor}
            className={estilos.opcion}
            onClick={() => {
              setTipo(opcion.valor)
              setResultado(null)
            }}
          >
            {opcion.texto}
          </button>
        ))}
      </div>

      {tipo === 'personalizado' && (
        <div className={estilos.fechas}>
          <label>
            Desde
            <input type="date" value={desde} onChange={(evento) => setDesde(evento.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} onChange={(evento) => setHasta(evento.target.value)} />
          </label>
        </div>
      )}

      <p className={estilos.descripcion}>{descripcion}</p>

      <p className={estilos.contenido}>
        El libro lleva dos hojas: <strong>Resumen</strong>, con una fila por día (entrada, salida, almuerzo, ausencias,
        horas trabajadas, meta y diferencia), y <strong>Eventos</strong>, con cada acción y su mensaje.
      </p>

      {resultado && !resultado.ok && (
        <p className={estilos.error} role="alert">
          {resultado.error}
        </p>
      )}
      {resultado?.ok && !resultado.cancelado && (
        <div className={estilos.hecho} role="status">
          <p>
            Guardado <strong>{resultado.nombreArchivo}</strong> con {resultado.dias} {resultado.dias === 1 ? 'día' : 'días'} y{' '}
            {resultado.eventos} {resultado.eventos === 1 ? 'evento' : 'eventos'}.
          </p>
          <button type="button" className={estilos.enlace} onClick={() => void window.jornify.mostrarReporte()}>
            Mostrar en la carpeta
          </button>
        </div>
      )}

      <button type="button" className={estilos.exportar} disabled={exportando || !rango.ok} onClick={() => void exportar()}>
        {exportando ? 'Generando…' : 'Exportar a Excel'}
      </button>
    </section>
  )
}
