import { useEffect, useState } from 'react'
import type { ElementoTeams, EstadoTeams } from '../../../preload/tipos'
import estilos from './Teams.module.css'
import { resumirTeams } from './resumenTeams'

interface Props {
  estado: EstadoTeams | null
  onVolver: () => void
}

type Edicion = 'app' | 'canal' | null

/** El ID se muestra recortado: basta para reconocerlo. */
const recortarId = (id: string): string => `${id.slice(0, 8)}…`

function EditorApp({ estado, onListo, onCancelar }: { estado: EstadoTeams; onListo: () => void; onCancelar: (() => void) | null }): React.JSX.Element {
  const [clientId, setClientId] = useState(estado.clientId)
  const [tenantId, setTenantId] = useState(estado.tenantId)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      const resultado = await window.jornify.guardarAppMicrosoft({ clientId, tenantId })
      if (resultado.ok) onListo()
      else setError(resultado.error)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className={estilos.editor} onSubmit={(e) => void guardar(e)}>
      <p className={estilos.ayuda}>
        Registra una aplicación en Microsoft Entra ID (cliente público, redirección http://localhost) y pega aquí su ID.
      </p>
      <label>
        ID de la aplicación
        <input required spellCheck={false} placeholder="00000000-0000-0000-0000-000000000000" value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <label>
        Inquilino
        <input spellCheck={false} placeholder="organizations" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
      </label>
      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
      <div className={estilos.botones}>
        {onCancelar && (
          <button type="button" className={estilos.secundario} onClick={onCancelar}>
            Cancelar
          </button>
        )}
        <button type="submit" className={estilos.principal} disabled={guardando || clientId.trim() === ''}>
          Guardar
        </button>
      </div>
    </form>
  )
}

function EditorCanal({ estado, onListo, onCancelar }: { estado: EstadoTeams; onListo: () => void; onCancelar: () => void }): React.JSX.Element {
  const [equipos, setEquipos] = useState<ElementoTeams[] | null>(null)
  const [canales, setCanales] = useState<ElementoTeams[]>([])
  const [equipoId, setEquipoId] = useState(estado.equipo?.id ?? '')
  const [canalId, setCanalId] = useState(estado.canal?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    void window.jornify.listarEquipos().then((resultado) => {
      if (!vigente) return
      if (resultado.ok) setEquipos(resultado.elementos)
      else setError(resultado.error)
    })
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    if (!equipoId) return
    let vigente = true
    void window.jornify.listarCanales(equipoId).then((resultado) => {
      if (!vigente) return
      if (resultado.ok) {
        setCanales(resultado.elementos)
        setCanalId((actual) => (resultado.elementos.some((c) => c.id === actual) ? actual : ''))
      } else {
        setError(resultado.error)
      }
    })
    return () => {
      vigente = false
    }
  }, [equipoId])

  const equipo = equipos?.find((e) => e.id === equipoId)
  const canal = canales.find((c) => c.id === canalId)

  async function guardar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault()
    if (!equipo || !canal) return
    setGuardando(true)
    setError(null)
    try {
      const resultado = await window.jornify.elegirCanal({
        equipoId: equipo.id,
        equipoNombre: equipo.nombre,
        canalId: canal.id,
        canalNombre: canal.nombre
      })
      if (resultado.ok) onListo()
      else setError(resultado.error)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className={estilos.editor} onSubmit={(e) => void guardar(e)}>
      <label>
        Equipo
        <select
          value={equipoId}
          disabled={equipos === null}
          onChange={(e) => {
            setEquipoId(e.target.value)
            setCanales([])
            setCanalId('')
          }}
        >
          <option value="">{equipos === null && !error ? 'Cargando equipos…' : 'Elige un equipo'}</option>
          {equipos?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        Canal
        <select value={canalId} disabled={!equipoId || canales.length === 0} onChange={(e) => setCanalId(e.target.value)}>
          <option value="">{equipoId && canales.length === 0 && !error ? 'Cargando canales…' : 'Elige un canal'}</option>
          {canales.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
      <div className={estilos.botones}>
        <button type="button" className={estilos.secundario} onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className={estilos.principal} disabled={guardando || !equipo || !canal}>
          Guardar
        </button>
      </div>
    </form>
  )
}

export default function Teams({ estado, onVolver }: Props): React.JSX.Element {
  const [edicion, setEdicion] = useState<Edicion>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'hecho'; texto: string } | null>(null)

  const titular = (
    <div className={estilos.titular}>
      <button type="button" className={estilos.volver} onClick={onVolver} aria-label="Volver al reloj" title="Volver al reloj">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 3 5 8l5 5" />
        </svg>
      </button>
      <h1 id="titulo-teams" className={estilos.titulo}>Teams</h1>
    </div>
  )

  if (!estado) return <section className={estilos.vista} aria-busy="true" />

  // Sin aplicación registrada no hay nada más que hacer: el formulario sale solo.
  const editando: Edicion = !estado.clientId ? 'app' : edicion

  async function hacer(nombre: string, accion: () => Promise<{ ok: boolean; error?: string } | void>, exito?: string): Promise<void> {
    setTrabajando(nombre)
    setMensaje(null)
    try {
      const resultado = await accion()
      if (resultado && !resultado.ok) setMensaje({ tipo: 'error', texto: resultado.error ?? 'No se pudo completar' })
      else if (exito) setMensaje({ tipo: 'hecho', texto: exito })
    } finally {
      setTrabajando(null)
    }
  }

  const resumen = resumirTeams(estado)
  const { cola } = estado

  if (editando) {
    return (
      <section className={estilos.vista} aria-labelledby="titulo-teams">
        {titular}
        {editando === 'app' ? (
          <EditorApp estado={estado} onListo={() => setEdicion(null)} onCancelar={estado.clientId ? () => setEdicion(null) : null} />
        ) : (
          <EditorCanal estado={estado} onListo={() => setEdicion(null)} onCancelar={() => setEdicion(null)} />
        )}
      </section>
    )
  }

  return (
    <section className={estilos.vista} aria-label="Conexión con Teams">
      {titular}

      <dl className={estilos.filas}>
        <div className={estilos.fila}>
          <dt>Aplicación</dt>
          <dd>{recortarId(estado.clientId)}</dd>
          <button type="button" className={estilos.enlace} onClick={() => setEdicion('app')}>
            Cambiar
          </button>
        </div>
        <div className={estilos.fila}>
          <dt>Cuenta</dt>
          <dd>{estado.sesion ? estado.sesion.nombre : 'Sin iniciar sesión'}</dd>
          {estado.sesion ? (
            <button type="button" className={estilos.enlace} disabled={trabajando !== null} onClick={() => void hacer('cerrar', () => window.jornify.cerrarSesion())}>
              Cerrar sesión
            </button>
          ) : (
            <button
              type="button"
              className={estilos.enlace}
              disabled={trabajando !== null}
              onClick={() => void hacer('iniciar', () => window.jornify.iniciarSesion())}
            >
              {trabajando === 'iniciar' ? 'Esperando…' : 'Iniciar sesión'}
            </button>
          )}
        </div>
        <div className={estilos.fila}>
          <dt>Canal</dt>
          <dd>{estado.equipo && estado.canal ? `${estado.equipo.nombre} › ${estado.canal.nombre}` : 'Sin elegir'}</dd>
          <button type="button" className={estilos.enlace} disabled={!estado.sesion} onClick={() => setEdicion('canal')}>
            {estado.canal ? 'Cambiar' : 'Elegir'}
          </button>
        </div>
      </dl>

      <div className={`${estilos.estado} ${estilos[resumen.nivel]}`} role="status">
        <p className={estilos.estadoTitulo}>{resumen.texto}</p>
        {/* Si falta configurar algo, el título ya lo dice: el detalle solo cuenta qué espera. */}
        {!estado.listo && cola.pendientes > 0 && (
          <p className={estilos.estadoDetalle}>
            {cola.pendientes === 1 ? '1 mensaje espera' : `${cola.pendientes} mensajes esperan`} para salir en cuanto quede listo.
          </p>
        )}
        {estado.listo && cola.bloqueo && cola.pendientes > 0 && (
          <p className={estilos.estadoDetalle}>{cola.requiereAccion ? cola.bloqueo : `${cola.bloqueo}. Se reintenta solo.`}</p>
        )}
        {estado.listo && cola.pendientes > 0 && !cola.bloqueo && <p className={estilos.estadoDetalle}>Saliendo ahora.</p>}
      </div>

      {estado.sesion && estado.mencionar && estado.menciones === 'sin_permiso' && (
        <p className={estilos.nota}>
          La mención a {estado.mencionar} sale como texto.{' '}
          <button
            type="button"
            className={estilos.enlace}
            disabled={trabajando !== null}
            onClick={() => void hacer('menciones', () => window.jornify.activarMenciones(), 'Menciones activadas.')}
          >
            Activar menciones
          </button>
        </p>
      )}
      {estado.sesion && estado.mencionar && estado.menciones === 'no_encontrada' && (
        <p className={estilos.nota}>No se encontró a {estado.mencionar} en el directorio: la mención sale como texto.</p>
      )}

      {mensaje && (
        <p className={mensaje.tipo === 'error' ? estilos.error : estilos.hecho} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      <div className={estilos.botones}>
        <button
          type="button"
          className={estilos.secundario}
          disabled={trabajando !== null || cola.pendientes + cola.fallidos === 0}
          onClick={() => void hacer('reintentar', () => window.jornify.reintentarEnvios())}
        >
          Reintentar envíos
        </button>
        <button
          type="button"
          className={estilos.principal}
          disabled={trabajando !== null || !estado.listo}
          onClick={() => void hacer('prueba', () => window.jornify.enviarPrueba(), 'Mensaje de prueba enviado.')}
        >
          {trabajando === 'prueba' ? 'Enviando…' : 'Enviar prueba'}
        </button>
      </div>
    </section>
  )
}
