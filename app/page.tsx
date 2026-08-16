"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type AssetKey = "rifle" | "sentry" | "flak" | "flame" | "laser" | "railgun" | "tank" | "howitzer" | "missile" | "light" | "wall" | "bastion" | "trench" | "wire" | "mine" | "barracks" | "factory";
type DeployableAssetKey = Exclude<AssetKey, "tank" | "howitzer">;
type TerraformMode = "terrainRaise" | "terrainLower";
type BuildSelection = DeployableAssetKey | TerraformMode;
type CombatKey = "rifle" | "sentry" | "flak" | "flame" | "laser" | "railgun" | "tank" | "howitzer" | "missile";
type UpgradableKey = CombatKey | "light";
type MarineKind = "rifleman" | "gunner" | "medic" | "rocketeer";
type FactoryUnitKind = "tank" | "howitzer";
type AlienKind = "drone" | "spitter" | "brute" | "razortail" | "stalker" | "strider" | "broodmother" | "flyer" | "prowler";

const FINAL_MAP_WAVES = 25;
const BETWEEN_WAVE_BUILD_SECONDS = 30;
const INFANTRY_PRODUCTION_SECONDS = 5;
const FACTORY_PRODUCTION_SECONDS = 30;
const ALIEN_SPEED_MULTIPLIER = 1.8;
const ENEMY_SWARM_MULTIPLIER = 6;
const MAX_ACTIVE_ENEMIES = 120;
const HOSTILE_SPAWN_PACKET_SIZE = 10;
const HOSTILE_SPAWN_INTERVAL = 0.5;
const MAX_FRAME_DELTA = 0.1;
const ROUTE_CANDIDATE_LIMIT = 5;
const ROUTE_CACHE_LIMIT = 900;
const PROJECTILE_POOL_LIMIT = 80;
const AOE_RADIUS_MULTIPLIER = 0.4;
const MARINE_STACK_THRESHOLD = 10;
const MARINE_STACK_COLLECTION_DIAMETER = 1;
const MARINE_STACK_COLLECTION_RADIUS = MARINE_STACK_COLLECTION_DIAMETER / 2;
const ENEMY_COLLISION_BUCKET_SIZE = 1.12;
const WALL_STACK_HEIGHT = 0.62;
const WALL_CLIMB_SPEED = 0.46;
const WALL_LIFT_SPEED = 3.6;
const FRIENDLY_TERRAIN_CLIMB_SPEED = 0.85;
const ENEMY_WATER_SPEED_MULTIPLIER = 0.76;
const BASE_VISION_RADIUS = 7.5;
const MARINE_VISION_RADIUS = 5.5;
const STRUCTURE_VISION_RADIUS = 4.8;
const COMBAT_VISION_RADIUS = 6.4;
const LIGHT_VISION_BASE = 11;
const LIGHT_VISION_PER_LEVEL = 2.75;
const ENEMY_TERRAIN_CLIMB_SPEED = 0.08;
const ENEMY_TERRAIN_ROUTE_CLIMB_SPEED = 0.65;
const ENEMY_TERRAIN_ROUTE_SLOPE_WEIGHT = 0.25;
const ARTILLERY_RETALIATION_CORRIDOR = 1.4;
const TARGET_SELECTION_VARIANCE = 0.34;
const RAZOR_WIRE_RADIUS = 1.05;
const RAZOR_WIRE_SLOW_MULTIPLIER = 0.32;
// Razor wire is primarily a movement obstacle. Ground aliens take only a
// shallow cut when entering it and while crawling through it.
const RAZOR_WIRE_ENTRY_DAMAGE = 4.5;
const RAZOR_WIRE_DAMAGE_PER_SECOND = 6;
const BROODLINGS_PER_EGG = 2;
const MAX_ACTIVE_BROODLINGS = 12;
const TERRAFORM_COST = 10;
const TERRAFORM_STEP = 0.16;
const TERRAFORM_MIN_HEIGHT = 0.04;
const TERRAFORM_MAX_HEIGHT = 6.4;
const TRENCH_CAPACITY = 4;
const TRENCH_DAMAGE_MULTIPLIER = 0.6;
const TRENCH_AUTO_ENTRY_RANGE = 1;
const AIR_DAMAGE_MULTIPLIER = 0.45;
// Ground aliens must break through or route around a wall; none can climb it.
const WALL_CLIMBERS = new Set<AlienKind>();
const FLYING_ENEMIES = new Set<AlienKind>(["flyer"]);
const WATER_ALIENS = new Set<string>(["tidecrawler"]);
const RANGED_ENEMIES = new Set<AlienKind>(["spitter", "broodmother", "flyer"]);
const ENEMY_STATS: Record<AlienKind, { hp: number; speed: number; damage: number; reward: number; attackRange: number; attackCooldown: number; gait: number; barHeight: number }> = {
  drone: { hp: 82, speed: 0.9, damage: 6, reward: 24, attackRange: 0.95, attackCooldown: 0.82, gait: 11.5, barHeight: 1.05 },
  spitter: { hp: 125, speed: 0.72, damage: 7, reward: 36, attackRange: 1.9, attackCooldown: 1.4, gait: 7.2, barHeight: 1.45 },
  brute: { hp: 340, speed: 0.48, damage: 18, reward: 65, attackRange: 1.15, attackCooldown: 1.35, gait: 4.2, barHeight: 2.05 },
  razortail: { hp: 245, speed: 0.68, damage: 14, reward: 56, attackRange: 1.1, attackCooldown: 1.15, gait: 6.2, barHeight: 1.75 },
  stalker: { hp: 64, speed: 1.85, damage: 5, reward: 30, attackRange: 0.9, attackCooldown: 0.48, gait: 18, barHeight: 0.95 },
  strider: { hp: 118, speed: 0.7, damage: 10, reward: 48, attackRange: 1.2, attackCooldown: 1.9, gait: 5.4, barHeight: 1.8 },
  broodmother: { hp: 285, speed: 0.52, damage: 14, reward: 75, attackRange: 3, attackCooldown: 2.75, gait: 3.8, barHeight: 2.2 },
  flyer: { hp: 70, speed: 1.18, damage: 7, reward: 42, attackRange: 2.05, attackCooldown: 1.25, gait: 14, barHeight: 3.1 },
  prowler: { hp: 155, speed: 1.08, damage: 11, reward: 52, attackRange: 1.1, attackCooldown: 0.68, gait: 10.2, barHeight: 1.15 },
};

const GRID_W = 44;
const GRID_H = 44;
const TILE = 1.36;
const ASSETS: Record<AssetKey, { name: string; role: string; cost: number; range: number; icon: string; accent: string }> = {
  rifle: { name: "M240 Gun Team", role: "Sustained fire · Anti-swarm", cost: 150, range: 4.7, icon: "⌖", accent: "#9fe870" },
  sentry: { name: "GAU-19 Sentry", role: "Fast tracking · Heavy burst", cost: 250, range: 5.6, icon: "◉", accent: "#62e8ff" },
  flak: { name: "Aegis Flak Turret", role: "Air dominance · Ground fallback", cost: 300, range: 7.1, icon: "✹", accent: "#8fdfff" },
  flame: { name: "Inferno Turret", role: "Close cone · Heavy burn", cost: 210, range: 2.45, icon: "♨", accent: "#ff875c" },
  laser: { name: "Helios Laser Tower", role: "Instant beam · Precision damage", cost: 360, range: 7.2, icon: "◇", accent: "#ff4ff5" },
  railgun: { name: "M-90 Rail Turret", role: "Long range · Armor piercing", cost: 410, range: 9.6, icon: "↯", accent: "#b889ff" },
  tank: { name: "Tank", role: "Armored mobile cannon", cost: 600, range: 6.4, icon: "▱", accent: "#b8d16f" },
  howitzer: { name: "M777 Howitzer", role: "Heavy shell · Area damage", cost: 350, range: 7.4, icon: "◎", accent: "#ffb45d" },
  missile: { name: "Javelin Battery", role: "Long range · Wide blast", cost: 480, range: 8.8, icon: "✦", accent: "#ff7f91" },
  light: { name: "Sentinel Light Tower", role: "Wide vision · Sweeping searchlights", cost: 135, range: 0, icon: "☼", accent: "#fff1a3" },
  wall: { name: "Hesco Wall", role: "600 armor · Supports units", cost: 70, range: 0, icon: "▦", accent: "#d1b98e" },
  bastion: { name: "Bastion Wall", role: "1,050 armor · Reinforced cover", cost: 125, range: 0, icon: "▰", accent: "#aab8bd" },
  trench: { name: "Infantry Trench", role: "4 infantry · 40% damage reduction", cost: 85, range: 0, icon: "⌓", accent: "#b89568" },
  wire: { name: "Razor Wire", role: "Slows hostiles · Light bleed", cost: 40, range: 0, icon: "〰", accent: "#e4cc9e" },
  mine: { name: "Shock Mine", role: "Proximity · One use", cost: 100, range: 1.35, icon: "⌁", accent: "#ff655f" },
  barracks: { name: "Field Barracks", role: "Trains specialized infantry", cost: 425, range: 0, icon: "⌂", accent: "#67c8ff" },
  factory: { name: "Machining Factory", role: "2×2 · Builds tanks and howitzers", cost: 700, range: 0, icon: "⚙", accent: "#e5ba67" },
};

const DEPLOYABLE_ASSET_KEYS = (Object.keys(ASSETS) as AssetKey[]).filter((key): key is DeployableAssetKey => key !== "tank" && key !== "howitzer");

const TURRET_STATS: Record<CombatKey, { damage: number; cooldown: number; splash: number; arcHeight: number; color: number; heavy: boolean; turnSpeed: number; beam?: boolean; flameCone?: boolean; airDamageMultiplier?: number }> = {
  rifle: { damage: 5.8, cooldown: 0.15, splash: 0, arcHeight: 0, color: 0xd6ff81, heavy: false, turnSpeed: 8 },
  sentry: { damage: 18, cooldown: 0.31, splash: 0.25, arcHeight: 0, color: 0x61e8ff, heavy: false, turnSpeed: 11 },
  flak: { damage: 54, cooldown: 0.68, splash: 1.35, arcHeight: 0.12, color: 0x8fdfff, heavy: true, turnSpeed: 9, airDamageMultiplier: 2.2 },
  flame: { damage: 34, cooldown: 0.3, splash: 0, arcHeight: 0, color: 0xff713d, heavy: false, turnSpeed: 7, flameCone: true },
  laser: { damage: 68, cooldown: 0.72, splash: 0, arcHeight: 0, color: 0xff4ff5, heavy: false, turnSpeed: 6.5, beam: true },
  railgun: { damage: 185, cooldown: 2.8, splash: 0, arcHeight: 0, color: 0xc090ff, heavy: true, turnSpeed: 4.4 },
  tank: { damage: 92, cooldown: 1.15, splash: 0.42, arcHeight: 0, color: 0xd8ef83, heavy: true, turnSpeed: 4.8 },
  howitzer: { damage: 105, cooldown: 2.35, splash: 1.25, arcHeight: 2.2, color: 0xffa64d, heavy: true, turnSpeed: 3.5 },
  missile: { damage: 165, cooldown: 6.4, splash: 1.75, arcHeight: 2.8, color: 0xff667d, heavy: true, turnSpeed: 2.8 },
};

const MARINE_STATS: Record<MarineKind, { name: string; role: string; cost: number; hp: number; speed: number; damage: number; cooldown: number; range: number; color: string; projectileColor: number; splash?: number; arcHeight?: number; heavy?: boolean }> = {
  rifleman: { name: "Rifleman", role: "Mobile all-round infantry", cost: 60, hp: 100, speed: 1.65, damage: 9, cooldown: 0.55, range: 3.25, color: "#a8f76b", projectileColor: 0xbaff77 },
  gunner: { name: "Heavy Gunner", role: "Armored sustained fire", cost: 115, hp: 165, speed: 1.2, damage: 18, cooldown: 0.34, range: 3.7, color: "#ffbe62", projectileColor: 0xffbe62 },
  medic: { name: "Combat Medic", role: "Heals nearby infantry", cost: 90, hp: 85, speed: 1.75, damage: 5, cooldown: 0.72, range: 2.9, color: "#63e9ff", projectileColor: 0x63e9ff },
  rocketeer: { name: "Rocketeer", role: "Long-range anti-swarm rockets", cost: 155, hp: 95, speed: 1.08, damage: 62, cooldown: 2.15, range: 5.2, color: "#ff8a5b", projectileColor: 0xff7048, splash: 1.05, arcHeight: 0.65, heavy: true },
};

type Hud = { credits: number; integrity: number; wave: number; enemies: number; kills: number; active: boolean; buildSeconds: number | null; gameOver: boolean; victory: boolean };
type Cell = { x: number; y: number };
type MoveWaypoint = Cell & { lift: number };
type ProductionOrder = { category: "marine"; kind: MarineKind; name: string; duration: number } | { category: "factory"; kind: FactoryUnitKind; name: string; duration: number };
type Structure = { id: number; kind: AssetKey; level: number; x: number; y: number; targetX: number; targetY: number; footprint: Cell[]; hp: number; maxHp: number; mountedOn?: number; mountTarget?: number; movePath: MoveWaypoint[]; pathIndex: number; lift: number; stackLevel: number; group: THREE.Group; cooldown: number; productionQueue: ProductionOrder[]; productionRemaining: number; rallyPoint?: Cell; rallyMarker?: THREE.Group };
type Enemy = { id: number; kind: AlienKind; x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; reward: number; path: Cell[]; index: number; group: THREE.Group; hitFlash: number; attackCooldown: number; pathTimer: number; targetBiasSeed: number; targetId: number | null; targetType: "marine" | "structure" | "base"; retaliateAgainstId?: number; wireContactId?: number };
type Marine = { id: number; kind: MarineKind; x: number; y: number; targetX: number; targetY: number; vx: number; vy: number; hp: number; maxHp: number; memberHp: number[]; stacked: boolean; cooldown: number; supportCooldown: number; mountedOn?: number; mountTarget?: number; trenchId?: number; movePath: MoveWaypoint[]; pathIndex: number; lift: number; group: THREE.Group };
type ProjectilePool = "light" | "heavy" | "rocket";
type Bullet = { mesh: THREE.Object3D; pool: ProjectilePool; from: THREE.Vector3; to: THREE.Vector3; impactX: number; impactY: number; t: number; speed: number; target: number; damage: number; splash: number; arcHeight: number; color: number; sourceStructureId?: number };
type HostileProjectile = { group: THREE.Group; kind: AlienKind; from: THREE.Vector3; to: THREE.Vector3; t: number; speed: number; arcHeight: number; targetId: number; targetType: "marine" | "structure"; damage: number; color: number; impactCount: number };
type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number };
type SelectedUnit = { id: number; kind: UpgradableKey; name: string; level: number; maxLevel: number; upgradeCost: number | null; damage: number; range: number; maxHp: number; support: boolean };
type ProductionBuildingInfo = { id: number; kind: "barracks" | "factory"; currentName: string | null; remaining: number; duration: number; queueLength: number; queue: Array<{ name: string; duration: number }>; rallyPoint: Cell | null };
type GameMode = "campaign" | "tester";
type TestWaveConfig = { wave: number; enemyCount: number };
type BattlefieldApi = { start: (config?: TestWaveConfig) => void; restart: () => void; rotate: () => void; upgradeSelected: () => void; recruit: (kind: MarineKind) => void; produce: (kind: FactoryUnitKind) => void };
type MapKey = "ridge" | "basin" | "divide" | "ruins" | "homeworld";
type DecorKind = "supply" | "pine" | "cactus" | "bones" | "crystal" | "vent" | "pillar" | "obelisk" | "growth";
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
  waveCount: number;
  startingStructures: Array<{ kind: AssetKey; x: number; y: number }>;
  startingMarines: Array<{ kind: MarineKind; x: number; y: number }>;
  activeEnemyCap?: number;
  waveMultiplier?: number;
  spawnIntervalMultiplier?: number;
  waterColor: number;
  waterGlow: number;
  waterAt: (x: number, y: number) => boolean;
  bridgeAt?: (x: number, y: number) => boolean;
  decorAt?: (x: number, y: number) => DecorKind | null;
  heightAt: (x: number, y: number) => number;
};

const keyOf = (x: number, y: number) => `${x},${y}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const aoeRadius = (radius: number) => radius * AOE_RADIUS_MULTIPLIER;
const steppedHeight = (height: number) => Math.max(0.04, Math.round(height / 0.16) * 0.16);
const terrainNoise = (x: number, y: number, seed: number) => {
  const raw = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return raw - Math.floor(raw);
};
const BLACKGLASS_BRIDGES: Cell[] = [{ x: 9, y: 18 }, { x: 22, y: 21 }, { x: 35, y: 24 }];
const blackglassBridgeAt = (x: number, y: number) => BLACKGLASS_BRIDGES.some(bridge => Math.abs(x - bridge.x) < 0.5 && Math.abs(y - bridge.y) <= 1.5);

const MAPS: Record<MapKey, MapConfig> = {
  ridge: {
    key: "ridge", operation: "FIRST WATCH", sector: "HQ-1", name: "HQ Command", objective: "Tutorial operation · Fortified training ground", terrain: "TUTORIAL · FORTIFIED HQ",
    description: "Learn the battlefield from a large, reinforced bastion. Select units, right-click to move a formation, recruit from the field barracks, and use the build windows to expand your defenses before six forgiving waves.",
    background: 0x07120f, ground: 0x0b1713, fog: 0x010705, hue: 0.29, saturation: 0.24,
    baseCell: { x: 10, y: 35 }, spawnCells: [{ x: 43, y: 4 }, { x: 43, y: 39 }, { x: 23, y: 0 }, { x: 0, y: 8 }, { x: 0, y: 41 }],
    waveCount: 6,
    startingStructures: [
      { kind: "barracks", x: 8, y: 35 }, { kind: "barracks", x: 12, y: 35 },
      { kind: "rifle", x: 7, y: 33 }, { kind: "rifle", x: 10, y: 33 }, { kind: "rifle", x: 13, y: 33 },
      { kind: "sentry", x: 6, y: 36 }, { kind: "sentry", x: 14, y: 36 },
      { kind: "flak", x: 9, y: 30 }, { kind: "flak", x: 15, y: 32 },
      { kind: "flame", x: 7, y: 37 }, { kind: "flame", x: 13, y: 37 },
      { kind: "laser", x: 16, y: 34 }, { kind: "railgun", x: 17, y: 37 },
      { kind: "factory", x: 10, y: 28 }, { kind: "factory", x: 18, y: 35 }, { kind: "missile", x: 18, y: 31 },
      { kind: "light", x: 6, y: 30 }, { kind: "light", x: 14, y: 29 }, { kind: "light", x: 18, y: 39 },
      { kind: "bastion", x: 6, y: 32 }, { kind: "bastion", x: 7, y: 32 }, { kind: "bastion", x: 8, y: 32 }, { kind: "bastion", x: 9, y: 32 }, { kind: "bastion", x: 10, y: 32 }, { kind: "bastion", x: 11, y: 32 }, { kind: "bastion", x: 12, y: 32 }, { kind: "bastion", x: 13, y: 32 }, { kind: "bastion", x: 14, y: 32 },
      { kind: "bastion", x: 6, y: 39 }, { kind: "bastion", x: 14, y: 39 }, { kind: "bastion", x: 6, y: 40 }, { kind: "bastion", x: 14, y: 40 },
      { kind: "wall", x: 5, y: 34 }, { kind: "wall", x: 5, y: 35 }, { kind: "wall", x: 5, y: 36 }, { kind: "wall", x: 5, y: 37 }, { kind: "wall", x: 5, y: 38 },
      { kind: "wall", x: 7, y: 40 }, { kind: "wall", x: 8, y: 40 }, { kind: "wall", x: 9, y: 40 }, { kind: "wall", x: 10, y: 40 }, { kind: "wall", x: 11, y: 40 }, { kind: "wall", x: 12, y: 40 }, { kind: "wall", x: 13, y: 40 },
      { kind: "trench", x: 7, y: 30 }, { kind: "trench", x: 8, y: 30 }, { kind: "trench", x: 11, y: 30 }, { kind: "trench", x: 12, y: 30 },
      { kind: "wire", x: 7, y: 28 }, { kind: "wire", x: 13, y: 28 }, { kind: "wire", x: 15, y: 39 },
      { kind: "mine", x: 5, y: 32 }, { kind: "mine", x: 15, y: 34 }, { kind: "mine", x: 15, y: 38 },
    ],
    startingMarines: [
      { kind: "rifleman", x: 8, y: 34 }, { kind: "rifleman", x: 9, y: 34 }, { kind: "rifleman", x: 11, y: 34 }, { kind: "rifleman", x: 12, y: 34 },
      { kind: "rifleman", x: 7, y: 29 }, { kind: "rifleman", x: 8, y: 29 }, { kind: "rifleman", x: 11, y: 29 }, { kind: "rifleman", x: 12, y: 29 },
      { kind: "gunner", x: 6, y: 33 }, { kind: "gunner", x: 14, y: 33 }, { kind: "gunner", x: 9, y: 37 }, { kind: "gunner", x: 11, y: 37 },
      { kind: "medic", x: 9, y: 36 }, { kind: "medic", x: 11, y: 36 },
      { kind: "rocketeer", x: 16, y: 32 }, { kind: "rocketeer", x: 16, y: 36 },
    ],
    activeEnemyCap: 75, waveMultiplier: 0.7, spawnIntervalMultiplier: 1.15,
    waterColor: 0x176a78, waterGlow: 0x073d4b,
    waterAt: (x, y) => x >= 27 && Math.abs(y - (24 + (43 - x) * 0.28)) <= 1,
    decorAt: (x, y) => {
      if (Math.hypot(x - 10, y - 35) < 9) return null;
      const scatter = terrainNoise(x, y, 11);
      return scatter > 0.988 ? "supply" : scatter < 0.018 && x < 31 ? "pine" : null;
    },
    heightAt: () => 0.04,
  },
  basin: {
    key: "basin", operation: "SUNSCOUR", sector: "K-12", name: "Cinder Basin", objective: "Defend the basin floor", terrain: "OPEN · ENCIRCLED",
    description: "A cactus-studded ash basin surrounds a spring-fed oasis. Long sightlines help artillery, but portals wrap around both flanks.",
    background: 0x160b08, ground: 0x1d100c, fog: 0x090301, hue: 0.065, saturation: 0.34,
    baseCell: { x: 22, y: 37 }, spawnCells: [{ x: 0, y: 4 }, { x: 43, y: 5 }, { x: 43, y: 35 }, { x: 5, y: 0 }],
    waveCount: 11,
    startingStructures: [{ kind: "barracks", x: 22, y: 34 }, { kind: "rifle", x: 18, y: 34 }, { kind: "wall", x: 21, y: 36 }, { kind: "factory", x: 26, y: 34 }, { kind: "wire", x: 23, y: 32 }, { kind: "railgun", x: 28, y: 30 }, { kind: "light", x: 22, y: 30 }, { kind: "bastion", x: 18, y: 32 }],
    startingMarines: [{ kind: "rifleman", x: 20, y: 32 }, { kind: "medic", x: 23, y: 34 }, { kind: "rifleman", x: 24, y: 30 }, { kind: "gunner", x: 20, y: 30 }, { kind: "rocketeer", x: 26, y: 30 }],
    waterColor: 0x198a91, waterGlow: 0x075c64,
    waterAt: (x, y) => Math.hypot(x - 11, y - 18) <= 4.3 || (x <= 11 && Math.abs(y - 18) <= 1),
    decorAt: (x, y) => {
      if (Math.hypot(x - 11, y - 18) < 6 || Math.hypot(x - 22, y - 34) < 7) return null;
      const scatter = terrainNoise(x, y, 23);
      return scatter > 0.958 ? "cactus" : scatter < 0.014 ? "bones" : null;
    },
    heightAt: (x, y) => {
      const distance = Math.hypot(x - 21.5, y - 21.5);
      const rim = Math.max(0, (distance - 9) / 15) * 1.05;
      const dune = Math.max(0, Math.sin(x * 0.48 + y * 0.16) + Math.cos(y * 0.5) - 0.85) * 0.13;
      return steppedHeight(0.04 + rim + dune);
    },
  },
  divide: {
    key: "divide", operation: "BLACKGLASS", sector: "R-3", name: "Blackglass Divide", objective: "Control the fractured mesas", terrain: "CHOKEPOINTS · EXTREME HEIGHT",
    description: "Seven terraced peaks, obsidian crystal fields, and a dark fracture river split every approach, with three narrow bridges linking both banks.",
    background: 0x090811, ground: 0x100f18, fog: 0x030207, hue: 0.69, saturation: 0.18,
    baseCell: { x: 4, y: 22 }, spawnCells: [{ x: 43, y: 3 }, { x: 43, y: 40 }, { x: 22, y: 0 }, { x: 22, y: 43 }],
    waveCount: 16,
    startingStructures: [{ kind: "barracks", x: 7, y: 22 }, { kind: "rifle", x: 9, y: 18 }, { kind: "wall", x: 9, y: 24 }, { kind: "factory", x: 11, y: 28 }, { kind: "wire", x: 11, y: 20 }, { kind: "flame", x: 11, y: 22 }, { kind: "bastion", x: 9, y: 26 }, { kind: "light", x: 13, y: 24 }],
    startingMarines: [{ kind: "rifleman", x: 7, y: 19 }, { kind: "medic", x: 7, y: 26 }, { kind: "rifleman", x: 7, y: 24 }, { kind: "gunner", x: 9, y: 20 }, { kind: "rocketeer", x: 11, y: 26 }],
    waterColor: 0x243d62, waterGlow: 0x101f4a,
    waterAt: (x, y) => Math.abs((y - 21) - (x - 22) * 0.24) <= 0.72 && !blackglassBridgeAt(x, y),
    bridgeAt: blackglassBridgeAt,
    decorAt: (x, y) => {
      if (Math.hypot(x - 4, y - 22) < 7) return null;
      const scatter = terrainNoise(x, y, 37);
      return scatter > 0.974 ? "crystal" : scatter < 0.012 ? "vent" : null;
    },
    heightAt: (x, y) => {
      if (blackglassBridgeAt(x, y)) return steppedHeight(0.16);
      const terrace = (cx: number, cy: number, rx: number, ry: number, peak: number) => {
        const distance = Math.hypot((x - cx) / rx, (y - cy) / ry);
        return distance < 0.38 ? peak : distance < 0.58 ? peak * 0.74 : distance < 0.78 ? peak * 0.42 : distance < 1 ? peak * 0.16 : 0;
      };
      const mountains = Math.max(
        terrace(13, 10, 9, 8, 4.48), terrace(30, 33, 10, 9, 4.16), terrace(34, 8, 6.5, 6, 3.68),
        terrace(23, 18, 5.5, 7, 3.2), terrace(14, 35, 6.5, 5.5, 2.88), terrace(39, 22, 4.5, 6.5, 2.56),
        terrace(24, 41, 5.5, 3.8, 2.24),
      );
      const fractureDistance = Math.abs((y - 20) - (x - 22) * 0.28);
      const fracture = fractureDistance < 0.72 ? 0.56 : fractureDistance < 1.35 ? 0.24 : 0;
      const brokenGround = Math.max(0, Math.sin(x * 0.82) * Math.cos(y * 0.67)) * 0.22;
      return steppedHeight(0.08 + mountains + brokenGround - fracture);
    },
  },
  ruins: {
    key: "ruins", operation: "PALIMPSEST", sector: "T-9", name: "Temple of Dust", objective: "Hold the sacred center", terrain: "ANCIENT RUINS · HIGH WALLS",
    description: "A central command post stands inside a shattered temple maze. Staggered gates and broken stone corridors bend eight invasion routes around the ruins.",
    background: 0x15120c, ground: 0x211d14, fog: 0x080603, hue: 0.115, saturation: 0.2,
    baseCell: { x: 22, y: 22 }, spawnCells: [{ x: 0, y: 7 }, { x: 0, y: 36 }, { x: 43, y: 7 }, { x: 43, y: 36 }, { x: 7, y: 0 }, { x: 36, y: 0 }, { x: 7, y: 43 }, { x: 36, y: 43 }],
    waveCount: 21,
    startingStructures: [{ kind: "barracks", x: 20, y: 20 }, { kind: "rifle", x: 24, y: 20 }, { kind: "wall", x: 19, y: 22 }, { kind: "factory", x: 25, y: 24 }, { kind: "wire", x: 22, y: 18 }, { kind: "flak", x: 22, y: 25 }, { kind: "light", x: 22, y: 16 }, { kind: "bastion", x: 18, y: 24 }],
    startingMarines: [{ kind: "rifleman", x: 21, y: 20 }, { kind: "medic", x: 23, y: 23 }, { kind: "rifleman", x: 24, y: 22 }, { kind: "gunner", x: 20, y: 24 }, { kind: "rocketeer", x: 25, y: 21 }],
    waterColor: 0x287789, waterGlow: 0x103e4d,
    waterAt: (x, y) => Math.hypot(x - 22, y - 6) <= 3.2 || Math.hypot(x - 22, y - 37) <= 3.2,
    decorAt: (x, y) => ((x === 13 || x === 30) && (y === 13 || y === 30)) || ((x === 10 || x === 33) && y % 8 === 4) ? "pillar" : (x + y * 3) % 41 === 0 ? "obelisk" : null,
    heightAt: (x, y) => {
      const openAt = (value: number, gates: number[]) => gates.some(gate => Math.abs(value - gate) <= 1);
      const outerWall =
        (x === 10 && y >= 5 && y <= 38 && !openAt(y, [13, 30]))
        || (x === 33 && y >= 5 && y <= 38 && !openAt(y, [11, 34]))
        || (y === 10 && x >= 5 && x <= 38 && !openAt(x, [14, 31]))
        || (y === 33 && x >= 5 && x <= 38 && !openAt(x, [12, 28]));
      const innerWall =
        (x === 16 && y >= 13 && y <= 30 && !openAt(y, [19, 27]))
        || (x === 27 && y >= 13 && y <= 30 && !openAt(y, [16, 25]))
        || (y === 16 && x >= 13 && x <= 30 && !openAt(x, [18, 22]))
        || (y === 27 && x >= 13 && x <= 30 && !openAt(x, [19, 26]));
      const corridorBaffle =
        (y === 13 && x >= 10 && x <= 21 && !openAt(x, [18]))
        || (x === 30 && y >= 10 && y <= 22 && !openAt(y, [16]))
        || (y === 30 && x >= 21 && x <= 33 && !openAt(x, [27]))
        || (x === 13 && y >= 21 && y <= 33 && !openAt(y, [28]));
      const templePad = Math.max(0, 1 - Math.hypot(x - 22, y - 22) / 7) * 0.42;
      return steppedHeight(0.08 + templePad + (outerWall ? 2.55 : corridorBaffle ? 2.2 : innerWall ? 1.9 : 0));
    },
  },
  homeworld: {
    key: "homeworld", operation: "THORNSPEAR", sector: "XENO-0", name: "The Breeding World", objective: "Survive the living planet", terrain: "ALIEN HOMEWORLD · TOTAL SURGE",
    description: "The command post is surrounded by spawning pits, luminous growths, and organic ridges. Twelve perimeter gates feed a relentless homeworld swarm.",
    background: 0x100619, ground: 0x160b20, fog: 0x050108, hue: 0.78, saturation: 0.46,
    baseCell: { x: 22, y: 22 }, spawnCells: [{ x: 0, y: 5 }, { x: 0, y: 16 }, { x: 0, y: 38 }, { x: 43, y: 5 }, { x: 43, y: 27 }, { x: 43, y: 38 }, { x: 7, y: 0 }, { x: 22, y: 0 }, { x: 37, y: 0 }, { x: 7, y: 43 }, { x: 22, y: 43 }, { x: 37, y: 43 }],
    waveCount: FINAL_MAP_WAVES,
    startingStructures: [{ kind: "barracks", x: 20, y: 20 }, { kind: "rifle", x: 24, y: 20 }, { kind: "wall", x: 19, y: 22 }, { kind: "missile", x: 25, y: 24 }, { kind: "wire", x: 22, y: 18 }, { kind: "flak", x: 22, y: 25 }, { kind: "light", x: 22, y: 16 }, { kind: "bastion", x: 18, y: 24 }],
    startingMarines: [{ kind: "rifleman", x: 21, y: 20 }, { kind: "medic", x: 23, y: 23 }, { kind: "rifleman", x: 24, y: 22 }, { kind: "gunner", x: 20, y: 24 }, { kind: "rocketeer", x: 25, y: 21 }],
    activeEnemyCap: 170, waveMultiplier: 2.15, spawnIntervalMultiplier: 0.58,
    waterColor: 0x68265f, waterGlow: 0x431052,
    waterAt: (x, y) => Math.hypot(x - 7, y - 28) <= 4.4 || Math.hypot(x - 37, y - 16) <= 4.4,
    decorAt: (x, y) => Math.hypot(x - 22, y - 22) > 7 && (x * 7 + y * 13) % 23 === 0 ? "growth" : null,
    heightAt: (x, y) => {
      const centralCalm = clamp(Math.hypot(x - 22, y - 22) / 9, 0, 1);
      const organicRidges = Math.max(0, Math.sin(x * 0.48 + y * 0.21) + Math.cos(y * 0.43 - x * 0.12) - 0.45) * 0.38;
      const broodMound = Math.max(0, 1 - Math.hypot(x - 11, y - 10) / 7) * 1.25 + Math.max(0, 1 - Math.hypot(x - 34, y - 34) / 8) * 1.1;
      return steppedHeight(0.08 + (organicRidges + broodMound) * centralCalm);
    },
  },
};
const MAP_ORDER: MapKey[] = ["ridge", "basin", "divide", "ruins", "homeworld"];

function Battlefield({ selected, mapKey, testerMode, onHud, onMessage, onUnitSelected, onProductionSelected, apiRef }: { selected: BuildSelection; mapKey: MapKey; testerMode: boolean; onHud: (h: Hud) => void; onMessage: (s: string) => void; onUnitSelected: (unit: SelectedUnit | null) => void; onProductionSelected: (building: ProductionBuildingInfo | null) => void; apiRef: React.MutableRefObject<BattlefieldApi | null> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  const callbacks = useRef({ onHud, onMessage, onUnitSelected, onProductionSelected });
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { callbacks.current = { onHud, onMessage, onUnitSelected, onProductionSelected }; }, [onHud, onMessage, onUnitSelected, onProductionSelected]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const map = MAPS[mapKey];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(map.background);
    scene.fog = new THREE.FogExp2(map.background, 0.01);
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 320);
    camera.position.set(42, 46, 46);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 26;
    controls.maxDistance = 92;
    controls.maxPolarAngle = Math.PI * 0.43;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.target.set(0, 0, 0);
    controls.enablePan = true;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

    scene.add(new THREE.HemisphereLight(0x9fc9bd, 0x162018, 1.2));
    const sun = new THREE.DirectionalLight(0xffe4c2, 3.8);
    sun.position.set(-14, 24, 12);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x55ffb0, 0.9);
    rim.position.set(18, 9, -18);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);
    const waterCells = new Set<string>();
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (map.waterAt(x, y)) waterCells.add(keyOf(x, y));
    const isWaterCell = (x: number, y: number) => waterCells.has(keyOf(clamp(Math.round(x), 0, GRID_W - 1), clamp(Math.round(y), 0, GRID_H - 1)));
    const heights: number[][] = Array.from({ length: GRID_H }, (_, y) => Array.from({ length: GRID_W }, (_, x) => isWaterCell(x, y) ? 0.02 : map.heightAt(x, y)));
    const terrainHeightAt = (x: number, y: number) => {
      const x0 = clamp(Math.floor(x), 0, GRID_W - 1), x1 = clamp(Math.ceil(x), 0, GRID_W - 1), y0 = clamp(Math.floor(y), 0, GRID_H - 1), y1 = clamp(Math.ceil(y), 0, GRID_H - 1);
      const tx = clamp(x - x0, 0, 1), ty = clamp(y - y0, 0, 1);
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(heights[y0][x0], heights[y0][x1], tx), THREE.MathUtils.lerp(heights[y1][x0], heights[y1][x1], tx), ty);
    };
    const worldPos = (x: number, y: number, lift = 0) => new THREE.Vector3((x - (GRID_W - 1) / 2) * TILE, terrainHeightAt(x, y) + lift, (y - (GRID_H - 1) / 2) * TILE);
    const box = (parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], color: number, rough = 0.8) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: rough < 0.5 ? 0.55 : 0.05 }));
      m.position.set(...pos); parent.add(m); return m;
    };
    const cyl = (parent: THREE.Object3D, radii: [number, number, number, number], pos: [number, number, number], color: number, rot: [number, number, number] = [0, 0, 0]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(...radii), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3 }));
      m.position.set(...pos); m.rotation.set(...rot); parent.add(m); return m;
    };
    const beam = (parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number) => {
      const mid = a.clone().add(b).multiplyScalar(0.5); const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 7), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      m.position.copy(mid); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); parent.add(m); return m;
    };

    type TerrainCell = { x: number; y: number; height: number; base: THREE.Color; water: boolean; bridge: boolean };
    type PickedTerrain = { mesh: THREE.InstancedMesh; instanceId: number; cell: TerrainCell };
    const terrainCells: TerrainCell[] = [];
    const tileMeshes: THREE.InstancedMesh[] = [];
    const waterRipples: Array<{ mesh: THREE.Mesh; phase: number }> = [];
    const fogCells: Array<{ x: number; y: number; index: number }> = [];
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const h = heights[y][x];
      const water = isWaterCell(x, y), bridge = !!map.bridgeAt?.(x, y);
      const color = bridge ? new THREE.Color((x + y) % 2 ? 0x515a62 : 0x626c73) : water ? new THREE.Color(map.waterColor).offsetHSL(0, 0, ((x + y) % 3 - 1) * 0.025) : new THREE.Color().setHSL(map.hue + ((x * 7 + y * 3) % 5) * 0.006, map.saturation, 0.20 + h * 0.035);
      const p = worldPos(x, y);
      terrainCells.push({ x, y, height: h, base: color, water, bridge });
      fogCells.push({ x, y, index: y * GRID_W + x });
      if (water && terrainNoise(x, y, 71) > 0.78) {
        const rippleMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(map.waterColor).offsetHSL(0.02, 0.12, 0.25), transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
        const ripple = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 12), rippleMaterial);
        ripple.rotation.x = -Math.PI / 2; ripple.scale.y = 0.56; ripple.position.copy(p).add(new THREE.Vector3(0, 0.04, 0)); ripple.renderOrder = 2; world.add(ripple);
        waterRipples.push({ mesh: ripple, phase: terrainNoise(x, y, 89) * Math.PI * 2 });
      }
      if (bridge) {
        const bridgeRig = new THREE.Group(); bridgeRig.position.copy(p); world.add(bridgeRig);
        for (const crossX of [-0.42, 0, 0.42]) box(bridgeRig, [0.08, 0.035, TILE * 0.94], [crossX, 0.035, 0], 0xa08149, 0.66);
        for (const side of [-1, 1]) {
          beam(bridgeRig, new THREE.Vector3(side * 0.55, 0.12, -0.62), new THREE.Vector3(side * 0.55, 0.12, 0.62), 0.035, 0x222a2f);
          beam(bridgeRig, new THREE.Vector3(side * 0.55, 0.12, -0.58), new THREE.Vector3(side * 0.55, 0.38, -0.58), 0.03, 0x2d363b);
          beam(bridgeRig, new THREE.Vector3(side * 0.55, 0.12, 0.58), new THREE.Vector3(side * 0.55, 0.38, 0.58), 0.03, 0x2d363b);
        }
      }
      const decor = water || bridge ? null : map.decorAt?.(x, y);
      if (decor) {
        const landmark = new THREE.Group(); landmark.position.copy(p); world.add(landmark);
        if (decor === "supply") {
          box(landmark, [0.72, 0.45, 0.58], [0, 0.23, 0], 0x53604b, 0.7);
          box(landmark, [0.77, 0.07, 0.63], [0, 0.49, 0], 0x81906e, 0.58);
          box(landmark, [0.08, 0.47, 0.61], [0, 0.24, 0], 0xb9a56e, 0.72);
        } else if (decor === "pine") {
          cyl(landmark, [0.08, 0.11, 0.9, 8], [0, 0.45, 0], 0x4a3426);
          for (let tier = 0; tier < 3; tier++) {
            const needles = new THREE.Mesh(new THREE.ConeGeometry(0.62 - tier * 0.12, 0.92, 8), new THREE.MeshStandardMaterial({ color: tier % 2 ? 0x1f523f : 0x28634b, roughness: 0.95 }));
            needles.position.y = 0.75 + tier * 0.42; landmark.add(needles);
          }
        } else if (decor === "cactus") {
          cyl(landmark, [0.17, 0.22, 1.55, 10], [0, 0.78, 0], 0x3d7b43);
          const leftElbow = new THREE.Vector3(-0.42, 0.72, 0), leftTip = new THREE.Vector3(-0.42, 1.18, 0);
          const rightElbow = new THREE.Vector3(0.36, 0.98, 0), rightTip = new THREE.Vector3(0.36, 1.34, 0);
          beam(landmark, new THREE.Vector3(-0.08, 0.72, 0), leftElbow, 0.11, 0x44884b); beam(landmark, leftElbow, leftTip, 0.11, 0x44884b);
          beam(landmark, new THREE.Vector3(0.08, 0.98, 0), rightElbow, 0.1, 0x37753f); beam(landmark, rightElbow, rightTip, 0.1, 0x37753f);
        } else if (decor === "bones") {
          beam(landmark, new THREE.Vector3(-0.55, 0.09, 0), new THREE.Vector3(0.55, 0.12, 0.05), 0.055, 0xd3c6a2);
          for (let rib = -2; rib <= 2; rib++) beam(landmark, new THREE.Vector3(rib * 0.17, 0.1, 0), new THREE.Vector3(rib * 0.17, 0.34 - Math.abs(rib) * 0.04, 0.28), 0.038, 0xb9ac8d);
          const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), new THREE.MeshStandardMaterial({ color: 0xc8ba97, roughness: 0.98 })); skull.position.set(0.67, 0.15, 0.04); skull.scale.set(1.2, 0.8, 0.9); landmark.add(skull);
        } else if (decor === "crystal") {
          for (let shard = 0; shard < 4; shard++) {
            const angle = shard * 1.7 + terrainNoise(x, y, shard) * 0.4, height = 0.65 + shard * 0.19;
            const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.16, height, 5), new THREE.MeshStandardMaterial({ color: shard % 2 ? 0x704f9c : 0x3e315f, emissive: 0x17102c, emissiveIntensity: 1.1, metalness: 0.52, roughness: 0.28 }));
            crystal.position.set(Math.cos(angle) * 0.24, height / 2, Math.sin(angle) * 0.24); crystal.rotation.z = Math.cos(angle) * 0.18; landmark.add(crystal);
          }
        } else if (decor === "vent") {
          const rimStone = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.12, 8, 18), new THREE.MeshStandardMaterial({ color: 0x26242b, roughness: 0.94 })); rimStone.rotation.x = Math.PI / 2; rimStone.position.y = 0.08; landmark.add(rimStone);
          const heat = new THREE.Mesh(new THREE.CircleGeometry(0.28, 18), new THREE.MeshBasicMaterial({ color: 0xff6b36, transparent: true, opacity: 0.72, side: THREE.DoubleSide })); heat.rotation.x = -Math.PI / 2; heat.position.y = 0.085; landmark.add(heat);
        } else if (decor === "pillar") {
          cyl(landmark, [0.38, 0.5, 0.25, 8], [0, 0.13, 0], 0x75684e);
          cyl(landmark, [0.22, 0.27, 2.75, 8], [0, 1.55, 0], 0x9a8965);
          box(landmark, [0.7, 0.22, 0.7], [0, 2.95, 0], 0x79694e);
        } else if (decor === "obelisk") {
          const stone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.8, 4), new THREE.MeshStandardMaterial({ color: 0x655b49, roughness: 0.95 }));
          stone.position.y = 1.4; stone.rotation.y = Math.PI / 4; landmark.add(stone);
        } else {
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), new THREE.MeshStandardMaterial({ color: 0x5a176f, emissive: 0x7d0c9c, emissiveIntensity: 1.4 })); core.position.y = 0.38; landmark.add(core);
          for (let branch = 0; branch < 3; branch++) {
            const angle = branch * Math.PI * 2 / 3 + (x + y) * 0.2;
            const tip = new THREE.Vector3(Math.cos(angle) * 0.65, 1.1 + branch * 0.17, Math.sin(angle) * 0.65);
            beam(landmark, new THREE.Vector3(0, 0.35, 0), tip, 0.075, 0x7d2d8e);
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe84dff })); bulb.position.copy(tip); landmark.add(bulb);
          }
        }
      }
    }
    const tileGeometry = new THREE.BoxGeometry(TILE - 0.045, 1, TILE - 0.045);
    const identityRotation = new THREE.Quaternion();
    const instanceMatrix = new THREE.Matrix4();
    function addTerrainBatch(cells: TerrainCell[], roughness: number, metalness: number, emissive = 0x000000, emissiveIntensity = 1) {
      if (!cells.length) return;
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness, emissive, emissiveIntensity });
      const mesh = new THREE.InstancedMesh(tileGeometry, material, cells.length);
      cells.forEach((cell, index) => {
        const p = worldPos(cell.x, cell.y);
        instanceMatrix.compose(new THREE.Vector3(p.x, (cell.height - 0.55) / 2, p.z), identityRotation, new THREE.Vector3(1, 0.55 + cell.height, 1));
        mesh.setMatrixAt(index, instanceMatrix);
        mesh.setColorAt(index, cell.base);
      });
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.cells = cells;
      mesh.computeBoundingSphere();
      world.add(mesh);
      tileMeshes.push(mesh);
    }
    addTerrainBatch(terrainCells.filter(cell => !cell.water && !cell.bridge), 0.98, 0);
    addTerrainBatch(terrainCells.filter(cell => cell.water && !cell.bridge), 0.18, 0.34, map.waterGlow, 0.8);
    addTerrainBatch(terrainCells.filter(cell => cell.bridge), 0.48, 0.46);

    const fogOpacity = new Float32Array(GRID_W * GRID_H).fill(0.88);
    const fogGeometry = new THREE.PlaneGeometry(TILE - 0.025, TILE - 0.025);
    const fogOpacityAttribute = new THREE.InstancedBufferAttribute(fogOpacity, 1);
    fogGeometry.setAttribute("instanceOpacity", fogOpacityAttribute);
    const fogMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { fogColor: { value: new THREE.Color(map.fog) } },
      vertexShader: `
        attribute float instanceOpacity;
        varying float vOpacity;
        void main() {
          vOpacity = instanceOpacity;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 fogColor;
        varying float vOpacity;
        void main() {
          if (vOpacity <= 0.025) discard;
          gl_FragColor = vec4(fogColor, vOpacity);
        }
      `,
    });
    const fogMesh = new THREE.InstancedMesh(fogGeometry, fogMaterial, fogCells.length);
    const fogRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    fogCells.forEach(cell => {
      const p = worldPos(cell.x, cell.y);
      instanceMatrix.compose(new THREE.Vector3(p.x, p.y + 0.045, p.z), fogRotation, new THREE.Vector3(1, 1, 1));
      fogMesh.setMatrixAt(cell.index, instanceMatrix);
    });
    fogMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fogMesh.renderOrder = 8;
    fogMesh.computeBoundingSphere();
    world.add(fogMesh);
    function refreshTerrainCellVisual(cell: TerrainCell) {
      // Terrain uses individual stepped tile instances, so height changes can
      // stay local instead of rebuilding the whole battlefield.
      cell.base.setHSL(map.hue + ((cell.x * 7 + cell.y * 3) % 5) * 0.006, map.saturation, 0.20 + cell.height * 0.035);
      for (const mesh of tileMeshes) {
        const index = (mesh.userData.cells as TerrainCell[]).indexOf(cell);
        if (index < 0) continue;
        const p = worldPos(cell.x, cell.y);
        instanceMatrix.compose(new THREE.Vector3(p.x, (cell.height - 0.55) / 2, p.z), identityRotation, new THREE.Vector3(1, 0.55 + cell.height, 1));
        mesh.setMatrixAt(index, instanceMatrix); mesh.setColorAt(index, cell.base); mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        break;
      }
      const p = worldPos(cell.x, cell.y);
      instanceMatrix.compose(new THREE.Vector3(p.x, p.y + 0.045, p.z), fogRotation, new THREE.Vector3(1, 1, 1));
      fogMesh.setMatrixAt(cell.y * GRID_W + cell.x, instanceMatrix); fogMesh.instanceMatrix.needsUpdate = true;
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), new THREE.MeshStandardMaterial({ color: map.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.58; scene.add(ground);

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
      g.scale.setScalar(scale * (kind === "gunner" ? 1.08 : kind === "rocketeer" ? 1.04 : 1)); return g;
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
    function makeFlakTurret() {
      const g = new THREE.Group();
      cyl(g, [0.7, 0.8, 0.2, 16], [0, 0.12, 0], 0x303c43);
      cyl(g, [0.43, 0.52, 0.42, 14], [0, 0.42, 0], 0x53636c);
      box(g, [0.92, 0.46, 0.72], [0, 0.76, -0.02], 0x405561, 0.3);
      box(g, [0.76, 0.18, 0.58], [0, 1.01, 0.04], 0x657984, 0.26);
      for (const x of [-0.2, 0.2]) {
        const breech = new THREE.Vector3(x, 0.83, -0.32), muzzlePoint = new THREE.Vector3(x, 1.34, -1.34);
        beam(g, breech, muzzlePoint, 0.072, 0x202c31);
        cyl(g, [0.105, 0.105, 0.2, 9], [x, 1.38, -1.43], 0x172125, [Math.PI / 2.65, 0, 0]);
      }
      const radar = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), new THREE.MeshStandardMaterial({ color: 0xa8efff, emissive: 0x26778e, emissiveIntensity: 2, roughness: 0.2 })); radar.position.set(0, 1.34, 0.12); g.add(radar);
      const radarLight = new THREE.PointLight(0x8fdfff, 1.4, 3); radarLight.position.copy(radar.position); g.add(radarLight);
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 1.42, -1.55); g.add(muzzle); g.userData.muzzle = muzzle;
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
    function makeTank() {
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        box(g, [0.34, 0.38, 1.72], [side * 0.64, 0.28, 0.06], 0x242b25, 0.18);
        for (const z of [-0.56, -0.18, 0.2, 0.58]) cyl(g, [0.16, 0.16, 0.08, 12], [side * 0.82, 0.28, z], 0x56604f, [0, 0, Math.PI / 2]);
        for (const z of [-0.76, 0.78]) box(g, [0.4, 0.09, 0.1], [side * 0.64, 0.48, z], 0x8c9a70, 0.4);
      }
      box(g, [1.15, 0.36, 1.48], [0, 0.53, 0.04], 0x536348, 0.3);
      box(g, [0.98, 0.24, 0.92], [0, 0.77, -0.06], 0x687654, 0.28);
      const turret = new THREE.Group(); turret.position.set(0, 0.94, -0.05); g.add(turret);
      cyl(turret, [0.46, 0.54, 0.32, 10], [0, 0, 0], 0x59694b);
      box(turret, [0.72, 0.3, 0.72], [0, 0.15, -0.12], 0x657552, 0.3);
      const barrelStart = new THREE.Vector3(0, 0.18, -0.36), muzzlePoint = new THREE.Vector3(0, 0.21, -1.55);
      beam(turret, barrelStart, muzzlePoint, 0.09, 0x303a32);
      cyl(turret, [0.13, 0.13, 0.22, 10], [0, 0.21, -1.62], 0x202823, [Math.PI / 2, 0, 0]);
      const hatch = cyl(turret, [0.2, 0.22, 0.09, 12], [0.22, 0.39, 0.02], 0x39463a); hatch.rotation.z = 0.08;
      const antenna = beam(turret, new THREE.Vector3(-0.28, 0.28, 0.12), new THREE.Vector3(-0.31, 0.83, 0.16), 0.018, 0x899882); antenna.rotation.z = -0.04;
      const muzzle = new THREE.Object3D(); muzzle.position.copy(muzzlePoint).add(new THREE.Vector3(0, 0, -0.13)); turret.add(muzzle); g.userData.muzzle = muzzle; g.userData.turret = turret;
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
      return g;
    }
    function addWallElevators(g: THREE.Group, top = 0.72) {
      const elevators: Record<"north" | "south" | "east" | "west", THREE.Group> = { north: new THREE.Group(), south: new THREE.Group(), east: new THREE.Group(), west: new THREE.Group() };
      const faces = [
        { key: "east", x: 1.08, z: 0, rotation: 0 }, { key: "west", x: -1.08, z: 0, rotation: Math.PI },
        { key: "north", x: 0, z: -1.08, rotation: Math.PI / 2 }, { key: "south", x: 0, z: 1.08, rotation: -Math.PI / 2 },
      ] as const;
      faces.forEach(({ key, x, z, rotation }) => {
        const lift = elevators[key]; lift.position.set(x, 0, z); lift.rotation.y = rotation; lift.visible = false; g.add(lift);
        box(lift, [0.12, top + 0.16, 0.62], [-0.24, (top + 0.16) / 2, 0], 0x3b4544, 0.42);
        box(lift, [0.12, top + 0.16, 0.62], [0.24, (top + 0.16) / 2, 0], 0x3b4544, 0.42);
        const platform = box(lift, [0.56, 0.09, 0.66], [0, 0.09, 0], 0x6b746f, 0.5);
        box(platform, [0.46, 0.025, 0.54], [0, 0.06, 0], 0x91a69b, 0.36);
        const callPanel = box(lift, [0.06, 0.16, 0.03], [-0.31, 0.43, -0.34], 0x4bcfa3, 0.22); callPanel.material = new THREE.MeshStandardMaterial({ color: 0x4bcfa3, emissive: 0x17634f, emissiveIntensity: 1.3, roughness: 0.25 });
        beam(lift, new THREE.Vector3(-0.24, top + 0.12, -0.28), new THREE.Vector3(0.24, top + 0.12, -0.28), 0.028, 0xa9b9ae);
        beam(lift, new THREE.Vector3(-0.24, top + 0.12, 0.28), new THREE.Vector3(0.24, top + 0.12, 0.28), 0.028, 0xa9b9ae);
      });
      g.userData.wallElevators = elevators;
    }
    function makeWall() {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        const cage = box(g, [0.58, 0.72, 1.65], [i * 0.59, 0.38, 0], 0xb2a284);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cage.geometry), new THREE.LineBasicMaterial({ color: 0x615b4e, transparent: true, opacity: 0.65 })); cage.add(edges);
      }
      addWallElevators(g);
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
      addWallElevators(g, 0.96);
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
      return g;
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
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.93, 1.5, 4), new THREE.MeshStandardMaterial({ color: 0x3c4c40, roughness: 0.92 })); roof.rotation.set(0, 0, Math.PI / 2); roof.position.y = 1.05; g.add(roof);
      box(g, [0.48, 0.71, 0.04], [0, 0.38, -0.76], 0x151d1a);
      box(g, [0.45, 0.35, 0.45], [1, 0.18, 0.42], 0x7c6844); box(g, [0.34, 0.3, 0.34], [0.88, 0.15, -0.31], 0x8a744b);
      cyl(g, [0.025, 0.025, 1.25, 7], [0.63, 1.55, 0.3], 0x9aa59d); return g;
    }
    function makeMachiningFactory() {
      const g = new THREE.Group();
      box(g, [3.45, 0.18, 3.45], [0, 0.1, 0], 0x303834, 0.24);
      box(g, [2.5, 1.35, 2.55], [0.22, 0.82, 0.18], 0x505b55, 0.34);
      box(g, [2.72, 0.16, 2.76], [0.22, 1.5, 0.18], 0x303b38, 0.25);
      const bay = box(g, [1.62, 0.94, 0.08], [-0.28, 0.62, -1.13], 0x17201d, 0.18);
      for (const x of [-0.72, -0.24, 0.24]) box(g, [0.08, 0.9, 0.08], [x, 0.64, -1.18], 0x8a926f, 0.35);
      for (const x of [-1.34, 1.34]) {
        cyl(g, [0.2, 0.24, 1.7, 10], [x, 0.87, 0.34], 0x434c48);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x303936, roughness: 0.7 })); cap.position.set(x, 1.9, 0.34); g.add(cap);
      }
      const crane = new THREE.Group(); crane.position.set(0.92, 1.62, -0.5); g.add(crane); g.userData.factoryRig = crane;
      beam(crane, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.72, 0), 0.07, 0xd0a94e);
      beam(crane, new THREE.Vector3(-0.62, 0.68, 0), new THREE.Vector3(0.62, 0.68, 0), 0.06, 0xd0a94e);
      beam(crane, new THREE.Vector3(0.54, 0.66, 0), new THREE.Vector3(0.54, 0.1, 0), 0.025, 0x262d2a);
      const warning = new THREE.PointLight(0xffb84d, 1.8, 5); warning.position.set(-0.9, 1.72, -0.92); g.add(warning);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7), new THREE.MeshStandardMaterial({ color: 0xffc35c, emissive: 0xa14b13, emissiveIntensity: 2.2 })); lamp.position.copy(warning.position); g.add(lamp);
      g.userData.factoryBay = bay;
      return g;
    }
    function makeAlien(kind: AlienKind) {
      const g = new THREE.Group();
      const bodyRig = new THREE.Group(); g.add(bodyRig);
      const legs: THREE.Group[] = [], legPhases: number[] = [], tails: THREE.Group[] = [], wings: THREE.Group[] = [];
      const brute = kind === "brute", spitter = kind === "spitter", broodmother = kind === "broodmother", razortail = kind === "razortail", stalker = kind === "stalker", strider = kind === "strider", flyer = kind === "flyer", prowler = kind === "prowler";
      const shellColor = brute ? 0x673832 : broodmother ? 0x5d3548 : spitter ? 0x28654b : razortail ? 0x57305f : stalker ? 0x27536b : strider ? 0x62572d : flyer ? 0x244f68 : prowler ? 0x62472f : 0x334d42;
      const skinColor = brute ? 0x2c1c1b : broodmother ? 0x271824 : spitter ? 0x172e25 : razortail ? 0x29162f : stalker ? 0x102832 : strider ? 0x292614 : flyer ? 0x102735 : prowler ? 0x2a1c16 : 0x192a24;
      const glowColor = broodmother ? 0xff8bb8 : spitter ? 0x63ff9f : razortail ? 0xe86bff : stalker ? 0x51dfff : strider ? 0xffe56d : flyer ? 0x79e8ff : prowler ? 0xffb36a : 0xff503f;
      const shell = new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.48, metalness: 0.18 });
      const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.82 });
      const glow = new THREE.MeshBasicMaterial({ color: glowColor });
      const legBladeGeometry = new THREE.ConeGeometry(1, 1, 5);
      const legJointGeometry = new THREE.OctahedronGeometry(1, 0);

      const addOrb = (parent: THREE.Object3D, radius: number, position: [number, number, number], scale: [number, number, number], material: THREE.Material) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material); mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
      };
      const addTaperedLimb = (parent: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material) => {
        const direction = end.clone().sub(start), length = direction.length();
        const segment = new THREE.Mesh(legBladeGeometry, material); segment.position.copy(start).lerp(end, 0.5); segment.scale.set(radius, length, radius); segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); parent.add(segment); return segment;
      };
      const addLeg = (side: number, z: number, phase: number, upper: number, lower: number, thickness: number, rootY: number) => {
        const pivot = new THREE.Group(); pivot.position.set(side * 0.34, rootY, z); g.add(pivot);
        const hip = new THREE.Vector3(side * upper * 0.48, 0.08, 0.02);
        const knee = new THREE.Vector3(side * upper, -0.16, side * 0.04);
        const ankle = new THREE.Vector3(side * (upper + lower * 0.7), -rootY + 0.15, -0.06);
        const foot = new THREE.Vector3(side * (upper + lower * 1.12), -rootY + 0.035, -0.2);
        beam(pivot, new THREE.Vector3(), hip, thickness * 1.12, shellColor);
        addTaperedLimb(pivot, hip, knee, thickness * 1.32, shell);
        addTaperedLimb(pivot, knee, ankle, thickness * 1.12, skin);
        addTaperedLimb(pivot, ankle, foot, thickness * 0.92, skin);
        const joint = new THREE.Mesh(legJointGeometry, shell); joint.position.copy(knee); joint.scale.set(thickness * 2.15, thickness * 1.65, thickness * 1.9); pivot.add(joint);
        const kneeSpike = knee.clone().add(new THREE.Vector3(side * (0.28 + upper * 0.16), 0.19 + thickness * 1.3, 0.11));
        addTaperedLimb(pivot, knee, kneeSpike, thickness * 1.72, shell);
        const rearBarb = ankle.clone().add(new THREE.Vector3(-side * 0.06, 0.17 + thickness, 0.2));
        addTaperedLimb(pivot, ankle, rearBarb, thickness * 1.18, skin);
        legs.push(pivot); legPhases.push(phase);
      };
      const addUnderLeg = (x: number, z: number, phase: number) => {
        const pivot = new THREE.Group(), rootY = 0.46, side = Math.sign(x) || 1, fore = z < 0 ? -1 : 1; pivot.position.set(x, rootY, z); g.add(pivot);
        const hip = new THREE.Vector3(side * 0.2, 0.04, fore * 0.04);
        const knee = new THREE.Vector3(side * 0.48, -0.18, fore * 0.13);
        const ankle = new THREE.Vector3(side * 0.65, -rootY + 0.14, fore * 0.25);
        const foot = new THREE.Vector3(side * 0.86, -rootY + 0.035, fore * 0.38);
        beam(pivot, new THREE.Vector3(), hip, 0.052, shellColor); addTaperedLimb(pivot, hip, knee, 0.064, shell); addTaperedLimb(pivot, knee, ankle, 0.052, skin); addTaperedLimb(pivot, ankle, foot, 0.038, skin);
        const joint = new THREE.Mesh(legJointGeometry, shell); joint.position.copy(knee); joint.scale.set(0.13, 0.09, 0.11); pivot.add(joint);
        const spur = knee.clone().add(new THREE.Vector3(side * 0.34, 0.2, -fore * 0.08)); addTaperedLimb(pivot, knee, spur, 0.075, shell);
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
        beam(bodyRig, new THREE.Vector3(0, 1.16, -0.48), new THREE.Vector3(0, 1.17, -1.12), 0.045, 0x282719);
        const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 7), glow); emitter.position.set(0, 1.17, -1.16); bodyRig.add(emitter);
        const emitterLight = new THREE.PointLight(0xffe56d, 1.5, 2.8); emitterLight.position.copy(emitter.position); bodyRig.add(emitterLight);
        [-0.05, 0.18, 0.38].forEach((z, i) => addSpine(0, 1.58 - i * 0.025, z, 0.18 - i * 0.018, 0xa08d43));
      } else if (kind === "prowler") {
        addOrb(bodyRig, 0.48, [0, 0.53, 0.1], [0.95, 0.64, 1.32], shell);
        addOrb(bodyRig, 0.35, [0, 0.48, -0.5], [1.08, 0.72, 0.98], skin);
        addOrb(bodyRig, 0.23, [0, 0.42, -0.86], [1.14, 0.63, 0.82], shell);
        addPlate([0, 0.73, 0.08], [0.94, 0.3, 1.16], 0x6d5834);
        for (const side of [-1, 1]) {
          addEye(side * 0.11, 0.46, -1.03, 0.046);
          addAntenna(side, new THREE.Vector3(side * 0.1, 0.5, -0.96), new THREE.Vector3(side * 0.24, 0.66, -1.15), new THREE.Vector3(side * 0.4, 0.5, -1.37), 0.016);
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 5), new THREE.MeshStandardMaterial({ color: 0xd1c291, roughness: 0.65 })); fang.position.set(side * 0.13, 0.33, -1.07); fang.rotation.x = -Math.PI / 2; bodyRig.add(fang);
        }
        addUnderLeg(-0.25, -0.38, 0); addUnderLeg(0.25, -0.38, Math.PI);
        addUnderLeg(-0.25, 0.38, Math.PI * 1.08); addUnderLeg(0.25, 0.38, Math.PI * 0.08);
        [-0.2, 0.08, 0.34].forEach((z, i) => addSpine(0, 0.92 - i * 0.04, z, 0.2 - i * 0.024, 0x8a7042));
      } else if (kind === "flyer") {
        addOrb(bodyRig, 0.42, [0, 0.64, 0.08], [0.78, 0.62, 1.48], shell);
        addOrb(bodyRig, 0.3, [0, 0.61, -0.54], [1.1, 0.72, 1.1], skin);
        addOrb(bodyRig, 0.2, [0, 0.58, -0.87], [1.2, 0.68, 0.92], shell);
        addPlate([0, 0.83, 0.06], [0.72, 0.28, 1.2], 0x35718d);
        addWingPair([0, 0.78, 0.08], 1.25, 1.65, 0x83e7f5);
        addWingPair([0, 0.71, 0.42], 0.72, 0.96, 0x80bddd);
        for (const side of [-1, 1]) {
          addEye(side * 0.09, 0.61, -1.06, 0.05);
          addAntenna(side, new THREE.Vector3(side * 0.09, 0.65, -1.0), new THREE.Vector3(side * 0.25, 0.84, -1.18), new THREE.Vector3(side * 0.5, 0.72, -1.46), 0.016);
          addScythe(side, new THREE.Vector3(side * 0.18, 0.58, -0.48), new THREE.Vector3(side * 0.42, 0.25, -0.72), new THREE.Vector3(side * 0.58, -0.18, -1.0), 0.04);
        }
        beam(bodyRig, new THREE.Vector3(0, 0.65, 0.38), new THREE.Vector3(0, 0.48, 1.08), 0.055, shellColor);
        const tailBlade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.48, 6), shell); tailBlade.position.set(0, 0.45, 1.22); tailBlade.rotation.x = Math.PI / 2; bodyRig.add(tailBlade);
        const flightGlow = new THREE.PointLight(0x79e8ff, 1.6, 3.4); flightGlow.position.set(0, 0.62, -0.72); bodyRig.add(flightGlow);
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

      const classScale = brute ? 0.9 : broodmother ? 0.82 : spitter ? 0.68 : razortail ? 0.74 : strider ? 0.72 : prowler ? 0.62 : stalker ? 0.4 : flyer ? 0.48 : 0.52;
      g.scale.setScalar(classScale * (0.94 + Math.random() * 0.12));
      g.userData.legs = legs; g.userData.legPhases = legPhases; g.userData.tails = tails; g.userData.wings = wings; g.userData.bodyRig = bodyRig; g.userData.kind = kind;
      return g;
    }
    function makeBase() {
      const g = new THREE.Group();
      cyl(g, [1.5, 1.68, 0.35, 12], [0, 0.18, 0], 0x3b4944);
      box(g, [1.9, 0.82, 1.5], [0, 0.72, 0], 0x52605b);
      box(g, [0.64, 0.58, 0.05], [0, 0.65, -0.78], 0x151d1b);
      cyl(g, [0.08, 0.08, 2.1, 8], [0, 2, 0], 0x6c7b74);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), new THREE.MeshBasicMaterial({ color: 0x76ffac })); beacon.position.y = 3.08; g.add(beacon);
      const light = new THREE.PointLight(0x66ffad, 2, 7); light.position.y = 2.8; g.add(light);
      return g;
    }

    const baseCell = map.baseCell, spawnCells = map.spawnCells;
    const maxActiveEnemies = map.activeEnemyCap ?? MAX_ACTIVE_ENEMIES;
    const base = makeBase(); base.position.copy(worldPos(baseCell.x, baseCell.y)); base.rotation.y = 0.55; world.add(base);
    const spawnBeacons = spawnCells.map((cell, index) => {
      const group = new THREE.Group();
      const portal = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.08, 10, 30), new THREE.MeshStandardMaterial({ color: 0x6f1827, emissive: 0x7f0d26, emissiveIntensity: 2 })); portal.rotation.x = Math.PI / 2; portal.position.y = 0.18; group.add(portal);
      const inner = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.52, 26), new THREE.MeshBasicMaterial({ color: 0xff3157, transparent: true, opacity: 0.24, side: THREE.DoubleSide })); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.12; group.add(inner);
      const light = new THREE.PointLight(0xff234c, 3, 7); light.position.y = 0.35; group.add(light); group.position.copy(worldPos(cell.x, cell.y)); world.add(group);
      return { group, portal, inner, light, phase: index * Math.PI * 0.67 };
    });

    const STRUCTURE_HP: Record<AssetKey, number> = { rifle: 190, sentry: 280, flak: 290, flame: 245, laser: 275, railgun: 310, tank: 620, howitzer: 300, missile: 340, light: 230, wall: 600, bastion: 1050, trench: 360, wire: 180, mine: 45, barracks: 500, factory: 900 };
    function attachHealthBar(group: THREE.Group, y = 1.75, friendlyDamageOnly = false) {
      group.userData.healthOffset = y * group.scale.y;
      if (!friendlyDamageOnly) { group.userData.healthBar = undefined; group.userData.healthFill = undefined; return; }
      const bar = new THREE.Group();
      const backing = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.16), new THREE.MeshBasicMaterial({ color: 0x07100d, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.09), new THREE.MeshBasicMaterial({ color: 0x7dff79, depthTest: false, depthWrite: false }));
      backing.renderOrder = 30; fill.position.z = 0.01; fill.renderOrder = 31; bar.add(backing, fill); bar.visible = false; world.add(bar);
      group.userData.healthBar = bar; group.userData.healthFill = fill; group.userData.friendlyDamageOnlyHealthBar = true;
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
      const ratio = clamp(Number.isFinite(hp / maxHp) ? hp / maxHp : 0, 0, 1), bar = group.userData.healthBar as THREE.Group | undefined, fill = group.userData.healthFill as THREE.Mesh | undefined;
      if (bar && group.userData.friendlyDamageOnlyHealthBar) bar.visible = ratio < 0.999;
      if (fill) { fill.scale.x = Math.max(0.001, ratio); fill.position.x = -0.55 * (1 - ratio); (fill.material as THREE.MeshBasicMaterial).color.setHex(ratio > 0.55 ? 0x7dff79 : ratio > 0.25 ? 0xffbd55 : 0xff5249); }
    }
    function syncHealthBar(group: THREE.Group) {
      const bar = group.userData.healthBar as THREE.Group | undefined; if (!bar) return; bar.position.copy(group.position).add(new THREE.Vector3(0, group.userData.healthOffset as number, 0)); bar.quaternion.copy(camera.quaternion);
    }
    function disposeObjectResources(root: THREE.Object3D, disposeGeometry = true) {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      root.traverse(node => {
        if (disposeGeometry && node instanceof THREE.Mesh) geometries.add(node.geometry);
        if (!(node instanceof THREE.Mesh || node instanceof THREE.Sprite)) return;
        const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
        nodeMaterials.forEach(material => {
          materials.add(material);
          Object.values(material as unknown as Record<string, unknown>).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
        });
      });
      textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); if (disposeGeometry) geometries.forEach(geometry => geometry.dispose());
    }
    function discardWorldObject(root: THREE.Object3D) { world.remove(root); disposeObjectResources(root); }
    function removeHealthBar(group: THREE.Group) {
      const bar = group.userData.healthBar as THREE.Group | undefined; if (bar) { world.remove(bar); disposeObjectResources(bar); } (group.userData.stackTexture as THREE.CanvasTexture | undefined)?.dispose(); (group.userData.stackBadge as THREE.Sprite | undefined)?.material.dispose(); group.userData.healthBar = undefined; group.userData.healthFill = undefined; group.userData.friendlyDamageOnlyHealthBar = undefined; group.userData.tierBadge = undefined; group.userData.tierTexture = undefined; group.userData.tierCanvas = undefined; group.userData.stackBadge = undefined; group.userData.stackTexture = undefined; group.userData.stackCanvas = undefined;
    }
    let credits = testerMode ? Infinity : 750, integrity = 100, wave = 0, kills = 0, active = false, buildTimer = 0, gameOver = false, victory = false;
    let spawnLeft = 0, spawnTimer = 0, assaultFront = 0, nextId = 1, elapsed = 0, lastHud = -1;
    let structures: Structure[] = [], enemies: Enemy[] = [], marines: Marine[] = [], bullets: Bullet[] = [], hostileProjectiles: HostileProjectile[] = [], particles: Particle[] = [];
    type EnemyRoute = { path: Cell[]; travelTime: number };
    const enemyRouteCache = new Map<string, EnemyRoute>();
    const incomingDamageCache = new Map<number, number>();
    const lightProjectilePool: THREE.Mesh[] = [], heavyProjectilePool: THREE.Mesh[] = [], rocketProjectilePool: THREE.Group[] = [];
    const lightProjectileGeometry = new THREE.SphereGeometry(0.045, 7, 5), heavyProjectileGeometry = new THREE.SphereGeometry(0.11, 7, 5);
    const rocketBodyGeometry = new THREE.CylinderGeometry(0.055, 0.072, 0.32, 8), rocketNoseGeometry = new THREE.ConeGeometry(0.058, 0.16, 8), rocketExhaustGeometry = new THREE.SphereGeometry(0.055, 7, 5);
    let routeRevision = 0, marineStackTimer = 0, lastProductionSnapshot = "";
    const selectedMarines = new Set<number>();
    const selectedEmplacements = new Set<number>();
    const trenchSlots: Cell[] = [{ x: -0.23, y: -0.22 }, { x: 0.23, y: -0.22 }, { x: -0.23, y: 0.22 }, { x: 0.23, y: 0.22 }];
    let selectedProductionId: number | null = null;
    const marineTroopCount = (marine: Marine) => marine.memberHp.length;
    const marineTotalHp = (marine: Marine) => marine.memberHp.reduce((total, hp) => total + hp, 0);
    const marineHealthRatio = (marine: Marine) => marineTotalHp(marine) / Math.max(1, marineTroopCount(marine) * marine.maxHp);
    function updateMarineStackBadge(marine: Marine) {
      let canvas = marine.group.userData.stackCanvas as HTMLCanvasElement | undefined, texture = marine.group.userData.stackTexture as THREE.CanvasTexture | undefined, badge = marine.group.userData.stackBadge as THREE.Sprite | undefined;
      const count = marineTroopCount(marine);
      if (!marine.stacked || count <= 1) { if (badge) badge.visible = false; return; }
      if (!canvas || !texture || !badge) {
        canvas = document.createElement("canvas"); canvas.width = 192; canvas.height = 72;
        texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter;
        badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })); badge.position.set(0, 1.62, 0); badge.scale.set(1.35, 0.5, 1); badge.renderOrder = 40; marine.group.add(badge);
        marine.group.userData.stackCanvas = canvas; marine.group.userData.stackTexture = texture; marine.group.userData.stackBadge = badge;
      }
      badge.visible = true; const ctx = canvas.getContext("2d"); if (!ctx) return; const color = MARINE_STATS[marine.kind].color;
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "rgba(4,13,10,.94)"; ctx.fillRect(3, 3, 186, 66); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(4, 4, 184, 64);
      ctx.fillStyle = color; ctx.font = "bold 42px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(`×${count}`, 96, 38); texture.needsUpdate = true;
    }
    function syncMarineStackState(marine: Marine) {
      marine.hp = marine.memberHp[0] ?? 0; setHealthVisual(marine.group, marineTotalHp(marine), marineTroopCount(marine) * marine.maxHp); updateMarineStackBadge(marine);
    }
    function damageMarine(marine: Marine, amount: number) {
      if (!marine.memberHp.length || amount <= 0) return;
      marine.memberHp[0] = Math.max(0, marine.memberHp[0] - amount);
      if (marine.memberHp[0] <= 0) {
        marine.memberHp.shift();
        if (marine.memberHp.length) burst(marine.group.position.clone().add(new THREE.Vector3(0, 0.45, 0)), 0xff5f47, 4);
      }
      syncMarineStackState(marine);
    }
    function healMarine(marine: Marine, amount: number) {
      let healing = Math.max(0, amount);
      for (let i = 0; i < marine.memberHp.length && healing > 0; i++) {
        const restored = Math.min(healing, marine.maxHp - marine.memberHp[i]); marine.memberHp[i] += restored; healing -= restored;
      }
      syncMarineStackState(marine);
    }
    function compactMarineStacks() {
      const stationaryMarines: Marine[] = [], buckets = new Map<string, Marine[]>();
      const stackLayer = (marine: Marine) => `${marine.kind}:${marine.mountedOn ?? 0}:${marine.trenchId ?? 0}:${Math.round(marine.lift * 20)}`;
      const stackBucket = (marine: Marine, cellX = Math.floor(marine.x / MARINE_STACK_COLLECTION_RADIUS), cellY = Math.floor(marine.y / MARINE_STACK_COLLECTION_RADIUS)) => `${stackLayer(marine)}:${cellX},${cellY}`;
      for (const marine of marines) {
        if (marine.movePath.length) continue;
        stationaryMarines.push(marine);
        const bucketKey = stackBucket(marine), bucket = buckets.get(bucketKey);
        if (bucket) bucket.push(marine); else buckets.set(bucketKey, [marine]);
      }
      const remaining = new Set(stationaryMarines);
      let changed = false;
      for (const anchor of stationaryMarines.sort((a, b) => Number(b.stacked) - Number(a.stacked) || a.id - b.id)) {
        if (!remaining.has(anchor)) continue;
        const cellX = Math.floor(anchor.x / MARINE_STACK_COLLECTION_RADIUS), cellY = Math.floor(anchor.y / MARINE_STACK_COLLECTION_RADIUS), nearby: Marine[] = [];
        for (let offsetX = -1; offsetX <= 1; offsetX++) for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (const marine of buckets.get(stackBucket(anchor, cellX + offsetX, cellY + offsetY)) ?? []) {
            if (remaining.has(marine) && Math.hypot(marine.x - anchor.x, marine.y - anchor.y) <= MARINE_STACK_COLLECTION_RADIUS) nearby.push(marine);
          }
        }
        const total = nearby.reduce((count, marine) => count + marineTroopCount(marine), 0);
        if (nearby.length < 2 || (total < MARINE_STACK_THRESHOLD && !nearby.some(marine => marine.stacked))) continue;
        const representative = nearby.find(marine => marine.stacked) ?? anchor, absorbed = nearby.filter(marine => marine !== representative);
        representative.memberHp = [representative, ...absorbed].flatMap(marine => marine.memberHp);
        representative.stacked = true; representative.cooldown = Math.min(...nearby.map(marine => marine.cooldown)); representative.supportCooldown = Math.min(...nearby.map(marine => marine.supportCooldown));
        if (nearby.some(marine => selectedMarines.has(marine.id))) selectedMarines.add(representative.id);
        const absorbedIds = new Set(absorbed.map(marine => marine.id));
        hostileProjectiles.forEach(shot => { if (shot.targetType === "marine" && absorbedIds.has(shot.targetId)) shot.targetId = representative.id; });
        enemies.forEach(enemy => { if (enemy.targetType === "marine" && enemy.targetId !== null && absorbedIds.has(enemy.targetId)) { enemy.targetId = representative.id; enemy.pathTimer = 0; } });
        for (const marine of nearby) remaining.delete(marine);
        for (const marine of absorbed) {
          selectedMarines.delete(marine.id); removeHealthBar(marine.group); discardWorldObject(marine.group); marines.splice(marines.indexOf(marine), 1);
        }
        syncMarineStackState(representative); changed = true;
      }
      if (changed) refreshSelection();
    }
    function detachMarineTroops(marine: Marine, count: number) {
      const detachedHp = marine.memberHp.splice(Math.max(0, marine.memberHp.length - count), count);
      const detachedId = spawnMarine(marine.kind, marine.x, marine.y, undefined, false), detached = marines.find(candidate => candidate.id === detachedId)!;
      detached.memberHp = detachedHp; detached.stacked = detachedHp.length > 1; detached.cooldown = marine.cooldown; detached.supportCooldown = marine.supportCooldown;
      if (selectedMarines.has(marine.id)) { selectedMarines.add(detached.id); refreshSelection(); }
      syncMarineStackState(marine); syncMarineStackState(detached);
      return detached;
    }
    function restoreDetachedTroops(marine: Marine, detached: Marine) {
      marine.memberHp.push(...detached.memberHp); syncMarineStackState(marine); selectedMarines.delete(detached.id); removeHealthBar(detached.group); discardWorldObject(detached.group); marines.splice(marines.indexOf(detached), 1); refreshSelection();
    }
    function autoFillNearbyTrenches() {
      const trenches = structures.filter(structure => structure.kind === "trench"), occupied = new Map<number, number>();
      trenches.forEach(trench => occupied.set(trench.id, marines.filter(marine => marine.trenchId === trench.id).reduce((total, marine) => total + marineTroopCount(marine), 0)));
      const rejectedPairs = new Set<string>();
      while (true) {
        let nearest: { marine: Marine; trench: Structure; distance: number } | undefined;
        for (const marine of marines) {
          if (marine.movePath.length || marine.trenchId || marine.mountedOn || marine.mountTarget) continue;
          for (const trench of trenches) {
            if ((occupied.get(trench.id) ?? 0) >= TRENCH_CAPACITY || rejectedPairs.has(`${marine.id}:${trench.id}`)) continue;
            const distance = Math.hypot(marine.x - trench.x, marine.y - trench.y);
            if (distance > TRENCH_AUTO_ENTRY_RANGE || (nearest && distance >= nearest.distance)) continue;
            nearest = { marine, trench, distance };
          }
        }
        if (!nearest) break;
        const { marine, trench } = nearest, usedSlots = occupied.get(trench.id) ?? 0, available = TRENCH_CAPACITY - usedSlots;
        const enteringCount = Math.min(available, marineTroopCount(marine));
        const entrant = enteringCount < marineTroopCount(marine) ? detachMarineTroops(marine, enteringCount) : marine;
        const slot = trenchSlots[usedSlots], destination = { x: trench.x + slot.x, y: trench.y + slot.y };
        if (planFriendlyMove(entrant, destination, undefined, undefined, -0.16)) {
          entrant.trenchId = trench.id; occupied.set(trench.id, usedSlots + enteringCount);
        } else {
          if (entrant !== marine) restoreDetachedTroops(marine, entrant);
          rejectedPairs.add(`${marine.id}:${trench.id}`);
        }
      }
    }
    function invalidateEnemyRoutes() {
      routeRevision++; enemyRouteCache.clear();
      enemies.forEach(enemy => { enemy.pathTimer = 0; enemy.index = 0; });
    }
    function acquireProjectile(pool: ProjectilePool, color: number) {
      if (pool === "rocket") {
        const projectile = rocketProjectilePool.pop() ?? (() => {
          const group = new THREE.Group();
          const body = new THREE.Mesh(rocketBodyGeometry, new THREE.MeshStandardMaterial({ color: 0x5c665e, metalness: 0.42, roughness: 0.34 }));
          const noseMaterial = new THREE.MeshStandardMaterial({ color, emissive: 0x7f2314, emissiveIntensity: 0.8, roughness: 0.3 });
          const nose = new THREE.Mesh(rocketNoseGeometry, noseMaterial); nose.position.y = 0.24;
          const exhaust = new THREE.Mesh(rocketExhaustGeometry, new THREE.MeshBasicMaterial({ color: 0xffc45d })); exhaust.position.y = -0.2;
          group.add(body, nose, exhaust); group.userData.noseMaterial = noseMaterial; return group;
        })();
        (projectile.userData.noseMaterial as THREE.MeshStandardMaterial).color.setHex(color); projectile.visible = true; return projectile;
      }
      const poolItems = pool === "heavy" ? heavyProjectilePool : lightProjectilePool;
      const projectile = poolItems.pop() ?? new THREE.Mesh(pool === "heavy" ? heavyProjectileGeometry : lightProjectileGeometry, new THREE.MeshBasicMaterial({ color }));
      (projectile.material as THREE.MeshBasicMaterial).color.setHex(color); projectile.visible = true; return projectile;
    }
    function releaseProjectile(projectile: THREE.Object3D, pool: ProjectilePool) {
      world.remove(projectile); projectile.visible = false;
      const poolItems = pool === "rocket" ? rocketProjectilePool : pool === "heavy" ? heavyProjectilePool : lightProjectilePool;
      if (poolItems.length < PROJECTILE_POOL_LIMIT) poolItems.push(projectile as never); else disposeObjectResources(projectile, false);
    }
    const isMobileEmplacement = (s: Structure) => s.kind === "rifle" || s.kind === "tank" || s.kind === "howitzer";
    const isCombatStructure = (s: Structure): s is Structure & { kind: CombatKey } => s.kind in TURRET_STATS;
    const isUpgradableStructure = (s: Structure): s is Structure & { kind: UpgradableKey } => isCombatStructure(s) || s.kind === "light";
    const isProductionBuilding = (s: Structure): s is Structure & { kind: "barracks" | "factory" } => s.kind === "barracks" || s.kind === "factory";
    const isWall = (s: Structure) => s.kind === "wall" || s.kind === "bastion";
    const isPathBlocking = (s: Structure) => s.kind !== "mine" && s.kind !== "wire" && s.kind !== "trench" && !s.mountedOn;
    const footprintFor = (kind: AssetKey, x: number, y: number): Cell[] => kind === "factory" ? [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }] : [{ x, y }];
    const occupiedCellsFor = (s: Structure) => isMobileEmplacement(s) ? [{ x: Math.round(s.x), y: Math.round(s.y) }] : s.footprint;
    const structureOccupiesCell = (s: Structure, x: number, y: number) => occupiedCellsFor(s).some(cell => cell.x === x && cell.y === y);
    const isEntrenched = (m: Marine) => !m.movePath.length && !!m.trenchId && structures.some(s => s.id === m.trenchId && s.kind === "trench" && Math.hypot(s.x - m.x, s.y - m.y) < 0.72);
    const directFireObstacleHeight = (structure: Structure, cell: Cell) => {
      const groundHeight = terrainHeightAt(cell.x, cell.y);
      if (isWall(structure)) return groundHeight + wallTopLift(structure);
      if (structure.kind === "factory") return groundHeight + 2.25;
      if (structure.kind === "barracks") return groundHeight + 1.8;
      if (structure.kind === "light") return groundHeight + 2.5;
      return groundHeight + structure.lift + 1.45;
    };
    function buildDirectFireObstacles() {
      const obstacles = new Map<string, number>();
      for (const structure of structures) {
        if (!isPathBlocking(structure) || isMobileEmplacement(structure)) continue;
        for (const cell of occupiedCellsFor(structure)) {
          const cellKey = keyOf(cell.x, cell.y), height = directFireObstacleHeight(structure, cell);
          obstacles.set(cellKey, Math.max(obstacles.get(cellKey) ?? -Infinity, height));
        }
      }
      return obstacles;
    }
    function hasDirectLineOfFire(from: THREE.Vector3, target: Enemy, sourceCell: string, obstacles: Map<string, number>) {
      const fromX = from.x / TILE + (GRID_W - 1) / 2, fromY = from.z / TILE + (GRID_H - 1) / 2;
      const distance = Math.hypot(target.x - fromX, target.y - fromY), samples = Math.max(2, Math.ceil(distance * 2));
      const targetHeight = target.group.position.y + 0.42;
      for (let sample = 1; sample < samples; sample++) {
        const progress = sample / samples, x = THREE.MathUtils.lerp(fromX, target.x, progress), y = THREE.MathUtils.lerp(fromY, target.y, progress), shotHeight = THREE.MathUtils.lerp(from.y, targetHeight, progress);
        if (terrainHeightAt(x, y) + 0.08 > shotHeight) return false;
        const cellKey = keyOf(clamp(Math.round(x), 0, GRID_W - 1), clamp(Math.round(y), 0, GRID_H - 1));
        if (cellKey !== sourceCell && (obstacles.get(cellKey) ?? -Infinity) + 0.04 > shotHeight) return false;
      }
      return true;
    }
    const enemyCollisionRadius = (enemy: Enemy) =>
      enemy.kind === "brute" || enemy.kind === "broodmother" ? 0.54
        : enemy.kind === "razortail" ? 0.46
          : enemy.kind === "spitter" || enemy.kind === "strider" || enemy.kind === "prowler" || enemy.kind === "flyer" ? 0.38
            : enemy.kind === "stalker" ? 0.22 : 0.32;
    const blocked = () => new Set(structures.filter(isPathBlocking).flatMap(s => occupiedCellsFor(s).map(cell => keyOf(cell.x, cell.y))));
    const topWallAt = (x: number, y: number) => structures.filter(s => isWall(s) && s.x === x && s.y === y).sort((a, b) => b.stackLevel - a.stackLevel)[0];
    const wallTopLift = (wall: Structure) => (wall.stackLevel + 1) * WALL_STACK_HEIGHT;
    const blockedForEnemy = (kind: AlienKind) => new Set([
      ...(!FLYING_ENEMIES.has(kind) && !WATER_ALIENS.has(kind) ? waterCells : []),
      ...structures.filter(s => !FLYING_ENEMIES.has(kind) && isPathBlocking(s) && (!WALL_CLIMBERS.has(kind) || !isWall(s))).flatMap(s => occupiedCellsFor(s).map(cell => keyOf(cell.x, cell.y))),
    ]);
    const terrainSpeedMultiplier = (from: Cell, to: Cell) => clamp(1 - (heights[to.y][to.x] - heights[from.y][from.x]) * 1.45, 0.28, 1.65);
    const friendlyStepTime = (from: Cell, to: Cell, speed: number) => {
      const distance = Math.hypot(to.x - from.x, to.y - from.y), climb = Math.max(0, heights[to.y][to.x] - heights[from.y][from.x]);
      const downhillBoost = clamp(1 + Math.max(0, heights[from.y][from.x] - heights[to.y][to.x]) * 0.3, 1, 1.35);
      return distance / Math.max(0.01, speed * downhillBoost) + climb / FRIENDLY_TERRAIN_CLIMB_SPEED;
    };
    let visionSources: Array<{ x: number; y: number; radius: number }> = [], fogTimer = 0;
    function rebuildVision() {
      visionSources = [{ x: baseCell.x, y: baseCell.y, radius: BASE_VISION_RADIUS }];
      marines.forEach(m => visionSources.push({ x: m.x, y: m.y, radius: MARINE_VISION_RADIUS }));
      structures.forEach(s => {
        if (s.kind === "light") visionSources.push({ x: s.x, y: s.y, radius: LIGHT_VISION_BASE + (s.level - 1) * LIGHT_VISION_PER_LEVEL });
        else if (isCombatStructure(s)) visionSources.push({ x: s.x, y: s.y, radius: COMBAT_VISION_RADIUS + (s.level - 1) * 0.6 });
        else if (s.kind === "barracks") visionSources.push({ x: s.x, y: s.y, radius: 5.8 });
        else visionSources.push({ x: s.x, y: s.y, radius: STRUCTURE_VISION_RADIUS });
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
      fogCells.forEach(cell => { fogOpacity[cell.index] = 0.9 * (1 - visibilityStrength(cell.x, cell.y)); });
      fogOpacityAttribute.needsUpdate = true;
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
    const friendlyBlocked = () => new Set([...waterCells, ...structures.filter(s => isPathBlocking(s) && !isMobileEmplacement(s)).flatMap(s => occupiedCellsFor(s).map(cell => keyOf(cell.x, cell.y)))]);
    const wallLiftDocks = (wall: Structure) => [
      { x: wall.x + 1, y: wall.y }, { x: wall.x - 1, y: wall.y },
      { x: wall.x, y: wall.y + 1 }, { x: wall.x, y: wall.y - 1 },
    ]
      .filter(cell => cell.x >= 0 && cell.y >= 0 && cell.x < GRID_W && cell.y < GRID_H);
    function groundRoute(from: Cell, to: Cell, ban = friendlyBlocked()) {
      if (ban.has(keyOf(Math.round(to.x), Math.round(to.y)))) return [];
      return findPathTo(from.x, from.y, { x: Math.round(to.x), y: Math.round(to.y) }, undefined, ban, (stepFrom, stepTo) => friendlyStepTime(stepFrom, stepTo, 1.65));
    }
    function planFriendlyMove(unit: Marine | Structure, destination: Cell, wall?: Structure, wallOffset: Cell = { x: 0, y: 0 }, destinationLift = 0) {
      const ban = friendlyBlocked(), currentWall = structures.find(s => s.id === unit.mountedOn && isWall(s));
      const departures = currentWall ? wallLiftDocks(currentWall) : [{ x: unit.x, y: unit.y }];
      const arrivals = wall ? wallLiftDocks(wall) : [destination];
      let best: MoveWaypoint[] = [];
      for (const departure of departures) for (const arrival of arrivals) {
        if (ban.has(keyOf(departure.x, departure.y)) || ban.has(keyOf(Math.round(arrival.x), Math.round(arrival.y)))) continue;
        const middle = groundRoute(departure, arrival, ban); if (!middle.length) continue;
        const route: MoveWaypoint[] = [{ x: unit.x, y: unit.y, lift: unit.lift }];
        if (currentWall) {
          route.push({ x: unit.x, y: unit.y, lift: 0 });
          route.push({ ...departure, lift: 0 });
        }
        route.push(...middle.slice(1).map(cell => ({ ...cell, lift: 0 })));
        if (wall) {
          const liftX = wall.x + wallOffset.x, liftY = wall.y + wallOffset.y;
          route.push({ x: liftX, y: liftY, lift: 0 });
          route.push({ x: liftX, y: liftY, lift: wallTopLift(wall) });
        }
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
      const dx = waypoint.x - unit.x, dy = waypoint.y - unit.y, distance = Math.hypot(dx, dy), liftDistance = Math.abs(waypoint.lift - unit.lift);
      if (distance <= 0.025 && liftDistance <= 0.025) {
        unit.x = waypoint.x; unit.y = waypoint.y; unit.lift = waypoint.lift; unit.pathIndex++;
        if (unit.pathIndex >= unit.movePath.length) { unit.movePath = []; unit.pathIndex = 0; unit.mountedOn = unit.mountTarget; unit.mountTarget = undefined; }
        return unit.movePath.length > 0;
      }
      const previous = unit.movePath[Math.max(0, unit.pathIndex - 1)] ?? { x: unit.x, y: unit.y, lift: unit.lift };
      const previousCell = { x: clamp(Math.round(previous.x), 0, GRID_W - 1), y: clamp(Math.round(previous.y), 0, GRID_H - 1) };
      const waypointCell = { x: clamp(Math.round(waypoint.x), 0, GRID_W - 1), y: clamp(Math.round(waypoint.y), 0, GRID_H - 1) };
      const segmentDistance = Math.max(0.01, Math.hypot(waypoint.x - previous.x, waypoint.y - previous.y));
      const segmentTime = friendlyStepTime(previousCell, waypointCell, speed), terrainAdjustedSpeed = segmentDistance / Math.max(0.01, segmentTime);
      const travelDistance = Math.hypot(distance, liftDistance), step = Math.min(travelDistance, (distance <= 0.025 ? WALL_LIFT_SPEED : terrainAdjustedSpeed) * dt), ratio = step / travelDistance;
      unit.x += dx * ratio; unit.y += dy * ratio; unit.lift += (waypoint.lift - unit.lift) * ratio;
      if (distance > 0.025) turnToward(unit.group, Math.atan2(-dx, -dy), turnSpeed, dt);
      if ("vx" in unit) { unit.vx = distance > 0.025 ? dx / distance * speed : 0; unit.vy = distance > 0.025 ? dy / distance * speed : 0; }
      return true;
    }
    function emitHud(force = false) {
      if (!force && elapsed - lastHud < 0.12) return; lastHud = elapsed;
      callbacks.current.onHud({ credits, integrity, wave, enemies: enemies.length + spawnLeft, kills, active, buildSeconds: buildTimer > 0 ? Math.ceil(buildTimer) : null, gameOver, victory });
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
    function publishProductionSelection(force = false) {
      const building = structures.find(s => s.id === selectedProductionId && isProductionBuilding(s));
      const current = building?.productionQueue[0];
      const info: ProductionBuildingInfo | null = building ? { id: building.id, kind: building.kind as "barracks" | "factory", currentName: current?.name ?? null, remaining: current ? Math.max(0, Math.ceil(building.productionRemaining)) : 0, duration: current?.duration ?? 0, queueLength: building.productionQueue.length, queue: building.productionQueue.map(order => ({ name: order.name, duration: order.duration })), rallyPoint: building.rallyPoint ?? null } : null;
      const snapshot = info ? `${info.id}:${info.currentName}:${info.remaining}:${info.queue.map(order => order.name).join(",")}:${info.rallyPoint ? `${info.rallyPoint.x},${info.rallyPoint.y}` : "none"}` : "none";
      if (!force && snapshot === lastProductionSnapshot) return;
      lastProductionSnapshot = snapshot; callbacks.current.onProductionSelected(info);
    }
    function addUpgradeVisual(s: Structure) {
      const color = s.level === 2 ? 0x62e8ff : 0xffd36a;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(s.kind === "tank" || s.kind === "howitzer" || s.kind === "missile" ? 0.78 : 0.62, 0.035, 7, 28), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3, roughness: 0.28 }));
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
      if (!testerMode && credits < cost) return message(`UPGRADE REQUIRES ${cost} COMMAND CREDITS`);
      if (!testerMode) credits -= cost; const oldMax = s.maxHp; s.level++; s.maxHp = Math.round(STRUCTURE_HP[s.kind] * (1 + (s.level - 1) * 0.35)); s.hp = Math.min(s.maxHp, s.hp + (s.maxHp - oldMax) + Math.round(oldMax * 0.2));
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
    function refreshWallElevators() {
      const walls = structures.filter(isWall);
      const directions = [
        { key: "north", dx: 0, dy: -1 }, { key: "south", dx: 0, dy: 1 },
        { key: "east", dx: 1, dy: 0 }, { key: "west", dx: -1, dy: 0 },
      ] as const;
      const topLevelAt = new Map<string, number>();
      walls.forEach(wall => topLevelAt.set(keyOf(wall.x, wall.y), Math.max(topLevelAt.get(keyOf(wall.x, wall.y)) ?? -1, wall.stackLevel)));
      walls.forEach(wall => {
        const elevators = wall.group.userData.wallElevators as Record<(typeof directions)[number]["key"], THREE.Group> | undefined;
        if (!elevators) return;
        const stackIsTall = (topLevelAt.get(keyOf(wall.x, wall.y)) ?? 0) >= 1;
        directions.forEach(({ key, dx, dy }) => {
          const neighborCoversThisLevel = (topLevelAt.get(keyOf(wall.x + dx, wall.y + dy)) ?? -1) >= wall.stackLevel;
          elevators[key].visible = stackIsTall && !neighborCoversThisLevel;
        });
      });
    }
    function addStructure(kind: AssetKey, x: number, y: number, free = false, mountedOn?: number, stackLevel = 0) {
      const group = kind === "rifle" ? makeRifleTeam() : kind === "sentry" ? makeSentry() : kind === "flak" ? makeFlakTurret() : kind === "flame" ? makeFlameTurret() : kind === "laser" ? makeLaserTower() : kind === "railgun" ? makeRailgun() : kind === "tank" ? makeTank() : kind === "howitzer" ? makeHowitzer() : kind === "missile" ? makeMissileBattery() : kind === "light" ? makeLightTower() : kind === "wall" ? makeWall() : kind === "bastion" ? makeBastion() : kind === "trench" ? makeTrench() : kind === "wire" ? makeWire() : kind === "mine" ? makeMine() : kind === "factory" ? makeMachiningFactory() : makeBarracks();
      const mountedWall = mountedOn ? structures.find(s => s.id === mountedOn && isWall(s)) : undefined;
      const mountCount = mountedOn ? structures.filter(s => s.mountedOn === mountedOn).length : 0;
      const lift = mountedWall ? wallTopLift(mountedWall) : kind === "wall" || kind === "bastion" ? stackLevel * WALL_STACK_HEIGHT : 0;
      const footprint = footprintFor(kind, x, y), centerX = footprint.reduce((sum, cell) => sum + cell.x, 0) / footprint.length, centerY = footprint.reduce((sum, cell) => sum + cell.y, 0) / footprint.length;
      group.position.copy(worldPos(centerX + (mountedOn ? (mountCount - 1) * 0.26 : 0), centerY, lift)); group.rotation.y = kind === "trench" || kind === "factory" || kind === "wall" || kind === "bastion" ? 0 : kind === "wire" ? Math.PI / 2 : -0.35; group.scale.multiplyScalar(mountedOn ? 0.58 : 0.72); attachHealthBar(group, kind === "wall" || kind === "bastion" ? 1.25 : kind === "barracks" ? 2 : kind === "factory" ? 2.35 : kind === "tank" ? 1.85 : 1.65, true); world.add(group);
      if (kind in TURRET_STATS || kind === "light") {
        const radius = kind === "tank" || kind === "howitzer" || kind === "missile" || kind === "railgun" ? 1.04 : 0.9;
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 28), new THREE.MeshBasicMaterial({ color: 0x7dff92, transparent: true, opacity: 0.95, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; group.add(ring); group.userData.selectionRing = ring;
        updateTierBadge(group, 1);
      }
      const maxHp = STRUCTURE_HP[kind], structure = { id: nextId++, kind, level: 1, x: centerX, y: centerY, targetX: centerX, targetY: centerY, footprint, hp: maxHp, maxHp, mountedOn, movePath: [], pathIndex: 0, lift, stackLevel, group, cooldown: Math.random(), productionQueue: [], productionRemaining: 0 } satisfies Structure; structures.push(structure);
      if (kind === "trench") refreshTrenchConnections();
      if (isWall(structure)) refreshWallElevators();
      if (!free && !testerMode) credits -= ASSETS[kind].cost;
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
      const kind = selectedRef.current;
      if (kind === "terrainRaise" || kind === "terrainLower") return;
      const asset = ASSETS[kind];
      if (gameOver) return;
      if (active && !testerMode) return message("CONSTRUCTION LOCKED · BUILDINGS DEPLOY BETWEEN WAVES ONLY");
      if (!testerMode && credits < asset.cost) return message("INSUFFICIENT COMMAND CREDITS");
      const footprint = footprintFor(kind, x, y);
      if (footprint.some(cell => cell.x < 0 || cell.y < 0 || cell.x >= GRID_W || cell.y >= GRID_H)) return message(`${asset.name.toUpperCase()} REQUIRES A CLEAR ${kind === "factory" ? "2×2" : "1×1"} GRID FOOTPRINT`);
      if (footprint.some(cell => isWaterCell(cell.x, cell.y))) return message("WATERLOGGED GROUND · ENTIRE STRUCTURE FOOTPRINT REQUIRES DRY LAND");
      if (footprint.some(cell => map.bridgeAt?.(cell.x, cell.y))) return message("BRIDGE DECK MUST REMAIN CLEAR");
      const wall = topWallAt(x, y), stackingWall = !!wall && (kind === "wall" || kind === "bastion");
      const canMount = !!wall && (kind in TURRET_STATS || kind === "light");
      const occupied = structures.some(s => !s.mountedOn && !(stackingWall && isWall(s)) && footprint.some(cell => structureOccupiesCell(s, cell.x, cell.y)));
      if (footprint.some(cell => (cell.x === baseCell.x && cell.y === baseCell.y) || spawnCells.some(spawn => cell.x === spawn.x && cell.y === spawn.y))) return message("DEPLOYMENT ZONE OCCUPIED");
      if (occupied && !canMount && !stackingWall) return message(wall ? "ONLY TURRETS, LIGHTS, OR MORE WALLS CAN USE THIS POSITION" : "DEPLOYMENT ZONE OCCUPIED");
      const stackLevel = stackingWall ? wall.stackLevel + 1 : 0;
      const placed = addStructure(kind, x, y, false, canMount ? wall.id : undefined, stackLevel);
      if (stackingWall) transferWallTop(wall, placed);
      if (kind !== "mine" && kind !== "wire" && !canMount) invalidateEnemyRoutes();
      const action = stackingWall ? `STACKED · WALL LEVEL ${stackLevel + 1}` : canMount ? "MOUNTED ON WALL" : "DEPLOYED";
      message(`${asset.name.toUpperCase()} ${action} · ELEVATION ${Math.round((heights[y][x] + placed.lift) * 100)}M`); emitHud(true);
    }
    function tryTerraform(x: number, y: number, direction: 1 | -1) {
      if (gameOver) return;
      if (active && !testerMode) return message("CONSTRUCTION LOCKED · TERRAFORM BETWEEN WAVES ONLY");
      const cell = terrainCells[y * GRID_W + x];
      if (cell.water) return message("WATER TERRAIN · TERRAFORMING PROHIBITED");
      if (cell.bridge) return message("BRIDGE DECK MUST REMAIN CLEAR");
      if (map.decorAt?.(x, y)) return message("LANDMARK TERRAIN · TERRAFORMING PROHIBITED");
      if (x === baseCell.x && y === baseCell.y || spawnCells.some(spawn => spawn.x === x && spawn.y === y)) return message("DEPLOYMENT ZONE PROTECTED");
      if (structures.some(structure => structureOccupiesCell(structure, x, y))) return message("CLEAR STRUCTURES BEFORE TERRAFORMING");
      if (!testerMode && credits < TERRAFORM_COST) return message("INSUFFICIENT COMMAND CREDITS");
      const nextHeight = steppedHeight(clamp(cell.height + direction * TERRAFORM_STEP, TERRAFORM_MIN_HEIGHT, TERRAFORM_MAX_HEIGHT));
      if (Math.abs(nextHeight - cell.height) < 0.01) return message(direction > 0 ? "TERRAIN ALREADY AT MAXIMUM ELEVATION" : "TERRAIN ALREADY AT MINIMUM ELEVATION");
      if (!testerMode) credits -= TERRAFORM_COST;
      heights[y][x] = nextHeight; cell.height = nextHeight;
      refreshTerrainCellVisual(cell); invalidateEnemyRoutes();
      burst(worldPos(x, y).add(new THREE.Vector3(0, 0.12, 0)), direction > 0 ? 0xd6bd7b : 0x719ec0, 5, 0.45);
      message(`TERRAIN ${direction > 0 ? "RAISED" : "LOWERED"} · ELEVATION ${Math.round(nextHeight * 100)}M · ¤ ${TERRAFORM_COST}`); emitHud(true);
    }
    function destroyStructure(s: Structure, salvaged = false) {
      if (!structures.includes(s)) return;
      if (s.rallyMarker) { discardWorldObject(s.rallyMarker); s.rallyMarker = undefined; }
      if (s.kind === "trench") marines.filter(m => m.trenchId === s.id).forEach(m => { m.trenchId = undefined; m.lift = 0; });
      const collapsingWalls = isWall(s) ? structures.filter(other => isWall(other) && other.x === s.x && other.y === s.y && other.stackLevel >= s.stackLevel) : [];
      const collapsingWallIds = new Set(collapsingWalls.map(wall => wall.id));
      if (isWall(s)) {
        structures.filter(other => other.mountedOn !== undefined && collapsingWallIds.has(other.mountedOn)).forEach(other => { selectedEmplacements.delete(other.id); burst(other.group.position, 0xff794f, 10); removeHealthBar(other.group); discardWorldObject(other.group); structures.splice(structures.indexOf(other), 1); });
        structures.filter(other => other.mountTarget !== undefined && collapsingWallIds.has(other.mountTarget)).forEach(other => { other.mountTarget = undefined; other.movePath = []; other.pathIndex = 0; other.targetX = other.x; other.targetY = other.y; });
        marines.filter(m => m.mountedOn !== undefined && collapsingWallIds.has(m.mountedOn)).forEach(m => { m.mountedOn = undefined; m.lift = 0; damageMarine(m, 35); m.targetX = clamp(m.x + 1, 0, GRID_W - 1); m.targetY = m.y; m.movePath = []; m.pathIndex = 0; });
        marines.filter(m => m.mountTarget !== undefined && collapsingWallIds.has(m.mountTarget)).forEach(m => { m.mountTarget = undefined; m.movePath = []; m.pathIndex = 0; m.targetX = m.x; m.targetY = m.y; });
        collapsingWalls.filter(wall => wall !== s).forEach(wall => { burst(wall.group.position, 0xff794f, 7); removeHealthBar(wall.group); discardWorldObject(wall.group); structures.splice(structures.indexOf(wall), 1); });
      }
      selectedEmplacements.delete(s.id);
      if (selectedProductionId === s.id) { selectedProductionId = null; publishProductionSelection(true); }
      publishStructureSelection();
      if (salvaged && !testerMode) credits += Math.floor(ASSETS[s.kind].cost * 0.6);
      burst(s.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), salvaged ? 0x9dff8b : 0xff553f, salvaged ? 5 : 15);
      removeHealthBar(s.group); discardWorldObject(s.group); structures.splice(structures.indexOf(s), 1);
      if (s.kind === "trench") refreshTrenchConnections();
      if (isWall(s)) refreshWallElevators();
      invalidateEnemyRoutes();
    }
    function removeStructureAt(x: number, y: number) {
      const s = structures.filter(item => structureOccupiesCell(item, x, y) || Math.hypot(item.x - x, item.y - y) < 0.72).sort((a, b) => Number(!!b.mountedOn) - Number(!!a.mountedOn) || b.stackLevel - a.stackLevel)[0]; if (!s) return;
      destroyStructure(s, true);
      message(testerMode ? `${ASSETS[s.kind].name.toUpperCase()} REMOVED FROM TEST RANGE` : `${ASSETS[s.kind].name.toUpperCase()} SALVAGED · +${Math.floor(ASSETS[s.kind].cost * 0.6)} CREDITS`); emitHud(true);
    }
    function spawnMarine(kind: MarineKind, x: number, y: number, mountedOn?: number, compactAfterSpawn = true) {
      const stats = MARINE_STATS[kind], mountedWall = mountedOn ? structures.find(s => s.id === mountedOn && isWall(s)) : undefined, lift = mountedWall ? wallTopLift(mountedWall) : 0;
      const m = makeSoldier(0.68, kind); m.position.copy(worldPos(x, y, lift));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(stats.color), transparent: true, opacity: 0.95, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; ring.visible = false; m.add(ring); m.userData.selectionRing = ring;
      attachHealthBar(m, 1.22, true); world.add(m); const id = nextId++;
      marines.push({ id, kind, x, y, targetX: x, targetY: y, vx: 0, vy: 0, hp: stats.hp, maxHp: stats.hp, memberHp: [stats.hp], stacked: false, cooldown: 0, supportCooldown: 0, mountedOn, movePath: [], pathIndex: 0, lift, group: m }); if (compactAfterSpawn) compactMarineStacks(); return id;
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
      const count = marines.filter(marine => selectedMarines.has(marine.id)).reduce((total, marine) => total + marineTroopCount(marine), 0) + selectedEmplacements.size, selectedStructure = structures.find(s => s.id === clicked.id);
      message(clicked.type === "emplacement" && count === 1 && selectedStructure ? `${ASSETS[selectedStructure.kind].name.toUpperCase()} SELECTED · UPGRADE PANEL ONLINE` : `${count} UNIT${count === 1 ? "" : "S"} SELECTED · RIGHT-CLICK TO MOVE`); return true;
    }
    function commandFormation(x: number, y: number) {
      const trench = structures.find(s => s.kind === "trench" && s.x === x && s.y === y);
      if (trench) {
        const infantry = marines.filter(m => selectedMarines.has(m.id));
        if (!infantry.length) { message("TRENCHES ACCEPT INFANTRY ONLY · CREWED WEAPONS CANNOT ENTER"); return selectedEmplacements.size > 0; }
        const occupied = marines.filter(m => m.trenchId === trench.id && !selectedMarines.has(m.id)).reduce((total, marine) => total + marineTroopCount(marine), 0), available = Math.max(0, TRENCH_CAPACITY - occupied);
        if (!available) { message("TRENCH AT CAPACITY · FOUR INFANTRY MAXIMUM"); return true; }
        let routed = 0, remainingCapacity = available;
        infantry.forEach(unit => {
          const troopCount = marineTroopCount(unit); if (troopCount > remainingCapacity) return;
          const slot = trenchSlots[TRENCH_CAPACITY - remainingCapacity], destination = { x: trench.x + slot.x, y: trench.y + slot.y };
          if (planFriendlyMove(unit, destination, undefined, undefined, -0.16)) { unit.trenchId = trench.id; routed += troopCount; remainingCapacity -= troopCount; }
        });
        message(routed ? `${routed} INFANTRY ENTERING TRENCH · 40% INCOMING DAMAGE REDUCTION${remainingCapacity === 0 ? " · CAPACITY REACHED" : ""}` : "NO SAFE ROUTE TO TRENCH · STACK MAY EXCEED CAPACITY"); return true;
      }
      const squad = [
        ...marines.filter(m => selectedMarines.has(m.id)).map(unit => ({ type: "marine" as const, unit })),
        ...structures.filter(s => selectedEmplacements.has(s.id) && isMobileEmplacement(s)).map(unit => ({ type: "emplacement" as const, unit })),
      ]; if (!squad.length) return false;
      if (isWaterCell(x, y)) { message("WATER IMPASSABLE · FRIENDLY GROUND UNITS REQUIRE DRY LAND"); return true; }
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
        if (planFriendlyMove(member.unit, destination, wall, wall ? { x: offsetX * wallScale, y: offsetY * wallScale } : undefined)) { if (member.type === "marine") { member.unit.trenchId = undefined; routed += marineTroopCount(member.unit); } else routed++; }
      });
      if (!routed) { message("NO SAFE ROUTE · WATER OR FORTIFICATIONS BLOCK THE FORMATION"); return true; }
      message(`${routed}-UNIT COMPACT ${columns}×${rows} FORMATION ${wall ? "ROUTING TO WALL ELEVATORS" : "ROUTING AROUND FORTIFICATIONS"} · CREWED WEAPONS MOVE SLOWLY`); return true;
    }
    function selectProductionBuildingAt(x: number, y: number) {
      const building = structures.find(s => isProductionBuilding(s) && structureOccupiesCell(s, x, y)); if (!building) return false;
      selectedMarines.clear(); selectedEmplacements.clear(); refreshSelection(); publishStructureSelection(); selectedProductionId = building.id; publishProductionSelection(true);
      message(building.kind === "factory" ? "MACHINING FACTORY SELECTED · RIGHT-CLICK CLEAR GROUND TO SET RALLY" : "BARRACKS SELECTED · RIGHT-CLICK CLEAR GROUND TO SET RALLY"); return true;
    }
    function queueProduction(building: Structure, order: ProductionOrder, cost: number) {
      if (gameOver) return message("PRODUCTION OFFLINE · OPERATION HAS ENDED");
      if (!testerMode && credits < cost) return message(`${order.name.toUpperCase()} REQUIRES ${cost} COMMAND CREDITS`);
      if (!testerMode) credits -= cost;
      building.productionQueue.push(order);
      if (building.productionQueue.length === 1) building.productionRemaining = order.duration;
      publishProductionSelection(true); emitHud(true);
      message(`${order.name.toUpperCase()} QUEUED · ${order.duration}-SECOND ${order.category === "marine" ? "TRAINING" : "ASSEMBLY"} CYCLE · POSITION ${building.productionQueue.length}`);
    }
    function recruit(kind: MarineKind) {
      const stats = MARINE_STATS[kind], barracks = structures.find(s => s.id === selectedProductionId && s.kind === "barracks");
      if (!barracks) return message("SELECT A FIELD BARRACKS FIRST");
      queueProduction(barracks, { category: "marine", kind, name: stats.name, duration: INFANTRY_PRODUCTION_SECONDS }, stats.cost);
    }
    function produce(kind: FactoryUnitKind) {
      const factory = structures.find(s => s.id === selectedProductionId && s.kind === "factory");
      if (!factory) return message("SELECT A MACHINING FACTORY FIRST");
      const asset = ASSETS[kind]; queueProduction(factory, { category: "factory", kind, name: asset.name, duration: FACTORY_PRODUCTION_SECONDS }, asset.cost);
    }
    function productionExit(building: Structure) {
      const candidates = [
        { x: Math.round(building.x + 2.5), y: Math.round(building.y) }, { x: Math.round(building.x - 2.5), y: Math.round(building.y) },
        { x: Math.round(building.x), y: Math.round(building.y + 2.5) }, { x: Math.round(building.x), y: Math.round(building.y - 2.5) },
      ].filter(cell => cell.x >= 0 && cell.y >= 0 && cell.x < GRID_W && cell.y < GRID_H && !isWaterCell(cell.x, cell.y));
      return candidates.find(cell => !structures.some(s => isPathBlocking(s) && structureOccupiesCell(s, cell.x, cell.y))) ?? candidates[0] ?? { x: clamp(Math.round(building.x + 1), 0, GRID_W - 1), y: clamp(Math.round(building.y), 0, GRID_H - 1) };
    }
    function createRallyMarker(building: Structure, point: Cell) {
      if (building.rallyMarker) discardWorldObject(building.rallyMarker);
      const marker = new THREE.Group(), color = new THREE.Color(ASSETS[building.kind].accent);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.94, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 28), material);
      outerRing.rotation.x = -Math.PI / 2; outerRing.renderOrder = 30; marker.add(outerRing);
      const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 20), material);
      innerRing.rotation.x = -Math.PI / 2; innerRing.position.y = 0.015; innerRing.renderOrder = 30; marker.add(innerRing);
      const indicator = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 6), material);
      indicator.rotation.x = Math.PI; indicator.position.y = 0.8; indicator.renderOrder = 30; marker.add(indicator);
      marker.position.copy(worldPos(point.x, point.y, 0.065)); marker.userData.indicator = indicator; marker.userData.phase = building.id * 0.73; world.add(marker); building.rallyMarker = marker;
    }
    function setProductionRally(x: number, y: number) {
      const building = structures.find(s => s.id === selectedProductionId && isProductionBuilding(s));
      if (!building) return false;
      if (isWaterCell(x, y)) { message("RALLY POINT REQUIRES DRY GROUND · WATER IS IMPASSABLE"); return true; }
      if (structures.some(s => isPathBlocking(s) && structureOccupiesCell(s, x, y))) { message("RALLY POINT BLOCKED · CHOOSE CLEAR GROUND"); return true; }
      if (!groundRoute(productionExit(building), { x, y }).length) { message("NO SAFE ROUTE TO RALLY POINT · WATER OR FORTIFICATIONS BLOCK THE WAY"); return true; }
      building.rallyPoint = { x, y }; createRallyMarker(building, building.rallyPoint); publishProductionSelection(true);
      message(`${building.kind === "factory" ? "FACTORY" : "BARRACKS"} RALLY POINT SET · NEW ${building.kind === "factory" ? "VEHICLES" : "INFANTRY"} WILL MOVE TO GRID ${x},${y}`); return true;
    }
    function finishProduction(building: Structure, order: ProductionOrder) {
      const exit = productionExit(building);
      let dispatched = false;
      if (order.category === "marine") {
        const unitId = spawnMarine(order.kind, exit.x, exit.y, undefined, false), unit = marines.find(marine => marine.id === unitId)!;
        dispatched = building.rallyPoint ? planFriendlyMove(unit, building.rallyPoint) : false;
        if (!dispatched) compactMarineStacks();
      } else {
        const unit = addStructure(order.kind, exit.x, exit.y, true);
        dispatched = building.rallyPoint ? planFriendlyMove(unit, building.rallyPoint) : false;
      }
      burst(worldPos(exit.x, exit.y, 0.45), order.category === "marine" ? 0x67c8ff : 0xe5ba67, 10);
      message(`${order.name.toUpperCase()} PRODUCTION COMPLETE · UNIT DEPLOYED BESIDE ${building.kind === "factory" ? "FACTORY" : "BARRACKS"}${building.rallyPoint ? dispatched ? " · MOVING TO RALLY POINT" : " · RALLY ROUTE CURRENTLY BLOCKED" : ""}`);
    }
    function updateProduction(dt: number) {
      for (const building of structures.filter(isProductionBuilding)) {
        if (!building.productionQueue.length) continue;
        building.productionRemaining -= dt;
        while (building.productionQueue.length && building.productionRemaining <= 0) {
          const completed = building.productionQueue.shift()!; finishProduction(building, completed);
          const next = building.productionQueue[0]; building.productionRemaining += next?.duration ?? 0;
        }
      }
      if (selectedProductionId !== null) publishProductionSelection();
    }
    function assaultOffset(spawnCell: Cell, formationIndex: number): Cell {
      const column = formationIndex % 6, rank = Math.floor(formationIndex / 6);
      const lateral = (column - 2.5) * 0.28, inward = rank * 0.34;
      if (spawnCell.x === 0) return { x: inward, y: lateral };
      if (spawnCell.x === GRID_W - 1) return { x: -inward, y: lateral };
      if (spawnCell.y === 0) return { x: lateral, y: inward };
      return { x: lateral, y: -inward };
    }
    function spawnEnemy(spawnCell: Cell, formationIndex = 0) {
      const weights: Array<[AlienKind, number]> = [
        ["drone", Math.max(30, 82 - wave * 2)],
        ["spitter", wave >= 3 ? 10 + wave * 0.45 : 0],
        ["flyer", wave >= 3 ? 8 + wave * 0.35 : 0],
        ["stalker", 62 + wave * 1.25],
        ["prowler", wave >= 6 ? 9 + wave * 0.48 : 0],
        ["brute", wave >= 7 ? 7 + wave * 0.55 : 0],
        ["strider", wave >= 8 ? 3 + wave * 0.25 : 0],
        ["razortail", wave >= 10 ? 5 + wave * 0.3 : 0],
        ["broodmother", wave >= 12 ? 1.5 + wave * 0.2 : 0],
      ];
      let roll = Math.random() * weights.reduce((sum, [, weight]) => sum + weight, 0), kind: AlienKind = "drone";
      for (const [candidate, weight] of weights) { roll -= weight; if (roll <= 0) { kind = candidate; break; } }
      const stats = ENEMY_STATS[kind], scale = 1 + wave * 0.055, hp = stats.hp * scale, offset = assaultOffset(spawnCell, formationIndex);
      const spawnX = clamp(spawnCell.x + offset.x, 0, GRID_W - 1), spawnY = clamp(spawnCell.y + offset.y, 0, GRID_H - 1);
      const group = makeAlien(kind), p = worldPos(spawnX, spawnY, FLYING_ENEMIES.has(kind) ? 2.65 : 0); group.position.copy(p); group.rotation.y = (Math.random() - 0.5) * 0.7; attachHealthBar(group, stats.barHeight); world.add(group);
      enemies.push({ id: nextId++, kind, x: spawnX, y: spawnY, hp, maxHp: hp, speed: stats.speed * ALIEN_SPEED_MULTIPLIER * (1 + wave * 0.008), damage: stats.damage * (1 + wave * 0.022), reward: stats.reward, path: [], index: 0, group, hitFlash: 0, attackCooldown: Math.random() * 0.35, pathTimer: 0, targetBiasSeed: Math.random(), targetId: null, targetType: "base" });
    }
    function spawnBroodling(x: number, y: number, index: number) {
      const stats = ENEMY_STATS.stalker, waveScale = 1 + wave * 0.055, hp = stats.hp * waveScale * 0.58;
      const group = makeAlien("stalker"), matureScale = group.scale.x;
      group.scale.setScalar(matureScale * 0.62); group.userData.broodling = true;
      group.position.copy(worldPos(x, y)); group.rotation.y = (Math.random() - 0.5) * Math.PI * 2; attachHealthBar(group, stats.barHeight); world.add(group);
      enemies.push({ id: nextId++, kind: "stalker", x, y, hp, maxHp: hp, speed: stats.speed * ALIEN_SPEED_MULTIPLIER * (1 + wave * 0.008), damage: stats.damage * (1 + wave * 0.022) * 0.75, reward: Math.max(8, Math.round(stats.reward * 0.35)), path: [], index: 0, group, hitFlash: 0, attackCooldown: 0.4 + index * 0.15, pathTimer: 0, targetBiasSeed: Math.random(), targetId: null, targetType: "base" });
    }
    function hatchBroodlings(at: THREE.Vector3, seed: number) {
      const remaining = MAX_ACTIVE_BROODLINGS - enemies.filter(enemy => enemy.group.userData.broodling === true).length;
      if (remaining <= 0) return 0;
      const impact = { x: clamp(Math.round(at.x / TILE + (GRID_W - 1) / 2), 0, GRID_W - 1), y: clamp(Math.round(at.z / TILE + (GRID_H - 1) / 2), 0, GRID_H - 1) };
      const offsets: Cell[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }, { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 }];
      let hatched = 0;
      for (let broodlingIndex = 0; broodlingIndex < Math.min(BROODLINGS_PER_EGG, remaining); broodlingIndex++) {
        let hatchCell: Cell | undefined;
        for (let offsetIndex = 0; offsetIndex < offsets.length; offsetIndex++) {
          const offset = offsets[(seed + broodlingIndex * 3 + offsetIndex) % offsets.length], candidate = { x: impact.x + offset.x, y: impact.y + offset.y };
          if (candidate.x < 0 || candidate.y < 0 || candidate.x >= GRID_W || candidate.y >= GRID_H || isWaterCell(candidate.x, candidate.y)) continue;
          if (structures.some(structure => isPathBlocking(structure) && structureOccupiesCell(structure, candidate.x, candidate.y))) continue;
          if (enemies.some(enemy => Math.hypot(enemy.x - candidate.x, enemy.y - candidate.y) < 0.4)) continue;
          hatchCell = candidate; break;
        }
        if (!hatchCell) continue;
        spawnBroodling(hatchCell.x, hatchCell.y, broodlingIndex);
        burst(worldPos(hatchCell.x, hatchCell.y, 0.2), 0x58ddff, 10, 0.55);
        hatched++;
      }
      return hatched;
    }
    function spawnSwarmPacket() {
      const groupSize = Math.min(spawnLeft, HOSTILE_SPAWN_PACKET_SIZE);
      if (groupSize <= 0 || maxActiveEnemies - enemies.length < groupSize) return false;
      const gateCounts = Array.from({ length: spawnCells.length }, () => 0);
      for (let i = 0; i < groupSize; i++) {
        const frontIndex = (assaultFront + i) % spawnCells.length, formationIndex = gateCounts[frontIndex]++;
        spawnEnemy(spawnCells[frontIndex], formationIndex);
      }
      spawnLeft -= groupSize; assaultFront = (assaultFront + groupSize) % spawnCells.length;
      return true;
    }
    function startWave(config?: TestWaveConfig) {
      if (active || gameOver) return;
      if (!testerMode && wave >= map.waveCount) { victory = true; gameOver = true; message("SECTOR SECURED · ALL WAVES REPELLED"); emitHud(true); return; }
      buildTimer = 0;
      if (testerMode) {
        wave = clamp(Math.round(config?.wave ?? Math.max(1, wave)), 1, FINAL_MAP_WAVES);
        spawnLeft = clamp(Math.round(config?.enemyCount ?? 100), 1, 5000);
      } else {
        wave++;
        spawnLeft = Math.round((14 + Math.floor(wave * 2.35)) * ENEMY_SWARM_MULTIPLIER * (map.waveMultiplier ?? 1));
      }
      active = true; spawnTimer = 0.45; assaultFront = Math.floor(Math.random() * spawnCells.length);
      message(testerMode ? `UNIT TEST WAVE ${String(wave).padStart(2, "0")} · ${spawnLeft} LIFE SIGNS · UNLIMITED CONSTRUCTION ONLINE` : `WAVE ${String(wave).padStart(2, "0")} INBOUND · ${spawnLeft} LIFE SIGNS · ${spawnCells.length} FRONTS · CONSTRUCTION LOCKED`); emitHud(true);
    }
    function burst(at: THREE.Vector3, color: number, count = 10, spread = 1) {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.05, 5, 4), new THREE.MeshBasicMaterial({ color, transparent: true })); mesh.position.copy(at); world.add(mesh);
        particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 2.8 * spread, Math.random() * 2.3 * spread, (Math.random() - 0.5) * 2.8 * spread), life: 0.5 + Math.random() * 0.5, maxLife: 1 });
      }
    }
    function damageFriendlyTarget(targetType: "marine" | "structure", targetId: number, damage: number) {
      if (targetType === "structure") {
        const target = structures.find(s => s.id === targetId);
        if (!target) return;
        target.hp = clamp(target.hp - damage, 0, target.maxHp); setHealthVisual(target.group, target.hp, target.maxHp);
        if (target.hp <= 0) { message(`${ASSETS[target.kind].name.toUpperCase()} DESTROYED BY HOSTILES`); destroyStructure(target); }
        return;
      }
      const target = marines.find(m => m.id === targetId);
      if (target) damageMarine(target, damage * (isEntrenched(target) ? TRENCH_DAMAGE_MULTIPLIER : 1));
    }
    function hostileStrike(kind: AlienKind, from: THREE.Vector3, to: THREE.Vector3, targetType: "marine" | "structure", targetId: number, damage: number) {
      const group = new THREE.Group(), startHeight = kind === "flyer" ? 0.28 : kind === "brute" ? 0.85 : kind === "broodmother" ? 1.05 : kind === "razortail" ? 0.68 : kind === "spitter" ? 0.66 : kind === "strider" ? 0.92 : kind === "prowler" ? 0.44 : kind === "stalker" ? 0.25 : 0.38;
      const start = from.clone().add(new THREE.Vector3(0, startHeight, 0)), end = to.clone().add(new THREE.Vector3(0, 0.58, 0));
      let speed = 7.5, arcHeight = 0.08, color = 0xff9857, impactCount = 5;
      if (kind === "drone") {
        const needle = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.46, 6), new THREE.MeshStandardMaterial({ color: 0xe6b56d, emissive: 0x6d2816, emissiveIntensity: 0.7, roughness: 0.38 }));
        needle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); group.add(needle);
      } else if (kind === "prowler") {
        speed = 8.6; arcHeight = 0.03; color = 0xffb36a; impactCount = 7;
        const bite = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.42, 5), new THREE.MeshStandardMaterial({ color: 0xe7c18e, emissive: 0x7a3517, emissiveIntensity: 1.5, roughness: 0.35 }));
        bite.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); group.add(bite);
      } else if (kind === "flyer") {
        speed = 7.2; arcHeight = 0.04; color = 0x79e8ff; impactCount = 8;
        const dart = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color, emissive: 0x195c75, emissiveIntensity: 2.2, roughness: 0.2 })); dart.scale.z = 2.4; dart.lookAt(end.clone().sub(start)); group.add(dart);
        const light = new THREE.PointLight(color, 1.5, 2.8); group.add(light);
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
        const chunk = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x5c211d, emissive: 0x7e1812, emissiveIntensity: 1.1, roughness: 0.46, metalness: 0.15 })); chunk.scale.set(0.85, 0.85, 1.8); group.add(chunk);
        for (const side of [-1, 1]) { const barb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 5), new THREE.MeshStandardMaterial({ color: 0xd16a4d, roughness: 0.5 })); barb.position.x = side * 0.18; barb.rotation.z = side * 0.9; group.add(barb); }
      } else if (kind === "razortail") {
        speed = 4.1; arcHeight = 0.22; color = 0xe66bff; impactCount = 13;
        const barb = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.72, 7), new THREE.MeshStandardMaterial({ color: 0xd58ce0, emissive: 0x4f145d, emissiveIntensity: 1.25, roughness: 0.36, metalness: 0.28 }));
        barb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); group.add(barb);
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
    function fire(from: THREE.Vector3, target: Enemy, damage: number, splash: number, color: number, heavy = false, arcHeight = 0, rocket = false, sourceStructureId?: number, hitscan = false) {
      if (hitscan) { damageEnemy(target, damage); provokeEnemy(target, sourceStructureId); return; }
      const to = target.group.position.clone().add(new THREE.Vector3(0, 0.42, 0)), pool: ProjectilePool = rocket ? "rocket" : heavy ? "heavy" : "light", mesh = acquireProjectile(pool, color);
      if (rocket) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      mesh.position.copy(from); world.add(mesh);
      bullets.push({ mesh, pool, from: from.clone(), to, impactX: target.x, impactY: target.y, t: 0, speed: heavy ? 1.35 : 4.8, target: target.id, damage, splash: aoeRadius(splash), arcHeight, color, sourceStructureId });
      incomingDamageCache.clear();
    }
    function incomingDamageAt(enemy: Enemy) {
      const cached = incomingDamageCache.get(enemy.id);
      if (cached !== undefined) return cached;
      const incoming = bullets.reduce((total, shot) => {
        if (!shot.splash) return total + (shot.target === enemy.id ? shot.damage : 0);
        const trackedTarget = enemies.find(candidate => candidate.id === shot.target && candidate.hp > 0);
        const impactX = trackedTarget?.x ?? shot.impactX, impactY = trackedTarget?.y ?? shot.impactY;
        const distance = Math.hypot(enemy.x - impactX, enemy.y - impactY);
        return distance <= shot.splash ? total + shot.damage * (1 - distance / (shot.splash * 1.8)) : total;
      }, 0);
      incomingDamageCache.set(enemy.id, incoming);
      return incoming;
    }
    function targetPreference(unitId: number, enemyId: number) {
      const raw = Math.sin(unitId * 12.9898 + enemyId * 78.233) * 43758.5453;
      return raw - Math.floor(raw);
    }
    function chooseDistributedTarget(candidates: Enemy[], unitId: number) {
      const uncovered = candidates.filter(enemy => enemy.hp - incomingDamageAt(enemy) > 0);
      const options = uncovered.length ? uncovered : candidates;
      let bestTarget: Enemy | undefined, bestScore = Infinity;
      for (const enemy of options) {
        const reservedDamage = incomingDamageAt(enemy) / Math.max(1, enemy.maxHp);
        const progressBias = Math.min(0.34, enemy.index * 0.018);
        const preference = targetPreference(unitId, enemy.id) * 0.42;
        const score = reservedDamage - progressBias - preference;
        if (score < bestScore) { bestScore = score; bestTarget = enemy; }
      }
      return bestTarget;
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
    function infernoCone(origin: THREE.Vector3, turret: Structure, range: number, damage: number, sourceCell: string, obstacles: Map<string, number>) {
      const forward = new THREE.Vector2(-Math.sin(turret.group.rotation.y), -Math.cos(turret.group.rotation.y));
      const coneThreshold = Math.cos(0.68);
      const victims = enemies.filter(enemy => {
        if (enemy.hp <= 0 || FLYING_ENEMIES.has(enemy.kind)) return false;
        const offset = new THREE.Vector2(enemy.x - turret.x, enemy.y - turret.y), distance = offset.length();
        return distance > 0.18 && distance <= range && offset.normalize().dot(forward) >= coneThreshold && hasDirectLineOfFire(origin, enemy, sourceCell, obstacles);
      });
      victims.forEach(enemy => {
        const distance = Math.hypot(enemy.x - turret.x, enemy.y - turret.y);
        damageEnemy(enemy, damage * (1 - distance / range * 0.28)); provokeEnemy(enemy, turret.id);
      });
      const direction = new THREE.Vector3(forward.x, 0, forward.y), plume = new THREE.Mesh(new THREE.ConeGeometry(range * 0.42, range, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff6b2d, transparent: true, opacity: 0.44, depthWrite: false, blending: THREE.AdditiveBlending }));
      plume.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction); plume.position.copy(origin).addScaledVector(direction, range * 0.5); plume.renderOrder = 17; world.add(plume);
      particles.push({ mesh: plume, velocity: new THREE.Vector3(), life: 0.12, maxLife: 0.12 });
      burst(origin.clone().addScaledVector(direction, range * 0.46), 0xffbd57, 4, 0.45);
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
      structures.forEach(s => { if (s.rallyMarker) discardWorldObject(s.rallyMarker); });
      [...structures, ...enemies, ...marines].forEach(o => { removeHealthBar(o.group); discardWorldObject(o.group); }); bullets.forEach(b => releaseProjectile(b.mesh, b.pool)); hostileProjectiles.forEach(p => discardWorldObject(p.group)); particles.forEach(p => discardWorldObject(p.mesh));
      structures = []; enemies = []; marines = []; bullets = []; hostileProjectiles = []; particles = []; enemyRouteCache.clear(); routeRevision++; selectedMarines.clear(); selectedEmplacements.clear(); selectedProductionId = null; lastProductionSnapshot = ""; callbacks.current.onUnitSelected(null); callbacks.current.onProductionSelected(null); credits = testerMode ? Infinity : 750; integrity = 100; wave = 0; kills = 0; active = false; buildTimer = 0; gameOver = false; victory = false; spawnLeft = 0; spawnTimer = 0; assaultFront = 0;
      deployStartingForces(); message(testerMode ? "UNIT TEST RANGE RESET · UNLIMITED ASSETS ONLINE" : "COMMAND SYSTEMS RESET · AWAITING DEPLOYMENT"); emitHud(true);
    }
    function rotate() {
      const offset = camera.position.clone().sub(controls.target); const a = Math.PI / 2;
      camera.position.set(controls.target.x + offset.x * Math.cos(a) - offset.z * Math.sin(a), camera.position.y, controls.target.z + offset.x * Math.sin(a) + offset.z * Math.cos(a)); controls.update();
    }
    apiRef.current = { start: startWave, restart, rotate, upgradeSelected, recruit, produce };

    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), cameraVelocity = new THREE.Vector3(); const heldKeys = new Set<string>(); let hovered: PickedTerrain | null = null, downX = 0, downY = 0, rightDownX = 0, rightDownY = 0, selecting = false;
    const selectionBox = document.createElement("div"); selectionBox.className = "selection-box"; host.appendChild(selectionBox);
    function pick(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect(); pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(tileMeshes, false)[0];
      if (!hit || hit.instanceId === undefined) return undefined;
      const mesh = hit.object as THREE.InstancedMesh;
      return { mesh, instanceId: hit.instanceId, cell: (mesh.userData.cells as TerrainCell[])[hit.instanceId] };
    }
    function onMove(e: PointerEvent) {
      if (selecting) { const r = host.getBoundingClientRect(), x1 = Math.min(downX, e.clientX) - r.left, y1 = Math.min(downY, e.clientY) - r.top; selectionBox.style.display = "block"; selectionBox.style.left = `${x1}px`; selectionBox.style.top = `${y1}px`; selectionBox.style.width = `${Math.abs(e.clientX - downX)}px`; selectionBox.style.height = `${Math.abs(e.clientY - downY)}px`; return; }
      const tile = pick(e), changed = !hovered || !tile || hovered.mesh !== tile.mesh || hovered.instanceId !== tile.instanceId;
      if (hovered && changed) { hovered.mesh.setColorAt(hovered.instanceId, hovered.cell.base); if (hovered.mesh.instanceColor) hovered.mesh.instanceColor.needsUpdate = true; }
      hovered = tile || null;
      if (hovered && changed) { hovered.mesh.setColorAt(hovered.instanceId, new THREE.Color(0x3b8060)); if (hovered.mesh.instanceColor) hovered.mesh.instanceColor.needsUpdate = true; }
    }
    function onDown(e: PointerEvent) { if (e.button === 2) { rightDownX = e.clientX; rightDownY = e.clientY; } if (e.button === 0) { downX = e.clientX; downY = e.clientY; selecting = true; controls.enabled = false; e.stopImmediatePropagation(); } }
    function onUp(e: PointerEvent) {
      if (e.button !== 0) return; e.stopImmediatePropagation(); const drag = Math.hypot(e.clientX - downX, e.clientY - downY); selecting = false; controls.enabled = true; selectionBox.style.display = "none";
      if (drag > 5) {
        const minX = Math.min(downX, e.clientX), maxX = Math.max(downX, e.clientX), minY = Math.min(downY, e.clientY), maxY = Math.max(downY, e.clientY), r = renderer.domElement.getBoundingClientRect(); if (!e.shiftKey) { selectedMarines.clear(); selectedEmplacements.clear(); }
        marines.forEach(m => { const p = m.group.getWorldPosition(new THREE.Vector3()).project(camera), sx = r.left + (p.x + 1) * r.width / 2, sy = r.top + (-p.y + 1) * r.height / 2; if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selectedMarines.add(m.id); });
        structures.filter(isUpgradableStructure).forEach(s => { const p = s.group.getWorldPosition(new THREE.Vector3()).project(camera), sx = r.left + (p.x + 1) * r.width / 2, sy = r.top + (-p.y + 1) * r.height / 2; if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selectedEmplacements.add(s.id); }); selectedProductionId = null; refreshSelection(); publishStructureSelection(); publishProductionSelection(true); const count = marines.filter(marine => selectedMarines.has(marine.id)).reduce((total, marine) => total + marineTroopCount(marine), 0) + selectedEmplacements.size; message(`${count} UNIT${count === 1 ? "" : "S"} BOX-SELECTED · RIGHT-CLICK FOR COMPACT FORMATION`); return;
      }
      const tile = pick(e); if (!tile) return; const x = tile.cell.x, y = tile.cell.y;
      const terraformMode = selectedRef.current;
      if (terraformMode === "terrainRaise" || terraformMode === "terrainLower") { tryTerraform(x, y, terraformMode === "terrainRaise" ? 1 : -1); return; }
      const stackOrder = (selectedRef.current === "wall" || selectedRef.current === "bastion") && !!topWallAt(x, y);
      if (stackOrder) { tryPlace(x, y); return; }
      if (selectProductionBuildingAt(x, y)) return; if (selectUnitAt(x, y, e.shiftKey)) { selectedProductionId = null; publishProductionSelection(true); return; } if (!selectedMarines.size && !selectedEmplacements.size) { selectedProductionId = null; publishProductionSelection(true); tryPlace(x, y); }
    }
    function onContext(e: MouseEvent) { e.preventDefault(); if (Math.hypot(e.clientX - rightDownX, e.clientY - rightDownY) > 6) return; const tile = pick(e as PointerEvent); if (!tile) return; if (e.shiftKey) removeStructureAt(tile.cell.x, tile.cell.y); else if (setProductionRally(tile.cell.x, tile.cell.y)) return; else if (!commandFormation(tile.cell.x, tile.cell.y)) message("SELECT INFANTRY, CREWED WEAPONS, OR A PRODUCTION BUILDING FIRST"); }
    function onKey(e: KeyboardEvent) { heldKeys.add(e.key.toLowerCase()); if (e.key.toLowerCase() === "r") rotate(); if (e.key === "Escape") { selectedMarines.clear(); selectedEmplacements.clear(); selectedProductionId = null; refreshSelection(); publishStructureSelection(); publishProductionSelection(true); } if (e.code === "Space") { e.preventDefault(); if (testerMode) message("USE THE UNIT TEST CONSOLE TO LAUNCH AN EXACT WAVE"); else startWave(); } }
    function onKeyUp(e: KeyboardEvent) { heldKeys.delete(e.key.toLowerCase()); }
    renderer.domElement.addEventListener("pointermove", onMove, true); renderer.domElement.addEventListener("pointerdown", onDown, true); renderer.domElement.addEventListener("pointerup", onUp, true); renderer.domElement.addEventListener("contextmenu", onContext); window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);

    function turnToward(group: THREE.Group, angle: number, speed: number, dt: number) {
      const delta = Math.atan2(Math.sin(angle - group.rotation.y), Math.cos(angle - group.rotation.y));
      group.rotation.y += delta * Math.min(1, speed * dt);
    }

    function resolveEnemyOverlaps() {
      for (let pass = 0; pass < 3; pass++) {
        const buckets = new Map<string, Enemy[]>();
        for (const enemy of enemies) {
          const bucketKey = keyOf(Math.floor(enemy.x / ENEMY_COLLISION_BUCKET_SIZE), Math.floor(enemy.y / ENEMY_COLLISION_BUCKET_SIZE));
          const bucket = buckets.get(bucketKey);
          if (bucket) bucket.push(enemy); else buckets.set(bucketKey, [enemy]);
        }
        for (const enemy of enemies) {
          const bucketX = Math.floor(enemy.x / ENEMY_COLLISION_BUCKET_SIZE), bucketY = Math.floor(enemy.y / ENEMY_COLLISION_BUCKET_SIZE);
          for (let offsetY = -1; offsetY <= 1; offsetY++) for (let offsetX = -1; offsetX <= 1; offsetX++) {
            for (const other of buckets.get(keyOf(bucketX + offsetX, bucketY + offsetY)) ?? []) {
              if (other.id <= enemy.id || FLYING_ENEMIES.has(other.kind) !== FLYING_ENEMIES.has(enemy.kind) || Math.abs(other.group.position.y - enemy.group.position.y) > 0.85) continue;
              let apartX = enemy.x - other.x, apartY = enemy.y - other.y, apart = Math.hypot(apartX, apartY);
              const minimumDistance = enemyCollisionRadius(enemy) + enemyCollisionRadius(other) + 0.025;
              if (apart >= minimumDistance) continue;
              if (apart < 0.0001) {
                const angle = ((enemy.id * 2.399 + other.id * 0.73) % (Math.PI * 2));
                apartX = Math.cos(angle); apartY = Math.sin(angle); apart = 1;
              }
              const push = (minimumDistance - apart) * 0.5;
              const pushX = apartX / apart * push, pushY = apartY / apart * push;
              enemy.x = clamp(enemy.x + pushX, 0, GRID_W - 1); enemy.y = clamp(enemy.y + pushY, 0, GRID_H - 1);
              other.x = clamp(other.x - pushX, 0, GRID_W - 1); other.y = clamp(other.y - pushY, 0, GRID_H - 1);
            }
          }
        }
      }
      for (const enemy of enemies) {
        const lift = FLYING_ENEMIES.has(enemy.kind) ? 2.65 : Math.max(0, enemy.group.position.y - worldPos(enemy.x, enemy.y).y);
        const p = worldPos(enemy.x, enemy.y, lift);
        enemy.group.position.x = p.x; enemy.group.position.z = p.z; syncHealthBar(enemy.group);
      }
    }

    function update(dt: number) {
      elapsed += dt; spawnBeacons.forEach(beacon => { beacon.portal.rotation.z += dt * 0.7; beacon.inner.rotation.z -= dt * 0.42; beacon.light.intensity = 2.6 + Math.sin(elapsed * 3.2 + beacon.phase) * 0.7; });
      waterRipples.forEach(({ mesh, phase }) => { const pulse = 0.82 + (Math.sin(elapsed * 1.7 + phase) + 1) * 0.2; mesh.scale.set(pulse, pulse * 0.56, pulse); (mesh.material as THREE.MeshBasicMaterial).opacity = 0.14 + (Math.sin(elapsed * 1.7 + phase) + 1) * 0.08; });
      incomingDamageCache.clear();
      marineStackTimer -= dt;
      if (marineStackTimer <= 0) { autoFillNearbyTrenches(); compactMarineStacks(); marineStackTimer = 0.2; }
      if (!testerMode && !active && !gameOver && wave > 0 && wave < map.waveCount && buildTimer > 0) {
        buildTimer = Math.max(0, buildTimer - dt);
        if (buildTimer === 0) { message("BUILD WINDOW CLOSED · NEXT WAVE DEPLOYING"); startWave(); }
      }
      if (!gameOver) updateProduction(dt);
      const forward = controls.target.clone().sub(camera.position); forward.y = 0; forward.normalize(); const right = new THREE.Vector3(-forward.z, 0, forward.x); const intent = new THREE.Vector3();
      if (heldKeys.has("w")) intent.add(forward); if (heldKeys.has("s")) intent.sub(forward); if (heldKeys.has("d")) intent.add(right); if (heldKeys.has("a")) intent.sub(right);
      if (intent.lengthSq()) cameraVelocity.addScaledVector(intent.normalize(), dt * 25); cameraVelocity.multiplyScalar(Math.exp(-dt * 5.2));
      const cameraStep = cameraVelocity.clone().multiplyScalar(dt); camera.position.add(cameraStep); controls.target.add(cameraStep); controls.target.x = clamp(controls.target.x, -30, 30); controls.target.z = clamp(controls.target.z, -30, 30);
      if (active && spawnLeft > 0 && enemies.length < maxActiveEnemies) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) spawnTimer = spawnSwarmPacket() ? HOSTILE_SPAWN_INTERVAL * (map.spawnIntervalMultiplier ?? 1) : 0.1;
      }
      updateFogOfWar(dt);
      type EnemyTargetChoice = { type: "marine" | "structure" | "base"; id: number | null; x: number; y: number; group: THREE.Group; directDistance: number; wallId?: number };
      const groundEnemyBlocked = blockedForEnemy("drone"), wallClimberBlocked = blockedForEnemy("stalker"), flyingEnemyBlocked = blockedForEnemy("flyer");
      const wallTraversalHeights = new Map<string, number>();
      structures.filter(isWall).forEach(wall => wallTraversalHeights.set(keyOf(wall.x, wall.y), Math.max(wallTraversalHeights.get(keyOf(wall.x, wall.y)) ?? 0, wallTopLift(wall))));
      const wallLiftAt = (cell: Cell) => wallTraversalHeights.get(keyOf(Math.round(cell.x), Math.round(cell.y))) ?? 0;
      const targetPreferenceMultiplier = (enemy: Enemy, target: EnemyTargetChoice) => {
        const typeCode = target.type === "base" ? 3 : target.type === "marine" ? 11 : 23, targetCode = (target.id ?? 0) * 31 + typeCode;
        const raw = Math.sin((enemy.id + 1) * 12.9898 + enemy.targetBiasSeed * 104729 + targetCode * 78.233) * 43758.5453, preference = raw - Math.floor(raw);
        return 1 + (preference - 0.5) * TARGET_SELECTION_VARIANCE;
      };
      const enemyStepTime = (enemy: Enemy, from: Cell, to: Cell) => {
        if (FLYING_ENEMIES.has(enemy.kind)) return Math.hypot(to.x - from.x, to.y - from.y) / Math.max(0.01, enemy.speed);
        const terrainRate = terrainSpeedMultiplier(from, to), routeTerrainRate = 1 + (terrainRate - 1) * ENEMY_TERRAIN_ROUTE_SLOPE_WEIGHT;
        const waterRate = WATER_ALIENS.has(enemy.kind) && (isWaterCell(from.x, from.y) || isWaterCell(to.x, to.y)) ? ENEMY_WATER_SPEED_MULTIPLIER : 1;
        const groundTime = Math.hypot(to.x - from.x, to.y - from.y) / Math.max(0.01, enemy.speed * routeTerrainRate * waterRate);
        const terrainClimbTime = Math.max(0, heights[to.y][to.x] - heights[from.y][from.x]) / ENEMY_TERRAIN_ROUTE_CLIMB_SPEED;
        const climbTime = WALL_CLIMBERS.has(enemy.kind) ? Math.abs(wallLiftAt(to) - wallLiftAt(from)) / WALL_CLIMB_SPEED : 0;
        return groundTime + terrainClimbTime + climbTime;
      };
      const routeFor = (enemy: Enemy, target: EnemyTargetChoice) => {
        const startX = Math.round(enemy.x), startY = Math.round(enemy.y), goalX = Math.round(target.x), goalY = Math.round(target.y), climbsWalls = WALL_CLIMBERS.has(enemy.kind), flying = FLYING_ENEMIES.has(enemy.kind), aquatic = WATER_ALIENS.has(enemy.kind);
        const pathKey = `${routeRevision}:${wave}:${enemy.kind}:${startX},${startY}>${goalX},${goalY}`;
        const cached = enemyRouteCache.get(pathKey); if (cached) return cached;
        const path = findPathTo(enemy.x, enemy.y, { x: target.x, y: target.y }, undefined, flying ? flyingEnemyBlocked : aquatic ? blockedForEnemy(enemy.kind) : climbsWalls ? wallClimberBlocked : groundEnemyBlocked, (from, to) => enemyStepTime(enemy, from, to), enemy.speed * 1.65);
        let travelTime = path.length ? Math.hypot(enemy.x - path[0].x, enemy.y - path[0].y) / Math.max(0.01, enemy.speed * 1.65) : Infinity;
        for (let i = 1; i < path.length; i++) travelTime += enemyStepTime(enemy, path[i - 1], path[i]);
        const route = { path, travelTime };
        if (enemyRouteCache.size >= ROUTE_CACHE_LIMIT) enemyRouteCache.delete(enemyRouteCache.keys().next().value as string);
        enemyRouteCache.set(pathKey, route); return route;
      };
      for (const e of enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt); e.attackCooldown -= dt; e.pathTimer -= dt;
        const flying = FLYING_ENEMIES.has(e.kind);
        const enemyStats = ENEMY_STATS[e.kind], climbsWalls = WALL_CLIMBERS.has(e.kind);
        const targets: EnemyTargetChoice[] = [{ type: "base", id: null, x: baseCell.x, y: baseCell.y, group: base, directDistance: Math.hypot(baseCell.x - e.x, baseCell.y - e.y) }];
        marines.forEach(m => {
          if (m.mountedOn && !flying && !climbsWalls) return;
          targets.push({ type: "marine", id: m.id, x: m.x, y: m.y, group: m.group, directDistance: Math.hypot(m.x - e.x, m.y - e.y), wallId: m.mountedOn });
        });
        structures.forEach(s => {
          if (s.mountedOn && !flying && !climbsWalls) return;
          if ((flying ? isCombatStructure(s) || s.kind === "light" || s.kind === "barracks" : (isPathBlocking(s) && (!climbsWalls || !isWall(s))) || isCombatStructure(s))) targets.push({ type: "structure", id: s.id, x: s.x, y: s.y, group: s.group, directDistance: Math.hypot(s.x - e.x, s.y - e.y), wallId: s.mountedOn });
        });
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
            targetChoice = desiredTarget; e.targetType = desiredTarget.type; e.targetId = desiredTarget.id; e.path = routeFor(e, desiredTarget).path; e.index = 0; e.pathTimer = 0.68 + (e.id % 7) * 0.04;
          }
        } else if (!targetChoice || e.pathTimer <= 0 || !e.path.length) {
          let bestRoute: EnemyRoute | undefined, bestTarget: EnemyTargetChoice | undefined, bestTargetScore = Infinity;
          const closestTargets = [...targets].sort((a, b) => a.directDistance - b.directDistance).slice(0, ROUTE_CANDIDATE_LIMIT);
          const baseTarget = targets[0]; if (!closestTargets.includes(baseTarget)) closestTargets.push(baseTarget);
          for (const candidate of closestTargets) {
            const fastestPossibleScore = candidate.directDistance / Math.max(0.01, e.speed * 1.65) * (1 - TARGET_SELECTION_VARIANCE * 0.5); if (fastestPossibleScore >= bestTargetScore) break;
            const route = routeFor(e, candidate), targetScore = route.travelTime * targetPreferenceMultiplier(e, candidate);
            if (route.path.length && targetScore < bestTargetScore) { bestRoute = route; bestTarget = candidate; bestTargetScore = targetScore; }
          }
          targetChoice = bestTarget ?? targets[0]; e.targetType = targetChoice.type; e.targetId = targetChoice.id; e.path = bestRoute?.path ?? routeFor(e, targetChoice).path; e.index = 0; e.pathTimer = (targetChoice.type === "marine" ? 0.7 : 1.15) + (e.id % 7) * 0.04;
        }
        const combatTarget = targetChoice.type === "base" ? undefined : targetChoice as EnemyTargetChoice & { type: "marine" | "structure"; id: number };
        const tx = targetChoice.x, ty = targetChoice.y;
        const targetDistance = Math.hypot(tx - e.x, ty - e.y), attackRange = enemyStats.attackRange;
        const wire = flying ? undefined : structures.find(s => s.kind === "wire" && Math.hypot(s.x - e.x, s.y - e.y) < RAZOR_WIRE_RADIUS);
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
        const targetWall = combatTarget?.wallId ? structures.find(structure => structure.id === combatTarget.wallId && isWall(structure)) : undefined;
        const requiredWallLift = targetWall ? wallTopLift(targetWall) : 0;
        const currentWallLift = targetWall && climbsWalls ? requiredWallLift * clamp(1 - Math.hypot(targetWall.x - e.x, targetWall.y - e.y) / 1.05, 0, 1) : 0;
        const reachedTargetElevation = !targetWall || flying || (climbsWalls && requiredWallLift - currentWallLift <= 0.08);
        const inAttackRange = !!combatTarget && targetDistance <= attackRange && reachedTargetElevation, rangedEnemy = RANGED_ENEMIES.has(e.kind);
        let firedThisFrame = false;
        if (combatTarget && inAttackRange) {
          e.group.rotation.y = Math.atan2(-(tx - e.x), -(ty - e.y));
          if (e.attackCooldown <= 0) {
            const hit = e.damage * (e.kind === "brute" ? 1.45 : e.kind === "razortail" ? 1.2 : e.kind === "stalker" ? 0.75 : 1);
            if (rangedEnemy) hostileStrike(e.kind, e.group.position, combatTarget.group.position, combatTarget.type, combatTarget.id, hit);
            else damageFriendlyTarget(combatTarget.type, combatTarget.id, hit);
            e.attackCooldown = enemyStats.attackCooldown; firedThisFrame = true;
          }
          isAttacking = !rangedEnemy || firedThisFrame;
        }
        if (!inAttackRange || (rangedEnemy && !firedThisFrame)) {
          const targetCell = e.path[Math.min(e.index + 1, e.path.length - 1)];
          if (targetCell) {
            const dx = targetCell.x - e.x, dy = targetCell.y - e.y, dist = Math.hypot(dx, dy);
            const segmentStart = e.path[Math.min(e.index, e.path.length - 1)] ?? targetCell, segmentLength = Math.max(0.01, Math.hypot(targetCell.x - segmentStart.x, targetCell.y - segmentStart.y));
            const waterRate = WATER_ALIENS.has(e.kind) && (isWaterCell(segmentStart.x, segmentStart.y) || isWaterCell(targetCell.x, targetCell.y)) ? ENEMY_WATER_SPEED_MULTIPLIER : 1;
            const groundRate = e.speed * terrainSpeedMultiplier(segmentStart, targetCell) * waterRate, terrainClimbDistance = flying ? 0 : Math.max(0, heights[targetCell.y][targetCell.x] - heights[segmentStart.y][segmentStart.x]), wallClimbDistance = climbsWalls ? Math.abs(wallLiftAt(targetCell) - wallLiftAt(segmentStart)) : 0;
            movementRate = flying ? e.speed : segmentLength / (segmentLength / Math.max(0.01, groundRate) + terrainClimbDistance / ENEMY_TERRAIN_CLIMB_SPEED + wallClimbDistance / WALL_CLIMB_SPEED) * (wire ? RAZOR_WIRE_SLOW_MULTIPLIER : 1);
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
          wing.rotation.z = restAngle + side * Math.sin(elapsed * (flying ? 34 : isMoving ? 26 : 5) + i * Math.PI) * (flying ? 0.62 : isMoving ? 0.48 : 0.08);
        });
        const climbingWall = climbsWalls ? structures.filter(isWall).filter(wall => Math.hypot(wall.x - e.x, wall.y - e.y) < 1.05).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y) || b.stackLevel - a.stackLevel)[0] : undefined;
        const climbDistance = climbingWall ? Math.hypot(climbingWall.x - e.x, climbingWall.y - e.y) : Infinity;
        const climbLift = climbingWall ? wallTopLift(climbingWall) * clamp(1 - climbDistance / 1.05, 0, 1) : 0;
        const p = worldPos(e.x, e.y, flying ? 2.65 : climbLift); e.group.position.lerp(p, Math.min(1, dt * 12)); e.group.position.y += Math.sin(elapsed * (flying ? 4.8 : 9) + e.id) * (flying ? 0.16 : e.kind === "brute" ? 0.005 : 0.01); syncHealthBar(e.group);
      }
      resolveEnemyOverlaps();
      const directFireObstacles = buildDirectFireObstacles();
      for (const s of structures) {
        s.cooldown -= dt;
        const scanRig = s.group.userData.scanRig as THREE.Group | undefined; if (scanRig) scanRig.rotation.y += dt * 0.42;
        const factoryRig = s.group.userData.factoryRig as THREE.Group | undefined; if (factoryRig && s.productionQueue.length) factoryRig.rotation.y += dt * 0.7;
        if (s.rallyMarker) { s.rallyMarker.rotation.y = elapsed * 0.55; const indicator = s.rallyMarker.userData.indicator as THREE.Mesh; indicator.position.y = 0.78 + Math.sin(elapsed * 2.6 + (s.rallyMarker.userData.phase as number)) * 0.1; }
        let isMoving = false;
        if (isMobileEmplacement(s)) {
          const movementSpeed = s.kind === "howitzer" ? 0.26 : s.kind === "tank" ? 0.58 : 0.42;
          isMoving = advanceFriendly(s, movementSpeed, s.kind === "howitzer" ? 2.2 : s.kind === "tank" ? 4.2 : 3.2, dt);
          s.group.position.lerp(worldPos(s.x, s.y, s.lift), Math.min(1, dt * 10));
        }
        syncHealthBar(s.group);
        if (!isCombatStructure(s)) continue;
        if (isMoving) continue;
        const terrainX = clamp(Math.round(s.x), 0, GRID_W - 1), terrainY = clamp(Math.round(s.y), 0, GRID_H - 1);
        const stats = TURRET_STATS[s.kind], levelDamage = 1 + (s.level - 1) * 0.42, levelSpeed = 1 + (s.level - 1) * 0.18;
        const range = s.kind === "flame" ? ASSETS.flame.range + (s.level - 1) * 0.15 : ASSETS[s.kind].range + (s.level - 1) * 0.65 + heights[terrainY][terrainX] * 0.9;
        const muzzle = s.group.userData.muzzle as THREE.Object3D | undefined, firingOrigin = muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : s.group.position.clone().add(new THREE.Vector3(0, 1.05, 0));
        const indirectFire = s.kind === "howitzer" || s.kind === "missile";
        const candidates = enemies.filter(e => e.hp > 0 && (s.kind !== "flame" || !FLYING_ENEMIES.has(e.kind)) && isRevealed(e.x, e.y) && Math.hypot(e.x - s.x, e.y - s.y) <= range && (indirectFire || hasDirectLineOfFire(firingOrigin, e, keyOf(terrainX, terrainY), directFireObstacles)));
        const target = indirectFire ? chooseArtilleryTarget(candidates, stats.damage * levelDamage, aoeRadius(stats.splash)) : chooseDistributedTarget(candidates, s.id);
        if (target) {
          turnToward(s.group, Math.atan2(-(target.x - s.x), -(target.y - s.y)), stats.turnSpeed, dt);
          if (s.cooldown <= 0) { const targetMultiplier = FLYING_ENEMIES.has(target.kind) ? stats.airDamageMultiplier ?? AIR_DAMAGE_MULTIPLIER : 1, shotDamage = stats.damage * levelDamage * targetMultiplier; if (stats.flameCone) infernoCone(firingOrigin, s, range, shotDamage, keyOf(terrainX, terrainY), directFireObstacles); else if (stats.beam) laserStrike(firingOrigin, target, shotDamage, stats.color); else fire(firingOrigin, target, shotDamage, stats.splash, stats.color, stats.heavy, stats.arcHeight, false, indirectFire ? s.id : undefined); s.cooldown = stats.cooldown / levelSpeed; }
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
          const patient = marines.filter(other => (other.id !== m.id || marineTroopCount(m) > 1) && marineHealthRatio(other) < 1 && Math.hypot(other.x - m.x, other.y - m.y) < 2.4).sort((a, b) => marineHealthRatio(a) - marineHealthRatio(b))[0];
          if (patient) { healMarine(patient, 18 * marineTroopCount(m)); burst(patient.group.position.clone().add(new THREE.Vector3(0, 0.65, 0)), 0x63e9ff, 5); m.supportCooldown = 1.6; }
        }
        const muzzle = m.group.userData.muzzle as THREE.Object3D | undefined, firingOrigin = muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : m.group.position.clone().add(new THREE.Vector3(0, 0.72, 0));
        const candidates = enemies.filter(e => e.hp > 0 && isRevealed(e.x, e.y) && Math.hypot(e.x - m.x, e.y - m.y) < (settledOnWall ? stats.range + 0.95 : stats.range) && (m.kind === "rocketeer" || hasDirectLineOfFire(firingOrigin, e, keyOf(Math.round(m.x), Math.round(m.y)), directFireObstacles)));
        const target = chooseDistributedTarget(candidates, m.id);
        if (target && !isMoving) {
          turnToward(m.group, Math.atan2(-(target.x - m.x), -(target.y - m.y)), 10, dt);
          if (m.cooldown <= 0) { const targetMultiplier = FLYING_ENEMIES.has(target.kind) ? AIR_DAMAGE_MULTIPLIER : 1; fire(firingOrigin, target, stats.damage * marineTroopCount(m) * (settledOnWall ? 1.32 : 1) * targetMultiplier, stats.splash ?? 0, stats.projectileColor, stats.heavy, stats.arcHeight, m.kind === "rocketeer", undefined, m.kind !== "rocketeer"); m.cooldown = stats.cooldown; }
        }
      }
      for (const s of [...structures]) if (s.kind === "mine") {
        const target = enemies.find(e => e.hp > 0 && !FLYING_ENEMIES.has(e.kind) && Math.hypot(e.x - s.x, e.y - s.y) < 1.25); if (target) { enemies.forEach(e => { if (!FLYING_ENEMIES.has(e.kind) && Math.hypot(e.x - s.x, e.y - s.y) < aoeRadius(1.75)) damageEnemy(e, 145); }); burst(s.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x6ffff3, 25, AOE_RADIUS_MULTIPLIER); destroyStructure(s); message("SHOCK MINE DETONATED"); }
      }
      for (const shot of [...hostileProjectiles]) {
        shot.t += dt * shot.speed; const progress = Math.min(1, shot.t), arc = Math.sin(progress * Math.PI) * shot.arcHeight;
        shot.group.position.lerpVectors(shot.from, shot.to, progress); shot.group.position.y += arc; shot.group.rotateX(dt * (shot.kind === "spitter" ? 2.5 : 8)); shot.group.rotateZ(dt * (shot.kind === "brute" ? 5 : 11));
        if (shot.kind === "spitter" || shot.kind === "broodmother") shot.group.scale.setScalar(0.9 + Math.sin(elapsed * (shot.kind === "broodmother" ? 12 : 20)) * 0.12);
        if (shot.t >= 1) {
          if (shot.kind === "broodmother") hatchBroodlings(shot.to, shot.targetId);
          else damageFriendlyTarget(shot.targetType, shot.targetId, shot.damage);
          burst(shot.to, shot.color, shot.impactCount); discardWorldObject(shot.group); hostileProjectiles.splice(hostileProjectiles.indexOf(shot), 1);
        }
      }
      for (const b of [...bullets]) {
        b.t += dt * b.speed; const arc = b.arcHeight ? Math.sin(Math.min(1, b.t) * Math.PI) * b.arcHeight : 0; b.mesh.position.lerpVectors(b.from, b.to, Math.min(1, b.t)); b.mesh.position.y += arc;
        if (b.t >= 1) {
          const target = enemies.find(e => e.id === b.target && e.hp > 0);
          if (b.splash) {
            const impactX = target?.x ?? b.impactX, impactY = target?.y ?? b.impactY;
            enemies.forEach(e => { const d = Math.hypot(e.x - impactX, e.y - impactY); if (d <= b.splash) { damageEnemy(e, b.damage * (1 - d / (b.splash * 1.8))); provokeEnemy(e, b.sourceStructureId); } });
          } else if (target) { damageEnemy(target, b.damage); provokeEnemy(target, b.sourceStructureId); }
          releaseProjectile(b.mesh, b.pool); bullets.splice(bullets.indexOf(b), 1);
        }
      }
      for (const e of [...enemies]) {
        if (e.hp <= 0) {
          const deathColor = e.kind === "flyer" ? 0x79e8ff : e.kind === "broodmother" ? 0xff73aa : e.kind === "spitter" ? 0x58ff96 : e.kind === "razortail" ? 0xe66bff : e.kind === "stalker" ? 0x58ddff : e.kind === "strider" ? 0xffe56d : e.kind === "prowler" ? 0xffb36a : 0xff573e;
          const deathCount = e.kind === "brute" ? 24 : e.kind === "broodmother" ? 22 : e.kind === "razortail" ? 20 : e.kind === "flyer" ? 15 : e.kind === "strider" ? 14 : e.kind === "prowler" ? 13 : e.kind === "stalker" ? 9 : 12;
          if (!testerMode) credits += e.reward; kills++; burst(e.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), deathColor, deathCount); removeHealthBar(e.group); discardWorldObject(e.group); enemies.splice(enemies.indexOf(e), 1); continue;
        }
        if (e.targetType === "base" && Math.hypot(e.x - baseCell.x, e.y - baseCell.y) < 0.22) { integrity = Math.max(0, integrity - e.damage); burst(base.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4a31, 14); removeHealthBar(e.group); discardWorldObject(e.group); enemies.splice(enemies.indexOf(e), 1); if (integrity <= 0) { gameOver = true; active = false; message("COMMAND POST OVERRUN · SECTOR LOST"); } }
      }
      for (const m of [...marines]) if (!m.memberHp.length) { selectedMarines.delete(m.id); burst(m.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xff5f47, 9); removeHealthBar(m.group); discardWorldObject(m.group); marines.splice(marines.indexOf(m), 1); message(`${MARINE_STATS[m.kind].name.toUpperCase()} KILLED IN ACTION`); }
      for (const p of [...particles]) { p.life -= dt; p.velocity.y -= dt * 2.6; p.mesh.position.addScaledVector(p.velocity, dt); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife); if (p.life <= 0) { discardWorldObject(p.mesh); particles.splice(particles.indexOf(p), 1); } }
      if (active && spawnLeft === 0 && enemies.length === 0) {
        active = false;
        if (testerMode) { buildTimer = 0; message(`UNIT TEST WAVE ${String(wave).padStart(2, "0")} COMPLETE · RANGE READY TO RERUN`); }
        else { credits += 125 + wave * 25; if (wave >= map.waveCount) { victory = true; gameOver = true; message(`SECTOR SECURED · ${map.name.toUpperCase()} HOLDS`); } else { buildTimer = BETWEEN_WAVE_BUILD_SECONDS; message(`WAVE ${String(wave).padStart(2, "0")} DESTROYED · 30-SECOND BUILD WINDOW OPEN`); } }
      }
      emitHud();
    }

    const targetFrameMs = 1000 / 30;
    let raf = 0, last = performance.now(), lastFrame = last - targetFrameMs, suspended = document.hidden;
    function animate(now: number) {
      raf = requestAnimationFrame(animate);
      if (suspended || now - lastFrame < targetFrameMs) return;
      const frameElapsed = now - lastFrame;
      lastFrame = now - (frameElapsed % targetFrameMs);
      const dt = Math.min(MAX_FRAME_DELTA, Math.max(0, (now - last) / 1000)); last = now;
      update(dt); controls.update(); renderer.render(scene, camera);
    }
    const onVisibilityChange = () => { suspended = document.hidden; last = performance.now(); lastFrame = last - targetFrameMs; };
    document.addEventListener("visibilitychange", onVisibilityChange);
    emitHud(true); raf = requestAnimationFrame(animate);
    const resize = () => { camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisibilityChange); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); renderer.domElement.removeEventListener("pointermove", onMove, true); renderer.domElement.removeEventListener("pointerdown", onDown, true); renderer.domElement.removeEventListener("pointerup", onUp, true); renderer.domElement.removeEventListener("contextmenu", onContext); controls.dispose(); disposeObjectResources(scene); renderer.renderLists.dispose(); renderer.dispose(); host.removeChild(renderer.domElement); host.removeChild(selectionBox); apiRef.current = null; };
  }, [apiRef, mapKey, testerMode]);
  return <div ref={hostRef} className="three-host" aria-label="Interactive 3D battlefield" />;
}

export default function Home() {
  const [selected, setSelected] = useState<BuildSelection>("rifle");
  const [mapKey, setMapKey] = useState<MapKey>("ridge");
  const [gameMode, setGameMode] = useState<GameMode>("campaign");
  const [testWave, setTestWave] = useState(1);
  const [testEnemyCount, setTestEnemyCount] = useState(100);
  const [hud, setHud] = useState<Hud>({ credits: 750, integrity: 100, wave: 0, enemies: 0, kills: 0, active: false, buildSeconds: null, gameOver: false, victory: false });
  const [selectedUnit, setSelectedUnit] = useState<SelectedUnit | null>(null);
  const [selectedProduction, setSelectedProduction] = useState<ProductionBuildingInfo | null>(null);
  const [message, setMessage] = useState("OPERATION FIRST WATCH · HQ COMMAND ONLINE");
  const [briefing, setBriefing] = useState(true);
  const apiRef = useRef<BattlefieldApi | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testerMode = gameMode === "tester";
  const showMessage = (text: string) => { setMessage(text); if (messageTimer.current) clearTimeout(messageTimer.current); messageTimer.current = setTimeout(() => setMessage(testerMode ? "UNIT TEST RANGE READY · ASSET SUPPLY UNLIMITED" : "COMMAND LINK STABLE · RIGHT-CLICK MOVES OR SETS RALLY · SHIFT SALVAGES"), 4200); };
  const map = MAPS[mapKey];
  const formatBuildTime = (seconds: number) => `00:${String(seconds).padStart(2, "0")}`;
  const selectMap = (nextMap: MapKey) => {
    setMapKey(nextMap); setSelectedUnit(null); setSelectedProduction(null);
    setMessage(`OPERATION ${MAPS[nextMap].operation} · ${MAPS[nextMap].sector} SELECTED`);
  };
  const selectMode = (nextMode: GameMode) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setGameMode(nextMode); setSelectedUnit(null); setSelectedProduction(null);
    setMessage(nextMode === "tester" ? "UNIT TESTER SELECTED · UNLIMITED ASSETS AUTHORIZED" : `OPERATION ${map.operation} · CAMPAIGN RULES RESTORED`);
  };
  const launchTest = () => apiRef.current?.start({ wave: clamp(Math.round(testWave), 1, FINAL_MAP_WAVES), enemyCount: clamp(Math.round(testEnemyCount), 1, 5000) });
  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">V</span><div><b>VANGUARD</b><small>EXOPLANETARY DEFENSE COMMAND</small></div></div>
        <div className="stat credits"><small>{testerMode ? "SANDBOX SUPPLY" : "COMMAND CREDITS"}</small><strong>{testerMode ? "∞" : hud.credits.toLocaleString()}</strong></div>
        <div className="stat"><small>DEFENSE INTEGRITY</small><strong className={hud.integrity < 35 ? "danger" : ""}>{hud.integrity}%</strong></div>
        <div className="stat"><small>HOSTILES</small><strong>{String(hud.enemies).padStart(2, "0")}</strong></div>
        <div className="stat build-timer"><small>{testerMode ? "CONSTRUCTION" : hud.active ? "CONSTRUCTION" : hud.buildSeconds === null ? "STAGING" : "BUILD WINDOW"}</small><strong className={!testerMode && hud.active ? "danger" : ""}>{testerMode ? "UNLIMITED" : hud.active ? "LOCKED" : hud.buildSeconds === null ? "READY" : formatBuildTime(hud.buildSeconds)}</strong></div>
        {testerMode ? <div className="test-console" aria-label="Unit tester controls">
          <label><span>WAVE</span><input aria-label="Test wave" type="number" min={1} max={FINAL_MAP_WAVES} value={testWave} disabled={hud.active} onChange={event => setTestWave(clamp(Number(event.target.value) || 1, 1, FINAL_MAP_WAVES))} /></label>
          <label><span>ALIENS</span><input aria-label="Alien count" type="number" min={1} max={5000} value={testEnemyCount} disabled={hud.active} onChange={event => setTestEnemyCount(clamp(Number(event.target.value) || 1, 1, 5000))} /></label>
          <button className="wave-button" disabled={hud.active || hud.gameOver} onClick={launchTest}>{hud.active ? `TEST ${String(hud.wave).padStart(2, "0")} ACTIVE` : hud.gameOver ? "RESET REQUIRED" : "RUN TEST"}</button>
        </div> : <button className="wave-button" disabled={hud.active || hud.gameOver} onClick={() => apiRef.current?.start()}>{hud.active ? `WAVE ${String(hud.wave).padStart(2, "0")} ACTIVE` : hud.gameOver ? "OPERATION ENDED" : hud.buildSeconds === null ? `DEPLOY WAVE ${String(hud.wave + 1).padStart(2, "0")}` : `START WAVE ${String(hud.wave + 1).padStart(2, "0")} NOW`}</button>}
      </header>
      <section className="battlefield">
        <Battlefield selected={selected} mapKey={mapKey} testerMode={testerMode} onHud={setHud} onMessage={showMessage} onUnitSelected={setSelectedUnit} onProductionSelected={setSelectedProduction} apiRef={apiRef} />
        <div className={`mission-card ${testerMode ? "tester" : ""}`}><span>{testerMode ? "UNIT TESTER · SANDBOX RANGE" : `OPERATION ${map.operation} · SECTOR ${map.sector}`}</span><b>{testerMode ? `${map.name} Combat Laboratory` : map.objective}</b><small>{testerMode ? `Wave ${testWave} profile · ${testEnemyCount.toLocaleString()} aliens requested · unlimited construction` : `Wave ${Math.min(hud.wave + (hud.active ? 0 : 1), map.waveCount)} of ${map.waveCount} · ${hud.kills} confirmed eliminations · ${hud.active ? "CONSTRUCTION LOCKED" : hud.buildSeconds === null ? "STAGING AREA OPEN" : `BUILD ${formatBuildTime(hud.buildSeconds)}`}`}</small><button className="map-change" disabled={hud.active} onClick={() => setBriefing(true)}>CHANGE MAP / MODE</button></div>
        <div className="status-feed"><i />{message}</div>
        {selectedUnit && <div className="upgrade-card" style={{ "--upgrade-color": ASSETS[selectedUnit.kind].accent } as React.CSSProperties}>
          <small>SELECTED DEFENSE</small><div className="upgrade-heading"><b>{selectedUnit.name}</b><em>TIER {selectedUnit.level}/{selectedUnit.maxLevel}</em></div>
          <div className="upgrade-stats"><span><small>{selectedUnit.support ? "LIGHT POWER" : "DAMAGE"}</small><b>{selectedUnit.support ? `${selectedUnit.damage}%` : selectedUnit.damage}</b></span><span><small>{selectedUnit.support ? "VISION" : "RANGE"}</small><b>{selectedUnit.range}</b></span><span><small>ARMOR</small><b>{selectedUnit.maxHp}</b></span></div>
          <button disabled={selectedUnit.upgradeCost === null || (!testerMode && hud.credits < selectedUnit.upgradeCost)} onClick={() => apiRef.current?.upgradeSelected()}>{selectedUnit.upgradeCost === null ? "MAXIMUM TIER" : testerMode ? `UPGRADE TO TIER ${selectedUnit.level + 1} · FREE` : `UPGRADE TO TIER ${selectedUnit.level + 1} · ¤ ${selectedUnit.upgradeCost}`}</button>
          <p>{selectedUnit.support ? "Upgrade increases vision radius, searchlight power, and armor." : "Upgrade increases damage, range, fire rate, and armor."}</p>
        </div>}
        {selectedProduction && <div className={`barracks-card ${selectedProduction.kind === "factory" ? "factory-card" : ""}`}>
          <small>SELECTED BUILDING</small><div className="barracks-heading"><div><b>{selectedProduction.kind === "factory" ? "MACHINING FACTORY" : "FIELD BARRACKS"}</b><span>{selectedProduction.kind === "factory" ? "HEAVY VEHICLE ASSEMBLY · 2×2" : "INFANTRY TRAINING BAY"}</span></div><em>{selectedProduction.currentName ? `00:${String(selectedProduction.remaining).padStart(2, "0")}` : "READY"}</em></div>
          <div className="production-status"><span><b>{selectedProduction.currentName ?? "PRODUCTION IDLE"}</b><small>{selectedProduction.queueLength ? `${selectedProduction.queueLength} ORDER${selectedProduction.queueLength === 1 ? "" : "S"} IN QUEUE · ADD MORE ANY TIME` : "SELECT A UNIT TO BEGIN"}</small></span><i><b style={{ width: `${selectedProduction.currentName ? clamp((selectedProduction.duration - selectedProduction.remaining) / selectedProduction.duration * 100, 0, 100) : 0}%` }} /></i>{selectedProduction.queue.length > 0 && <ol className="production-queue" aria-label="Production queue">{selectedProduction.queue.map((order, index) => <li key={`${order.name}-${index}`}><em>{String(index + 1).padStart(2, "0")}</em><b>{order.name}</b><small>{index === 0 ? "BUILDING" : `${order.duration} SEC`}</small></li>)}</ol>}</div>
          {selectedProduction.kind === "barracks" ? <div className="recruit-list">{(Object.keys(MARINE_STATS) as MarineKind[]).map(kind => { const unit = MARINE_STATS[kind]; return <button key={kind} disabled={!testerMode && hud.credits < unit.cost} onClick={() => apiRef.current?.recruit(kind)} style={{ "--unit-color": unit.color } as React.CSSProperties}><span>{kind === "rifleman" ? "⌖" : kind === "gunner" ? "▣" : kind === "medic" ? "+" : "➶"}</span><div><b>{unit.name}</b><small>{unit.role} · 5 sec</small></div><em>{testerMode ? "FREE" : `¤ ${unit.cost}`}</em></button>; })}</div> : <div className="recruit-list">{(["tank", "howitzer"] as FactoryUnitKind[]).map(kind => { const unit = ASSETS[kind]; return <button key={kind} disabled={!testerMode && hud.credits < unit.cost} onClick={() => apiRef.current?.produce(kind)} style={{ "--unit-color": unit.accent } as React.CSSProperties}><span>{unit.icon}</span><div><b>{unit.name}</b><small>{unit.role} · 30 sec</small></div><em>{testerMode ? "FREE" : `¤ ${unit.cost}`}</em></button>; })}</div>}
          <p><b>{selectedProduction.rallyPoint ? `RALLY GRID ${selectedProduction.rallyPoint.x},${selectedProduction.rallyPoint.y}` : "NO RALLY POINT"}</b> · Right-click clear ground to set where completed {selectedProduction.kind === "factory" ? "vehicles" : "infantry"} automatically move. {selectedProduction.kind === "factory" ? "Queue Tanks and M777 Howitzers in any order." : "Each infantry specialist completes a five-second training cycle."}</p>
        </div>}
        <div className="camera-tools"><button onClick={() => apiRef.current?.rotate()} aria-label="Rotate camera">↻</button><span>ORBIT</span></div>
        {briefing && <div className="briefing map-briefing"><div className="briefing-id">DEPLOYMENT MODE // FIVE ACTIVE SECTORS</div><h1>Choose how you want to play.</h1><p>Run each battlefield&apos;s progressive campaign or open a combat laboratory with exact wave controls and unlimited friendly assets.</p><div className="mode-selector" aria-label="Game mode"><button className={gameMode === "campaign" ? "active" : ""} aria-pressed={gameMode === "campaign"} onClick={() => selectMode("campaign")}><small>STANDARD OPERATION</small><b>CAMPAIGN</b><span>Credits, build windows, and progressively longer operations.</span></button><button className={gameMode === "tester" ? "active" : ""} aria-pressed={gameMode === "tester"} onClick={() => selectMode("tester")}><small>COMBAT LABORATORY</small><b>UNIT TESTER</b><span>Pick a wave and alien count. All defenses, upgrades, and infantry are free.</span></button></div><div className="map-selector" aria-label="Available battlefields">{MAP_ORDER.map(key => { const option = MAPS[key]; const pipPosition = (cell: Cell) => ({ left: `${(cell.x / (GRID_W - 1)) * 100}%`, top: `${(cell.y / (GRID_H - 1)) * 100}%` }); return <button key={key} className={`map-option ${mapKey === key ? "active" : ""}`} aria-pressed={mapKey === key} onClick={() => selectMap(key)}><span className={`map-preview ${key}`} aria-hidden="true"><i className="base-pip" style={pipPosition(option.baseCell)} />{option.spawnCells.map((cell, index) => <i key={`${cell.x}-${cell.y}-${index}`} className="portal-pip" style={pipPosition(cell)} />)}</span><small>{option.terrain}</small><b>{option.name}</b><em>{option.objective} · {option.waveCount} campaign waves</em></button>; })}</div><p className="map-description"><b>{testerMode ? "UNIT TEST RANGE" : `OPERATION ${map.operation} · SECTOR ${map.sector}`}</b>{testerMode ? `Use ${map.name} to test any wave from 1 to ${FINAL_MAP_WAVES} against a custom force of up to 5,000 aliens.` : map.description}</p><div className="brief-grid"><span><kbd>{testerMode ? "WAVE 1–25" : "LIGHT TOWER"}</kbd><b>{testerMode ? "Choose enemy strength and unit mix" : "Reveal a wide area"}</b></span><span><kbd>{testerMode ? "1–5,000" : "RIGHT CLICK"}</kbd><b>{testerMode ? "Set the exact alien population" : "Move scouts forward"}</b></span><span><kbd>{testerMode ? "UNLIMITED" : "STACK WALLS"}</kbd><b>{testerMode ? "Place, upgrade, and recruit for free" : "Shape every approach"}</b></span><span><kbd>MIDDLE DRAG</kbd><b>Orbit camera</b></span></div><button onClick={() => setBriefing(false)}>{testerMode ? `OPEN UNIT TESTER ON ${map.name.toUpperCase()}` : `DEPLOY TO ${map.name.toUpperCase()}`}</button></div>}
        {hud.gameOver && <div className={`end-card ${hud.victory ? "won" : "lost"}`}><small>{testerMode ? "TEST RANGE OVERRUN" : hud.victory ? "OPERATION COMPLETE" : "SIGNAL LOST"}</small><h2>{testerMode ? "TEST COMPLETE" : hud.victory ? `${map.name.toUpperCase()} HOLDS` : "COMMAND OVERRUN"}</h2><p>{testerMode ? `${hud.kills} hostiles eliminated before the command post failed.` : `${hud.kills} hostiles eliminated across ${hud.wave} waves.`}</p><button onClick={() => apiRef.current?.restart()}>{testerMode ? "RESET TEST RANGE" : "RESTART OPERATION"}</button></div>}
      </section>
      <aside className={`build-panel ${testerMode ? "tester" : ""} ${(!testerMode && hud.active) || hud.gameOver ? "locked" : ""}`}>
        <div className="panel-title"><small>{testerMode ? "UNIT TEST SUPPLY · UNLIMITED" : hud.active ? "CONSTRUCTION LOCKED · WAVE ACTIVE" : hud.gameOver ? "OPERATION ENDED" : hud.buildSeconds === null ? "FORWARD ENGINEERING · STAGING" : `FORWARD ENGINEERING · ${formatBuildTime(hud.buildSeconds)} LEFT`}</small><b>DEPLOYABLE ASSETS</b></div>
        {DEPLOYABLE_ASSET_KEYS.map(key => { const a = ASSETS[key]; return <button key={key} disabled={hud.gameOver || (!testerMode && hud.active)} className={`asset ${selected === key ? "active" : ""}`} onClick={() => setSelected(key)} style={{ "--asset-color": a.accent } as React.CSSProperties}><span>{a.icon}</span><div><b>{a.name}</b><small>{a.role}</small></div><em>{testerMode ? "∞" : a.cost}</em></button>; })}
        <div className="panel-title"><small>{testerMode ? "UNIT TEST SUPPLY · UNLIMITED" : "FORWARD ENGINEERING · ¤ 10 PER TILE"}</small><b>TERRAFORMING</b></div>
        <button disabled={hud.gameOver || (!testerMode && hud.active)} className={`asset ${selected === "terrainRaise" ? "active" : ""}`} onClick={() => setSelected("terrainRaise")} style={{ "--asset-color": "#d6bd7b" } as React.CSSProperties}><span>▲</span><div><b>Raise Terrain</b><small>Raise one grid tile · 0.16m</small></div><em>{testerMode ? "∞" : TERRAFORM_COST}</em></button>
        <button disabled={hud.gameOver || (!testerMode && hud.active)} className={`asset ${selected === "terrainLower" ? "active" : ""}`} onClick={() => setSelected("terrainLower")} style={{ "--asset-color": "#719ec0" } as React.CSSProperties}><span>▼</span><div><b>Lower Terrain</b><small>Lower one grid tile · 0.16m</small></div><em>{testerMode ? "∞" : TERRAFORM_COST}</em></button>
        <div className="intel"><span>{testerMode ? "TESTER INTEL" : "FIELD INTEL"}</span><p>{testerMode ? "Asset supply, upgrades, infantry recruitment, and terraforming are unlimited—even during an active test. Water blocks all ordinary ground units; only aquatic aliens can enter it, while flyers pass above. Select a wave and exact alien population in the top console, then rerun as many configurations as you want." : "Raise or lower a clear land tile by 0.16m for 10 credits between waves. Water, bridges, landmarks, structures, portals, and the command post are protected. Ground aliens cannot climb walls: they must attack or find a way around."}</p></div>
      </aside>
      <footer className="controls"><span><kbd>DRAG BOX</kbd> SELECT UNITS</span><span><kbd>RIGHT CLICK</kbd> MOVE / RALLY</span><span><kbd>MIDDLE DRAG</kbd> ORBIT</span><span><kbd>WASD</kbd> GLIDE CAMERA</span><span><kbd>{testerMode ? "TEST CONSOLE" : "SPACE"}</kbd> {testerMode ? "RUN EXACT WAVE" : "START WAVE"}</span><span className="online">● GITHUB PAGES</span></footer>
    </main>
  );
}
