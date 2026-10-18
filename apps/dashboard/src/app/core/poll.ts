import { DestroyRef, inject } from '@angular/core';

/**
 * Calls `tick` now and every `ms` until the component is destroyed. Polling is the live view until
 * server-sent events arrive. Pass the DestroyRef when calling outside an injection context (ngOnInit).
 */
export function poll(tick: () => void, ms = 5000, destroyRef: DestroyRef = inject(DestroyRef)): void {
  tick();
  const handle = setInterval(tick, ms);
  destroyRef.onDestroy(() => clearInterval(handle));
}
