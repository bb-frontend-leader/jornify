import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, configPorDefecto } from '../src/main/configEsquema'
import { ALCANCES_BASE, ALCANCE_MENCIONES, buscarUsuarioPorNombre, listarCanales, listarEquipos, obtenerPerfil } from '../src/main/graphApi'
import { ErrorDePublicacion, NoListoError } from '../src/main/publicadores/base'
import { PublicadorGraph, construirCuerpo } from '../src/main/publicadores/graph'

const contexto = { tipo: 'inicio' as const, ocurridoEn: new Date(2026, 10, 6, 8, 0) }

const json = (cuerpo: unknown, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } })

interface Llamada {
  url: string
  metodo: string
  cabeceras: Record<string, string>
  cuerpo: unknown
}

/** fetch falso: responde con lo que diga `responder` y guarda las llamadas. */
function crearFetch(responder: (url: string, metodo: string) => Response | Promise<Response>) {
  const llamadas: Llamada[] = []
  const falso = vi.fn((entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada)
    const metodo = init?.method ?? 'GET'
    llamadas.push({
      url,
      metodo,
      cabeceras: (init?.headers ?? {}) as Record<string, string>,
      cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    })
    return Promise.resolve(responder(url, metodo))
  })
  return { fetch: falso as unknown as typeof fetch, llamadas }
}

function configListo(cambios: Partial<Config['teams']> = {}): Config {
  const base = configPorDefecto()
  return {
    ...base,
    teams: { ...base.teams, clientId: 'app-1', teamId: 'equipo/1', channelId: 'canal:1', mencionar: '', ...cambios }
  }
}

describe('construirCuerpo', () => {
  it('escapa el HTML y convierte los saltos de línea', () => {
    const { body, mentions } = construirCuerpo('a <b> & "c"\nlínea 2', null)
    expect(body).toEqual({ contentType: 'html', content: 'a &lt;b&gt; &amp; &quot;c&quot;<br>línea 2' })
    expect(mentions).toBeUndefined()
  })

  it('convierte "@Nombre" en una mención real, con su id', () => {
    const { body, mentions } = construirCuerpo('🌅 Buenos días, inicio mi jornada @Angela Ortiz Peña', {
      nombre: 'Angela Ortiz Peña',
      id: 'id-angela'
    })
    expect(body.content).toBe('🌅 Buenos días, inicio mi jornada <at id="0">Angela Ortiz Peña</at>')
    expect(mentions).toEqual([
      {
        id: 0,
        mentionText: 'Angela Ortiz Peña',
        mentioned: { user: { id: 'id-angela', displayName: 'Angela Ortiz Peña', userIdentityType: 'aadUser' } }
      }
    ])
  })

  it('mantiene el texto que rodea a la mención y escapa lo demás', () => {
    const { body } = construirCuerpo('hola @Ana <ya> (registrado a las 8:02 a. m.)', { nombre: 'Ana', id: 'x' })
    expect(body.content).toBe('hola <at id="0">Ana</at> &lt;ya&gt; (registrado a las 8:02 a. m.)')
  })

  it('si el texto no contiene la mención no agrega ninguna', () => {
    const { body, mentions } = construirCuerpo('sin mención', { nombre: 'Ana', id: 'x' })
    expect(body.content).toBe('sin mención')
    expect(mentions).toBeUndefined()
  })

  it('un nombre con HTML no rompe el cuerpo', () => {
    const { body } = construirCuerpo('hola @A<b>', { nombre: 'A<b>', id: 'x' })
    expect(body.content).toBe('hola <at id="0">A&lt;b&gt;</at>')
  })
})

describe('PublicadorGraph', () => {
  let obtenerToken: Mock<(alcances: string[]) => Promise<string>>
  const registrar = vi.fn()

  beforeEach(() => {
    obtenerToken = vi.fn((alcances: string[]) => Promise.resolve(alcances.includes(ALCANCE_MENCIONES) ? 'token-menciones' : 'token-base'))
    registrar.mockClear()
  })

  const crear = (config: Config, respuesta: (url: string, metodo: string) => Response) => {
    const { fetch, llamadas } = crearFetch(respuesta)
    const publicador = new PublicadorGraph({ obtenerToken, obtenerConfig: () => config, fetch, registrar })
    return { publicador, llamadas }
  }

  it('publica en el canal elegido con el token del usuario', async () => {
    const { publicador, llamadas } = crear(configListo(), () => json({ id: 'm1' }, 201))
    await publicador.publicar('hola', contexto)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]).toMatchObject({
      url: 'https://graph.microsoft.com/v1.0/teams/equipo%2F1/channels/canal%3A1/messages',
      metodo: 'POST',
      cabeceras: { Authorization: 'Bearer token-base', 'Content-Type': 'application/json' },
      cuerpo: { body: { contentType: 'html', content: 'hola' } }
    })
    expect(obtenerToken).toHaveBeenCalledWith(ALCANCES_BASE)
    expect(publicador.estadoMenciones()).toBe('sin_nombre')
  })

  describe('hilo del día', () => {
    const urlCanal = 'https://graph.microsoft.com/v1.0/teams/equipo%2F1/channels/canal%3A1/messages'

    it('el primer mensaje abre el hilo y devuelve su id', async () => {
      const { publicador, llamadas } = crear(configListo(), () => json({ id: 'raiz-1' }, 201))
      expect(await publicador.publicar('hola', contexto)).toEqual({ idMensaje: 'raiz-1', esRaiz: true })
      expect(llamadas[0]?.url).toBe(urlCanal)
    })

    it('con un hilo abierto publica como respuesta a ese mensaje', async () => {
      const { publicador, llamadas } = crear(configListo(), () => json({ id: 'resp-1' }, 201))
      const resultado = await publicador.publicar('almuerzo', { ...contexto, hiloEn: '17/raíz' })
      expect(resultado).toEqual({ idMensaje: 'resp-1', esRaiz: false })
      expect(llamadas).toHaveLength(1)
      expect(llamadas[0]?.url).toBe(`${urlCanal}/17%2Fra%C3%ADz/replies`)
      expect(llamadas[0]?.cuerpo).toMatchObject({ body: { content: 'almuerzo' } })
    })

    it('con respuestasEnHilo en false cada mensaje va al canal', async () => {
      const { publicador, llamadas } = crear(configListo({ respuestasEnHilo: false }), () => json({ id: 'm' }, 201))
      const resultado = await publicador.publicar('almuerzo', { ...contexto, hiloEn: 'raiz-1' })
      expect(resultado?.esRaiz).toBe(true)
      expect(llamadas[0]?.url).toBe(urlCanal)
    })

    it('si el mensaje del hilo ya no existe (404) publica uno nuevo y ese abre el hilo', async () => {
      const { publicador, llamadas } = crear(configListo(), (url) =>
        url.endsWith('/replies') ? json({ error: { message: 'no existe' } }, 404) : json({ id: 'raiz-2' }, 201)
      )
      const resultado = await publicador.publicar('almuerzo', { ...contexto, hiloEn: 'borrado' })
      expect(resultado).toEqual({ idMensaje: 'raiz-2', esRaiz: true })
      expect(llamadas.map((l) => l.url)).toEqual([`${urlCanal}/borrado/replies`, urlCanal])
      expect(registrar).toHaveBeenCalled()
    })

    it('otros errores al responder no publican un mensaje suelto: se reintentan', async () => {
      const { publicador, llamadas } = crear(configListo(), () => json({ error: { message: 'caído' } }, 503))
      const error = await publicador.publicar('almuerzo', { ...contexto, hiloEn: 'raiz-1' }).catch((e: unknown) => e)
      expect(error).toMatchObject({ reintentable: true })
      expect(llamadas).toHaveLength(1)
    })

    it('si Graph no devuelve el id el mensaje cuenta como publicado, sin hilo', async () => {
      const { publicador } = crear(configListo(), () => new Response('', { status: 201 }))
      expect(await publicador.publicar('hola', contexto)).toBeUndefined()
    })
  })

  describe('lo que falta por configurar', () => {
    it.each([
      [{ clientId: '' }, 'ID de la aplicación'],
      [{ teamId: '' }, 'equipo y el canal'],
      [{ channelId: '' }, 'equipo y el canal'],
      [{ metodo: 'webhook' as const }, 'Graph no está activado']
    ])('con %j lanza NoListoError y no llama a Graph', async (cambio, texto) => {
      const { publicador, llamadas } = crear(configListo(cambio), () => json({}))
      const intento = publicador.publicar('hola', contexto)
      await expect(intento).rejects.toBeInstanceOf(NoListoError)
      await expect(intento).rejects.toThrow(texto)
      expect(llamadas).toHaveLength(0)
      expect(obtenerToken).not.toHaveBeenCalled()
    })

    it('si no hay sesión, el NoListoError del token sale tal cual', async () => {
      obtenerToken.mockRejectedValue(new NoListoError('Inicia sesión con Microsoft (Teams)'))
      const { publicador, llamadas } = crear(configListo(), () => json({}))
      await expect(publicador.publicar('hola', contexto)).rejects.toThrow('Inicia sesión')
      expect(llamadas).toHaveLength(0)
    })
  })

  describe('errores de Graph', () => {
    const fallar = async (estado: number, cuerpo: unknown = { error: { message: 'detalle' } }) => {
      const { publicador } = crear(configListo(), () => json(cuerpo, estado))
      return publicador.publicar('hola', contexto).catch((e: unknown) => e)
    }

    it.each([
      [401, true],
      [408, true],
      [429, true],
      [500, true],
      [503, true],
      [400, false],
      [403, false],
      [404, false]
    ])('el HTTP %i es reintentable: %s', async (estado, reintentable) => {
      const error = await fallar(estado)
      expect(error).toBeInstanceOf(ErrorDePublicacion)
      expect((error as ErrorDePublicacion).reintentable).toBe(reintentable)
      expect((error as ErrorDePublicacion).message).toContain('detalle')
    })

    it('una respuesta de error que no es JSON también se convierte en error', async () => {
      const { publicador } = crear(configListo(), () => new Response('<html>', { status: 502 }))
      const error = await publicador.publicar('hola', contexto).catch((e: unknown) => e)
      expect(error).toMatchObject({ reintentable: true })
    })

    it('un fallo de red (sin internet) es reintentable', async () => {
      const publicador = new PublicadorGraph({
        obtenerToken,
        obtenerConfig: () => configListo(),
        fetch: (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch
      })
      const error = await publicador.publicar('hola', contexto).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ErrorDePublicacion)
      expect(error).toMatchObject({ reintentable: true })
      expect((error as Error).message).toContain('Sin conexión')
    })
  })

  describe('menciones', () => {
    const conMencion = configListo({ mencionar: 'Angela Ortiz Peña' })
    const respuestaGraph = (usuarios: unknown[]) => (url: string, metodo: string) =>
      metodo === 'POST' ? json({ id: 'm1' }, 201) : json({ value: usuarios })

    it('busca a la persona una vez y la menciona de verdad', async () => {
      const { publicador, llamadas } = crear(conMencion, respuestaGraph([{ id: 'u-1', displayName: 'Angela Ortiz Peña' }]))
      await publicador.publicar('hola @Angela Ortiz Peña', contexto)
      await publicador.publicar('chao @Angela Ortiz Peña', contexto)

      const busquedas = llamadas.filter((l) => l.metodo === 'GET')
      expect(busquedas).toHaveLength(1)
      expect(decodeURIComponent(busquedas[0]!.url)).toContain("displayName eq 'Angela Ortiz Peña'")
      expect(busquedas[0]!.cabeceras.Authorization).toBe('Bearer token-menciones')

      const envios = llamadas.filter((l) => l.metodo === 'POST')
      expect(envios).toHaveLength(2)
      expect(envios[0]!.cuerpo).toMatchObject({
        body: { content: 'hola <at id="0">Angela Ortiz Peña</at>' },
        mentions: [{ id: 0, mentioned: { user: { id: 'u-1' } } }]
      })
      expect(publicador.estadoMenciones()).toBe('ok')
    })

    it('sin el permiso de menciones el mensaje sale igual, con texto, y no lo vuelve a intentar', async () => {
      obtenerToken.mockImplementation((alcances: string[]) =>
        alcances.includes(ALCANCE_MENCIONES) ? Promise.reject(new NoListoError('falta consentir')) : Promise.resolve('token-base')
      )
      const { publicador, llamadas } = crear(conMencion, respuestaGraph([]))
      await publicador.publicar('hola @Angela Ortiz Peña', contexto)
      await publicador.publicar('otra vez @Angela Ortiz Peña', contexto)
      expect(llamadas.every((l) => l.metodo === 'POST')).toBe(true)
      expect(llamadas[0]!.cuerpo).toMatchObject({ body: { content: 'hola @Angela Ortiz Peña' } })
      expect(llamadas[0]!.cuerpo).not.toHaveProperty('mentions')
      expect(publicador.estadoMenciones()).toBe('sin_permiso')
      expect(registrar).toHaveBeenCalledTimes(1)
      // Solo se pidió el permiso de menciones la primera vez.
      expect(obtenerToken.mock.calls.filter(([a]) => (a as string[]).includes(ALCANCE_MENCIONES))).toHaveLength(1)
    })

    it('tras dar el permiso (olvidarUsuarios) vuelve a intentarlo', async () => {
      let consentido = false
      obtenerToken.mockImplementation((alcances: string[]) =>
        alcances.includes(ALCANCE_MENCIONES) && !consentido ? Promise.reject(new Error('sin consentir')) : Promise.resolve('t')
      )
      const { publicador, llamadas } = crear(conMencion, respuestaGraph([{ id: 'u-1', displayName: 'Angela Ortiz Peña' }]))
      await publicador.publicar('a @Angela Ortiz Peña', contexto)
      consentido = true
      publicador.olvidarUsuarios()
      await publicador.publicar('b @Angela Ortiz Peña', contexto)
      expect(llamadas.filter((l) => l.metodo === 'POST').at(-1)!.cuerpo).toHaveProperty('mentions')
      expect(publicador.estadoMenciones()).toBe('ok')
    })

    it.each([
      ['ninguna coincidencia', []],
      ['varias coincidencias', [{ id: 'a', displayName: 'X' }, { id: 'b', displayName: 'X' }]]
    ])('con %s no menciona a nadie y lo recuerda', async (_nombre, usuarios) => {
      const { publicador, llamadas } = crear(conMencion, respuestaGraph(usuarios))
      await publicador.publicar('hola @Angela Ortiz Peña', contexto)
      await publicador.publicar('hola @Angela Ortiz Peña', contexto)
      expect(llamadas.filter((l) => l.metodo === 'GET')).toHaveLength(1)
      expect(llamadas.find((l) => l.metodo === 'POST')!.cuerpo).not.toHaveProperty('mentions')
      expect(publicador.estadoMenciones()).toBe('no_encontrada')
    })

    it('si la búsqueda falla por red el mensaje sale con texto y se vuelve a buscar la próxima vez', async () => {
      let buscando = 0
      const { publicador } = crear(conMencion, (_url, metodo) => {
        if (metodo === 'POST') return json({}, 201)
        buscando++
        return json({ error: { message: 'caído' } }, 503)
      })
      await publicador.publicar('hola @Angela Ortiz Peña', contexto)
      await publicador.publicar('hola @Angela Ortiz Peña', contexto)
      expect(buscando).toBe(2)
      expect(publicador.estadoMenciones()).toBe('desconocido')
    })
  })
})

describe('graphApi', () => {
  it('obtenerPerfil devuelve nombre y usuario', async () => {
    const { fetch } = crearFetch(() => json({ displayName: 'Ale Dev', userPrincipalName: 'ale@empresa.com', mail: null }))
    expect(await obtenerPerfil(fetch, 't')).toEqual({ nombre: 'Ale Dev', usuario: 'ale@empresa.com' })
  })

  it('listarEquipos sigue las páginas y ordena por nombre', async () => {
    const { fetch, llamadas } = crearFetch((url) =>
      url.includes('pagina2')
        ? json({ value: [{ id: '3', displayName: 'Ánimo' }] })
        : json({ value: [{ id: '1', displayName: 'Zeta' }, { id: '2', displayName: 'Alfa' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/x?pagina2' })
    )
    const equipos = await listarEquipos(fetch, 't')
    expect(equipos.map((e) => e.nombre)).toEqual(['Alfa', 'Ánimo', 'Zeta'])
    expect(llamadas).toHaveLength(2)
    expect(llamadas[0]!.cabeceras.Authorization).toBe('Bearer t')
  })

  it('listarCanales codifica el id del equipo', async () => {
    const { fetch, llamadas } = crearFetch(() => json({ value: [{ id: 'c1', displayName: 'General' }] }))
    expect(await listarCanales(fetch, 't', 'a/b')).toEqual([{ id: 'c1', nombre: 'General' }])
    expect(llamadas[0]!.url).toContain('/teams/a%2Fb/channels')
  })

  it('un error HTTP de un listado se traduce a ErrorDePublicacion', async () => {
    const { fetch } = crearFetch(() => json({ error: { message: 'sin permiso' } }, 403))
    await expect(listarEquipos(fetch, 't')).rejects.toMatchObject({ reintentable: false })
  })

  it('buscarUsuarioPorNombre duplica las comillas simples del nombre', async () => {
    const { fetch, llamadas } = crearFetch(() => json({ value: [{ id: 'u', displayName: "D'Angelo" }] }))
    expect(await buscarUsuarioPorNombre(fetch, 't', "D'Angelo")).toBe('u')
    expect(decodeURIComponent(llamadas[0]!.url)).toContain("displayName eq 'D''Angelo'")
  })
})
