import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentView, WeekSnapshot } from '../sim/index';

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
const zoneSlot = (i: number, z0: number): [number, number] => [ZONE_X0 + (i % 10) * ZONE_CELL, z0 + Math.floor(i / 10) * ZONE_CELL * 0.7];
const ZONE_W = 9 * ZONE_CELL + 1.4;
const ZONE_D = 9 * ZONE_CELL * 0.7 + 1.4;
const ZONE_CX = ZONE_X0 + (9 * ZONE_CELL) / 2;

const TASK_SCALE = 0.12; // world units per backlog task
const BODY_Y = 0.55;

const ROLE_COLOR: Record<AgentView['role'], THREE.Color> = {
  LOW_THRESHOLD: new THREE.Color('#3b82f6'),
  HIGH_THRESHOLD: new THREE.Color('#facc15'),
  TRUE_SLACKER: new THREE.Color('#a855f7'),
};
const RED = new THREE.Color('#ef4444');
const STAM_LOW = new THREE.Color('#ef4444');
const STAM_HIGH = new THREE.Color('#22c55e');

function target(a: AgentView): [number, number] {
  if (a.state === 'RESTING') return zoneSlot(a.id, TEA_Z0);
  if (a.state === 'BURNOUT') return zoneSlot(a.id, WARD_Z0);
  return deskPos(a.id);
}

const ease = (x: number) => x * x * (3 - 2 * x);

interface Props {
  snapshots: readonly WeekSnapshot[];
  clock: MutableRefObject<PlaybackClock>;
  collapseThreshold: number;
  alertLevel: number;
  label?: string;
}

function Agents({ snapshots, clock }: Pick<Props, 'snapshots' | 'clock'>) {
  const n = snapshots[0].agents.length;
  const bodies = useRef<THREE.InstancedMesh>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock: c }) => {
    const b = bodies.current;
    const s = bars.current;
    if (!b || !s) return;
    const time = c.elapsedTime;
    const last = snapshots.length - 1;
    const t = Math.min(Math.max(clock.current.t, 0), last);
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, last);
    const f = ease(t - i0);
    const A = snapshots[i0].agents;
    const B = snapshots[i1].agents;
    for (let i = 0; i < n; i++) {
      const a = A[i];
      const z = B[i];
      const [ax, az] = target(a);
      const [bx, bz] = target(z);
      const x = ax + (bx - ax) * f;
      const zz = az + (bz - az) * f;
      const cur = f < 0.5 ? a : z;
      const bounce = cur.state === 'WORKING' ? Math.abs(Math.sin(time * 9 + i * 1.7)) * 0.18 : 0;
      const downA = a.state === 'BURNOUT' ? 1 : 0;
      const downB = z.state === 'BURNOUT' ? 1 : 0;
      const down = downA + (downB - downA) * f;
      tmp.position.set(x, BODY_Y - down * 0.25 + bounce, zz);
      tmp.rotation.set(0, 0, (down * Math.PI) / 2);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      b.setMatrixAt(i, tmp.matrix);

      col.copy(ROLE_COLOR[cur.role]);
      if (cur.state === 'BURNOUT') col.copy(RED).multiplyScalar(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 8)));
      else if (cur.state === 'FAKE_BUSY') col.multiplyScalar(0.55);
      b.setColorAt(i, col);

      const stamina = a.stamina + (z.stamina - a.stamina) * f;
      const w = Math.max(0.02, stamina / 100);
      tmp.position.set(x - (1 - w) * 0.3, 1.45 - down * 0.9 + bounce, zz);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(w, 1, 1);
      tmp.updateMatrix();
      s.setMatrixAt(i, tmp.matrix);
      col.copy(STAM_LOW).lerp(STAM_HIGH, stamina / 100);
      s.setColorAt(i, col);
    }
    b.instanceMatrix.needsUpdate = true;
    s.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (s.instanceColor) s.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, n]} castShadow>
        <capsuleGeometry args={[0.3, 0.38, 6, 14]} />
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={bars} args={[undefined, undefined, n]}>
        <boxGeometry args={[0.6, 0.07, 0.07]} />
        <meshBasicMaterial />
      </instancedMesh>
    </>
  );
}

function BacklogPillar({ snapshots, clock, collapseThreshold, alertLevel }: Omit<Props, 'label'>) {
  const pillar = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock: c }) => {
    const last = snapshots.length - 1;
    const t = Math.min(Math.max(clock.current.t, 0), last);
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, last);
    const f = ease(t - i0);
    const backlog = snapshots[i0].backlog + (snapshots[i1].backlog - snapshots[i0].backlog) * f;
    const h = Math.max(0.02, backlog * TASK_SCALE);
    if (pillar.current) {
      pillar.current.scale.y = h;
      pillar.current.position.y = h / 2;
    }
    const alert = backlog >= alertLevel;
    const blink = alert ? 0.5 + 0.5 * Math.sin(c.elapsedTime * 10) : 0;
    if (mat.current) mat.current.emissiveIntensity = alert ? 0.3 + blink * 0.9 : 0.05;
    if (light.current) light.current.intensity = alert ? 6 + blink * 30 : 0;
    if (ringMat.current) ringMat.current.emissiveIntensity = 0.6 + blink * 1.2;
  });
  const ringY = collapseThreshold * TASK_SCALE;
  return (
    <group position={[PILLAR[0], 0, PILLAR[1]]}>
      <mesh ref={pillar} castShadow>
        <boxGeometry args={[0.9, 1, 0.9]} />
        <meshStandardMaterial ref={mat} color="#f97316" emissive="#ef4444" />
      </mesh>
      <mesh position={[0, ringY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.0, 0.06, 10, 48]} />
        <meshStandardMaterial ref={ringMat} color="#ef4444" emissive="#ef4444" />
      </mesh>
      <mesh position={[0, ringY / 2, 0]}>
        <cylinderGeometry args={[1.0, 1.0, ringY, 32, 1, true]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <pointLight ref={light} position={[0, ringY + 1, 0]} color="#ff2020" distance={18} />
    </group>
  );
}

function Zones() {
  const desks = useRef<THREE.InstancedMesh>(null);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[OFFICE_CX, 0, OFFICE_CZ]} receiveShadow>
        <planeGeometry args={[OFFICE_W, OFFICE_W]} />
        <meshStandardMaterial color="#2a3142" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ZONE_CX, 0.001, TEA_Z0 + (ZONE_D - 1.4) / 2]} receiveShadow>
        <planeGeometry args={[ZONE_W, ZONE_D]} />
        <meshStandardMaterial color="#1f6b45" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ZONE_CX, 0.001, WARD_Z0 + (ZONE_D - 1.4) / 2]} receiveShadow>
        <planeGeometry args={[ZONE_W, ZONE_D]} />
        <meshStandardMaterial color="#4b4f58" />
      </mesh>
      <instancedMesh
        ref={(m) => {
          desks.current = m;
          if (!m) return;
          const o = new THREE.Object3D();
          for (let i = 0; i < 100; i++) {
            const [x, z] = deskPos(i);
            o.position.set(x, 0.05, z + 0.45);
            o.updateMatrix();
            m.setMatrixAt(i, o.matrix);
          }
          m.instanceMatrix.needsUpdate = true;
        }}
        args={[undefined, undefined, 100]}
        receiveShadow
      >
        <boxGeometry args={[0.9, 0.1, 0.35]} />
        <meshStandardMaterial color="#56607a" />
      </instancedMesh>
      <Html position={[OFFICE_CX, 0, OFFICE_Z0 + 9 * CELL + AISLE + 1.2]} center>
        <span className="rounded bg-black/50 px-2 py-0.5 text-xs whitespace-nowrap text-slate-200">辦公區</span>
      </Html>
      <Html position={[ZONE_CX, 0, TEA_Z0 - 0.9]} center>
        <span className="rounded bg-black/50 px-2 py-0.5 text-xs whitespace-nowrap text-emerald-200">茶水間</span>
      </Html>
      <Html position={[ZONE_CX, 0, WARD_Z0 - 0.9]} center>
        <span className="rounded bg-black/50 px-2 py-0.5 text-xs whitespace-nowrap text-slate-300">過勞休養區</span>
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
    // Horizontal fit for ~24 world units of floor; never closer than the default.
    const d = Math.max(32, 40 / aspect);
    camera.position.set(SCENE_CENTER.x, d * 0.72, d * 0.7);
    camera.lookAt(SCENE_CENTER);
  }, [camera, aspect]);
  return null;
}

export default function Scene3D(props: Props) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas shadows camera={{ position: [-1, 21, 21], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={['#12151c']} />
        <hemisphereLight args={['#dbe7ff', '#1a1d26', 0.9]} />
        <directionalLight position={[8, 18, 10]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]}>
          <orthographicCamera attach="shadow-camera" args={[-20, 20, 14, -14, 1, 60]} />
        </directionalLight>
        <Zones />
        <BacklogPillar {...props} />
        <Agents snapshots={props.snapshots} clock={props.clock} />
        <CameraFit />
        <OrbitControls target={SCENE_CENTER} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
      {props.label && (
        <div className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-sm font-medium">
          {props.label}
        </div>
      )}
    </div>
  );
}
