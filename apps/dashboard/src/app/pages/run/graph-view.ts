import { Component, computed, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import type { RunState } from '@zenthos/domain';
import type { Run } from '../../core/runs';
import { MACHINE_EDGES, STATE_META, travelledEdges } from '../../shared/run-state';

/** Where each state sits on the canvas. Layout only: which states and edges exist comes from the domain. */
const POSITIONS: Record<RunState, [number, number]> = {
  intake: [70, 150], spec_drafted: [210, 150], spec_approved: [350, 150], implemented: [490, 150], gates_passed: [630, 150],
  mr_opened: [770, 150], reviewed: [910, 150], verified: [1050, 150], done: [1190, 150],
  needs_human: [630, 290], failed: [910, 290],
};
const W = 124, H = 40;

@Component({
  selector: 'zen-graph-view',
  imports: [TranslateModule],
  styles: `
    svg { width: 100%; height: auto; display: block; font-family: var(--zen-font); }
    .node rect { fill: var(--zen-surface); stroke: var(--zen-line); stroke-width: 1.5; rx: 6; }
    .node text { fill: var(--zen-fg); font-size: 13px; text-anchor: middle; dominant-baseline: middle; }
    .node.visited rect { stroke: var(--zen-accent); }
    .node.current rect { fill: var(--zen-accent-soft); stroke: var(--zen-accent); stroke-width: 2.5; }
    .node.off rect { stroke-dasharray: 4 3; }
    .node.selected rect { stroke-width: 3; }
    .node { cursor: pointer; }
    .edge { fill: none; stroke: var(--zen-line); stroke-width: 1.5; marker-end: url(#arrow); }
    .edge.travelled { stroke: var(--zen-accent); stroke-width: 2.5; marker-end: url(#arrow-on); }
    .edge-label { font-family: var(--zen-mono); font-size: 11px; fill: var(--zen-muted); text-anchor: middle; }
    .edge-label.on { fill: var(--zen-accent); }
  `,
  template: `
    <svg viewBox="0 0 1260 340" role="img" [attr.aria-label]="'run.graphAria' | translate">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--zen-line)" /></marker>
        <marker id="arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--zen-accent)" /></marker>
      </defs>
      @for (edge of edges(); track edge.key) {
        <path class="edge" [class.travelled]="edge.travelled" [attr.d]="edge.d" />
        @if (edge.travelled || edge.loop) {<text class="edge-label" [class.on]="edge.travelled" [attr.x]="edge.lx" [attr.y]="edge.ly">{{ edge.event }}</text>}
      }
      @for (node of nodes(); track node.state) {
        <g class="node" [class]="'node ' + node.classes" [attr.transform]="'translate(' + (node.x - w / 2) + ',' + (node.y - h / 2) + ')'" tabindex="0" role="button" (click)="pick.emit(node.state)" (keydown.enter)="pick.emit(node.state)">
          <rect [attr.width]="w" [attr.height]="h" />
          <text [attr.x]="w / 2" [attr.y]="h / 2">{{ 'stateShort.' + node.state | translate }}</text>
        </g>
      }
    </svg>
  `,
})
export class GraphView {
  readonly run = input.required<Run>();
  readonly selected = input<RunState | undefined>();
  readonly pick = output<RunState>();
  readonly w = W;
  readonly h = H;
  readonly meta = STATE_META;

  readonly nodes = computed(() => {
    const run = this.run();
    const visited = new Set<RunState>(['intake', ...run.history.map((e) => e.to)]);
    return (Object.keys(POSITIONS) as RunState[]).map((state) => ({
      state,
      x: POSITIONS[state][0],
      y: POSITIONS[state][1],
      classes: [visited.has(state) ? 'visited' : '', state === run.state ? 'current' : '', state === 'needs_human' || state === 'failed' ? 'off' : '', this.selected() === state ? 'selected' : ''].join(' '),
    }));
  });

  /** Straight edges forward, arcs for the loops back and for the drops to the off-ramps. */
  readonly edges = computed(() => {
    const travelled = travelledEdges(this.run());
    return MACHINE_EDGES.map(({ from, to, event }) => {
      const [x1, y1] = POSITIONS[from];
      const [x2, y2] = POSITIONS[to];
      const loop = x2 < x1 && y1 === y2;
      let d: string, lx: number, ly: number;
      if (y1 === y2 && !loop) {
        d = `M${x1 + W / 2} ${y1} L${x2 - W / 2} ${y2}`;
        lx = (x1 + x2) / 2; ly = y1 - 8;
      } else if (loop) {
        const lift = 70;
        d = `M${x1} ${y1 - H / 2} C${x1} ${y1 - lift}, ${x2} ${y2 - lift}, ${x2} ${y2 - H / 2}`;
        lx = (x1 + x2) / 2; ly = y1 - lift * 0.75 - 2;
      } else {
        d = `M${x1} ${y1 + H / 2} C${x1} ${y1 + 60}, ${x2} ${y2 - 60}, ${x2} ${y2 - H / 2}`;
        lx = (x1 + x2) / 2 + 6; ly = (y1 + y2) / 2;
      }
      return { key: `${from}->${to}`, event, d, lx, ly, loop, travelled: travelled.has(`${from}->${to}`) };
    });
  });
}
