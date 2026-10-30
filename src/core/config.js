// Cifras de balance y tuning. ÚNICO lugar con números de juego.
// Dueño del archivo: game-architect. Cada agente puede AÑADIR claves solo dentro de su sección
// (Edit puntual, sin reescribir el archivo). Valores marcados (prov.) se ajustan jugando.
// Unidades: metros, segundos, radianes, HP.

const DEG = Math.PI / 180;

const config = {
  // ── core (game-architect) ────────────────────────────────────────────────
  core: {
    fixedDt: 1 / 60,
    maxStepsPerFrame: 5,
    maxFrameDt: 0.25,         // un frame más largo (pestaña en segundo plano) se recorta
    seed: 1337,
    pixelRatioMax: 2,
    shadowMapSize: 2048,
  },

  // ── debug (game-architect) ───────────────────────────────────────────────
  debug: {
    statsWindow: 300,         // frames para fpsAvg / fpsP5
  },

  // ── input (controls-camera-engineer) ─────────────────────────────────────
  input: {
    stickDeadzone: 0.18,      // radial
    triggerThreshold: 0.35,   // LT/RT cuentan como "down" a partir de aquí
    doubleTapWindow: 0.28,    // s entre dos pulsaciones = doble toque (A → evadir)
    holdThreshold: 0.25,      // s para considerar "mantener" (LB Tac-Com, X revivir…)
    menuRepeatDelay: 0.4,     // s antes de autorepetir en menús
    menuRepeatRate: 0.12,     // s entre repeticiones
    mouseSensitivity: 0.0022, // rad por píxel
    lookSensitivity: 3.2,     // rad/s con el stick a fondo
    lookSensitivityAim: 1.6,
    lookCurve: 1.6,           // exponente de respuesta del stick derecho
  },

  // ── physics (physics-engineer) ───────────────────────────────────────────
  physics: {
    gravity: 22,              // m/s² (algo más que la real para que el salto sea seco)
    stepHeight: 0.35,
    skin: 0.01,
    maxSubsteps: 4,
    hashCellSize: 4,
    groundSnap: 0.2,
    terminalVelocity: 40,
  },

  // ── player (controls-camera-engineer) ────────────────────────────────────
  player: {
    radius: 0.35,
    height: 1.8,
    crouchHeight: 1.1,
    maxHp: 100,
    speed: {
      walk: 1.6,
      jog: 3.4,
      run: 4.6,
      sprint: 7.0,            // sprint toggle L3 (§1)
      aim: 2.2,
      crouch: 1.8,
      cover: 2.4,             // desplazamiento lateral en cobertura
    },
    accel: 28,
    decel: 34,
    airControl: 0.3,
    turnRate: 12,             // rad/s girando el cuerpo hacia la dirección de movimiento
    jump: { velocity: 6.2, coyoteTime: 0.1 },
    slide: { speed: 8.5, duration: 0.55, friction: 6 },
    evade: { speed: 7.5, duration: 0.45, cooldown: 0.3 },
    vault: { maxHeight: 1.2, duration: 0.45 },
    climb: { maxHeight: 2.4, duration: 0.8 },
    sprintStopStick: 0.3,     // si |LS| baja de aquí, se corta el sprint
  },

  // ── camera (controls-camera-engineer) ────────────────────────────────────
  camera: {
    fov: 70,
    fovAim: 50,
    fovSprint: 76,
    near: 0.1,
    far: 400,
    // offsets relativos al jugador (x = lateral según hombro, y = arriba, z = atrás)
    shoulder: { x: 0.55, y: 1.65, z: 2.8 },
    aim: { x: 0.65, y: 1.6, z: 1.4 },
    coverLow: { x: 0.7, y: 1.25, z: 2.6 },
    coverHigh: { x: 0.9, y: 1.7, z: 2.6 },
    sprint: { x: 0.35, y: 1.5, z: 3.4 },
    pitchMin: -70 * DEG,
    pitchMax: 60 * DEG,
    lerpSpeed: 12,            // suavizado de offsets (1/s)
    collisionRadius: 0.2,
    shakeDecay: 6,
  },

  // ── cover (controls-camera-engineer + physics-engineer) ──────────────────
  cover: {
    lowHeight: 1.0,           // cobertura media (§13)
    highHeight: 2.2,          // cobertura alta (§13)
    lowMax: 1.4,              // caja con topY <= lowMax cuenta como 'low'
    snapDistance: 2.5,        // distancia máx. para pegarse con A
    snapSpeed: 9,             // m/s corriendo hacia la cobertura
    edgePeekMargin: 0.3,
    swatMaxGap: 4.0,
    slideAdjacentMaxGap: 6.0,
    exitStickHold: 0.15,      // s tirando del stick hacia atrás para salir
  },

  // ── weapons (gameplay-programmer) — GDD §7 ───────────────────────────────
  weapons: {
    assaultRifle: {
      name: 'Rifle de asalto',
      damage: 20,
      fireRate: 10,           // disparos/s
      auto: true,
      magSize: 60,
      reserve: 240,           // (prov.)
      reloadTime: 2.2,        // (prov.)
      activeWindow: [0.45, 0.6],   // fracción 0..1 de la recarga para "perfecta" (prov.)
      goodWindow: [0.35, 0.75],    // (prov.)
      range: 120,
      spread: 1.2 * DEG,
      spreadAim: 0.4 * DEG,
      headshotMult: 2.0,      // (prov.)
      swapTime: 0.45,
    },
    pistol: {
      name: 'Pistola',
      damage: 35,
      fireRate: 4,            // semi: tope de cadencia (prov.)
      auto: false,
      magSize: 12,
      reserve: 72,            // (prov.)
      reloadTime: 1.5,        // (prov.)
      activeWindow: [0.4, 0.58],
      goodWindow: [0.3, 0.72],
      range: 80,
      spread: 0.8 * DEG,
      spreadAim: 0.25 * DEG,
      headshotMult: 2.0,
      swapTime: 0.35,
    },
    startSlots: ['assaultRifle', null, 'pistol'],
  },

  // ── activeReload (gameplay-programmer) — GDD §7 ──────────────────────────
  activeReload: {
    perfectDamageMult: 1.10,  // +10% daño
    perfectBuffDuration: 5,   // s
    perfectSpeedMult: 0.5,    // la recarga termina antes (fracción del tiempo restante)
    goodSpeedMult: 0.7,
    failedJamTime: 1.5,       // encasquillada
  },

  // ── melee (gameplay-programmer) ──────────────────────────────────────────
  melee: {
    damage: 50,               // (prov.)
    range: 1.6,
    arc: 70 * DEG,
    duration: 0.6,
    hitTime: 0.2,             // s desde el inicio del golpe
    cooldown: 0.3,
  },

  // ── targets (level-designer) — dianas de prueba de la Fase 1a ────────────
  targets: {
    hp: 100,
    respawn: 3,               // s caída hasta volver a levantarse
    fallTime: 0.35,
    riseTime: 0.5,
  },

  // ── level (level-designer) ───────────────────────────────────────────────
  level: {
    map: 'outpost',
    size: 90,
    fog: { color: 0x3a2e2a, near: 30, far: 140 },
    showDebugMarkers: true,
  },

  // ── anim (animation-engineer y animadores) ───────────────────────────────
  anim: {
    crossfade: 0.2,           // s por defecto entre estados
    upperCrossfade: 0.12,
    aimBlendSpeed: 10,
    footstepMinSpeed: 0.5,
    playbackRef: {            // velocidad (m/s) a la que el clip va a ×1
      walk: 1.6,
      run: 4.6,
    },
  },

  // ── classes (gameplay-programmer; color: character-artist) — GDD §3 ──────
  classes: {
    medic:   { id: 'medic',   name: 'Médico',          color: 0x3fbf6f },
    support: { id: 'support', name: 'Apoyo',           color: 0xe0a030 },
    engineer:{ id: 'engineer',name: 'Ingeniero',       color: 0x3f8fe0 },
    recon:   { id: 'recon',   name: 'Reconocimiento',  color: 0xb050d0 },
  },
  classOrder: ['medic', 'support', 'engineer', 'recon'],

  // ── difficulties (gameplay-programmer) — GDD §2 ──────────────────────────
  difficulties: {
    casual: { id: 'casual', name: 'Casual', enemyHp: 0.75, enemyDamage: 0.6, points: 0.8 },
    normal: { id: 'normal', name: 'Normal', enemyHp: 1.0,  enemyDamage: 1.0, points: 1.0 },
    locura: { id: 'locura', name: 'Locura', enemyHp: 1.4,  enemyDamage: 1.6, points: 1.3 },
  },
  difficultyOrder: ['casual', 'normal', 'locura'],
  defaultDifficulty: 'normal',

  // ── hud (ui-hud-designer) ────────────────────────────────────────────────
  hud: {
    hitmarkerTime: 0.15,
    promptFade: 0.15,
    reloadBarWidth: 220,      // px
    ammoLowFraction: 0.25,
  },

  // ── fx (vfx-artist) ──────────────────────────────────────────────────────
  fx: {
    tracerPool: 48,
    tracerSpeed: 220,         // m/s
    tracerLength: 3,
    muzzleFlashTime: 0.05,
    impactPool: 64,
    impactLife: 0.4,
    sparkCount: 6,
  },
};

export default config;
