import { describe, expect, it } from 'vitest'
import { configPorDefecto } from '../src/main/configEsquema'
import {
  RECUPERACION_MINIMA_MS,
  construirMensaje,
  formatearDuracionEnPalabras,
  formatearFecha,
  formatearHora,
  formatearHoraEntera,
  formatearMensaje,
  emojiDelSol,
  saludoDelDia
} from '../src/main/plantillas'

const en = (h: number, m: number): Date => new Date(2026, 10, 6, h, m)

describe('formatearHora y formatearFecha', () => {
  it('usa formato de 12 horas con "a. m." y "p. m." y espacios normales', () => {
    expect(formatearHora(en(8, 2))).toBe('8:02 a. m.')
    expect(formatearHora(en(12, 30))).toBe('12:30 p. m.')
    expect(formatearHora(en(17, 5))).toBe('5:05 p. m.')
    expect(formatearHora(en(0, 15))).toBe('12:15 a. m.')
  })

  it('escribe la fecha larga en español', () => {
    expect(formatearFecha(en(8, 0))).toBe('6 de noviembre de 2026')
  })
})

describe('formatearMensaje', () => {
  it('sustituye {hora}, {fecha} y {nombre}', () => {
    const mensaje = formatearMensaje('{nombre}: {fecha}, {hora}', {
      fecha: en(8, 2),
      nombre: 'Alejandro'
    })
    expect(mensaje).toBe('Alejandro: 6 de noviembre de 2026, 8:02 a. m.')
  })

  it('incluye el motivo y no duplica el punto después de "a. m."', () => {
    const mensaje = formatearMensaje('⏸️ Me ausento – {hora}. {motivo}', { fecha: en(15, 10), motivo: 'Cita médica' })
    expect(mensaje).toBe('⏸️ Me ausento – 3:10 p. m. Cita médica')
  })

  it('sin motivo quita {motivo} y la puntuación que lo precede', () => {
    const mensaje = formatearMensaje('⏸️ Me ausento – {hora}. {motivo}', { fecha: en(15, 10) })
    expect(mensaje).toBe('⏸️ Me ausento – 3:10 p. m.')
    expect(formatearMensaje('Me ausento – {hora}. {motivo}', { fecha: en(15, 10), motivo: '   ' })).toBe(
      'Me ausento – 3:10 p. m.'
    )
  })

  it('repite una variable las veces que aparezca', () => {
    expect(formatearMensaje('{hora} / {hora}', { fecha: en(9, 0) })).toBe('9:00 a. m. / 9:00 a. m.')
  })

  it('deja intactas las variables desconocidas', () => {
    expect(formatearMensaje('Hola {equipo} – {hora}', { fecha: en(9, 0) })).toBe('Hola {equipo} – 9:00 a. m.')
  })

  it('no vuelve a interpretar llaves que vengan dentro del motivo', () => {
    const mensaje = formatearMensaje('Me ausento. {motivo}', { fecha: en(9, 0), motivo: 'ver {hora}' })
    expect(mensaje).toBe('Me ausento. ver {hora}')
  })

  it('sin nombre sustituye {nombre} por vacío', () => {
    expect(formatearMensaje('[{nombre}] {hora}', { fecha: en(9, 0) })).toBe('[] 9:00 a. m.')
  })
})

describe('construirMensaje', () => {
  const plantillas = configPorDefecto().plantillas

  const mencion = 'Angela Ortiz Peña'

  it('genera el mensaje de cada tipo de evento con las plantillas por defecto', () => {
    const construir = (tipo: Parameters<typeof construirMensaje>[1], fecha: Date, extra = {}): string =>
      construirMensaje(plantillas, tipo, { fecha, mencion, ...extra })
    expect(construir('inicio', en(8, 2))).toBe('🌅 Buenos días, inicio mi jornada @Angela Ortiz Peña')
    expect(construir('almuerzo', en(12, 30))).toBe('🍲 Buenas tardes, inicio mi hora de almuerzo @Angela Ortiz Peña')
    expect(construir('regreso_almuerzo', en(13, 30))).toBe(
      '🍽️ Buenas tardes, termino mi hora de almuerzo @Angela Ortiz Peña'
    )
    expect(construir('ausencia', en(10, 10))).toBe('⏸️ Buenos días, me ausento un momento @Angela Ortiz Peña')
    expect(construir('ausencia', en(15, 10))).toBe('⏸️ Buenas tardes, me ausento un momento @Angela Ortiz Peña')
    expect(construir('regreso', en(10, 40))).toBe('▶️ Buenos días, regreso @Angela Ortiz Peña')
    expect(construir('regreso', en(15, 45))).toBe('▶️ Buenas tardes, regreso @Angela Ortiz Peña')
    expect(construir('fin', en(19, 5))).toBe('🌇 Buenas tardes, termino mi jornada @Angela Ortiz Peña')
  })

  it('al finalizar con tiempo de más usa la plantilla de recuperación', () => {
    const fin = (recuperadoMs: number): string =>
      construirMensaje(plantillas, 'fin', { fecha: en(19, 30), mencion, recuperadoMs })
    expect(fin(90 * 60_000)).toBe('⏱️ Buenas tardes, termino mi jornada y recupero 1 hora y 30 minutos de hoy @Angela Ortiz Peña')
    expect(fin(RECUPERACION_MINIMA_MS)).toBe('⏱️ Buenas tardes, termino mi jornada y recupero 1 minuto de hoy @Angela Ortiz Peña')
    // Menos de un minuto, o cero: mensaje normal.
    expect(fin(59_000)).toBe('🌇 Buenas tardes, termino mi jornada @Angela Ortiz Peña')
    expect(fin(0)).toBe('🌇 Buenas tardes, termino mi jornada @Angela Ortiz Peña')
  })

  it('el tiempo de más solo cambia el mensaje de fin de jornada', () => {
    expect(construirMensaje(plantillas, 'regreso', { fecha: en(15, 0), mencion, recuperadoMs: 3_600_000 })).toBe(
      '▶️ Buenas tardes, regreso @Angela Ortiz Peña'
    )
  })

  it('usa las plantillas editadas por el usuario', () => {
    const editadas = { ...plantillas, inicio: '{saludo}, {nombre}. Empiezo a las {hora}' }
    expect(construirMensaje(editadas, 'inicio', { fecha: en(8, 2), nombre: 'Ale' })).toBe(
      'Buenos días, Ale. Empiezo a las 8:02 a. m.'
    )
  })
})

describe('saludoDelDia', () => {
  it('saluda con "Buenos días" hasta las 11:59 y con "Buenas tardes" desde las 12:00', () => {
    expect(saludoDelDia(en(0, 5))).toBe('Buenos días')
    expect(saludoDelDia(en(11, 59))).toBe('Buenos días')
    expect(saludoDelDia(en(12, 0))).toBe('Buenas tardes')
    expect(saludoDelDia(en(23, 30))).toBe('Buenas tardes')
  })
})

describe('formatearDuracionEnPalabras', () => {
  it('escribe horas y minutos en singular y plural, sin segundos', () => {
    expect(formatearDuracionEnPalabras(60_000)).toBe('1 minuto')
    expect(formatearDuracionEnPalabras(45 * 60_000 + 59_000)).toBe('45 minutos')
    expect(formatearDuracionEnPalabras(3_600_000)).toBe('1 hora')
    expect(formatearDuracionEnPalabras(2 * 3_600_000)).toBe('2 horas')
    expect(formatearDuracionEnPalabras(3_600_000 + 60_000)).toBe('1 hora y 1 minuto')
    expect(formatearDuracionEnPalabras(2 * 3_600_000 + 30 * 60_000)).toBe('2 horas y 30 minutos')
    expect(formatearDuracionEnPalabras(0)).toBe('0 minutos')
  })
})

describe('{mencion}', () => {
  it('antepone la arroba una sola vez y se omite sin nombre', () => {
    expect(formatearMensaje('Hola {mencion}', { fecha: en(9, 0), mencion: 'Ana Pérez' })).toBe('Hola @Ana Pérez')
    expect(formatearMensaje('Hola {mencion}', { fecha: en(9, 0), mencion: '@Ana Pérez' })).toBe('Hola @Ana Pérez')
    expect(formatearMensaje('Hola {mencion}', { fecha: en(9, 0), mencion: '  ' })).toBe('Hola')
    expect(formatearMensaje('Hola {mencion} gracias', { fecha: en(9, 0) })).toBe('Hola gracias')
  })
})

describe('formatearHoraEntera', () => {
  it('rotula las horas del eje sin minutos', () => {
    expect(formatearHoraEntera(en(8, 0).getTime())).toBe('8 a. m.')
    expect(formatearHoraEntera(en(16, 0).getTime())).toBe('4 p. m.')
    expect(formatearHoraEntera(en(12, 0).getTime())).toBe('12 p. m.')
  })
})

describe('emojiDelSol', () => {
  it('amanecer antes de las 12:00 y atardecer desde entonces', () => {
    expect(emojiDelSol(en(6, 0))).toBe('🌅')
    expect(emojiDelSol(en(11, 59))).toBe('🌅')
    expect(emojiDelSol(en(12, 0))).toBe('🌇')
    expect(emojiDelSol(en(18, 30))).toBe('🌇')
  })
})

describe('{sol}', () => {
  it('se sustituye según la hora del evento', () => {
    expect(formatearMensaje('{sol} hola', { fecha: en(8, 0) })).toBe('🌅 hola')
    expect(formatearMensaje('{sol} hola', { fecha: en(17, 0) })).toBe('🌇 hola')
  })
})
