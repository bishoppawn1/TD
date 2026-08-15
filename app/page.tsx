"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type AssetKey = "rifle" | "sentry" | "flame" | "laser" | "railgun" | "howitzer" | "missile" | "light" | "wall" | "bastion" | "trench" | "wire" | "mine" | "barracks";
type CombatKey = "rifle" | "sentry" | "flame" | "laser" | "railgun" | "howitzer" | "missile";
type UpgradableKey = CombatKey | "light";
type MarineKind = "rifleman" | "gunner" | "medic" | "rocketeer";
type AlienKind = "drone" | "spitter" | "brute" | "razortail" | "stalker" | "strider" | "broodmother";

const MAX_WAVES = 25;
const ALIEN_SPEED_MULTIPLIER = 1.8;
const ENEMY_SWARM_MULTIPLIER = 5;
const MAX_ACTIVE_ENEMIES = 90;
const TARGET_FRAME_RATE = 45;
const ENEMY_SEPARATION_DISTANCE = 0.48;
const WALL_STACK_HEIGHT = 0.62;
const WALL_CLIMB_SPEED = 0.46;
const LIGHT_VISION_BASE = 7.2;
const LIGHT_VISION_PER_LEVEL = 1.8;
const ENEMY_TERRAIN_CLIMB_SPEED = 0.08;
const ENEMY_TERRAIN_ROUTE_CLIMB_SPEED = 0.65;
const ENEMY_TERRAIN_ROUTE_SLOPE_WEIGHT = 0.25;
const ARTILLERY_RETALIATION_CORRIDOR = 1.4;
const TARGET_SELECTION_VARIANCE = 0.34;
const RAZOR_WIRE_RADIUS = 1.05;
const RAZOR_WIRE_SLOW_MULTIPLIER = 0.32;
const RAZOR_WIRE_ENTRY_DAMAGE = 18;
const RAZOR_WIRE_DAMAGE_PER_SECOND = 24;
const TRENCH_CAPACITY = 4;
const TRENCH_DAMAGE_MULTIPLIER = 0.6;
const WALL_CLIMBERS = new Set<AlienKind>(["stalker", "razortail"]);
const ENEMY_STATS: Record<AlienKind, { hp: number; speed: number; damage: number; reward: number; attackRange: number; attackCooldown: number; gait: number; barHeight: number }> = {
  drone: { hp: 82, speed: 0.9, damage: 6, reward: 24, attackRange: 1.45, attackCooldown: 0.82, gait: 11.5, barHeight: 1.05 },
  spitter: { hp: 125, speed: 0.72, damage: 9, reward: 36, attackRange: 3.1, attackCooldown: 1.15, gait: 7.2, barHeight: 1.45 },
  brute: { hp: 340, speed: 0.48, damage: 18, reward: 65, attackRange: 1.7, attackCooldown: 1.35, gait: 4.2, barHeight: 2.05 },
  razortail: { hp: 245, speed: 0.68, damage: 14, reward: 56, attackRange: 2.05, attackCooldown: 1.05, gait: 6.2, barHeight: 1.75 },
  stalker: { hp: 64, speed: 1.85, damage: 5, reward: 30, attackRange: 1.25, attackCooldown: 0.48, gait: 18, barHeight: 0.95 },
  strider: { hp: 118, speed: 0.7, damage: 13, reward: 48, attackRange: 6.4, attackCooldown: 1.65, gait: 5.4, barHeight: 1.8 },
  broodmother: { hp: 285, speed: 0.52, damage: 16, reward: 75, attackRange: 5.1, attackCooldown: 2.4, gait: 3.8, barHeight: 2.2 },
};

const GRID_W = 32;
const GRID_H = 24;
const TILE = 1.36;
const ASSETS: Record<AssetKey, { name: string; role: string; cost: number; range: number; icon: string; accent: string }> = {
  rifle: { name: "M240 Gun Team", role: "Sustained fire · Anti-swarm", cost: 150, range: 4.7, icon: "⌖", accent: "#9fe870" },
  sentry: { name: "GAU-19 Sentry", role: "Fast tracking · Heavy burst", cost: 250, range: 5.6, icon: "◉", accent: "#62e8ff" },
  flame: { name: "Inferno Turret", role: "Short range · Burning splash", cost: 210, range: 3.25, icon: "♨", accent: "#ff875c" },
  laser: { name: "Helios Laser Tower", role: "Instant beam · Precision damage", cost: 360, range: 7.2, icon: "◇", accent: "#ff4ff5" },
  railgun: { name: "M-90 Rail Turret", role: "Long range · Armor piercing", cost: 410, range: 9.6, icon: "↯", accent: "#b889ff" },
  howitzer: { name: "M777 Howitzer", role: "Heavy shell · Area damage", cost: 350, range: 7.4, icon: "◎", accent: "#ffb45d" },
  missile: { name: "Javelin Battery", role: "Long range · Wide blast", cost: 480, range: 8.8, icon: "✦", accent: "#ff7f91" },
  light: { name: "Sentinel Light Tower", role: "Wide vision · Sweeping searchlights", cost: 135, range: 0, icon: "☼", accent: "#fff1a3" },
  wall: { name: "Hesco Wall", role: "600 armor · Supports units", cost: 70, range: 0, icon: "▦", accent: "#d1b98e" },
  bastion: { name: "Bastion Wall", role: "1,050 armor · Reinforced cover", cost: 125, range: 0, icon: "▰", accent: "#aab8bd" },
  trench: { name: "Infantry Trench", role: "4 infantry · 40% damage reduction", cost: 85, range: 0, icon: "⌓", accent: "#b89568" },
  wire: { name: "Razor Wire", role: "Snags hostiles · Heavy bleed", cost: 40, range: 0, icon: "〰", accent: "#e4cc9e" },
  mine: { name: "Shock Mine", role: "Proximity · One use", cost: 100, range: 1.35, icon: "⌁", accent: "#ff655f" },
  barracks: { name: "Field Barracks", role: "Trains specialized infantry", cost: 425, range: 0, icon: "⌂", accent: "#67c8ff" },
};

const TURRET_STATS: Record<CombatKey, { damage: number; cooldown: number; splash: number; arcHeight: number; color: number; heavy: boolean; turnSpeed: number; beam?: boolean }> = {
  rifle: { damage: 5.8, cooldown: 0.15, splash: 0, arcHeight: 0, color: 0xd6ff81, heavy: false, turnSpeed: 8 },
  sentry: { damage: 18, cooldown: 0.31, splash: 0.25, arcHeight: 0, color: 0x61e8ff, heavy: false, turnSpeed: 11 },
  flame: { damage: 13, cooldown: 0.2, splash: 0.82, arcHeight: 0.18, color: 0xff713d, heavy: false, turnSpeed: 7 },
  laser: { damage: 68, cooldown: 0.72, splash: 0, arcHeight: 0, color: 0xff4ff5, heavy: false, turnSpeed: 6.5, beam: true },
  railgun: { damage: 185, cooldown: 2.8, splash: 0, arcHeight: 0, color: 0xc090ff, heavy: true, turnSpeed: 4.4 },
  howitzer: { damage: 105, cooldown: 2.35, splash: 1.25, arcHeight: 2.2, color: 0xffa64d, heavy: true, turnSpeed: 3.5 },
  missile: { damage: 165, cooldown: 3.2, splash: 1.75, arcHeight: 2.8, color: 0xff667d, heavy: true, turnSpeed: 2.8 },
};

const MARINE_STATS: Record<MarineKind, { name: string; role: string; cost: number; hp: number; speed: number; damage: number; cooldown: number; range: number; color: string; projectileColor: number; splash?: number; arcHeight?: number; heavy?: boolean }> = {
  rifleman: { name: "Rifleman", role: "Mobile all-round infantry", cost: 60, hp: 100, speed: 1.65, damage: 9, cooldown: 0.55, range: 3.25, color: "#a8f76b", projectileColor: 0xbaff77 },
  gunner: { name: "Heavy Gunner", role: "Armored sustained fire", cost: 115, hp: 165, speed: 1.2, damage: 18, cooldown: 0.34, range: 3.7, color: "#ffbe62", projectileColor: 0xffbe62 },
  medic: { name: "Combat Medic", role: "Heals nearby infantry", cost: 90, hp: 85, speed: 1.75, damage: 5, cooldown: 0.72, range: 2.9, color: "#63e9ff", projectileColor: 0x63e9ff },
  rocketeer: { name: "Rocketeer", role: "Long-range anti-swarm rockets", cost: 155, hp: 95, speed: 1.08, damage: 62, cooldown: 2.15, range: 5.2, color: "#ff8a5b", projectileColor: 0xff7048, splash: 1.05, arcHeight: 0.65, heavy: true },
};

type Hud = { credits: number; integrity: number; wave: number; enemies: number; kills: number; active: boolean; gameOver: boolean; victory: boolean };
type Cell = { x: number; y: number };
type MoveWaypoint = Cell & { lift: number };
type Structure = { id: number; kind: AssetKey; level: number; x: number; y: number; targetX: number; targetY: number; hp: number; maxHp: number; mountedOn?: number; mountTarget?: number; movePath: MoveWaypoint[]; pathIndex: number; lift: number; stackLevel: number; group: THREE.Group; cooldown: number };
type Enemy = { id: number; kind: AlienKind; x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; reward: number; path: Cell[]; index: number; group: THREE.Group; hitFlash: number; attackCooldown: number; pathTimer: number; targetBiasSeed: number; targetId: number | null; targetType: "marine" | "structure" | "base"; retaliateAgainstId?: number; wireContactId?: number };
type Marine = { id: number; kind: MarineKind; x: number; y: number; targetX: number; targetY: number; vx: number; vy: number; hp: number; maxHp: number; cooldown: number; supportCooldown: number; mountedOn?: number; mountTarget?: number; trenchId?: number; movePath: MoveWaypoint[]; pathIndex: number; lift: number; group: THREE.Group };
type Bullet = { mesh: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; impactX: number; impactY: number; t: number; speed: number; target: number; damage: number; splash: number; arcHeight: number; color: number; sourceStructureId?: number };
type HostileProjectile = { group: THREE.Group; kind: AlienKind; from: THREE.Vector3; to: THREE.Vector3; t: number; speed: number; arcHeight: number; targetId: number; targetType: "marine" | "structure"; damage: number; color: number; impactCount: number };
type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number };
type SelectedUnit = { id: number; kind: UpgradableKey; name: string; level: number; maxLevel: number; upgradeCost: number | null; damage: number; range: number; maxHp: number; support: boolean };
type BarracksInfo = { id: number };
type BattlefieldApi = { start: () => void; restart: () => void; rotate: () => void; upgradeSelected: () => void; recruit: (kind: MarineKind) => void };
type MapKey = "ridge" | "basin" | "divide";
type MapConfig = {
  key: MapKey;
  operation: string;
  sector: string;
  name: string;
  objective: string;
  terrain: string;
  description: string;
  background: number;
  ground: number;
  fog: number;
  hue: number;
  saturation: number;
  baseCell: Cell;
  spawnCells: Cell[];
  startingStructures: Array<{ kind: AssetKey; x: number; y: number }>;
  startingMarines: Array<{ kind: MarineKind; x: number; y: number }>;
  heightAt: (x: number, y: number) => number;
};

const keyOf = (x: number, y: number) => `${x},${y}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const steppedHeight = (height: number) => Math.max(0.04, Math.round(height / 0.16) * 0.16);

const MAPS: Record<MapKey, MapConfig> = {
  ridge: {
    key: "ridge", operation: "NIGHTFALL", sector: "E-7", name: "Razorback Ridge", objective: "Hold the eastern ridge", terrain: "BALANCED · HIGH GROUND",
    description: "A familiar ridgeline with defensible elevations, open southern lanes, and pressure from three separated portals.",
    background: 0x07120f, ground: 0x0b1713, fog: 0x010705, hue: 0.29, saturation: 0.24,
    baseCell: { x: 2, y: 22 }, spawnCells: [{ x: 31, y: 1 }, { x: 31, y: 22 }, { x: 15, y: 0 }],
    startingStructures: [{ kind: "barracks", x: 4, y: 19 }, { kind: "rifle", x: 8, y: 19 }, { kind: "wall", x: 5, y: 20 }, { kind: "howitzer", x: 11, y: 20 }, { kind: "wire", x: 8, y: 22 }, { kind: "sentry", x: 9, y: 18 }, { kind: "light", x: 7, y: 16 }, { kind: "trench", x: 5, y: 16 }],
    startingMarines: [{ kind: "rifleman", x: 4, y: 18 }, { kind: "medic", x: 5, y: 19 }, { kind: "rifleman", x: 5, y: 18 }, { kind: "gunner", x: 7, y: 18 }, { kind: "rocketeer", x: 9, y: 19 }],
    heightAt: (x, y) => {
      const rolling = Math.max(0, Math.sin(x * 0.43) + Math.cos(y * 0.55) - 0.5) * 0.25;
      const ridge = Math.max(0, 1 - Math.hypot(x - 19, y - 14) / 7) * 0.88;
      const northRise = Math.max(0, 1 - Math.hypot(x - 9, y - 5) / 4.9) * 0.52;
      return (x < 4 && y > 19) || (x > 28 && y < 4) ? 0.04 : steppedHeight(rolling + ridge + northRise + 0.04);
    },
  },
  basin: {
    key: "basin", operation: "SUNSCOUR", sector: "K-12", name: "Cinder Basin", objective: "Defend the basin floor", terrain: "OPEN · ENCIRCLED",
    description: "Your command post sits low in a broad ash basin. Long sightlines help artillery, but portals wrap around both flanks.",
    background: 0x160b08, ground: 0x1d100c, fog: 0x090301, hue: 0.065, saturation: 0.34,
    baseCell: { x: 15, y: 22 }, spawnCells: [{ x: 0, y: 1 }, { x: 31, y: 3 }, { x: 31, y: 18 }],
    startingStructures: [{ kind: "barracks", x: 15, y: 19 }, { kind: "rifle", x: 12, y: 19 }, { kind: "wall", x: 14, y: 20 }, { kind: "howitzer", x: 18, y: 19 }, { kind: "wire", x: 16, y: 18 }, { kind: "railgun", x: 19, y: 16 }, { kind: "light", x: 15, y: 16 }, { kind: "bastion", x: 12, y: 18 }],
    startingMarines: [{ kind: "rifleman", x: 14, y: 18 }, { kind: "medic", x: 16, y: 19 }, { kind: "rifleman", x: 16, y: 16 }, { kind: "gunner", x: 14, y: 16 }, { kind: "rocketeer", x: 18, y: 16 }],
    heightAt: (x, y) => {
      const distance = Math.hypot(x - 15.5, y - 11.5);
      const rim = Math.max(0, (distance - 5.7) / 9.7) * 0.96;
      const dune = Math.max(0, Math.sin(x * 0.48 + y * 0.16) + Math.cos(y * 0.5) - 0.85) * 0.13;
      return steppedHeight(0.04 + rim + dune);
    },
  },
  divide: {
    key: "divide", operation: "BLACKGLASS", sector: "R-3", name: "Blackglass Divide", objective: "Control the fractured mesas", terrain: "CHOKEPOINTS · EXTREME HEIGHT",
    description: "Sheer, terraced volcanic mesas split the approach into deep channels. Climbers can cross the heights, but the ascent costs them time.",
    background: 0x090811, ground: 0x100f18, fog: 0x030207, hue: 0.69, saturation: 0.18,
    baseCell: { x: 3, y: 11 }, spawnCells: [{ x: 31, y: 1 }, { x: 31, y: 22 }, { x: 16, y: 0 }],
    startingStructures: [{ kind: "barracks", x: 5, y: 11 }, { kind: "rifle", x: 7, y: 8 }, { kind: "wall", x: 7, y: 12 }, { kind: "howitzer", x: 8, y: 15 }, { kind: "wire", x: 8, y: 9 }, { kind: "flame", x: 8, y: 11 }, { kind: "bastion", x: 7, y: 14 }, { kind: "light", x: 9, y: 12 }],
    startingMarines: [{ kind: "rifleman", x: 5, y: 9 }, { kind: "medic", x: 5, y: 14 }, { kind: "rifleman", x: 5, y: 12 }, { kind: "gunner", x: 7, y: 9 }, { kind: "rocketeer", x: 8, y: 14 }],
    heightAt: (x, y) => {
      const terrace = (distance: number) => distance < 2.75 ? 4.32 : distance < 4.1 ? 3.2 : distance < 5.6 ? 1.76 : distance < 6.75 ? 0.64 : 0;
      const northMesa = terrace(Math.hypot((x - 11) * 0.92, (y - 6) * 1.08));
      const southMesa = terrace(Math.hypot((x - 20) * 0.9, (y - 18) * 1.05));
      const fractureDistance = Math.abs((y - 11.5) - (x - 15.5) * 0.22);
      const fracture = fractureDistance < 0.72 ? 0.56 : fractureDistance < 1.35 ? 0.24 : 0;
      const brokenGround = Math.max(0, Math.sin(x * 0.82) * Math.cos(y * 0.67)) * 0.22;
      return steppedHeight(0.08 + Math.max(northMesa, southMesa) + brokenGround - fracture);
    },
  },
};
const MAP_ORDER: MapKey[] = ["ridge", "basin", "divide"];

function Battlefield({ selected, mapKey, onHud, onMessage, onUnitSelected, onBarracksSelected, apiRef }: { selected: AssetKey; mapKey: MapKey; onHud: (h: Hud) => void; onMessage: (s: string) => void; onUnitSelected: (unit: SelectedUnit | null) => void; onBarracksSelected: (barracks: BarracksInfo | null) => void; apiRef: React.MutableRefObject<BattlefieldApi | null> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  const callbacks = useRef({ onHud, onMessage, onUnitSelected, onBarracksSelected });
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { callbacks.current = { onHud, onMessage, onUnitSelected, onBarracksSelected }; }, [onHud, onMessage, onUnitSelected, onBarracksSelected]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const map = MAPS[mapKey];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(map.background);
    scene.fog = new THREE.FogExp2(map.background, 0.014);
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 220);
    camera.position.set(29, 32, 34);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
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
    controls.minDistance = 20;
    controls.maxDistance = 64;
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
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -33; sun.shadow.camera.right = 33; sun.shadow.camera.top = 33; sun.shadow.camera.bottom = -33;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x55ffb0, 0.9);
    rim.position.set(18, 9, -18);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);
    const heights: number[][] = Array.from({ length: GRID_H }, (_, y) => Array.from({ length: GRID_W }, (_, x) => map.heightAt(x, y)));
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
    const fogTiles: Array<{ x: number; y: number; mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }> = [];
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const h = heights[y][x];
      const color = new THREE.Color().setHSL(map.hue + ((x * 7 + y * 3) % 5) * 0.006, map.saturation, 0.20 + h * 0.035);
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.98, metalness: 0, emissive: 0x000000 });
      const tile = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.045, 0.55 + h, TILE - 0.045), material);
      const p = worldPos(x, y); tile.position.set(p.x, (h - 0.55) / 2, p.z); tile.receiveShadow = true; tile.userData = { x, y, base: color.clone() };
      world.add(tile); tileMeshes.push(tile);
      const fogMaterial = new THREE.MeshBasicMaterial({ color: map.fog, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });
      const fogTile = new THREE.Mesh(new THREE.PlaneGeometry(TILE - 0.025, TILE - 0.025), fogMaterial);
      fogTile.rotation.x = -Math.PI / 2; fogTile.position.copy(p).add(new THREE.Vector3(0, 0.045, 0)); fogTile.renderOrder = 8; world.add(fogTile); fogTiles.push({ x, y, mesh: fogTile, material: fogMaterial });
      if ((x * 13 + y * 19) % 17 === 0) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + ((x + y) % 3) * 0.05, 0), new THREE.MeshStandardMaterial({ color: 0x526159, roughness: 1 }));
        rock.scale.setScalar(0.72); rock.position.copy(p).add(new THREE.Vector3(0.3, 0.09, -0.24)); rock.rotation.set(x, y, x + y); rock.castShadow = true; world.add(rock);
      }
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), new THREE.MeshStandardMaterial({ color: map.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.58; ground.receiveShadow = true; scene.add(ground);

    function makeSoldier(scale = 1, kind: MarineKind = "rifleman") {
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

      box(g, [0.11, 0.11, 0.36], [0.13, 0.64, -0.25], gun, 0.24);
      const stock = box(g, [0.12, 0.13, 0.2], [0.13, 0.65, -0.01], 0x2a342f); stock.rotation.x = -0.12;
      beam(g, new THREE.Vector3(0.13, 0.65, -0.41), new THREE.Vector3(0.13, 0.66, -0.73), 0.026, gun);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0.13, 0.66, -0.75); g.add(muzzle);
      beam(g, new THREE.Vector3(-0.18, 0.76, -0.01), new THREE.Vector3(0.06, 0.66, -0.28), 0.055, olive);
      beam(g, new THREE.Vector3(0.18, 0.75, -0.01), new THREE.Vector3(0.16, 0.61, -0.36), 0.055, olive);
      addHand(g, new THREE.Vector3(0.06, 0.66, -0.28)); addHand(g, new THREE.Vector3(0.16, 0.61, -0.36));

      function addHand(parent: THREE.Object3D, position: THREE.Vector3) {
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skinMat); hand.position.copy(position); parent.add(hand);
      }
      if (kind === "gunner") {
        box(g, [0.42, 0.34, 0.24], [0, 0.67, 0.12], 0x493c2b);
        box(g, [0.2, 0.24, 0.18], [0.22, 0.53, -0.2], 0x9b713b);
        beam(g, new THREE.Vector3(0.13, 0.66, -0.43), new THREE.Vector3(0.13, 0.67, -0.91), 0.038, 0x111615);
      } else if (kind === "medic") {
        box(g, [0.34, 0.32, 0.17], [0, 0.63, 0.14], 0xd5e5df);
        box(g, [0.18, 0.045, 0.025], [0, 0.64, 0.235], 0x4fd7e7);
        box(g, [0.045, 0.18, 0.025], [0, 0.64, 0.236], 0x4fd7e7);
        const medicLight = new THREE.PointLight(0x62e8ff, 0.75, 1.8); medicLight.position.set(0, 0.7, 0.18); g.add(medicLight);
      } else if (kind === "rocketeer") {
        box(g, [0.4, 0.42, 0.2], [0, 0.68, 0.16], 0x6d4933);
        const launcher = cyl(g, [0.09, 0.12, 0.78, 10], [-0.08, 0.82, -0.28], 0x303733, [Math.PI / 2, 0, 0]); launcher.rotation.z = -0.08;
        cyl(g, [0.13, 0.13, 0.11, 10], [-0.08, 0.82, -0.69], 0xc75a36, [Math.PI / 2, 0, 0]);
        box(g, [0.18, 0.1, 0.12], [0.04, 0.7, -0.35], 0x181d1b);
        muzzle.position.set(-0.08, 0.82, -0.78);
      }
      g.userData.legs = legPivots; g.userData.muzzle = muzzle;
      g.scale.setScalar(scale * (kind === "gunner" ? 1.08 : kind === "rocketeer" ? 1.04 : 1)); shadowify(g); return g;
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
    function makeSentry() {
      const g = new THREE.Group();
      cyl(g, [0.64, 0.72, 0.2, 16], [0, 0.12, 0], 0x313f3c);
      cyl(g, [0.4, 0.48, 0.38, 14], [0, 0.38, 0], 0x52645e);
      box(g, [0.88, 0.42, 0.72], [0, 0.67, -0.05], 0x385651, 0.34);
      box(g, [0.72, 0.18, 0.55], [0, 0.91, 0], 0x5c7470, 0.3);
      for (const x of [-0.18, 0.18]) {
        beam(g, new THREE.Vector3(x, 0.75, -0.33), new THREE.Vector3(x, 0.77, -1.08), 0.045, 0x14201f);
        cyl(g, [0.08, 0.08, 0.18, 8], [x, 0.77, -1.13], 0x1b2927, [Math.PI / 2, 0, 0]);
      }
      box(g, [0.18, 0.16, 0.28], [0, 0.71, -0.62], 0x182422);
      cyl(g, [0.04, 0.04, 0.48, 8], [0, 1.18, 0.02], 0x546b65);
      const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), new THREE.MeshStandardMaterial({ color: 0x66dff2, emissive: 0x174f59, emissiveIntensity: 1.2, roughness: 0.25 })); sensor.position.set(0, 1.43, 0.02); g.add(sensor);
      const light = new THREE.PointLight(0x55e8ff, 0.85, 2.2); light.position.copy(sensor.position); g.add(light);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.77, -1.24); g.add(muzzle); g.userData.muzzle = muzzle;
      return g;
    }
    function makeFlameTurret() {
      const g = new THREE.Group();
      cyl(g, [0.62, 0.7, 0.18, 16], [0, 0.1, 0], 0x363c36);
      for (const x of [-0.28, 0.28]) cyl(g, [0.2, 0.2, 0.72, 12], [x, 0.55, 0.18], 0x6d4130);
      box(g, [0.72, 0.35, 0.66], [0, 0.62, -0.18], 0x654337, 0.35);
      for (const x of [-0.11, 0.11]) beam(g, new THREE.Vector3(x, 0.68, -0.42), new THREE.Vector3(x, 0.72, -1.03), 0.055, 0x242725);
      const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), new THREE.MeshStandardMaterial({ color: 0xff7a43, emissive: 0x8a2715, emissiveIntensity: 1.6 })); pilot.position.set(0, 0.83, -0.48); g.add(pilot);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.72, -1.12); g.add(muzzle); g.userData.muzzle = muzzle;
      return g;
    }
    function makeLaserTower() {
      const g = new THREE.Group();
      cyl(g, [0.72, 0.82, 0.2, 18], [0, 0.12, 0], 0x31343f);
      cyl(g, [0.42, 0.52, 0.55, 14], [0, 0.46, 0], 0x4b5061);
      for (const x of [-0.31, 0.31]) beam(g, new THREE.Vector3(x, 0.28, 0.2), new THREE.Vector3(x * 0.68, 1.15, -0.08), 0.055, 0x6c7080);
      box(g, [0.78, 0.32, 0.62], [0, 1.08, -0.08], 0x494153, 0.3);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: 0xff74f7, emissive: 0xb51fab, emissiveIntensity: 2.8, roughness: 0.12, metalness: 0.2 })); crystal.position.set(0, 1.18, -0.38); crystal.scale.z = 1.65; g.add(crystal);
      for (const x of [-0.13, 0.13]) beam(g, new THREE.Vector3(x, 1.12, -0.35), new THREE.Vector3(x * 0.45, 1.16, -1.32), 0.042, 0x252532);
      const emitter = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.045, 8, 20), new THREE.MeshStandardMaterial({ color: 0xffa2fb, emissive: 0xcb2dc3, emissiveIntensity: 2.4, roughness: 0.18 })); emitter.position.set(0, 1.16, -1.35); emitter.rotation.x = Math.PI / 2; g.add(emitter);
      const glow = new THREE.PointLight(0xff4ff5, 2.4, 4.5); glow.position.set(0, 1.18, -0.65); g.add(glow);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 1.16, -1.42); g.add(muzzle); g.userData.muzzle = muzzle;
      return g;
    }
    function makeRailgun() {
      const g = new THREE.Group();
      cyl(g, [0.7, 0.78, 0.2, 16], [0, 0.12, 0], 0x343c43);
      cyl(g, [0.4, 0.48, 0.4, 14], [0, 0.4, 0], 0x505d69);
      box(g, [0.82, 0.38, 0.74], [0, 0.72, -0.06], 0x3e4855, 0.28);
      for (const x of [-0.17, 0.17]) {
        beam(g, new THREE.Vector3(x, 0.76, -0.34), new THREE.Vector3(x, 0.82, -1.48), 0.065, 0x252c35);
        for (const z of [-0.62, -0.92, -1.22]) cyl(g, [0.1, 0.1, 0.06, 10], [x, 0.79, z], 0x9a66d1, [Math.PI / 2, 0, 0]);
      }
      const capacitor = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc690ff, emissive: 0x5c258d, emissiveIntensity: 1.8, roughness: 0.2 })); capacitor.position.set(0, 1.05, 0.02); g.add(capacitor);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.82, -1.58); g.add(muzzle); g.userData.muzzle = muzzle;
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
    function makeMissileBattery() {
      const g = new THREE.Group();
      cyl(g, [0.72, 0.8, 0.2, 16], [0, 0.12, 0], 0x303c3a);
      box(g, [1.15, 0.25, 0.9], [0, 0.34, 0.08], 0x485852);
      cyl(g, [0.26, 0.3, 0.35, 12], [0, 0.55, 0.05], 0x566861);
      const rack = box(g, [1.1, 0.16, 0.82], [0, 0.78, -0.12], 0x394944); rack.rotation.x = -0.28;
      for (const x of [-0.38, -0.13, 0.13, 0.38]) {
        const start = new THREE.Vector3(x, 0.7, 0.08), end = new THREE.Vector3(x, 1.08, -0.82), direction = end.clone().sub(start).normalize();
        beam(g, start, end, 0.09, 0x56645f);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.28, 8), new THREE.MeshStandardMaterial({ color: 0xd9d3b6, roughness: 0.55 })); nose.position.copy(end).addScaledVector(direction, 0.13); nose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction); g.add(nose);
        for (const side of [-1, 1]) box(g, [0.05, 0.16, 0.12], [x + side * 0.09, 0.66, 0.12], 0x313d39);
      }
      const sight = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), new THREE.MeshStandardMaterial({ color: 0xff7f91, emissive: 0x6a1825, emissiveIntensity: 1.4, roughness: 0.3 })); sight.position.set(0.56, 0.73, -0.16); g.add(sight);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 1.18, -0.96); g.add(muzzle); g.userData.muzzle = muzzle;
      return g;
    }
    function makeLightTower() {
      const g = new THREE.Group();
      const searchlights: THREE.SpotLight[] = [];
      cyl(g, [0.66, 0.78, 0.2, 16], [0, 0.12, 0], 0x3b423e);
      for (const side of [-1, 1]) {
        beam(g, new THREE.Vector3(side * 0.38, 0.18, 0.26), new THREE.Vector3(side * 0.16, 2.05, 0), 0.055, 0x6e786f);
        beam(g, new THREE.Vector3(side * 0.38, 0.18, -0.26), new THREE.Vector3(side * 0.16, 2.05, 0), 0.055, 0x6e786f);
      }
      for (const y of [0.7, 1.25, 1.8]) beam(g, new THREE.Vector3(-0.28, y, 0), new THREE.Vector3(0.28, y, 0), 0.035, 0x59645d);
      const head = new THREE.Group(); head.position.y = 2.12; g.add(head); g.userData.scanRig = head;
      cyl(head, [0.32, 0.38, 0.16, 14], [0, 0, 0], 0x525b56);
      for (const side of [-1, 1]) {
        const housing = box(head, [0.42, 0.28, 0.5], [side * 0.34, 0.02, -0.23], 0x444c48, 0.36); housing.rotation.x = -0.32;
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), new THREE.MeshBasicMaterial({ color: 0xfff3b0 })); lens.position.set(side * 0.34, -0.055, -0.49); lens.rotation.x = -0.32; head.add(lens);
        const searchlight = new THREE.SpotLight(0xffed9a, 7.5, 11, Math.PI / 5.5, 0.62, 1.1); searchlight.position.set(side * 0.34, 0, -0.35);
        const target = new THREE.Object3D(); target.position.set(side * 2.8, -2.4, -4.2); head.add(target); searchlight.target = target; head.add(searchlight);
        searchlights.push(searchlight);
      }
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), new THREE.MeshStandardMaterial({ color: 0xfff5bb, emissive: 0xffd85a, emissiveIntensity: 2.8, roughness: 0.2 })); beacon.position.y = 0.34; head.add(beacon);
      const halo = new THREE.PointLight(0xffe795, 2.8, 8.5); halo.position.y = 0.2; head.add(halo);
      g.userData.searchlights = searchlights; g.userData.lightHalo = halo; g.userData.lightBeacon = beacon;
      shadowify(g); return g;
    }
    function addWallStairs(g: THREE.Group, top = 0.72) {
      const stepCount = 4;
      for (const side of [-1, 1]) for (let i = 0; i < stepCount; i++) {
        const height = top * (i + 1) / stepCount;
        const step = box(g, [0.62, height, 0.24], [0, height / 2, side * (1.12 - i * 0.22)], 0x807560, 0.92);
        const tread = box(step, [0.64, 0.035, 0.27], [0, 0.5, 0], 0xb9aa8b, 0.72); tread.position.y = height / 2 + 0.018;
      }
    }
    function makeWall() {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        const cage = box(g, [0.58, 0.72, 1.65], [i * 0.59, 0.38, 0], 0xb2a284);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cage.geometry), new THREE.LineBasicMaterial({ color: 0x615b4e, transparent: true, opacity: 0.65 })); cage.add(edges);
      }
      addWallStairs(g);
      return g;
    }
    function makeBastion() {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        box(g, [0.58, 0.82, 1.72], [i * 0.59, 0.43, 0], 0x768087);
        box(g, [0.5, 0.16, 1.78], [i * 0.59, 0.89, 0], 0x4e585f, 0.5);
      }
      for (const x of [-0.87, 0.87]) box(g, [0.12, 1.02, 1.82], [x, 0.5, 0], 0x343d42, 0.45);
      for (const z of [-0.72, 0.72]) beam(g, new THREE.Vector3(-0.86, 0.96, z), new THREE.Vector3(0.86, 0.96, z), 0.035, 0x9aa7ad);
      addWallStairs(g, 0.96);
      return g;
    }
    function makeTrench() {
      const g = new THREE.Group();
      box(g, [1.78, 0.16, 1.78], [0, -0.12, 0], 0x3b3022);
      box(g, [1.42, 0.06, 1.42], [0, -0.13, 0], 0x171914);
      const edges: Record<"north" | "south" | "east" | "west", THREE.Group> = { north: new THREE.Group(), south: new THREE.Group(), east: new THREE.Group(), west: new THREE.Group() };
      const connectors: Record<"north" | "south" | "east" | "west", THREE.Group> = { north: new THREE.Group(), south: new THREE.Group(), east: new THREE.Group(), west: new THREE.Group() };
      (Object.values(edges) as THREE.Group[]).forEach(edge => g.add(edge));
      (Object.values(connectors) as THREE.Group[]).forEach(connector => { connector.visible = false; g.add(connector); });
      for (const direction of ["north", "south"] as const) {
        const edge = edges[direction], z = direction === "north" ? -0.76 : 0.76;
        for (const x of [-0.56, -0.28, 0, 0.28, 0.56]) cyl(edge, [0.13, 0.15, 0.34, 8], [x, 0.08, z], 0x9d895f, [0, 0, Math.PI / 2]);
        for (const x of [-0.42, -0.14, 0.14, 0.42]) cyl(edge, [0.12, 0.14, 0.34, 8], [x, 0.29, z], 0xb09b6d, [0, 0, Math.PI / 2]);
      }
      for (const direction of ["east", "west"] as const) {
        const edge = edges[direction], x = direction === "west" ? -0.76 : 0.76;
        for (const z of [-0.56, -0.28, 0, 0.28, 0.56]) cyl(edge, [0.13, 0.15, 0.34, 8], [x, 0.08, z], 0x9d895f, [Math.PI / 2, 0, 0]);
        for (const z of [-0.42, -0.14, 0.14, 0.42]) cyl(edge, [0.12, 0.14, 0.34, 8], [x, 0.29, z], 0xb09b6d, [Math.PI / 2, 0, 0]);
      }
      for (const x of [-0.48, 0, 0.48]) box(g, [0.1, 0.055, 1.08], [x, -0.07, 0], 0x6b5235);
      for (const direction of ["east", "west"] as const) {
        const sign = direction === "east" ? 1 : -1, connector = connectors[direction];
        box(connector, [0.6, 0.06, 1.05], [sign * 0.91, -0.13, 0], 0x181a15);
        for (const z of [-0.62, 0.62]) cyl(connector, [0.11, 0.13, 0.54, 8], [sign * 0.91, 0.06, z], 0x9d895f, [0, 0, Math.PI / 2]);
      }
      for (const direction of ["north", "south"] as const) {
        const sign = direction === "south" ? 1 : -1, connector = connectors[direction];
        box(connector, [1.05, 0.06, 0.6], [0, -0.13, sign * 0.91], 0x181a15);
        for (const x of [-0.62, 0.62]) cyl(connector, [0.11, 0.13, 0.54, 8], [x, 0.06, sign * 0.91], 0x9d895f, [Math.PI / 2, 0, 0]);
      }
      g.userData.trenchEdges = edges; g.userData.trenchConnectors = connectors;
      shadowify(g); return g;
    }
    function makeWire() {
      const g = new THREE.Group();
      for (const x of [-0.72, 0.72]) {
        beam(g, new THREE.Vector3(x, 0.02, -0.7), new THREE.Vector3(x, 0.42, 0.7), 0.035, 0x5c594f);
        beam(g, new THREE.Vector3(x, 0.02, 0.7), new THREE.Vector3(x, 0.42, -0.7), 0.035, 0x5c594f);
      }
      const wireMat = new THREE.MeshStandardMaterial({ color: 0xbeb79f, roughness: 0.45, metalness: 0.65 });
      for (const y of [0.2, 0.42]) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.025, 5, 24), wireMat); coil.position.set(0, y, 0); coil.rotation.y = Math.PI / 2; coil.scale.z = 2; g.add(coil);
        for (let i = 0; i < 8; i++) {
          const barb = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 4), wireMat); const a = i / 8 * Math.PI * 2; barb.position.set(Math.cos(a) * 0.42, y + Math.sin(a) * 0.42, (i % 2 ? -0.55 : 0.55)); barb.rotation.z = a; g.add(barb);
        }
      }
      shadowify(g); return g;
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
      const legs: THREE.Group[] = [], legPhases: number[] = [], tails: THREE.Group[] = [], wings: THREE.Group[] = [];
      const brute = kind === "brute", spitter = kind === "spitter", broodmother = kind === "broodmother", razortail = kind === "razortail", stalker = kind === "stalker", strider = kind === "strider";
      const shellColor = brute ? 0x673832 : broodmother ? 0x5d3548 : spitter ? 0x28654b : razortail ? 0x57305f : stalker ? 0x27536b : strider ? 0x62572d : 0x334d42;
      const skinColor = brute ? 0x2c1c1b : broodmother ? 0x271824 : spitter ? 0x172e25 : razortail ? 0x29162f : stalker ? 0x102832 : strider ? 0x292614 : 0x192a24;
      const glowColor = broodmother ? 0xff8bb8 : spitter ? 0x63ff9f : razortail ? 0xe86bff : stalker ? 0x51dfff : strider ? 0xffe56d : 0xff503f;
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
      const addPlate = (position: [number, number, number], scale: [number, number, number], color = shellColor) => {
        const plate = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.2 })); plate.position.set(...position); plate.scale.set(...scale); plate.rotation.x = 0.12; bodyRig.add(plate); return plate;
      };
      const addScythe = (side: number, start: THREE.Vector3, joint: THREE.Vector3, tip: THREE.Vector3, thickness: number) => {
        beam(g, start, joint, thickness, shellColor); beam(g, joint, tip, thickness * 0.58, skinColor);
        const direction = tip.clone().sub(joint), blade = new THREE.Mesh(new THREE.ConeGeometry(thickness * 1.7, direction.length() * 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x1b201d, roughness: 0.48, metalness: 0.22 }));
        blade.position.copy(joint).lerp(tip, 0.68); blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); blade.rotation.z += side * 0.08; g.add(blade);
      };
      const addAntenna = (side: number, start: THREE.Vector3, joint: THREE.Vector3, tip: THREE.Vector3, thickness = 0.018) => {
        beam(bodyRig, start, joint, thickness, shellColor); beam(bodyRig, joint, tip, thickness * 0.7, glowColor);
        const feeler = new THREE.Mesh(new THREE.SphereGeometry(thickness * 1.8, 6, 4), glow); feeler.position.copy(tip); bodyRig.add(feeler);
      };
      const addWingPair = (position: [number, number, number], width: number, length: number, color: number) => {
        const wingMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, roughness: 0.22, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
        for (const side of [-1, 1]) {
          const pivot = new THREE.Group(); pivot.position.set(position[0] + side * 0.16, position[1], position[2]); pivot.rotation.z = side * 0.12; pivot.userData.side = side; pivot.userData.restAngle = pivot.rotation.z; bodyRig.add(pivot);
          const wing = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), wingMaterial); wing.scale.set(width, length, 1); wing.position.set(side * width * 0.42, 0, length * 0.28); wing.rotation.x = -Math.PI / 2; pivot.add(wing); wings.push(pivot);
        }
      };

      if (kind === "drone") {
        addOrb(bodyRig, 0.42, [0, 0.42, 0.18], [0.9, 0.56, 1.35], shell);
        addOrb(bodyRig, 0.3, [0, 0.37, -0.42], [1.05, 0.62, 0.9], skin);
        addOrb(bodyRig, 0.19, [0, 0.33, -0.7], [1.18, 0.56, 0.95], shell);
        addPlate([0, 0.59, 0.28], [0.82, 0.32, 1.22]); addPlate([0, 0.5, -0.42], [0.72, 0.26, 0.66], 0x465c4e);
        for (const side of [-1, 1]) {
          addEye(side * 0.105, 0.38, -0.85, 0.045);
          addAntenna(side, new THREE.Vector3(side * 0.09, 0.38, -0.82), new THREE.Vector3(side * 0.24, 0.54, -1.06), new THREE.Vector3(side * 0.4, 0.43, -1.3));
          const mandible = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.38, 6), skin); mandible.position.set(side * 0.13, 0.26, -0.91); mandible.rotation.set(-Math.PI / 2, 0, side * 0.2); bodyRig.add(mandible);
          addScythe(side, new THREE.Vector3(side * 0.2, 0.42, -0.34), new THREE.Vector3(side * 0.62, 0.29, -0.63), new THREE.Vector3(side * 0.82, 0.08, -1.04), 0.065);
        }
        addWingPair([0, 0.58, 0.18], 0.54, 0.78, 0x8fc9af);
        [-0.25, 0.08, 0.38].forEach((z, i) => { addLeg(-1, z, i * Math.PI * 0.72, 0.42, 0.34, 0.045, 0.38); addLeg(1, z, Math.PI + i * Math.PI * 0.72, 0.42, 0.34, 0.045, 0.38); });
        [-0.05, 0.22, 0.48].forEach((z, i) => addSpine(0, 0.77 - i * 0.035, z, 0.22 - i * 0.025));
      } else if (kind === "spitter") {
        const sac = addOrb(bodyRig, 0.48, [0, 0.62, 0.35], [0.88, 0.9, 1.35], new THREE.MeshStandardMaterial({ color: 0x2f9861, emissive: 0x145e39, emissiveIntensity: 1.1, roughness: 0.32, transparent: true, opacity: 0.92 }));
        addOrb(bodyRig, 0.4, [0, 0.72, -0.28], [1.12, 0.82, 1.05], shell);
        addOrb(bodyRig, 0.27, [0, 0.67, -0.72], [1.22, 0.68, 1.05], skin);
        addPlate([0, 0.92, -0.22], [1.0, 0.34, 0.92], 0x347b59); addPlate([0, 0.86, 0.38], [0.72, 0.25, 1.04], 0x2e684d);
        for (const side of [-1, 1]) { addEye(side * 0.12, 0.71, -0.93, 0.055); addEye(side * 0.2, 0.67, -0.86, 0.035); addAntenna(side, new THREE.Vector3(side * 0.12, 0.72, -0.88), new THREE.Vector3(side * 0.3, 0.9, -1.08), new THREE.Vector3(side * 0.5, 0.72, -1.34), 0.022); addScythe(side, new THREE.Vector3(side * 0.24, 0.65, -0.38), new THREE.Vector3(side * 0.7, 0.44, -0.65), new THREE.Vector3(side * 0.9, 0.12, -1.04), 0.07); }
        [-0.3, 0.18, 0.48].forEach((z, i) => { addLeg(-1, z, i * Math.PI * 0.8, 0.5, 0.45, 0.05, 0.56); addLeg(1, z, Math.PI + i * Math.PI * 0.8, 0.5, 0.45, 0.05, 0.56); });
        for (const z of [-0.32, -0.05, 0.22]) addSpine(0, 1.12, z, 0.3, 0x3f9e70);
        const mouthGlow = new THREE.PointLight(0x55ff99, 1.6, 2.6); mouthGlow.position.set(0, 0.61, -0.96); bodyRig.add(mouthGlow); sac.userData.pulse = true;
      } else if (kind === "broodmother") {
        const eggSac = addOrb(bodyRig, 0.72, [0, 0.92, 0.42], [1.05, 0.88, 1.48], new THREE.MeshStandardMaterial({ color: 0x8d4667, emissive: 0x531f3a, emissiveIntensity: 1.15, roughness: 0.38, transparent: true, opacity: 0.94 }));
        addOrb(bodyRig, 0.48, [0, 0.88, -0.5], [1.25, 0.76, 1.04], shell);
        addOrb(bodyRig, 0.31, [0, 0.78, -0.96], [1.28, 0.67, 0.94], skin);
        addPlate([0, 1.28, 0.34], [1.18, 0.38, 1.4], 0x784159); addPlate([0, 1.15, -0.46], [1.02, 0.34, 0.88], 0x6f3a51);
        for (const side of [-1, 1]) {
          addEye(side * 0.14, 0.82, -1.2, 0.06); addEye(side * 0.24, 0.78, -1.1, 0.038);
          addAntenna(side, new THREE.Vector3(side * 0.14, 0.84, -1.14), new THREE.Vector3(side * 0.34, 1.08, -1.38), new THREE.Vector3(side * 0.62, 0.88, -1.68), 0.028);
          addScythe(side, new THREE.Vector3(side * 0.3, 0.86, -0.42), new THREE.Vector3(side * 0.86, 0.58, -0.78), new THREE.Vector3(side * 1.08, 0.13, -1.28), 0.09);
        }
        addWingPair([0, 1.25, 0.08], 1.02, 1.3, 0xd895b8);
        [-0.42, 0.04, 0.46].forEach((z, i) => { addLeg(-1, z, i * Math.PI * 0.72, 0.62, 0.54, 0.075, 0.7); addLeg(1, z, Math.PI + i * Math.PI * 0.72, 0.62, 0.54, 0.075, 0.7); });
        [-0.34, -0.04, 0.27, 0.55].forEach((z, i) => addSpine(0, 1.55 - i * 0.04, z, 0.34 - i * 0.035, 0x9f5574));
        for (const side of [-1, 1]) { const egg = addOrb(bodyRig, 0.14, [side * 0.42, 0.92, 0.58], [0.85, 1.12, 0.85], glow); egg.rotation.z = side * 0.18; }
        const broodGlow = new THREE.PointLight(0xff73aa, 2, 3.4); broodGlow.position.set(0, 0.88, -1.05); bodyRig.add(broodGlow); eggSac.userData.pulse = true;
      } else if (kind === "strider") {
        addOrb(bodyRig, 0.32, [0, 1.18, 0.12], [0.72, 0.44, 1.35], shell);
        addOrb(bodyRig, 0.22, [0, 1.15, -0.42], [0.92, 0.55, 1.08], skin);
        addPlate([0, 1.38, 0.08], [0.68, 0.2, 1.08], 0x80723a);
        for (const side of [-1, 1]) {
          addEye(side * 0.085, 1.18, -0.65, 0.04);
          addAntenna(side, new THREE.Vector3(side * 0.08, 1.2, -0.62), new THREE.Vector3(side * 0.2, 1.38, -0.84), new THREE.Vector3(side * 0.35, 1.25, -1.14), 0.014);
          addLeg(side, -0.24, side < 0 ? 0 : Math.PI, 0.78, 0.68, 0.026, 1.08);
          addLeg(side, 0.12, side < 0 ? Math.PI * 0.66 : Math.PI * 1.66, 0.84, 0.72, 0.024, 1.12);
          addLeg(side, 0.42, side < 0 ? Math.PI * 1.32 : Math.PI * 0.32, 0.75, 0.65, 0.022, 1.04);
        }
        addWingPair([0, 1.32, 0.12], 0.76, 1.12, 0xe8d989);
        beam(bodyRig, new THREE.Vector3(0, 1.16, -0.48), new THREE.Vector3(0, 1.17, -1.12), 0.045, 0x282719);
        const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 7), glow); emitter.position.set(0, 1.17, -1.16); bodyRig.add(emitter);
        const emitterLight = new THREE.PointLight(0xffe56d, 1.5, 2.8); emitterLight.position.copy(emitter.position); bodyRig.add(emitterLight);
        [-0.05, 0.18, 0.38].forEach((z, i) => addSpine(0, 1.58 - i * 0.025, z, 0.18 - i * 0.018, 0xa08d43));
      } else if (kind === "stalker") {
        addOrb(bodyRig, 0.31, [0, 0.34, 0.14], [0.66, 0.42, 1.55], shell);
        addOrb(bodyRig, 0.2, [0, 0.31, -0.45], [0.82, 0.48, 1.12], skin);
        addPlate([0, 0.48, 0.08], [0.58, 0.21, 1.18], 0x397a92);
        for (const side of [-1, 1]) {
          addEye(side * 0.07, 0.34, -0.66, 0.035);
          addAntenna(side, new THREE.Vector3(side * 0.07, 0.35, -0.64), new THREE.Vector3(side * 0.2, 0.5, -0.84), new THREE.Vector3(side * 0.42, 0.35, -1.1), 0.012);
          addScythe(side, new THREE.Vector3(side * 0.13, 0.34, -0.28), new THREE.Vector3(side * 0.46, 0.22, -0.62), new THREE.Vector3(side * 0.7, 0.04, -1.0), 0.035);
        }
        [-0.18, 0.04, 0.25, 0.42].forEach((z, i) => { addLeg(-1, z, i * Math.PI * 0.58, 0.48, 0.46, 0.025, 0.3); addLeg(1, z, Math.PI + i * Math.PI * 0.58, 0.48, 0.46, 0.025, 0.3); });
        [-0.04, 0.18, 0.38].forEach((z, i) => addSpine(0, 0.62 - i * 0.025, z, 0.15, 0x56b4d1));
      } else if (kind === "razortail") {
        addOrb(bodyRig, 0.57, [0, 0.78, 0.18], [1.08, 0.72, 1.48], shell);
        addOrb(bodyRig, 0.38, [0, 0.66, -0.58], [1.2, 0.68, 1.02], skin);
        addOrb(bodyRig, 0.25, [0, 0.57, -0.94], [1.28, 0.61, 0.92], shell);
        addPlate([0, 1.02, 0.18], [1.16, 0.42, 1.38], 0x72407c); addPlate([0, 0.89, -0.5], [0.94, 0.34, 0.82], 0x64336e);
        for (const side of [-1, 1]) {
          addEye(side * 0.13, 0.61, -1.16, 0.052);
          addAntenna(side, new THREE.Vector3(side * 0.13, 0.62, -1.1), new THREE.Vector3(side * 0.32, 0.78, -1.32), new THREE.Vector3(side * 0.58, 0.58, -1.56), 0.022);
          addScythe(side, new THREE.Vector3(side * 0.3, 0.68, -0.54), new THREE.Vector3(side * 0.82, 0.46, -0.88), new THREE.Vector3(side * 1.05, 0.12, -1.38), 0.09);
        }
        [-0.38, 0.08, 0.45].forEach((z, i) => { addLeg(-1, z, i * Math.PI * 0.72, 0.57, 0.46, 0.075, 0.63); addLeg(1, z, Math.PI + i * Math.PI * 0.72, 0.57, 0.46, 0.075, 0.63); });
        for (let i = -2; i <= 2; i++) {
          const tail = new THREE.Group(); tail.position.set(i * 0.12, 0.76, 0.58); tail.rotation.z = i * 0.13; g.add(tail);
          const mid = new THREE.Vector3(i * 0.11, 0.18 + Math.abs(i) * 0.035, 0.72 + Math.abs(i) * 0.08), tip = new THREE.Vector3(i * 0.25, 0.08, 1.52 + Math.abs(i) * 0.12);
          beam(tail, new THREE.Vector3(), mid, 0.075, shellColor); beam(tail, mid, tip, 0.045, skinColor);
          for (const t of [0.38, 0.64, 0.88]) { const p = mid.clone().lerp(tip, t), spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0xd58ce0, roughness: 0.48, metalness: 0.16 })); spike.position.copy(p).add(new THREE.Vector3(i * 0.025, 0.17, 0)); spike.rotation.z = i * -0.12; tail.add(spike); }
          const barbDirection = tip.clone().sub(mid).normalize(), barb = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 7), new THREE.MeshStandardMaterial({ color: 0xe3a1ec, roughness: 0.4, metalness: 0.2 })); barb.position.copy(tip); barb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), barbDirection); tail.add(barb); tails.push(tail);
        }
      } else {
        addOrb(bodyRig, 0.68, [0, 1.0, 0.12], [1.15, 0.94, 1.35], shell);
        addOrb(bodyRig, 0.54, [0, 0.88, -0.7], [1.32, 0.78, 1.08], skin);
        addOrb(bodyRig, 0.36, [0, 0.78, -1.12], [1.38, 0.72, 1.0], shell);
        addPlate([0, 1.34, 0.22], [1.38, 0.58, 1.46], 0x79443a); addPlate([0, 1.17, -0.58], [1.18, 0.46, 0.92], 0x865044); addPlate([0, 1.03, -1.06], [0.92, 0.36, 0.62], 0x6d382f);
        for (const side of [-1, 1]) {
          addEye(side * 0.17, 0.83, -1.43, 0.065);
          addAntenna(side, new THREE.Vector3(side * 0.17, 0.86, -1.35), new THREE.Vector3(side * 0.42, 1.12, -1.52), new THREE.Vector3(side * 0.7, 0.94, -1.76), 0.032);
          const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 7), new THREE.MeshStandardMaterial({ color: 0xc6b78e, roughness: 0.78 })); tusk.position.set(side * 0.33, 0.7, -1.47); tusk.rotation.set(-Math.PI / 2, 0, side * 0.28); bodyRig.add(tusk);
          addScythe(side, new THREE.Vector3(side * 0.4, 0.98, -0.62), new THREE.Vector3(side * 1.0, 0.67, -1.02), new THREE.Vector3(side * 1.28, 0.16, -1.72), 0.13);
        }
        [-0.5, 0, 0.5].forEach((z, i) => { addLeg(-1, z, i * Math.PI * 0.72, 0.62, 0.5, 0.1, 0.78); addLeg(1, z, Math.PI + i * Math.PI * 0.72, 0.62, 0.5, 0.1, 0.78); });
        [-0.42, -0.08, 0.26, 0.56].forEach((z, i) => addSpine(0, 1.66 - i * 0.05, z, 0.44 - i * 0.045, 0x8a4c3f));
        for (const side of [-1, 1]) addOrb(bodyRig, 0.25, [side * 0.6, 1.12, -0.2], [1.2, 0.7, 1], shell);
      }

      const classScale = brute ? 0.9 : broodmother ? 0.82 : spitter ? 0.68 : razortail ? 0.74 : strider ? 0.72 : stalker ? 0.4 : 0.52;
      g.scale.setScalar(classScale * (0.94 + Math.random() * 0.12));
      g.userData.legs = legs; g.userData.legPhases = legPhases; g.userData.tails = tails; g.userData.wings = wings; g.userData.bodyRig = bodyRig; g.userData.kind = kind;
      g.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; } }); return g;
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

    const baseCell = map.baseCell, spawnCells = map.spawnCells;
    const base = makeBase(); base.position.copy(worldPos(baseCell.x, baseCell.y)); base.rotation.y = 0.55; world.add(base);
    const spawnBeacons = spawnCells.map((cell, index) => {
      const group = new THREE.Group();
      const portal = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.08, 10, 30), new THREE.MeshStandardMaterial({ color: 0x6f1827, emissive: 0x7f0d26, emissiveIntensity: 2 })); portal.rotation.x = Math.PI / 2; portal.position.y = 0.18; group.add(portal);
      const inner = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.52, 26), new THREE.MeshBasicMaterial({ color: 0xff3157, transparent: true, opacity: 0.24, side: THREE.DoubleSide })); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.12; group.add(inner);
      const light = new THREE.PointLight(0xff234c, 3, 7); light.position.y = 0.35; group.add(light); group.position.copy(worldPos(cell.x, cell.y)); world.add(group);
      return { group, portal, inner, light, phase: index * Math.PI * 0.67 };
    });

    const STRUCTURE_HP: Record<AssetKey, number> = { rifle: 190, sentry: 280, flame: 245, laser: 275, railgun: 310, howitzer: 300, missile: 340, light: 230, wall: 600, bastion: 1050, trench: 360, wire: 180, mine: 45, barracks: 500 };
    function attachHealthBar(group: THREE.Group, y = 1.75) {
      // Health remains part of the combat simulation, but floating bars are
      // intentionally disabled because they obscure the battlefield.
      group.userData.healthBar = undefined; group.userData.healthFill = undefined; group.userData.healthOffset = y * group.scale.y;
    }
    function updateTierBadge(group: THREE.Group, level: number) {
      const bar = group.userData.healthBar as THREE.Group | undefined; if (!bar) return;
      let canvas = group.userData.tierCanvas as HTMLCanvasElement | undefined, texture = group.userData.tierTexture as THREE.CanvasTexture | undefined, badge = group.userData.tierBadge as THREE.Sprite | undefined;
      if (!canvas || !texture || !badge) {
        canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 52;
        texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter;
        badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })); badge.position.set(0.82, 0, 0.025); badge.scale.set(0.42, 0.17, 1); badge.renderOrder = 32; bar.add(badge);
        group.userData.tierCanvas = canvas; group.userData.tierTexture = texture; group.userData.tierBadge = badge;
      }
      const ctx = canvas.getContext("2d"); if (!ctx) return; const color = level === 3 ? "#ffd36a" : level === 2 ? "#62e8ff" : "#9fe870";
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "rgba(4,13,10,.96)"; ctx.fillRect(2, 2, 124, 48); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.strokeRect(3, 3, 122, 46);
      ctx.fillStyle = color; ctx.font = "bold 30px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(`T${level}`, 64, 28); texture.needsUpdate = true;
    }
    function setHealthVisual(group: THREE.Group, hp: number, maxHp: number) {
      const ratio = clamp(Number.isFinite(hp / maxHp) ? hp / maxHp : 0, 0, 1); const fill = group.userData.healthFill as THREE.Mesh | undefined;
      if (fill) { fill.scale.x = Math.max(0.001, ratio); fill.position.x = -0.55 * (1 - ratio); (fill.material as THREE.MeshBasicMaterial).color.setHex(ratio > 0.55 ? 0x7dff79 : ratio > 0.25 ? 0xffbd55 : 0xff5249); }
    }
    function syncHealthBar(group: THREE.Group) {
      const bar = group.userData.healthBar as THREE.Group | undefined; if (!bar) return; bar.position.copy(group.position).add(new THREE.Vector3(0, group.userData.healthOffset as number, 0)); bar.quaternion.copy(camera.quaternion);
    }
    function removeHealthBar(group: THREE.Group) {
      const bar = group.userData.healthBar as THREE.Group | undefined; if (bar) world.remove(bar); (group.userData.tierTexture as THREE.CanvasTexture | undefined)?.dispose(); group.userData.healthBar = undefined; group.userData.healthFill = undefined; group.userData.tierBadge = undefined; group.userData.tierTexture = undefined; group.userData.tierCanvas = undefined;
    }
    let credits = 750, integrity = 100, wave = 0, kills = 0, active = false, gameOver = false, victory = false;
    let spawnLeft = 0, spawnTimer = 0, assaultFront = 0, nextId = 1, elapsed = 0, lastHud = -1;
    let structures: Structure[] = [], enemies: Enemy[] = [], marines: Marine[] = [], bullets: Bullet[] = [], hostileProjectiles: HostileProjectile[] = [], particles: Particle[] = [];
    const selectedMarines = new Set<number>();
    const selectedEmplacements = new Set<number>();
    let selectedBarracksId: number | null = null;
    const isMobileEmplacement = (s: Structure) => s.kind === "rifle" || s.kind === "howitzer";
    const isCombatStructure = (s: Structure): s is Structure & { kind: CombatKey } => s.kind in TURRET_STATS;
    const isUpgradableStructure = (s: Structure): s is Structure & { kind: UpgradableKey } => isCombatStructure(s) || s.kind === "light";
    const isWall = (s: Structure) => s.kind === "wall" || s.kind === "bastion";
    const isPathBlocking = (s: Structure) => s.kind !== "mine" && s.kind !== "wire" && s.kind !== "trench" && !s.mountedOn;
    const isEntrenched = (m: Marine) => !m.movePath.length && !!m.trenchId && structures.some(s => s.id === m.trenchId && s.kind === "trench" && Math.hypot(s.x - m.x, s.y - m.y) < 0.72);
    const blocked = () => new Set(structures.filter(isPathBlocking).map(s => keyOf(Math.round(s.x), Math.round(s.y))));
    const topWallAt = (x: number, y: number) => structures.filter(s => isWall(s) && s.x === x && s.y === y).sort((a, b) => b.stackLevel - a.stackLevel)[0];
    const wallTopLift = (wall: Structure) => (wall.stackLevel + 1) * WALL_STACK_HEIGHT;
    const blockedForEnemy = (kind: AlienKind) => new Set(structures.filter(s => isPathBlocking(s) && (!WALL_CLIMBERS.has(kind) || !isWall(s))).map(s => keyOf(Math.round(s.x), Math.round(s.y))));
    const terrainSpeedMultiplier = (from: Cell, to: Cell) => clamp(1 - (heights[to.y][to.x] - heights[from.y][from.x]) * 1.45, 0.28, 1.65);
    let visionSources: Array<{ x: number; y: number; radius: number }> = [], fogTimer = 0;
    function rebuildVision() {
      visionSources = [{ x: baseCell.x, y: baseCell.y, radius: 4.2 }];
      marines.forEach(m => visionSources.push({ x: m.x, y: m.y, radius: 3.15 }));
      structures.forEach(s => {
        if (s.kind === "light") visionSources.push({ x: s.x, y: s.y, radius: LIGHT_VISION_BASE + (s.level - 1) * LIGHT_VISION_PER_LEVEL });
        else if (isCombatStructure(s)) visionSources.push({ x: s.x, y: s.y, radius: 3.7 + (s.level - 1) * 0.35 });
        else if (s.kind === "barracks") visionSources.push({ x: s.x, y: s.y, radius: 3.2 });
      });
    }
    function visibilityStrength(x: number, y: number) {
      let strength = 0;
      for (const source of visionSources) {
        const distance = Math.hypot(source.x - x, source.y - y);
        strength = Math.max(strength, clamp((source.radius - distance) / 1.35, 0, 1));
      }
      return strength;
    }
    const isRevealed = (x: number, y: number) => visionSources.some(source => Math.hypot(source.x - x, source.y - y) <= source.radius);
    function updateFogOfWar(dt: number) {
      fogTimer -= dt; if (fogTimer > 0) return; fogTimer = 0.1; rebuildVision();
      fogTiles.forEach(tile => { const strength = visibilityStrength(tile.x, tile.y); tile.material.opacity = 0.9 * (1 - strength); tile.mesh.visible = tile.material.opacity > 0.025; });
      enemies.forEach(enemy => { enemy.group.visible = isRevealed(enemy.x, enemy.y); });
      hostileProjectiles.forEach(shot => { shot.group.visible = isRevealed((shot.to.x / TILE) + (GRID_W - 1) / 2, (shot.to.z / TILE) + (GRID_H - 1) / 2); });
    }
    function findPathTo(sx: number, sy: number, target: Cell, extra?: Cell, blockedCells?: Set<string>, stepCost?: (from: Cell, to: Cell) => number, fastestRate = 1.65): Cell[] {
      const ban = blockedCells ? new Set(blockedCells) : blocked(); if (extra) ban.add(keyOf(extra.x, extra.y));
      const start = { x: clamp(Math.round(sx), 0, GRID_W - 1), y: clamp(Math.round(sy), 0, GRID_H - 1) };
      const goal = { x: clamp(Math.round(target.x), 0, GRID_W - 1), y: clamp(Math.round(target.y), 0, GRID_H - 1) }; ban.delete(keyOf(start.x, start.y)); ban.delete(keyOf(goal.x, goal.y));
      const startKey = keyOf(start.x, start.y), goalKey = keyOf(goal.x, goal.y), open = new Set([startKey]), prev = new Map<string, string>(), cost = new Map<string, number>([[startKey, 0]]), cells = new Map<string, Cell>([[startKey, start]]);
      const directions = [-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => ({ dx, dy }))).filter(d => d.dx || d.dy);
      while (open.size) {
        let currentKey = "", bestScore = Infinity;
        for (const candidate of open) {
          const cell = cells.get(candidate)!; const heuristic = Math.hypot(goal.x - cell.x, goal.y - cell.y) / fastestRate, score = (cost.get(candidate) ?? Infinity) + heuristic;
          if (score < bestScore) { bestScore = score; currentKey = candidate; }
        }
        if (currentKey === goalKey) break;
        open.delete(currentKey); const cur = cells.get(currentKey)!;
        for (const { dx, dy } of directions) {
          const n = { x: cur.x + dx, y: cur.y + dy }, nKey = keyOf(n.x, n.y); if (n.x < 0 || n.y < 0 || n.x >= GRID_W || n.y >= GRID_H || ban.has(nKey)) continue;
          if (dx && dy && (ban.has(keyOf(cur.x + dx, cur.y)) || ban.has(keyOf(cur.x, cur.y + dy)))) continue;
          const travelCost = stepCost ? stepCost(cur, n) : Math.hypot(dx, dy) / terrainSpeedMultiplier(cur, n), nextCost = (cost.get(currentKey) ?? 0) + travelCost;
          if (nextCost >= (cost.get(nKey) ?? Infinity)) continue;
          prev.set(nKey, currentKey); cost.set(nKey, nextCost); cells.set(nKey, n); open.add(nKey);
        }
      }
      if (goalKey !== startKey && !prev.has(goalKey)) return [];
      const out: Cell[] = []; let k = goalKey;
      while (k) { const [x, y] = k.split(",").map(Number); out.push({ x, y }); k = prev.get(k) || ""; }
      return out.reverse();
    }
    const friendlyBlocked = () => new Set(structures.filter(s => isPathBlocking(s) && !isMobileEmplacement(s)).map(s => keyOf(Math.round(s.x), Math.round(s.y))));
    const wallStairs = (wall: Structure) => [{ x: wall.x + 1, y: wall.y }, { x: wall.x - 1, y: wall.y }]
      .filter(cell => cell.x >= 0 && cell.y >= 0 && cell.x < GRID_W && cell.y < GRID_H);
    function groundRoute(from: Cell, to: Cell, ban = friendlyBlocked()) {
      if (ban.has(keyOf(Math.round(to.x), Math.round(to.y)))) return [];
      return findPathTo(from.x, from.y, { x: Math.round(to.x), y: Math.round(to.y) }, undefined, ban);
    }
    function planFriendlyMove(unit: Marine | Structure, destination: Cell, wall?: Structure, wallOffset: Cell = { x: 0, y: 0 }, destinationLift = 0) {
      const ban = friendlyBlocked(), currentWall = structures.find(s => s.id === unit.mountedOn && isWall(s));
      const departures = currentWall ? wallStairs(currentWall) : [{ x: unit.x, y: unit.y }];
      const arrivals = wall ? wallStairs(wall) : [destination];
      let best: MoveWaypoint[] = [];
      for (const departure of departures) for (const arrival of arrivals) {
        if (ban.has(keyOf(departure.x, departure.y)) || ban.has(keyOf(Math.round(arrival.x), Math.round(arrival.y)))) continue;
        const middle = groundRoute(departure, arrival, ban); if (!middle.length) continue;
        const route: MoveWaypoint[] = [{ x: unit.x, y: unit.y, lift: unit.lift }];
        if (currentWall) route.push({ ...departure, lift: 0 });
        route.push(...middle.slice(currentWall ? 1 : 0).map(cell => ({ ...cell, lift: 0 })));
        if (wall) route.push({ x: wall.x + wallOffset.x, y: wall.y + wallOffset.y, lift: wallTopLift(wall) });
        else if (Math.hypot(route[route.length - 1].x - destination.x, route[route.length - 1].y - destination.y) > 0.01) route.push({ ...destination, lift: destinationLift });
        else route[route.length - 1].lift = destinationLift;
        if (!best.length || route.length < best.length) best = route;
      }
      if (!best.length) return false;
      unit.targetX = best[best.length - 1].x; unit.targetY = best[best.length - 1].y; unit.movePath = best; unit.pathIndex = Math.min(1, best.length - 1);
      unit.mountTarget = wall?.id; unit.mountedOn = undefined;
      return true;
    }
    function advanceFriendly(unit: Marine | Structure, speed: number, turnSpeed: number, dt: number) {
      const waypoint = unit.movePath[unit.pathIndex];
      if (!waypoint) return false;
      const dx = waypoint.x - unit.x, dy = waypoint.y - unit.y, distance = Math.hypot(dx, dy);
      if (distance <= 0.025) {
        unit.x = waypoint.x; unit.y = waypoint.y; unit.lift = waypoint.lift; unit.pathIndex++;
        if (unit.pathIndex >= unit.movePath.length) { unit.movePath = []; unit.pathIndex = 0; unit.mountedOn = unit.mountTarget; unit.mountTarget = undefined; }
        return unit.movePath.length > 0;
      }
      const step = Math.min(distance, speed * dt), ratio = step / distance;
      unit.x += dx * ratio; unit.y += dy * ratio; unit.lift += (waypoint.lift - unit.lift) * ratio;
      turnToward(unit.group, Math.atan2(-dx, -dy), turnSpeed, dt);
      if ("vx" in unit) { unit.vx = dx / distance * speed; unit.vy = dy / distance * speed; }
      return true;
    }
    function emitHud(force = false) {
      if (!force && elapsed - lastHud < 0.12) return; lastHud = elapsed;
      callbacks.current.onHud({ credits, integrity, wave, enemies: enemies.length + spawnLeft, kills, active, gameOver, victory });
    }
    function message(text: string) { callbacks.current.onMessage(text); }
    function getUpgradeCost(s: Structure) {
      if (s.level >= 3) return null;
      return Math.round((ASSETS[s.kind].cost * (s.level === 1 ? 0.68 : 0.94)) / 5) * 5;
    }
    function getStructureInfo(s: Structure & { kind: UpgradableKey }): SelectedUnit {
      if (s.kind === "light") return { id: s.id, kind: s.kind, name: ASSETS[s.kind].name, level: s.level, maxLevel: 3, upgradeCost: getUpgradeCost(s), damage: 100 + (s.level - 1) * 40, range: Math.round((LIGHT_VISION_BASE + (s.level - 1) * LIGHT_VISION_PER_LEVEL) * 10) / 10, maxHp: s.maxHp, support: true };
      const stats = TURRET_STATS[s.kind], damageBoost = 1 + (s.level - 1) * 0.42;
      return { id: s.id, kind: s.kind, name: ASSETS[s.kind].name, level: s.level, maxLevel: 3, upgradeCost: getUpgradeCost(s), damage: Math.round(stats.damage * damageBoost * 10) / 10, range: Math.round((ASSETS[s.kind].range + (s.level - 1) * 0.65) * 10) / 10, maxHp: s.maxHp, support: false };
    }
    function publishStructureSelection() {
      const chosen = structures.find(s => selectedEmplacements.has(s.id));
      callbacks.current.onUnitSelected(chosen && isUpgradableStructure(chosen) && selectedEmplacements.size === 1 && selectedMarines.size === 0 ? getStructureInfo(chosen) : null);
    }
    function publishBarracksSelection() {
      const barracks = structures.find(s => s.id === selectedBarracksId && s.kind === "barracks");
      callbacks.current.onBarracksSelected(barracks ? { id: barracks.id } : null);
    }
    function addUpgradeVisual(s: Structure) {
      const color = s.level === 2 ? 0x62e8ff : 0xffd36a;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(s.kind === "howitzer" || s.kind === "missile" ? 0.78 : 0.62, 0.035, 7, 28), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3, roughness: 0.28 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.3 + s.level * 0.08; s.group.add(ring);
      if (s.level === 3) { const light = new THREE.PointLight(color, 1.1, 2.8); light.position.y = 1.1; s.group.add(light); }
    }
    function updateLightUpgradeVisual(s: Structure) {
      if (s.kind !== "light") return;
      const power = 1 + (s.level - 1) * 0.4;
      (s.group.userData.searchlights as THREE.SpotLight[] | undefined)?.forEach(light => { light.intensity = 7.5 * power; light.distance = 11 + (s.level - 1) * 2.5; light.angle = Math.PI / (5.5 - (s.level - 1) * 0.45); });
      const halo = s.group.userData.lightHalo as THREE.PointLight | undefined; if (halo) { halo.intensity = 2.8 * power; halo.distance = 8.5 + (s.level - 1) * 2; }
      const beacon = s.group.userData.lightBeacon as THREE.Mesh | undefined, material = beacon?.material as THREE.MeshStandardMaterial | undefined; if (material) material.emissiveIntensity = 2.8 * power;
    }
    function upgradeSelected() {
      const s = structures.find(item => selectedEmplacements.has(item.id) && isUpgradableStructure(item));
      if (!s || selectedEmplacements.size !== 1 || selectedMarines.size) return message("SELECT ONE DEFENSIVE UNIT TO UPGRADE");
      const cost = getUpgradeCost(s); if (cost === null) return message(`${ASSETS[s.kind].name.toUpperCase()} IS AT MAXIMUM LEVEL`);
      if (credits < cost) return message(`UPGRADE REQUIRES ${cost} COMMAND CREDITS`);
      credits -= cost; const oldMax = s.maxHp; s.level++; s.maxHp = Math.round(STRUCTURE_HP[s.kind] * (1 + (s.level - 1) * 0.35)); s.hp = Math.min(s.maxHp, s.hp + (s.maxHp - oldMax) + Math.round(oldMax * 0.2));
      if (s.kind === "light") updateLightUpgradeVisual(s);
      setHealthVisual(s.group, s.hp, s.maxHp); updateTierBadge(s.group, s.level); addUpgradeVisual(s); publishStructureSelection(); emitHud(true);
      burst(s.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)), s.level === 3 ? 0xffd36a : 0x62e8ff, 14); message(`${ASSETS[s.kind].name.toUpperCase()} UPGRADED TO TIER ${s.level}`);
    }
    function refreshTrenchConnections() {
      const trenches = structures.filter(s => s.kind === "trench");
      const directions = [
        { key: "north", dx: 0, dy: -1 }, { key: "south", dx: 0, dy: 1 },
        { key: "east", dx: 1, dy: 0 }, { key: "west", dx: -1, dy: 0 },
      ] as const;
      trenches.forEach(trench => {
        const edges = trench.group.userData.trenchEdges as Record<(typeof directions)[number]["key"], THREE.Group> | undefined;
        const connectors = trench.group.userData.trenchConnectors as Record<(typeof directions)[number]["key"], THREE.Group> | undefined;
        if (!edges || !connectors) return;
        directions.forEach(({ key, dx, dy }) => {
          const connected = trenches.some(other => other.id !== trench.id && other.x === trench.x + dx && other.y === trench.y + dy);
          edges[key].visible = !connected; connectors[key].visible = connected;
        });
      });
    }
    function addStructure(kind: AssetKey, x: number, y: number, free = false, mountedOn?: number, stackLevel = 0) {
      const group = kind === "rifle" ? makeRifleTeam() : kind === "sentry" ? makeSentry() : kind === "flame" ? makeFlameTurret() : kind === "laser" ? makeLaserTower() : kind === "railgun" ? makeRailgun() : kind === "howitzer" ? makeHowitzer() : kind === "missile" ? makeMissileBattery() : kind === "light" ? makeLightTower() : kind === "wall" ? makeWall() : kind === "bastion" ? makeBastion() : kind === "trench" ? makeTrench() : kind === "wire" ? makeWire() : kind === "mine" ? makeMine() : makeBarracks();
      const mountedWall = mountedOn ? structures.find(s => s.id === mountedOn && isWall(s)) : undefined;
      const mountCount = mountedOn ? structures.filter(s => s.mountedOn === mountedOn).length : 0;
      const lift = mountedWall ? wallTopLift(mountedWall) : kind === "wall" || kind === "bastion" ? stackLevel * WALL_STACK_HEIGHT : 0;
      group.position.copy(worldPos(x + (mountedOn ? (mountCount - 1) * 0.26 : 0), y, lift)); group.rotation.y = kind === "trench" ? 0 : kind === "wall" || kind === "bastion" || kind === "wire" ? Math.PI / 2 : -0.35; group.scale.multiplyScalar(mountedOn ? 0.58 : 0.72); attachHealthBar(group, kind === "wall" || kind === "bastion" ? 1.25 : kind === "barracks" ? 2 : 1.65); world.add(group);
      if (kind in TURRET_STATS || kind === "light") {
        const radius = kind === "howitzer" || kind === "missile" || kind === "railgun" ? 1.04 : 0.9;
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 28), new THREE.MeshBasicMaterial({ color: 0x7dff92, transparent: true, opacity: 0.95, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; group.add(ring); group.userData.selectionRing = ring;
        updateTierBadge(group, 1);
      }
      const maxHp = STRUCTURE_HP[kind], structure = { id: nextId++, kind, level: 1, x, y, targetX: x, targetY: y, hp: maxHp, maxHp, mountedOn, movePath: [], pathIndex: 0, lift, stackLevel, group, cooldown: Math.random() } satisfies Structure; structures.push(structure);
      if (kind === "trench") refreshTrenchConnections();
      if (!free) credits -= ASSETS[kind].cost;
      return structure;
    }
    function deployStartingForces() {
      map.startingStructures.forEach(({ kind, x, y }) => addStructure(kind, x, y, true));
      map.startingMarines.forEach(({ kind, x, y }) => spawnMarine(kind, x, y));
    }
    deployStartingForces();

    function transferWallTop(from: Structure, to: Structure) {
      const lift = wallTopLift(to);
      const retarget = (unit: Marine | Structure) => {
        unit.mountTarget = to.id;
        const destination = unit.movePath[unit.movePath.length - 1];
        if (destination) destination.lift = lift;
      };
      structures.filter(s => s.mountedOn === from.id).forEach(s => { s.mountedOn = to.id; s.lift = lift; });
      structures.filter(s => s.mountTarget === from.id).forEach(retarget);
      marines.filter(m => m.mountedOn === from.id).forEach(m => { m.mountedOn = to.id; m.lift = lift; });
      marines.filter(m => m.mountTarget === from.id).forEach(retarget);
    }

    function tryPlace(x: number, y: number) {
      const kind = selectedRef.current, asset = ASSETS[kind];
      if (gameOver) return;
      if (credits < asset.cost) return message("INSUFFICIENT COMMAND CREDITS");
      const wall = topWallAt(x, y), stackingWall = !!wall && (kind === "wall" || kind === "bastion");
      const canMount = !!wall && (kind in TURRET_STATS || kind === "light");
      const occupied = structures.some(s => Math.hypot(s.x - x, s.y - y) < 0.72 && !s.mountedOn && !(stackingWall && isWall(s)));
      if ((x === baseCell.x && y === baseCell.y) || spawnCells.some(cell => x === cell.x && y === cell.y)) return message("DEPLOYMENT ZONE OCCUPIED");
      if (occupied && !canMount && !stackingWall) return message(wall ? "ONLY TURRETS, LIGHTS, OR MORE WALLS CAN USE THIS POSITION" : "DEPLOYMENT ZONE OCCUPIED");
      const stackLevel = stackingWall ? wall.stackLevel + 1 : 0;
      const placed = addStructure(kind, x, y, false, canMount ? wall.id : undefined, stackLevel);
      if (stackingWall) transferWallTop(wall, placed);
      if (kind !== "mine" && kind !== "wire" && !canMount) enemies.forEach(e => { e.pathTimer = 0; e.index = 0; });
      const action = stackingWall ? `STACKED · WALL LEVEL ${stackLevel + 1}` : canMount ? "MOUNTED ON WALL" : "DEPLOYED";
      message(`${asset.name.toUpperCase()} ${action} · ELEVATION ${Math.round((heights[y][x] + placed.lift) * 100)}M`); emitHud(true);
    }
    function destroyStructure(s: Structure, salvaged = false) {
      if (!structures.includes(s)) return;
      if (s.kind === "trench") marines.filter(m => m.trenchId === s.id).forEach(m => { m.trenchId = undefined; m.lift = 0; });
      const collapsingWalls = isWall(s) ? structures.filter(other => isWall(other) && other.x === s.x && other.y === s.y && other.stackLevel >= s.stackLevel) : [];
      const collapsingWallIds = new Set(collapsingWalls.map(wall => wall.id));
      if (isWall(s)) {
        structures.filter(other => other.mountedOn !== undefined && collapsingWallIds.has(other.mountedOn)).forEach(other => { selectedEmplacements.delete(other.id); burst(other.group.position, 0xff794f, 10); removeHealthBar(other.group); world.remove(other.group); structures.splice(structures.indexOf(other), 1); });
        structures.filter(other => other.mountTarget !== undefined && collapsingWallIds.has(other.mountTarget)).forEach(other => { other.mountTarget = undefined; other.movePath = []; other.pathIndex = 0; other.targetX = other.x; other.targetY = other.y; });
        marines.filter(m => m.mountedOn !== undefined && collapsingWallIds.has(m.mountedOn)).forEach(m => { m.mountedOn = undefined; m.lift = 0; m.hp = Math.max(0, m.hp - 35); setHealthVisual(m.group, m.hp, m.maxHp); m.targetX = clamp(m.x + 1, 0, GRID_W - 1); m.targetY = m.y; m.movePath = []; m.pathIndex = 0; });
        marines.filter(m => m.mountTarget !== undefined && collapsingWallIds.has(m.mountTarget)).forEach(m => { m.mountTarget = undefined; m.movePath = []; m.pathIndex = 0; m.targetX = m.x; m.targetY = m.y; });
        collapsingWalls.filter(wall => wall !== s).forEach(wall => { burst(wall.group.position, 0xff794f, 7); removeHealthBar(wall.group); world.remove(wall.group); structures.splice(structures.indexOf(wall), 1); });
      }
      selectedEmplacements.delete(s.id);
      if (selectedBarracksId === s.id) { selectedBarracksId = null; publishBarracksSelection(); }
      publishStructureSelection();
      if (salvaged) credits += Math.floor(ASSETS[s.kind].cost * 0.6);
      burst(s.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), salvaged ? 0x9dff8b : 0xff553f, salvaged ? 5 : 15);
      removeHealthBar(s.group); world.remove(s.group); structures.splice(structures.indexOf(s), 1);
      if (s.kind === "trench") refreshTrenchConnections();
      enemies.forEach(e => { e.pathTimer = 0; e.index = 0; });
    }
    function removeStructureAt(x: number, y: number) {
      const s = structures.filter(item => Math.hypot(item.x - x, item.y - y) < 0.72).sort((a, b) => Number(!!b.mountedOn) - Number(!!a.mountedOn) || b.stackLevel - a.stackLevel)[0]; if (!s) return;
      destroyStructure(s, true);
      message(`${ASSETS[s.kind].name.toUpperCase()} SALVAGED · +${Math.floor(ASSETS[s.kind].cost * 0.6)} CREDITS`); emitHud(true);
    }
    function spawnMarine(kind: MarineKind, x: number, y: number, mountedOn?: number) {
      const stats = MARINE_STATS[kind], mountedWall = mountedOn ? structures.find(s => s.id === mountedOn && isWall(s)) : undefined, lift = mountedWall ? wallTopLift(mountedWall) : 0;
      const m = makeSoldier(1.12, kind); m.position.copy(worldPos(x, y, lift));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(stats.color), transparent: true, opacity: 0.95, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; ring.visible = false; m.add(ring); m.userData.selectionRing = ring;
      attachHealthBar(m, 1.22); world.add(m); const id = nextId++;
      marines.push({ id, kind, x, y, targetX: x, targetY: y, vx: 0, vy: 0, hp: stats.hp, maxHp: stats.hp, cooldown: 0, supportCooldown: 0, mountedOn, movePath: [], pathIndex: 0, lift, group: m }); return id;
    }
    function refreshSelection() {
      marines.forEach(m => { const ring = m.group.userData.selectionRing as THREE.Mesh; if (ring) ring.visible = selectedMarines.has(m.id); });
      structures.filter(isUpgradableStructure).forEach(s => { const ring = s.group.userData.selectionRing as THREE.Mesh; if (ring) ring.visible = selectedEmplacements.has(s.id); });
    }
    function selectUnitAt(x: number, y: number, additive = false) {
      const candidates = [
        ...marines.map(m => ({ id: m.id, x: m.x, y: m.y, type: "marine" as const })),
        ...structures.filter(isUpgradableStructure).map(s => ({ id: s.id, x: s.x, y: s.y, type: "emplacement" as const })),
      ].filter(unit => Math.hypot(unit.x - x, unit.y - y) < 0.72).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
      const clicked = candidates[0];
      if (!clicked) { if (!additive) { selectedMarines.clear(); selectedEmplacements.clear(); refreshSelection(); publishStructureSelection(); } return false; }
      if (!additive) { selectedMarines.clear(); selectedEmplacements.clear(); }
      const selection = clicked.type === "marine" ? selectedMarines : selectedEmplacements;
      if (additive && selection.has(clicked.id)) selection.delete(clicked.id); else selection.add(clicked.id); refreshSelection(); publishStructureSelection();
      const count = selectedMarines.size + selectedEmplacements.size, selectedStructure = structures.find(s => s.id === clicked.id);
      message(clicked.type === "emplacement" && count === 1 && selectedStructure ? `${ASSETS[selectedStructure.kind].name.toUpperCase()} SELECTED · UPGRADE PANEL ONLINE` : `${count} UNIT${count === 1 ? "" : "S"} SELECTED · RIGHT-CLICK TO MOVE`); return true;
    }
    function commandFormation(x: number, y: number) {
      const trench = structures.find(s => s.kind === "trench" && s.x === x && s.y === y);
      if (trench) {
        const infantry = marines.filter(m => selectedMarines.has(m.id));
        if (!infantry.length) { message("TRENCHES ACCEPT INFANTRY ONLY · CREWED WEAPONS CANNOT ENTER"); return selectedEmplacements.size > 0; }
        const occupied = marines.filter(m => m.trenchId === trench.id && !selectedMarines.has(m.id)).length, available = Math.max(0, TRENCH_CAPACITY - occupied);
        if (!available) { message("TRENCH AT CAPACITY · FOUR INFANTRY MAXIMUM"); return true; }
        const positions: Cell[] = [{ x: -0.23, y: -0.22 }, { x: 0.23, y: -0.22 }, { x: -0.23, y: 0.22 }, { x: 0.23, y: 0.22 }];
        let routed = 0;
        infantry.slice(0, available).forEach((unit, index) => {
          const slot = positions[occupied + index], destination = { x: trench.x + slot.x, y: trench.y + slot.y };
          if (planFriendlyMove(unit, destination, undefined, undefined, -0.16)) { unit.trenchId = trench.id; routed++; }
        });
        message(routed ? `${routed} INFANTRY ENTERING TRENCH · 40% INCOMING DAMAGE REDUCTION${infantry.length > available ? " · CAPACITY REACHED" : ""}` : "NO SAFE ROUTE TO TRENCH"); return true;
      }
      const squad = [
        ...marines.filter(m => selectedMarines.has(m.id)).map(unit => ({ type: "marine" as const, unit })),
        ...structures.filter(s => selectedEmplacements.has(s.id) && isMobileEmplacement(s)).map(unit => ({ type: "emplacement" as const, unit })),
      ]; if (!squad.length) return false;
      const cx = squad.reduce((sum, member) => sum + member.unit.x, 0) / squad.length, cy = squad.reduce((sum, member) => sum + member.unit.y, 0) / squad.length;
      const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1, forwardX = dx / len, forwardY = dy / len, rightX = -forwardY, rightY = forwardX;
      const columns = Math.ceil(Math.sqrt(squad.length)), rows = Math.ceil(squad.length / columns), spacing = 0.7;
      const wall = topWallAt(x, y);
      let routed = 0;
      squad.forEach((member, i) => {
        const row = Math.floor(i / columns), column = i % columns, unitsInRow = Math.min(columns, squad.length - row * columns);
        const lateral = (column - (unitsInRow - 1) / 2) * spacing, forward = ((rows - 1) / 2 - row) * spacing;
        const offsetX = rightX * lateral + forwardX * forward, offsetY = rightY * lateral + forwardY * forward;
        const destination = wall ? { x: wall.x, y: wall.y } : { x: clamp(x + offsetX, 0, GRID_W - 1), y: clamp(y + offsetY, 0, GRID_H - 1) };
        const wallScale = 0.42;
        if (planFriendlyMove(member.unit, destination, wall, wall ? { x: offsetX * wallScale, y: offsetY * wallScale } : undefined)) { if (member.type === "marine") member.unit.trenchId = undefined; routed++; }
      });
      if (!routed) { message("NO SAFE ROUTE · WALLS AND FORTIFICATIONS BLOCK THE FORMATION"); return true; }
      message(`${routed}-UNIT COMPACT ${columns}×${rows} FORMATION ${wall ? "ROUTING TO WALL STAIRS" : "ROUTING AROUND FORTIFICATIONS"} · CREWED WEAPONS MOVE SLOWLY`); return true;
    }
    function selectBarracksAt(x: number, y: number) {
      const barracks = structures.find(s => s.kind === "barracks" && s.x === x && s.y === y); if (!barracks) return false;
      selectedMarines.clear(); selectedEmplacements.clear(); refreshSelection(); publishStructureSelection(); selectedBarracksId = barracks.id; publishBarracksSelection();
      message("BARRACKS SELECTED · INSTANT INFANTRY DEPLOYMENT ONLINE"); return true;
    }
    function recruit(kind: MarineKind) {
      const stats = MARINE_STATS[kind], barracks = structures.find(s => s.id === selectedBarracksId && s.kind === "barracks");
      if (!barracks) return message("SELECT A FIELD BARRACKS FIRST");
      if (credits < stats.cost) return message(`${stats.name.toUpperCase()} REQUIRES ${stats.cost} COMMAND CREDITS`);
      credits -= stats.cost; const n = marines.length; spawnMarine(kind, clamp(barracks.x + 0.6 + (n % 3) * 0.28, 0, GRID_W - 1), clamp(barracks.y - 0.7 + (n % 2) * 0.45, 0, GRID_H - 1)); publishBarracksSelection(); message(`${stats.name.toUpperCase()} DEPLOYED INSTANTLY · DRAG A BOX TO ADD THEM TO A SQUAD`); emitHud(true);
    }
    const assaultOffsets: Cell[] = [{ x: 0, y: 0 }, { x: 0.24, y: 0.18 }, { x: -0.24, y: 0.18 }, { x: 0.18, y: -0.24 }];
    function spawnEnemy(spawnCell: Cell, formationIndex = 0) {
      const weights: Array<[AlienKind, number]> = [
        ["drone", Math.max(30, 82 - wave * 2)],
        ["spitter", wave >= 3 ? 18 + wave * 0.8 : 0],
        ["stalker", 10 + wave * 0.45],
        ["brute", wave >= 7 ? 7 + wave * 0.55 : 0],
        ["strider", wave >= 8 ? 7 + wave * 0.42 : 0],
        ["razortail", wave >= 10 ? 6 + wave * 0.5 : 0],
        ["broodmother", wave >= 12 ? 4 + wave * 0.36 : 0],
      ];
      let roll = Math.random() * weights.reduce((sum, [, weight]) => sum + weight, 0), kind: AlienKind = "drone";
      for (const [candidate, weight] of weights) { roll -= weight; if (roll <= 0) { kind = candidate; break; } }
      const stats = ENEMY_STATS[kind], scale = 1 + wave * 0.055, hp = stats.hp * scale, offset = assaultOffsets[formationIndex % assaultOffsets.length];
      const spawnX = clamp(spawnCell.x + offset.x, 0, GRID_W - 1), spawnY = clamp(spawnCell.y + offset.y, 0, GRID_H - 1);
      const group = makeAlien(kind), p = worldPos(spawnX, spawnY); group.position.copy(p); group.rotation.y = (Math.random() - 0.5) * 0.7; attachHealthBar(group, stats.barHeight); world.add(group);
      enemies.push({ id: nextId++, kind, x: spawnX, y: spawnY, hp, maxHp: hp, speed: stats.speed * ALIEN_SPEED_MULTIPLIER * (1 + wave * 0.008), damage: stats.damage * (1 + wave * 0.022), reward: stats.reward, path: [], index: 0, group, hitFlash: 0, attackCooldown: Math.random() * 0.35, pathTimer: 0, targetBiasSeed: Math.random(), targetId: null, targetType: "base" });
    }
    function spawnAssaultGroup() {
      const groupSize = Math.min(spawnLeft, MAX_ACTIVE_ENEMIES - enemies.length, Math.min(8, 4 + Math.floor(wave / 4)));
      if (groupSize <= 0) return;
      for (let i = 0; i < groupSize; i++) {
        const frontIndex = (assaultFront + i) % spawnCells.length, formationIndex = Math.floor(i / spawnCells.length);
        spawnEnemy(spawnCells[frontIndex], formationIndex);
      }
      spawnLeft -= groupSize; assaultFront = (assaultFront + 1 + Math.floor(Math.random() * 2)) % spawnCells.length;
      const activeFronts = Math.min(spawnCells.length, groupSize); message(`CONTACT · ${groupSize}-ALIEN ASSAULT GROUP ACROSS ${activeFronts} FRONTS`);
    }
    function startWave() {
      if (active || gameOver) return;
      if (wave >= MAX_WAVES) { victory = true; gameOver = true; message("SECTOR SECURED · ALL WAVES REPELLED"); emitHud(true); return; }
      wave++; active = true; spawnLeft = (14 + Math.floor(wave * 2.35)) * ENEMY_SWARM_MULTIPLIER; spawnTimer = 0.45; assaultFront = Math.floor(Math.random() * spawnCells.length); message(`WAVE ${String(wave).padStart(2, "0")} INBOUND · ${spawnLeft} LIFE SIGNS · THREE FRONTS`); emitHud(true);
    }
    function burst(at: THREE.Vector3, color: number, count = 10) {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.05, 5, 4), new THREE.MeshBasicMaterial({ color, transparent: true })); mesh.position.copy(at); world.add(mesh);
        particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 2.8, Math.random() * 2.3, (Math.random() - 0.5) * 2.8), life: 0.5 + Math.random() * 0.5, maxLife: 1 });
      }
    }
    function hostileStrike(kind: AlienKind, from: THREE.Vector3, to: THREE.Vector3, targetType: "marine" | "structure", targetId: number, damage: number) {
      const group = new THREE.Group(), startHeight = kind === "brute" ? 0.85 : kind === "broodmother" ? 1.05 : kind === "razortail" ? 0.68 : kind === "spitter" ? 0.66 : kind === "strider" ? 0.92 : kind === "stalker" ? 0.25 : 0.38;
      const start = from.clone().add(new THREE.Vector3(0, startHeight, 0)), end = to.clone().add(new THREE.Vector3(0, 0.58, 0));
      let speed = 7.5, arcHeight = 0.08, color = 0xff9857, impactCount = 5;
      if (kind === "drone") {
        const needle = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.46, 6), new THREE.MeshStandardMaterial({ color: 0xe6b56d, emissive: 0x6d2816, emissiveIntensity: 0.7, roughness: 0.38 }));
        needle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); needle.castShadow = true; group.add(needle);
      } else if (kind === "spitter") {
        speed = 2.15; arcHeight = 0.78; color = 0x63ff9f; impactCount = 11;
        const glob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), new THREE.MeshStandardMaterial({ color, emissive: 0x22b862, emissiveIntensity: 2.2, transparent: true, opacity: 0.92, roughness: 0.18 })); group.add(glob);
        for (const side of [-1, 1]) { const droplet = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), new THREE.MeshBasicMaterial({ color: 0xa4ffc2 })); droplet.position.set(side * 0.13, side * 0.04, 0.06); group.add(droplet); }
        const light = new THREE.PointLight(color, 2.2, 3.4); group.add(light);
      } else if (kind === "broodmother") {
        speed = 1.7; arcHeight = 1.45; color = 0xff73aa; impactCount = 17;
        const egg = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa84970, emissive: 0x721f4a, emissiveIntensity: 1.8, roughness: 0.38 })); egg.scale.set(0.82, 1.18, 0.82); group.add(egg);
        for (let i = 0; i < 4; i++) { const vein = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 5, 12), new THREE.MeshBasicMaterial({ color: 0xffa2c5 })); vein.rotation.set(i * 0.7, i * 1.1, 0); group.add(vein); }
        const light = new THREE.PointLight(color, 2.5, 4); group.add(light);
      } else if (kind === "brute") {
        speed = 3.25; arcHeight = 0.38; color = 0xff493c; impactCount = 15;
        const chunk = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x5c211d, emissive: 0x7e1812, emissiveIntensity: 1.1, roughness: 0.46, metalness: 0.15 })); chunk.scale.set(0.85, 0.85, 1.8); chunk.castShadow = true; group.add(chunk);
        for (const side of [-1, 1]) { const barb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 5), new THREE.MeshStandardMaterial({ color: 0xd16a4d, roughness: 0.5 })); barb.position.x = side * 0.18; barb.rotation.z = side * 0.9; group.add(barb); }
      } else if (kind === "razortail") {
        speed = 4.1; arcHeight = 0.22; color = 0xe66bff; impactCount = 13;
        const barb = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.72, 7), new THREE.MeshStandardMaterial({ color: 0xd58ce0, emissive: 0x4f145d, emissiveIntensity: 1.25, roughness: 0.36, metalness: 0.28 }));
        barb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); barb.castShadow = true; group.add(barb);
      } else if (kind === "strider") {
        speed = 5.8; arcHeight = 0.12; color = 0xffe56d; impactCount = 9;
        const lance = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.72, 6), new THREE.MeshStandardMaterial({ color: 0xffed8a, emissive: 0x8e741b, emissiveIntensity: 2.4, roughness: 0.18 }));
        lance.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); group.add(lance);
        const light = new THREE.PointLight(color, 1.8, 3.2); group.add(light);
      } else {
        speed = 10.5; arcHeight = 0.02; color = 0x58ddff; impactCount = 4;
        const slash = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.38, 5), new THREE.MeshBasicMaterial({ color })); slash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); group.add(slash);
      }
      group.position.copy(start); world.add(group); hostileProjectiles.push({ group, kind, from: start, to: end, t: 0, speed, arcHeight, targetId, targetType, damage, color, impactCount });
    }
    function fire(from: THREE.Vector3, target: Enemy, damage: number, splash: number, color: number, heavy = false, arcHeight = 0, rocket = false, sourceStructureId?: number) {
      const to = target.group.position.clone().add(new THREE.Vector3(0, 0.42, 0)); let mesh: THREE.Object3D;
      if (rocket) {
        const projectile = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x5c665e, metalness: 0.42, roughness: 0.34 })); projectile.add(body);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.16, 8), new THREE.MeshStandardMaterial({ color, emissive: 0x7f2314, emissiveIntensity: 0.8, roughness: 0.3 })); nose.position.y = 0.24; projectile.add(nose);
        const exhaust = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffc45d })); exhaust.position.y = -0.2; projectile.add(exhaust);
        projectile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()); mesh = projectile;
      } else mesh = new THREE.Mesh(new THREE.SphereGeometry(heavy ? 0.11 : 0.045, 7, 5), new THREE.MeshBasicMaterial({ color }));
      mesh.position.copy(from); world.add(mesh);
      bullets.push({ mesh, from: from.clone(), to, impactX: target.x, impactY: target.y, t: 0, speed: heavy ? 1.35 : 4.8, target: target.id, damage, splash, arcHeight, color, sourceStructureId });
    }
    function incomingDamageAt(enemy: Enemy) {
      return bullets.reduce((total, shot) => {
        if (!shot.splash) return total + (shot.target === enemy.id ? shot.damage : 0);
        const trackedTarget = enemies.find(candidate => candidate.id === shot.target && candidate.hp > 0);
        const impactX = trackedTarget?.x ?? shot.impactX, impactY = trackedTarget?.y ?? shot.impactY;
        const distance = Math.hypot(enemy.x - impactX, enemy.y - impactY);
        return distance <= shot.splash ? total + shot.damage * (1 - distance / (shot.splash * 1.8)) : total;
      }, 0);
    }
    function chooseArtilleryTarget(candidates: Enemy[], damage: number, splash: number) {
      const remainingHp = new Map(candidates.map(enemy => [enemy.id, Math.max(0, enemy.hp - incomingDamageAt(enemy))]));
      const viableTargets = candidates.filter(enemy => (remainingHp.get(enemy.id) ?? 0) > 0);
      let bestTarget: Enemy | undefined, bestScore = -Infinity;
      for (const target of viableTargets) {
        const usefulBlastDamage = candidates.reduce((total, enemy) => {
          const distance = Math.hypot(enemy.x - target.x, enemy.y - target.y);
          if (distance > splash) return total;
          const blastDamage = damage * (1 - distance / (splash * 1.8));
          return total + Math.min(remainingHp.get(enemy.id) ?? 0, blastDamage);
        }, 0);
        const score = usefulBlastDamage + target.index * 0.001;
        if (score > bestScore) { bestTarget = target; bestScore = score; }
      }
      return bestTarget;
    }
    function laserStrike(from: THREE.Vector3, target: Enemy, damage: number, color: number) {
      const to = target.group.position.clone().add(new THREE.Vector3(0, 0.48, 0)), direction = to.clone().sub(from), length = direction.length(), midpoint = from.clone().add(to).multiplyScalar(0.5);
      for (const [radius, opacity] of [[0.035, 1], [0.11, 0.24]] as const) {
        const trace = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
        trace.position.copy(midpoint); trace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); trace.renderOrder = 18; world.add(trace); particles.push({ mesh: trace, velocity: new THREE.Vector3(), life: 0.14, maxLife: 0.14 });
      }
      damageEnemy(target, damage); burst(to, color, 7);
    }
    function damageEnemy(e: Enemy, amount: number) { e.hp = clamp(e.hp - Math.max(0, amount), 0, e.maxHp); e.hitFlash = 0.09; setHealthVisual(e.group, e.hp, e.maxHp); }
    function provokeEnemy(e: Enemy, sourceStructureId?: number) {
      if (!sourceStructureId || e.hp <= 0) return;
      e.retaliateAgainstId = sourceStructureId; e.pathTimer = 0;
    }
    function restart() {
      [...structures, ...enemies, ...marines].forEach(o => { removeHealthBar(o.group); world.remove(o.group); }); bullets.forEach(b => world.remove(b.mesh)); hostileProjectiles.forEach(p => world.remove(p.group)); particles.forEach(p => world.remove(p.mesh));
      structures = []; enemies = []; marines = []; bullets = []; hostileProjectiles = []; particles = []; selectedMarines.clear(); selectedEmplacements.clear(); selectedBarracksId = null; callbacks.current.onUnitSelected(null); callbacks.current.onBarracksSelected(null); credits = 750; integrity = 100; wave = 0; kills = 0; active = false; gameOver = false; victory = false; spawnLeft = 0; spawnTimer = 0; assaultFront = 0;
      deployStartingForces(); message("COMMAND SYSTEMS RESET · AWAITING DEPLOYMENT"); emitHud(true);
    }
    function rotate() {
      const offset = camera.position.clone().sub(controls.target); const a = Math.PI / 2;
      camera.position.set(controls.target.x + offset.x * Math.cos(a) - offset.z * Math.sin(a), camera.position.y, controls.target.z + offset.x * Math.sin(a) + offset.z * Math.cos(a)); controls.update();
    }
    apiRef.current = { start: startWave, restart, rotate, upgradeSelected, recruit };

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
        const minX = Math.min(downX, e.clientX), maxX = Math.max(downX, e.clientX), minY = Math.min(downY, e.clientY), maxY = Math.max(downY, e.clientY), r = renderer.domElement.getBoundingClientRect(); if (!e.shiftKey) { selectedMarines.clear(); selectedEmplacements.clear(); }
        marines.forEach(m => { const p = m.group.getWorldPosition(new THREE.Vector3()).project(camera), sx = r.left + (p.x + 1) * r.width / 2, sy = r.top + (-p.y + 1) * r.height / 2; if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selectedMarines.add(m.id); });
        structures.filter(isUpgradableStructure).forEach(s => { const p = s.group.getWorldPosition(new THREE.Vector3()).project(camera), sx = r.left + (p.x + 1) * r.width / 2, sy = r.top + (-p.y + 1) * r.height / 2; if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selectedEmplacements.add(s.id); }); selectedBarracksId = null; refreshSelection(); publishStructureSelection(); publishBarracksSelection(); const count = selectedMarines.size + selectedEmplacements.size; message(`${count} UNIT${count === 1 ? "" : "S"} BOX-SELECTED · RIGHT-CLICK FOR COMPACT FORMATION`); return;
      }
      const tile = pick(e); if (!tile) return; const x = tile.userData.x, y = tile.userData.y;
      const stackOrder = (selectedRef.current === "wall" || selectedRef.current === "bastion") && !!topWallAt(x, y);
      if (stackOrder) { tryPlace(x, y); return; }
      if (selectBarracksAt(x, y)) return; if (selectUnitAt(x, y, e.shiftKey)) { selectedBarracksId = null; publishBarracksSelection(); return; } if (!selectedMarines.size && !selectedEmplacements.size) { selectedBarracksId = null; publishBarracksSelection(); tryPlace(x, y); }
    }
    function onContext(e: MouseEvent) { e.preventDefault(); if (Math.hypot(e.clientX - rightDownX, e.clientY - rightDownY) > 6) return; const tile = pick(e as PointerEvent); if (!tile) return; if (e.shiftKey) removeStructureAt(tile.userData.x, tile.userData.y); else if (!commandFormation(tile.userData.x, tile.userData.y)) message("SELECT RIFLEMEN OR CREWED WEAPONS WITH A CLICK OR DRAG BOX FIRST"); }
    function onKey(e: KeyboardEvent) { heldKeys.add(e.key.toLowerCase()); if (e.key.toLowerCase() === "r") rotate(); if (e.key === "Escape") { selectedMarines.clear(); selectedEmplacements.clear(); selectedBarracksId = null; refreshSelection(); publishStructureSelection(); publishBarracksSelection(); } if (e.code === "Space") { e.preventDefault(); startWave(); } }
    function onKeyUp(e: KeyboardEvent) { heldKeys.delete(e.key.toLowerCase()); }
    renderer.domElement.addEventListener("pointermove", onMove, true); renderer.domElement.addEventListener("pointerdown", onDown, true); renderer.domElement.addEventListener("pointerup", onUp, true); renderer.domElement.addEventListener("contextmenu", onContext); window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);

    function turnToward(group: THREE.Group, angle: number, speed: number, dt: number) {
      const delta = Math.atan2(Math.sin(angle - group.rotation.y), Math.cos(angle - group.rotation.y));
      group.rotation.y += delta * Math.min(1, speed * dt);
    }

    function update(dt: number) {
      elapsed += dt; spawnBeacons.forEach(beacon => { beacon.portal.rotation.z += dt * 0.7; beacon.inner.rotation.z -= dt * 0.42; beacon.light.intensity = 2.6 + Math.sin(elapsed * 3.2 + beacon.phase) * 0.7; });
      const forward = controls.target.clone().sub(camera.position); forward.y = 0; forward.normalize(); const right = new THREE.Vector3(-forward.z, 0, forward.x); const intent = new THREE.Vector3();
      if (heldKeys.has("w")) intent.add(forward); if (heldKeys.has("s")) intent.sub(forward); if (heldKeys.has("d")) intent.add(right); if (heldKeys.has("a")) intent.sub(right);
      if (intent.lengthSq()) cameraVelocity.addScaledVector(intent.normalize(), dt * 25); cameraVelocity.multiplyScalar(Math.exp(-dt * 5.2));
      const cameraStep = cameraVelocity.clone().multiplyScalar(dt); camera.position.add(cameraStep); controls.target.add(cameraStep); controls.target.x = clamp(controls.target.x, -21, 21); controls.target.z = clamp(controls.target.z, -16, 16);
      if (active && spawnLeft > 0 && enemies.length < MAX_ACTIVE_ENEMIES) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) { spawnAssaultGroup(); spawnTimer = (Math.max(1.15, 2.45 - wave * 0.045) + Math.random() * 0.55) / ENEMY_SWARM_MULTIPLIER; }
      }
      updateFogOfWar(dt);
      const enemyBuckets = new Map<string, Enemy[]>();
      for (const enemy of enemies) {
        const bucketKey = keyOf(Math.floor(enemy.x / ENEMY_SEPARATION_DISTANCE), Math.floor(enemy.y / ENEMY_SEPARATION_DISTANCE));
        const bucket = enemyBuckets.get(bucketKey);
        if (bucket) bucket.push(enemy); else enemyBuckets.set(bucketKey, [enemy]);
      }
      type EnemyTargetChoice = { type: "marine" | "structure" | "base"; id: number | null; x: number; y: number; group: THREE.Group; directDistance: number };
      type EnemyRoute = { path: Cell[]; travelTime: number };
      const enemyPathCache = new Map<string, EnemyRoute>();
      const groundEnemyBlocked = blockedForEnemy("drone"), wallClimberBlocked = blockedForEnemy("stalker");
      const wallTraversalHeights = new Map<string, number>();
      structures.filter(isWall).forEach(wall => wallTraversalHeights.set(keyOf(wall.x, wall.y), Math.max(wallTraversalHeights.get(keyOf(wall.x, wall.y)) ?? 0, wallTopLift(wall))));
      const wallLiftAt = (cell: Cell) => wallTraversalHeights.get(keyOf(Math.round(cell.x), Math.round(cell.y))) ?? 0;
      const targetPreferenceMultiplier = (enemy: Enemy, target: EnemyTargetChoice) => {
        const typeCode = target.type === "base" ? 3 : target.type === "marine" ? 11 : 23, targetCode = (target.id ?? 0) * 31 + typeCode;
        const raw = Math.sin((enemy.id + 1) * 12.9898 + enemy.targetBiasSeed * 104729 + targetCode * 78.233) * 43758.5453, preference = raw - Math.floor(raw);
        return 1 + (preference - 0.5) * TARGET_SELECTION_VARIANCE;
      };
      const enemyStepTime = (enemy: Enemy, from: Cell, to: Cell) => {
        const terrainRate = terrainSpeedMultiplier(from, to), routeTerrainRate = 1 + (terrainRate - 1) * ENEMY_TERRAIN_ROUTE_SLOPE_WEIGHT;
        const groundTime = Math.hypot(to.x - from.x, to.y - from.y) / Math.max(0.01, enemy.speed * routeTerrainRate);
        const terrainClimbTime = Math.max(0, heights[to.y][to.x] - heights[from.y][from.x]) / ENEMY_TERRAIN_ROUTE_CLIMB_SPEED;
        const climbTime = WALL_CLIMBERS.has(enemy.kind) ? Math.abs(wallLiftAt(to) - wallLiftAt(from)) / WALL_CLIMB_SPEED : 0;
        return groundTime + terrainClimbTime + climbTime;
      };
      const routeFor = (enemy: Enemy, target: EnemyTargetChoice) => {
        const startX = Math.round(enemy.x), startY = Math.round(enemy.y), goalX = Math.round(target.x), goalY = Math.round(target.y), climbsWalls = WALL_CLIMBERS.has(enemy.kind);
        const pathKey = `${enemy.kind}:${startX},${startY}>${goalX},${goalY}`;
        const cached = enemyPathCache.get(pathKey); if (cached) return cached;
        const path = findPathTo(enemy.x, enemy.y, { x: target.x, y: target.y }, undefined, climbsWalls ? wallClimberBlocked : groundEnemyBlocked, (from, to) => enemyStepTime(enemy, from, to), enemy.speed * 1.65);
        let travelTime = path.length ? Math.hypot(enemy.x - path[0].x, enemy.y - path[0].y) / Math.max(0.01, enemy.speed * 1.65) : Infinity;
        for (let i = 1; i < path.length; i++) travelTime += enemyStepTime(enemy, path[i - 1], path[i]);
        const route = { path, travelTime }; enemyPathCache.set(pathKey, route); return route;
      };
      for (const e of enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt); e.attackCooldown -= dt; e.pathTimer -= dt;
        let separationX = 0, separationY = 0;
        const bucketX = Math.floor(e.x / ENEMY_SEPARATION_DISTANCE), bucketY = Math.floor(e.y / ENEMY_SEPARATION_DISTANCE);
        for (let offsetY = -1; offsetY <= 1; offsetY++) for (let offsetX = -1; offsetX <= 1; offsetX++) {
          for (const other of enemyBuckets.get(keyOf(bucketX + offsetX, bucketY + offsetY)) ?? []) {
            if (other.id === e.id) continue;
            const apartX = e.x - other.x, apartY = e.y - other.y, apart = Math.hypot(apartX, apartY);
            if (apart >= ENEMY_SEPARATION_DISTANCE) continue;
            const force = (ENEMY_SEPARATION_DISTANCE - apart) / ENEMY_SEPARATION_DISTANCE;
            if (apart < 0.001) { const angle = (e.id * 2.399 + other.id * 0.73) % (Math.PI * 2); separationX += Math.cos(angle) * force; separationY += Math.sin(angle) * force; }
            else { separationX += apartX / apart * force; separationY += apartY / apart * force; }
          }
        }
        const separationLength = Math.hypot(separationX, separationY);
        if (separationLength > 0.001) { const separationStep = Math.min(0.42 * dt, separationLength * 0.08); e.x = clamp(e.x + separationX / separationLength * separationStep, 0, GRID_W - 1); e.y = clamp(e.y + separationY / separationLength * separationStep, 0, GRID_H - 1); }
        const enemyStats = ENEMY_STATS[e.kind], climbsWalls = WALL_CLIMBERS.has(e.kind);
        const targets: EnemyTargetChoice[] = [{ type: "base", id: null, x: baseCell.x, y: baseCell.y, group: base, directDistance: Math.hypot(baseCell.x - e.x, baseCell.y - e.y) }];
        marines.forEach(m => targets.push({ type: "marine", id: m.id, x: m.x, y: m.y, group: m.group, directDistance: Math.hypot(m.x - e.x, m.y - e.y) }));
        structures.forEach(s => { if ((isPathBlocking(s) && (!climbsWalls || !isWall(s))) || isCombatStructure(s)) targets.push({ type: "structure", id: s.id, x: s.x, y: s.y, group: s.group, directDistance: Math.hypot(s.x - e.x, s.y - e.y) }); });
        let targetChoice = targets.find(target => target.type === e.targetType && target.id === e.targetId);
        const retaliationTarget = targets.find(target => target.type === "structure" && target.id === e.retaliateAgainstId);
        if (e.retaliateAgainstId && !retaliationTarget) e.retaliateAgainstId = undefined;
        if (retaliationTarget) {
          const towardX = retaliationTarget.x - e.x, towardY = retaliationTarget.y - e.y, artilleryDistance = Math.max(0.001, Math.hypot(towardX, towardY));
          const interceptionTarget = targets.filter(candidate => {
            if (candidate.type === "base" || candidate.id === retaliationTarget.id || candidate.directDistance >= artilleryDistance) return false;
            const offsetX = candidate.x - e.x, offsetY = candidate.y - e.y;
            const progress = (offsetX * towardX + offsetY * towardY) / (artilleryDistance * artilleryDistance);
            const corridorDistance = Math.abs(offsetX * towardY - offsetY * towardX) / artilleryDistance;
            return progress > 0 && progress < 1 && corridorDistance <= ARTILLERY_RETALIATION_CORRIDOR;
          }).sort((a, b) => a.directDistance - b.directDistance)[0];
          const desiredTarget = interceptionTarget ?? retaliationTarget;
          if (targetChoice?.type !== desiredTarget.type || targetChoice.id !== desiredTarget.id || e.pathTimer <= 0 || !e.path.length) {
            targetChoice = desiredTarget; e.targetType = desiredTarget.type; e.targetId = desiredTarget.id; e.path = routeFor(e, desiredTarget).path; e.index = 0; e.pathTimer = 0.36 + (e.id % 7) * 0.02;
          }
        } else if (!targetChoice || e.pathTimer <= 0 || !e.path.length) {
          let bestRoute: EnemyRoute | undefined, bestTarget: EnemyTargetChoice | undefined, bestTargetScore = Infinity;
          for (const candidate of [...targets].sort((a, b) => a.directDistance - b.directDistance)) {
            const fastestPossibleScore = candidate.directDistance / Math.max(0.01, e.speed * 1.65) * (1 - TARGET_SELECTION_VARIANCE * 0.5); if (fastestPossibleScore >= bestTargetScore) break;
            const route = routeFor(e, candidate), targetScore = route.travelTime * targetPreferenceMultiplier(e, candidate);
            if (route.path.length && targetScore < bestTargetScore) { bestRoute = route; bestTarget = candidate; bestTargetScore = targetScore; }
          }
          targetChoice = bestTarget ?? targets[0]; e.targetType = targetChoice.type; e.targetId = targetChoice.id; e.path = bestRoute?.path ?? routeFor(e, targetChoice).path; e.index = 0; e.pathTimer = (targetChoice.type === "marine" ? 0.42 : 0.82) + (e.id % 7) * 0.025;
        }
        const combatTarget = targetChoice.type === "base" ? undefined : targetChoice as EnemyTargetChoice & { type: "marine" | "structure"; id: number };
        const tx = targetChoice.x, ty = targetChoice.y;
        const targetDistance = Math.hypot(tx - e.x, ty - e.y), attackRange = enemyStats.attackRange;
        const wire = structures.find(s => s.kind === "wire" && Math.hypot(s.x - e.x, s.y - e.y) < RAZOR_WIRE_RADIUS);
        let isMoving = false, isAttacking = false, movementRate = e.speed * (wire ? RAZOR_WIRE_SLOW_MULTIPLIER : 1);
        if (wire) {
          if (e.wireContactId !== wire.id) {
            damageEnemy(e, RAZOR_WIRE_ENTRY_DAMAGE);
            burst(e.group.position.clone().add(new THREE.Vector3(0, 0.22, 0)), 0xff6b55, 5);
          }
          e.wireContactId = wire.id;
          damageEnemy(e, RAZOR_WIRE_DAMAGE_PER_SECOND * dt);
          if (Math.random() < dt * 5) burst(e.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xd8cab0, 1);
        } else e.wireContactId = undefined;
        if (combatTarget && targetDistance <= attackRange) {
          isAttacking = true; e.group.rotation.y = Math.atan2(-(tx - e.x), -(ty - e.y));
          if (e.attackCooldown <= 0) {
            const hit = e.damage * (e.kind === "brute" ? 1.45 : e.kind === "razortail" ? 1.2 : e.kind === "stalker" ? 0.75 : 1); const targetPos = combatTarget.group.position;
            hostileStrike(e.kind, e.group.position, targetPos, combatTarget.type, combatTarget.id, hit); e.attackCooldown = enemyStats.attackCooldown;
          }
        } else {
          const targetCell = e.path[Math.min(e.index + 1, e.path.length - 1)];
          if (targetCell) {
            const dx = targetCell.x - e.x, dy = targetCell.y - e.y, dist = Math.hypot(dx, dy);
            const segmentStart = e.path[Math.min(e.index, e.path.length - 1)] ?? targetCell, segmentLength = Math.max(0.01, Math.hypot(targetCell.x - segmentStart.x, targetCell.y - segmentStart.y));
            const groundRate = e.speed * terrainSpeedMultiplier(segmentStart, targetCell), terrainClimbDistance = Math.max(0, heights[targetCell.y][targetCell.x] - heights[segmentStart.y][segmentStart.x]), wallClimbDistance = climbsWalls ? Math.abs(wallLiftAt(targetCell) - wallLiftAt(segmentStart)) : 0;
            movementRate = segmentLength / (segmentLength / Math.max(0.01, groundRate) + terrainClimbDistance / ENEMY_TERRAIN_CLIMB_SPEED + wallClimbDistance / WALL_CLIMB_SPEED) * (wire ? RAZOR_WIRE_SLOW_MULTIPLIER : 1);
            if (dist < 0.025) e.index++; else { const step = Math.min(dist, movementRate * dt); e.x += dx / dist * step; e.y += dy / dist * step; e.group.rotation.y = Math.atan2(-dx, -dy); isMoving = true; }
          }
        }
        const gaitSpeed = enemyStats.gait;
        const gait = elapsed * gaitSpeed * Math.max(0.65, movementRate) + e.id * 0.73;
        const legs = e.group.userData.legs as THREE.Group[] | undefined;
        const phases = e.group.userData.legPhases as number[] | undefined;
        if (legs) legs.forEach((leg, i) => { leg.rotation.x = Math.sin(gait + (phases?.[i] ?? i * Math.PI)) * (isMoving ? (e.kind === "brute" ? 0.23 : 0.42) : 0.045); });
        const bodyRig = e.group.userData.bodyRig as THREE.Group | undefined;
        if (bodyRig) {
          bodyRig.position.y = Math.sin(gait * 2) * (isMoving ? (e.kind === "brute" ? 0.035 : 0.055) : 0.012);
          bodyRig.position.z = isAttacking ? Math.max(0, Math.sin(gait * 1.4)) * (e.kind === "brute" ? -0.11 : -0.06) : 0;
          bodyRig.rotation.z = Math.sin(gait) * (isMoving ? 0.035 : 0.012);
        }
        const tails = e.group.userData.tails as THREE.Group[] | undefined;
        if (tails) tails.forEach((tail, i) => { tail.rotation.y = Math.sin(gait * 0.42 + i * 0.72) * (isMoving ? 0.24 : 0.1); tail.rotation.x = Math.sin(gait * 0.34 + i * 0.85) * (isMoving ? 0.11 : 0.045); });
        const wings = e.group.userData.wings as THREE.Group[] | undefined;
        if (wings) wings.forEach((wing, i) => {
          const side = wing.userData.side as number, restAngle = wing.userData.restAngle as number;
          wing.rotation.z = restAngle + side * Math.sin(elapsed * (isMoving ? 26 : 5) + i * Math.PI) * (isMoving ? 0.48 : 0.08);
        });
        const climbingWall = climbsWalls ? structures.filter(isWall).filter(wall => Math.hypot(wall.x - e.x, wall.y - e.y) < 1.05).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y) || b.stackLevel - a.stackLevel)[0] : undefined;
        const climbDistance = climbingWall ? Math.hypot(climbingWall.x - e.x, climbingWall.y - e.y) : Infinity;
        const climbLift = climbingWall ? wallTopLift(climbingWall) * clamp(1 - climbDistance / 1.05, 0, 1) : 0;
        const p = worldPos(e.x, e.y, climbLift); e.group.position.lerp(p, Math.min(1, dt * 12)); e.group.position.y += Math.sin(elapsed * 9 + e.id) * (e.kind === "brute" ? 0.005 : 0.01); syncHealthBar(e.group);
      }
      for (const s of structures) {
        s.cooldown -= dt;
        const scanRig = s.group.userData.scanRig as THREE.Group | undefined; if (scanRig) scanRig.rotation.y += dt * 0.42;
        let isMoving = false;
        if (isMobileEmplacement(s)) {
          isMoving = advanceFriendly(s, s.kind === "howitzer" ? 0.26 : 0.42, s.kind === "howitzer" ? 2.2 : 3.2, dt);
          s.group.position.lerp(worldPos(s.x, s.y, s.lift), Math.min(1, dt * 10));
        }
        syncHealthBar(s.group);
        if (!isCombatStructure(s)) continue;
        if (isMoving) continue;
        const terrainX = clamp(Math.round(s.x), 0, GRID_W - 1), terrainY = clamp(Math.round(s.y), 0, GRID_H - 1);
        const stats = TURRET_STATS[s.kind], levelDamage = 1 + (s.level - 1) * 0.42, levelSpeed = 1 + (s.level - 1) * 0.18;
        const range = ASSETS[s.kind].range + (s.level - 1) * 0.65 + heights[terrainY][terrainX] * 0.9;
        const candidates = enemies.filter(e => e.hp > 0 && isRevealed(e.x, e.y) && Math.hypot(e.x - s.x, e.y - s.y) <= range);
        const target = s.kind === "howitzer" || s.kind === "missile" ? chooseArtilleryTarget(candidates, stats.damage * levelDamage, stats.splash) : candidates.sort((a, b) => b.index - a.index)[0];
        if (target) {
          turnToward(s.group, Math.atan2(-(target.x - s.x), -(target.y - s.y)), stats.turnSpeed, dt);
          if (s.cooldown <= 0) { const muzzle = s.group.userData.muzzle as THREE.Object3D | undefined; const from = muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : s.group.position.clone().add(new THREE.Vector3(0, 1.05, 0)); if (stats.beam) laserStrike(from, target, stats.damage * levelDamage, stats.color); else fire(from, target, stats.damage * levelDamage, stats.splash, stats.color, stats.heavy, stats.arcHeight, false, s.kind === "howitzer" || s.kind === "missile" ? s.id : undefined); s.cooldown = stats.cooldown / levelSpeed; }
        }
      }
      for (const m of marines) {
        const stats = MARINE_STATS[m.kind]; m.cooldown -= dt; m.supportCooldown -= dt;
        const isMoving = advanceFriendly(m, stats.speed, 10, dt);
        if (!isMoving) { m.vx *= Math.exp(-dt * 10); m.vy *= Math.exp(-dt * 10); }
        m.group.position.lerp(worldPos(m.x, m.y, m.lift), Math.min(1, dt * 14)); syncHealthBar(m.group);
        const settledOnWall = !!m.mountedOn && !m.movePath.length;
        const soldierLegs = m.group.userData.legs as THREE.Group[] | undefined; if (soldierLegs) soldierLegs.forEach((leg, i) => { leg.rotation.x = isMoving ? Math.sin(elapsed * 11 + i * Math.PI) * 0.5 : 0; });
        if (m.kind === "medic" && m.supportCooldown <= 0 && !isMoving) {
          const patient = marines.filter(other => other.id !== m.id && other.hp < other.maxHp && Math.hypot(other.x - m.x, other.y - m.y) < 2.4).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (patient) { patient.hp = Math.min(patient.maxHp, patient.hp + 18); setHealthVisual(patient.group, patient.hp, patient.maxHp); burst(patient.group.position.clone().add(new THREE.Vector3(0, 0.65, 0)), 0x63e9ff, 5); m.supportCooldown = 1.6; }
        }
        const target = enemies.find(e => e.hp > 0 && isRevealed(e.x, e.y) && Math.hypot(e.x - m.x, e.y - m.y) < (settledOnWall ? stats.range + 0.95 : stats.range));
        if (target && !isMoving) {
          turnToward(m.group, Math.atan2(-(target.x - m.x), -(target.y - m.y)), 10, dt);
          if (m.cooldown <= 0) { const muzzle = m.group.userData.muzzle as THREE.Object3D | undefined; fire(muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : m.group.position.clone().add(new THREE.Vector3(0, 0.72, 0)), target, stats.damage * (settledOnWall ? 1.32 : 1), stats.splash ?? 0, stats.projectileColor, stats.heavy, stats.arcHeight, m.kind === "rocketeer"); m.cooldown = stats.cooldown; }
        }
      }
      for (const s of [...structures]) if (s.kind === "mine") {
        const target = enemies.find(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < 1.25); if (target) { enemies.forEach(e => { if (Math.hypot(e.x - s.x, e.y - s.y) < 1.75) damageEnemy(e, 145); }); burst(s.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x6ffff3, 25); destroyStructure(s); message("SHOCK MINE DETONATED"); }
      }
      for (const shot of [...hostileProjectiles]) {
        shot.t += dt * shot.speed; const progress = Math.min(1, shot.t), arc = Math.sin(progress * Math.PI) * shot.arcHeight;
        shot.group.position.lerpVectors(shot.from, shot.to, progress); shot.group.position.y += arc; shot.group.rotateX(dt * (shot.kind === "spitter" ? 2.5 : 8)); shot.group.rotateZ(dt * (shot.kind === "brute" ? 5 : 11));
        if (shot.kind === "spitter" || shot.kind === "broodmother") shot.group.scale.setScalar(0.9 + Math.sin(elapsed * (shot.kind === "broodmother" ? 12 : 20)) * 0.12);
        if (shot.t >= 1) {
          if (shot.targetType === "structure") {
            const target = structures.find(s => s.id === shot.targetId); if (target) { target.hp = clamp(target.hp - shot.damage, 0, target.maxHp); setHealthVisual(target.group, target.hp, target.maxHp); if (target.hp <= 0) { message(`${ASSETS[target.kind].name.toUpperCase()} DESTROYED BY HOSTILES`); destroyStructure(target); } }
          } else {
            const target = marines.find(m => m.id === shot.targetId); if (target) { const damage = shot.damage * (isEntrenched(target) ? TRENCH_DAMAGE_MULTIPLIER : 1); target.hp = clamp(target.hp - damage, 0, target.maxHp); setHealthVisual(target.group, target.hp, target.maxHp); }
          }
          burst(shot.to, shot.color, shot.impactCount); world.remove(shot.group); hostileProjectiles.splice(hostileProjectiles.indexOf(shot), 1);
        }
      }
      for (const b of [...bullets]) {
        b.t += dt * b.speed; const arc = b.arcHeight ? Math.sin(Math.min(1, b.t) * Math.PI) * b.arcHeight : 0; b.mesh.position.lerpVectors(b.from, b.to, Math.min(1, b.t)); b.mesh.position.y += arc;
        if (b.t >= 1) {
          const target = enemies.find(e => e.id === b.target && e.hp > 0);
          if (b.splash) {
            const impactX = target?.x ?? b.impactX, impactY = target?.y ?? b.impactY;
            enemies.forEach(e => { const d = Math.hypot(e.x - impactX, e.y - impactY); if (d <= b.splash) { damageEnemy(e, b.damage * (1 - d / (b.splash * 1.8))); provokeEnemy(e, b.sourceStructureId); } });
            burst(target?.group.position.clone().add(new THREE.Vector3(0, 0.42, 0)) ?? b.to, b.color, 18);
          } else if (target) { damageEnemy(target, b.damage); provokeEnemy(target, b.sourceStructureId); burst(b.to, b.color, 4); }
          world.remove(b.mesh); bullets.splice(bullets.indexOf(b), 1);
        }
      }
      for (const e of [...enemies]) {
        if (e.hp <= 0) {
          const deathColor = e.kind === "broodmother" ? 0xff73aa : e.kind === "spitter" ? 0x58ff96 : e.kind === "razortail" ? 0xe66bff : e.kind === "stalker" ? 0x58ddff : e.kind === "strider" ? 0xffe56d : 0xff573e;
          const deathCount = e.kind === "brute" ? 24 : e.kind === "broodmother" ? 22 : e.kind === "razortail" ? 20 : e.kind === "strider" ? 14 : e.kind === "stalker" ? 9 : 12;
          credits += e.reward; kills++; burst(e.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), deathColor, deathCount); removeHealthBar(e.group); world.remove(e.group); enemies.splice(enemies.indexOf(e), 1); continue;
        }
        if (e.targetType === "base" && Math.hypot(e.x - baseCell.x, e.y - baseCell.y) < 0.22) { integrity = Math.max(0, integrity - e.damage); burst(base.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4a31, 14); removeHealthBar(e.group); world.remove(e.group); enemies.splice(enemies.indexOf(e), 1); if (integrity <= 0) { gameOver = true; active = false; message("COMMAND POST OVERRUN · SECTOR LOST"); } }
      }
      for (const m of [...marines]) if (m.hp <= 0) { selectedMarines.delete(m.id); burst(m.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xff5f47, 9); removeHealthBar(m.group); world.remove(m.group); marines.splice(marines.indexOf(m), 1); message(`${MARINE_STATS[m.kind].name.toUpperCase()} KILLED IN ACTION`); }
      for (const p of [...particles]) { p.life -= dt; p.velocity.y -= dt * 2.6; p.mesh.position.addScaledVector(p.velocity, dt); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife); if (p.life <= 0) { world.remove(p.mesh); particles.splice(particles.indexOf(p), 1); } }
      if (active && spawnLeft === 0 && enemies.length === 0) { active = false; credits += 125 + wave * 25; if (wave >= MAX_WAVES) { victory = true; gameOver = true; message("SECTOR SECURED · HUMANITY HOLDS THE RIDGE"); } else message(`WAVE ${String(wave).padStart(2, "0")} DESTROYED · RESUPPLY DELIVERED`); }
      emitHud();
    }

    let raf = 0, last = performance.now();
    const frameInterval = 1000 / TARGET_FRAME_RATE;
    function animate(now: number) {
      const elapsedSinceFrame = now - last;
      if (elapsedSinceFrame >= frameInterval) { const dt = Math.min(0.04, elapsedSinceFrame / 1000); last = now - (elapsedSinceFrame % frameInterval); update(dt); controls.update(); renderer.render(scene, camera); }
      raf = requestAnimationFrame(animate);
    }
    emitHud(true); raf = requestAnimationFrame(animate);
    const resize = () => { camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); renderer.domElement.removeEventListener("pointermove", onMove, true); renderer.domElement.removeEventListener("pointerdown", onDown, true); renderer.domElement.removeEventListener("pointerup", onUp, true); renderer.domElement.removeEventListener("contextmenu", onContext); controls.dispose(); renderer.dispose(); host.removeChild(renderer.domElement); host.removeChild(selectionBox); apiRef.current = null; };
  }, [apiRef, mapKey]);
  return <div ref={hostRef} className="three-host" aria-label="Interactive 3D battlefield" />;
}

export default function Home() {
  const [selected, setSelected] = useState<AssetKey>("rifle");
  const [mapKey, setMapKey] = useState<MapKey>("ridge");
  const [hud, setHud] = useState<Hud>({ credits: 750, integrity: 100, wave: 0, enemies: 0, kills: 0, active: false, gameOver: false, victory: false });
  const [selectedUnit, setSelectedUnit] = useState<SelectedUnit | null>(null);
  const [selectedBarracks, setSelectedBarracks] = useState<BarracksInfo | null>(null);
  const [message, setMessage] = useState("OPERATION NIGHTFALL · BUILD YOUR PERIMETER");
  const [briefing, setBriefing] = useState(true);
  const apiRef = useRef<BattlefieldApi | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMessage = (text: string) => { setMessage(text); if (messageTimer.current) clearTimeout(messageTimer.current); messageTimer.current = setTimeout(() => setMessage("COMMAND LINK STABLE · RIGHT-CLICK TO SALVAGE"), 4200); };
  const map = MAPS[mapKey];
  const selectMap = (nextMap: MapKey) => {
    setMapKey(nextMap); setSelectedUnit(null); setSelectedBarracks(null);
    setMessage(`OPERATION ${MAPS[nextMap].operation} · ${MAPS[nextMap].sector} SELECTED`);
  };
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
        <Battlefield selected={selected} mapKey={mapKey} onHud={setHud} onMessage={showMessage} onUnitSelected={setSelectedUnit} onBarracksSelected={setSelectedBarracks} apiRef={apiRef} />
        <div className="mission-card"><span>OPERATION {map.operation} · SECTOR {map.sector}</span><b>{map.objective}</b><small>Wave {Math.min(hud.wave + (hud.active ? 0 : 1), MAX_WAVES)} of {MAX_WAVES} · {hud.kills} confirmed eliminations</small><button className="map-change" disabled={hud.active} onClick={() => setBriefing(true)}>CHANGE MAP</button></div>
        <div className="status-feed"><i />{message}</div>
        {selectedUnit && <div className="upgrade-card" style={{ "--upgrade-color": ASSETS[selectedUnit.kind].accent } as React.CSSProperties}>
          <small>SELECTED DEFENSE</small><div className="upgrade-heading"><b>{selectedUnit.name}</b><em>TIER {selectedUnit.level}/{selectedUnit.maxLevel}</em></div>
          <div className="upgrade-stats"><span><small>{selectedUnit.support ? "LIGHT POWER" : "DAMAGE"}</small><b>{selectedUnit.support ? `${selectedUnit.damage}%` : selectedUnit.damage}</b></span><span><small>{selectedUnit.support ? "VISION" : "RANGE"}</small><b>{selectedUnit.range}</b></span><span><small>ARMOR</small><b>{selectedUnit.maxHp}</b></span></div>
          <button disabled={selectedUnit.upgradeCost === null || hud.credits < selectedUnit.upgradeCost} onClick={() => apiRef.current?.upgradeSelected()}>{selectedUnit.upgradeCost === null ? "MAXIMUM TIER" : `UPGRADE TO TIER ${selectedUnit.level + 1} · ¤ ${selectedUnit.upgradeCost}`}</button>
          <p>{selectedUnit.support ? "Upgrade increases vision radius, searchlight power, and armor." : "Upgrade increases damage, range, fire rate, and armor."}</p>
        </div>}
        {selectedBarracks && <div className="barracks-card">
          <small>SELECTED BUILDING</small><div className="barracks-heading"><div><b>FIELD BARRACKS</b><span>INFANTRY DEPLOYMENT BAY</span></div><em>INSTANT</em></div>
          <div className="recruit-list">{(Object.keys(MARINE_STATS) as MarineKind[]).map(kind => { const unit = MARINE_STATS[kind]; return <button key={kind} disabled={hud.credits < unit.cost} onClick={() => apiRef.current?.recruit(kind)} style={{ "--unit-color": unit.color } as React.CSSProperties}><span>{kind === "rifleman" ? "⌖" : kind === "gunner" ? "▣" : kind === "medic" ? "+" : "➶"}</span><div><b>{unit.name}</b><small>{unit.role} · Instant</small></div><em>¤ {unit.cost}</em></button>; })}</div>
          <p>Recruit as many specialists as command credits allow. Every infantry unit deploys beside the barracks immediately.</p>
        </div>}
        <div className="camera-tools"><button onClick={() => apiRef.current?.rotate()} aria-label="Rotate camera">↻</button><span>ORBIT</span></div>
        {briefing && <div className="briefing map-briefing"><div className="briefing-id">THEATER SELECTION // THREE ACTIVE SECTORS</div><h1>Choose the ground you hold.</h1><p>Each battlefield has a different elevation profile, command-post location, invasion portals, and opening deployment. Fog still conceals everything outside friendly vision.</p><div className="map-selector" aria-label="Available battlefields">{MAP_ORDER.map(key => { const option = MAPS[key]; return <button key={key} className={`map-option ${mapKey === key ? "active" : ""}`} aria-pressed={mapKey === key} onClick={() => selectMap(key)}><span className={`map-preview ${key}`} aria-hidden="true"><i className="base-pip" /><i className="portal-pip one" /><i className="portal-pip two" /><i className="portal-pip three" /></span><small>{option.terrain}</small><b>{option.name}</b><em>{option.objective}</em></button>; })}</div><p className="map-description"><b>OPERATION {map.operation} · SECTOR {map.sector}</b>{map.description}</p><div className="brief-grid"><span><kbd>LIGHT TOWER</kbd><b>Reveal a wide area</b></span><span><kbd>RIGHT CLICK</kbd><b>Move scouts forward</b></span><span><kbd>STACK WALLS</kbd><b>Shape every approach</b></span><span><kbd>MIDDLE DRAG</kbd><b>Orbit camera</b></span></div><button onClick={() => setBriefing(false)}>DEPLOY TO {map.name.toUpperCase()}</button></div>}
        {hud.gameOver && <div className={`end-card ${hud.victory ? "won" : "lost"}`}><small>{hud.victory ? "OPERATION COMPLETE" : "SIGNAL LOST"}</small><h2>{hud.victory ? `${map.name.toUpperCase()} HOLDS` : "COMMAND OVERRUN"}</h2><p>{hud.kills} hostiles eliminated across {hud.wave} waves.</p><button onClick={() => apiRef.current?.restart()}>RESTART OPERATION</button></div>}
      </section>
      <aside className="build-panel">
        <div className="panel-title"><small>FORWARD ENGINEERING</small><b>DEPLOYABLE ASSETS</b></div>
        {(Object.keys(ASSETS) as AssetKey[]).map(key => { const a = ASSETS[key]; return <button key={key} className={`asset ${selected === key ? "active" : ""}`} onClick={() => setSelected(key)} style={{ "--asset-color": a.accent } as React.CSSProperties}><span>{a.icon}</span><div><b>{a.name}</b><small>{a.role}</small></div><em>{a.cost}</em></button>; })}
        <div className="intel"><span>FIELD INTEL</span><p>Sentinel lights and weapons may mount on walls. Climbers cross walls slowly and may choose a faster target instead. Right-click a trench with infantry selected to take cover; crewed weapons cannot enter. Rocketeers deliver mobile splash fire; late waves include egg-launching Broodmothers. Shift + right-click salvages.</p></div>
      </aside>
      <footer className="controls"><span><kbd>DRAG BOX</kbd> SELECT UNITS</span><span><kbd>RIGHT CLICK</kbd> FORMATION MOVE</span><span><kbd>MIDDLE DRAG</kbd> ORBIT</span><span><kbd>WASD</kbd> GLIDE CAMERA</span><span><kbd>SPACE</kbd> START WAVE</span><span className="online">● GITHUB PAGES</span></footer>
    </main>
  );
}
