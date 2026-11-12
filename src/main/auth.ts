// Inicio de sesión con Microsoft (MSAL, flujo de código con PKCE en el navegador del sistema).
// Sin dependencias de Electron: abrir el navegador, el cifrado y la ruta se inyectan desde index.ts.
import { type AccountInfo, InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-node'
import { borrarCacheTokens, crearPluginCache, type Cifrador } from './cacheTokens'
import { ALCANCES_BASE } from './graphApi'
import { ErrorDePublicacion, NoListoError } from './publicadores/base'

export interface DependenciasAuth {
  /** Datos de la app registrada, leídos de la configuración en cada uso (cambian si el usuario los edita). */
  obtenerApp: () => { clientId: string; tenantId: string }
  rutaCache: string
  cifrador: Cifrador
  abrirNavegador: (url: string) => Promise<void>
  registrar?: (mensaje: string, error?: unknown) => void
}

/** Lo que pasa si el usuario no termina el inicio de sesión en el navegador. */
const ESPERA_MAXIMA_LOGIN_MS = 3 * 60_000

const PAGINA_LISTO =
  '<!doctype html><meta charset="utf-8"><title>Jornify</title><body style="font-family:Segoe UI,sans-serif;padding:3rem;text-align:center"><h2>Listo</h2><p>Ya puedes volver a Jornify. Puedes cerrar esta pestaña.</p></body>'
const PAGINA_ERROR =
  '<!doctype html><meta charset="utf-8"><title>Jornify</title><body style="font-family:Segoe UI,sans-serif;padding:3rem;text-align:center"><h2>No se pudo iniciar sesión</h2><p>Vuelve a Jornify e inténtalo de nuevo.</p></body>'

export class ServicioAuth {
  private cliente: PublicClientApplication | null = null
  private claveCliente = ''

  constructor(private readonly dependencias: DependenciasAuth) {}

  /** ¿Hay una aplicación registrada configurada? Sin ella no se puede ni empezar. */
  configurada(): boolean {
    return this.dependencias.obtenerApp().clientId.trim() !== ''
  }

  /** Cuenta con la sesión guardada, o null si no se ha iniciado sesión. */
  async cuenta(): Promise<AccountInfo | null> {
    if (!this.configurada()) return null
    const cuentas = await this.obtenerCliente().getTokenCache().getAllAccounts()
    return cuentas[0] ?? null
  }

  /** Abre el navegador para iniciar sesión y pide los permisos base. Resuelve con la cuenta. */
  async iniciarSesion(): Promise<AccountInfo> {
    const resultado = await this.interactivo(ALCANCES_BASE)
    if (!resultado.account) throw new Error('Microsoft no devolvió la cuenta')
    return resultado.account
  }

  /** Da un permiso extra (p. ej. el de menciones) abriendo el navegador para consentirlo. */
  async darPermiso(alcance: string): Promise<void> {
    await this.interactivo([alcance], await this.cuenta())
  }

  /**
   * Token de acceso para esos permisos, renovado en silencio. Si hay que volver a iniciar sesión (o falta
   * consentir un permiso) lanza NoListoError; si es un problema de red, ErrorDePublicacion reintentable.
   */
  async obtenerToken(alcances: string[]): Promise<string> {
    if (!this.configurada()) throw new NoListoError('Falta el ID de la aplicación de Microsoft (Teams)')
    const cuenta = await this.cuenta()
    if (!cuenta) throw new NoListoError('Inicia sesión con Microsoft (Teams)')
    try {
      const resultado = await this.obtenerCliente().acquireTokenSilent({ account: cuenta, scopes: alcances })
      return resultado.accessToken
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        throw new NoListoError('La sesión de Microsoft venció: vuelve a iniciar sesión (Teams)')
      }
      const motivo = error instanceof Error ? error.message : 'sin detalle'
      throw new ErrorDePublicacion(`No se pudo renovar la sesión de Microsoft (${motivo})`, true)
    }
  }

  /** Cierra la sesión: quita la cuenta de la caché y borra el archivo cifrado de tokens. */
  async cerrarSesion(): Promise<void> {
    if (this.configurada()) {
      const cliente = this.obtenerCliente()
      for (const cuenta of await cliente.getTokenCache().getAllAccounts()) {
        await cliente.getTokenCache().removeAccount(cuenta)
      }
    }
    borrarCacheTokens(this.dependencias.rutaCache)
    this.cliente = null
    this.claveCliente = ''
  }

  private async interactivo(alcances: string[], cuenta: AccountInfo | null = null) {
    if (!this.configurada()) throw new NoListoError('Falta el ID de la aplicación de Microsoft (Teams)')
    const solicitud = this.obtenerCliente().acquireTokenInteractive({
      scopes: alcances,
      openBrowser: this.dependencias.abrirNavegador,
      successTemplate: PAGINA_LISTO,
      errorTemplate: PAGINA_ERROR,
      ...(cuenta ? { loginHint: cuenta.username } : {})
    })
    let temporizador: NodeJS.Timeout | undefined
    const espera = new Promise<never>((_resolver, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error('Se agotó el tiempo para iniciar sesión')), ESPERA_MAXIMA_LOGIN_MS)
    })
    try {
      return await Promise.race([solicitud, espera])
    } finally {
      clearTimeout(temporizador)
    }
  }

  /** Un único cliente MSAL mientras no cambien el ID de la aplicación ni el inquilino. */
  private obtenerCliente(): PublicClientApplication {
    const { clientId, tenantId } = this.dependencias.obtenerApp()
    const clave = `${clientId.trim()}|${tenantId.trim()}`
    if (!this.cliente || clave !== this.claveCliente) {
      this.cliente = new PublicClientApplication({
        auth: {
          clientId: clientId.trim(),
          authority: `https://login.microsoftonline.com/${tenantId.trim() || 'organizations'}`
        },
        cache: {
          cachePlugin: crearPluginCache(this.dependencias.rutaCache, this.dependencias.cifrador, this.dependencias.registrar)
        }
      })
      this.claveCliente = clave
    }
    return this.cliente
  }
}
