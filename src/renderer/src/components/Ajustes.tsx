import { useEffect, useState } from 'react'
import type { Ajustes as DatosAjustes, AjustesVista } from '../../../preload/tipos'
import { opcionesDePreferencia, temaPorId, temaVigente } from '../../../main/temas'
import { salidaPlaneada } from '../../../main/tiempo'
import estilos from './Ajustes.module.css'
import Plantillas from './Plantillas'

interface Props {
  onVolver: () => void
  /** Tema que se ve mientras se elige (null al salir, para volver al guardado). */
  onTemaDePrueba: (tema: string | null) => void
}

/** Los campos se editan como texto para que escribir "9," o borrar el número no rompa el formulario. */
interface Formulario {
  horaEntrada: string
  jornada: string
  recorte: string
  almuerzo: string
  automatico: boolean
  mencionar: string
  enHilo: boolean
  abrirReloj: boolean
  iniciarWindows: boolean
  confirmarInicio: boolean
  recordarSalida: boolean
  recordarAlmuerzo: boolean
  tema: string
}

function aFormulario(a: DatosAjustes): Formulario {
  return {
    horaEntrada: a.horaEntrada,
    jornada: String(a.jornadaObjetivoHoras),
    recorte: String(a.recorteLunesHoras),
    almuerzo: String(a.duracionAlmuerzoMin),
    automatico: a.regresoAlmuerzoAutomatico,
    mencionar: a.mencionar,
    enHilo: a.respuestasEnHilo,
    abrirReloj: a.abrirRelojAlIniciar,
    iniciarWindows: a.iniciarConWindows,
    confirmarInicio: a.confirmarInicioAlArrancar,
    recordarSalida: a.recordarSalida,
    recordarAlmuerzo: a.recordarAlmuerzo,
    tema: a.tema
  }
}

function aAjustes(f: Formulario): DatosAjustes {
  return {
    horaEntrada: f.horaEntrada,
    jornadaObjetivoHoras: Number(f.jornada.replace(',', '.')),
    recorteLunesHoras: Number(f.recorte.replace(',', '.')),
    duracionAlmuerzoMin: Number(f.almuerzo.replace(',', '.')),
    regresoAlmuerzoAutomatico: f.automatico,
    mencionar: f.mencionar.trim(),
    respuestasEnHilo: f.enHilo,
    abrirRelojAlIniciar: f.abrirReloj,
    iniciarConWindows: f.iniciarWindows,
    confirmarInicioAlArrancar: f.confirmarInicio,
    recordarSalida: f.recordarSalida,
    recordarAlmuerzo: f.recordarAlmuerzo,
    tema: f.tema
  }
}

/** "9.5" → "9 h 30 min"; solo para la vista previa. */
function horasEnTexto(horas: number): string {
  const minutos = Math.round(horas * 60)
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Nombre del tema que toca hoy según la fecha. */
function nombreDelTema(fecha: Date): string {
  return temaPorId(temaVigente('auto', fecha))?.nombre ?? 'Clásico'
}

export default function Ajustes({ onVolver, onTemaDePrueba }: Props): React.JSX.Element {
  const [vista, setVista] = useState<AjustesVista | null>(null)
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [pestana, setPestana] = useState<'jornada' | 'mensajes' | 'general'>('jornada')
  const [empaquetada, setEmpaquetada] = useState(true)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.jornify.obtenerAjustes().then((datos) => {
      setVista(datos)
      setFormulario(aFormulario(datos.actuales))
    })
    void window.jornify.info().then((info) => {
      setEmpaquetada(info.empaquetada)
      setVersion(info.version)
    })
  }, [])

  // El tema elegido se ve al instante; al salir sin guardar se quita la prueba.
  const temaElegido = formulario?.tema
  useEffect(() => {
    if (temaElegido !== undefined) onTemaDePrueba(temaVigente(temaElegido, new Date()))
  }, [temaElegido, onTemaDePrueba])
  useEffect(() => () => onTemaDePrueba(null), [onTemaDePrueba])

  if (!vista || !formulario) return <section className={estilos.vista} aria-busy="true" />

  const cambiar = (cambios: Partial<Formulario>): void => {
    setFormulario({ ...formulario, ...cambios })
    setGuardado(false)
    setError(null)
  }

  const ajustes = aAjustes(formulario)
  const original = aFormulario(vista.actuales)
  const hayCambios = (Object.keys(original) as (keyof Formulario)[]).some((clave) => original[clave] !== formulario[clave])
  const salida = salidaPlaneada(ajustes.horaEntrada, ajustes.jornadaObjetivoHoras, ajustes.duracionAlmuerzoMin)
  const salidaLunes =
    salida !== null && ajustes.recorteLunesHoras > 0
      ? salidaPlaneada(ajustes.horaEntrada, ajustes.jornadaObjetivoHoras - ajustes.recorteLunesHoras, ajustes.duracionAlmuerzoMin)
      : null

  async function guardar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      const resultado = await window.jornify.guardarAjustes(ajustes)
      if (resultado.ok) {
        setVista({ ...vista!, actuales: ajustes })
        setFormulario(aFormulario(ajustes))
        setGuardado(true)
      } else {
        setError(resultado.error)
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className={estilos.vista} aria-labelledby="titulo-ajustes">
      <div className={estilos.titular}>
        <button type="button" className={estilos.volver} onClick={onVolver} aria-label="Volver al reloj" title="Volver al reloj">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <h1 id="titulo-ajustes" className={estilos.titulo}>
          Ajustes
        </h1>
        <div className={estilos.pestanas} role="radiogroup" aria-label="Tipo de ajustes">
          {(['jornada', 'mensajes', 'general'] as const).map((valor) => (
            <button key={valor} type="button" role="radio" aria-checked={pestana === valor} className={estilos.pestana} onClick={() => setPestana(valor)}>
              {valor === 'jornada' ? 'Jornada' : valor === 'mensajes' ? 'Mensajes' : 'General'}
            </button>
          ))}
        </div>
      </div>

      {pestana === 'mensajes' ? (
        <Plantillas mencionar={vista.actuales.mencionar} />
      ) : (
      <form className={estilos.formulario} onSubmit={(evento) => void guardar(evento)}>
        {pestana === 'jornada' ? (
          <>
        <div className={estilos.fila}>
          <label>
            Hora de entrada
            <input type="time" required value={formulario.horaEntrada} onChange={(e) => cambiar({ horaEntrada: e.target.value })} />
          </label>
          <label>
            Jornada (horas netas)
            <input inputMode="decimal" required value={formulario.jornada} onChange={(e) => cambiar({ jornada: e.target.value })} />
          </label>
        </div>
        <div className={estilos.fila}>
          <label>
            Recorte de los lunes (h)
            <input inputMode="decimal" required value={formulario.recorte} onChange={(e) => cambiar({ recorte: e.target.value })} />
          </label>
          <label>
            Almuerzo (minutos)
            <input inputMode="numeric" required value={formulario.almuerzo} onChange={(e) => cambiar({ almuerzo: e.target.value })} />
          </label>
        </div>
        <label className={estilos.casilla}>
          <input type="checkbox" checked={formulario.automatico} onChange={(e) => cambiar({ automatico: e.target.checked })} />
          Marcar solo el regreso del almuerzo
        </label>
        <label>
          Mencionar en los mensajes a
          <input value={formulario.mencionar} maxLength={80} placeholder="Nombre (vacío: sin mención)" onChange={(e) => cambiar({ mencionar: e.target.value })} />
        </label>

        <p className={estilos.resumen}>
          {salida === null ? (
            'Entrada, jornada y almuerzo no caben en el mismo día.'
          ) : (
            <>
              Salida planeada <strong>{salida}</strong>
              {salidaLunes !== null && (
                <>
                  , los lunes <strong>{salidaLunes}</strong> ({horasEnTexto(ajustes.jornadaObjetivoHoras - ajustes.recorteLunesHoras)} netas)
                </>
              )}
            </>
          )}
        </p>
          </>
        ) : (
          <div className={estilos.grupo}>
            <label>
              Tema de colores
              <select value={formulario.tema} onChange={(e) => cambiar({ tema: e.target.value })}>
                {opcionesDePreferencia().map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>
                    {opcion.valor === 'auto' ? `Según la fecha (hoy: ${nombreDelTema(new Date())})` : opcion.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className={estilos.casilla}>
              <input type="checkbox" checked={formulario.iniciarWindows} onChange={(e) => cambiar({ iniciarWindows: e.target.checked })} />
              Abrir Jornify al iniciar sesión en Windows
            </label>
            {!empaquetada && <p className={estilos.nota}>Solo funciona en la app instalada, no en desarrollo.</p>}
            <label className={estilos.casilla}>
              <input type="checkbox" checked={formulario.enHilo} onChange={(e) => cambiar({ enHilo: e.target.checked })} />
              Responder en el hilo de cada jornada en Teams
            </label>
            <label className={estilos.casilla}>
              <input type="checkbox" checked={formulario.confirmarInicio} onChange={(e) => cambiar({ confirmarInicio: e.target.checked })} />
              Preguntar al arrancar si registro el inicio
            </label>
            <label className={estilos.casilla}>
              <input type="checkbox" checked={formulario.abrirReloj} onChange={(e) => cambiar({ abrirReloj: e.target.checked })} />
              Abrir el reloj al iniciar Jornify
            </label>
            <label className={estilos.casilla}>
              <input type="checkbox" checked={formulario.recordarSalida} onChange={(e) => cambiar({ recordarSalida: e.target.checked })} />
              Avisar si pasa la hora de salida sin finalizar
            </label>
            <label className={estilos.casilla}>
              <input type="checkbox" checked={formulario.recordarAlmuerzo} onChange={(e) => cambiar({ recordarAlmuerzo: e.target.checked })} />
              Avisar si el almuerzo se pasa de la duración
            </label>
            {version && (
              <p className={estilos.version}>
                Jornify {version}
                {!empaquetada && ' (desarrollo)'}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className={estilos.error} role="alert">
            {error}
          </p>
        )}
        {guardado && !error && (
          <p className={estilos.hecho} role="status">
            Guardado. El reloj ya usa los valores nuevos.
          </p>
        )}

        <div className={estilos.botones}>
          <button
            type="button"
            className={estilos.secundario}
            onClick={() => cambiar({ ...aFormulario(vista.porDefecto), mencionar: formulario.mencionar })}
          >
            Valores de fábrica
          </button>
          <button type="submit" className={estilos.principal} disabled={guardando || !hayCambios}>
            Guardar
          </button>
        </div>
      </form>
      )}
    </section>
  )
}
