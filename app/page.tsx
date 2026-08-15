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
  wall: { name: "Hesco Wall", role: "Fortification · Reroutes swarm", cost: 70, range: 0, icon: "▦", accent: "#d1b98e" },
  mine: { name: "Shock Mine", role: "Proximity · One use", cost: 100, range: 1.35, icon: "⌁", accent: "#ff655f" },
  barracks: { name: "Field Barracks", role: "Deploys infantry squads", cost: 425, range: 0, icon: "⌂", accent: "#67c8ff" },
};

type Hud = { credits: number; integrity: number; wave: number; enemies: number; kills: number; active: boolean; gameOver: boolean; victory: boolean };
type Cell = { x: number; y: number };
type Structure = { id: number; kind: AssetKey; x: number; y: number; group: THREE.Group; cooldown: number; spawnTimer: number };
type Enemy = { id: number; kind: AlienKind; x: number; y: number; hp: number; maxHp: number; speed: number; damage: number; reward: number; path: Cell[]; index: number; group: THREE.Group; hitFlash: number };
type Marine = { id: number; x: number; y: number; life: number; cooldown: number; group: THREE.Group };
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
      const shell = brute ? 0x563f36 : spitter ? 0x315d48 : 0x394c3b;
      const skin = brute ? 0x281f1d : 0x17271f;
      const body = new THREE.Mesh(new THREE.SphereGeometry(brute ? 0.48 : 0.34, 12, 8), new THREE.MeshStandardMaterial({ color: shell, roughness: 0.62, metalness: 0.18 })); body.scale.set(1, 0.68, 1.42); body.position.y = brute ? 0.58 : 0.42; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(brute ? 0.34 : 0.25, 10, 7), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 })); head.scale.set(1.1, 0.7, 1); head.position.set(0, brute ? 0.55 : 0.4, -0.5); g.add(head);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const root = new THREE.Vector3(side * 0.22, 0.45, -0.25 + i * 0.3);
        const joint = new THREE.Vector3(side * (0.58 + i * 0.07), 0.25, -0.4 + i * 0.4);
        const foot = new THREE.Vector3(side * (0.84 + i * 0.08), 0.04, -0.54 + i * 0.5);
        beam(g, root, joint, brute ? 0.055 : 0.035, shell); beam(g, joint, foot, brute ? 0.045 : 0.025, skin);
      }
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: spitter ? 0x5dff9c : 0xff4b37 })); eye.position.set(side * 0.1, 0.48, -0.72); g.add(eye);
      }
      if (spitter) {
        const sac = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 7), new THREE.MeshStandardMaterial({ color: 0x409b6a, emissive: 0x0b3d20, roughness: 0.4 })); sac.scale.set(0.8, 0.8, 1.2); sac.position.set(0, 0.45, 0.48); g.add(sac);
      }
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

    let credits = 900, integrity = 100, wave = 0, kills = 0, active = false, gameOver = false, victory = false;
    let spawnLeft = 0, spawnTimer = 0, nextId = 1, elapsed = 0, lastHud = -1;
    let structures: Structure[] = [], enemies: Enemy[] = [], marines: Marine[] = [], bullets: Bullet[] = [], particles: Particle[] = [];
    const blocked = () => new Set(structures.filter(s => s.kind !== "mine").map(s => keyOf(s.x, s.y)));
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
    function addStructure(kind: AssetKey, x: number, y: number, free = false) {
      const group = kind === "rifle" ? makeRifleTeam() : kind === "howitzer" ? makeHowitzer() : kind === "wall" ? makeWall() : kind === "mine" ? makeMine() : makeBarracks();
      group.position.copy(worldPos(x, y)); group.rotation.y = kind === "wall" ? Math.PI / 2 : -0.35; group.scale.multiplyScalar(0.72); world.add(group);
      structures.push({ id: nextId++, kind, x, y, group, cooldown: Math.random(), spawnTimer: 6 });
      if (!free) credits -= ASSETS[kind].cost;
    }
    addStructure("rifle", 6, 14, true); addStructure("wall", 4, 15, true); addStructure("howitzer", 8, 15, true);

    function tryPlace(x: number, y: number) {
      const kind = selectedRef.current, asset = ASSETS[kind];
      if (gameOver) return;
      if (credits < asset.cost) return message("INSUFFICIENT COMMAND CREDITS");
      if ((x === baseCell.x && y === baseCell.y) || (x === spawnCell.x && y === spawnCell.y) || structures.some(s => s.x === x && s.y === y)) return message("DEPLOYMENT ZONE OCCUPIED");
      if (kind !== "mine" && !findPath(spawnCell.x, spawnCell.y, { x, y }).length) return message("FORTIFICATION WOULD SEAL THE EVACUATION CORRIDOR");
      addStructure(kind, x, y);
      if (kind !== "mine") enemies.forEach(e => { e.path = findPath(e.x, e.y); e.index = 0; });
      message(`${asset.name.toUpperCase()} DEPLOYED · ELEVATION ${Math.round(heights[y][x] * 100)}M`); emitHud(true);
    }
    function removeStructureAt(x: number, y: number) {
      const i = structures.findIndex(s => s.x === x && s.y === y); if (i < 0) return;
      const s = structures[i]; credits += Math.floor(ASSETS[s.kind].cost * 0.6); world.remove(s.group); structures.splice(i, 1); enemies.forEach(e => { e.path = findPath(e.x, e.y); e.index = 0; });
      message(`${ASSETS[s.kind].name.toUpperCase()} SALVAGED · +${Math.floor(ASSETS[s.kind].cost * 0.6)} CREDITS`); emitHud(true);
    }
    function spawnEnemy() {
      const roll = Math.random(); const kind: AlienKind = wave >= 4 && roll > 0.78 ? "brute" : wave >= 2 && roll > 0.58 ? "spitter" : "drone";
      const scale = 1 + wave * 0.12; const hp = (kind === "brute" ? 340 : kind === "spitter" ? 125 : 82) * scale;
      const group = makeAlien(kind); const p = worldPos(spawnCell.x, spawnCell.y); group.position.copy(p); group.rotation.y = Math.PI; world.add(group);
      enemies.push({ id: nextId++, kind, x: spawnCell.x, y: spawnCell.y, hp, maxHp: hp, speed: (kind === "brute" ? 0.48 : kind === "spitter" ? 0.72 : 0.9) * (1 + wave * 0.018), damage: kind === "brute" ? 18 : kind === "spitter" ? 9 : 6, reward: kind === "brute" ? 65 : kind === "spitter" ? 36 : 24, path: findPath(spawnCell.x, spawnCell.y), index: 0, group, hitFlash: 0 });
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
      structures = []; enemies = []; marines = []; bullets = []; particles = []; credits = 900; integrity = 100; wave = 0; kills = 0; active = false; gameOver = false; victory = false; spawnLeft = 0;
      addStructure("rifle", 6, 14, true); addStructure("wall", 4, 15, true); addStructure("howitzer", 8, 15, true); message("COMMAND SYSTEMS RESET · AWAITING DEPLOYMENT"); emitHud(true);
    }
    function rotate() {
      const offset = camera.position.clone().sub(controls.target); const a = Math.PI / 2;
      camera.position.set(controls.target.x + offset.x * Math.cos(a) - offset.z * Math.sin(a), camera.position.y, controls.target.z + offset.x * Math.sin(a) + offset.z * Math.cos(a)); controls.update();
    }
    apiRef.current = { start: startWave, restart, rotate };

    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let hovered: THREE.Mesh | null = null, downX = 0, downY = 0;
    function pick(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect(); pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(tileMeshes, false)[0]?.object as THREE.Mesh | undefined;
    }
    function onMove(e: PointerEvent) {
      const tile = pick(e); if (hovered && hovered !== tile) (hovered.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      hovered = tile || null; if (hovered) (hovered.material as THREE.MeshStandardMaterial).emissive.setHex(0x16452e);
    }
    function onDown(e: PointerEvent) { downX = e.clientX; downY = e.clientY; }
    function onUp(e: PointerEvent) { if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5 || e.button !== 0) return; const tile = pick(e); if (tile) tryPlace(tile.userData.x, tile.userData.y); }
    function onContext(e: MouseEvent) { e.preventDefault(); const tile = pick(e as PointerEvent); if (tile) removeStructureAt(tile.userData.x, tile.userData.y); }
    function onKey(e: KeyboardEvent) { if (e.key.toLowerCase() === "r") rotate(); if (e.code === "Space") { e.preventDefault(); startWave(); } }
    renderer.domElement.addEventListener("pointermove", onMove); renderer.domElement.addEventListener("pointerdown", onDown); renderer.domElement.addEventListener("pointerup", onUp); renderer.domElement.addEventListener("contextmenu", onContext); window.addEventListener("keydown", onKey);

    function update(dt: number) {
      elapsed += dt; portal.rotation.z += dt * 0.7;
      if (active && spawnLeft > 0) { spawnTimer -= dt; if (spawnTimer <= 0) { spawnEnemy(); spawnLeft--; spawnTimer = Math.max(0.35, 1.2 - wave * 0.07); } }
      for (const e of enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        if (!e.path.length) e.path = findPath(e.x, e.y);
        const targetCell = e.path[Math.min(e.index + 1, e.path.length - 1)];
        if (targetCell) {
          const dx = targetCell.x - e.x, dy = targetCell.y - e.y, dist = Math.hypot(dx, dy);
          if (dist < 0.025) e.index++; else { const step = Math.min(dist, e.speed * dt); e.x += dx / dist * step; e.y += dy / dist * step; e.group.rotation.y = Math.atan2(dx, dy); }
          const p = worldPos(e.x, e.y); e.group.position.lerp(p, Math.min(1, dt * 12)); e.group.position.y += Math.sin(elapsed * 8 + e.id) * 0.025;
        }
      }
      for (const s of structures) {
        s.cooldown -= dt;
        if (s.kind === "barracks") {
          s.spawnTimer -= dt; if (s.spawnTimer <= 0 && marines.filter(m => Math.hypot(m.x - s.x, m.y - s.y) < 3).length < 3) {
            const m = makeSoldier(1.12), angle = Math.random() * Math.PI * 2; const mx = clamp(s.x + Math.cos(angle) * 0.75, 0, GRID_W - 1), my = clamp(s.y + Math.sin(angle) * 0.75, 0, GRID_H - 1); m.position.copy(worldPos(mx, my)); world.add(m); marines.push({ id: nextId++, x: mx, y: my, life: 28, cooldown: 0, group: m }); s.spawnTimer = 7; message("BARRACKS DEPLOYED A NEW RIFLEMAN");
          }
        }
        if (s.kind !== "rifle" && s.kind !== "howitzer") continue;
        const range = ASSETS[s.kind].range + heights[s.y][s.x] * 0.9; const target = enemies.filter(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) <= range).sort((a, b) => b.index - a.index)[0];
        if (target && s.cooldown <= 0) { const from = s.group.position.clone().add(new THREE.Vector3(s.kind === "howitzer" ? -0.55 : 0, s.kind === "howitzer" ? 1.5 : 1.05, 0)); fire(from, target, s.kind === "howitzer" ? 105 : 14, s.kind === "howitzer" ? 1.25 : 0, s.kind === "howitzer" ? 0xffa64d : 0xbaff77, s.kind === "howitzer"); s.cooldown = s.kind === "howitzer" ? 2.35 : 0.42; }
      }
      for (const m of marines) {
        m.life -= dt; m.cooldown -= dt; const target = enemies.find(e => e.hp > 0 && Math.hypot(e.x - m.x, e.y - m.y) < 3.25);
        if (target && m.cooldown <= 0) { m.group.rotation.y = Math.atan2(target.x - m.x, target.y - m.y); fire(m.group.position.clone().add(new THREE.Vector3(0, 0.72, 0)), target, 9, 0, 0xbaff77); m.cooldown = 0.55; }
      }
      for (const s of [...structures]) if (s.kind === "mine") {
        const target = enemies.find(e => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < 1.25); if (target) { enemies.forEach(e => { if (Math.hypot(e.x - s.x, e.y - s.y) < 1.75) damageEnemy(e, 145); }); burst(s.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x6ffff3, 25); world.remove(s.group); structures.splice(structures.indexOf(s), 1); message("SHOCK MINE DETONATED"); }
      }
      for (const b of [...bullets]) {
        b.t += dt * b.speed; const arc = b.splash ? Math.sin(Math.min(1, b.t) * Math.PI) * 2.2 : 0; b.mesh.position.lerpVectors(b.from, b.to, Math.min(1, b.t)); b.mesh.position.y += arc;
        if (b.t >= 1) { const target = enemies.find(e => e.id === b.target); if (target) { if (b.splash) enemies.forEach(e => { const d = Math.hypot(e.x - target.x, e.y - target.y); if (d <= b.splash) damageEnemy(e, b.damage * (1 - d / (b.splash * 1.8))); }); else damageEnemy(target, b.damage); burst(b.to, b.color, b.splash ? 18 : 4); } world.remove(b.mesh); bullets.splice(bullets.indexOf(b), 1); }
      }
      for (const e of [...enemies]) {
        if (e.hp <= 0) { credits += e.reward; kills++; burst(e.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), e.kind === "spitter" ? 0x58ff96 : 0xff573e, e.kind === "brute" ? 24 : 12); world.remove(e.group); enemies.splice(enemies.indexOf(e), 1); continue; }
        if (Math.hypot(e.x - baseCell.x, e.y - baseCell.y) < 0.22) { integrity = Math.max(0, integrity - e.damage); burst(base.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff4a31, 14); world.remove(e.group); enemies.splice(enemies.indexOf(e), 1); if (integrity <= 0) { gameOver = true; active = false; message("COMMAND POST OVERRUN · SECTOR LOST"); } }
      }
      for (const m of [...marines]) if (m.life <= 0) { world.remove(m.group); marines.splice(marines.indexOf(m), 1); }
      for (const p of [...particles]) { p.life -= dt; p.velocity.y -= dt * 2.6; p.mesh.position.addScaledVector(p.velocity, dt); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife); if (p.life <= 0) { world.remove(p.mesh); particles.splice(particles.indexOf(p), 1); } }
      if (active && spawnLeft === 0 && enemies.length === 0) { active = false; credits += 125 + wave * 25; if (wave >= 8) { victory = true; gameOver = true; message("SECTOR SECURED · HUMANITY HOLDS THE RIDGE"); } else message(`WAVE ${String(wave).padStart(2, "0")} DESTROYED · RESUPPLY DELIVERED`); }
      emitHud();
    }

    let raf = 0, last = performance.now();
    function animate(now: number) { const dt = Math.min(0.04, (now - last) / 1000); last = now; update(dt); controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(animate); }
    emitHud(true); raf = requestAnimationFrame(animate);
    const resize = () => { camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKey); renderer.domElement.removeEventListener("pointermove", onMove); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp); renderer.domElement.removeEventListener("contextmenu", onContext); controls.dispose(); renderer.dispose(); host.removeChild(renderer.domElement); apiRef.current = null; };
  }, [apiRef]);
  return <div ref={hostRef} className="three-host" aria-label="Interactive 3D battlefield" />;
}

export default function Home() {
  const [selected, setSelected] = useState<AssetKey>("rifle");
  const [hud, setHud] = useState<Hud>({ credits: 900, integrity: 100, wave: 0, enemies: 0, kills: 0, active: false, gameOver: false, victory: false });
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
        {briefing && <div className="briefing"><div className="briefing-id">FIELD BRIEFING // 04:38 LOCAL</div><h1>They found the ridge.</h1><p>Fortify the command post before the alien swarm breaches the eastern portal. Higher ground extends weapon range. Walls force the swarm to reroute. Barracks manufacture temporary rifle squads.</p><div className="brief-grid"><span><kbd>LEFT DRAG</kbd><b>Orbit camera</b></span><span><kbd>RIGHT DRAG</kbd><b>Pan view</b></span><span><kbd>SCROLL</kbd><b>Zoom optics</b></span><span><kbd>RIGHT CLICK</kbd><b>Salvage asset</b></span></div><button onClick={() => setBriefing(false)}>ASSUME COMMAND</button></div>}
        {hud.gameOver && <div className={`end-card ${hud.victory ? "won" : "lost"}`}><small>{hud.victory ? "OPERATION COMPLETE" : "SIGNAL LOST"}</small><h2>{hud.victory ? "THE RIDGE HOLDS" : "COMMAND OVERRUN"}</h2><p>{hud.kills} hostiles eliminated across {hud.wave} waves.</p><button onClick={() => apiRef.current?.restart()}>RESTART OPERATION</button></div>}
      </section>
      <aside className="build-panel">
        <div className="panel-title"><small>FORWARD ENGINEERING</small><b>DEPLOYABLE ASSETS</b></div>
        {(Object.keys(ASSETS) as AssetKey[]).map(key => { const a = ASSETS[key]; return <button key={key} className={`asset ${selected === key ? "active" : ""}`} onClick={() => setSelected(key)} style={{ "--asset-color": a.accent } as React.CSSProperties}><span>{a.icon}</span><div><b>{a.name}</b><small>{a.role}</small></div><em>{a.cost}</em></button>; })}
        <div className="intel"><span>FIELD INTEL</span><p>Artillery gains range on elevated terrain. Keep at least one route open to funnel hostiles through kill zones.</p></div>
      </aside>
      <footer className="controls"><span><kbd>DRAG</kbd> ORBIT</span><span><kbd>SCROLL</kbd> ZOOM</span><span><kbd>R</kbd> ROTATE 90°</span><span><kbd>SPACE</kbd> START WAVE</span><span className="online">● COMMAND LINK STABLE</span></footer>
    </main>
  );
}
