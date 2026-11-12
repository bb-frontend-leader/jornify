// Publicador de Teams por Microsoft Graph: publica en el canal elegido con la cuenta del usuario.
// Sin dependencias de Electron: el token y fetch se inyectan.
import type { Config } from '../configEsquema'
import {
  ALCANCES_BASE,
  ALCANCE_MENCIONES,
  type Fetch,
  URL_GRAPH,
  buscarUsuarioPorNombre,
  errorDeRespuesta,
  pedir
} from '../graphApi'
import { type ContextoPublicacion, NoListoError, type Publicador, type ResultadoPublicacion } from './base'

/** Cómo va la mención de la persona configurada, para mostrarlo en la interfaz. */
export type EstadoMenciones = 'sin_nombre' | 'ok' | 'sin_permiso' | 'no_encontrada' | 'desconocido'

export interface DependenciasPublicadorGraph {
  /** Token de acceso con esos permisos. Lanza NoListoError si no hay sesión; cualquier otro error si falta el permiso. */
  obtenerToken: (alcances: string[]) => Promise<string>
  obtenerConfig: () => Config
  fetch?: Fetch
  registrar?: (mensaje: string, error?: unknown) => void
}

const escaparHtml = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface CuerpoMensaje {
  body: { contentType: 'html'; content: string }
  mentions?: {
    id: number
    mentionText: string
    mentioned: { user: { id: string; displayName: string; userIdentityType: 'aadUser' } }
  }[]
}

/**
 * Cuerpo del mensaje en HTML simple. Si se conoce a la persona mencionada, "@Nombre" pasa a ser una
 * mención de verdad (<at>) que le llega como notificación; si no, queda como texto.
 */
export function construirCuerpo(mensaje: string, mencion: { nombre: string; id: string } | null): CuerpoMensaje {
  const aHtml = (texto: string): string => escaparHtml(texto).replace(/\r?\n/g, '<br>')
  const marca = mencion ? `@${mencion.nombre}` : null
  const posicion = marca ? mensaje.indexOf(marca) : -1
  if (!mencion || !marca || posicion < 0) return { body: { contentType: 'html', content: aHtml(mensaje) } }

  const antes = mensaje.slice(0, posicion)
  const despues = mensaje.slice(posicion + marca.length)
  return {
    body: {
      contentType: 'html',
      content: `${aHtml(antes)}<at id="0">${escaparHtml(mencion.nombre)}</at>${aHtml(despues)}`
    },
    mentions: [
      {
        id: 0,
        mentionText: mencion.nombre,
        mentioned: { user: { id: mencion.id, displayName: mencion.nombre, userIdentityType: 'aadUser' } }
      }
    ]
  }
}

/** Id del mensaje que Graph acaba de crear. Si no viene, el mensaje igual salió: solo no habrá hilo al que responder. */
async function resultadoDe(respuesta: Response, esRaiz: boolean): Promise<ResultadoPublicacion | undefined> {
  try {
    const cuerpo: unknown = await respuesta.json()
    const id = (cuerpo as { id?: unknown } | null)?.id
    return typeof id === 'string' && id ? { idMensaje: id, esRaiz } : undefined
  } catch {
    return undefined
  }
}

export class PublicadorGraph implements Publicador {
  private readonly fetchFn: Fetch
  /** Nombre → id de usuario (null = ya se buscó y no hay una sola coincidencia). */
  private readonly usuarios = new Map<string, string | null>()
  private menciones: EstadoMenciones = 'desconocido'

  constructor(private readonly dependencias: DependenciasPublicadorGraph) {
    this.fetchFn = dependencias.fetch ?? fetch
  }

  estadoMenciones(): EstadoMenciones {
    return this.menciones
  }

  /** Olvida lo aprendido de los usuarios (p. ej. tras dar el permiso de menciones). */
  olvidarUsuarios(): void {
    this.usuarios.clear()
    this.menciones = 'desconocido'
  }

  async publicar(mensaje: string, contexto: ContextoPublicacion): Promise<ResultadoPublicacion | undefined> {
    const { teams } = this.dependencias.obtenerConfig()
    if (teams.metodo !== 'graph') throw new NoListoError('El envío por Graph no está activado')
    if (!teams.clientId) throw new NoListoError('Falta el ID de la aplicación de Microsoft (Teams)')
    if (!teams.teamId || !teams.channelId) throw new NoListoError('Elige el equipo y el canal (Teams)')

    const token = await this.dependencias.obtenerToken(ALCANCES_BASE)
    const mencion = await this.resolverMencion(teams.mencionar)
    const cuerpo = construirCuerpo(mensaje, mencion)

    const urlCanal = `${URL_GRAPH}/teams/${encodeURIComponent(teams.teamId)}/channels/${encodeURIComponent(teams.channelId)}/messages`
    const enviar = (url: string): Promise<Response> =>
      pedir(this.fetchFn, url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      })

    // Del segundo mensaje del día en adelante: respuesta al que abrió el hilo.
    if (teams.respuestasEnHilo && contexto.hiloEn) {
      const respuesta = await enviar(`${urlCanal}/${encodeURIComponent(contexto.hiloEn)}/replies`)
      if (respuesta.ok) return resultadoDe(respuesta, false)
      // 404: el mensaje que abría el hilo se borró o es de otro canal. Este pasa a abrir un hilo nuevo.
      if (respuesta.status !== 404) throw await errorDeRespuesta(respuesta)
      this.dependencias.registrar?.('El mensaje que abre el hilo del día ya no existe: se publica uno nuevo en el canal')
    }

    const respuesta = await enviar(urlCanal)
    if (!respuesta.ok) throw await errorDeRespuesta(respuesta)
    return resultadoDe(respuesta, true)
  }

  /** Id de la persona a mencionar, o null si no hay nombre, falta el permiso o no se encuentra: el mensaje sale igual, sin mención. */
  private async resolverMencion(nombre: string): Promise<{ nombre: string; id: string } | null> {
    const limpio = nombre.trim()
    if (!limpio) {
      this.menciones = 'sin_nombre'
      return null
    }
    if (this.menciones === 'sin_permiso') return null
    const conocido = this.usuarios.get(limpio)
    if (conocido !== undefined) {
      this.menciones = conocido ? 'ok' : 'no_encontrada'
      return conocido ? { nombre: limpio, id: conocido } : null
    }

    let token: string
    try {
      token = await this.dependencias.obtenerToken([ALCANCE_MENCIONES])
    } catch (error) {
      // Sin el permiso extra no se reintenta en cada mensaje: se vuelve a probar cuando el usuario lo active.
      this.dependencias.registrar?.('No se puede mencionar: falta el permiso', error)
      this.menciones = 'sin_permiso'
      return null
    }
    try {
      const id = await buscarUsuarioPorNombre(this.fetchFn, token, limpio)
      this.usuarios.set(limpio, id)
      this.menciones = id ? 'ok' : 'no_encontrada'
      return id ? { nombre: limpio, id } : null
    } catch (error) {
      // La búsqueda falló (red, permisos): el mensaje sale con la mención como texto y se vuelve a intentar la próxima vez.
      this.dependencias.registrar?.('No se pudo buscar a la persona a mencionar', error)
      this.menciones = 'desconocido'
      return null
    }
  }
}
