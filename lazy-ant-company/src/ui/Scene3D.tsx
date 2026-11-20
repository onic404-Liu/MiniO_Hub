import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AgentView, WeekSnapshot } from '../sim/index';
import { INK, PALETTE, TINT } from './theme';

/** Playback clock shared by every view: `t` is a fractional week index into snapshots. */
export interface PlaybackClock {
  t: number;
}

// ---------- Layout (pure view constants; no business logic) ----------
const CELL = 1.3;
const AISLE = 1.8;
const OFFICE_X0 = -14.5;
const OFFICE_Z0 = -7;
const deskPos = (i: number): [number, number] => {
  const col = i % 10;
  const row = Math.floor(i / 10);
  return [OFFICE_X0 + col * CELL + (col >= 5 ? AISLE : 0), OFFICE_Z0 + row * CELL + (row >= 5 ? AISLE : 0)];
};
const PILLAR: [number, number] = [OFFICE_X0 + 4.5 * CELL + AISLE / 2, OFFICE_Z0 + 4.5 * CELL + AISLE / 2];
const OFFICE_W = 9 * CELL + AISLE + 1.6;
const OFFICE_CX = OFFICE_X0 + (9 * CELL + AISLE) / 2;
const OFFICE_CZ = OFFICE_Z0 + (9 * CELL + AISLE) / 2;

const ZONE_X0 = 3.2;
const ZONE_CELL = 0.95;
const TEA_Z0 = -7.6;
const WARD_Z0 = 1.2;
const zoneSlot = (i: number, z0: number): [number, number] => [
  ZONE_X0 + (i % 10) * ZONE_CELL,
  z0 + Math.floor(i / 10) * ZONE_CELL * 0.7,
];
const ZONE_W = 9 * ZONE_CELL + 1.4;
const ZONE_D = 9 * ZONE_CELL * 0.7 + 1.4;
const ZONE_CX = ZONE_X0 + (9 * ZONE_CELL) / 2;

const TASK_SCALE = 0.12; // world units per backlog task
const TILE_TASKS = 2; // one stacked tile = 2 tasks
const TILE_PITCH = TASK_SCALE * TILE_TASKS;
const MAX_TILES = 90;
const K = 1.15; // 糰子整體放大倍率
const BODY_Y = 0.47;

// ---------- Palette (four hues only) ----------
const C_BLUE = new THREE.Color(PALETTE.blue);
const C_BUTTER = new THREE.Color(PALETTE.butter);
const C_LAV = new THREE.Color(PALETTE.lavender);
const C_CORAL = new THREE.Color(PALETTE.coral);
const C_GRAY = new THREE.Color('#cfd4de');
const ROLE_COLOR: Record<AgentView['role'], THREE.Color> = {
  LOW_THRESHOLD: C_BLUE,
  HIGH_THRESHOLD: C_BUTTER,
  TRUE_SLACKER: C_LAV,
};

function target(a: AgentView): [number, number] {
  if (a.state === 'RESTING') return zoneSlot(a.id, TEA_Z0);
  if (a.state === 'BURNOUT') return zoneSlot(a.id, WARD_Z0);
  return deskPos(a.id);
}

const ease = (x: number) => x * x * (3 - 2 * x);

function sampleClock(len: number, t: number) {
  const last = len - 1;
  const tt = Math.min(Math.max(t, 0), last);
  const i0 = Math.floor(tt);
  const i1 = Math.min(i0 + 1, last);
  return { i0, i1, f: ease(tt - i0) };
}

interface Props {
  snapshots: readonly WeekSnapshot[];
  clock: MutableRefObject<PlaybackClock>;
  collapseThreshold: number;
  alertLevel: number;
  label?: string;
}

/** 圓滾滾、兩隻腳的小精靈：身體 / 雙腳 / 雙眼 / 頭頂體力條，各自一個 InstancedMesh。 */
function Agents({ snapshots, clock }: Pick<Props, 'snapshots' | 'clock'>) {
  const n = snapshots[0].agents.length;
  const bodies = useRef<THREE.InstancedMesh>(null);
  const feet = useRef<THREE.InstancedMesh>(null);
  const eyes = useRef<THREE.InstancedMesh>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const tracks = useRef<THREE.InstancedMesh>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const col2 = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock: c }) => {
    const B = bodies.current;
    const F = feet.current;
    const E = eyes.current;
    const S = bars.current;
    const T = tracks.current;
    if (!B || !F || !E || !S || !T) return;
    const time = c.elapsedTime;
    const { i0, i1, f } = sampleClock(snapshots.length, clock.current.t);
    const A0 = snapshots[i0].agents;
    const A1 = snapshots[i1].agents;
    for (let i = 0; i < n; i++) {
      const a = A0[i];
      const z = A1[i];
      const [ax, az] = target(a);
      const [bx, bz] = target(z);
      const x = ax + (bx - ax) * f;
      const zz = az + (bz - az) * f;
      const cur = f < 0.5 ? a : z;
      const moving = f > 0.03 && f < 0.97 && (ax !== bx || az !== bz);
      const working = cur.state === 'WORKING';
      const phase = time * (moving ? 15 : 9) + i * 1.7;
      const hop = moving ? Math.abs(Math.sin(phase)) * 0.12 : working ? Math.abs(Math.sin(phase)) * 0.18 : 0;
      const dA = a.state === 'BURNOUT' ? 1 : 0;
      const dB = z.state === 'BURNOUT' ? 1 : 0;
      const down = dA + (dB - dA) * f;
      const sway = !moving && !working && down < 0.5 ? Math.sin(time * 1.6 + i) * 0.05 : 0;
      const rot = down * (Math.PI / 2) + sway;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const by = BODY_Y - down * 0.12 + hop;

      // body color
      col.copy(ROLE_COLOR[cur.role]);
      if (cur.state === 'BURNOUT') col.lerp(C_CORAL, 0.72 + 0.25 * (0.5 + 0.5 * Math.sin(time * 8)));
      else if (cur.state === 'FAKE_BUSY') col.lerp(C_GRAY, 0.5);
      col2.copy(col).multiplyScalar(0.88);

      // body
      o.position.set(x, by, zz);
      o.rotation.set(0, 0, rot);
      o.scale.set(K, 0.95 * K, K);
      o.updateMatrix();
      B.setMatrixAt(i, o.matrix);
      B.setColorAt(i, col);

      for (let k = 0; k < 2; k++) {
        const s = k === 0 ? -1 : 1;
        // feet: alternate steps while moving / working
        const active = moving || working;
        const swing = active ? Math.sin(phase + (s > 0 ? Math.PI : 0)) : 0;
        const lift = active ? Math.max(0, swing) * 0.1 : 0;
        const ox = s * 0.19 * K;
        const oy = -0.36 * K + lift;
        const oz = 0.17 * K + swing * (moving ? 0.14 : 0.05);
        o.position.set(x + ox * cs - oy * sn, Math.max(0.1, by + ox * sn + oy * cs), zz + oz);
        o.rotation.set(0, 0, 0);
        o.scale.set(0.16, 0.1, 0.21);
        o.updateMatrix();
        F.setMatrixAt(i * 2 + k, o.matrix);
        F.setColorAt(i * 2 + k, col2);

        // eyes: closed when burnt out
        const ex = s * 0.14 * K;
        const ey = 0.09 * K;
        o.position.set(x + ex * cs - ey * sn, by + ex * sn + ey * cs, zz + 0.4 * K);
        o.rotation.set(0, 0, rot);
        o.scale.set(0.058, cur.state === 'BURNOUT' ? 0.014 : 0.064, 0.058);
        o.updateMatrix();
        E.setMatrixAt(i * 2 + k, o.matrix);
      }

      // stamina bar (rounded: a flattened ellipsoid)
      const stamina = a.stamina + (z.stamina - a.stamina) * f;
      const w = Math.max(0.03, stamina / 100);
      const barY = by + 0.98 * K;
      o.position.set(x, barY, zz + 0.1);
      o.scale.set(0.4, 0.095, 0.08);
      o.updateMatrix();
      T.setMatrixAt(i, o.matrix);
      o.position.set(x - 0.36 * (1 - w), barY, zz + 0.13);
      o.rotation.set(0, 0, 0);
      o.scale.set(0.36 * w, 0.075, 0.075);
      o.updateMatrix();
      S.setMatrixAt(i, o.matrix);
      S.setColorAt(i, stamina > 30 ? C_BLUE : C_CORAL);
    }
    T.instanceMatrix.needsUpdate = true;
    for (const m of [B, F, E, S]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, n]} castShadow frustumCulled={false}>
        <sphereGeometry args={[0.4, 28, 20]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={feet} args={[undefined, undefined, n * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={eyes} args={[undefined, undefined, n * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={INK} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={tracks} args={[undefined, undefined, n]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#e3e7ef" />
      </instancedMesh>
      <instancedMesh ref={bars} args={[undefined, undefined, n]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial />
      </instancedMesh>
    </>
  );
}

/** 待辦任務堆疊柱：一塊圓角方塊 = 2 件工單，超過警戒 20 逐漸轉珊瑚色並閃爍。 */
function BacklogPillar({ snapshots, clock, collapseThreshold, alertLevel }: Omit<Props, 'label'>) {
  const tiles = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const wall = useRef<THREE.MeshBasicMaterial>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const geo = useMemo(() => new RoundedBoxGeometry(1.1, 0.2, 1.1, 3, 0.09), []);

  useFrame(({ clock: c }) => {
    const m = tiles.current;
    if (!m) return;
    const { i0, i1, f } = sampleClock(snapshots.length, clock.current.t);
    const backlog = snapshots[i0].backlog + (snapshots[i1].backlog - snapshots[i0].backlog) * f;
    const t = backlog / TILE_TASKS;
    const full = Math.floor(t);
    const frac = t - full;
    const count = Math.min(MAX_TILES, full + (frac > 0.08 ? 1 : 0));
    m.count = count;
    for (let i = 0; i < count; i++) {
      const sy = i === full ? Math.max(0.3, frac) : 1;
      const wob = Math.sin(c.elapsedTime * 2 + i * 0.5) * 0.02 * Math.min(1, i / 20);
      o.position.set(wob, i * TILE_PITCH + 0.1 * sy, 0);
      o.rotation.set(0, i * 0.07, 0);
      o.scale.set(1, sy, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      const tasks = i * TILE_TASKS;
      if (tasks >= collapseThreshold) col.copy(C_CORAL);
      else if (tasks >= alertLevel) col.copy(C_BUTTER).lerp(C_CORAL, (tasks - alertLevel) / (collapseThreshold - alertLevel));
      else col.copy(C_BUTTER);
      m.setColorAt(i, col);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    const alert = backlog >= alertLevel;
    const blink = alert ? 0.5 + 0.5 * Math.sin(c.elapsedTime * 10) : 0;
    if (mat.current) mat.current.emissiveIntensity = alert ? 0.15 + blink * 0.55 : 0;
    if (wall.current) wall.current.opacity = 0.08 + blink * 0.14;
    if (ringMat.current) ringMat.current.emissiveIntensity = 0.25 + blink * 0.9;
    if (light.current) light.current.intensity = alert ? 4 + blink * 22 : 0;
  });

  const ringY = collapseThreshold * TASK_SCALE;
  return (
    <group position={[PILLAR[0], 0, PILLAR[1]]}>
      <instancedMesh ref={tiles} args={[geo, undefined, MAX_TILES]} castShadow frustumCulled={false}>
        <meshStandardMaterial ref={mat} roughness={0.7} emissive={PALETTE.coral} />
      </instancedMesh>
      <mesh position={[0, ringY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.05, 0.07, 14, 56]} />
        <meshStandardMaterial ref={ringMat} color={PALETTE.coral} emissive={PALETTE.coral} />
      </mesh>
      <mesh position={[0, ringY / 2, 0]}>
        <cylinderGeometry args={[1.05, 1.05, ringY, 40, 1, true]} />
        <meshBasicMaterial ref={wall} color={PALETTE.coral} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <pointLight ref={light} position={[0, ringY + 1, 0]} color={PALETTE.coral} distance={16} />
    </group>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium whitespace-nowrap text-ink shadow-md">
      {children}
    </span>
  );
}

function Zones() {
  const desks = useRef<THREE.InstancedMesh>(null);
  const deskGeo = useMemo(() => new RoundedBoxGeometry(0.9, 0.1, 0.38, 3, 0.045), []);
  // 桌位固定；和其他物件一樣在 useFrame 內寫入矩陣（只寫一次在此環境下不會顯示）
  const deskMatrices = useMemo(() => {
    const o = new THREE.Object3D();
    return Array.from({ length: 100 }, (_, i) => {
      const [x, z] = deskPos(i);
      o.position.set(x, 0.05, z + 0.5);
      o.updateMatrix();
      return o.matrix.clone();
    });
  }, []);
  useFrame(() => {
    const m = desks.current;
    if (!m) return;
    for (let i = 0; i < 100; i++) m.setMatrixAt(i, deskMatrices[i]);
    m.instanceMatrix.needsUpdate = true;
  });
  const officeGeo = useMemo(() => new RoundedBoxGeometry(OFFICE_W, 0.3, OFFICE_W, 4, 0.14), []);
  const zoneGeo = useMemo(() => new RoundedBoxGeometry(ZONE_W, 0.3, ZONE_D, 4, 0.14), []);
  const teaZ = TEA_Z0 + (ZONE_D - 1.4) / 2;
  const wardZ = WARD_Z0 + (ZONE_D - 1.4) / 2;
  return (
    <>
      <mesh geometry={officeGeo} position={[OFFICE_CX, -0.15, OFFICE_CZ]} receiveShadow>
        <meshStandardMaterial color={TINT.floor} roughness={0.95} />
      </mesh>
      <mesh geometry={zoneGeo} position={[ZONE_CX, -0.15, teaZ]} receiveShadow>
        <meshStandardMaterial color={TINT.butter} roughness={0.95} />
      </mesh>
      <mesh geometry={zoneGeo} position={[ZONE_CX, -0.15, wardZ]} receiveShadow>
        <meshStandardMaterial color={TINT.coral} roughness={0.95} />
      </mesh>
      <instancedMesh ref={desks} args={[deskGeo, undefined, 100]} receiveShadow frustumCulled={false}>
        <meshStandardMaterial color={TINT.desk} roughness={0.9} />
      </instancedMesh>
      <Html position={[OFFICE_CX, 0, OFFICE_Z0 + 9 * CELL + AISLE + 1.2]} center>
        <Pill>辦公區</Pill>
      </Html>
      <Html position={[ZONE_CX, 0, TEA_Z0 - 0.9]} center>
        <Pill>茶水間</Pill>
      </Html>
      <Html position={[ZONE_CX, 0, WARD_Z0 - 0.9]} center>
        <Pill>過勞休養區</Pill>
      </Html>
    </>
  );
}

const SCENE_CENTER = new THREE.Vector3(-1, 0, 0);

/** Pulls the camera back on narrow viewports so the whole floor stays visible. */
function CameraFit() {
  const { camera, size } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  useEffect(() => {
    const d = Math.max(28, 47 / aspect);
    camera.position.set(SCENE_CENTER.x, d * 0.74, d * 0.64);
    camera.lookAt(SCENE_CENTER);
  }, [camera, aspect]);
  return null;
}

export default function Scene3D(props: Props) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* flat = 關閉 tone mapping，粉彩色票才不會被壓暗或變灰 */}
      <Canvas flat shadows camera={{ position: [-1, 21, 21], fov: 45 }} dpr={[1, 2]}>
        {/* three.js 為物理單位：朝上的表面需要約 π 的總照度，白色才會顯示成白色 */}
        <ambientLight intensity={1.25} />
        <hemisphereLight args={['#ffffff', '#eef1f7', 0.9]} />
        <directionalLight position={[8, 18, 10]} intensity={1.15} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005}>
          <orthographicCamera attach="shadow-camera" args={[-20, 20, 14, -14, 1, 60]} />
        </directionalLight>
        <Zones />
        <BacklogPillar {...props} />
        <Agents snapshots={props.snapshots} clock={props.clock} />
        <CameraFit />
        <OrbitControls target={SCENE_CENTER} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
      {props.label && (
        <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-ink shadow-md">
          {props.label}
        </div>
      )}
    </div>
  );
}
