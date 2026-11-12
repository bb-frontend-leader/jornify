import { useEffect, useRef, useState } from 'react'
import type { PlantillasMensajes, PlantillasVista } from '../../../preload/tipos'
import { VARIABLES_PLANTILLA, formatearMensaje } from '../../../main/plantillas'
import estilos from './Plantillas.module.css'

interface Props {
  /** Persona a la que se menciona hoy, para la vista previa. */
  mencionar: string
}

type Clave = keyof PlantillasMensajes

/** Mismos nombres que los botones del reloj y los de los mensajes. */
const MENSAJES: { clave: Clave; nombre: string }[] = [
  { clave: 'inicio', nombre: 'Iniciar jornada' },
  { clave: 'almuerzo', nombre: 'Salir a almorzar' },
  { clave: 'regresoAlmuerzo', nombre: 'Regresar de almuerzo' },
  { clave: 'ausencia', nombre: 'Ausentarme' },
  { clave: 'regreso', nombre: 'Regresar' },
  { clave: 'fin', nombre: 'Finalizar jornada' },
  { clave: 'finConRecuperacion', nombre: 'Finalizar con tiempo de más' }
]

const LARGO_MAXIMO = 500

/** Editor de los textos de cada mensaje, con las variables a un clic y una vista previa con datos de ejemplo. */
export default function Plantillas({ mencionar }: Props): React.JSX.Element {
  const [vista, setVista] = useState<PlantillasVista | null>(null)
  const [borrador, setBorrador] = useState<PlantillasMensajes | null>(null)
  const [clave, setClave] = useState<Clave>('inicio')
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void window.jornify.obtenerPlantillas().then((datos) => {
      setVista(datos)
      setBorrador(datos.actuales)
    })
  }, [])

  if (!vista || !borrador) return <div className={estilos.vista} aria-busy="true" />

  const texto = borrador[clave]
  const hayCambios = (Object.keys(vista.actuales) as Clave[]).some((k) => vista.actuales[k] !== borrador[k])

  const cambiar = (nuevo: string, quien: Clave = clave): void => {
    setBorrador({ ...borrador, [quien]: nuevo })
    setGuardado(false)
    setError(null)
  }

  function insertar(variable: string): void {
    const inicio = area.current?.selectionStart ?? texto.length
    const fin = area.current?.selectionEnd ?? texto.length
    const marca = `{${variable}}`
    cambiar(texto.slice(0, inicio) + marca + texto.slice(fin))
    const posicion = inicio + marca.length
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(posicion, posicion)
    })
  }

  async function guardar(): Promise<void> {
    if (!borrador || !vista) return
    setGuardando(true)
    setError(null)
    try {
      const resultado = await window.jornify.guardarPlantillas(borrador)
      if (resultado.ok) {
        setVista({ ...vista, actuales: borrador })
        setGuardado(true)
      } else {
        setError(resultado.error)
      }
    } finally {
      setGuardando(false)
    }
  }

  const previa = formatearMensaje(texto, {
    fecha: new Date(),
    nombre: 'Ale',
    mencion: mencionar,
    motivo: 'cita médica',
    recuperadoMs: 45 * 60_000
  })

  return (
    <div className={estilos.vista}>
      <select aria-label="Mensaje que se edita" value={clave} onChange={(e) => setClave(e.target.value as Clave)}>
        {MENSAJES.map((m) => (
          <option key={m.clave} value={m.clave}>
            {m.nombre}
            {borrador[m.clave] !== vista.actuales[m.clave] ? ' (sin guardar)' : ''}
          </option>
        ))}
      </select>

      <textarea
        ref={area}
        aria-label="Texto del mensaje"
        rows={3}
        maxLength={LARGO_MAXIMO}
        spellCheck
        value={texto}
        onChange={(e) => cambiar(e.target.value)}
      />

      <div className={estilos.variables} role="group" aria-label="Variables">
        {VARIABLES_PLANTILLA.map((variable) => (
          <button key={variable.nombre} type="button" className={estilos.variable} title={variable.ayuda} onClick={() => insertar(variable.nombre)}>
            {`{${variable.nombre}}`}
          </button>
        ))}
      </div>

      <p className={estilos.previa} aria-live="polite">
        <span className={estilos.previaTitulo}>Así se ve</span>
        {previa || 'El mensaje quedaría vacío.'}
      </p>

      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
      {guardado && !error && (
        <p className={estilos.hecho} role="status">
          Guardado. Los mensajes nuevos usan estos textos.
        </p>
      )}

      <div className={estilos.botones}>
        <button type="button" className={estilos.secundario} disabled={texto === vista.porDefecto[clave]} onClick={() => cambiar(vista.porDefecto[clave])}>
          Texto de fábrica
        </button>
        <button type="button" className={estilos.principal} disabled={guardando || !hayCambios} onClick={() => void guardar()}>
          Guardar
        </button>
      </div>
    </div>
  )
}
