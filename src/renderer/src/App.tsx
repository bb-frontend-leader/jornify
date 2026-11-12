import { useCallback, useEffect, useState } from 'react'
import type { EstadoTeams, Instantanea, ProgramadoVista } from '../../preload/tipos'
import estilos from './App.module.css'
import Acciones from './components/Acciones'
import Ajustes from './components/Ajustes'
import Friso from './components/Friso'
import Historial from './components/Historial'
import LineaDelDia from './components/LineaDelDia'
import Programados from './components/Programados'
import Reloj from './components/Reloj'
import Reporte from './components/Reporte'
import Teams from './components/Teams'
import { resumirTeams } from './components/resumenTeams'
import { useAhora } from './useAhora'
import { useTema } from './useTema'

function IconoHistorial(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.2 8a5.8 5.8 0 1 0 1.8-4.2" />
      <path d="M2.4 2.2v2.8h2.8" />
      <path d="M8 5v3.2l2 1.2" />
    </svg>
  )
}

function IconoTeams(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3.2h12v7.4H8.6L5.4 13.4v-2.8H2V3.2Z" />
    </svg>
  )
}

function IconoChincheta(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 1.8 14.2 6.5 12.6 8.1 12 10.6 5.4 4 7.9 3.4 9.5 1.8Z" />
      <path d="M5.2 10.8 2 14" />
    </svg>
  )
}

function IconoCampana(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8.6" r="5.4" />
      <path d="M8 5.8v3l2 1.2" />
      <path d="M3.4 2.4 1.8 4M12.6 2.4 14.2 4" />
    </svg>
  )
}

function IconoEngranaje(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5h7M12.5 4.5H14M2 11.5h1.5M7 11.5h7" />
      <circle cx="11" cy="4.5" r="1.7" />
      <circle cx="5.2" cy="11.5" r="1.7" />
    </svg>
  )
}

function IconoAltavoz({ activo }: { activo: boolean }): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6v4h2.6L8 12.6V3.4L4.6 6H2Z" />
      {activo ? (
        <>
          <path d="M10.4 5.9a3 3 0 0 1 0 4.2" />
          <path d="M12.2 4.2a5.4 5.4 0 0 1 0 7.6" />
        </>
      ) : (
        <path d="m10.6 6.2 3.4 3.6m0-3.6-3.4 3.6" />
      )}
    </svg>
  )
}

export default function App(): React.JSX.Element {
  const [instantanea, setInstantanea] = useState<Instantanea | null>(null)
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'reloj' | 'programados' | 'ajustes' | 'reporte' | 'teams' | 'historial'>('reloj')
  const [programados, setProgramados] = useState<ProgramadoVista[]>([])
  const [teams, setTeams] = useState<EstadoTeams | null>(null)
  // Mientras se elige un tema en Ajustes se ve en vivo; al salir sin guardar vuelve el de verdad.
  const [temaDePrueba, setTemaDePrueba] = useState<string | null>(null)
  const tema = temaDePrueba ?? instantanea?.tema ?? 'clasico'
  useTema(tema)
  const pendientes = programados.filter((p) => p.estado === 'pendiente').length
  const resumenTeams = teams ? resumirTeams(teams) : null

  // El reloj solo late mientras la jornada está en curso (no fuera de jornada) y la ventana es visible.
  const ahora = useAhora(instantanea !== null && instantanea.estado !== 'fuera_de_jornada')

  useEffect(() => {
    const quitarCambio = window.jornify.alCambiar(setInstantanea)
    const quitarMotivo = window.jornify.alPedirMotivo(() => {
      // La ausencia pedida desde la bandeja se contesta en el reloj.
      setVista('reloj')
      setPidiendoMotivo(true)
    })
    const quitarProgramados = window.jornify.alCambiarProgramados(setProgramados)
    void window.jornify.listarProgramados().then(setProgramados)
    const quitarTeams = window.jornify.alCambiarTeams(setTeams)
    void window.jornify.estadoTeams().then(setTeams)
    // Primero se escucha y después se pide el estado, para no perder ningún cambio intermedio.
    void window.jornify.instantanea().then(setInstantanea)
    window.jornify.listo()
    return () => {
      quitarCambio()
      quitarMotivo()
      quitarProgramados()
      quitarTeams()
    }
  }, [])

  const ejecutar = useCallback(async (tipo: Parameters<typeof window.jornify.ejecutar>[0], motivo?: string) => {
    setOcupado(true)
    setError(null)
    try {
      const resultado = await window.jornify.ejecutar(tipo, motivo)
      if (!resultado.ok) setError(resultado.error)
      else setPidiendoMotivo(false)
    } finally {
      setOcupado(false)
    }
  }, [])

  if (!instantanea) return <main className={estilos.contenedor} aria-busy="true" />

  return (
    <main className={estilos.contenedor}>
      <header className={estilos.cabecera}>
        <p className={estilos.marca}>Jornify</p>
        <div className={estilos.herramientas}>
          <button
            type="button"
            className={`${estilos.herramienta} ${estilos.programados}`}
            aria-pressed={vista === 'teams'}
            aria-label="Conexión con Teams"
            title={resumenTeams ? `Teams: ${resumenTeams.texto}` : 'Conexión con Teams'}
            onClick={() => setVista((actual) => (actual === 'teams' ? 'reloj' : 'teams'))}
          >
            <IconoTeams />
            {resumenTeams && resumenTeams.nivel !== 'ok' && (
              <span className={`${estilos.punto} ${resumenTeams.nivel === 'accion' ? estilos.puntoAccion : estilos.puntoEspera}`} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={`${estilos.herramienta} ${estilos.programados}`}
            aria-pressed={vista === 'programados'}
            aria-label="Mensajes programados"
            title={pendientes > 0 ? `Mensajes programados (${pendientes} pendientes)` : 'Mensajes programados'}
            onClick={() => setVista((actual) => (actual === 'programados' ? 'reloj' : 'programados'))}
          >
            <IconoCampana />
            {pendientes > 0 && <span className={estilos.contador}>{pendientes}</span>}
          </button>
          <button
            type="button"
            className={`${estilos.herramienta} ${estilos.programados}`}
            aria-pressed={vista === 'historial'}
            aria-label="Historial"
            title="Historial"
            onClick={() => setVista((actual) => (actual === 'historial' ? 'reloj' : 'historial'))}
          >
            <IconoHistorial />
          </button>
          <button
            type="button"
            className={`${estilos.herramienta} ${estilos.programados}`}
            aria-pressed={vista === 'ajustes'}
            aria-label="Ajustes"
            title="Ajustes"
            onClick={() => setVista((actual) => (actual === 'ajustes' ? 'reloj' : 'ajustes'))}
          >
            <IconoEngranaje />
          </button>
          <button
            type="button"
            className={estilos.herramienta}
            aria-pressed={instantanea.sonidos}
            aria-label="Reproducir sonidos"
            title={instantanea.sonidos ? 'Silenciar los sonidos' : 'Activar los sonidos'}
            onClick={() => void window.jornify.alternarSonidos()}
          >
            <IconoAltavoz activo={instantanea.sonidos} />
          </button>
          <button
            type="button"
            className={`${estilos.herramienta} ${estilos.fijar}`}
            aria-pressed={instantanea.siempreVisible}
            aria-label="Mantener siempre visible"
            title={instantanea.siempreVisible ? 'Dejar de mantener encima de las demás ventanas' : 'Mantener encima de las demás ventanas'}
            onClick={() => void window.jornify.alternarSiempreVisible()}
          >
            <IconoChincheta />
          </button>
        </div>
      </header>

      {vista === 'teams' ? (
        <Teams estado={teams} onVolver={() => setVista('reloj')} />
      ) : vista === 'programados' ? (
        <Programados programados={programados} onVolver={() => setVista('reloj')} />
      ) : vista === 'ajustes' ? (
        <Ajustes onVolver={() => setVista('reloj')} onTemaDePrueba={setTemaDePrueba} />
      ) : vista === 'historial' ? (
        <Historial onVolver={() => setVista('reloj')} onExportar={() => setVista('reporte')} />
      ) : vista === 'reporte' ? (
        <Reporte onVolver={() => setVista('historial')} />
      ) : (
        <>
          <Reloj instantanea={instantanea} ahora={ahora} />
          <LineaDelDia instantanea={instantanea} ahora={ahora} />

          <div className={estilos.zonaAcciones}>
            <Acciones
              acciones={instantanea.acciones}
              ocupado={ocupado}
              pidiendoMotivo={pidiendoMotivo}
              onPedirMotivo={setPidiendoMotivo}
              onEjecutar={(tipo, motivo) => void ejecutar(tipo, motivo)}
            />
            {error && (
              <p className={estilos.error} role="alert">
                {error}
              </p>
            )}
          </div>
        </>
      )}
      <Friso id={tema} />
    </main>
  )
}
