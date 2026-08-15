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
7. Survive all 25 waves.

## Battlefield

- Every battlefield uses a square 44-by-44 construction grid with varied elevation, providing 1,936 playable cells and long, wide approaches.
- The player selects a battlefield during the opening briefing and can return to the selector between waves.
- Each map changes terrain elevation, ground palette, command-post position, invasion-portal positions, and the opening friendly deployment.
- Most maps begin with five infantry and eight free structures tailored to their terrain and invasion pattern.
- HQ Command is the initial map and represents humanity's vast fortified field headquarters. It begins with 48 structures—including layered walls, two barracks, artillery, anti-air, heavy weapons, trenches, mines, wire, and lights—plus a 16-soldier garrison.
- HQ Command is attacked from five land fronts, schedules 75 percent more aliens per wave, supports up to 170 simultaneous hostiles, launches larger bursts, and replenishes attackers faster than standard maps. Its extensive starting defenses are necessary rather than decorative.
- Cinder Basin exposes a low defense to encirclement around a spring-fed oasis, with naturally scattered cacti and skeletal remains replacing the repeated generic rock rows.
- Blackglass Divide uses seven distinct terraced peaks, smaller volcanic ridges, obsidian crystal clusters, heat vents, and a diagonal river to create many elevated positions and approach channels.
- Three narrow permanent bridges cross the Blackglass river at the western, central, and eastern thirds of the battlefield. Infantry and ordinary ground aliens use these crossings, and construction is prohibited on the bridge decks so every crossing remains available.
- Temple of Dust places the command post in the center of an ancient ruin maze. Staggered openings across concentric high walls and broken corridor baffles force eight invasion routes to bend through distinct approaches.
- The Breeding World is an alien homeworld with organic ridges, luminous growths, and twelve perimeter spawning pits surrounding a central command post.
- Every battlefield contains map-specific shallow water: HQ has a frontier stream, Cinder Basin has an oasis, Blackglass has a diagonal fracture, Temple of Dust has two cisterns, and the homeworld has luminous alien pools.
- Water is impassable to infantry, mobile crewed weapons, structures, and every ordinary ground alien. Only dedicated aquatic aliens may enter and wade through water; flying enemies pass above it.
- Ambient props are deterministic but naturally scattered by terrain rather than repeated in straight lines. HQ uses pines and supply caches, Cinder uses cacti and bones, Blackglass uses crystals and vents, Temple of Dust uses pillars and obelisks, and the homeworld uses organic growths.
- Portal counts vary by battlefield. The homeworld more than doubles the usual wave population, deploys it at a faster cadence, and permits up to 170 simultaneous hostiles; the temple divides smaller bursts among its eight fronts.
- Alien portals release synchronized mass surges instead of single-file trickles. Normal maps deploy at least twenty hostiles per gate in each burst, with later waves increasing that amount to thirty.
- The battlefield is covered by dynamic fog of war. Friendly infantry, combat defenses, the barracks, and the command post reveal limited areas around themselves.
- Hostiles outside all friendly vision radii are hidden and cannot be targeted by weapons until they enter a revealed area.
- Sentinel light towers project sweeping searchlights and reveal a substantially wider area than ordinary units. They can be mounted on top of Hesco or Bastion walls.
- Enemies travel between adjacent grid cells and dynamically recalculate their route around structures.
- Enemy bodies use size-aware collision spacing, forming a dense moving swarm without occupying the same physical space.
- All friendly splash weapons and shock mines use a slightly tighter area-of-effect radius while retaining their direct-hit damage.
- Enemies choose targets by estimated travel time rather than straight-line distance. The estimate uses the actual route, terrain grade, movement speed, and any wall ascent or descent required.
- Ascending natural terrain adds explicit vertical climb time to both movement and route estimates, while downhill travel retains a modest speed advantage. Friendly units climb at more than ten times the aliens' vertical rate, so mountains delay soldiers without making repositioning painfully slow.
- Each alien applies a stable individual preference of up to 17 percent in either direction to those travel-time estimates, spreading a swarm across near-equivalent targets without making obviously bad routes attractive.
- Friendly infantry and mobile crewed weapons use grid routes around walls and other solid fortifications instead of moving through them.
- Every wall has visible access stairs on all four sides. A move order onto a wall chooses the shortest safe north, south, east, or west stair approach, animates the climb, and leaves units stationed on top.
- Construction may redirect or completely seal the route to the command post. Blocked ground enemies attack fortifications to reopen a path.
- Stalkers and razortails can climb directly over walls, including stacked wall sections, but taller climbs take proportionally longer and may make another route or target more attractive.
- Flying enemies travel above terrain and fortifications, ignore trenches, razor wire, and mines, and choose valuable exposed targets instead of attacking walls.
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

### Aegis Flak Turret — 300 credits

A dedicated anti-air turret with elevated twin cannons and a glowing tracking radar. It ignores ground targets, rapidly tracks flying enemies, and detonates airburst shells that damage multiple airborne creatures in a tight formation. Like other combat defenses, it supports three upgrade tiers and can mount on walls.

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

- Ten or more stationary infantry of the same class within a one-grid-square-diameter collection area collapse into a single rendered troop stack with a persistent `×N` badge. The stack can grow beyond ten and moves as one selectable formation member.
- Troop stacks retain the health of every soldier. Incoming hits damage only the front soldier, removing one member when that soldier falls, while the representative's outgoing damage and medical support scale with the number of surviving members.

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

### Skyrazor

A small, fragile airborne alien introduced in wave three. Skyrazors are the only winged enemy class: their two pairs of translucent wings clearly signal that they fly over walls and difficult terrain. They trade durability for mobility, ignore ground hazards, and attack the command post, infantry, weapons, lights, or barracks from above. Flak turrets are the purpose-built counter, though suitable general-purpose direct-fire weapons can also engage them.

All ground alien classes are visually wingless. Their silhouettes use tall, angular, multi-jointed legs with tapered lower limbs, pronounced knee spikes, rear-facing barbs, and hooked claw points instead of broad or flattened feet. Crawling bodies, armor, tails, and class-specific proportions still communicate how each creature moves across or climbs over the battlefield.

Enemy health and movement speed scale upward as the operation advances. Wave size also increases, creating steadily greater pressure on the player's defenses.

## Wave Structure

- The operation contains 25 waves.
- The player manually starts each wave, allowing time to build and reconsider the defense.
- Each new wave contains more enemies than the last.
- Swarm density is six times the original deployment strength: wave one contains 96 hostiles and the count rises to 432 by wave 25.
- HQ Command increases those totals to 168 hostiles on wave one and 756 by wave 25, with as many as 170 enemies active at once.
- Assault groups arrive at a proportionally faster cadence, concentrating the larger population into intense mass attacks instead of merely extending wave duration.
- Advanced enemy classes enter the possible spawn pool as waves progress, with Skyrazors joining from wave three onward.
- A wave ends after all scheduled enemies have spawned and no living enemies remain.
- The player receives a resupply award after each cleared wave.

## Unit Tester Mode

- The deployment briefing offers a Unit Tester sandbox alongside the standard campaign on every battlefield.
- The player chooses any wave profile from 1 through 25, preserving that wave's enemy classes, health, damage, and speed scaling.
- An exact custom population from 1 through 5,000 aliens replaces the campaign's normal wave size. The active-enemy cap still meters very large tests into performant assault groups until the requested total has spawned.
- Defensive structures may be placed during or between tests with unlimited supply. Upgrades and barracks recruitment are also free and unlimited.
- Completing a test leaves the selected wave unchanged so the player can adjust the defense and immediately rerun the same scenario. Unit Tester waves do not advance campaign progression or trigger campaign victory.
- Resetting the test range restores its starting forces, command-post integrity, and empty-wave state without leaving Unit Tester mode.

## Controls

- **Left click:** Select a rifleman or combat structure; otherwise place the selected asset on a tile.
- **Left drag:** Box-select riflemen and combat structures.
- **Right click with units selected:** Move the selected units in a compact, near-square formation that rotates to face its travel direction.
- **Right drag:** Pan the camera.
- **Mouse wheel:** Zoom in or out.
- **Shift + right click:** Salvage an asset.
- **R:** Rotate the camera 90 degrees.
- **Space:** Start the next wave.
- **Unit Test console:** Choose a wave and exact alien count, then launch the configured test.

## Interface

The primary HUD displays:

- command credits;
- command-post integrity;
- hostile count;
- current and upcoming wave state;
- confirmed eliminations;
- selected deployable and its cost; and
- short command messages explaining combat events or invalid actions.

A first-launch theater briefing lets the player choose Campaign or Unit Tester mode, compare and select a map, and review the major terrain and camera controls. In Unit Tester mode the top console exposes wave and alien-count fields, while supply and construction status clearly read as unlimited. The active operation and sector appear on the mission card, which also provides access to the map and mode selector between waves. Victory and defeat overlays summarize the selected operation and provide a restart action.

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
