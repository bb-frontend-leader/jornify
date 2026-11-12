import ExcelJS from 'exceljs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { configPorDefecto } from '../src/main/configEsquema'
import { escribirExcel } from '../src/main/excel'
import type { TipoEvento } from '../src/main/estado'
import { aIsoConZona } from '../src/main/fechas'
import type { Evento } from '../src/main/historial'
import { construirReporte } from '../src/main/reporte'

const en = (dia: number, h: number, m = 0): Date => new Date(2026, 10, dia, h, m)

let contador = 0
const evento = (tipo: TipoEvento, cuando: Date, extra: Partial<Evento> = {}): Evento => ({
  id: ++contador,
  tipo,
  ocurridoEn: aIsoConZona(cuando),
  motivo: null,
  mensaje: `🌅 Buenos días, ${tipo}`,
  estadoEnvio: 'enviado',
  enviadoEn: aIsoConZona(cuando),
  intentos: 0,
  ...extra
})

/** exceljs devuelve como fecha (30/12/1899 + fracción) lo que Excel guarda como hora o duración; se vuelve a fracción de día. */
const fraccion = (valor: ExcelJS.CellValue): number =>
  valor instanceof Date ? (valor.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000 : Number(valor)

describe('escribirExcel', () => {
  let carpeta: string
  let libro: ExcelJS.Workbook

  beforeAll(async () => {
    carpeta = mkdtempSync(join(tmpdir(), 'jornify-xlsx-'))
    const eventos = [
      evento('inicio', en(9, 8)),
      evento('almuerzo', en(9, 12)),
      evento('regreso_almuerzo', en(9, 13)),
      evento('ausencia', en(9, 15), { motivo: 'Cita médica' }),
      evento('regreso', en(9, 15, 30)),
      evento('fin', en(9, 17, 30), { estadoEnvio: 'pendiente', enviadoEn: null, intentos: 1 }),
      evento('inicio', en(10, 8)),
      evento('fin', en(10, 18, 30))
    ]
    const reporte = construirReporte(eventos, { desde: new Date(2026, 10, 9), hasta: new Date(2026, 10, 11) }, en(12, 9), configPorDefecto())
    const ruta = join(carpeta, 'reporte.xlsx')
    await escribirExcel(reporte, ruta)
    libro = new ExcelJS.Workbook()
    await libro.xlsx.readFile(ruta)
  })

  afterAll(() => rmSync(carpeta, { recursive: true, force: true }))

  it('tiene las hojas Resumen y Eventos', () => {
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Resumen', 'Eventos'])
  })

  it('Resumen: encabezados y una fila por día', () => {
    const hoja = libro.getWorksheet('Resumen')!
    expect((hoja.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Fecha', 'Día', 'Entrada', 'Salida', 'Almuerzo', 'Ausencias', 'Trabajado', 'Meta del día', 'Diferencia (h)', 'Observación'
    ])
    const lunes = hoja.getRow(2)
    expect(lunes.getCell('B').value).toBe('Lunes')
    expect(lunes.getCell('A').value).toEqual(new Date(Date.UTC(2026, 10, 9, 0, 0, 0)))
    // Horas como fracción de día: 8:00 = 1/3, 17:30 = 17,5/24.
    expect(fraccion(lunes.getCell('C').value)).toBeCloseTo(8 / 24, 6)
    expect(fraccion(lunes.getCell('D').value)).toBeCloseTo(17.5 / 24, 6)
    expect(fraccion(lunes.getCell('E').value)).toBeCloseTo(1 / 24, 6) // almuerzo 1 h
    expect(fraccion(lunes.getCell('F').value)).toBeCloseTo(0.5 / 24, 6) // ausencia 30 min
    expect(fraccion(lunes.getCell('G').value)).toBeCloseTo(8 / 24, 6) // trabajado 8 h
    expect(fraccion(lunes.getCell('H').value)).toBeCloseTo(9 / 24, 6) // meta del lunes
    expect(lunes.getCell('I').value).toBe(-1)
    expect(lunes.getCell('C').numFmt).toBe('hh:mm')
    expect(lunes.getCell('G').numFmt).toBe('[h]:mm')
    expect(lunes.getCell('I').numFmt).toContain('[Red]')
  })

  it('Resumen: el martes sin almuerzo registrado y con la meta completa', () => {
    const martes = libro.getWorksheet('Resumen')!.getRow(3)
    expect(martes.getCell('B').value).toBe('Martes')
    expect(fraccion(martes.getCell('G').value)).toBeCloseTo(10.5 / 24, 6)
    expect(martes.getCell('I').value).toBe(0.5)
  })

  it('Resumen: fila de totales y nota de la meta', () => {
    const hoja = libro.getWorksheet('Resumen')!
    const total = hoja.getRow(4)
    expect(total.getCell('A').value).toBe('Total')
    expect(total.getCell('B').value).toBe('2 días')
    expect(fraccion(total.getCell('G').value)).toBeCloseTo(18.5 / 24, 6)
    expect(total.getCell('I').value).toBe(-0.5)
    expect(total.font?.bold).toBe(true)
    expect(String(hoja.getRow(5).getCell('A').value)).toContain('10 h netas, los lunes 9 h')
  })

  it('Eventos: una fila por acción con motivo, mensaje y estado de envío', () => {
    const hoja = libro.getWorksheet('Eventos')!
    expect(hoja.rowCount).toBe(1 + 8)
    const ausencia = hoja.getRow(5)
    expect(ausencia.getCell('C').value).toBe('Ausentarme')
    expect(ausencia.getCell('D').value).toBe('Cita médica')
    expect(ausencia.getCell('E').value).toBe('🌅 Buenos días, ausencia')
    expect(ausencia.getCell('F').value).toBe('Enviado')
    const fin = hoja.getRow(7)
    expect(fin.getCell('F').value).toBe('Pendiente')
    expect(fin.getCell('G').value).toBeNull()
    expect(fin.getCell('H').value).toBe(1)
    expect(hoja.getRow(2).getCell('H').value).toBe(0)
  })

  it('las primeras filas quedan fijas y con filtro', () => {
    const resumen = libro.getWorksheet('Resumen')!
    expect(resumen.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(libro.getWorksheet('Eventos')!.autoFilter).toBeTruthy()
  })
})
