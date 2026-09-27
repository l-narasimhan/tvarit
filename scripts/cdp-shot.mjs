// Real-time headless check (workers, IndexedDB, reloads all run normally): open a URL, wait, print a DOM
// selector's text, save a screenshot.   node scripts/cdp-shot.mjs "<query>" <waitSeconds> "<selector>" <out.png>
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
const [query = '', wait = '15', sel = 'body', out = 'shots/cdp.png'] = process.argv.slice(2)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9333 + Math.floor(Math.random() * 500)
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1600,1000', `--user-data-dir=/tmp/tvarit-cdp-${port}`, 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page') } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type !== 'log') console.log('console.' + m.params.type, m.params.args.map(a => a.value ?? a.description).join(' '))
  if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text) })
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable')
await send('Page.navigate', { url: `http://localhost:5220/?${query}` })
await sleep(Number(wait) * 1000)
const v = await send('Runtime.evaluate', { expression: `(document.querySelector(${JSON.stringify(sel)})||{}).innerText`, returnByValue: true })
console.log(`${sel}:`, v.result?.result?.value)
const shot = await send('Page.captureScreenshot', { format: 'png' })
mkdirSync('shots', { recursive: true }); writeFileSync(out, Buffer.from(shot.result.data, 'base64')); console.log(out)
ws.close(); proc.kill()
