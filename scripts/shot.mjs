// Headless-Chrome screenshots of the running twin: node scripts/shot.mjs [view|find=CODE ...]
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const base = process.env.URL ?? 'http://localhost:5220/'
const args = process.argv.slice(2).length ? process.argv.slice(2) : ['overview']
mkdirSync('shots', { recursive: true })
for (const a of args) {
  const q = a.includes('=') ? a : `view=${a}`
  const out = `shots/${a.replace(/[^\w-]/g, '_')}.png`
  execFileSync(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
    '--window-size=1600,1000', '--virtual-time-budget=15000', `--screenshot=${out}`, `${base}?${q}`], { stdio: 'ignore' })
  console.log(out)
}
