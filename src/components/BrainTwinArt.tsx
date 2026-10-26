/**
 * The Brain Twin, drawn in code: the left hemisphere is biological (folds), the right is its digital twin
 * (circuit traces with travelling signals). When skills are passed, each one becomes a node on the circuit
 * whose glow grows with the current estimate, so the artwork is also a tiny live chart.
 * Deterministic (seeded) so server and client render the same SVG.
 */

type Skill = { id: string; name: string; mean: number; color: string };

const W = 440;
const MID = W / 2;
const LEFT = "M218,42 C170,34 112,44 82,86 C52,126 46,178 58,224 C70,270 102,300 140,312 C170,321 200,318 218,312 Z";
const RIGHT = "M222,42 C270,34 328,44 358,86 C388,126 394,178 382,224 C370,270 338,300 300,312 C270,321 240,318 222,312 Z";

/** Skill node positions on the circuit hemisphere (fixed order = categorical slot order). */
const NODES: Array<[number, number]> = [[268, 92], [326, 128], [262, 170], [348, 196], [292, 238], [252, 282]];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Smooth path through points (quadratic segments via midpoints). */
function smooth(pts: Array<[number, number]>) {
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q${r1(x)},${r1(y)} ${r1((x + nx) / 2)},${r1((y + ny) / 2)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${r1(last[0])},${r1(last[1])}`;
}

/**
 * Gyri: serpentine ridges laid on a jittered grid so they pack the hemisphere. Each is drawn as a tube
 * (dark outline, light core, highlight), and the overlaps read as cortical folds.
 */
function folds(seed: number) {
  const rand = rng(seed);
  const out: string[] = [];
  for (let gy = 34; gy < 330; gy += 18) {
    for (let gx = 44; gx < 226; gx += 18) {
      let x = gx + rand() * 14;
      let y = gy + rand() * 14;
      let a = rand() * Math.PI * 2;
      let turn = (rand() < 0.5 ? -1 : 1) * 0.5;
      const pts: Array<[number, number]> = [[x, y]];
      const steps = 7 + Math.floor(rand() * 6);
      for (let s = 0; s < steps; s++) {
        if (rand() < 0.3) turn = -turn;
        a += turn + (rand() - 0.5) * 0.4;
        x += Math.cos(a) * 5;
        y += Math.sin(a) * 5;
        pts.push([x, y]);
      }
      out.push(smooth(pts));
    }
  }
  return out;
}

/** Circuit traces: grid-snapped runs with 45° bends, ending in a pad. */
function traces(seed: number) {
  const rand = rng(seed);
  const snap = (v: number) => Math.round(v / 6) * 6;
  const out: Array<{ d: string; end: [number, number] }> = [];
  for (let i = 0; i < 52; i++) {
    let x = snap(MID + 6 + rand() * 160);
    let y = snap(48 + rand() * 262);
    let d = `M${x},${y}`;
    const segs = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < segs; s++) {
      const len = snap(12 + rand() * 40);
      const dir = Math.floor(rand() * 6);
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 0], [1, -1]][dir];
      x += dx * len;
      y += dy * len;
      d += ` L${x},${y}`;
    }
    out.push({ d, end: [x, y] });
  }
  return out;
}

const FOLDS = folds(7);
const TRACES = traces(11);
const CHIPS = (() => {
  const rand = rng(23);
  return Array.from({ length: 11 }, () => ({ x: Math.round(MID + 14 + rand() * 140), y: Math.round(60 + rand() * 230), w: 10 + Math.round(rand() * 16), h: 8 + Math.round(rand() * 12) }));
})();
const SPARKS = (() => {
  const rand = rng(31);
  return Array.from({ length: 34 }, (_, i) => ({ x: Math.round(MID + 6 + rand() * 160), y: Math.round(50 + rand() * 260), warm: i % 9 === 0 }));
})();

export function BrainTwinArt({ skills, decor = false, className = "", title = "Brain Twin: half biological brain, half circuit" }: { skills?: Skill[]; decor?: boolean; className?: string; title?: string }) {
  const nodes = (skills ?? []).slice(0, NODES.length);
  return (
    <svg viewBox={`0 0 ${W} 380`} className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <radialGradient id="bt-bio" gradientUnits="userSpaceOnUse" cx="140" cy="110" r="240">
          <stop offset="0" stopColor="#f3f8fd" />
          <stop offset="0.55" stopColor="#c7d7e8" />
          <stop offset="1" stopColor="#7d97b4" />
        </radialGradient>
        <radialGradient id="bt-shade" cx="35%" cy="30%" r="80%">
          <stop offset="0.55" stopColor="#0b2238" stopOpacity="0" />
          <stop offset="1" stopColor="#0b2238" stopOpacity="0.45" />
        </radialGradient>
        <radialGradient id="bt-chip" cx="62%" cy="35%" r="80%">
          <stop offset="0" stopColor="#0f4fa8" />
          <stop offset="0.6" stopColor="#0a2d66" />
          <stop offset="1" stopColor="#041330" />
        </radialGradient>
        <radialGradient id="bt-aura" cx="50%" cy="48%" r="50%">
          <stop offset="0" stopColor="#00b5e2" stopOpacity="0.28" />
          <stop offset="1" stopColor="#00b5e2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bt-arc" x1="0" x2="1">
          <stop offset="0" stopColor="#00b5e2" stopOpacity="0.1" />
          <stop offset="0.35" stopColor="#62e4ff" />
          <stop offset="0.7" stopColor="#ffad6d" />
          <stop offset="1" stopColor="#e87722" stopOpacity="0.1" />
        </linearGradient>
        <clipPath id="bt-left"><path d={LEFT} /></clipPath>
        <clipPath id="bt-right"><path d={RIGHT} /></clipPath>
        <filter id="bt-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {decor && (
        <g aria-hidden>
          <path d="M12,330 A208,290 0 0 1 428,330" fill="none" stroke="url(#bt-arc)" strokeWidth="2" />
          <circle cx={MID} cy="190" r="190" fill="url(#bt-aura)" />
        </g>
      )}

      {/* Cerebellum and stem */}
      <ellipse cx="182" cy="318" rx="40" ry="24" fill="url(#bt-bio)" />
      <ellipse cx="258" cy="318" rx="40" ry="24" fill="url(#bt-chip)" />
      <path d="M210,320 L208,362 Q220,370 232,362 L230,320 Z" fill="#5d7c9c" />

      {/* Biological hemisphere */}
      <path d={LEFT} fill="#6e8aa8" />
      <g clipPath="url(#bt-left)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {FOLDS.map((d, i) => (
          <g key={i}>
            <path d={d} stroke="#4f6c8b" strokeWidth="9" />
            <path d={d} stroke="url(#bt-bio)" strokeWidth="6.4" />
            <path d={d} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.3" transform="translate(-1.1 -1.3)" />
          </g>
        ))}
        <path d={LEFT} fill="url(#bt-shade)" />
      </g>

      {/* Digital hemisphere */}
      <path d={RIGHT} fill="url(#bt-chip)" />
      <g clipPath="url(#bt-right)">
        {CHIPS.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx="1.5" fill="#0c3a80" stroke="#2f7fe0" strokeOpacity="0.6" />)}
        <g fill="none" stroke="#3b8cf0" strokeOpacity="0.55" strokeWidth="1.3" strokeLinejoin="round">
          {TRACES.map((t, i) => <path key={i} d={t.d} />)}
        </g>
        {TRACES.map((t, i) => <circle key={i} cx={t.end[0]} cy={t.end[1]} r="1.8" fill="#62e4ff" fillOpacity="0.8" />)}
        <g fill="none" stroke="#9ff0ff" strokeWidth="2" strokeLinecap="round" filter="url(#bt-glow)">
          {TRACES.filter((_, i) => i % 3 === 0).map((t, i) => (
            <path key={i} d={t.d} className="bt-signal" style={{ animationDelay: `${(i * 0.37) % 4.5}s` }} />
          ))}
        </g>
        {SPARKS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.warm ? 1.8 : 1.2} fill={s.warm ? "#e87722" : "#62e4ff"} />)}
      </g>

      {/* Fissure: where biology meets its twin */}
      <path d={`M${MID},40 L${MID},314`} stroke="#02101f" strokeWidth="4" />
      <path d={`M${MID + 2},44 L${MID + 2},312`} stroke="#00b5e2" strokeOpacity="0.5" strokeWidth="1" />

      {/* Live skill nodes */}
      {nodes.map((s, i) => {
        const [x, y] = NODES[i];
        const r = 4 + 10 * Math.max(0, Math.min(1, s.mean));
        return (
          <g key={s.id}>
            <title>{`${s.name}: about ${Math.round(s.mean * 100)}%`}</title>
            <path d={`M${MID + 2},${y} L${x - r},${y}`} stroke={s.color} strokeOpacity="0.6" strokeWidth="1.2" />
            <circle cx={x} cy={y} r={r + 6} fill={s.color} className="bt-halo" style={{ animationDelay: `${i * 0.4}s` }} />
            <circle cx={x} cy={y} r={r} fill={s.color} stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" />
          </g>
        );
      })}
    </svg>
  );
}

/** Heartbeat line, as a light decorative flourish. */
export function EkgLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 60" className={className} aria-hidden preserveAspectRatio="none">
      <path className="ekg-line" d="M0,34 L120,34 L134,34 L142,14 L152,52 L162,6 L172,44 L180,34 L260,34 L268,26 L276,40 L284,34 L400,34"
        fill="none" stroke="var(--brand)" strokeOpacity="0.55" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
