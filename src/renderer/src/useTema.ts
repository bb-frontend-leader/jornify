import { useEffect } from 'react'
import { cssDelTema } from '../../main/temas'

const ID_ESTILO = 'tema-jornify'

/** Aplica el tema: una hoja de estilos que redefine las variables neutras (claro y oscuro). El clásico no agrega nada. */
export function useTema(id: string): void {
  useEffect(() => {
    let hoja = document.getElementById(ID_ESTILO)
    if (!hoja) {
      hoja = document.createElement('style')
      hoja.id = ID_ESTILO
      document.head.appendChild(hoja)
    }
    hoja.textContent = cssDelTema(id)
    document.documentElement.dataset['tema'] = id
  }, [id])
}
