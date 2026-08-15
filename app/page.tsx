"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type AssetKey = "rifle" | "howitzer" | "wall" | "mine" | "barracks";
type AlienKind = "drone" | "spitter" | "brute";

const GRID_W = 24;
const GRID_H = 18;
const TILE = 1.36;
const ASSETS: Record<AssetKey, { name: string; role: string; cost: number; range: number; icon: string; accent: string }> = {
  rifle: { name: "M240 Gun Team", role: "Sustained fire · Anti-swarm", cost: 150, range: 4.7, icon: "⌖", accent: "#9fe870" },
  howitzer: { name: "M777 Howitzer", role: "Heavy shell · Area damage", cost: 350, range: 7.4, icon: "◎", accent: "#ffb45d" },
  wall: { name: "Hesco Wall", role: "600 armor · Supports units", cost: 70, range: 0, icon: "▦", accent: "#d1b98e" },
  mine: { name: "Shock Mine", role: "Proximity · One use", cost: 100, range: 1.35, icon: "⌁", accent: "#ff655f" },
  barracks: { name: "Field Barracks", role: "Click placed barracks · Recruit ¤60", cost: 425, range: 0, icon: "⌂", accent: "#67c8ff" },
};

type Hud = { credits: number; integrity: number; wave: number; enemies: number; kills: number; active: boolean; gameOver: boolean; victory: boolean };
type Cell = { x: number; y: number };
type Structure = { id: number; kind: AssetKey; x: number; y: number; hp: number; maxHp: number; mountedOn?: number; group: THREE.Group; cooldown: number; spawnTimer: number };
type Enemy = { id: number; kind: AlienKind; x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; reward: number; path: Cell[]; index: number; group: THREE.Group; hitFlash: number; attackCooldown: number; pathTimer: number; targetId: number | null; targetType: "marine" | "structure" | "base" };
type Marine = { id: number; x: number; y: number; targetX: number; targetY: number; vx: number; vy: number; hp: number; maxHp: number; cooldown: number; mountedOn?: number; group: THREE.Group };
type Bullet = { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; speed: number; target: number; damage: number; splash: number; color: number };
type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number };

const keyOf = (x: number, y: number) => `${x},${y}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function Battlefield({ selected, onHud, onMessage, apiRef }: { selected: AssetKey; onHud: (h: Hud) => void; onMessage: (s: string) => void; apiRef: React.MutableRefObject<{ start: () => void; restart: () => void; rotate: () => void } | null> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  const callbacks = useRef({ onHud, onMessage });
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { callbacks.current = { onHud, onMessage }; }, [onHud, onMessage]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07120f);
    scene.fog = new THREE.FogExp2(0x07120f, 0.018);
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 180);
    camera.position.set(22, 24, 25);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 17;
    controls.maxDistance = 48;
    controls.maxPolarAngle = Math.PI * 0.43;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.target.set(0, 0, 0);
    controls.enablePan = true;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

    scene.add(new THREE.HemisphereLight(0x9fc9bd, 0x162018, 1.2));
    const sun = new THREE.DirectionalLight(0xffe4c2, 3.8);
    sun.position.set(-14, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -25; sun.shadow.camera.right = 25; sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x55ffb0, 0.9);
    rim.position.set(18, 9, -18);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);
    const heights: number[][] = Array.from({ length: GRID_H }, (_, y) => Array.from({ length: GRID_W }, (_, x) => {
      const rolling = Math.max(0, Math.sin(x * 0.43) + Math.cos(y * 0.55) - 0.5) * 0.25;
      const ridge = Math.max(0, 1 - Math.hypot(x - 14, y - 10) / 5.2) * 0.88;
      const northRise = Math.max(0, 1 - Math.hypot(x - 7, y - 4) / 3.6) * 0.52;
      const raw = rolling + ridge + northRise + 0.04;
      return (x < 3 && y > 14) || (x > 21 && y < 3) ? 0.04 : Math.round(raw / 0.16) * 0.16;
    }));
    const worldPos = (x: number, y: number, lift = 0) => new THREE.Vector3((x - (GRID_W - 1) / 2) * TILE, heights[clamp(Math.round(y), 0, GRID_H - 1)][clamp(Math.round(x), 0, GRID_W - 1)] + lift, (y - (GRID_H - 1) / 2) * TILE);
    const shadowify = (obj: THREE.Object3D) => obj.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = (parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], color: number, rough = 0.8) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: rough < 0.5 ? 0.55 : 0.05 }));
      m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const cyl = (parent: THREE.Object3D, radii: [number, number, number, number], pos: [number, number, number], color: number, rot: [number, number, number] = [0, 0, 0]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(...radii), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3 }));
      m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; parent.add(m); return m;
    };
    const beam = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number) => {
      const mid = a.clone().add(b).multiplyScalar(0.5); const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 7), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      m.position.copy(mid); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; parent.add(m); return m;
    };

    const tileMeshes: THREE.Mesh[] = [];
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const h = heights[y][x];
      const color = new THREE.Color().setHSL(0.29 + ((x * 7 + y * 3) % 5) * 0.006, 0.24, 0.20 + h * 0.035);
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.98, metalness: 0, emissive: 0x000000 });
      const tile = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.045, 0.55 + h, TILE - 0.045), material);
      const p = worldPos(x, y); tile.position.set(p.x, (h - 0.55) / 2, p.z); tile.receiveShadow = true; tile.userData = { x, y, base: color.clone() };
      world.add(tile); tileMeshes.push(tile);
      if ((x * 13 + y * 19) % 17 === 0) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + ((x + y) % 3) * 0.05, 0), new THREE.MeshStandardMaterial({ color: 0x526159, roughness: 1 }));
        rock.scale.setScalar(0.72); rock.position.copy(p).add(new THREE.Vector3(0.3, 0.09, -0.24)); rock.rotation.set(x, y, x + y); rock.castShadow = true; world.add(rock);
      }
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), new THREE.MeshStandardMaterial({ color: 0x0b1713, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.58; ground.receiveShadow = true; scene.add(ground);

    function makeSoldier(scale = 1) {
      const g = new THREE.Group();
      const olive = 0x59694c, fabric = 0x26332d, skinTone = 0xa77b5e, gun = 0x151b1a, boot = 0x171d1b;
      const uniformMat = new THREE.MeshStandardMaterial({ color: olive, roughness: 0.88 });
      const skinMat = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.92 });
      const legPivots: THREE.Group[] = [];

      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.25, 4, 8), uniformMat); torso.position.y = 0.62; torso.scale.set(1.08, 1, 0.82); g.add(torso);
      box(g, [0.34, 0.3, 0.2], [0, 0.63, -0.035], 0x3c4b3d);
      box(g, [0.26, 0.09, 0.055], [0, 0.67, -0.145], 0x687250);
      box(g, [0.3, 0.28, 0.13], [0, 0.62, 0.13], 0x344238);
      box(g, [0.29, 0.13, 0.2], [0, 0.4, 0], fabric);

      for (const side of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(side * 0.095, 0.4, 0); g.add(leg); legPivots.push(leg);
        beam(leg, new THREE.Vector3(), new THREE.Vector3(side * 0.018, -0.2, 0.015), 0.065, fabric);
        beam(leg, new THREE.Vector3(side * 0.018, -0.2, 0.015), new THREE.Vector3(side * 0.025, -0.4, -0.025), 0.055, olive);
        const foot = box(leg, [0.115, 0.075, 0.2], [side * 0.025, -0.42, -0.07], boot); foot.rotation.x = -0.08;
      }

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 9), skinMat); head.scale.set(0.88, 1.04, 0.92); head.position.set(0, 0.94, -0.015); g.add(head);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0x3d4c3d, roughness: 0.82 })); helmet.position.set(0, 0.97, 0); g.add(helmet);
      box(g, [0.32, 0.035, 0.12], [0, 0.965, -0.075], 0x344137);
      const visor = box(g, [0.17, 0.045, 0.025], [0, 0.95, -0.12], 0x182321, 0.18); visor.material = new THREE.MeshStandardMaterial({ color: 0x1b2926, metalness: 0.5, roughness: 0.18 });

      const receiver = box(g, [0.11, 0.11, 0.36], [0.13, 0.64, -0.25], gun, 0.24);
      const stock = box(g, [0.12, 0.13, 0.2], [0.13, 0.65, -0.01], 0x2a342f); stock.rotation.x = -0.12;
      beam(g, new THREE.Vector3(0.13, 0.65, -0.41), new THREE.Vector3(0.13, 0.66, -0.73), 0.026, gun);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0.13, 0.66, -0.75); g.add(muzzle);
      beam(g, new THREE.Vector3(-0.18, 0.76, -0.01), new THREE.Vector3(0.06, 0.66, -0.28), 0.055, olive);
      beam(g, new THREE.Vector3(0.18, 0.75, -0.01), new THREE.Vector3(0.16, 0.61, -0.36), 0.055, olive);
      addHand(g, new THREE.Vector3(0.06, 0.66, -0.28)); addHand(g, new THREE.Vector3(0.16, 0.61, -0.36));

      function addHand(parent: THREE.Object3D, position: THREE.Vector3) {
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skinMat); hand.position.copy(position); parent.add(hand);
      }
      g.userData.legs = legPivots; g.userData.muzzle = muzzle;
      g.scale.setScalar(scale); shadowify(g); return g;
    }
    function makeRifleTeam() {
      const g = new THREE.Group();
      const bags = 0xa48b61;
      for (let i = -2; i <= 2; i++) cyl(g, [0.16, 0.2, 0.48, 8], [i * 0.3, 0.2, -0.15], bags, [0, 0, Math.PI / 2]);
      const a = makeSoldier(0.92); a.position.set(-0.42, 0.22, 0.35); a.rotation.y = -0.28; g.add(a);
      const b = makeSoldier(0.92); b.position.set(0.46, 0.22, 0.4); b.rotation.y = 0.08; g.add(b);
      box(g, [0.17, 0.18, 0.5], [0, 0.61, -0.22], 0x202724, 0.22);
      beam(g, new THREE.Vector3(0, 0.62, -0.44), new THREE.Vector3(0, 0.64, -1.2), 0.034, 0x151b19);
      cyl(g, [0.055, 0.055, 0.13, 8], [0, 0.64, -1.24], 0x121716, [Math.PI / 2, 0, 0]);
      beam(g, new THREE.Vector3(0, 0.55, -0.1), new THREE.Vector3(-0.38, 0.1, -0.38), 0.03, 0x252d29);
      beam(g, new THREE.Vector3(0, 0.55, -0.1), new THREE.Vector3(0.38, 0.1, -0.38), 0.03, 0x252d29);
      beam(g, new THREE.Vector3(0, 0.55, -0.1), new THREE.Vector3(0, 0.1, 0.3), 0.03, 0x252d29);
      box(g, [0.32, 0.3, 0.28], [0.28, 0.34, -0.18], 0x5d6244); box(g, [0.25, 0.12, 0.22], [0.28, 0.56, -0.18], 0xb48d42);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.64, -1.31); g.add(muzzle); g.userData.muzzle = muzzle;
      return g;
    }
    function makeHowitzer() {
      const g = new THREE.Group();
      box(g, [0.72, 0.16, 1.1], [0, 0.22, 0.12], 0x4e5d49);
      beam(g, new THREE.Vector3(-0.45, 0.34, 0), new THREE.Vector3(0.45, 0.34, 0), 0.1, 0x303a35);
      for (const x of [-0.5, 0.5]) {
        cyl(g, [0.34, 0.34, 0.18, 18], [x, 0.35, 0.05], 0x171c1b, [0, 0, Math.PI / 2]);
        cyl(g, [0.14, 0.14, 0.19, 12], [x, 0.35, 0.05], 0x667064, [0, 0, Math.PI / 2]);
      }
      cyl(g, [0.22, 0.22, 0.5, 14], [0, 0.66, -0.08], 0x596952, [0, 0, Math.PI / 2]);
      box(g, [1.04, 0.72, 0.1], [0, 0.7, -0.04], 0x53604f);
      box(g, [0.42, 0.22, 0.12], [0, 0.72, -0.22], 0x3b4640);
      const breech = new THREE.Vector3(0, 0.77, -0.18), barrelStart = new THREE.Vector3(0, 0.86, -0.35), muzzlePoint = new THREE.Vector3(0, 1.34, -1.58);
      beam(g, breech, barrelStart, 0.135, 0x3d4842); beam(g, barrelStart, muzzlePoint, 0.085, 0x465549);
      beam(g, new THREE.Vector3(0, 1.28, -1.42), new THREE.Vector3(0, 1.38, -1.68), 0.12, 0x303934);
      for (const x of [-0.26, 0.26]) {
        beam(g, new THREE.Vector3(x, 0.24, 0.35), new THREE.Vector3(x * 1.7, 0.1, 1.18), 0.065, 0x3d493d);
        box(g, [0.32, 0.12, 0.28], [x * 1.72, 0.09, 1.23], 0x303a35);
      }
      const muzzle = new THREE.Object3D(); muzzle.position.copy(muzzlePoint).add(new THREE.Vector3(0, 0.05, -0.13)); g.add(muzzle); g.userData.muzzle = muzzle;
      return g;
    }
    function makeWall() {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        const cage = box(g, [0.58, 0.72, 1.65], [i * 0.59, 0.38, 0], 0xb2a284);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cage.geometry), new THREE.LineBasicMaterial({ color: 0x615b4e, transparent: true, opacity: 0.65 })); cage.add(edges);
      }
      return g;
    }
    function makeMine() {
      const g = new THREE.Group();
      cyl(g, [0.5, 0.58, 0.12, 16], [0, 0.08, 0], 0x29342f);
      cyl(g, [0.14, 0.2, 0.07, 12], [0, 0.17, 0], 0x8f2d25);
      const lamp = new THREE.PointLight(0xff3e32, 1.3, 2.3); lamp.position.y = 0.25; g.add(lamp); return g;
    }
    function makeBarracks() {
      const g = new THREE.Group();
      box(g, [1.68, 0.95, 1.48], [0, 0.52, 0], 0x556554);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.93, 1.5, 4), new THREE.MeshStandardMaterial({ color: 0x3c4c40, roughness: 0.92 })); roof.rotation.set(0, 0, Math.PI / 2); roof.position.y = 1.05; roof.castShadow = true; g.add(roof);
      box(g, [0.48, 0.71, 0.04], [0, 0.38, -0.76], 0x151d1a);
      box(g, [0.45, 0.35, 0.45], [1, 0.18, 0.42], 0x7c6844); box(g, [0.34, 0.3, 0.34], [0.88, 0.15, -0.31], 0x8a744b);
      cyl(g, [0.025, 0.025, 1.25, 7], [0.63, 1.55, 0.3], 0x9aa59d); return g;
    }
    function makeAlien(kind: AlienKind) {
      const g = new THREE.Group();
      const bodyRig = new THREE.Group(); g.add(bodyRig);
      const legs: THREE.Group[] = [], legPhases: number[] = [];
      const brute = kind === "brute", spitter = kind === "spitter";
      const shellColor = brute ? 0x673832 : spitter ? 0x28654b : 0x334d42;
      const skinColor = brute ? 0x2c1c1b : spitter ? 0x172e25 : 0x192a24;
      const glowColor = spitter ? 0x63ff9f : 0xff503f;
      const shell = new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.48, metalness: 0.18 });
      const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.82 });
      const glow = new THREE.MeshBasicMaterial({ color: glowColor });

      const addOrb = (parent: THREE.Object3D, radius: number, position: [number, number, number], scale: [number, number, number], material: THREE.Material) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material); mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
      };
      const addLeg = (side: number, z: number, phase: number, upper: number, lower: number, thickness: number, rootY: number) => {
        const pivot = new THREE.Group(); pivot.position.set(side * 0.34, rootY, z); g.add(pivot);
        const knee = new THREE.Vector3(side * upper, -0.13, side * 0.03);
        const foot = new THREE.Vector3(side * (upper + lower), -rootY + 0.055, -0.08);
        beam(pivot, new THREE.Vector3(), knee, thickness, shellColor);
        beam(pivot, knee, foot, thickness * 0.72, skinColor);
        const claw = new THREE.Mesh(new THREE.ConeGeometry(thickness * 1.25, 0.2, 6), skin); claw.position.copy(foot).add(new THREE.Vector3(0, 0.025, -0.09)); claw.rotation.x = -Math.PI / 2; pivot.add(claw);
        legs.push(pivot); legPhases.push(phase);
      };
      const addEye = (x: number, y: number, z: number, radius: number) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), glow); eye.position.set(x, y, z); bodyRig.add(eye);
      };
      const addSpine = (x: number, y: number, z: number, size: number, color = shellColor) => {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(size * 0.34, size, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.55 })); spine.position.set(x, y, z); bodyRig.add(spine);
      };

      if (kind === "drone") {
        addOrb(bodyRig, 0.42, [0, 0.42, 0.18], [0.9, 0.56, 1.35], shell);
        addOrb(bodyRig, 0.3, [0, 0.37, -0.42], [1.05, 0.62, 0.9], skin);
        addOrb(bodyRig, 0.19, [0, 0.33, -0.7], [1.18, 0.56, 0.95], shell);
        for (const side of [-1, 1]) {
          addEye(side * 0.105, 0.38, -0.85, 0.045);
          const mandible = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.38, 6), skin); mandible.position.set(side * 0.13, 0.26, -0.91); mandible.rotation.set(-Math.PI / 2, 0, side * 0.2); bodyRig.add(mandible);
        }
        [-0.25, 0.08, 0.38].forEach((z, i) => { addLeg(-1, z, i * Math.PI * 0.72, 0.42, 0.34, 0.045, 0.38); addLeg(1, z, Math.PI + i * Math.PI * 0.72, 0.42, 0.34, 0.045, 0.38); });
        [-0.05, 0.22, 0.48].forEach((z, i) => addSpine(0, 0.77 - i * 0.035, z, 0.22 - i * 0.025));
      } else if (kind === "spitter") {
        const sac = addOrb(bodyRig, 0.48, [0, 0.62, 0.35], [0.88, 0.9, 1.35], new THREE.MeshStandardMaterial({ color: 0x2f9861, emissive: 0x145e39, emissiveIntensity: 1.1, roughness: 0.32, transparent: true, opacity: 0.92 }));
        addOrb(bodyRig, 0.4, [0, 0.72, -0.28], [1.12, 0.82, 1.05], shell);
        addOrb(bodyRig, 0.27, [0, 0.67, -0.72], [1.22, 0.68, 1.05], skin);
        for (const side of [-1, 1]) { addEye(side * 0.12, 0.71, -0.93, 0.055); addEye(side * 0.2, 0.67, -0.86, 0.035); }
        [-0.3, 0.18, 0.48].forEach((z, i) => { addLeg(-1, z, i * Math.PI * 0.8, 0.5, 0.45, 0.05, 0.56); addLeg(1, z, Math.PI + i * Math.PI * 0.8, 0.5, 0.45, 0.05, 0.56); });
        for (const z of [-0.32, -0.05, 0.22]) addSpine(0, 1.12, z, 0.3, 0x3f9e70);
        const mouthGlow = new THREE.PointLight(0x55ff99, 1.6, 2.6); mouthGlow.position.set(0, 0.61, -0.96); bodyRig.add(mouthGlow); sac.userData.pulse = true;
      } else {
        addOrb(bodyRig, 0.68, [0, 1.0, 0.12], [1.15, 0.94, 1.35], shell);
        addOrb(bodyRig, 0.54, [0, 0.88, -0.7], [1.32, 0.78, 1.08], skin);
        addOrb(bodyRig, 0.36, [0, 0.78, -1.12], [1.38, 0.72, 1.0], shell);
        for (const side of [-1, 1]) {
          addEye(side * 0.17, 0.83, -1.43, 0.065);
          const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 7), new THREE.MeshStandardMaterial({ color: 0xc6b78e, roughness: 0.78 })); tusk.position.set(side * 0.33, 0.7, -1.47); tusk.rotation.set(-Math.PI / 2, 0, side * 0.28); bodyRig.add(tusk);
        }
        [-0.42, 0.42].forEach((z, i) => { addLeg(-1, z, i * Math.PI, 0.58, 0.48, 0.1, 0.72); addLeg(1, z, Math.PI + i * Math.PI, 0.58, 0.48, 0.1, 0.72); });
        [-0.42, -0.08, 0.26, 0.56].forEach((z, i) => addSpine(0, 1.66 - i * 0.05, z, 0.44 - i * 0.045, 0x8a4c3f));
        for (const side of [-1, 1]) addOrb(bodyRig, 0.25, [side * 0.6, 1.12, -0.2], [1.2, 0.7, 1], shell);
      }

      const classScale = brute ? 1.42 : spitter ? 1.08 : 0.82;
      g.scale.setScalar(classScale * (0.94 + Math.random() * 0.12));
      g.userData.legs = legs; g.userData.legPhases = legPhases; g.userData.bodyRig = bodyRig; g.userData.kind = kind;
      shadowify(g); return g;
    }
    function makeBase() {
      const g = new THREE.Group();
      cyl(g, [1.5, 1.68, 0.35, 12], [0, 0.18, 0], 0x3b4944);
      box(g, [1.9, 0.82, 1.5], [0, 0.72, 0], 0x52605b);
      box(g, [0.64, 0.58, 0.05], [0, 0.65, -0.78], 0x151d1b);
      cyl(g, [0.08, 0.08, 2.1, 8], [0, 2, 0], 0x6c7b74);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), new THREE.MeshBasicMaterial({ color: 0x76ffac })); beacon.position.y = 3.08; g.add(beacon);
      const light = new THREE.PointLight(0x66ffad, 2, 7); light.position.y = 2.8; g.add(light);
      shadowify(g); return g;
    }

    const baseCell = { x: 1, y: 16 }, spawnCell = { x: 23, y: 1 };
    const base = makeBase(); base.position.copy(worldPos(baseCell.x, baseCell.y)); base.rotation.y = 0.55; world.add(base);
    const spawnBeacon = new THREE.Group();
    const portal = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.08, 10, 30), new THREE.MeshStandardMaterial({ color: 0x6f1827, emissive: 0x7f0d26, emissiveIntensity: 2 })); portal.rotation.x = Math.PI / 2; portal.position.y = 0.18; spawnBeacon.add(portal);
    const portalLight = new THREE.PointLight(0xff234c, 3, 7); portalLight.position.y = 0.35; spawnBeacon.add(portalLight); spawnBeacon.position.copy(worldPos(spawnCell.x, spawnCell.y)); world.add(spawnBeacon);

    const STRUCTURE_HP: Record<AssetKey, number> = { rifle: 190, howitzer: 300, wall: 600, mine: 45, barracks: 500 };
    function attachHealthBar(group: THREE.Group, y = 1.75) {
      const bar = new THREE.Group();
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.12), new THREE.MeshBasicMaterial({ color: 0x190d0c, depthTest: false, transparent: true, opacity: 0.92 })); back.renderOrder = 30; bar.add(back);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.072), new THREE.MeshBasicMaterial({ color: 0x7dff79, depthTest: false })); fill.position.z = 0.012; fill.renderOrder = 31; bar.add(fill);
      bar.position.copy(group.position).add(new THREE.Vector3(0, y * group.scale.y, 0)); world.add(bar); group.userData.healthBar = bar; group.userData.healthFill = fill; group.userData.healthOffset = y * group.scale.y;
    }
    function setHealthVisual(group: THREE.Group, hp: number, maxHp: number) {
      const ratio = clamp(Number.isFinite(hp / maxHp) ? hp / maxHp : 0, 0, 1); const fill = group.userData.healthFill as THREE.Mesh | undefined;
      if (fill) { fill.scale.x = Math.max(0.001, ratio); fill.position.x = -0.55 * (1 - ratio); (fill.material as THREE.MeshBasicMaterial).color.setHex(ratio > 0.55 ? 0x7dff79 : ratio > 0.25 ? 0xffbd55 : 0xff5249); }
    }
    function syncHealthBar(group: THREE.Group) {
      const bar = group.userData.healthBar as THREE.Group | undefined; if (!bar) return; bar.position.copy(group.position).add(new THREE.Vector3(0, group.userData.healthOffset as number, 0)); bar.quaternion.copy(camera.quaternion);
    }
    function removeHealthBar(group: THREE.Group) {
      const bar = group.userData.healthBar as THREE.Group | undefined; if (bar) world.remove(bar); group.userData.healthBar = undefined; group.userData.healthFill = undefined;
    }
    let credits = 750, integrity = 100, wave = 0, kills = 0, active = false, gameOver = false, victory = false;
    let spawnLeft = 0, spawnTimer = 0, nextId = 1, elapsed = 0, lastHud = -1;
    let structures: Structure[] = [], enemies: Enemy[] = [], marines: Marine[] = [], bullets: Bullet[] = [], particles: Particle[] = [];
    const selectedMarines = new Set<number>();
    const blocked = () => new Set(structures.filter(s => s.kind !== "mine" && !s.mountedOn).map(s => keyOf(s.x, s.y)));
    function findPathTo(sx: number, sy: number, target: Cell, extra?: Cell): Cell[] {
      const ban = blocked(); if (extra) ban.add(keyOf(extra.x, extra.y));
      const start = { x: clamp(Math.round(sx), 0, GRID_W - 1), y: clamp(Math.round(sy), 0, GRID_H - 1) };
      const goal = { x: clamp(Math.round(target.x), 0, GRID_W - 1), y: clamp(Math.round(target.y), 0, GRID_H - 1) }; ban.delete(keyOf(start.x, start.y)); ban.delete(keyOf(goal.x, goal.y));
      const queue: Cell[] = [start], prev = new Map<string, string>(); prev.set(keyOf(start.x, start.y), "");
      for (let qi = 0; qi < queue.length; qi++) {
        const cur = queue[qi]; if (cur.x === goal.x && cur.y === goal.y) break;
        const next = [{ x: cur.x + 1, y: cur.y }, { x: cur.x - 1, y: cur.y }, { x: cur.x, y: cur.y + 1 }, { x: cur.x, y: cur.y - 1 }];
        next.sort((a, b) => (Math.abs(a.x - goal.x) + Math.abs(a.y - goal.y)) - (Math.abs(b.x - goal.x) + Math.abs(b.y - goal.y)));
        for (const n of next) if (n.x >= 0 && n.y >= 0 && n.x < GRID_W && n.y < GRID_H && !ban.has(keyOf(n.x, n.y)) && !prev.has(keyOf(n.x, n.y))) { prev.set(keyOf(n.x, n.y), keyOf(cur.x, cur.y)); queue.push(n); }
      }
      const endKey = keyOf(goal.x, goal.y); if (!prev.has(endKey)) return [];
      const out: Cell[] = []; let k = endKey;
      while (k) { const [x, y] = k.split(",").map(Number); out.push({ x, y }); k = prev.get(k) || ""; }
      return out.reverse();
    }
    const findPath = (sx: number, sy: number, extra?: Cell) => findPathTo(sx, sy, baseCell, extra);
    function emitHud(force = false) {
      if (!force && elapsed - lastHud < 0.12) return; lastHud = elapsed;
      callbacks.current.onHud({ credits, integrity, wave, enemies: enemies.length + spawnLeft, kills, active, gameOver, victory });
    }
    function message(text: string) { callbacks.current.onMessage(text); }
    function addStructure(kind: AssetKey, x: number, y: number, free = false, mountedOn?: number) {
      const group = kind === "rifle" ? makeRifleTeam() : kind === "howitzer" ? makeHowitzer() : kind === "wall" ? makeWall() : kind === "mine" ? makeMine() : makeBarracks();
      const mountCount = mountedOn ? structures.filter(s => s.mountedOn === mountedOn).length : 0; group.position.copy(worldPos(x + (mountedOn ? (mountCount - 1) * 0.26 : 0), y, mountedOn ? 0.62 : 0)); group.rotation.y = kind === "wall" ? Math.PI / 2 : -0.35; group.scale.multiplyScalar(mountedOn ? 0.58 : 0.72); attachHealthBar(group, kind === "wall" ? 1.25 : kind === "barracks" ? 2 : 1.65); world.add(group);
      const maxHp = STRUCTURE_HP[kind]; structures.push({ id: nextId++, kind, x, y, hp: maxHp, maxHp, mountedOn, group, cooldown: Math.random(), spawnTimer: 0 });
      if (!free) credits -= ASSETS[kind].cost;
    }
    addStructure("barracks", 3, 14, true); addStructure("rifle", 6, 14, true); addStructure("wall", 4, 15, true); addStructure("howitzer", 8, 15, true); spawnMarine(3, 13); spawnMarine(4, 14);

    function tryPlace(x: number, y: number) {
      const kind = selectedRef.current, asset = ASSETS[kind];
      if (gameOver) return;
      if (credits < asset.cost) return message("INSUFFICIENT COMMAND CREDITS");
      const wall = structures.find(s => s.kind === "wall" && s.x === x && s.y === y);
      const canMount = !!wall && (kind === "rifle" || kind === "howitzer");
      if ((x === baseCell.x && y === baseCell.y) || (x === spawnCell.x && y === spawnCell.y) || (structures.some(s => s.x === x && s.y === y) && !canMount)) return message(wall ? "WALL POSITION ALREADY OCCUPIED" : "DEPLOYMENT ZONE OCCUPIED");
      if (wall && !canMount) return message("ONLY RIFLE TEAMS OR ARTILLERY CAN MOUNT WALLS");
      if (kind !== "mine" && !canMount && !findPath(spawnCell.x, spawnCell.y, { x, y }).length) return message("FORTIFICATION WOULD SEAL THE EVACUATION CORRIDOR");
      addStructure(kind, x, y, false, canMount ? wall?.id : undefined);
      if (kind !== "mine" && !canMount) enemies.forEach(e => { e.pathTimer = 0; e.index = 0; });
      message(`${asset.name.toUpperCase()} ${canMount ? "MOUNTED ON WALL" : "DEPLOYED"} · ELEVATION ${Math.round((heights[y][x] + (canMount ? 0.62 : 0)) * 100)}M`); emitHud(true);
    }
    function destroyStructure(s: Structure, salvaged = false) {
      if (!structures.includes(s)) return;
      if (s.kind === "wall") {
        structures.filter(other => other.mountedOn === s.id).forEach(other => { burst(other.group.position, 0xff794f, 10); removeHealthBar(other.group); world.remove(other.group); structures.splice(structures.indexOf(other), 1); });
        marines.filter(m => m.mountedOn === s.id).forEach(m => { m.mountedOn = undefined; m.hp = Math.max(0, m.hp - 35); setHealthVisual(m.group, m.hp, m.maxHp); m.targetX = clamp(m.x + 1, 0, GRID_W - 1); m.targetY = m.y; });
      }
      if (salvaged) credits += Math.floor(ASSETS[s.kind].cost * 0.6);
      burst(s.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), salvaged ? 0x9dff8b : 0xff553f, salvaged ? 5 : 15);
      removeHealthBar(s.group); world.remove(s.group); structures.splice(structures.indexOf(s), 1);
      enemies.forEach(e => { e.pathTimer = 0; e.index = 0; });
    }
    function removeStructureAt(x: number, y: number) {
      const s = structures.filter(item => item.x === x && item.y === y).sort((a, b) => Number(!!b.mountedOn) - Number(!!a.mountedOn))[0]; if (!s) return;
      destroyStructure(s, true);
      message(`${ASSETS[s.kind].name.toUpperCase()} SALVAGED · +${Math.floor(ASSETS[s.kind].cost * 0.6)} CREDITS`); emitHud(true);
    }
    function spawnMarine(x: number, y: number, mountedOn?: number) {
      const m = makeSoldier(1.12); m.position.copy(worldPos(x, y, mountedOn ? 0.62 : 0));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 24), new THREE.MeshBasicMaterial({ color: 0x7dff92, transparent: true, opacity: 0.95, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; ring.visible = false; m.add(ring); m.userData.selectionRing = ring;
      attachHealthBar(m, 1.22); world.add(m); const id = nextId++;
      marines.push({ id, x, y, targetX: x, targetY: y, vx: 0, vy: 0, hp: 100, maxHp: 100, cooldown: 0, mountedOn, group: m }); return id;
    }
    function refreshSelection() {
      marines.forEach(m => { const ring = m.group.userData.selectionRing as THREE.Mesh; if (ring) ring.visible = selectedMarines.has(m.id); });
    }
    function selectMarineAt(x: number, y: number, additive = false) {
      const clicked = marines.filter(m => Math.hypot(m.x - x, m.y - y) < 0.62).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (!clicked) { if (!additive) { selectedMarines.clear(); refreshSelection(); } return false; }
      if (!additive) selectedMarines.clear(); if (additive && selectedMarines.has(clicked.id)) selectedMarines.delete(clicked.id); else selectedMarines.add(clicked.id); refreshSelection();
      message(`${selectedMarines.size} SOLDIER${selectedMarines.size === 1 ? "" : "S"} SELECTED · RIGHT-CLICK TO MOVE`); return true;
    }
    function commandFormation(x: number, y: number) {
      const squad = marines.filter(m => selectedMarines.has(m.id)); if (!squad.length) return false;
      const cx = squad.reduce((sum, m) => sum + m.x, 0) / squad.length, cy = squad.reduce((sum, m) => sum + m.y, 0) / squad.length;
      const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1, px = -dy / len, py = dx / len; const spacing = 0.72;
      const wall = structures.find(s => s.kind === "wall" && s.x === x && s.y === y);
      squad.forEach((m, i) => { const offset = (i - (squad.length - 1) / 2) * spacing; m.targetX = clamp(x + px * offset, 0, GRID_W - 1); m.targetY = clamp(y + py * offset, 0, GRID_H - 1); m.mountedOn = wall?.id; });
      message(`${squad.length}-SOLDIER LINE FORMATION ${wall ? "ORDERED TO WALL" : "MOVING"}`); return true;
    }
    function recruitAt(x: number, y: number) {
      const barracks = structures.find(s => s.kind === "barracks" && s.x === x && s.y === y); if (!barracks) return false;
      if (credits < 60) { message("RECRUITMENT REQUIRES 60 COMMAND CREDITS"); return true; }
      if (barracks.spawnTimer > 0) { message(`BARRACKS TRAINING · READY IN ${Math.ceil(barracks.spawnTimer)}S`); return true; }
      credits -= 60; const n = marines.length; spawnMarine(clamp(barracks.x + 0.6 + (n % 3) * 0.28, 0, GRID_W - 1), clamp(barracks.y - 0.7 + (n % 2) * 0.45, 0, GRID_H - 1)); barracks.spawnTimer = 3.5; message("RIFLEMAN RECRUITED · DRAG A BOX TO ADD HIM TO A SQUAD"); emitHud(true); return true;
    }
    function spawnEnemy() {
      const roll = Math.random(); const kind: AlienKind = wave >= 4 && roll > 0.78 ? "brute" : wave >= 2 && roll > 0.58 ? "spitter" : "drone";
      const scale = 1 + wave * 0.12; const hp = (kind === "brute" ? 340 : kind === "spitter" ? 125 : 82) * scale;
      const group = makeAlien(kind); const p = worldPos(spawnCell.x, spawnCell.y); group.position.copy(p); attachHealthBar(group, kind === "brute" ? 2.05 : kind === "spitter" ? 1.45 : 1.05); world.add(group);
      enemies.push({ id: nextId++, kind, x: spawnCell.x, y: spawnCell.y, hp, maxHp: hp, speed: (kind === "brute" ? 0.48 : kind === "spitter" ? 0.72 : 0.9) * (1 + wave * 0.018), damage: kind === "brute" ? 18 : kind === "spitter" ? 9 : 6, reward: kind === "brute" ? 65 : kind === "spitter" ? 36 : 24, path: [], index: 0, group, hitFlash: 0, attackCooldown: 0, pathTimer: 0, targetId: null, targetType: "base" });
    }
    function startWave() {
      if (active || gameOver) return;
      if (wave >= 8) { victory = true; gameOver = true; message("SECTOR SECURED · ALL WAVES REPELLED"); emitHud(true); return; }
      wave++; active = true; spawnLeft = 7 + wave * 3; spawnTimer = 0; message(`WAVE ${String(wave).padStart(2, "0")} INBOUND · ${spawnLeft} LIFE SIGNS`); emitHud(true);
    }
    function burst(at: THREE.Vector3, color: number, count = 10) {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.05, 5, 4), new THREE.MeshBasicMaterial({ color, transparent: true })); mesh.position.copy(at); world.add(mesh);
        particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 2.8, Math.random() * 2.3, (Math.random() - 0.5) * 2.8), life: 0.5 + Math.random() * 0.5, maxLife: 1 });
      }
    }
    function hostileStrike(from: THREE.Vector3, to: THREE.Vector3, color: number, ranged: boolean) {
      const start = from.clone().add(new THREE.Vector3(0, ranged ? 1.15 : 0.85, 0)), end = to.clone().add(new THREE.Vector3(0, 0.58, 0)), mid = start.clone().add(end).multiplyScalar(0.5), length = start.distanceTo(end);
      const trace = new THREE.Mesh(new THREE.CylinderGeometry(ranged ? 0.035 : 0.055, ranged ? 0.055 : 0.02, length, 7), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
      trace.position.copy(mid); trace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); trace.renderOrder = 15; world.add(trace); particles.push({ mesh: trace, velocity: new THREE.Vector3(), life: ranged ? 0.28 : 0.16, maxLife: ranged ? 0.28 : 0.16 });
    }
    function fire(from: THREE.Vector3, target: Enemy, damage: number, splash: number, color: number, heavy = false) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(heavy ? 0.11 : 0.045, 7, 5), new THREE.MeshBasicMaterial({ color })); mesh.position.copy(from); world.add(mesh);
      bullets.push({ mesh, from: from.clone(), to: target.group.position.clone().add(new THREE.Vector3(0, 0.42, 0)), t: 0, speed: heavy ? 1.35 : 4.8, target: target.id, damage, splash, color });
    }
    function damageEnemy(e: Enemy, amount: number) { e.hp = clamp(e.hp - Math.max(0, amount), 0, e.maxHp); e.hitFlash = 0.09; setHealthVisual(e.group, e.hp, e.maxHp); }
    function restart() {
      [...structures, ...enemies, ...marines].forEach(o => { removeHealthBar(o.group); world.remove(o.group); }); bullets.forEach(b => world.remove(b.mesh)); particles.forEach(p => world.remove(p.mesh));
      structures = []; enemies = []; marines = []; bullets = []; particles = []; selectedMarines.clear(); credits = 750; integrity = 100; wave = 0; kills = 0; active = false; gameOver = false; victory = false; spawnLeft = 0;
      addStructure("barracks", 3, 14, true); addStructure("rifle", 6, 14, true); addStructure("wall", 4, 15, true); addStructure("howitzer", 8, 15, true); spawnMarine(3, 13); spawnMarine(4, 14); message("COMMAND SYSTEMS RESET · AWAITING DEPLOYMENT"); emitHud(true);
    }
    function rotate() {
      const offset = camera.position.clone().sub(controls.target); const a = Math.PI / 2;
      camera.position.set(controls.target.x + offset.x * Math.cos(a) - offset.z * Math.sin(a), camera.position.y, controls.target.z + offset.x * Math.sin(a) + offset.z * Math.cos(a)); controls.update();
    }
    apiRef.current = { start: startWave, restart, rotate };

    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), cameraVelocity = new THREE.Vector3(); const heldKeys = new Set<string>(); let hovered: THREE.Mesh | null = null, downX = 0, downY = 0, rightDownX = 0, rightDownY = 0, selecting = false;
    const selectionBox = document.createElement("div"); selectionBox.className = "selection-box"; host.appendChild(selectionBox);
    function pick(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect(); pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(tileMeshes, false)[0]?.object as THREE.Mesh | undefined;
    }
    function onMove(e: PointerEvent) {
      if (selecting) { const r = host.getBoundingClientRect(), x1 = Math.min(downX, e.clientX) - r.left, y1 = Math.min(downY, e.clientY) - r.top; selectionBox.style.display = "block"; selectionBox.style.left = `${x1}px`; selectionBox.style.top = `${y1}px`; selectionBox.style.width = `${Math.abs(e.clientX - downX)}px`; selectionBox.style.height = `${Math.abs(e.clientY - downY)}px`; return; }
      const tile = pick(e); if (hovered && hovered !== tile) (hovered.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      hovered = tile || null; if (hovered) (hovered.material as THREE.MeshStandardMaterial).emissive.setHex(0x16452e);
    }
    function onDown(e: PointerEvent) { if (e.button === 2) { rightDownX = e.clientX; rightDownY = e.clientY; } if (e.button === 0) { downX = e.clientX; downY = e.clientY; selecting = true; controls.enabled = false; e.stopImmediatePropagation(); } }
    function onUp(e: PointerEvent) {
      if (e.button !== 0) return; e.stopImmediatePropagation(); const drag = Math.hypot(e.clientX - downX, e.clientY - downY); selecting = false; controls.enabled = true; selectionBox.style.display = "none";
      if (drag > 5) {
        const minX = Math.min(downX, e.clientX), maxX = Math.max(downX, e.clientX), minY = Math.min(downY, e.clientY), maxY = Math.max(downY, e.clientY), r = renderer.domElement.getBoundingClientRect(); if (!e.shiftKey) selectedMarines.clear();
        marines.forEach(m => { const p = m.group.getWorldPosition(new THREE.Vector3()).project(camera), sx = r.left + (p.x + 1) * r.width / 2, sy = r.top + (-p.y + 1) * r.height / 2; if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selectedMarines.add(m.id); }); refreshSelection(); message(`${selectedMarines.size} SOLDIERS BOX-SELECTED · RIGHT-CLICK TO FORM A LINE`); return;
      }
      const tile = pick(e); if (!tile) return; const x = tile.userData.x, y = tile.userData.y; if (recruitAt(x, y)) return; if (selectMarineAt(x, y, e.shiftKey)) return; if (!selectedMarines.size) tryPlace(x, y);
    }
    function onContext(e: MouseEvent) { e.preventDefault(); if (Math.hypot(e.clientX - rightDownX, e.clientY - rightDownY) > 6) return; const tile = pick(e as PointerEvent); if (!tile) return; if (e.shiftKey) removeStructureAt(tile.userData.x, tile.userData.y); else if (!commandFormation(tile.userData.x, tile.userData.y)) message("SELECT SOLDIERS WITH A CLICK OR DRAG BOX FIRST"); }
    function onKey(e: KeyboardEvent) { heldKeys.add(e.key.toLowerCase()); if (e.key.toLowerCase() === "r") rotate(); if (e.key === "Escape") { selectedMarines.clear(); refreshSelection(); } if (e.code === "Space") { e.preventDefault(); startWave(); } }
    function onKeyUp(e: KeyboardEvent) { heldKeys.delete(e.key.toLowerCase()); }
    renderer.domElement.addEventListener("pointermove", onMove, true); renderer.domElement.addEventListener("pointerdown", onDown, true); renderer.domElement.addEventListener("pointerup", onUp, true); renderer.domElement.addEventListener("contextmenu", onContext); window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);

    function turnToward(group: THREE.Group, angle: number, speed: number, dt: number) {
      const delta = Math.atan2(Math.sin(angle - group.rotation.y), Math.cos(angle - group.rotation.y));
      group.rotation.y += delta * Math.min(1, speed * dt);
    }

    function update(dt: number) {
      elapsed += dt; portal.rotation.z += dt * 0.7;
      const forward = controls.target.clone().sub(camera.position); forward.y = 0; forward.normalize(); const right = new THREE.Vector3(-forward.z, 0, forward.x); const intent = new THREE.Vector3();
      if (heldKeys.has("w")) intent.add(forward); if (heldKeys.has("s")) intent.sub(forward); if (heldKeys.has("d")) intent.add(right); if (heldKeys.has("a")) intent.sub(right);
      if (intent.lengthSq()) cameraVelocity.addScaledVector(intent.normalize(), dt * 25); cameraVelocity.multiplyScalar(Math.exp(-dt * 5.2));
      const cameraStep = cameraVelocity.clone().multiplyScalar(dt); camera.position.add(cameraStep); controls.target.add(cameraStep); controls.target.x = clamp(controls.target.x, -15, 15); controls.target.z = clamp(controls.target.z, -11, 11);
      if (active && spawnLeft > 0) { spawnTimer -= dt; if (spawnTimer <= 0) { spawnEnemy(); spawnLeft--; spawnTimer = Math.max(0.35, 1.2 - wave * 0.07); } }
      for (const e of enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt); e.attackCooldown -= dt; e.pathTimer -= dt;
        const closestMarine = marines.map(m => ({ type: "marine" as const, id: m.id, x: m.x, y: m.y, group: m.group, marine: m, d: Math.hypot(m.x - e.x, m.y - e.y) })).sort((a, b) => a.d - b.d)[0];
        const closestEmplacement = structures.filter(s => s.kind === "rifle" || s.kind === "howitzer").map(s => ({ type: "structure" as const, id: s.id, x: s.x, y: s.y, group: s.group, structure: s, d: Math.hypot(s.x - e.x, s.y - e.y) })).sort((a, b) => a.d - b.d)[0];
        const combatTarget = closestMarine && closestEmplacement ? (closestMarine.d <= closestEmplacement.d ? closestMarine : closestEmplacement) : closestMarine || closestEmplacement;
        const targetType = combatTarget?.type ?? "base", targetId = combatTarget?.id ?? null, tx = combatTarget?.x ?? baseCell.x, ty = combatTarget?.y ?? baseCell.y;
        const targetChanged = e.targetType !== targetType || e.targetId !== targetId; e.targetType = targetType; e.targetId = targetId;
        if (targetChanged || e.pathTimer <= 0 || !e.path.length) { e.path = findPathTo(e.x, e.y, { x: tx, y: ty }); e.index = 0; e.pathTimer = targetType === "marine" ? 0.28 : 0.75; }
        const targetDistance = Math.hypot(tx - e.x, ty - e.y), attackRange = e.kind === "spitter" ? 3.1 : e.kind === "brute" ? 1.7 : 1.45;
        let isMoving = false, isAttacking = false;
        if (combatTarget && targetDistance <= attackRange) {
          isAttacking = true; e.group.rotation.y = Math.atan2(-(tx - e.x), -(ty - e.y));
          if (e.attackCooldown <= 0) {
            const hit = e.damage * (e.kind === "brute" ? 1.45 : 1); const targetPos = combatTarget.group.position;
            hostileStrike(e.group.position, targetPos, e.kind === "spitter" ? 0x58ff9a : e.kind === "brute" ? 0xff493c : 0xff8b52, e.kind === "spitter");
            if (combatTarget.type === "structure") { const s = combatTarget.structure; s.hp = clamp(s.hp - hit, 0, s.maxHp); setHealthVisual(s.group, s.hp, s.maxHp); if (s.hp <= 0) { message(`${ASSETS[s.kind].name.toUpperCase()} DESTROYED BY HOSTILES`); destroyStructure(s); } }
            else { const m = combatTarget.marine; m.hp = clamp(m.hp - hit, 0, m.maxHp); setHealthVisual(m.group, m.hp, m.maxHp); }
            burst(targetPos.clone().add(new THREE.Vector3(0, 0.55, 0)), e.kind === "spitter" ? 0x65ffac : 0xff694d, e.kind === "brute" ? 8 : 4); e.attackCooldown = e.kind === "brute" ? 1.35 : e.kind === "spitter" ? 1.15 : 0.82;
          }
        } else {
          const targetCell = e.path[Math.min(e.index + 1, e.path.length - 1)];
          if (targetCell) {
            const dx = targetCell.x - e.x, dy = targetCell.y - e.y, dist = Math.hypot(dx, dy);
            if (dist < 0.025) e.index++; else { const step = Math.min(dist, e.speed * dt); e.x += dx / dist * step; e.y += dy / dist * step; e.group.rotation.y = Math.atan2(-dx, -dy); isMoving = true; }
          }
        }
        const gaitSpeed = e.kind === "brute" ? 4.2 : e.kind === "spitter" ? 7.2 : 11.5;
        const gait = elapsed * gaitSpeed * Math.max(0.65, e.speed) + e.id * 0.73;
        const legs = e.group.userData.legs as THREE.Group[] | undefined;
        const phases = e.group.userData.legPhases as number[] | undefined;
        if (legs) legs.forEach((leg, i) => { leg.rotation.x = Math.sin(gait + (phases?.[i] ?? i * Math.PI)) * (isMoving ? (e.kind === "brute" ? 0.23 : 0.42) : 0.045); });
        const bodyRig = e.group.userData.bodyRig as THREE.Group | undefined;
        if (bodyRig) {
          bodyRig.position.y = Math.sin(gait * 2) * (isMoving ? (e.kind === "brute" ? 0.035 : 0.055) : 0.012);
          bodyRig.position.z = isAttacking ? Math.max(0, Math.sin(gait * 1.4)) * (e.kind === "brute" ? -0.11 : -0.06) : 0;
          bodyRig.rotation.z = Math.sin(gait) * (isMoving ? 0.035 : 0.012);
        }
        const p = worldPos(e.x, e.y); e.group.position.lerp(p, Math.min(1, dt * 12)); e.group.position.y += Math.sin(elapsed * 9 + e.id) * (e.kind === "brute" ? 0.005 : 0.01); syncHealthBar(e.group);
      }
      for (const s of structures) {
        s.cooldown -= dt; syncHealthBar(s.group);
        if (s.kind === "barracks") {
          s.spawnTimer = Math.max(0, s.spawnTimer - dt);
        }
        if (s.kind !== "rifle" && s.kind !== "howitzer") continue;
        const range = ASSETS[s.kind].range + heights[s.y][s.x] * 0.9; const target = enemies.filter(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) <= range).sort((a, b) => b.index - a.index)[0];
        if (target) {
          turnToward(s.group, Math.atan2(-(target.x - s.x), -(target.y - s.y)), s.kind === "howitzer" ? 3.5 : 8, dt);
          if (s.cooldown <= 0) { const muzzle = s.group.userData.muzzle as THREE.Object3D | undefined; const from = muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : s.group.position.clone().add(new THREE.Vector3(0, 1.05, 0)); fire(from, target, s.kind === "howitzer" ? 105 : 5.8, s.kind === "howitzer" ? 1.25 : 0, s.kind === "howitzer" ? 0xffa64d : 0xd6ff81, s.kind === "howitzer"); s.cooldown = s.kind === "howitzer" ? 2.35 : 0.15; }
        }
      }
      for (const m of marines) {
        m.cooldown -= dt; const mdx = m.targetX - m.x, mdy = m.targetY - m.y, moveDist = Math.hypot(mdx, mdy);
        if (moveDist > 0.035) { const accel = 5.2; m.vx += mdx / moveDist * accel * dt; m.vy += mdy / moveDist * accel * dt; const speed = Math.hypot(m.vx, m.vy), max = 1.65; if (speed > max) { m.vx *= max / speed; m.vy *= max / speed; } m.x += m.vx * dt; m.y += m.vy * dt; m.group.rotation.y = Math.atan2(-m.vx, -m.vy); }
        else { m.x = m.targetX; m.y = m.targetY; m.vx *= Math.exp(-dt * 10); m.vy *= Math.exp(-dt * 10); }
        m.vx *= Math.exp(-dt * 3.2); m.vy *= Math.exp(-dt * 3.2); const settledOnWall = m.mountedOn && moveDist < 0.12; m.group.position.lerp(worldPos(m.x, m.y, settledOnWall ? 0.62 : 0), Math.min(1, dt * 14)); syncHealthBar(m.group);
        const soldierLegs = m.group.userData.legs as THREE.Group[] | undefined; if (soldierLegs) soldierLegs.forEach((leg, i) => { leg.rotation.x = moveDist > 0.06 ? Math.sin(elapsed * 11 + i * Math.PI) * 0.5 : 0; });
        const target = enemies.find(e => e.hp > 0 && Math.hypot(e.x - m.x, e.y - m.y) < (settledOnWall ? 4.2 : 3.25));
        if (target) {
          turnToward(m.group, Math.atan2(-(target.x - m.x), -(target.y - m.y)), 10, dt);
          if (m.cooldown <= 0) { const muzzle = m.group.userData.muzzle as THREE.Object3D | undefined; fire(muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : m.group.position.clone().add(new THREE.Vector3(0, 0.72, 0)), target, settledOnWall ? 12 : 9, 0, 0xbaff77); m.cooldown = 0.55; }
        }
      }
      for (const s of [...structures]) if (s.kind === "mine") {
        const target = enemies.find(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < 1.25); if (target) { enemies.forEach(e => { if (Math.hypot(e.x - s.x, e.y - s.y) < 1.75) damageEnemy(e, 145); }); burst(s.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x6ffff3, 25); destroyStructure(s); message("SHOCK MINE DETONATED"); }
      }
      for (const b of [...bullets]) {
        b.t += dt * b.speed; const arc = b.splash ? Math.sin(Math.min(1, b.t) * Math.PI) * 2.2 : 0; b.mesh.position.lerpVectors(b.from, b.to, Math.min(1, b.t)); b.mesh.position.y += arc;
        if (b.t >= 1) { const target = enemies.find(e => e.id === b.target); if (target) { if (b.splash) enemies.forEach(e => { const d = Math.hypot(e.x - target.x, e.y - target.y); if (d <= b.splash) damageEnemy(e, b.damage * (1 - d / (b.splash * 1.8))); }); else damageEnemy(target, b.damage); burst(b.to, b.color, b.splash ? 18 : 4); } world.remove(b.mesh); bullets.splice(bullets.indexOf(b), 1); }
      }
      for (const e of [...enemies]) {
        if (e.hp <= 0) { credits += e.reward; kills++; burst(e.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), e.kind === "spitter" ? 0x58ff96 : 0xff573e, e.kind === "brute" ? 24 : 12); removeHealthBar(e.group); world.remove(e.group); enemies.splice(enemies.indexOf(e), 1); continue; }
        if (e.targetType === "base" && Math.hypot(e.x - baseCell.x, e.y - baseCell.y) < 0.22) { integrity = Math.max(0, integrity - e.damage); burst(base.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4a31, 14); removeHealthBar(e.group); world.remove(e.group); enemies.splice(enemies.indexOf(e), 1); if (integrity <= 0) { gameOver = true; active = false; message("COMMAND POST OVERRUN · SECTOR LOST"); } }
      }
      for (const m of [...marines]) if (m.hp <= 0) { selectedMarines.delete(m.id); burst(m.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xff5f47, 9); removeHealthBar(m.group); world.remove(m.group); marines.splice(marines.indexOf(m), 1); message("RIFLEMAN KILLED IN ACTION"); }
      for (const p of [...particles]) { p.life -= dt; p.velocity.y -= dt * 2.6; p.mesh.position.addScaledVector(p.velocity, dt); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife); if (p.life <= 0) { world.remove(p.mesh); particles.splice(particles.indexOf(p), 1); } }
      if (active && spawnLeft === 0 && enemies.length === 0) { active = false; credits += 125 + wave * 25; if (wave >= 8) { victory = true; gameOver = true; message("SECTOR SECURED · HUMANITY HOLDS THE RIDGE"); } else message(`WAVE ${String(wave).padStart(2, "0")} DESTROYED · RESUPPLY DELIVERED`); }
      emitHud();
    }

    let raf = 0, last = performance.now();
    function animate(now: number) { const dt = Math.min(0.04, (now - last) / 1000); last = now; update(dt); controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(animate); }
    emitHud(true); raf = requestAnimationFrame(animate);
    const resize = () => { camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); renderer.domElement.removeEventListener("pointermove", onMove, true); renderer.domElement.removeEventListener("pointerdown", onDown, true); renderer.domElement.removeEventListener("pointerup", onUp, true); renderer.domElement.removeEventListener("contextmenu", onContext); controls.dispose(); renderer.dispose(); host.removeChild(renderer.domElement); host.removeChild(selectionBox); apiRef.current = null; };
  }, [apiRef]);
  return <div ref={hostRef} className="three-host" aria-label="Interactive 3D battlefield" />;
}

export default function Home() {
  const [selected, setSelected] = useState<AssetKey>("rifle");
  const [hud, setHud] = useState<Hud>({ credits: 750, integrity: 100, wave: 0, enemies: 0, kills: 0, active: false, gameOver: false, victory: false });
  const [message, setMessage] = useState("OPERATION NIGHTFALL · BUILD YOUR PERIMETER");
  const [briefing, setBriefing] = useState(true);
  const apiRef = useRef<{ start: () => void; restart: () => void; rotate: () => void } | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMessage = (text: string) => { setMessage(text); if (messageTimer.current) clearTimeout(messageTimer.current); messageTimer.current = setTimeout(() => setMessage("COMMAND LINK STABLE · RIGHT-CLICK TO SALVAGE"), 4200); };
  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">V</span><div><b>VANGUARD</b><small>EXOPLANETARY DEFENSE COMMAND</small></div></div>
        <div className="stat credits"><small>COMMAND CREDITS</small><strong>{hud.credits.toLocaleString()}</strong></div>
        <div className="stat"><small>DEFENSE INTEGRITY</small><strong className={hud.integrity < 35 ? "danger" : ""}>{hud.integrity}%</strong></div>
        <div className="stat"><small>HOSTILES</small><strong>{String(hud.enemies).padStart(2, "0")}</strong></div>
        <button className="wave-button" disabled={hud.active || hud.gameOver} onClick={() => apiRef.current?.start()}>{hud.active ? `WAVE ${String(hud.wave).padStart(2, "0")} ACTIVE` : hud.gameOver ? "OPERATION ENDED" : `DEPLOY WAVE ${String(hud.wave + 1).padStart(2, "0")}`}</button>
      </header>
      <section className="battlefield">
        <Battlefield selected={selected} onHud={setHud} onMessage={showMessage} apiRef={apiRef} />
        <div className="mission-card"><span>OPERATION NIGHTFALL · SECTOR E-7</span><b>Hold the eastern ridge</b><small>Wave {Math.min(hud.wave + (hud.active ? 0 : 1), 8)} of 8 · {hud.kills} confirmed eliminations</small></div>
        <div className="status-feed"><i />{message}</div>
        <div className="camera-tools"><button onClick={() => apiRef.current?.rotate()} aria-label="Rotate camera">↻</button><span>ORBIT</span></div>
        {briefing && <div className="briefing"><div className="briefing-id">FIELD BRIEFING // 04:38 LOCAL</div><h1>They found the ridge.</h1><p>Drag a selection box around any number of soldiers, then right-click to move them in a straight firing line. Click a placed barracks to recruit for 60 credits. Machine-gun teams and multiple soldiers can hold the same wall.</p><div className="brief-grid"><span><kbd>DRAG BOX</kbd><b>Select a squad</b></span><span><kbd>RIGHT CLICK</kbd><b>Move in line formation</b></span><span><kbd>CLICK BARRACKS</kbd><b>Recruit rifleman</b></span><span><kbd>MIDDLE DRAG</kbd><b>Orbit camera</b></span></div><button onClick={() => setBriefing(false)}>ASSUME COMMAND</button></div>}
        {hud.gameOver && <div className={`end-card ${hud.victory ? "won" : "lost"}`}><small>{hud.victory ? "OPERATION COMPLETE" : "SIGNAL LOST"}</small><h2>{hud.victory ? "THE RIDGE HOLDS" : "COMMAND OVERRUN"}</h2><p>{hud.kills} hostiles eliminated across {hud.wave} waves.</p><button onClick={() => apiRef.current?.restart()}>RESTART OPERATION</button></div>}
      </section>
      <aside className="build-panel">
        <div className="panel-title"><small>FORWARD ENGINEERING</small><b>DEPLOYABLE ASSETS</b></div>
        {(Object.keys(ASSETS) as AssetKey[]).map(key => { const a = ASSETS[key]; return <button key={key} className={`asset ${selected === key ? "active" : ""}`} onClick={() => setSelected(key)} style={{ "--asset-color": a.accent } as React.CSSProperties}><span>{a.icon}</span><div><b>{a.name}</b><small>{a.role}</small></div><em>{a.cost}</em></button>; })}
        <div className="intel"><span>FIELD INTEL</span><p>Box-select soldiers and right-click a destination. They automatically spread into a straight line. Shift + right-click salvages a defense.</p></div>
      </aside>
      <footer className="controls"><span><kbd>DRAG BOX</kbd> SELECT</span><span><kbd>RIGHT CLICK</kbd> FORMATION MOVE</span><span><kbd>MIDDLE DRAG</kbd> ORBIT</span><span><kbd>WASD</kbd> GLIDE CAMERA</span><span><kbd>SPACE</kbd> START WAVE</span><span className="online">● GITHUB PAGES</span></footer>
    </main>
  );
}
