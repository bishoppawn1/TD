# Vanguard: Exoplanetary Defense — Game Specification

## Game Overview

**Vanguard: Exoplanetary Defense** is a single-player, real-time 3D tower-defense game. The player commands humanity's last defensive position on an alien world and must hold a command post against 25 escalating waves of hostile creatures.

The game combines quick defensive construction with terrain-aware tactics. Players spend command credits to place weapons, walls, mines, and support buildings on a grid-based battlefield. Enemy routes update when the player builds fortifications, allowing carefully placed walls to funnel the swarm into overlapping fields of fire.

## Player Fantasy

The player is a field commander directing a desperate military defense from an elevated tactical view. The intended tone is tense, disciplined, and militaristic: every placement should feel like a battlefield decision, and surviving the final wave should feel like holding a vital position against overwhelming odds.

## Core Objective

Protect the command post through all 25 enemy waves.

- The player wins when every hostile in wave 25 has been destroyed.
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

- Every battlefield uses a 32-by-24 construction grid with varied elevation, providing 768 playable cells and substantially longer approaches than the original theater dimensions.
- The player selects a battlefield during the opening briefing and can return to the selector between waves.
- Each map changes terrain elevation, ground palette, command-post position, invasion-portal positions, and the opening friendly deployment.
- Every map begins with five infantry and eight free structures: Ridge favors a balanced sentry screen, Basin starts with long-range fire support, and Divide receives close-range chokepoint defenses.
- Razorback Ridge is the balanced high-ground map, Cinder Basin exposes a low central defense to encirclement, and Blackglass Divide uses sheer multi-level mesas and deep approach channels.
- Every battlefield has three alien portals that pressure distinct approaches to the command post.
- Alien portals release synchronized mass surges instead of single-file trickles: opening waves deploy at least ten hostiles per gate in each burst, and later waves increase the per-gate burst size.
- The battlefield is covered by dynamic fog of war. Friendly infantry, combat defenses, the barracks, and the command post reveal limited areas around themselves.
- Hostiles outside all friendly vision radii are hidden and cannot be targeted by weapons until they enter a revealed area.
- Sentinel light towers project sweeping searchlights and reveal a substantially wider area than ordinary units. They can be mounted on top of Hesco or Bastion walls.
- Enemies travel between adjacent grid cells and dynamically recalculate their route around structures.
- Enemies choose targets by estimated travel time rather than straight-line distance. The estimate uses the actual route, terrain grade, movement speed, and any wall ascent or descent required.
- Ascending natural terrain adds substantial vertical climb time to both movement and route estimates, while downhill travel retains its speed advantage.
- Each alien applies a stable individual preference of up to 17 percent in either direction to those travel-time estimates, spreading a swarm across near-equivalent targets without making obviously bad routes attractive.
- Friendly infantry and mobile crewed weapons use grid routes around walls and other solid fortifications instead of moving through them.
- Every wall has visible access stairs on all four sides. A move order onto a wall chooses the shortest safe north, south, east, or west stair approach, animates the climb, and leaves units stationed on top.
- Construction may redirect or completely seal the route to the command post. Blocked ground enemies attack fortifications to reopen a path.
- Stalkers and razortails can climb directly over walls, including stacked wall sections, but taller climbs take proportionally longer and may make another route or target more attractive.
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

### Helios Laser Tower — 360 credits

A static precision tower that tracks visible targets and deals damage immediately with a bright direct-fire laser beam. It has strong range and damage but depends on friendly vision coverage.

### M777 Howitzer — 350 credits

A slow-firing long-range artillery piece. Its shells deal heavy damage in an area, making it effective against dense groups and durable targets. Batteries coordinate against projected incoming blast damage, spreading shells across targets and clusters that are not already expected to be destroyed. High-ground placement is especially valuable. Its crew can reposition it at a very slow towing pace.

### Javelin Battery — 480 credits

A static four-tube missile launcher with the longest base range and widest blast radius of any defense. It shares the Howitzer's coordinated targeting, avoiding targets and clusters already covered by lethal incoming fire. Its high damage is balanced by a slow reload and substantial purchase cost.

### Sentinel Light Tower — 135 credits

A non-attacking reconnaissance structure with rotating searchlights. It reveals a broad circle of fogged terrain so distant defenses can acquire enemies approaching through the darkness. Light towers can be selected and upgraded through three tiers; each upgrade increases vision radius, searchlight brightness and reach, and armor.

### Hesco Wall — 70 credits

A non-attacking fortification used to alter enemy paths and create kill zones. Walls can be stacked vertically without a height limit and include access stairs on all four sides for friendly units ordered onto the top section.

### Infantry Trench — 85 credits

A recessed earthwork that protects up to four infantry with 40 percent incoming-damage reduction. Cardinally adjacent trenches automatically remove their shared sandbag wall and form one continuous duckboard-lined passage.

### Shock Mine — 100 credits

A single-use proximity explosive. It detonates when an enemy comes close and deals area damage. Mines do not block enemy movement.

### Field Barracks — 425 credits

A support structure where the player can instantly recruit riflemen, heavy gunners, combat medics, and rocketeers. There is no training timer or recruitment cooldown; command credits are the only limit.

## Friendly Units

### Rocketeer — 155 credits

A slow infantry specialist carrying a shoulder launcher. Rocketeers fire arcing rockets at long range, dealing heavy splash damage to clustered enemies, and can be ordered onto walls like other infantry.

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

### Stalker

A small, fast blue climber that appears from wave one onward. Stalkers make up a minority of the opening swarm, then become slightly more common as the operation escalates.

### Brute

A heavy enemy introduced in later waves. Brutes are slow but have very high health, inflict severe command-post damage, and provide the largest bounty.

### Broodmother

A durable ranged alien introduced in wave 12. Broodmothers launch slow, high-arcing egg sacs from behind the swarm and award a large bounty when destroyed.

Enemy health and movement speed scale upward as the operation advances. Wave size also increases, creating steadily greater pressure on the player's defenses.

## Wave Structure

- The operation contains 25 waves.
- The player manually starts each wave, allowing time to build and reconsider the defense.
- Each new wave contains more enemies than the last.
- Swarm density is five times the original deployment strength: wave one contains 80 hostiles and the count rises to 360 by wave 25.
- Assault groups arrive at a proportionally faster cadence, concentrating the larger population into intense mass attacks instead of merely extending wave duration.
- Advanced enemy classes enter the possible spawn pool as waves progress.
- A wave ends after all scheduled enemies have spawned and no living enemies remain.
- The player receives a resupply award after each cleared wave.

## Controls

- **Left click:** Select a rifleman or combat structure; otherwise place the selected asset on a tile.
- **Left drag:** Box-select riflemen and combat structures.
- **Right click with units selected:** Move the selected units in a compact, near-square formation that rotates to face its travel direction.
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

A first-launch theater briefing lets the player compare and select a map while explaining the mission, major terrain mechanics, and camera controls. The active operation and sector appear on the mission card, which also provides access to the map selector between waves. Victory and defeat overlays summarize the selected operation and provide a restart action.

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
