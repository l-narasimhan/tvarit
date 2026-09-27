// Saved darkstores. Kept in this browser (IndexedDB): a store's layout and bin master never leave the machine.
// Two stores are built in: the generic darkstore, and Store 01 (the sheet transcribed at the start).

import { GENERIC } from '../layout/generic'
import type { SheetLayout } from '../layout/schema'
import { STORE01 } from '../layout/store01'
import type { BinRow } from './bins'

export interface StoreRecord {
  name: string
  created: string
  layout: SheetLayout
  bins: BinRow[] | null
  files?: { layout?: string; bins?: string }
  builtin?: boolean
}

export const BUILTIN: StoreRecord[] = [
  { name: 'generic_darkstore', created: '', layout: GENERIC, bins: null, builtin: true },
  { name: 'store01', created: '', layout: STORE01, bins: null, builtin: true },
]
export const BUILTIN_LABEL: Record<string, string> = { generic_darkstore: 'Generic darkstore', store01: 'Store 01 (from the sheet)' }

const DB = 'tvarit', OS = 'stores'
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(OS, { keyPath: 'name' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => {
    const q = f(d.transaction(OS, mode).objectStore(OS))
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  })
}

export async function listSaved(): Promise<StoreRecord[]> {
  try { return (await tx('readonly', s => s.getAll())) as StoreRecord[] } catch { return [] }
}
export async function getStore(name: string): Promise<StoreRecord | null> {
  const b = BUILTIN.find(s => s.name === name)
  if (b) return b
  try { return ((await tx('readonly', s => s.get(name))) as StoreRecord) ?? null } catch { return null }
}
export async function saveStore(r: StoreRecord) { await tx('readwrite', s => s.put(r)) }
export async function deleteStore(name: string) { await tx('readwrite', s => s.delete(name)) }

const LAST = 'tvarit.store'
export function lastStore(): string {
  try { return localStorage.getItem(LAST) ?? 'generic_darkstore' } catch { return 'generic_darkstore' }
}
export function rememberStore(name: string) { try { localStorage.setItem(LAST, name) } catch { /* private window */ } }
