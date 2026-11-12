import type { EstadoTeams } from '../../../preload/tipos'

export type NivelTeams = 'ok' | 'espera' | 'accion'

export interface ResumenTeams {
  nivel: NivelTeams
  /** Frase corta para el título del botón y la vista. */
  texto: string
}

/** Qué decirle a la persona sobre la conexión con Teams y la cola de mensajes. */
export function resumirTeams(estado: EstadoTeams): ResumenTeams {
  const { cola } = estado
  if (!estado.clientId) return { nivel: 'accion', texto: 'Falta registrar la aplicación de Microsoft' }
  if (!estado.sesion) return { nivel: 'accion', texto: 'Falta iniciar sesión con Microsoft' }
  if (!estado.canal) return { nivel: 'accion', texto: 'Falta elegir el canal de Teams' }
  if (cola.fallidos > 0) {
    return {
      nivel: 'accion',
      texto: cola.fallidos === 1 ? '1 mensaje no se pudo enviar' : `${cola.fallidos} mensajes no se pudieron enviar`
    }
  }
  if (cola.pendientes > 0) {
    return {
      nivel: cola.requiereAccion ? 'accion' : 'espera',
      texto: cola.pendientes === 1 ? '1 mensaje en cola' : `${cola.pendientes} mensajes en cola`
    }
  }
  return { nivel: 'ok', texto: 'Conectado, todo enviado' }
}
