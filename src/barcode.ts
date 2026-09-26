// Code 128 (subset B) encoder and a label atlas.
// Labels are real, scannable Code 128 symbols: 11-module characters, start B, modulo-103 check, 13-module stop.

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104
const STOP = 106

/** Returns alternating bar/space module widths, starting with a bar. */
export function code128B(text: string): number[] {
  const values: number[] = []
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    if (c < 32 || c > 126) throw new Error(`Code 128 B cannot encode ${JSON.stringify(ch)}`)
    values.push(c - 32)
  }
  let check = START_B
  values.forEach((v, i) => (check += v * (i + 1)))
  check %= 103
  const seq = [START_B, ...values, check, STOP]
  const widths: number[] = []
  for (const s of seq) for (const w of PATTERNS[s]) widths.push(Number(w))
  return widths
}

export function drawBarcode(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number) {
  const widths = code128B(text)
  const modules = widths.reduce((a, b) => a + b, 0)
  const quiet = 10
  const scale = w / (modules + quiet * 2)
  let cx = x + quiet * scale
  ctx.fillStyle = '#000'
  widths.forEach((mw, i) => {
    if (i % 2 === 0) ctx.fillRect(cx, y, mw * scale, h)
    cx += mw * scale
  })
}
