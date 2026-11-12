// Utilidades de fecha sin dependencias de Electron.

function rellenar(numero: number, largo = 2): string {
  return String(numero).padStart(largo, '0')
}

/** ISO 8601 con la zona horaria local, p. ej. 2026-11-06T08:02:11.000-05:00. */
export function aIsoConZona(fecha: Date): string {
  const desfaseMin = -fecha.getTimezoneOffset()
  const signo = desfaseMin >= 0 ? '+' : '-'
  const abs = Math.abs(desfaseMin)
  const zona = `${signo}${rellenar(Math.floor(abs / 60))}:${rellenar(abs % 60)}`
  return (
    `${fecha.getFullYear()}-${rellenar(fecha.getMonth() + 1)}-${rellenar(fecha.getDate())}` +
    `T${rellenar(fecha.getHours())}:${rellenar(fecha.getMinutes())}:${rellenar(fecha.getSeconds())}` +
    `.${rellenar(fecha.getMilliseconds(), 3)}${zona}`
  )
}

/** Milisegundos desde la época de una fecha ISO 8601. Lanza RangeError si no es válida. */
export function milisegundosDe(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new RangeError(`Fecha ISO inválida: "${iso}"`)
  return ms
}

/** Inicio (inclusive) y fin (exclusivo) del día local que contiene la fecha dada. */
export function limitesDelDia(fecha: Date): { desde: Date; hasta: Date } {
  const desde = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  const hasta = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1)
  return { desde, hasta }
}

/** Fecha y hora local de "HH:MM" en el día que contiene `dia`. */
export function horaDelDia(dia: Date, hhmm: string): Date {
  const [horas = 0, minutos = 0] = hhmm.split(':').map(Number)
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), horas, minutos)
}
