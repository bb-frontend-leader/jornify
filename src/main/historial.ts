// Historial local de eventos en SQLite (better-sqlite3). Sin dependencias de Electron.
import Database from 'better-sqlite3'
import { type EstadoJornada, type EventoJornada, type TipoEvento, TIPOS_EVENTO, estadoDesdeEventos } from './estado'
import { aIsoConZona, limitesDelDia } from './fechas'

export type EstadoEnvio = 'pendiente' | 'enviado' | 'fallido'

export interface Evento extends EventoJornada {
  id: number
  motivo: string | null
  /** Texto final enviado (o por enviar). */
  mensaje: string
  estadoEnvio: EstadoEnvio
  /** Hora de publicación en Teams (ISO 8601), null mientras no se publique. */
  enviadoEn: string | null
  /** Número de reintentos fallidos. */
  intentos: number
}

export interface NuevoEvento {
  tipo: TipoEvento
  ocurridoEn: Date
  motivo?: string | null
  mensaje: string
}

export type EstadoProgramado = 'pendiente' | 'ejecutado' | 'omitido' | 'cancelado'
export type OrigenProgramado = 'manual' | 'automatico'

/** Acción que se registrará sola a una hora del día. */
export interface Programado {
  id: number
  tipo: TipoEvento
  /** Hora a la que debe ejecutarse (ISO 8601 con zona). */
  programadoPara: string
  /** Texto propio (puede llevar variables como {saludo}); null = la plantilla de siempre. */
  mensaje: string | null
  /** 'automatico' lo crea la app (p. ej. el regreso del almuerzo); 'manual' lo crea el usuario. */
  origen: OrigenProgramado
  estado: EstadoProgramado
  /** Por qué no se ejecutó (omitido o cancelado). */
  nota: string | null
  /** Evento registrado al ejecutarlo. */
  eventoId: number | null
}

export interface NuevoProgramado {
  tipo: TipoEvento
  programadoPara: Date
  mensaje?: string | null
  origen?: OrigenProgramado
  creadoEn: Date
}

interface FilaProgramado {
  id: number
  tipo: TipoEvento
  programado_para: string
  mensaje: string | null
  origen: OrigenProgramado
  estado: EstadoProgramado
  nota: string | null
  evento_id: number | null
}

interface FilaEvento {
  id: number
  tipo: TipoEvento
  ocurrido_en: string
  motivo: string | null
  mensaje: string
  estado_envio: EstadoEnvio
  enviado_en: string | null
  intentos: number
}

const VERSION_ESQUEMA = 3

const lista = (valores: readonly string[]): string => valores.map((valor) => `'${valor}'`).join(', ')

const ESQUEMA_V1 = `
  CREATE TABLE eventos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo          TEXT    NOT NULL CHECK (tipo IN (${lista(TIPOS_EVENTO)})),
    ocurrido_en   TEXT    NOT NULL,
    motivo        TEXT,
    mensaje       TEXT    NOT NULL,
    estado_envio  TEXT    NOT NULL DEFAULT 'pendiente'
                  CHECK (estado_envio IN ('pendiente', 'enviado', 'fallido')),
    enviado_en    TEXT,
    intentos      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_eventos_ocurrido ON eventos (unixepoch(ocurrido_en));
`

// v2: acciones programadas para una hora del día (ver programador.ts).
const ESQUEMA_V2 = `
  CREATE TABLE programados (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo             TEXT    NOT NULL CHECK (tipo IN (${lista(TIPOS_EVENTO)})),
    programado_para  TEXT    NOT NULL,
    mensaje          TEXT,
    origen           TEXT    NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'automatico')),
    estado           TEXT    NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'ejecutado', 'omitido', 'cancelado')),
    nota             TEXT,
    evento_id        INTEGER REFERENCES eventos (id),
    creado_en        TEXT    NOT NULL
  );
  CREATE INDEX idx_programados_para ON programados (unixepoch(programado_para));
`

// v3: id del mensaje en Teams y si abrió un hilo (los mensajes que siguen a un inicio de jornada le responden).
const ESQUEMA_V3 = `
  ALTER TABLE eventos ADD COLUMN teams_mensaje_id TEXT;
  ALTER TABLE eventos ADD COLUMN teams_es_raiz INTEGER NOT NULL DEFAULT 0;
`

const ORDEN = 'ORDER BY unixepoch(ocurrido_en), id'
const ORDEN_PROGRAMADOS = 'ORDER BY unixepoch(programado_para), id'

function aEvento(fila: FilaEvento): Evento {
  return {
    id: fila.id,
    tipo: fila.tipo,
    ocurridoEn: fila.ocurrido_en,
    motivo: fila.motivo,
    mensaje: fila.mensaje,
    estadoEnvio: fila.estado_envio,
    enviadoEn: fila.enviado_en,
    intentos: fila.intentos
  }
}

function aProgramado(fila: FilaProgramado): Programado {
  return {
    id: fila.id,
    tipo: fila.tipo,
    programadoPara: fila.programado_para,
    mensaje: fila.mensaje,
    origen: fila.origen,
    estado: fila.estado,
    nota: fila.nota,
    eventoId: fila.evento_id
  }
}

export class Historial {
  private constructor(private readonly db: Database.Database) {}

  /** Abre (o crea) la base de datos. Usar ':memory:' en pruebas. */
  static abrir(ruta: string): Historial {
    const db = new Database(ruta)
    if (ruta !== ':memory:') db.pragma('journal_mode = WAL')
    const historial = new Historial(db)
    historial.migrar()
    return historial
  }

  private migrar(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number
    if (version > VERSION_ESQUEMA) {
      throw new Error(`historial.db es de una versión más nueva (${version}) que esta app (${VERSION_ESQUEMA})`)
    }
    if (version < 1) {
      this.db.transaction(() => {
        this.db.exec(ESQUEMA_V1)
        this.db.pragma('user_version = 1')
      })()
    }
    if (version < 2) {
      this.db.transaction(() => {
        this.db.exec(ESQUEMA_V2)
        this.db.pragma('user_version = 2')
      })()
    }
    if (version < 3) {
      this.db.transaction(() => {
        this.db.exec(ESQUEMA_V3)
        this.db.pragma('user_version = 3')
      })()
    }
  }

  /** Guarda un evento como pendiente de envío. La hora se almacena en ISO 8601 con zona horaria. */
  registrarEvento(datos: NuevoEvento): Evento {
    const resultado = this.db
      .prepare('INSERT INTO eventos (tipo, ocurrido_en, motivo, mensaje) VALUES (?, ?, ?, ?)')
      .run(datos.tipo, aIsoConZona(datos.ocurridoEn), datos.motivo?.trim() || null, datos.mensaje)
    return this.obtener(Number(resultado.lastInsertRowid))
  }

  obtener(id: number): Evento {
    const fila = this.db.prepare('SELECT * FROM eventos WHERE id = ?').get(id) as FilaEvento | undefined
    if (!fila) throw new Error(`No existe el evento ${id}`)
    return aEvento(fila)
  }

  /** Marca el evento como publicado; con `mensajeTeams` guarda su id en el canal para que los siguientes del día le respondan. */
  marcarEnviado(id: number, enviadoEn: Date, mensajeTeams?: { id: string; esRaiz: boolean }): Evento {
    this.db
      .prepare(
        "UPDATE eventos SET estado_envio = 'enviado', enviado_en = ?, teams_mensaje_id = ?, teams_es_raiz = ? WHERE id = ?"
      )
      .run(aIsoConZona(enviadoEn), mensajeTeams?.id ?? null, mensajeTeams?.esRaiz ? 1 : 0, id)
    return this.obtener(id)
  }

  /**
   * Id del mensaje del canal que abrió el hilo vigente a la hora `hasta`: el último mensaje publicado como
   * mensaje del canal (no como respuesta) a esa hora o antes. Null si no hay ninguno.
   */
  hiloVigente(hasta: Date): string | null {
    const fila = this.db
      .prepare(
        `SELECT teams_mensaje_id FROM eventos
         WHERE teams_es_raiz = 1 AND teams_mensaje_id IS NOT NULL AND unixepoch(ocurrido_en) <= ?
         ORDER BY unixepoch(ocurrido_en) DESC, id DESC LIMIT 1`
      )
      .get(Math.floor(hasta.getTime() / 1000)) as { teams_mensaje_id: string } | undefined
    return fila?.teams_mensaje_id ?? null
  }

  /** Suma un intento fallido; con `definitivo` el evento pasa a "fallido", si no sigue pendiente. */
  registrarIntentoFallido(id: number, definitivo = false): Evento {
    this.db
      .prepare('UPDATE eventos SET intentos = intentos + 1, estado_envio = ? WHERE id = ?')
      .run(definitivo ? 'fallido' : 'pendiente', id)
    return this.obtener(id)
  }

  /** Eventos por enviar, del más antiguo al más reciente. */
  pendientes(): Evento[] {
    const filas = this.db
      .prepare(`SELECT * FROM eventos WHERE estado_envio = 'pendiente' ${ORDEN}`)
      .all() as FilaEvento[]
    return filas.map(aEvento)
  }

  /** Cuántos eventos quedaron como "fallido" (se dejaron de reintentar). */
  contarFallidos(): number {
    const fila = this.db.prepare("SELECT COUNT(*) AS n FROM eventos WHERE estado_envio = 'fallido'").get() as { n: number }
    return fila.n
  }

  /** Vuelve a poner en cola los eventos fallidos, con los intentos en cero. Devuelve cuántos eran. */
  reencolarFallidos(): number {
    return this.db
      .prepare("UPDATE eventos SET estado_envio = 'pendiente', intentos = 0 WHERE estado_envio = 'fallido'")
      .run().changes
  }

  /** Eventos con hora real en [desde, hasta), en orden cronológico. */
  eventosEntre(desde: Date, hasta: Date): Evento[] {
    const filas = this.db
      .prepare(`SELECT * FROM eventos WHERE unixepoch(ocurrido_en) >= ? AND unixepoch(ocurrido_en) < ? ${ORDEN}`)
      .all(Math.floor(desde.getTime() / 1000), Math.floor(hasta.getTime() / 1000)) as FilaEvento[]
    return filas.map(aEvento)
  }

  /** Eventos del día local que contiene la fecha. */
  eventosDelDia(fecha: Date): Evento[] {
    const { desde, hasta } = limitesDelDia(fecha)
    return this.eventosEntre(desde, hasta)
  }

  ultimoEvento(): Evento | null {
    const fila = this.db
      .prepare('SELECT * FROM eventos ORDER BY unixepoch(ocurrido_en) DESC, id DESC LIMIT 1')
      .get() as FilaEvento | undefined
    return fila ? aEvento(fila) : null
  }

  /** Estado de la jornada derivado de los eventos del día (no se guarda aparte). */
  estadoActual(ahora: Date): EstadoJornada {
    return estadoDesdeEventos(this.eventosDelDia(ahora))
  }

  /** Guarda una acción programada como pendiente. */
  crearProgramado(datos: NuevoProgramado): Programado {
    const resultado = this.db
      .prepare('INSERT INTO programados (tipo, programado_para, mensaje, origen, creado_en) VALUES (?, ?, ?, ?, ?)')
      .run(
        datos.tipo,
        aIsoConZona(datos.programadoPara),
        datos.mensaje?.trim() || null,
        datos.origen ?? 'manual',
        aIsoConZona(datos.creadoEn)
      )
    return this.obtenerProgramado(Number(resultado.lastInsertRowid))
  }

  obtenerProgramado(id: number): Programado {
    const fila = this.db.prepare('SELECT * FROM programados WHERE id = ?').get(id) as FilaProgramado | undefined
    if (!fila) throw new Error(`No existe la acción programada ${id}`)
    return aProgramado(fila)
  }

  /** Programados que aún no se ejecutan, de la hora más próxima a la más lejana. */
  programadosPendientes(): Programado[] {
    const filas = this.db
      .prepare(`SELECT * FROM programados WHERE estado = 'pendiente' ${ORDEN_PROGRAMADOS}`)
      .all() as FilaProgramado[]
    return filas.map(aProgramado)
  }

  /** Programados con hora en [desde, hasta), sea cual sea su estado. */
  programadosEntre(desde: Date, hasta: Date): Programado[] {
    const filas = this.db
      .prepare(
        `SELECT * FROM programados WHERE unixepoch(programado_para) >= ? AND unixepoch(programado_para) < ? ${ORDEN_PROGRAMADOS}`
      )
      .all(Math.floor(desde.getTime() / 1000), Math.floor(hasta.getTime() / 1000)) as FilaProgramado[]
    return filas.map(aProgramado)
  }

  /**
   * Cierra un programado pendiente. Devuelve false si ya no estaba pendiente
   * (se canceló o se resolvió mientras tanto), sin tocarlo.
   */
  resolverProgramado(
    id: number,
    estado: Exclude<EstadoProgramado, 'pendiente'>,
    nota: string | null = null,
    eventoId: number | null = null
  ): boolean {
    const { changes } = this.db
      .prepare("UPDATE programados SET estado = ?, nota = ?, evento_id = ? WHERE id = ? AND estado = 'pendiente'")
      .run(estado, nota, eventoId, id)
    return changes > 0
  }

  cerrar(): void {
    this.db.close()
  }
}
