import { DestroyRef, inject } from '@angular/core';

/** Calls `tick` now and every `ms` until the component is destroyed. Polling is the live view until server-sent events arrive. */
export function poll(tick: () => void, ms = 5000): void {
  tick();
  const handle = setInterval(tick, ms);
  inject(DestroyRef).onDestroy(() => clearInterval(handle));
}
