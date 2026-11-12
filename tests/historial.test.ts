import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aIsoConZona, limitesDelDia, milisegundosDe } from '../src/main/fechas'
import { Historial } from '../src/main/historial'

const en = (dia: number, h: number, m = 0): Date => new Date(2026, 10, dia, h, m)

describe('Historial', () => {
  let historial: Historial

  beforeEach(() => {
    historial = Historial.abrir(':memory:')
  })
  afterEach(() => historial.cerrar())

  it('guarda un evento como pendiente, con la hora en ISO con zona horaria', () => {
    const evento = historial.registrarEvento({
      tipo: 'inicio',
      ocurridoEn: en(6, 8, 2),
      mensaje: '🟢 Inicio de jornada – 8:02 a. m.'
    })
    expect(evento).toMatchObject({
      id: 1,
      tipo: 'inicio',
      motivo: null,
      mensaje: '🟢 Inicio de jornada – 8:02 a. m.',
      estadoEnvio: 'pendiente',
      enviadoEn: null,
      intentos: 0
    })
    expect(evento.ocurridoEn).toMatch(/^2026-11-06T08:02:00\.000[+-]\d{2}:\d{2}$/)
    expect(new Date(evento.ocurridoEn).getTime()).toBe(en(6, 8, 2).getTime())
  })

  it('guarda el motivo de las ausencias y descarta los vacíos', () => {
    const conMotivo = historial.registrarEvento({
      tipo: 'ausencia',
      ocurridoEn: en(6, 15, 10),
      motivo: ' Cita médica ',
      mensaje: 'm'
    })
    const sinMotivo = historial.registrarEvento({ tipo: 'regreso', ocurridoEn: en(6, 15, 45), motivo: '  ', mensaje: 'm' })
    expect(conMotivo.motivo).toBe('Cita médica')
    expect(sinMotivo.motivo).toBeNull()
  })

  it('marca un evento como enviado con la hora de publicación', () => {
    const { id } = historial.registrarEvento({ tipo: 'inicio', ocurridoEn: en(6, 8), mensaje: 'm' })
    const enviado = historial.marcarEnviado(id, en(6, 8, 5))
    expect(enviado.estadoEnvio).toBe('enviado')
    expect(milisegundosDe(enviado.enviadoEn ?? '')).toBe(en(6, 8, 5).getTime())
    expect(historial.pendientes()).toHaveLength(0)
  })

  it('cuenta los intentos fallidos y solo pasa a "fallido" cuando se da por perdido', () => {
    const { id } = historial.registrarEvento({ tipo: 'inicio', ocurridoEn: en(6, 8), mensaje: 'm' })
    const primero = historial.registrarIntentoFallido(id)
    expect(primero).toMatchObject({ intentos: 1, estadoEnvio: 'pendiente' })
    expect(historial.pendientes()).toHaveLength(1)

    const segundo = historial.registrarIntentoFallido(id, true)
    expect(segundo).toMatchObject({ intentos: 2, estadoEnvio: 'fallido' })
    expect(historial.pendientes()).toHaveLength(0)
  })

  it('lista los pendientes por hora real del evento, no por orden de inserción', () => {
    historial.registrarEvento({ tipo: 'almuerzo', ocurridoEn: en(6, 12, 30), mensaje: 'b' })
    historial.registrarEvento({ tipo: 'inicio', ocurridoEn: en(6, 8), mensaje: 'a' })
    expect(historial.pendientes().map((e) => e.tipo)).toEqual(['inicio', 'almuerzo'])
  })

  it('devuelve solo los eventos del día local pedido', () => {
    historial.registrarEvento({ tipo: 'fin', ocurridoEn: new Date(2026, 10, 5, 23, 59, 59), mensaje: 'ayer' })
    historial.registrarEvento({ tipo: 'inicio', ocurridoEn: new Date(2026, 10, 6, 0, 0, 0), mensaje: 'hoy 1' })
    historial.registrarEvento({ tipo: 'almuerzo', ocurridoEn: en(6, 12), mensaje: 'hoy 2' })
    historial.registrarEvento({ tipo: 'inicio', ocurridoEn: new Date(2026, 10, 7, 0, 0, 0), mensaje: 'mañana' })

    expect(historial.eventosDelDia(en(6, 15)).map((e) => e.mensaje)).toEqual(['hoy 1', 'hoy 2'])
    expect(historial.eventosDelDia(en(8, 9))).toEqual([])
  })

  it('compara por instante aunque los eventos estén guardados con distinta zona horaria', () => {
    // Insertado a mano con otro desfase: 2026-11-06T13:00:00Z equivale a las 08:00 en UTC-5.
    const db = (historial as unknown as { db: import('better-sqlite3').Database }).db
    db.prepare("INSERT INTO eventos (tipo, ocurrido_en, mensaje) VALUES ('inicio', '2026-11-06T18:00:00.000+05:00', 'x')").run()
    const desde = new Date('2026-11-06T12:30:00Z')
    const hasta = new Date('2026-11-06T13:30:00Z')
    expect(historial.eventosEntre(desde, hasta)).toHaveLength(1)
  })

  it('deriva el estado actual del último evento del día', () => {
    expect(historial.estadoActual(en(6, 9))).toBe('fuera_de_jornada')
    historial.registrarEvento({ tipo: 'inicio', ocurridoEn: en(6, 8), mensaje: 'm' })
    expect(historial.estadoActual(en(6, 9))).toBe('trabajando')
    historial.registrarEvento({ tipo: 'almuerzo', ocurridoEn: en(6, 12), mensaje: 'm' })
    expect(historial.estadoActual(en(6, 12, 5))).toBe('en_almuerzo')
    // Al día siguiente se empieza de cero.
    expect(historial.estadoActual(en(7, 8))).toBe('fuera_de_jornada')
  })

  it('devuelve el último evento registrado, o null si no hay', () => {
    expect(historial.ultimoEvento()).toBeNull()
    historial.registrarEvento({ tipo: 'inicio', ocurridoEn: en(6, 8), mensaje: 'a' })
    historial.registrarEvento({ tipo: 'almuerzo', ocurridoEn: en(6, 12), mensaje: 'b' })
    expect(historial.ultimoEvento()?.mensaje).toBe('b')
  })

  it('rechaza tipos y estados de envío inválidos a nivel de base de datos', () => {
    const db = (historial as unknown as { db: import('better-sqlite3').Database }).db
    expect(() => db.prepare("INSERT INTO eventos (tipo, ocurrido_en, mensaje) VALUES ('siesta', 'x', 'm')").run()).toThrow()
    expect(() =>
      db.prepare("INSERT INTO eventos (tipo, ocurrido_en, mensaje, estado_envio) VALUES ('inicio', 'x', 'm', 'quizá')").run()
    ).toThrow()
  })

  it('lanza un error si se pide un evento que no existe', () => {
    expect(() => historial.obtener(999)).toThrow(/999/)
  })
})

describe('fechas', () => {
  it('aIsoConZona conserva el instante exacto', () => {
    const fecha = new Date(2026, 10, 6, 8, 2, 11, 123)
    expect(milisegundosDe(aIsoConZona(fecha))).toBe(fecha.getTime())
    expect(aIsoConZona(fecha)).toMatch(/^2026-11-06T08:02:11\.123[+-]\d{2}:\d{2}$/)
  })

  it('limitesDelDia devuelve medianoche a medianoche locales', () => {
    const { desde, hasta } = limitesDelDia(en(6, 15))
    expect(desde).toEqual(new Date(2026, 10, 6, 0, 0, 0))
    expect(hasta).toEqual(new Date(2026, 10, 7, 0, 0, 0))
  })

  it('milisegundosDe rechaza fechas inválidas', () => {
    expect(() => milisegundosDe('no es fecha')).toThrow(RangeError)
  })
})

describe('Historial: acciones programadas', () => {
  let historial: Historial

  beforeEach(() => {
    historial = Historial.abrir(':memory:')
  })

  it('crea programados pendientes y los devuelve ordenados por hora', () => {
    historial.crearProgramado({ tipo: 'regreso', programadoPara: en(6, 15), creadoEn: en(6, 8) })
    const primero = historial.crearProgramado({ tipo: 'ausencia', programadoPara: en(6, 10), mensaje: ' Hola ', creadoEn: en(6, 8) })
    expect(primero).toMatchObject({ estado: 'pendiente', origen: 'manual', mensaje: 'Hola', nota: null, eventoId: null })
    expect(historial.programadosPendientes().map((p) => p.tipo)).toEqual(['ausencia', 'regreso'])
  })

  it('resolver cierra un pendiente una sola vez', () => {
    const { id } = historial.crearProgramado({ tipo: 'ausencia', programadoPara: en(6, 10), creadoEn: en(6, 8) })
    expect(historial.resolverProgramado(id, 'omitido', 'porque sí')).toBe(true)
    expect(historial.resolverProgramado(id, 'ejecutado')).toBe(false)
    expect(historial.obtenerProgramado(id)).toMatchObject({ estado: 'omitido', nota: 'porque sí' })
    expect(historial.programadosPendientes()).toHaveLength(0)
  })

  it('programadosEntre limita por día y compara por instante', () => {
    historial.crearProgramado({ tipo: 'fin', programadoPara: en(5, 18), creadoEn: en(5, 8) })
    historial.crearProgramado({ tipo: 'fin', programadoPara: en(6, 18), creadoEn: en(6, 8) })
    const { desde, hasta } = limitesDelDia(en(6, 12))
    expect(historial.programadosEntre(desde, hasta)).toHaveLength(1)
  })

  it('una base de la versión 1 (sin la tabla) se actualiza sin perder eventos', () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'jornify-bd-'))
    const ruta = join(carpeta, 'historial.db')
    try {
      const v2 = Historial.abrir(ruta)
      v2.registrarEvento({ tipo: 'inicio', ocurridoEn: en(6, 8), mensaje: 'hola' })
      v2.cerrar()
      const bd = new Database(ruta)
      // Deja la base como la versión 1 de verdad: sin la tabla de programados ni las columnas del hilo.
      bd.exec('DROP TABLE programados; ALTER TABLE eventos DROP COLUMN teams_mensaje_id; ALTER TABLE eventos DROP COLUMN teams_es_raiz')
      bd.pragma('user_version = 1')
      bd.close()

      const migrado = Historial.abrir(ruta)
      try {
        expect(migrado.eventosDelDia(en(6, 12))).toHaveLength(1)
        expect(migrado.crearProgramado({ tipo: 'fin', programadoPara: en(6, 18), creadoEn: en(6, 8) }).id).toBe(1)
        // Las columnas del hilo existen tras actualizar.
        const evento = migrado.eventosDelDia(en(6, 12))[0]
        if (!evento) throw new Error('falta el evento')
        migrado.marcarEnviado(evento.id, en(6, 9), { id: 'raiz', esRaiz: true })
        expect(migrado.hiloVigente(en(6, 12))).toBe('raiz')
      } finally {
        migrado.cerrar()
      }
    } finally {
      rmSync(carpeta, { recursive: true, force: true })
    }
  })
})
