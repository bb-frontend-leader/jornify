// Llamadas a Microsoft Graph con fetch nativo. Sin dependencias de Electron: el token y fetch se inyectan.
import { z } from 'zod'
import { ErrorDePublicacion } from './publicadores/base'

export const URL_GRAPH = 'https://graph.microsoft.com/v1.0'

/** Permisos delegados que pide el inicio de sesión (ver ESPECIFICACION.md). */
export const ALCANCES_BASE = ['User.Read', 'ChannelMessage.Send', 'Team.ReadBasic.All', 'Channel.ReadBasic.All']

/** Permiso extra, opcional, para encontrar a la persona a la que se menciona. Sin él la mención sale como texto. */
export const ALCANCE_MENCIONES = 'User.ReadBasic.All'

export type Fetch = typeof fetch

/** Cuántas páginas de resultados se leen como máximo en un listado. */
const PAGINAS_MAXIMAS = 5

const esquemaError = z.object({ error: z.object({ message: z.string().optional() }).optional() })

/** Convierte una respuesta HTTP que no es correcta en un error, con su motivo en español y si vale la pena reintentar. */
export async function errorDeRespuesta(respuesta: Response): Promise<ErrorDePublicacion> {
  const estado = respuesta.status
  let detalle = ''
  try {
    const cuerpo = esquemaError.safeParse(await respuesta.json())
    detalle = cuerpo.success ? (cuerpo.data.error?.message ?? '') : ''
  } catch {
    // La respuesta no era JSON: se queda sin detalle.
  }
  const sufijo = detalle ? `: ${detalle}` : ''
  if (estado === 401) return new ErrorDePublicacion(`La sesión de Microsoft no es válida${sufijo}`, true)
  if (estado === 403) return new ErrorDePublicacion(`Microsoft negó el permiso${sufijo}`, false)
  if (estado === 404) return new ErrorDePublicacion(`No se encontró el equipo o el canal${sufijo}`, false)
  if (estado === 408 || estado === 425 || estado === 429 || estado >= 500) {
    return new ErrorDePublicacion(`Teams no respondió bien (${estado})${sufijo}`, true)
  }
  return new ErrorDePublicacion(`Teams rechazó el mensaje (${estado})${sufijo}`, false)
}

/** Ejecuta la petición; un fallo de red (sin internet, DNS, tiempo agotado) es siempre reintentable. */
export async function pedir(fetchFn: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(20_000) })
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'sin detalle'
    throw new ErrorDePublicacion(`Sin conexión con Microsoft (${motivo})`, true)
  }
}

async function pedirJson(fetchFn: Fetch, token: string, url: string): Promise<unknown> {
  const respuesta = await pedir(fetchFn, url, { headers: { Authorization: `Bearer ${token}` } })
  if (!respuesta.ok) throw await errorDeRespuesta(respuesta)
  return respuesta.json()
}

const esquemaPerfil = z.object({
  displayName: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
  mail: z.string().nullish()
})

export interface PerfilGraph {
  nombre: string
  usuario: string
}

export async function obtenerPerfil(fetchFn: Fetch, token: string): Promise<PerfilGraph> {
  const datos = esquemaPerfil.parse(await pedirJson(fetchFn, token, `${URL_GRAPH}/me?$select=displayName,userPrincipalName,mail`))
  const usuario = datos.mail ?? datos.userPrincipalName ?? ''
  return { nombre: datos.displayName ?? usuario, usuario }
}

const esquemaLista = z.object({
  value: z.array(z.object({ id: z.string(), displayName: z.string().nullish() })),
  '@odata.nextLink': z.string().optional()
})

export interface ElementoGraph {
  id: string
  nombre: string
}

async function listar(fetchFn: Fetch, token: string, urlInicial: string): Promise<ElementoGraph[]> {
  const elementos: ElementoGraph[] = []
  let url: string | undefined = urlInicial
  for (let pagina = 0; url && pagina < PAGINAS_MAXIMAS; pagina++) {
    const datos = esquemaLista.parse(await pedirJson(fetchFn, token, url))
    elementos.push(...datos.value.map((e) => ({ id: e.id, nombre: e.displayName ?? e.id })))
    url = datos['@odata.nextLink']
  }
  return elementos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function listarEquipos(fetchFn: Fetch, token: string): Promise<ElementoGraph[]> {
  return listar(fetchFn, token, `${URL_GRAPH}/me/joinedTeams?$select=id,displayName`)
}

export function listarCanales(fetchFn: Fetch, token: string, equipoId: string): Promise<ElementoGraph[]> {
  return listar(fetchFn, token, `${URL_GRAPH}/teams/${encodeURIComponent(equipoId)}/channels?$select=id,displayName`)
}

/** Busca por nombre exacto a la persona que se va a mencionar; devuelve su id, o null si no hay una sola coincidencia. */
export async function buscarUsuarioPorNombre(fetchFn: Fetch, token: string, nombre: string): Promise<string | null> {
  const filtro = encodeURIComponent(`displayName eq '${nombre.replace(/'/g, "''")}'`)
  const datos = esquemaLista.parse(await pedirJson(fetchFn, token, `${URL_GRAPH}/users?$filter=${filtro}&$select=id,displayName`))
  return datos.value.length === 1 ? (datos.value[0]?.id ?? null) : null
}
