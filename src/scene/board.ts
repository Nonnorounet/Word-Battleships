import * as THREE from 'three';
import type { GridWord, Ship } from '../state/types';
import { shipCells } from '../state/rules';

export type Theme = 'dark' | 'light';
const LET = 'ABCDEFGHIJ';
const cx = (c: number) => c - 4.5;
const cz = (r: number) => r - 4.5;

const PAL = {
  dark: {
    water: 0x0b2e26, emissive: 0x000000, grid: 0x2fe39a, label: '#b8f2d8', sub: '#5fbf96',
    disc: 0x04140f, discO: 0.55, ring: 0x2fe39a, rgb: '47,227,154', line: 'rgba(120,255,200,0.9)', sweepA: 0.42,
    sel: 0xffd27a, buoy: 0x2a2a22, tile: '#ffb020', ink: '#04100c', glow: 0xffb020, peg: 0xdff7ec,
    sunkHull: 0x3a2a28, sunkTile: '#ff6b5a', sunkInk: '#04100c', ownHull: 0x51605b, ownTile: '#eaf6ef', ownInk: '#04100c',
    hitTile: '#ff8466', ghost: 0x2fe39a, bad: 0xff6b5a, light: 0.75,
    hlBg: 'rgba(4,16,12,0.9)', hlStroke: '#ffd27a', hlText: '#ffffff', bg: 0x04100c,
  },
  light: {
    water: 0xf8f2e4, emissive: 0x6e6a5e, grid: 0x1d5c4a, label: '#183f33', sub: '#3f5f50',
    disc: 0xfbf8ee, discO: 0.45, ring: 0x1d5c4a, rgb: '29,92,74', line: 'rgba(29,92,74,0.9)', sweepA: 0.3,
    sel: 0x9a2a1d, buoy: 0xe9e1c8, tile: '#c2410c', ink: '#ffffff', glow: 0xc2410c, peg: 0x1d5c4a,
    sunkHull: 0x5c4a44, sunkTile: '#9a2a1d', sunkInk: '#ffffff', ownHull: 0x8b9a93, ownTile: '#fffdf6', ownInk: '#04100c',
    hitTile: '#c2410c', ghost: 0x1d5c4a, bad: 0x9a2a1d, light: 1.05,
    hlBg: 'rgba(255,253,246,0.95)', hlStroke: '#9a2a1d', hlText: '#0b2a21', bg: 0xf3efe2,
  },
};

export interface EnemyData {
  kind: 'enemy';
  shots: Record<string, 'miss' | 'hit'>;
  letters: Record<string, string>;
  sunk: { word: string; cells: [number, number][] }[];
}
export interface OwnData {
  kind: 'own';
  fleet: Ship[];
  shots: Record<string, 'miss' | 'hit'>;
  sunk: Record<number, string>;
}
export interface SetupData {
  kind: 'setup';
  fleet: Ship[];               // placed ships
  ghost: { word: string; r: number; c: number; horiz: boolean; valid: boolean } | null;
}
export type BoardData = EnemyData | OwnData | SetupData;

export interface BoardInput {
  rows: GridWord[];
  cols: GridWord[];
  data: BoardData;
  selected: [number, number] | null;
  hover: [number, number] | null;
  hlRow: number | null;        // row label lit
  hlCol: number | null;        // column label lit
  showFrench: boolean;
}

type Hit = { type: 'cell'; r: number; c: number } | { type: 'row'; i: number } | { type: 'col'; i: number };

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export class BoardScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private theme: Theme = 'dark';
  private statics = new THREE.Group();
  private dyn = new THREE.Group();
  private labels = new THREE.Group();
  private sweep: THREE.Mesh | null = null;
  private texCache = new Map<string, THREE.CanvasTexture>();
  private input: BoardInput | null = null;
  private labelKey = '';
  private dynKey = '';
  // camera orbit
  private az = 0; private polar = 0.73; private dist = 24.5; private target = new THREE.Vector3(-1.1, 0, -0.5);
  private azT = 0; private polarT = 0.73; private distT = 24.5;
  private raf = 0;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  onHover: (h: Hit | null) => void = () => {};
  onTap: (h: Hit) => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const isAndroid = /Android/i.test(navigator.userAgent);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isAndroid ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.statics, this.dyn, this.labels);
    this.buildStatics();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.bindPointer();
    const loop = (t: number) => { this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); this.host.innerHTML = ''; }

  setTheme(th: Theme) {
    if (th === this.theme) return;
    this.theme = th; this.texCache.clear(); this.buildStatics(); this.labelKey = ''; this.dynKey = '';
    if (this.input) this.set(this.input);
  }

  zoom(dir: 1 | -1) { this.distT = Math.max(13, Math.min(34, this.distT * (dir > 0 ? 0.85 : 1.18))); }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.cam.aspect = w / h;
    // narrower stages need the camera further back to fit the labels
    const a = w / h;
    // narrow stages: look more from above and step back so the word labels fit
    const fit = a < 1.15 ? 1.12 / Math.max(0.5, a) : 1;
    this.distT = this.dist = 24.5 * Math.min(fit, 2.2);
    this.polarT = this.polar = a < 1.15 ? 0.5 : 0.73;
    this.target.set(a < 1.15 ? -1.6 : -1.1, 0, a < 1.15 ? -1.2 : -0.5);
    this.cam.updateProjectionMatrix();
  }

  // ---------- static layers: water, radar, grid ----------
  private buildStatics() {
    const P = PAL[this.theme];
    this.statics.clear();
    this.scene.background = new THREE.Color(P.bg);
    this.scene.fog = new THREE.Fog(P.bg, 40, 75);
    this.statics.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4 * P.light));
    const d = new THREE.DirectionalLight(0xffffff, 1.6 * P.light);
    d.position.set(-6, 12, 8); d.castShadow = true; d.shadow.mapSize.set(1024, 1024);
    Object.assign(d.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
    this.statics.add(d);

    const geo = new THREE.PlaneGeometry(70, 70, 200, 200);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, 0.05 * Math.sin(x * 1.7 + y * 0.6) + 0.035 * Math.cos(y * 2.3 - x * 0.8)); }
    geo.computeVertexNormals();
    const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: P.water, emissive: P.emissive, roughness: 0.22, metalness: 0.15 }));
    water.rotation.x = -Math.PI / 2; water.receiveShadow = true; this.statics.add(water);

    // radar decal under the grid
    const flat = (m: THREE.Mesh, o = 1) => {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.transparent = true; mat.opacity = o; mat.depthWrite = false;
      m.renderOrder = -1; m.rotation.x = -Math.PI / 2; m.position.y = 0.09; this.statics.add(m); return m;
    };
    flat(new THREE.Mesh(new THREE.CircleGeometry(7.4, 128), new THREE.MeshBasicMaterial({ color: P.disc })), P.discO);
    for (const rr of [1.8, 3.6, 5.4, 7.2]) flat(new THREE.Mesh(new THREE.RingGeometry(rr - 0.03, rr + 0.03, 160), new THREE.MeshBasicMaterial({ color: P.ring })), 0.32);
    flat(new THREE.Mesh(new THREE.RingGeometry(7.32, 7.42, 160), new THREE.MeshBasicMaterial({ color: P.ring })), 0.6);
    const tc = document.createElement('canvas'); tc.width = tc.height = 1024; const tg = tc.getContext('2d')!;
    tg.strokeStyle = `rgba(${P.rgb},0.7)`;
    for (let k = 0; k < 72; k++) {
      const an = (k / 72) * Math.PI * 2, L = k % 6 === 0 ? 26 : 12; tg.lineWidth = k % 6 === 0 ? 4 : 2;
      tg.beginPath(); tg.moveTo(512 + Math.cos(an) * (500 - L), 512 + Math.sin(an) * (500 - L)); tg.lineTo(512 + Math.cos(an) * 500, 512 + Math.sin(an) * 500); tg.stroke();
    }
    const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace;
    flat(new THREE.Mesh(new THREE.CircleGeometry(7.3, 128), new THREE.MeshBasicMaterial({ map: tt })));
    const sc = document.createElement('canvas'); sc.width = sc.height = 1024; const g = sc.getContext('2d')!;
    const grd = g.createConicGradient(-Math.PI / 2, 512, 512);
    grd.addColorStop(0, `rgba(${P.rgb},${P.sweepA})`); grd.addColorStop(0.14, `rgba(${P.rgb},0)`); grd.addColorStop(1, `rgba(${P.rgb},0)`);
    g.fillStyle = grd; g.beginPath(); g.arc(512, 512, 512, 0, Math.PI * 2); g.fill();
    g.strokeStyle = P.line; g.lineWidth = 5; g.beginPath(); g.moveTo(512, 512); g.lineTo(512, 0); g.stroke();
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    this.sweep = flat(new THREE.Mesh(new THREE.CircleGeometry(7.3, 128), new THREE.MeshBasicMaterial({ map: st })));
    this.sweep.rotation.z = -0.9;

    const pts: number[] = [];
    for (let i = 0; i <= 10; i++) pts.push(-5, 0.1, i - 5, 5, 0.1, i - 5, i - 5, 0.1, -5, i - 5, 0.1, 5);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.statics.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: P.grid, transparent: true, opacity: 0.5 })));
  }

  // ---------- textures ----------
  private tex(id: string, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
    let t = this.texCache.get(id);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    this.texCache.set(id, t);
    return t;
  }

  private tileTex(ch: string, bg: string, ink: string) {
    return this.tex(`tile|${ch}|${bg}|${ink}`, (g, w, h) => {
      g.fillStyle = bg; roundRect(g, 8, 8, w - 16, h - 16, 40); g.fill();
      g.fillStyle = ink; g.font = '800 160px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, w / 2, h / 2 + 8);
    }, 256, 256);
  }

  private labelTex(text: string, sub: string, align: 'left' | 'right' | 'center', hl: boolean, color: string, big = false) {
    const P = PAL[this.theme];
    return this.tex(`lab|${text}|${sub}|${align}|${hl}|${color}|${big}`, (g, w, h) => {
      const main = `${hl ? 700 : 600} ${big ? 70 : 56}px Inter, "Space Grotesk", Arial`;
      g.font = main;
      const tw = Math.max(g.measureText(text).width, sub ? (g.font = '500 38px Inter, Arial', g.measureText(sub).width) : 0) + 44;
      const x0 = align === 'center' ? (w - tw) / 2 : align === 'right' ? w - tw - 4 : 4;
      const textX = align === 'center' ? w / 2 : align === 'right' ? w - 26 : 26;
      if (hl) {
        g.fillStyle = P.hlBg; roundRect(g, Math.max(2, x0), 8, Math.min(tw, w - 4), h - 16, 22); g.fill();
        g.strokeStyle = P.hlStroke; g.lineWidth = 4; g.stroke();
      }
      g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = hl ? P.hlText : color;
      g.font = main; g.fillText(text, textX, sub ? h * 0.38 : h / 2 + 4);
      if (sub) { g.font = '500 38px Inter, Arial'; g.fillStyle = hl ? P.hlText : P.sub; g.fillText(sub, textX, h * 0.74); }
    }, align === 'center' ? 128 : 640, sub ? 176 : 128);
  }

  private flatPlane(tex: THREE.Texture, w: number, h: number, x: number, z: number, y: number, rotZ = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rotZ; m.position.set(x, y, z); return m;
  }

  // ---------- dynamic content ----------
  set(input: BoardInput) {
    this.input = input;
    const P = PAL[this.theme];
    const lk = JSON.stringify([input.rows, input.cols, input.hlRow, input.hlCol, input.showFrench, this.theme]);
    if (lk !== this.labelKey) {
      this.labelKey = lk;
      this.labels.clear();
      for (let r = 0; r < 10; r++) {
        const hl = r === input.hlRow, w = input.rows[r];
        this.labels.add(this.flatPlane(this.labelTex(w?.word ?? '', input.showFrench ? w?.fr ?? '' : '', 'right', hl, P.label), 2.5, input.showFrench ? 0.69 : 0.5, -6.85, cz(r), 0.11));
        this.labels.add(this.flatPlane(this.labelTex(String(r + 1), '', 'center', false, hl ? P.hlStroke : P.sub, true), 0.42, 0.42, -5.23, cz(r), 0.11));
      }
      for (let c = 0; c < 10; c++) {
        const hl = c === input.hlCol, w = input.cols[c];
        this.labels.add(this.flatPlane(this.labelTex(w?.word ?? '', input.showFrench ? w?.fr ?? '' : '', 'left', hl, P.label), 2.5, input.showFrench ? 0.69 : 0.5, cx(c), -6.85, 0.11, Math.PI / 2));
        this.labels.add(this.flatPlane(this.labelTex(LET[c], '', 'center', false, hl ? P.hlStroke : P.sub, true), 0.42, 0.42, cx(c), -5.25, 0.11));
      }
    }
    const dk = JSON.stringify([input.data, input.selected, input.hover, this.theme]);
    if (dk === this.dynKey) return;
    this.dynKey = dk;
    this.dyn.clear();
    const d = input.data;
    if (d.kind === 'enemy') {
      const sunkCells = new Set(d.sunk.flatMap((s) => s.cells.map(([r, c]) => `${r},${c}`)));
      for (const s of d.sunk) this.dyn.add(this.shipFromCells(s.word, s.cells, P.sunkHull, () => P.sunkTile, P.sunkInk, -0.08));
      for (const [k, v] of Object.entries(d.shots)) {
        if (sunkCells.has(k)) continue;
        const [r, c] = k.split(',').map(Number);
        if (v === 'miss') this.missMarker(r, c);
        else this.buoy(r, c, d.letters[k] ?? '?');
      }
    } else if (d.kind === 'own') {
      d.fleet.forEach((sh, i) => {
        const cells = shipCells(sh);
        const sunk = d.sunk[i] !== undefined;
        this.dyn.add(this.shipFromCells(sh.word, cells, sunk ? P.sunkHull : P.ownHull,
          (j) => (sunk ? P.sunkTile : d.shots[`${cells[j][0]},${cells[j][1]}`] === 'hit' ? P.hitTile : P.ownTile),
          sunk ? P.sunkInk : P.ownInk, sunk ? -0.08 : 0, (j) => !sunk && d.shots[`${cells[j][0]},${cells[j][1]}`] === 'hit'));
      });
      for (const [k, v] of Object.entries(d.shots)) if (v === 'miss') { const [r, c] = k.split(',').map(Number); this.missMarker(r, c); }
    } else {
      for (const sh of d.fleet) this.dyn.add(this.shipFromCells(sh.word, shipCells(sh), P.ownHull, () => P.ownTile, P.ownInk, 0));
      if (d.ghost && d.ghost.word) {
        const g = d.ghost;
        const cells = shipCells({ ...g });
        for (const [r, c] of cells) {
          if (r < 0 || r > 9 || c < 0 || c > 9) continue;
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ color: g.valid ? P.ghost : P.bad, transparent: true, opacity: 0.3, depthWrite: false }));
          m.rotation.x = -Math.PI / 2; m.position.set(cx(c), 0.12, cz(r)); this.dyn.add(m);
        }
        const ship = this.shipFromCells(g.word, cells, g.valid ? P.ghost : P.bad, () => P.ownTile, P.ownInk, 0.75);
        ship.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { m.transparent = true; m.opacity = (o as THREE.Mesh).geometry.type === 'ExtrudeGeometry' ? 0.55 : 0.92; } });
        this.dyn.add(ship);
      }
    }
    const mark = (rc: [number, number] | null, color: number, o: number) => {
      if (!rc) return;
      const m = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o }));
      m.rotation.x = -Math.PI / 2; m.position.set(cx(rc[1]), 0.13, cz(rc[0])); this.dyn.add(m);
    };
    if (input.hover && (!input.selected || input.hover.join() !== input.selected.join())) mark(input.hover, P.sel, 0.45);
    mark(input.selected, P.sel, 1);
  }

  private hull(len: number) {
    const s = new THREE.Shape(); const L = len * 0.98, W = 0.78;
    s.moveTo(-L / 2 + 0.15, -W / 2); s.lineTo(L / 2 - 0.45, -W / 2); s.quadraticCurveTo(L / 2 + 0.05, 0, L / 2 - 0.45, W / 2);
    s.lineTo(-L / 2 + 0.15, W / 2); s.quadraticCurveTo(-L / 2 - 0.05, 0, -L / 2 + 0.15, -W / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2); return g;
  }

  private shipFromCells(word: string, cells: [number, number][], hullColor: number, tile: (j: number) => string, ink: string, y: number, ring?: (j: number) => boolean) {
    const grp = new THREE.Group();
    const len = cells.length;
    const horiz = len < 2 || cells[0][0] === cells[1][0];
    const h = new THREE.Mesh(this.hull(len), new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.55, metalness: 0.25 }));
    h.castShadow = true; h.receiveShadow = true; grp.add(h);
    for (let i = 0; i < len; i++) {
      const bg = tile(i);
      const fg = bg === PAL[this.theme].hitTile && ink === PAL[this.theme].ownInk ? '#ffffff' : ink;
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.66), new THREE.MeshStandardMaterial({ map: this.tileTex(word[i] ?? '', bg, fg), transparent: true, roughness: 0.7 }));
      t.rotation.x = -Math.PI / 2; if (!horiz) t.rotation.z = Math.PI / 2; t.position.set(i - (len - 1) / 2, 0.375, 0); grp.add(t);
      if (ring?.(i)) {
        const r = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.44, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: PAL[this.theme].glow }));
        r.rotation.x = -Math.PI / 2; r.position.set(i - (len - 1) / 2, 0.378, 0); grp.add(r);
      }
    }
    const [r0, c0] = cells[0];
    grp.position.set(horiz ? cx(c0) + (len - 1) / 2 : cx(c0), y, horiz ? cz(r0) : cz(r0) + (len - 1) / 2);
    if (!horiz) grp.rotation.y = -Math.PI / 2;
    return grp;
  }

  private buoy(r: number, c: number, ch: string) {
    const P = PAL[this.theme];
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.22, 32), new THREE.MeshStandardMaterial({ color: P.buoy, roughness: 0.6 }));
    b.position.set(cx(c), 0.12, cz(r)); b.castShadow = true; this.dyn.add(b);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.68), new THREE.MeshBasicMaterial({ map: this.tileTex(ch, P.tile, P.ink), transparent: true }));
    t.rotation.x = -Math.PI / 2; t.position.set(cx(c), 0.24, cz(r)); this.dyn.add(t);
    const g = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.62, 40), new THREE.MeshBasicMaterial({ color: P.glow, transparent: true, opacity: 0.35 }));
    g.rotation.x = -Math.PI / 2; g.position.set(cx(c), 0.1, cz(r)); this.dyn.add(g);
  }

  private missMarker(r: number, c: number) {
    const P = PAL[this.theme];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 32), new THREE.MeshBasicMaterial({ color: P.grid, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(cx(c), 0.11, cz(r)); this.dyn.add(ring);
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 16), new THREE.MeshStandardMaterial({ color: P.peg, roughness: 0.35 }));
    peg.position.set(cx(c), 0.14, cz(r)); peg.castShadow = true; this.dyn.add(peg);
  }

  // ---------- input ----------
  private pick(ev: { clientX: number; clientY: number }): Hit | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    const c = Math.floor(p.x + 5), r = Math.floor(p.z + 5);
    if (r >= 0 && r < 10 && c >= 0 && c < 10) return { type: 'cell', r, c };
    if (r >= 0 && r < 10 && p.x < -5 && p.x > -8.2) return { type: 'row', i: r };
    if (c >= 0 && c < 10 && p.z < -5 && p.z > -8.2) return { type: 'col', i: c };
    return null;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number } | null = null, moved = 0, pinch = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY }; moved = 0; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) { if (e.pointerType === 'mouse') this.onHover(this.pick(e)); return; }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.distT = Math.max(13, Math.min(40, this.distT * (pinch / d))); pinch = d; moved = 99; return;
      }
      if (start) moved = Math.max(moved, Math.hypot(e.clientX - start.x, e.clientY - start.y));
      if (moved > 4) {
        this.azT = Math.max(-0.6, Math.min(0.6, this.azT - dx * 0.005));
        this.polarT = Math.max(0.42, Math.min(1.05, this.polarT - dy * 0.004));
      }
    });
    const up = (e: PointerEvent) => {
      const wasTap = pts.size === 1 && moved <= 4;
      pts.delete(e.pointerId);
      if (wasTap && e.type === 'pointerup') { const h = this.pick(e); if (h) this.onTap(h); }
      if (!pts.size) { start = null; pinch = 0; }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { if (!pts.size) this.onHover(null); });
    el.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); this.distT = Math.max(13, Math.min(40, this.distT * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
  }

  private frame(t: number) {
    const k = reduced() ? 1 : 0.15;
    this.az += (this.azT - this.az) * k; this.polar += (this.polarT - this.polar) * k; this.dist += (this.distT - this.dist) * k;
    const sp = Math.sin(this.polar);
    this.cam.position.set(this.target.x + this.dist * sp * Math.sin(this.az), this.dist * Math.cos(this.polar), this.target.z + this.dist * sp * Math.cos(this.az));
    this.cam.lookAt(this.target);
    if (this.sweep && !reduced()) this.sweep.rotation.z = -((t / 6000) % 1) * Math.PI * 2;
    this.renderer.render(this.scene, this.cam);
  }
}
