import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  CHECKED_IN_SHARE,
  SOURCES,
  STAGE_PALETTES,
  stage,
  type StagePalette,
  type StageTheme,
} from "@/components/three/stage-state";
import {
  drawBarLabel,
  drawScreen,
  drawShadow,
  drawTicketBack,
  drawTicketFront,
  fontsReady,
  type TicketArt,
} from "@/components/three/textures";

/**
 * The landing page's WebGL stage. One scene carries the whole scroll story:
 *
 *   hero         a ticket floating over a drafting-grid floor
 *   sell         the ticket fans out into three tiers
 *   check-in     the camera closes in on the QR while a scanner sweeps it
 *   run the floor the hall rises and seats fill as attendees check in
 *   attribution  checked-in seats stack into a bar per traffic source
 *
 * Scroll progress arrives through `stage.progress`; nothing here re-renders
 * while scrolling.
 */

const TICKET_W = 3.6;
const TICKET_H = 1.6;
const TICKET_D = 0.04;
const BEVEL = 0.008;
/** Tear line, measured from the ticket centre. */
const TEAR_X = TICKET_W / 2 - 1;

const TIERS = [
  { tier: "Early bird", serial: "000241", seat: "A-07" },
  { tier: "General", serial: "000892", seat: "B-14" },
  { tier: "VIP", serial: "000083", seat: "V-02" },
] as const;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type Vec3 = [number, number, number];
interface Pose {
  position: Vec3;
  target: Vec3;
}

/** Camera stops for hero → sell → check-in → hall → bars. */
const CAMERA: Record<"landscape" | "portrait", Pose[]> = {
  landscape: [
    { position: [0, 1.75, 9.6], target: [0, 1.55, 0] },
    { position: [0.5, 1.9, 9.4], target: [0.1, 1.5, 0] },
    { position: [4.7, 1.8, 5.2], target: [4.2, 1.74, 0.9] },
    { position: [-1.2, 7.4, 13], target: [-1.2, 0.2, -4.2] },
    { position: [-2.8, 4.4, 11.5], target: [-1.3, 1.6, -3.5] },
  ],
  portrait: [
    { position: [0, 1.7, 14.5], target: [0, 1.6, 0] },
    { position: [0, 1.8, 15.5], target: [0, 1.5, 0] },
    { position: [1.6, 1.78, 7.4], target: [1.5, 1.72, 0.9] },
    { position: [0, 14, 17], target: [0, 0, -5] },
    { position: [0, 6, 18], target: [0, 1.6, -3.2] },
  ],
};

/** Ticket stack stops for the same beats (the last one is its exit). */
const TICKET_POSES: { position: Vec3; rotation: Vec3; scale: number }[] = [
  { position: [0, 1.62, 0], rotation: [-0.1, -0.52, 0.07], scale: 1 },
  { position: [0, 1.75, 0.2], rotation: [-0.04, -0.32, 0], scale: 0.82 },
  { position: [3.4, 1.62, 0.2], rotation: [0, -0.6, 0], scale: 1 },
  { position: [0, 2.6, -7], rotation: [0.2, -1.2, 0], scale: 0 },
];

function ticketShape() {
  const w = TICKET_W;
  const h = TICKET_H;
  const r = 0.12;
  const n = 0.085;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(TEAR_X - n, -h / 2);
  shape.absarc(TEAR_X, -h / 2, n, Math.PI, 0, true);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w / 2, h / 2 - r);
  shape.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(TEAR_X + n, h / 2);
  shape.absarc(TEAR_X, h / 2, n, 0, Math.PI, true);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/** Remap a flat shape's UVs to 0–1 across the ticket so a texture fits it. */
function fitUvs(geometry: THREE.BufferGeometry, mirror: boolean) {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const u = (position.getX(i) + TICKET_W / 2) / TICKET_W;
    const v = (position.getY(i) + TICKET_H / 2) / TICKET_H;
    uv.setXY(i, mirror ? 1 - u : u, v);
  }
  uv.needsUpdate = true;
  return geometry;
}

function useTicketGeometry() {
  const geometry = useMemo(() => {
    const shape = ticketShape();
    const body = new THREE.ExtrudeGeometry(shape, {
      depth: TICKET_D,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 2,
      curveSegments: 14,
    });
    body.translate(0, 0, -TICKET_D / 2);
    const front = fitUvs(new THREE.ShapeGeometry(shape, 14), false);
    const back = fitUvs(new THREE.ShapeGeometry(shape, 14), true);
    return { body, front, back };
  }, []);
  useEffect(
    () => () => {
      geometry.body.dispose();
      geometry.front.dispose();
      geometry.back.dispose();
    },
    [geometry],
  );
  return geometry;
}

/** A texture backed by a 2D canvas, repainted when `deps` change or fonts land. */
function useCanvasTexture(
  width: number,
  height: number,
  paint: (canvas: HTMLCanvasElement) => void,
  deps: unknown[],
) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [width, height]);
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive) return;
      paint(texture.image as HTMLCanvasElement);
      texture.needsUpdate = true;
    };
    run();
    fontsReady().then(run);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `paint` is rebuilt every render; `deps` lists what it reads
  }, [texture, ...deps]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Ticket({
  art,
  geometry,
  backArt,
}: {
  art: TicketArt;
  backArt: TicketArt;
  geometry: ReturnType<typeof useTicketGeometry>;
}) {
  const front = useCanvasTexture(1800, 800, (canvas) => drawTicketFront(canvas, art), [
    art.tier,
    art.paper,
    art.ink,
    art.foil,
    art.foilInk,
  ]);
  const back = useCanvasTexture(1800, 800, (canvas) => drawTicketBack(canvas, backArt), [
    backArt.paper,
    backArt.ink,
    backArt.foil,
  ]);
  const faceZ = TICKET_D / 2 + BEVEL + 0.002;
  return (
    <>
      <mesh geometry={geometry.body}>
        <meshStandardMaterial color={art.paper} roughness={0.8} />
      </mesh>
      <mesh geometry={geometry.front} position={[0, 0, faceZ]}>
        <meshStandardMaterial map={front} roughness={0.78} />
      </mesh>
      <mesh geometry={geometry.back} position={[0, 0, -faceZ]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial map={back} roughness={0.78} />
      </mesh>
    </>
  );
}

const FLOOR_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const FLOOR_FRAGMENT = /* glsl */ `
  uniform vec3 uLine;
  uniform vec3 uMajor;
  uniform float uOpacity;
  uniform float uFade;
  varying vec3 vWorld;

  float gridLine(vec2 p, float cell, float width) {
    vec2 q = p / cell;
    vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    return 1.0 - min(min(g.x, g.y) / width, 1.0);
  }

  void main() {
    float minor = gridLine(vWorld.xz, 1.0, 1.0);
    float major = gridLine(vWorld.xz, 5.0, 1.3);
    float dist = length(vWorld.xz - cameraPosition.xz);
    float fade = 1.0 - smoothstep(uFade * 0.2, uFade, dist);
    vec3 color = mix(uLine, uMajor, major);
    float alpha = max(minor * 0.5, major * 0.75) * fade * uOpacity;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

function GridFloor({ palette, theme }: { palette: StagePalette; theme: StageTheme }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FLOOR_VERTEX,
        fragmentShader: FLOOR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uLine: { value: new THREE.Color() },
          uMajor: { value: new THREE.Color() },
          uOpacity: { value: 0.5 },
          uFade: { value: 42 },
        },
      }),
    [],
  );
  useEffect(() => {
    material.uniforms.uLine.value.set(palette.gridLine);
    material.uniforms.uMajor.value.set(palette.gridMajor);
    material.uniforms.uOpacity.value = theme === "dark" ? 0.55 : 0.34;
  }, [material, palette, theme]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={-1}>
      <planeGeometry args={[160, 160]} />
    </mesh>
  );
}

/** Small deterministic PRNG so the hall looks the same on every visit. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEAT = 0.36;
const BAR_STEP = 0.4;
const BAR_X = [-3.3, -1.1, 1.1, 3.3];
const BAR_Z = -3.5;

interface HallLayout {
  count: number;
  seatX: Float32Array;
  seatZ: Float32Array;
  /** 0 at the back row, 1 at the front. */
  rowFraction: Float32Array;
  /** Check-in order; seats at or past `taken` never fill. */
  rank: Int32Array;
  taken: number;
  bar: Int8Array;
  barX: Float32Array;
  barY: Float32Array;
  barZ: Float32Array;
  flightDelay: Float32Array;
  barHeights: number[];
  stageZ: number;
}

function buildHall(cols: number, rows: number): HallLayout {
  const count = cols * rows;
  const random = seeded(7);
  const seatX = new Float32Array(count);
  const seatZ = new Float32Array(count);
  const rowFraction = new Float32Array(count);
  const order: { index: number; key: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const offset = c - (cols - 1) / 2;
      seatX[i] = offset * 0.5 + Math.sign(offset) * 0.3;
      seatZ[i] = -1 - r * 0.62;
      rowFraction[i] = rows > 1 ? r / (rows - 1) : 0;
      // Mostly random arrival, with a pull towards the front rows.
      order.push({ index: i, key: random() * 0.78 + (1 - rowFraction[i]) * 0.22 });
    }
  }
  order.sort((a, b) => a.key - b.key);
  const rank = new Int32Array(count);
  order.forEach((entry, position) => {
    rank[entry.index] = position;
  });

  const taken = Math.round(count * CHECKED_IN_SHARE);
  const total = SOURCES.reduce((sum, source) => sum + source.count, 0);
  const quotas = SOURCES.map((source) => Math.round((source.count / total) * taken));
  quotas[0] += taken - quotas.reduce((sum, q) => sum + q, 0);

  const bar = new Int8Array(count).fill(-1);
  const barX = new Float32Array(count);
  const barY = new Float32Array(count);
  const barZ = new Float32Array(count);
  const flightDelay = new Float32Array(count);
  const filled = [0, 0, 0, 0];
  const maxLayers = Math.ceil(Math.max(...quotas) / 9);
  for (let position = 0; position < taken; position++) {
    const i = order[position].index;
    // Deal seats round-robin so every bar draws from across the hall.
    let b = position % 4;
    let guard = 0;
    while (filled[b] >= quotas[b] && guard < 4) {
      b = (b + 1) % 4;
      guard++;
    }
    const slot = filled[b]++;
    const layer = Math.floor(slot / 9);
    const cell = slot % 9;
    bar[i] = b;
    barX[i] = BAR_X[b] + ((cell % 3) - 1) * BAR_STEP;
    barZ[i] = BAR_Z + (Math.floor(cell / 3) - 1) * BAR_STEP;
    barY[i] = SEAT / 2 + layer * BAR_STEP;
    flightDelay[i] = (layer / maxLayers) * 0.8 + random() * 0.2;
  }
  const barHeights = quotas.map((q) => Math.ceil(q / 9) * BAR_STEP);
  return {
    count,
    seatX,
    seatZ,
    rowFraction,
    rank,
    taken,
    bar,
    barX,
    barY,
    barZ,
    flightDelay,
    barHeights,
    stageZ: -1 - (rows - 1) * 0.62 - 1.8,
  };
}

function BarLabel({ name, count, color }: { name: string; count: number; color: string }) {
  const texture = useCanvasTexture(512, 256, (canvas) => drawBarLabel(canvas, name, count, color), [name, count, color]);
  return <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />;
}

function Scene({ theme, onReady }: { theme: StageTheme; onReady?: () => void }) {
  const palette = STAGE_PALETTES[theme];
  const { camera, size } = useThree();
  const portrait = size.width / size.height < 0.85;
  const geometry = useTicketGeometry();
  const hall = useMemo(() => (portrait ? buildHall(13, 22) : buildHall(20, 14)), [portrait]);

  const stack = useRef<THREE.Group>(null);
  const tickets = useRef<(THREE.Group | null)[]>([]);
  const beam = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const hallGroup = useRef<THREE.Group>(null);
  const seats = useRef<THREE.InstancedMesh>(null);
  const venue = useRef<THREE.Group>(null);
  const labels = useRef<(THREE.Mesh | null)[]>([]);
  const smoothed = useRef(stage.progress);
  const pointer = useRef({ x: 0, y: 0 });
  const lastHall = useRef("");
  const announced = useRef(false);

  const colors = useMemo(
    () => ({
      empty: new THREE.Color(palette.seatEmpty),
      taken: new THREE.Color(palette.seatTaken),
      bars: palette.bars.map((hex) => new THREE.Color(hex)),
    }),
    [palette],
  );
  const scratch = useMemo(
    () => ({ object: new THREE.Object3D(), color: new THREE.Color(), position: new THREE.Vector3(), target: new THREE.Vector3() }),
    [],
  );

  const shadowTexture = useCanvasTexture(256, 256, drawShadow, []);
  const screenTexture = useCanvasTexture(
    1024,
    384,
    (canvas) => drawScreen(canvas, palette.screen, palette.screenText, palette.foil),
    [palette.screen, palette.screenText, palette.foil],
  );

  // Compose the scene off-centre so the copy has room: to the right on wide
  // screens, towards the bottom on tall ones.
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (portrait) cam.setViewOffset(size.width, size.height, 0, -size.height * 0.2, size.width, size.height);
    else cam.setViewOffset(size.width, size.height, -size.width * 0.17, 0, size.width, size.height);
    return () => cam.clearViewOffset();
  }, [camera, portrait, size.width, size.height]);

  // Force the hall to be rebuilt after a palette or layout change.
  useLayoutEffect(() => {
    lastHall.current = "";
  }, [hall, colors]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    smoothed.current += (stage.progress - smoothed.current) * (1 - Math.exp(-dt * 9));
    const p = smoothed.current;
    pointer.current.x += (stage.pointerX - pointer.current.x) * (1 - Math.exp(-dt * 4));
    pointer.current.y += (stage.pointerY - pointer.current.y) * (1 - Math.exp(-dt * 4));
    const px = pointer.current.x;
    const py = pointer.current.y;
    const time = state.clock.elapsedTime;

    const toSell = ease(span(p, 0.1, 0.24));
    const fan = toSell * (1 - ease(span(p, 0.32, 0.42)));
    const toScan = ease(span(p, 0.34, 0.46));
    const scan = span(p, 0.45, 0.56);
    const toHallRaw = span(p, 0.56, 0.68);
    const toHall = ease(toHallRaw);
    const fill = span(p, 0.63, 0.8);
    const toBarsRaw = span(p, 0.8, 0.95);
    const toBars = ease(toBarsRaw);

    // Camera
    const poses = CAMERA[portrait ? "portrait" : "landscape"];
    const steps = [toSell, toScan, toHall, toBars];
    const { position, target } = scratch;
    position.fromArray(poses[0].position);
    target.fromArray(poses[0].target);
    for (let i = 0; i < steps.length; i++) {
      const next = poses[i + 1];
      position.set(
        mix(position.x, next.position[0], steps[i]),
        mix(position.y, next.position[1], steps[i]),
        mix(position.z, next.position[2], steps[i]),
      );
      target.set(
        mix(target.x, next.target[0], steps[i]),
        mix(target.y, next.target[1], steps[i]),
        mix(target.z, next.target[2], steps[i]),
      );
    }
    const drift = 1 - toScan * 0.7;
    camera.position.set(position.x + px * 0.35 * drift, position.y - py * 0.18 * drift, position.z);
    camera.lookAt(target);

    // Ticket stack
    const group = stack.current;
    if (group) {
      const ticketSteps = [toSell, toScan, toHall];
      let x = TICKET_POSES[0].position[0];
      let y = TICKET_POSES[0].position[1];
      let z = TICKET_POSES[0].position[2];
      let rx = TICKET_POSES[0].rotation[0];
      let ry = TICKET_POSES[0].rotation[1];
      let rz = TICKET_POSES[0].rotation[2];
      let scale = TICKET_POSES[0].scale;
      for (let i = 0; i < ticketSteps.length; i++) {
        const next = TICKET_POSES[i + 1];
        const t = ticketSteps[i];
        x = mix(x, next.position[0], t);
        y = mix(y, next.position[1], t);
        z = mix(z, next.position[2], t);
        rx = mix(rx, next.rotation[0], t);
        ry = mix(ry, next.rotation[1], t);
        rz = mix(rz, next.rotation[2], t);
        scale = mix(scale, next.scale, t);
      }
      const calm = 1 - toScan;
      group.visible = toHall < 0.999;
      // On tall screens the scan pose stays centred under the copy.
      const scanShift = portrait ? toScan * (1 - toHall) * -2.7 : 0;
      group.position.set(x + scanShift, y + Math.sin(time * 0.9) * 0.05 * calm, z);
      group.rotation.set(rx + py * 0.1 * drift, ry + Math.sin(time * 0.6) * 0.04 * calm + px * 0.18 * drift, rz);
      group.scale.setScalar(Math.max(scale * (portrait ? 0.94 : 1), 0.0001));

      tickets.current.forEach((ticket, index) => {
        if (!ticket) return;
        const side = index - 1;
        ticket.visible = side === 0 || fan > 0.002;
        ticket.position.set(side * 0.42 * fan, -side * 1.12 * fan, mix(-0.05 * (index === 0 ? 1 : 2) * Math.abs(side), side * 0.3, fan));
        ticket.rotation.z = -side * 0.05 * fan;
      });

      if (beam.current) {
        beam.current.visible = scan > 0.01 && scan < 0.99;
        // Two passes over the QR, top to bottom.
        const sweep = (scan * 2) % 1;
        beam.current.position.y = 0.14 + 0.36 - sweep * 0.72;
      }
      if (shadow.current) {
        shadow.current.visible = group.visible;
        shadow.current.position.set(x, 0.012, z);
        shadow.current.scale.set(5 * scale, 2.4 * scale, 1);
        (shadow.current.material as THREE.MeshBasicMaterial).opacity = (theme === "dark" ? 0.55 : 0.22) * (1 - toHall) * (1 - toScan * 0.6);
      }
    }

    // Hall
    if (hallGroup.current) hallGroup.current.visible = toHallRaw > 0.001;
    if (venue.current) {
      const visible = toHall * (1 - toBars);
      venue.current.visible = visible > 0.01;
      venue.current.position.y = (1 - toHall) * -0.6;
      venue.current.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.Material).opacity = visible;
      });
    }
    const mesh = seats.current;
    const signature = `${toHallRaw.toFixed(4)}|${fill.toFixed(4)}|${toBarsRaw.toFixed(4)}`;
    if (mesh && toHallRaw > 0.001 && signature !== lastHall.current) {
      lastHall.current = signature;
      const { object, color } = scratch;
      const front = fill * hall.taken;
      for (let i = 0; i < hall.count; i++) {
        const rise = ease(clamp01(toHallRaw * 1.8 - hall.rowFraction[i] * 0.8));
        const isTaken = hall.rank[i] < hall.taken;
        const lit = isTaken ? clamp01((front - hall.rank[i]) / 6) : 0;
        const flight = isTaken ? ease(clamp01(toBarsRaw * 2.2 - hall.flightDelay[i] * 1.2)) : 0;
        const height = mix(0.5, 1, lit);
        const seatY = (SEAT * height) / 2;
        if (isTaken) {
          object.position.set(
            mix(hall.seatX[i], hall.barX[i], flight),
            mix(seatY, hall.barY[i], flight) + Math.sin(Math.PI * flight) * 1.6,
            mix(hall.seatZ[i], hall.barZ[i], flight),
          );
          object.scale.set(rise, rise * mix(height, 1, flight), rise);
          color.copy(colors.empty).lerp(colors.taken, lit).lerp(colors.bars[hall.bar[i]], flight);
        } else {
          const stay = rise * (1 - toBars);
          object.position.set(hall.seatX[i], seatY, hall.seatZ[i]);
          object.scale.set(stay, Math.max(stay * height, 0.0001), stay);
          color.copy(colors.empty);
        }
        object.updateMatrix();
        mesh.setMatrixAt(i, object.matrix);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    labels.current.forEach((label, index) => {
      if (!label) return;
      const shown = ease(span(toBarsRaw, 0.55, 1));
      label.visible = shown > 0.01;
      label.position.y = hall.barHeights[index] + 0.5 + shown * 0.35;
      (label.material as THREE.MeshBasicMaterial).opacity = shown;
    });

    if (!announced.current) {
      announced.current = true;
      onReady?.();
    }
  });

  const hallScale = portrait ? 0.72 : 1;
  const backArt: TicketArt = { tier: "", serial: "", seat: "", paper: palette.ink, ink: palette.paper, foil: palette.foil, foilInk: palette.foilInk };

  return (
    <>
      <fog attach="fog" args={[palette.background, 20, 60]} />
      <hemisphereLight args={["#F2F6FB", theme === "dark" ? "#6B7280" : "#C7CAD1", theme === "dark" ? 2.3 : 2.5]} />
      <directionalLight position={[3, 6, 8]} intensity={2.6} color="#FFFFFF" />
      <directionalLight position={[-6, 3, -4]} intensity={0.7} color="#8DB8FF" />

      <GridFloor palette={palette} theme={theme} />

      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowTexture} transparent depthWrite={false} toneMapped={false} />
      </mesh>

      <group ref={stack}>
        {TIERS.map((tier, index) => (
          <group
            key={tier.tier}
            ref={(node) => {
              tickets.current[index] = node;
            }}
          >
            <Ticket
              geometry={geometry}
              art={{ ...tier, paper: palette.paper, ink: palette.ink, foil: palette.foil, foilInk: palette.foilInk }}
              backArt={backArt}
            />
            {index === 1 && (
              <group ref={beam} position={[1.3, 0.14, TICKET_D / 2 + BEVEL + 0.012]} visible={false}>
                <mesh>
                  <planeGeometry args={[0.78, 0.022]} />
                  <meshBasicMaterial color={palette.foil} toneMapped={false} />
                </mesh>
                <mesh position={[0, 0.09, 0]}>
                  <planeGeometry args={[0.78, 0.18]} />
                  <meshBasicMaterial color={palette.foil} transparent opacity={0.2} depthWrite={false} toneMapped={false} />
                </mesh>
              </group>
            )}
          </group>
        ))}
      </group>

      <group ref={hallGroup} scale={hallScale} visible={false}>
        <instancedMesh ref={seats} key={hall.count} args={[undefined, undefined, hall.count]} frustumCulled={false}>
          <boxGeometry args={[SEAT, SEAT, SEAT]} />
          <meshStandardMaterial roughness={0.72} />
        </instancedMesh>

        <group ref={venue}>
          <mesh position={[0, 0.15, hall.stageZ]}>
            <boxGeometry args={[11, 0.3, 2]} />
            <meshStandardMaterial color={palette.seatEmpty} roughness={0.8} transparent />
          </mesh>
          <mesh position={[0, 2.4, hall.stageZ - 0.9]}>
            <planeGeometry args={[9, 3.375]} />
            <meshBasicMaterial map={screenTexture} transparent toneMapped={false} />
          </mesh>
        </group>

        {SOURCES.map((source, index) => (
          <mesh
            key={source.name}
            ref={(node) => {
              labels.current[index] = node;
            }}
            position={[BAR_X[index], 0, BAR_Z]}
            visible={false}
          >
            <planeGeometry args={[1.9, 0.95]} />
            <BarLabel name={source.name} count={source.count} color={palette.label} />
          </mesh>
        ))}
      </group>
    </>
  );
}

export default function StageCanvas({
  theme,
  active,
  onReady,
}: {
  theme: StageTheme;
  /** Render only while the stage is on screen. */
  active: boolean;
  onReady?: () => void;
}) {
  return (
    <Canvas
      flat
      dpr={[1, 1.75]}
      frameloop={active ? "always" : "never"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 35, near: 0.1, far: 140, position: [0, 1.75, 9.6] }}
      resize={{ scroll: false, debounce: { scroll: 0, resize: 80 } }}
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    >
      <Scene theme={theme} onReady={onReady} />
    </Canvas>
  );
}
