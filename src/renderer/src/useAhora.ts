import { useEffect, useState } from 'react'

/**
 * Hora actual en ms, actualizada cada segundo. Solo late mientras `activo` sea true y la ventana
 * esté visible (no minimizada), para no gastar CPU redibujando un reloj que nadie ve.
 */
export function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!activo) return
    let temporizador: number | undefined

    const detener = (): void => {
      if (temporizador !== undefined) window.clearInterval(temporizador)
      temporizador = undefined
    }
    const iniciar = (): void => {
      detener()
      setAhora(Date.now())
      temporizador = window.setInterval(() => setAhora(Date.now()), 1000)
    }
    const alCambiarVisibilidad = (): void => (document.visibilityState === 'visible' ? iniciar() : detener())

    if (document.visibilityState === 'visible') iniciar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      detener()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [activo])

  return ahora
}
