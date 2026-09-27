// Runs scenario days off the main thread and reports each as it finishes.
import { runDay } from './run'

self.onmessage = (e: MessageEvent) => {
  const { id, layout, bins, cfg, seeds } = e.data
  for (const seed of seeds as number[]) {
    const r = runDay(layout, bins, cfg, seed)
    ;(self as unknown as Worker).postMessage({ id, result: r })
  }
  ;(self as unknown as Worker).postMessage({ id, done: true })
}
