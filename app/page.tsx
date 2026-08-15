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
  rifle: { name: "Rifle Team", role: "Rapid fire · Anti-swarm", cost: 150, range: 4.2, icon: "⌖", accent: "#9fe870" },
  howitzer: { name: "M777 Howitzer", role: "Heavy shell · Area damage", cost: 350, range: 7.4, icon: "◎", accent: "#ffb45d" },
  wall: { name: "Hesco Wall", role: "600 armor · Supports units", cost: 70, range: 0, icon: "▦", accent: "#d1b98e" },
  mine: { name: "Shock Mine", role: "Proximity · One use", cost: 100, range: 1.35, icon: "⌁", accent: "#ff655f" },
  barracks: { name: "Field Barracks", role: "Deploys infantry squads", cost: 425, range: 0, icon: "⌂", accent: "#67c8ff" },
};

type Hud = { credits: number; integrity: number; wave: number; enemies: number; kills: number; active: boolean; gameOver: boolean; victory: boolean };
type Cell = { x: number; y: number };
type Structure = { id: number; kind: AssetKey; x: number; y: number; hp: number; maxHp: number; mountedOn?: number; group: THREE.Group; cooldown: number; spawnTimer: number };
type Enemy = { id: number; kind: AlienKind; x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; reward: number; path: Cell[]; index: number; group: THREE.Group; hitFlash: number; attackCooldown: number };
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
      const olive = 0x52664b, fabric = 0x29362c, skin = 0x9b735a, gun = 0x1a211f;
      box(g, [0.25, 0.42, 0.18], [0, 0.57, 0], olive);
      box(g, [0.09, 0.34, 0.11], [-0.075, 0.2, 0], fabric); box(g, [0.09, 0.34, 0.11], [0.075, 0.2, 0], fabric);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 7), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.9 })); head.position.y = 0.88; g.add(head);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.56), new THREE.MeshStandardMaterial({ color: 0x3f5040, roughness: 0.9 })); helmet.position.y = 0.91; g.add(helmet);
      box(g, [0.07, 0.07, 0.66], [0.17, 0.62, -0.18], gun, 0.3).rotation.x = Math.PI * 0.04;
      g.scale.setScalar(scale); shadowify(g); return g;
    }
    function makeRifleTeam() {
      const g = new THREE.Group();
      const bags = 0xa48b61;
      for (let i = -2; i <= 2; i++) cyl(g, [0.16, 0.2, 0.48, 8], [i * 0.3, 0.2, -0.15], bags, [0, 0, Math.PI / 2]);
      const a = makeSoldier(); a.position.set(-0.35, 0.22, 0.2); a.rotation.y = -0.55; g.add(a);
      const b = makeSoldier(); b.position.set(0.32, 0.22, 0.2); b.rotation.y = -0.25; g.add(b);
      return g;
    }
    function makeHowitzer() {
      const g = new THREE.Group();
      box(g, [1.35, 0.14, 0.72], [0, 0.18, 0], 0x4e5d49);
      for (const z of [-0.48, 0.48]) cyl(g, [0.31, 0.31, 0.16, 16], [-0.1, 0.31, z], 0x171c1b, [Math.PI / 2, 0, 0]);
      cyl(g, [0.19, 0.24, 0.34, 14], [0.2, 0.58, 0], 0x596952, [0, 0, Math.PI / 2]);
      const barrel = cyl(g, [0.075, 0.11, 1.65, 14], [-0.45, 1.12, 0], 0x465549, [0, 0, -Math.PI * 0.38]); barrel.position.x = -0.46;
      box(g, [0.17, 0.13, 0.85], [0.62, 0.25, 0.28], 0x3d493d); box(g, [0.17, 0.13, 0.85], [0.62, 0.25, -0.28], 0x3d493d);
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
      const brute = kind === "brute", spitter = kind === "spitter";
      const armor = brute ? 0x5b3132 : spitter ? 0x285746 : 0x344a45;
      const skin = brute ? 0x35272c : 0x25352f;
      const s = brute ? 1.22 : 1;
      const pelvis = box(g, [0.42 * s, 0.26 * s, 0.28 * s], [0, 0.67 * s, 0], skin);
      const torso = box(g, [0.68 * s, 0.62 * s, 0.34 * s], [0, 1.08 * s, 0], armor, 0.38);
      torso.geometry.rotateX(-0.08);
      const chest = box(g, [0.52 * s, 0.16 * s, 0.38 * s], [0, 1.21 * s, -0.08], brute ? 0x87504c : 0x49665d, 0.35);
      chest.rotation.x = -0.12;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 12, 8), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.66 }));
      head.scale.set(0.82, 1.18, 0.9); head.position.set(0, 1.58 * s, -0.03); g.add(head);
      const crest = box(g, [0.1 * s, 0.34 * s, 0.32 * s], [0, 1.77 * s, 0.08], armor, 0.35); crest.rotation.x = -0.28;
      const legs: THREE.Mesh[] = [], arms: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        const leg = box(g, [0.17 * s, 0.62 * s, 0.19 * s], [side * 0.15 * s, 0.32 * s, 0], skin); legs.push(leg);
        box(g, [0.24 * s, 0.14 * s, 0.34 * s], [side * 0.15 * s, 0.07, -0.08], 0x171e1c);
        const arm = box(g, [0.17 * s, 0.62 * s, 0.18 * s], [side * 0.43 * s, 1.02 * s, -0.02], armor); arm.rotation.z = side * -0.12; arms.push(arm);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 8, 6), new THREE.MeshBasicMaterial({ color: spitter ? 0x61ffad : 0xff4a4a })); eye.position.set(side * 0.075 * s, 1.62 * s, -0.19 * s); g.add(eye);
      }
      const weapon = box(g, [0.12 * s, 0.12 * s, 0.78 * s], [0.34 * s, 0.96 * s, -0.37 * s], spitter ? 0x2e9b6a : 0x242c2a, 0.25); weapon.rotation.x = -0.15;
      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.19 * s, 9, 6), new THREE.MeshStandardMaterial({ color: armor, roughness: 0.45, metalness: 0.25 })); pauldron.scale.set(1.25, 0.75, 1); pauldron.position.set(side * 0.43 * s, 1.33 * s, 0); g.add(pauldron);
      }
      if (spitter) {
        const cell = new THREE.PointLight(0x58ff9a, 1.3, 2); cell.position.set(0.34, 0.98, -0.48); g.add(cell);
      }
      g.userData.legs = legs; g.userData.arms = arms; g.userData.pelvis = pelvis;
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
      const bar = new THREE.Group(); bar.position.y = y;
      const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x35120f, depthTest: false })); back.scale.set(1.18, 0.105, 1); back.renderOrder = 20; bar.add(back);
      const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7dff79, depthTest: false })); fill.scale.set(1.12, 0.065, 1); fill.position.z = 0.01; fill.renderOrder = 21; bar.add(fill);
      group.add(bar); group.userData.healthBar = bar; group.userData.healthFill = fill;
    }
    function setHealthVisual(group: THREE.Group, hp: number, maxHp: number) {
      const ratio = clamp(hp / maxHp, 0, 1); const fill = group.userData.healthFill as THREE.Sprite | undefined;
      if (fill) { fill.scale.x = 1.12 * ratio; fill.position.x = -0.56 * (1 - ratio); (fill.material as THREE.SpriteMaterial).color.setHex(ratio > 0.55 ? 0x7dff79 : ratio > 0.25 ? 0xffbd55 : 0xff5249); }
    }
    let credits = 750, integrity = 100, wave = 0, kills = 0, active = false, gameOver = false, victory = false;
    let spawnLeft = 0, spawnTimer = 0, nextId = 1, elapsed = 0, lastHud = -1;
    let structures: Structure[] = [], enemies: Enemy[] = [], marines: Marine[] = [], bullets: Bullet[] = [], particles: Particle[] = [];
    let selectedMarine: number | null = null;
    const blocked = () => new Set(structures.filter(s => s.kind !== "mine" && !s.mountedOn).map(s => keyOf(s.x, s.y)));
    function findPath(sx: number, sy: number, extra?: Cell): Cell[] {
      const ban = blocked(); if (extra) ban.add(keyOf(extra.x, extra.y));
      const start = { x: clamp(Math.round(sx), 0, GRID_W - 1), y: clamp(Math.round(sy), 0, GRID_H - 1) };
      ban.delete(keyOf(start.x, start.y));
      const queue: Cell[] = [start], prev = new Map<string, string>(); prev.set(keyOf(start.x, start.y), "");
      for (let qi = 0; qi < queue.length; qi++) {
        const cur = queue[qi]; if (cur.x === baseCell.x && cur.y === baseCell.y) break;
        const next = [{ x: cur.x + 1, y: cur.y }, { x: cur.x - 1, y: cur.y }, { x: cur.x, y: cur.y + 1 }, { x: cur.x, y: cur.y - 1 }];
        next.sort((a, b) => (Math.abs(a.x - baseCell.x) + Math.abs(a.y - baseCell.y)) - (Math.abs(b.x - baseCell.x) + Math.abs(b.y - baseCell.y)));
        for (const n of next) if (n.x >= 0 && n.y >= 0 && n.x < GRID_W && n.y < GRID_H && !ban.has(keyOf(n.x, n.y)) && !prev.has(keyOf(n.x, n.y))) { prev.set(keyOf(n.x, n.y), keyOf(cur.x, cur.y)); queue.push(n); }
      }
      const endKey = keyOf(baseCell.x, baseCell.y); if (!prev.has(endKey)) return [];
      const out: Cell[] = []; let k = endKey;
      while (k) { const [x, y] = k.split(",").map(Number); out.push({ x, y }); k = prev.get(k) || ""; }
      return out.reverse();
    }
    function emitHud(force = false) {
      if (!force && elapsed - lastHud < 0.12) return; lastHud = elapsed;
      callbacks.current.onHud({ credits, integrity, wave, enemies: enemies.length + spawnLeft, kills, active, gameOver, victory });
    }
    function message(text: string) { callbacks.current.onMessage(text); }
    function addStructure(kind: AssetKey, x: number, y: number, free = false, mountedOn?: number) {
      const group = kind === "rifle" ? makeRifleTeam() : kind === "howitzer" ? makeHowitzer() : kind === "wall" ? makeWall() : kind === "mine" ? makeMine() : makeBarracks();
      group.position.copy(worldPos(x, y, mountedOn ? 0.62 : 0)); group.rotation.y = kind === "wall" ? Math.PI / 2 : -0.35; group.scale.multiplyScalar(0.72); attachHealthBar(group, kind === "wall" ? 1.25 : kind === "barracks" ? 2 : 1.65); world.add(group);
      const maxHp = STRUCTURE_HP[kind]; structures.push({ id: nextId++, kind, x, y, hp: maxHp, maxHp, mountedOn, group, cooldown: Math.random(), spawnTimer: 5 });
      if (!free) credits -= ASSETS[kind].cost;
    }
    addStructure("barracks", 3, 14, true); addStructure("rifle", 6, 14, true); addStructure("wall", 4, 15, true); addStructure("howitzer", 8, 15, true); spawnMarine(3, 13); spawnMarine(4, 14);

    function tryPlace(x: number, y: number) {
      const kind = selectedRef.current, asset = ASSETS[kind];
      if (gameOver) return;
      if (credits < asset.cost) return message("INSUFFICIENT COMMAND CREDITS");
      const wall = structures.find(s => s.kind === "wall" && s.x === x && s.y === y);
      const canMount = !!wall && (kind === "rifle" || kind === "howitzer") && !structures.some(s => s.mountedOn === wall.id);
      if ((x === baseCell.x && y === baseCell.y) || (x === spawnCell.x && y === spawnCell.y) || (structures.some(s => s.x === x && s.y === y) && !canMount)) return message(wall ? "WALL POSITION ALREADY OCCUPIED" : "DEPLOYMENT ZONE OCCUPIED");
      if (wall && !canMount) return message("ONLY RIFLE TEAMS OR ARTILLERY CAN MOUNT WALLS");
      if (kind !== "mine" && !canMount && !findPath(spawnCell.x, spawnCell.y, { x, y }).length) return message("FORTIFICATION WOULD SEAL THE EVACUATION CORRIDOR");
      addStructure(kind, x, y, false, canMount ? wall?.id : undefined);
      if (kind !== "mine" && !canMount) enemies.forEach(e => { e.path = findPath(e.x, e.y); e.index = 0; });
      message(`${asset.name.toUpperCase()} ${canMount ? "MOUNTED ON WALL" : "DEPLOYED"} · ELEVATION ${Math.round((heights[y][x] + (canMount ? 0.62 : 0)) * 100)}M`); emitHud(true);
    }
    function destroyStructure(s: Structure, salvaged = false) {
      if (!structures.includes(s)) return;
      if (s.kind === "wall") {
        structures.filter(other => other.mountedOn === s.id).forEach(other => { burst(other.group.position, 0xff794f, 10); world.remove(other.group); structures.splice(structures.indexOf(other), 1); });
        marines.filter(m => m.mountedOn === s.id).forEach(m => { m.mountedOn = undefined; m.hp -= 35; m.targetX = clamp(m.x + 1, 0, GRID_W - 1); m.targetY = m.y; });
      }
      if (salvaged) credits += Math.floor(ASSETS[s.kind].cost * 0.6);
      burst(s.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), salvaged ? 0x9dff8b : 0xff553f, salvaged ? 5 : 15);
      world.remove(s.group); structures.splice(structures.indexOf(s), 1);
      enemies.forEach(e => { e.path = findPath(e.x, e.y); e.index = 0; });
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
    function selectOrCommandMarine(x: number, y: number) {
      const clicked = marines.find(m => Math.hypot(m.x - x, m.y - y) < 0.52);
      if (clicked) {
        selectedMarine = clicked.id; marines.forEach(m => { const ring = m.group.userData.selectionRing as THREE.Mesh; if (ring) ring.visible = m.id === selectedMarine; });
        message("RIFLEMAN SELECTED · CLICK A GRID CELL TO MOVE"); return true;
      }
      if (selectedMarine !== null) {
        const marine = marines.find(m => m.id === selectedMarine); if (!marine) { selectedMarine = null; return false; }
        const wall = structures.find(s => s.kind === "wall" && s.x === x && s.y === y);
        marine.targetX = x; marine.targetY = y; marine.mountedOn = wall?.id; selectedMarine = null;
        const ring = marine.group.userData.selectionRing as THREE.Mesh; if (ring) ring.visible = false;
        message(wall ? "RIFLEMAN ORDERED TO WALL FIRING STEP" : "RIFLEMAN MOVE ORDER CONFIRMED"); return true;
      }
      return false;
    }
    function spawnEnemy() {
      const roll = Math.random(); const kind: AlienKind = wave >= 4 && roll > 0.78 ? "brute" : wave >= 2 && roll > 0.58 ? "spitter" : "drone";
      const scale = 1 + wave * 0.12; const hp = (kind === "brute" ? 340 : kind === "spitter" ? 125 : 82) * scale;
      const group = makeAlien(kind); const p = worldPos(spawnCell.x, spawnCell.y); group.position.copy(p); world.add(group);
      enemies.push({ id: nextId++, kind, x: spawnCell.x, y: spawnCell.y, hp, maxHp: hp, speed: (kind === "brute" ? 0.48 : kind === "spitter" ? 0.72 : 0.9) * (1 + wave * 0.018), damage: kind === "brute" ? 18 : kind === "spitter" ? 9 : 6, reward: kind === "brute" ? 65 : kind === "spitter" ? 36 : 24, path: findPath(spawnCell.x, spawnCell.y), index: 0, group, hitFlash: 0, attackCooldown: 0 });
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
    function fire(from: THREE.Vector3, target: Enemy, damage: number, splash: number, color: number, heavy = false) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(heavy ? 0.11 : 0.045, 7, 5), new THREE.MeshBasicMaterial({ color })); mesh.position.copy(from); world.add(mesh);
      bullets.push({ mesh, from: from.clone(), to: target.group.position.clone().add(new THREE.Vector3(0, 0.42, 0)), t: 0, speed: heavy ? 1.35 : 4.8, target: target.id, damage, splash, color });
    }
    function damageEnemy(e: Enemy, amount: number) { e.hp -= amount; e.hitFlash = 0.09; }
    function restart() {
      [...structures, ...enemies, ...marines].forEach(o => world.remove(o.group)); bullets.forEach(b => world.remove(b.mesh)); particles.forEach(p => world.remove(p.mesh));
      structures = []; enemies = []; marines = []; bullets = []; particles = []; selectedMarine = null; credits = 750; integrity = 100; wave = 0; kills = 0; active = false; gameOver = false; victory = false; spawnLeft = 0;
      addStructure("barracks", 3, 14, true); addStructure("rifle", 6, 14, true); addStructure("wall", 4, 15, true); addStructure("howitzer", 8, 15, true); spawnMarine(3, 13); spawnMarine(4, 14); message("COMMAND SYSTEMS RESET · AWAITING DEPLOYMENT"); emitHud(true);
    }
    function rotate() {
      const offset = camera.position.clone().sub(controls.target); const a = Math.PI / 2;
      camera.position.set(controls.target.x + offset.x * Math.cos(a) - offset.z * Math.sin(a), camera.position.y, controls.target.z + offset.x * Math.sin(a) + offset.z * Math.cos(a)); controls.update();
    }
    apiRef.current = { start: startWave, restart, rotate };

    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), cameraVelocity = new THREE.Vector3(); const heldKeys = new Set<string>(); let hovered: THREE.Mesh | null = null, downX = 0, downY = 0;
    function pick(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect(); pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(tileMeshes, false)[0]?.object as THREE.Mesh | undefined;
    }
    function onMove(e: PointerEvent) {
      const tile = pick(e); if (hovered && hovered !== tile) (hovered.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      hovered = tile || null; if (hovered) (hovered.material as THREE.MeshStandardMaterial).emissive.setHex(0x16452e);
    }
    function onDown(e: PointerEvent) { downX = e.clientX; downY = e.clientY; }
    function onUp(e: PointerEvent) { if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5 || e.button !== 0) return; const tile = pick(e); if (tile && !selectOrCommandMarine(tile.userData.x, tile.userData.y)) tryPlace(tile.userData.x, tile.userData.y); }
    function onContext(e: MouseEvent) { e.preventDefault(); const tile = pick(e as PointerEvent); if (tile) removeStructureAt(tile.userData.x, tile.userData.y); }
    function onKey(e: KeyboardEvent) { heldKeys.add(e.key.toLowerCase()); if (e.key.toLowerCase() === "r") rotate(); if (e.key === "Escape") { selectedMarine = null; marines.forEach(m => { const ring = m.group.userData.selectionRing as THREE.Mesh; if (ring) ring.visible = false; }); } if (e.code === "Space") { e.preventDefault(); startWave(); } }
    function onKeyUp(e: KeyboardEvent) { heldKeys.delete(e.key.toLowerCase()); }
    renderer.domElement.addEventListener("pointermove", onMove); renderer.domElement.addEventListener("pointerdown", onDown); renderer.domElement.addEventListener("pointerup", onUp); renderer.domElement.addEventListener("contextmenu", onContext); window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);

    function update(dt: number) {
      elapsed += dt; portal.rotation.z += dt * 0.7;
      const forward = controls.target.clone().sub(camera.position); forward.y = 0; forward.normalize(); const right = new THREE.Vector3(-forward.z, 0, forward.x); const intent = new THREE.Vector3();
      if (heldKeys.has("w")) intent.add(forward); if (heldKeys.has("s")) intent.sub(forward); if (heldKeys.has("d")) intent.add(right); if (heldKeys.has("a")) intent.sub(right);
      if (intent.lengthSq()) cameraVelocity.addScaledVector(intent.normalize(), dt * 25); cameraVelocity.multiplyScalar(Math.exp(-dt * 5.2));
      const cameraStep = cameraVelocity.clone().multiplyScalar(dt); camera.position.add(cameraStep); controls.target.add(cameraStep); controls.target.x = clamp(controls.target.x, -15, 15); controls.target.z = clamp(controls.target.z, -11, 11);
      if (active && spawnLeft > 0) { spawnTimer -= dt; if (spawnTimer <= 0) { spawnEnemy(); spawnLeft--; spawnTimer = Math.max(0.35, 1.2 - wave * 0.07); } }
      for (const e of enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt); e.attackCooldown -= dt;
        const attackRange = e.kind === "spitter" ? 2.45 : e.kind === "brute" ? 1.35 : 1.15;
        const defense = structures.filter(s => s.kind !== "mine").map(s => ({ s, d: Math.hypot(s.x - e.x, s.y - e.y) })).filter(v => v.d <= attackRange).sort((a, b) => a.d - b.d)[0];
        const soldier = marines.map(m => ({ m, d: Math.hypot(m.x - e.x, m.y - e.y) })).filter(v => v.d <= attackRange).sort((a, b) => a.d - b.d)[0];
        if (defense || soldier) {
          const tx = defense ? defense.s.x : soldier.m.x, ty = defense ? defense.s.y : soldier.m.y; e.group.rotation.y = Math.atan2(-(tx - e.x), -(ty - e.y));
          if (e.attackCooldown <= 0) {
            const hit = e.damage * (e.kind === "brute" ? 1.45 : 1); const targetPos = defense ? defense.s.group.position : soldier.m.group.position;
            if (defense) { defense.s.hp -= hit; setHealthVisual(defense.s.group, defense.s.hp, defense.s.maxHp); if (defense.s.hp <= 0) { message(`${ASSETS[defense.s.kind].name.toUpperCase()} DESTROYED BY HOSTILES`); destroyStructure(defense.s); } }
            else { soldier.m.hp -= hit; setHealthVisual(soldier.m.group, soldier.m.hp, soldier.m.maxHp); }
            burst(targetPos.clone().add(new THREE.Vector3(0, 0.55, 0)), e.kind === "spitter" ? 0x65ffac : 0xff694d, e.kind === "brute" ? 8 : 4); e.attackCooldown = e.kind === "brute" ? 1.35 : e.kind === "spitter" ? 1.15 : 0.82;
          }
        } else {
          if (!e.path.length) e.path = findPath(e.x, e.y);
          const targetCell = e.path[Math.min(e.index + 1, e.path.length - 1)];
          if (targetCell) {
            const dx = targetCell.x - e.x, dy = targetCell.y - e.y, dist = Math.hypot(dx, dy);
            if (dist < 0.025) e.index++; else { const step = Math.min(dist, e.speed * dt); e.x += dx / dist * step; e.y += dy / dist * step; e.group.rotation.y = Math.atan2(-dx, -dy); }
            const legs = e.group.userData.legs as THREE.Mesh[] | undefined; if (legs) legs.forEach((leg, i) => { leg.rotation.x = Math.sin(elapsed * 9 * e.speed + i * Math.PI) * 0.42; });
          }
        }
        const p = worldPos(e.x, e.y); e.group.position.lerp(p, Math.min(1, dt * 12)); e.group.position.y += Math.sin(elapsed * 9 + e.id) * 0.018;
      }
      for (const s of structures) {
        s.cooldown -= dt;
        if (s.kind === "barracks") {
          s.spawnTimer -= dt; if (s.spawnTimer <= 0 && marines.length < 7) {
            const mx = clamp(s.x + 1, 0, GRID_W - 1), my = s.y; spawnMarine(mx, my); s.spawnTimer = 9; message("FIELD BARRACKS DEPLOYED A MOVABLE RIFLEMAN");
          }
        }
        if (s.kind !== "rifle" && s.kind !== "howitzer") continue;
        const range = ASSETS[s.kind].range + heights[s.y][s.x] * 0.9; const target = enemies.filter(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) <= range).sort((a, b) => b.index - a.index)[0];
        if (target && s.cooldown <= 0) { const from = s.group.position.clone().add(new THREE.Vector3(s.kind === "howitzer" ? -0.55 : 0, s.kind === "howitzer" ? 1.5 : 1.05, 0)); fire(from, target, s.kind === "howitzer" ? 105 : 14, s.kind === "howitzer" ? 1.25 : 0, s.kind === "howitzer" ? 0xffa64d : 0xbaff77, s.kind === "howitzer"); s.cooldown = s.kind === "howitzer" ? 2.35 : 0.42; }
      }
      for (const m of marines) {
        m.cooldown -= dt; const mdx = m.targetX - m.x, mdy = m.targetY - m.y, moveDist = Math.hypot(mdx, mdy);
        if (moveDist > 0.035) { const accel = 5.2; m.vx += mdx / moveDist * accel * dt; m.vy += mdy / moveDist * accel * dt; const speed = Math.hypot(m.vx, m.vy), max = 1.65; if (speed > max) { m.vx *= max / speed; m.vy *= max / speed; } m.x += m.vx * dt; m.y += m.vy * dt; m.group.rotation.y = Math.atan2(-m.vx, -m.vy); }
        else { m.x = m.targetX; m.y = m.targetY; m.vx *= Math.exp(-dt * 10); m.vy *= Math.exp(-dt * 10); }
        m.vx *= Math.exp(-dt * 3.2); m.vy *= Math.exp(-dt * 3.2); const settledOnWall = m.mountedOn && moveDist < 0.12; m.group.position.lerp(worldPos(m.x, m.y, settledOnWall ? 0.62 : 0), Math.min(1, dt * 14));
        const target = enemies.find(e => e.hp > 0 && Math.hypot(e.x - m.x, e.y - m.y) < (settledOnWall ? 4.2 : 3.25));
        if (target && m.cooldown <= 0) { m.group.rotation.y = Math.atan2(-(target.x - m.x), -(target.y - m.y)); fire(m.group.position.clone().add(new THREE.Vector3(0, 0.72, 0)), target, settledOnWall ? 12 : 9, 0, 0xbaff77); m.cooldown = 0.55; }
      }
      for (const s of [...structures]) if (s.kind === "mine") {
        const target = enemies.find(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < 1.25); if (target) { enemies.forEach(e => { if (Math.hypot(e.x - s.x, e.y - s.y) < 1.75) damageEnemy(e, 145); }); burst(s.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x6ffff3, 25); destroyStructure(s); message("SHOCK MINE DETONATED"); }
      }
      for (const b of [...bullets]) {
        b.t += dt * b.speed; const arc = b.splash ? Math.sin(Math.min(1, b.t) * Math.PI) * 2.2 : 0; b.mesh.position.lerpVectors(b.from, b.to, Math.min(1, b.t)); b.mesh.position.y += arc;
        if (b.t >= 1) { const target = enemies.find(e => e.id === b.target); if (target) { if (b.splash) enemies.forEach(e => { const d = Math.hypot(e.x - target.x, e.y - target.y); if (d <= b.splash) damageEnemy(e, b.damage * (1 - d / (b.splash * 1.8))); }); else damageEnemy(target, b.damage); burst(b.to, b.color, b.splash ? 18 : 4); } world.remove(b.mesh); bullets.splice(bullets.indexOf(b), 1); }
      }
      for (const e of [...enemies]) {
        if (e.hp <= 0) { credits += e.reward; kills++; burst(e.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), e.kind === "spitter" ? 0x58ff96 : 0xff573e, e.kind === "brute" ? 24 : 12); world.remove(e.group); enemies.splice(enemies.indexOf(e), 1); continue; }
        if (Math.hypot(e.x - baseCell.x, e.y - baseCell.y) < 0.22) { integrity = Math.max(0, integrity - e.damage); burst(base.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4a31, 14); world.remove(e.group); enemies.splice(enemies.indexOf(e), 1); if (integrity <= 0) { gameOver = true; active = false; message("COMMAND POST OVERRUN · SECTOR LOST"); } }
      }
      for (const m of [...marines]) if (m.hp <= 0) { if (selectedMarine === m.id) selectedMarine = null; burst(m.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xff5f47, 9); world.remove(m.group); marines.splice(marines.indexOf(m), 1); message("RIFLEMAN KILLED IN ACTION"); }
      for (const p of [...particles]) { p.life -= dt; p.velocity.y -= dt * 2.6; p.mesh.position.addScaledVector(p.velocity, dt); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife); if (p.life <= 0) { world.remove(p.mesh); particles.splice(particles.indexOf(p), 1); } }
      if (active && spawnLeft === 0 && enemies.length === 0) { active = false; credits += 125 + wave * 25; if (wave >= 8) { victory = true; gameOver = true; message("SECTOR SECURED · HUMANITY HOLDS THE RIDGE"); } else message(`WAVE ${String(wave).padStart(2, "0")} DESTROYED · RESUPPLY DELIVERED`); }
      emitHud();
    }

    let raf = 0, last = performance.now();
    function animate(now: number) { const dt = Math.min(0.04, (now - last) / 1000); last = now; update(dt); controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(animate); }
    emitHud(true); raf = requestAnimationFrame(animate);
    const resize = () => { camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); renderer.domElement.removeEventListener("pointermove", onMove); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp); renderer.domElement.removeEventListener("contextmenu", onContext); controls.dispose(); renderer.dispose(); host.removeChild(renderer.domElement); apiRef.current = null; };
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
        {briefing && <div className="briefing"><div className="briefing-id">FIELD BRIEFING // 04:38 LOCAL</div><h1>They found the ridge.</h1><p>Your field barracks is already operational. Every wall, turret and squad has its own health. Hostiles will attack nearby defenses. Mount rifle teams or artillery on walls, and click individual riflemen to issue movement orders.</p><div className="brief-grid"><span><kbd>W A S D</kbd><b>Move with inertia</b></span><span><kbd>CLICK TROOP</kbd><b>Select, then move</b></span><span><kbd>CLICK WALL</kbd><b>Mount selected asset</b></span><span><kbd>RIGHT CLICK</kbd><b>Salvage asset</b></span></div><button onClick={() => setBriefing(false)}>ASSUME COMMAND</button></div>}
        {hud.gameOver && <div className={`end-card ${hud.victory ? "won" : "lost"}`}><small>{hud.victory ? "OPERATION COMPLETE" : "SIGNAL LOST"}</small><h2>{hud.victory ? "THE RIDGE HOLDS" : "COMMAND OVERRUN"}</h2><p>{hud.kills} hostiles eliminated across {hud.wave} waves.</p><button onClick={() => apiRef.current?.restart()}>RESTART OPERATION</button></div>}
      </section>
      <aside className="build-panel">
        <div className="panel-title"><small>FORWARD ENGINEERING</small><b>DEPLOYABLE ASSETS</b></div>
        {(Object.keys(ASSETS) as AssetKey[]).map(key => { const a = ASSETS[key]; return <button key={key} className={`asset ${selected === key ? "active" : ""}`} onClick={() => setSelected(key)} style={{ "--asset-color": a.accent } as React.CSSProperties}><span>{a.icon}</span><div><b>{a.name}</b><small>{a.role}</small></div><em>{a.cost}</em></button>; })}
        <div className="intel"><span>FIELD INTEL</span><p>Place rifle teams or artillery directly onto walls for extra elevation. Click a rifleman, then a grid square—or a wall—to move him.</p></div>
      </aside>
      <footer className="controls"><span><kbd>WASD</kbd> GLIDE CAMERA</span><span><kbd>DRAG</kbd> ORBIT</span><span><kbd>CLICK TROOP</kbd> MOVE</span><span><kbd>R</kbd> ROTATE 90°</span><span><kbd>SPACE</kbd> START WAVE</span><span className="online">● LOCAL BUILD</span></footer>
    </main>
  );
}
