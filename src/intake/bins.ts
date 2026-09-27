// The bin master: one row per bin. Read from CSV or Excel; column names are matched loosely so a WMS export
// works as-is. Only the bin code is required — the rack, level and position are read from it when their
// columns are missing (default format RACK-LEVELPOS, e.g. A5-06-C3 → rack A5-06, level C, position 3).

import * as XLSX from 'xlsx'

export type BinZone = 'ambient' | 'chiller' | 'hv'

export interface BinRow {
  bin: string
  rack: string
  level: string
  pos: number
  zone?: BinZone
  sku?: string
  product?: string
  qty?: number
  cap?: number
}

const COLS: Record<keyof BinRow, string[]> = {
  bin: ['bin_code', 'bin', 'bincode', 'bin code', 'location', 'location_code', 'loc'],
  rack: ['rack', 'rack_code', 'module', 'bay'],
  level: ['level', 'shelf', 'tier'],
  pos: ['position', 'pos', 'slot', 'column'],
  zone: ['zone', 'temperature', 'temp_zone', 'storage'],
  sku: ['sku', 'sku_code', 'item_code', 'article', 'ean'],
  product: ['product', 'product_name', 'name', 'item_name', 'description'],
  qty: ['qty', 'quantity', 'stock', 'on_hand', 'soh'],
  cap: ['capacity', 'cap', 'max', 'max_qty'],
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_')

/** Default code format: RACK-LEVELPOS, level a letter, position a number. */
export function splitBinCode(code: string): { rack: string; level: string; pos: number } | null {
  const m = code.trim().toUpperCase().match(/^(.+)-([A-H])(\d{1,2})$/)
  return m ? { rack: m[1], level: m[2], pos: Number(m[3]) } : null
}

function zoneOf(v: unknown): BinZone | undefined {
  const s = String(v ?? '').toLowerCase()
  if (!s) return undefined
  if (/chill|cold|fridge|dairy|2.?-.?8/.test(s)) return 'chiller'
  if (/hv|high.?value|cage|secure/.test(s)) return 'hv'
  return 'ambient'
}

export interface BinParse { bins: BinRow[]; issues: string[]; columns: string[] }

export function parseBinRows(rows: Record<string, unknown>[]): BinParse {
  const issues: string[] = []
  if (!rows.length) return { bins: [], issues: ['The bin file has no rows'], columns: [] }
  const headers = Object.keys(rows[0])
  const find = (k: keyof BinRow) => headers.find(h => COLS[k].includes(norm(h)))
  const col = Object.fromEntries((Object.keys(COLS) as (keyof BinRow)[]).map(k => [k, find(k)])) as Record<keyof BinRow, string | undefined>
  if (!col.bin) return { bins: [], issues: [`No bin-code column found (looked for ${COLS.bin.join(', ')}); columns are: ${headers.join(', ')}`], columns: headers }

  const bins: BinRow[] = []
  const seen = new Set<string>()
  let unreadable = 0
  for (const r of rows) {
    const bin = String(r[col.bin] ?? '').trim().toUpperCase()
    if (!bin) continue
    if (seen.has(bin)) { issues.push(`Duplicate bin ${bin} — kept the first`); continue }
    seen.add(bin)
    const split = splitBinCode(bin)
    const rack = col.rack ? String(r[col.rack] ?? '').trim().toUpperCase() : split?.rack
    const level = col.level ? String(r[col.level] ?? '').trim().toUpperCase() : split?.level
    const pos = col.pos ? Number(r[col.pos]) : split?.pos
    if (!rack || !level || !pos) { unreadable++; continue }
    const num = (k: 'qty' | 'cap') => { const v = col[k] ? Number(r[col[k]!]) : NaN; return Number.isFinite(v) ? v : undefined }
    bins.push({
      bin, rack, level, pos,
      zone: col.zone ? zoneOf(r[col.zone]) : undefined,
      sku: col.sku ? String(r[col.sku] ?? '').trim() || undefined : undefined,
      product: col.product ? String(r[col.product] ?? '').trim() || undefined : undefined,
      qty: num('qty'), cap: num('cap'),
    })
  }
  if (unreadable) issues.push(`${unreadable} bin code${unreadable > 1 ? 's' : ''} not in the RACK-LEVELPOS format (e.g. A5-06-C3) and no rack/level/position columns — skipped`)
  if (issues.length > 12) issues.splice(12, issues.length - 12, `… and ${issues.length - 12} more`)
  return { bins, issues, columns: headers }
}

/** CSV or Excel → rows keyed by header. */
export async function readTable(file: File | ArrayBuffer): Promise<Record<string, unknown>[]> {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
}
