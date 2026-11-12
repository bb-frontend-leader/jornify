// Publicador de prueba: en lugar de enviar a Teams, escribe el mensaje en el registro.
import type { ContextoPublicacion, Publicador, ResultadoPublicacion } from './base'

export class PublicadorLog implements Publicador {
  constructor(private readonly escribir: (texto: string) => void) {}

  publicar(mensaje: string, contexto: ContextoPublicacion): Promise<ResultadoPublicacion | undefined> {
    this.escribir(`[publicador de prueba] ${contexto.tipo} → ${mensaje}`)
    return Promise.resolve(undefined)
  }
}
