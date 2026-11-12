// Conexión con Teams: junta la sesión de Microsoft, el canal elegido y la cola de mensajes para la interfaz.
// Sin dependencias de Electron: todo se inyecta (y así se prueba).
import type {
  AppMicrosoft,
  ElementoTeams,
  EleccionCanal,
  EstadoTeams,
  ResultadoListado,
  ResultadoSimple
} from '../preload/tipos'
import type { Cola } from './cola'
import type { Config } from './configEsquema'
import { ALCANCES_BASE, ALCANCE_MENCIONES, type Fetch, listarCanales, listarEquipos } from './graphApi'
import { ErrorDePublicacion, NoListoError } from './publicadores/base'
import type { PublicadorGraph } from './publicadores/graph'

/** Lo que Teams necesita del inicio de sesión (la implementación real es ServicioAuth). */
export interface AuthTeams {
  configurada: () => boolean
  cuenta: () => Promise<{ name?: string; username: string } | null>
  iniciarSesion: () => Promise<unknown>
  obtenerToken: (alcances: string[]) => Promise<string>
  darPermiso: (alcance: string) => Promise<void>
  cerrarSesion: () => Promise<void>
}

export interface DependenciasTeams {
  auth: AuthTeams
  publicador: PublicadorGraph
  cola: Cola
  obtenerConfig: () => Config
  guardarConfig: (config: Config) => void
  fetch?: Fetch
  registrar?: (mensaje: string, error?: unknown) => void
}

const ID_APLICACION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INQUILINO = /^[A-Za-z0-9][A-Za-z0-9.-]*$/

function mensajeDe(error: unknown): string {
  if (error instanceof NoListoError || error instanceof ErrorDePublicacion) return error.message
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado'
}

export class ServicioTeams {
  private readonly oyentes = new Set<() => void>()

  constructor(private readonly dependencias: DependenciasTeams) {
    dependencias.cola.alCambiar(() => this.avisar())
  }

  async estado(): Promise<EstadoTeams> {
    const { auth, cola, obtenerConfig, publicador } = this.dependencias
    const { teams } = obtenerConfig()
    const cuenta = await auth.cuenta().catch(() => null)
    const sesion = cuenta ? { nombre: cuenta.name ?? cuenta.username, usuario: cuenta.username } : null
    const equipo = teams.teamId ? { id: teams.teamId, nombre: teams.nombreEquipo || teams.teamId } : null
    const canal = teams.channelId ? { id: teams.channelId, nombre: teams.nombreCanal || teams.channelId } : null
    const estadoCola = cola.estado()
    return {
      metodo: teams.metodo,
      clientId: teams.clientId,
      tenantId: teams.tenantId,
      sesion,
      equipo,
      canal,
      mencionar: teams.mencionar,
      menciones: publicador.estadoMenciones(),
      listo: auth.configurada() && sesion !== null && equipo !== null && canal !== null,
      cola: {
        pendientes: estadoCola.pendientes,
        fallidos: estadoCola.fallidos,
        bloqueo: estadoCola.bloqueo?.motivo ?? null,
        requiereAccion: estadoCola.bloqueo?.requiereAccion ?? false,
        proximoIntentoEn: estadoCola.proximoIntentoEn
      }
    }
  }

  /** Guarda el ID de la aplicación registrada y el inquilino. Si cambian, la sesión anterior ya no sirve y se cierra. */
  async guardarApp(app: AppMicrosoft): Promise<ResultadoSimple> {
    const clientId = app.clientId.trim()
    const tenantId = app.tenantId.trim() || 'organizations'
    if (!ID_APLICACION.test(clientId)) {
      return { ok: false, error: 'El ID de la aplicación debe tener el formato 00000000-0000-0000-0000-000000000000' }
    }
    if (!INQUILINO.test(tenantId)) return { ok: false, error: 'El inquilino no es válido' }

    const config = this.dependencias.obtenerConfig()
    if (config.teams.clientId !== clientId || config.teams.tenantId !== tenantId) {
      await this.dependencias.auth.cerrarSesion().catch((error) => this.dependencias.registrar?.('No se pudo cerrar la sesión', error))
      this.dependencias.guardarConfig({ ...config, teams: { ...config.teams, clientId, tenantId } })
      this.dependencias.publicador.olvidarUsuarios()
    }
    this.avisar()
    return { ok: true }
  }

  async iniciarSesion(): Promise<ResultadoSimple> {
    try {
      await this.dependencias.auth.iniciarSesion()
    } catch (error) {
      this.dependencias.registrar?.('No se pudo iniciar sesión', error)
      return { ok: false, error: mensajeDe(error) }
    }
    this.avisar()
    // Lo que esperaba la sesión sale ahora.
    void this.dependencias.cola.reintentarAhora()
    return { ok: true }
  }

  async cerrarSesion(): Promise<void> {
    await this.dependencias.auth.cerrarSesion()
    this.dependencias.publicador.olvidarUsuarios()
    this.avisar()
  }

  listarEquipos(): Promise<ResultadoListado> {
    return this.listar((fetchFn, token) => listarEquipos(fetchFn, token))
  }

  listarCanales(equipoId: string): Promise<ResultadoListado> {
    return this.listar((fetchFn, token) => listarCanales(fetchFn, token, equipoId))
  }

  elegirCanal(eleccion: EleccionCanal): ResultadoSimple {
    if (!eleccion.equipoId || !eleccion.canalId) return { ok: false, error: 'Elige el equipo y el canal' }
    const config = this.dependencias.obtenerConfig()
    this.dependencias.guardarConfig({
      ...config,
      teams: {
        ...config.teams,
        teamId: eleccion.equipoId,
        nombreEquipo: eleccion.equipoNombre,
        channelId: eleccion.canalId,
        nombreCanal: eleccion.canalNombre
      }
    })
    this.avisar()
    void this.dependencias.cola.reintentarAhora()
    return { ok: true }
  }

  async reintentar(): Promise<void> {
    await this.dependencias.cola.reintentarAhora(true)
  }

  /** Consiente el permiso de menciones en el navegador; después las menciones se vuelven a intentar. */
  async activarMenciones(): Promise<ResultadoSimple> {
    try {
      await this.dependencias.auth.darPermiso(ALCANCE_MENCIONES)
    } catch (error) {
      this.dependencias.registrar?.('No se pudo dar el permiso de menciones', error)
      return { ok: false, error: mensajeDe(error) }
    }
    this.dependencias.publicador.olvidarUsuarios()
    this.avisar()
    return { ok: true }
  }

  /** Publica un mensaje de prueba directamente (sin pasar por la cola ni el historial). */
  async enviarPrueba(): Promise<ResultadoSimple> {
    try {
      await this.dependencias.publicador.publicar('Prueba de Jornify: puedes borrar este mensaje.', {
        tipo: 'inicio',
        ocurridoEn: new Date()
      })
    } catch (error) {
      return { ok: false, error: mensajeDe(error) }
    }
    return { ok: true }
  }

  alCambiar(oyente: () => void): () => void {
    this.oyentes.add(oyente)
    return () => this.oyentes.delete(oyente)
  }

  private avisar(): void {
    this.oyentes.forEach((oyente) => oyente())
  }

  private async listar(consulta: (fetchFn: Fetch, token: string) => Promise<ElementoTeams[]>): Promise<ResultadoListado> {
    try {
      const token = await this.dependencias.auth.obtenerToken(ALCANCES_BASE)
      return { ok: true, elementos: await consulta(this.dependencias.fetch ?? fetch, token) }
    } catch (error) {
      this.dependencias.registrar?.('No se pudo leer la lista de Teams', error)
      return { ok: false, error: mensajeDe(error) }
    }
  }
}
