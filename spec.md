# Vanguard: Exoplanetary Defense — Game Specification

## Game Overview

**Vanguard: Exoplanetary Defense** is a single-player, real-time 3D tower-defense game. The player commands humanity's last defensive position on an alien world and must hold a command post against eight escalating waves of hostile creatures.

The game combines quick defensive construction with terrain-aware tactics. Players spend command credits to place weapons, walls, mines, and support buildings on a grid-based battlefield. Enemy routes update when the player builds fortifications, allowing carefully placed walls to funnel the swarm into overlapping fields of fire.

## Player Fantasy

The player is a field commander directing a desperate military defense from an elevated tactical view. The intended tone is tense, disciplined, and militaristic: every placement should feel like a battlefield decision, and surviving the final wave should feel like holding a vital position against overwhelming odds.

## Core Objective

Protect the command post through all eight enemy waves.

- The player wins when every hostile in wave eight has been destroyed.
- The player loses when command-post integrity reaches zero.
- Any enemy that reaches the command post deals damage based on its class and is then removed from the battlefield.

## Core Gameplay Loop

1. Review the terrain and current approach route.
2. Spend command credits to deploy defensive assets.
3. Start the next wave when the perimeter is ready.
4. Watch defenses engage the swarm and adjust the layout between or during attacks.
5. Earn credits from eliminations and wave-completion resupply.
6. Repair the strategy by adding, repositioning through salvage, or replacing defenses.
7. Survive all eight waves.

## Battlefield

- The battlefield is a 24-by-18 tile 3D grid with varied elevation.
- The alien portal is located in the northeast; the command post is in the southwest.
- Enemies travel between adjacent grid cells and dynamically recalculate their route around structures.
- Enemies choose the closest soldier, combat emplacement, or wall with equal targeting priority and will reroute to attack it.
- Friendly infantry and mobile crewed weapons use grid routes around walls and other solid fortifications instead of moving through them.
- Every wall has visible access stairs. A move order onto a wall routes units to a stair approach, animates the climb, and leaves them stationed on top.
- Construction may redirect enemies but may never completely seal the route to the command post.
- Elevated weapon positions gain additional range, rewarding control of ridges and high ground.
- The camera supports orbiting, panning, zooming, and 90-degree rotation.

## Economy

- A new operation begins with 750 command credits.
- Destroyed enemies award credits according to their class.
- Completing a wave grants a resupply bonus that grows with the wave number.
- A placed asset can be salvaged for 60 percent of its original cost.
- Combat structures can be upgraded twice by spending additional command credits.
- The interface must clearly communicate costs, current credits, invalid placements, rewards, and salvage returns.

## Deployable Assets

### Rifle Team — 150 credits

A rapid-fire, short-to-medium-range emplacement designed to eliminate groups of light enemies. It is the player's dependable general-purpose defense. The crew can redeploy it, but it moves much more slowly than an individual rifleman.

### GAU-19 Sentry — 250 credits

A static, fast-tracking autocannon turret with twin barrels. It fires direct-line projectiles with no artillery arc, delivers powerful bursts with modest impact splash, and cannot redeploy after placement.

### M777 Howitzer — 350 credits

A slow-firing long-range artillery piece. Its shells deal heavy damage in an area, making it effective against dense groups and durable targets. High-ground placement is especially valuable. Its crew can reposition it at a very slow towing pace.

### Javelin Battery — 480 credits

A static four-tube missile launcher with the longest base range and widest blast radius of any defense. Its high damage is balanced by a slow reload and substantial purchase cost.

### Hesco Wall — 70 credits

A non-attacking fortification used to alter enemy paths and create kill zones. It includes access stairs for friendly units ordered onto the wall. The game rejects any wall placement that would make the command post unreachable.

### Shock Mine — 100 credits

A single-use proximity explosive. It detonates when an enemy comes close and deals area damage. Mines do not block enemy movement.

### Field Barracks — 425 credits

A support structure where the player can recruit riflemen for 60 credits after a short training cooldown.

## Unit Upgrades

- Clicking a single combat structure selects it and opens its upgrade panel.
- Every combat structure begins at tier one and can reach tier three.
- Each upgrade increases damage, range, fire rate, maximum armor, and current survivability.
- Upgrade costs scale with the structure's original purchase price and current level.
- Each structure's health bar has a camera-facing `T1`, `T2`, or `T3` badge.
- Upgraded structures gain visible energy rings; maximum-tier structures also gain a stronger light treatment.
- The panel shows the selected unit's current tier, damage, range, armor, and exact next upgrade cost.

## Enemy Classes

### Drone

The standard swarm unit. Drones are relatively fast and fragile, deal light command-post damage, and award a small credit bounty.

### Spitter

An upgraded alien introduced after the opening wave. Spitters have more health and damage than drones and award a larger bounty. Their bright biological sacs make them visually distinct.

### Brute

A heavy enemy introduced in later waves. Brutes are slow but have very high health, inflict severe command-post damage, and provide the largest bounty.

Enemy health and movement speed scale upward as the operation advances. Wave size also increases, creating steadily greater pressure on the player's defenses.

## Wave Structure

- The operation contains eight waves.
- The player manually starts each wave, allowing time to build and reconsider the defense.
- Each new wave contains more enemies than the last.
- Advanced enemy classes enter the possible spawn pool as waves progress.
- A wave ends after all scheduled enemies have spawned and no living enemies remain.
- The player receives a resupply award after each cleared wave.

## Controls

- **Left click:** Select a rifleman or combat structure; otherwise place the selected asset on a tile.
- **Left drag:** Box-select riflemen and combat structures.
- **Right click with units selected:** Move the selected units in a line formation.
- **Right drag:** Pan the camera.
- **Mouse wheel:** Zoom in or out.
- **Shift + right click:** Salvage an asset.
- **R:** Rotate the camera 90 degrees.
- **Space:** Start the next wave.

## Interface

The primary HUD displays:

- command credits;
- command-post integrity;
- hostile count;
- current and upcoming wave state;
- confirmed eliminations;
- selected deployable and its cost; and
- short command messages explaining combat events or invalid actions.

A first-launch field briefing explains the mission, major terrain mechanics, and camera controls. Victory and defeat overlays summarize the operation and provide a restart action.

## Visual and Audio Direction

The visual style is a readable, stylized military science-fiction diorama rather than photorealism. The battlefield uses dark greens, muted earth tones, warm artillery flashes, red alien portal light, and bright tactical highlights. Human silhouettes and equipment should remain recognizable from the elevated camera, while enemy classes need distinct shapes and colors.

Future audio should reinforce tactical clarity with restrained military radio chatter, weapon-specific firing sounds, impact cues, alien movement and death sounds, escalating wave music, and unmistakable warnings when the command post is damaged.

## Design Principles

- **Readable at a glance:** Units, paths, threats, placement state, and weapon effects must remain legible from the default camera distance.
- **Terrain matters:** Elevation and route shaping should meaningfully affect good strategy.
- **Every asset has a purpose:** No deployable should be a strictly better version of another.
- **Fast tactical feedback:** Placement, firing, kills, rewards, damage, and errors should produce immediate visual or interface feedback.
- **Escalating pressure:** Early waves teach the systems; later waves demand combined defenses and efficient spending.
- **Short, replayable operations:** A complete eight-wave run should be approachable in one sitting and encourage experimentation with new layouts.

## Technical Shape

The current game is a browser-based React experience rendered in Three.js. Simulation, construction, pathfinding, combat, particles, HUD updates, camera controls, and restart behavior run client-side. Future changes should preserve responsive rendering, deterministic rule clarity, and mouse-and-keyboard accessibility while keeping the game deployable as a web application.
