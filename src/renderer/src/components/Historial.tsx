import { useEffect, useState } from 'react'
import type { DiaHistorial, EventoHistorial, SemanaHistorial } from '../../../preload/tipos'
import { formatearHora } from '../../../main/plantillas'
import { fechaDeTexto, rangoDeReporte, textoDeFecha } from '../../../main/reporte'
import estilos from './Historial.module.css'

interface Props {
  onVolver: () => void
  onExportar: () => void
}

type Modo = 'dia' | 'semana'

const formatoDia = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const formatoCorto = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' })
const formatoSemanaCorto = new Intl.DateTimeFormat('es-CO', { weekday: 'short' })

/** Duración como H:MM, redondeada al minuto. */
function horasYMinutos(ms: number): string {
  const minutos = Math.round(Math.abs(ms) / 60_000)
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`
}

/** "+0:12" o "−1:05"; vacío si la diferencia es menor que un minuto. */
function diferencia(ms: number): string {
  if (Math.abs(ms) < 60_000) return '0:00'
  return `${ms > 0 ? '+' : '−'}${horasYMinutos(ms)}`
}

function desplazar(fecha: string, dias: number): string {
  const base = fechaDeTexto(fecha) ?? new Date()
  return textoDeFecha(new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias))
}

const ESTADOS_ENVIO: Record<EventoHistorial['estadoEnvio'], { texto: string; clase: string }> = {
  enviado: { texto: 'Enviado', clase: 'enviado' },
  pendiente: { texto: 'En cola', clase: 'enCola' },
  fallido: { texto: 'No se envió', clase: 'fallido' }
}

function FilaEvento({ evento, abierto, onAlternar }: { evento: EventoHistorial; abierto: boolean; onAlternar: () => void }): React.JSX.Element {
  const envio = ESTADOS_ENVIO[evento.estadoEnvio]
  return (
    <li className={estilos.evento}>
      <button type="button" className={estilos.eventoBoton} aria-expanded={abierto} onClick={onAlternar}>
        <span className={estilos.hora}>{formatearHora(new Date(evento.ocurridoMs))}</span>
        <span className={estilos.accion}>
          {evento.etiqueta}
          {evento.motivo && <span className={estilos.motivo}>{evento.motivo}</span>}
        </span>
        <span className={`${estilos.envio} ${estilos[envio.clase]}`}>{envio.texto}</span>
      </button>
      {abierto && (
        <p className={estilos.mensaje}>
          {evento.mensaje}
          {evento.intentos > 0 && evento.estadoEnvio !== 'enviado' && (
            <span className={estilos.intentos}>
              {' '}
              ({evento.intentos} {evento.intentos === 1 ? 'intento' : 'intentos'})
            </span>
          )}
        </p>
      )}
    </li>
  )
}

function VistaDia({ dia }: { dia: DiaHistorial }): React.JSX.Element {
  const [abierto, setAbierto] = useState<number | null>(null)

  if (!dia.hayRegistros) return <p className={estilos.vacio}>Sin registros este día.</p>

  const hora = (ms: number | null): string => (ms === null ? '—' : formatearHora(new Date(ms)))
  const extra = dia.trabajadoMs - dia.objetivoMs
  return (
    <>
      <dl className={estilos.resumen}>
        <div>
          <dt>Entrada</dt>
          <dd>{hora(dia.entradaMs)}</dd>
        </div>
        <div>
          <dt>Salida</dt>
          <dd>{hora(dia.salidaMs)}</dd>
        </div>
        <div>
          <dt>Trabajado</dt>
          <dd>
            {horasYMinutos(dia.trabajadoMs)}
            <span className={estilos.meta}> de {horasYMinutos(dia.objetivoMs)}</span>
          </dd>
        </div>
      </dl>
      <p className={estilos.detalle}>
        Almuerzo {horasYMinutos(dia.almuerzoMs)}, ausencias {horasYMinutos(dia.ausenteMs)}
        {extra >= 60_000 && <span className={estilos.extra}>, {horasYMinutos(extra)} de más</span>}
        {dia.observacion && <span>. {dia.observacion}</span>}
      </p>
      <ul className={estilos.eventos}>
        {dia.eventos.map((evento) => (
          <FilaEvento
            key={evento.id}
            evento={evento}
            abierto={abierto === evento.id}
            onAlternar={() => setAbierto((actual) => (actual === evento.id ? null : evento.id))}
          />
        ))}
      </ul>
    </>
  )
}

function VistaSemana({ semana, onElegir }: { semana: SemanaHistorial; onElegir: (fecha: string) => void }): React.JSX.Element {
  return (
    <>
      <ul className={estilos.dias}>
        {semana.dias.map((dia) => {
          const fecha = fechaDeTexto(dia.fecha) ?? new Date()
          const proporcion = dia.objetivoMs > 0 ? Math.min(1, dia.trabajadoMs / dia.objetivoMs) : 0
          const extra = dia.trabajadoMs - dia.objetivoMs
          const futuro = dia.fecha > semana.hoy
          return (
            <li key={dia.fecha}>
              <button
                type="button"
                className={estilos.dia}
                disabled={!dia.hayRegistros}
                onClick={() => onElegir(dia.fecha)}
                aria-label={`${formatoDia.format(fecha)}${dia.hayRegistros ? '' : ', sin registros'}`}
              >
                <span className={`${estilos.nombreDia} ${dia.fecha === semana.hoy ? estilos.hoy : ''}`}>
                  {formatoSemanaCorto.format(fecha).replace('.', '')} {fecha.getDate()}
                </span>
                <span className={estilos.riel} aria-hidden="true">
                  <span className={`${estilos.relleno} ${extra >= 60_000 ? estilos.rellenoExtra : ''}`} style={{ width: `${proporcion * 100}%` }} />
                </span>
                <span className={estilos.cifra}>{dia.hayRegistros ? horasYMinutos(dia.trabajadoMs) : futuro ? '' : '—'}</span>
                <span className={`${estilos.dif} ${extra >= 60_000 ? estilos.difExtra : ''}`}>
                  {dia.hayRegistros ? diferencia(extra) : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className={estilos.total}>
        <span>Total de la semana</span>
        <strong>
          {horasYMinutos(semana.totales.trabajadoMs)}
          <span className={estilos.meta}> de {horasYMinutos(semana.totales.objetivoMs)}</span>
        </strong>
      </p>
    </>
  )
}

/** Historial de jornadas: el detalle de un día (con el estado de envío de cada mensaje) o el resumen de la semana. */
export default function Historial({ onVolver, onExportar }: Props): React.JSX.Element {
  const [modo, setModo] = useState<Modo>('dia')
  const [fecha, setFecha] = useState(() => textoDeFecha(new Date()))
  const [semana, setSemana] = useState<SemanaHistorial | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refresco, setRefresco] = useState(0)

  const rango = rangoDeReporte('semana', fechaDeTexto(fecha) ?? new Date())
  const lunes = rango.ok ? textoDeFecha(rango.rango.desde) : fecha

  // Se vuelve a leer cuando se registra algo o cambia el estado de envío de un mensaje.
  useEffect(() => {
    const alCambiar = (): void => setRefresco((n) => n + 1)
    const quitarJornada = window.jornify.alCambiar(alCambiar)
    const quitarTeams = window.jornify.alCambiarTeams(alCambiar)
    return () => {
      quitarJornada()
      quitarTeams()
    }
  }, [])

  useEffect(() => {
    let vigente = true
    void window.jornify.obtenerHistorial(lunes).then((resultado) => {
      if (!vigente) return
      if (resultado.ok) {
        setSemana(resultado.semana)
        setError(null)
      } else {
        setError(resultado.error)
      }
    })
    return () => {
      vigente = false
    }
  }, [lunes, refresco])

  const hoy = semana?.hoy ?? textoDeFecha(new Date())
  const dia = semana?.dias.find((d) => d.fecha === fecha) ?? null
  const paso = modo === 'dia' ? 1 : 7
  const hayDespues = modo === 'dia' ? fecha < hoy : (semana?.hasta ?? lunes) < hoy
  const fechaCorta = (texto: string): string => formatoCorto.format(fechaDeTexto(texto) ?? new Date())
  const etiqueta =
    modo === 'dia'
      ? `${formatoDia.format(fechaDeTexto(fecha) ?? new Date())}${fecha === hoy ? ' (hoy)' : ''}`
      : semana
        ? `${fechaCorta(semana.desde)} al ${fechaCorta(semana.hasta)}`
        : ''

  return (
    <section className={estilos.vista} aria-labelledby="titulo-historial">
      <div className={estilos.titular}>
        <button type="button" className={estilos.volver} onClick={onVolver} aria-label="Volver al reloj" title="Volver al reloj">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <h1 id="titulo-historial" className={estilos.titulo}>
          Historial
        </h1>
        <button type="button" className={estilos.enlace} onClick={onExportar}>
          Exportar a Excel
        </button>
      </div>

      <div className={estilos.opciones} role="radiogroup" aria-label="Vista del historial">
        {(['dia', 'semana'] as const).map((valor) => (
          <button key={valor} type="button" role="radio" aria-checked={modo === valor} className={estilos.opcion} onClick={() => setModo(valor)}>
            {valor === 'dia' ? 'Día' : 'Semana'}
          </button>
        ))}
      </div>

      <div className={estilos.navegador}>
        <button type="button" className={estilos.paso} aria-label={modo === 'dia' ? 'Día anterior' : 'Semana anterior'} onClick={() => setFecha(desplazar(fecha, -paso))}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <p className={estilos.etiqueta} aria-live="polite">
          {etiqueta}
        </p>
        <button
          type="button"
          className={estilos.paso}
          aria-label={modo === 'dia' ? 'Día siguiente' : 'Semana siguiente'}
          disabled={!hayDespues}
          onClick={() => setFecha(desplazar(fecha, paso))}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 3 5 5-5 5" />
          </svg>
        </button>
      </div>

      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}

      <div className={estilos.contenido}>
        {!semana ? null : modo === 'dia' ? (
          dia && <VistaDia key={dia.fecha} dia={dia} />
        ) : (
          <VistaSemana
            semana={semana}
            onElegir={(elegida) => {
              setFecha(elegida)
              setModo('dia')
            }}
          />
        )}
      </div>
    </section>
  )
}
