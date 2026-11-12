import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Cola } from '../src/main/cola'
import { type Config, configPorDefecto } from '../src/main/configEsquema'
import { ALCANCES_BASE, ALCANCE_MENCIONES } from '../src/main/graphApi'
import { Historial } from '../src/main/historial'
import { NoListoError } from '../src/main/publicadores/base'
import { PublicadorGraph } from '../src/main/publicadores/graph'
import { type AuthTeams, ServicioTeams } from '../src/main/teams'

const ID = '11111111-2222-3333-4444-555555555555'

const json = (cuerpo: unknown, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } })

describe('ServicioTeams', () => {
  let config: Config
  let sesion: { name?: string; username: string } | null
  let auth: AuthTeams & { [K in keyof AuthTeams]: ReturnType<typeof vi.fn> }
  let historial: Historial
  let cola: Cola
  let publicador: PublicadorGraph
  let servicio: ServicioTeams
  let peticiones: string[]
  let responder: (url: string, metodo: string) => Response

  beforeEach(() => {
    config = configPorDefecto()
    sesion = null
    peticiones = []
    responder = () => json({ value: [] })
    auth = {
      configurada: vi.fn(() => config.teams.clientId !== ''),
      cuenta: vi.fn(() => Promise.resolve(sesion)),
      iniciarSesion: vi.fn(() => {
        sesion = { name: 'Ale Dev', username: 'ale@empresa.com' }
        return Promise.resolve()
      }),
      obtenerToken: vi.fn(() => Promise.resolve('token')),
      darPermiso: vi.fn(() => Promise.resolve()),
      cerrarSesion: vi.fn(() => {
        sesion = null
        return Promise.resolve()
      })
    }
    const fetchFalso = ((entrada: string | URL | Request, init?: RequestInit) => {
      const url = String(entrada)
      peticiones.push(`${init?.method ?? 'GET'} ${url}`)
      return Promise.resolve(responder(url, init?.method ?? 'GET'))
    }) as typeof fetch
    historial = Historial.abrir(':memory:')
    publicador = new PublicadorGraph({ obtenerToken: auth.obtenerToken, obtenerConfig: () => config, fetch: fetchFalso })
    cola = new Cola({ historial, publicador })
    servicio = new ServicioTeams({
      auth,
      publicador,
      cola,
      obtenerConfig: () => config,
      guardarConfig: (nueva) => (config = nueva),
      fetch: fetchFalso
    })
  })

  describe('estado', () => {
    it('recién instalado: sin app, sin sesión, sin canal y no listo', async () => {
      const estado = await servicio.estado()
      expect(estado).toMatchObject({
        metodo: 'graph',
        clientId: '',
        sesion: null,
        equipo: null,
        canal: null,
        listo: false,
        cola: { pendientes: 0, fallidos: 0, bloqueo: null }
      })
    })

    it('listo solo cuando hay app, sesión y canal', async () => {
      config = { ...config, teams: { ...config.teams, clientId: ID, teamId: 't', nombreEquipo: 'Equipo', channelId: 'c', nombreCanal: 'General' } }
      expect((await servicio.estado()).listo).toBe(false)
      sesion = { username: 'ale@empresa.com' }
      const estado = await servicio.estado()
      expect(estado.listo).toBe(true)
      expect(estado.sesion).toEqual({ nombre: 'ale@empresa.com', usuario: 'ale@empresa.com' })
      expect(estado.equipo).toEqual({ id: 't', nombre: 'Equipo' })
      expect(estado.canal).toEqual({ id: 'c', nombre: 'General' })
    })

    it('si leer la cuenta falla, se muestra sin sesión en vez de romper', async () => {
      auth.cuenta.mockRejectedValue(new Error('caché ilegible'))
      expect((await servicio.estado()).sesion).toBeNull()
    })

    it('refleja lo que hay en cola y por qué está bloqueado', async () => {
      historial.registrarEvento({ tipo: 'inicio', ocurridoEn: new Date(), mensaje: 'hola' })
      await cola.procesar() // sin app configurada: NoListoError
      const estado = await servicio.estado()
      expect(estado.cola).toMatchObject({ pendientes: 1, requiereAccion: true, proximoIntentoEn: null })
      expect(estado.cola.bloqueo).toContain('ID de la aplicación')
    })
  })

  describe('guardarApp', () => {
    it('rechaza un ID con formato inválido sin tocar la configuración', async () => {
      const resultado = await servicio.guardarApp({ clientId: 'no-es-un-guid', tenantId: '' })
      expect(resultado.ok).toBe(false)
      expect(config.teams.clientId).toBe('')
    })

    it('rechaza un inquilino con caracteres raros', async () => {
      expect((await servicio.guardarApp({ clientId: ID, tenantId: "x'; drop" })).ok).toBe(false)
    })

    it('guarda el ID y usa "organizations" si no se indica inquilino', async () => {
      expect(await servicio.guardarApp({ clientId: `  ${ID}  `, tenantId: ' ' })).toEqual({ ok: true })
      expect(config.teams).toMatchObject({ clientId: ID, tenantId: 'organizations' })
    })

    it('cambiar de aplicación cierra la sesión anterior; guardar lo mismo no', async () => {
      await servicio.guardarApp({ clientId: ID, tenantId: 'organizations' })
      expect(auth.cerrarSesion).toHaveBeenCalledTimes(1)
      await servicio.guardarApp({ clientId: ID, tenantId: 'organizations' })
      expect(auth.cerrarSesion).toHaveBeenCalledTimes(1)
      await servicio.guardarApp({ clientId: ID, tenantId: '99999999-2222-3333-4444-555555555555' })
      expect(auth.cerrarSesion).toHaveBeenCalledTimes(2)
    })

    it('avisa a la interfaz', async () => {
      const oyente = vi.fn()
      servicio.alCambiar(oyente)
      await servicio.guardarApp({ clientId: ID, tenantId: '' })
      expect(oyente).toHaveBeenCalled()
    })
  })

  describe('sesión', () => {
    it('iniciar sesión deja la cuenta visible', async () => {
      expect(await servicio.iniciarSesion()).toEqual({ ok: true })
      expect((await servicio.estado()).sesion?.nombre).toBe('Ale Dev')
    })

    it('si el inicio de sesión falla devuelve el motivo, sin lanzar', async () => {
      auth.iniciarSesion.mockRejectedValue(new NoListoError('Falta el ID de la aplicación'))
      expect(await servicio.iniciarSesion()).toEqual({ ok: false, error: 'Falta el ID de la aplicación' })
    })

    it('al iniciar sesión se entrega lo que estaba esperando', async () => {
      config = { ...config, teams: { ...config.teams, clientId: ID, teamId: 't', channelId: 'c' } }
      historial.registrarEvento({ tipo: 'inicio', ocurridoEn: new Date(), mensaje: 'hola' })
      responder = (_url, metodo) => (metodo === 'POST' ? json({ id: 'm' }, 201) : json({ value: [] }))
      await servicio.iniciarSesion()
      await vi.waitFor(() => expect(historial.pendientes()).toHaveLength(0))
      expect(peticiones.some((p) => p.startsWith('POST') && p.includes('/teams/t/channels/c/messages'))).toBe(true)
    })

    it('cerrar sesión limpia la cuenta', async () => {
      await servicio.iniciarSesion()
      await servicio.cerrarSesion()
      expect((await servicio.estado()).sesion).toBeNull()
    })
  })

  describe('equipos y canales', () => {
    it('lista los equipos con el token de la sesión', async () => {
      responder = () => json({ value: [{ id: '1', displayName: 'Equipo A' }] })
      expect(await servicio.listarEquipos()).toEqual({ ok: true, elementos: [{ id: '1', nombre: 'Equipo A' }] })
      expect(auth.obtenerToken).toHaveBeenCalledWith(ALCANCES_BASE)
    })

    it('lista los canales de un equipo', async () => {
      responder = () => json({ value: [{ id: 'c1', displayName: 'General' }] })
      const resultado = await servicio.listarCanales('abc')
      expect(resultado).toEqual({ ok: true, elementos: [{ id: 'c1', nombre: 'General' }] })
      expect(peticiones[0]).toContain('/teams/abc/channels')
    })

    it('sin sesión devuelve el error en lugar de lanzar', async () => {
      auth.obtenerToken.mockRejectedValue(new NoListoError('Inicia sesión con Microsoft (Teams)'))
      expect(await servicio.listarEquipos()).toEqual({ ok: false, error: 'Inicia sesión con Microsoft (Teams)' })
    })

    it('un error de Graph llega como mensaje', async () => {
      responder = () => json({ error: { message: 'Forbidden' } }, 403)
      const resultado = await servicio.listarEquipos()
      expect(resultado.ok).toBe(false)
    })

    it('elegir canal lo guarda con los nombres para mostrarlos', async () => {
      const oyente = vi.fn()
      servicio.alCambiar(oyente)
      expect(servicio.elegirCanal({ equipoId: 't', equipoNombre: 'Equipo', canalId: 'c', canalNombre: 'General' })).toEqual({ ok: true })
      expect(config.teams).toMatchObject({ teamId: 't', nombreEquipo: 'Equipo', channelId: 'c', nombreCanal: 'General' })
      expect(oyente).toHaveBeenCalled()
    })

    it('elegir sin equipo o canal es un error', () => {
      expect(servicio.elegirCanal({ equipoId: '', equipoNombre: '', canalId: 'c', canalNombre: '' }).ok).toBe(false)
    })
  })

  describe('menciones, prueba y reintento', () => {
    it('activar menciones pide el permiso y olvida lo aprendido', async () => {
      const olvidar = vi.spyOn(publicador, 'olvidarUsuarios')
      expect(await servicio.activarMenciones()).toEqual({ ok: true })
      expect(auth.darPermiso).toHaveBeenCalledWith(ALCANCE_MENCIONES)
      expect(olvidar).toHaveBeenCalled()
    })

    it('si el consentimiento falla, devuelve el motivo', async () => {
      auth.darPermiso.mockRejectedValue(new Error('El administrador debe aprobar'))
      expect(await servicio.activarMenciones()).toEqual({ ok: false, error: 'El administrador debe aprobar' })
    })

    it('el mensaje de prueba va directo al canal y no deja rastro en el historial', async () => {
      config = { ...config, teams: { ...config.teams, clientId: ID, teamId: 't', channelId: 'c', mencionar: '' } }
      responder = () => json({ id: 'm' }, 201)
      expect(await servicio.enviarPrueba()).toEqual({ ok: true })
      expect(peticiones).toHaveLength(1)
      expect(historial.pendientes()).toHaveLength(0)
    })

    it('la prueba sin canal elegido explica qué falta', async () => {
      config = { ...config, teams: { ...config.teams, clientId: ID } }
      const resultado = await servicio.enviarPrueba()
      expect(resultado).toMatchObject({ ok: false })
      expect(resultado.ok ? '' : resultado.error).toContain('equipo y el canal')
    })

    it('reintentar devuelve los fallidos a la cola', async () => {
      const reintentar = vi.spyOn(cola, 'reintentarAhora')
      await servicio.reintentar()
      expect(reintentar).toHaveBeenCalledWith(true)
    })
  })
})
