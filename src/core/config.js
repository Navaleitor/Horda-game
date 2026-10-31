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
    lookDeadzone: 0.15,       // radial, stick derecho
    lookInvertY: false,       // inversión opcional del eje vertical (RS y ratón)
    lookAccel: {              // aceleración horizontal con RS a fondo (giros rápidos; no al apuntar)
      threshold: 0.92,        // magnitud del stick a partir de la que acelera
      delay: 0.2,             // s a fondo antes de empezar a acelerar
      time: 0.35,             // s hasta alcanzar el máximo
      max: 1.7,               // multiplicador máximo
    },
    mouseAimScale: 0.6,       // sensibilidad del ratón al apuntar (fracción)
    menuStickThreshold: 0.5,  // inclinación de LS que cuenta como dirección en menús
  },

  // ── physics (physics-engineer) ───────────────────────────────────────────
  physics: {
    gravity: 22,              // m/s² (algo más que la real para que el salto sea seco)
    stepHeight: 0.35,
    skin: 0.01,
    maxSubsteps: 48,          // tope de sub-pasos horizontales por moveCapsule; por encima, barrido anti-túnel
    substepFraction: 0.5,     // longitud de sub-paso = radio × esto
    resolveIterations: 4,     // pasadas de depenetración por sub-paso
    hashCellSize: 4,
    groundSnap: 0.2,
    terminalVelocity: 40,
    groundPlane: true,        // plano de suelo implícito (boxId 0 en raycast)
    groundY: 0,
    dynamicMargin: 0.5,       // m de holgura de las hitboxes en el hash dinámico
    maxRayCells: 512,         // celdas máx. recorridas por raycast
    ledgeReach: 0.75,         // m delante de la cápsula para detectar vault/climb
    vaultMaxHeight: 1.25,
    vaultMaxDepth: 1.0,       // fondo máx. del obstáculo para saltarlo por encima
    vaultClearance: 0.6,      // hueco libre exigido sobre la cima
    vaultMaxDrop: 3.0,        // caída máx. detrás del obstáculo
    climbMaxHeight: 2.4,
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
      run: 4.6,               // stick a fondo (§1)
      aim: 2.2,
      crouch: 1.8,
      cover: 2.4,             // desplazamiento lateral en cobertura
    },
    accel: 28,
    decel: 34,
    airControl: 0.3,
    turnRate: 12,             // rad/s girando el cuerpo hacia la dirección de movimiento
    jump: { velocity: 7.6, coyoteTime: 0.1 },   // 6.2·√1.5: salto un 50 % más alto (~2.9 m de cima)
    evade: { speed: 7.8, duration: 0.6, cooldown: 0.3, endFalloff: 0.5 },   // maroma ≈ 3.5 m = v·t·(1−falloff/2) (A en movimiento sin cobertura a tiro / doble A)
    vault: { maxHeight: 1.2, duration: 0.45, clearance: 0.25, exitSpeed: 3.4 },
    climb: { maxHeight: 2.4, duration: 0.8, upFraction: 0.6 },   // maxHeight: también tope sobre el suelo al agarrarse en el aire
    airGrab: { groundProbe: 30 },   // m de rayo hacia abajo para medir el suelo al agarrarse en el aire
    // Umbrales del stick izquierdo para el modo de locomoción
    stickIdle: 0.05,
    stickWalkMax: 0.55,       // < → walk
    stickRunMin: 0.9,         // ≥ → run; entre ambos → jog
    queryStickMin: 0.3,       // inclinación mínima para usar el stick como dirección de consultas (cobertura/saliente)
    faceMinSpeed: 0.3,        // m/s para girar el cuerpo hacia la dirección de movimiento
    aimTurnRate: 25,          // rad/s girando hacia la cámara al apuntar/disparar
    actionTurnRate: 14,       // evadir, vault, trepar, entrar en cobertura
    groundStick: 2,           // m/s hacia abajo pegado al suelo
    landMinSpeed: 4,          // m/s de caída para la pose de aterrizaje
    hardLandSpeed: 9,         // m/s de caída para sacudida/vibración
    landTime: 0.18,
    landShake: { amp: 0.012, dur: 0.2 },
    moveToSlack: 0.35,        // s extra para llegar al anclaje de cobertura antes de rendirse
    moveToSnap: 0.6,          // m: si se atasca más cerca que esto, completa la entrada
    teleportProbeHeight: 20,  // debug teleport: altura desde la que se busca el suelo
    promptInterval: 0.1,      // s entre consultas de prompts contextuales
    emptySlotPromptTime: 1.2, // s que se muestra "Vacía"
    headSize: 0.14,           // semilado de la hitbox de cabeza
    rumble: {                 // [strong, weak, ms]
      fire: [0.0, 0.18, 45],
      reloadPerfect: [0.25, 0.55, 140],
      reloadGood: [0.1, 0.3, 90],
      reloadFailed: [0.6, 0.2, 220],
      meleeHit: [0.55, 0.35, 120],
      cover: [0.2, 0.1, 70],
      evade: [0.15, 0.1, 60],
      land: [0.35, 0.2, 90],
    },
  },

  // ── camera (controls-camera-engineer) ────────────────────────────────────
  camera: {
    fov: 70,
    fovAim: 50,
    near: 0.1,
    far: 400,
    // offsets relativos al jugador (x = lateral según hombro, y = arriba, z = atrás)
    shoulder: { x: 0.55, y: 1.65, z: 2.8 },
    aim: { x: 0.65, y: 1.6, z: 1.4 },
    coverLow: { x: 0.7, y: 1.25, z: 2.6 },
    coverHigh: { x: 0.9, y: 1.7, z: 2.6 },
    pitchMin: -70 * DEG,
    pitchMax: 60 * DEG,
    lerpSpeed: 12,            // suavizado de offsets (1/s)
    collisionRadius: 0.2,
    shakeDecay: 6,
    peekLow: { x: 0.65, y: 1.6, z: 1.6 },   // asomarse por encima de cobertura baja
    peekHigh: { x: 1.05, y: 1.65, z: 1.6 }, // asomarse por el borde de cobertura alta (lado = cover.side)
    shoulderSwapSpeed: 9,     // 1/s transición de hombro (R3)
    fovLerpSpeed: 10,
    collisionReturnSpeed: 5,  // 1/s al alejarse tras una colisión (acercarse es instantáneo)
    minDistance: 0.35,        // distancia mínima pivote→cámara
    spawnPitch: -0.12,
    fireShake: { amp: 0.004, dur: 0.08 },
    meleeShake: { amp: 0.015, dur: 0.18 },
    menuOrbit: { center: [0, 1, 0], radius: 26, height: 12, speed: 0.06 },
  },

  // ── cover (controls-camera-engineer + physics-engineer) ──────────────────
  cover: {
    lowHeight: 1.0,           // cobertura media (§13)
    highHeight: 2.2,          // cobertura alta (§13)
    lowMax: 1.4,              // caja con topY <= lowMax cuenta como 'low'
    snapDistance: 2.5,        // distancia máx. para pegarse con A
    snapSpeed: 4.6,           // m/s corriendo hacia la cobertura (= speed.run, sin slide)
    evadeSnapDistance: 0.25,  // m: una maroma a esta distancia de una cobertura (hueco cápsula–cara) se pega
    edgePeekMargin: 0.3,
    swatMaxGap: 1.5,          // hueco mayor → deslizar a la contigua (§1)
    slideAdjacentMaxGap: 6.0,
    exitStickHold: 0.15,      // s tirando del stick hacia atrás para salir
    // comportamiento (controls-camera-engineer)
    exitStickAway: 0.6,       // componente del stick alejándose de la cobertura para salir (y A+atrás)
    exitStickMin: 0.5,
    transferStickMin: 0.5,    // componente lateral para SWAT / deslizar a la contigua con A
    moveStickMin: 0.2,        // componente lateral mínima para desplazarse por el borde
    refreshDistance: 0.6,     // m extra al re-consultar la cobertura mientras te desplazas
    swatSpeed: 7,             // m/s de la transferencia SWAT
    swatMinTime: 0.45,
    swatBulge: 0.35,          // m de abombamiento hacia fuera de la trayectoria
    adjacentSpeed: 6,
    adjacentMinTime: 0.35,
    adjacentBulge: 0.45,
    // clasificación/geometría (physics-engineer)
    coverMinHeight: 0.8,      // sin tag 'cover', una caja es cobertura si su altura sobre los pies ∈ [min, max]
    coverMaxHeight: 2.6,
    maxAngle: 60 * DEG,       // desviación máx. entre la dirección pedida y −normal de la cara
    minFaceWidth: 0.4,
    edgeInset: 0.2,           // el anclaje no pasa de tMin+inset / tMax−inset
    edgeEpsilon: 0.05,        // tolerancia para atLeftEdge/atRightEdge
    mergeGap: 0.05,           // cajas coplanares a menos de esto se fusionan en una sola cara
    adjacentDepthTol: 0.5,    // |Δplano| máx. para cobertura contigua
    swatDepthTol: 1.5,        // |Δplano| máx. para SWAT
    swatMinGap: 0.5,          // hueco mínimo para SWAT
    probeHeight: 0.5,         // altura (sobre los pies) de los rayos de oclusión/paso
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
      activeWindow: [0.45, 0.6],   // fracción 0..1 de la recarga: "perfecta" (prov.)
      goodWindow: [0.35, 0.75],    // "buena", contiene a la perfecta (prov.)
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
      activeWindow: [0.4, 0.58],   // (prov.)
      goodWindow: [0.3, 0.72],     // (prov.)
      range: 80,
      spread: 0.8 * DEG,
      spreadAim: 0.25 * DEG,
      headshotMult: 2.0,      // (prov.)
      swapTime: 0.35,
    },
    startSlots: ['assaultRifle', null, 'pistol'],
    // Boca del cañón en la simulación (no se lee object3d): x lateral según hombro, y altura
    // desde los pies (yLow agachado / cobertura baja sin asomar), z hacia la mira. (prov.)
    muzzleOffset: { x: 0.22, y: 1.42, yLow: 1.0, z: 0.7 },
    spreadCoverPeekMult: 0.75,  // en cobertura asomado / apuntando por encima (prov.)
    spreadBlindFireMult: 2.5,   // disparo a ciegas desde cobertura (prov.)
    sameHitTolerance: 0.05,     // m: el rayo desde la boca "llega" al punto de la mira (técnico)
    headshotImpactColor: 0xff3030, // color del fx 'impact' en headshot (fx:spawn.color)
  },

  // ── activeReload (gameplay-programmer) — GDD §7 ──────────────────────────
  // Zonas por arma en weapons.<id>: activeWindow = perfecta (estrecha) DENTRO de goodWindow = buena.
  // Fuera de goodWindow = fallida. Un solo intento por recarga.
  activeReload: {
    perfectDamageMult: 1.10,  // +10% daño
    perfectBuffDuration: 5,   // s
    perfectSpeedMult: 0.5,    // perfecta también acelera: tiempo restante × 0.5 (prov.)
    goodSpeedMult: 0.7,       // buena: tiempo restante × 0.7, sin bonus de daño (prov.)
    failedJamTime: 1.5,       // encasquillada
  },

  // ── melee (gameplay-programmer) ──────────────────────────────────────────
  melee: {
    damage: 50,               // (prov.)
    range: 1.6,
    arc: 70 * DEG,
    duration: 0.6,
    hitTime: 0.2,             // s desde el inicio del golpe
    cooldown: 0.3,            // s tras terminar el golpe
    targetRadius: 0.4,        // radio supuesto del objetivo si no tiene `radius`
    heightTolerance: 1.2,     // m de diferencia vertical máx. entre pecho y objetivo
    chestHeight: 1.2,         // m desde los pies (origen del golpe)
  },

  // ── targets (level-designer) — dianas de prueba de la Fase 1a ────────────
  targets: {
    hp: 100,
    respawn: 3,               // s caída hasta volver a levantarse
    fallTime: 0.35,
    riseTime: 0.5,
    hitWobble: 0.07,          // fracción de setDown al recibir un impacto sin morir
    hitWobbleTime: 0.18,      // s
  },

  // ── level (level-designer) ───────────────────────────────────────────────
  level: {
    map: 'outpost',
    size: 90,
    fog: { color: 0x7a5446, near: 35, far: 170 },
    showDebugMarkers: true,
    uvTile: 2,                // m por baldosa de la textura de rejilla (UV en espacio de mundo)
    sky: { zenith: 0x24304f, horizon: 0xd9844f, ground: 0x2a2026, sunGlow: 0xffb36b, radius: 320 },
    hemi: { sky: 0xffd6b8, ground: 0x4a3a42, intensity: 1.7 },
    sun: {
      color: 0xffbc80, intensity: 2.8,
      dir: [-0.74, 0.56, 0.36],   // hacia el sol (oeste, bajo: atardecer)
      shadowExtent: 66,           // semilado de la cámara de sombra (cubre el mapa en diagonal)
      shadowBias: -0.0004, shadowNormalBias: 0.04,
    },
    fabLights: { color: 0x9fe8ff, intensity: 90, angle: 0.55, penumbra: 0.6, height: 7 },
    markerOpacity: 0.35,
  },

  // ── anim (animation-engineer y animadores) ───────────────────────────────
  anim: {
    crossfade: 0.2,           // s por defecto entre estados
    upperCrossfade: 0.12,
    aimBlendSpeed: 10,
    footstepMinSpeed: 0.5,
    // poses de torso con arma (weapon-animator, src/anim/weapons/). [px,py,pz,rx,ry,rz] en el marco de la mira.
    weapons: {
      breath: { freq: 0.28, aim: 0.0025, ready: 0.008 },   // Hz, amplitud (m / rad)
      recoil: {               // back/up: impulsos del muelle; wrist/yaw/roll/chest: patada visual (rad)
        assaultRifle: { back: 0.9, up: 1.4, kickTime: 0.09, wrist: 0.05, yaw: 0.015, roll: 0.03, chest: 0.02 },
        pistol:       { back: 1.1, up: 2.4, kickTime: 0.14, wrist: 0.22, yaw: 0.01, roll: 0.02, chest: 0.015 },
      },
      reload: {               // claves de curva [t, v, …] sobre la fracción de la recarga
        assaultRifle: {
          tilt: [-0.04, 0.06, 0.04, 0.25, 0.2, 0.5],
          tiltKeys: [0, 0, 0.12, 1, 0.82, 1, 1, 0],
          toMag: [0, 0, 0.15, 1, 0.75, 1, 0.9, 0],
          away: [0.2, 0, 0.32, 1, 0.45, 1, 0.57, 0],
          magOut: [0.18, 0, 0.26, 1, 0.5, 1, 0.6, 0],
          pouch: [-0.18, 0.95, 0.02], drop: 0.25, insertAt: 0.62,
        },
        pistol: {
          tilt: [-0.02, 0.08, 0.06, 0.35, 0.35, 0.25],
          tiltKeys: [0, 0, 0.1, 1, 0.85, 1, 1, 0],
          toMag: [0, 0, 0.12, 0.6, 0.22, 0, 0.42, 1, 0.68, 1, 0.82, 0],
          away: [0.18, 0, 0.28, 1, 0.45, 1, 0.55, 0],
          magOut: [0.1, 0, 0.2, 1, 0.5, 1, 0.58, 0],
          pouch: [-0.14, 0.98, -0.04], drop: 0.35, insertAt: 0.6,
        },
      },
      activeReload: {
        punchTime: 0.25, perfectPunch: 1.4, goodPunch: 0.9,
        jamShake: 0.06, jamShakeFreq: 38, jamRoll: 0.35, jamHitFreq: 2.2,
      },
      stow: {                 // cambio de arma: hacia dónde se guarda (offset sobre 'low')
        assaultRifle: { offset: [0.06, 0.18, 0.2, 1.1, 0.5, 0.6], twist: -0.25, shrug: 0.2 },
        pistol:       { offset: [0.1, -0.12, 0.12, -0.6, 0.1, 0], twist: -0.1, shrug: 0 },
      },
      melee: {                // wind = recoger, strike = golpe; leftHand: la izq. sigue en el arma
        assaultRifle: { wind: [0.05, 0.08, 0.12, -0.2, -0.5, 0], strike: [-0.12, 0.1, -0.3, -0.9, 0.5, 0], chestTwist: 0.15, leftHand: true },
        pistol:       { wind: [0.08, 0.22, 0.18, 0.9, -0.2, 0.2], strike: [-0.02, -0.12, -0.32, -1.1, 0.25, -0.2], chestTwist: 0.2, leftHand: false },
      },
    },
    playbackRef: {            // velocidad (m/s) a la que el clip va a ×1 (respaldo: el rig mide la zancada real)
      walk: 1.6,
      run: 4.6,
    },
    // núcleo (animation-engineer): rig, capas, IK. Ver cabecera de src/anim/core/characterRig.js
    core: {
      locoClips: ['Walk', 'Run'],   // clips calibrados (zancada y contactos) y sincronizados en fase
      idleToWalk: [0.05, 0.6],  // m/s: mezcla Idle→Walk
      strafeMaxHips: 70 * DEG,  // giro máx. de caderas hacia la dirección de marcha
      backpedalAngle: 110 * DEG, // a partir de aquí el ciclo se reproduce hacia atrás
      poseSmoothing: 30,        // 1/s: suavizado de aditivos por hueso y cadera
      holdBlendSpeed: 16,       // 1/s: suavizado de la pose del arma
      ikBlendSpeed: 12,         // 1/s: suavizado de pesos de IK
      footMinY: 0.075,          // m: altura mínima del tobillo sobre el suelo (rig.groundFeet)
      aimYawMax: 85 * DEG,
      aimPitchMin: -70 * DEG,
      aimPitchMax: 70 * DEG,
      aimYawSplit: [0.2, 0.25, 0.25, 0.15, 0.15],   // spine, spine1, spine2, neck, head (suma 1)
      aimPitchSplit: [0.25, 0.25, 0.25, 0.1, 0.15],
      headLook: 0.8,            // la cabeza sigue la mira aunque el torso no apunte
      elbowPole: [0.5, -0.7, 0.35], // polo del codo respecto al hombro (x hacia fuera, m)
      recoil: { stiffness: 260, damping: 24, back: 0.9, up: 1.6 },   // impulsos (m/s, rad/s) por disparo
      fingerCurl: { axis: 'z', amount: [0.9, 1.1, 0.8], thumb: 0.5, right: 1, left: 1 },
      // Pose del arma por id: [px, py, pz, rx, ry, rz] del grip respecto al pecho (spine2), en el marco
      // de la mira (m, rad; Euler YXZ; −Z delante). stance = giro de columna (rad, − = hombro izq. adelante).
      hold: {
        assaultRifle: {
          aim:   [0.11, 0.07, -0.27, 0, 0, 0],
          ready: [0.08, -0.2, -0.24, -0.35, 0.3, 0.15],
          low:   [0.12, -0.36, -0.14, -0.85, 0.55, 0.35],
          stance: { aim: -0.7, ready: -0.35 },
          protract: { aim: 0.35, ready: 0.2 },   // adelanto de la clavícula izq. (rad)
        },
        pistol: {
          aim:   [0.04, 0.0, -0.42, 0, 0, 0],
          ready: [0.1, -0.2, -0.3, -0.5, 0.15, 0],
          low:   [0.2, -0.42, -0.06, -1.2, 0.1, 0],
          stance: { aim: -0.2, ready: -0.1 },
          protract: { aim: 0.15, ready: 0.05 },
        },
      },
      // Agarre de cada mano en espacio del arma: wrist = muñeca respecto al anclaje (grip/support),
      // finger = dirección muñeca→nudillos, palm = normal de la palma.
      grip: {
        default: {
          right: { wrist: [0.03, -0.035, 0.075], finger: [-0.35, 0.3, -1], palm: [-1, -0.2, 0] },
          left:  { wrist: [-0.03, -0.06, 0.05], finger: [0.3, 0.35, -1], palm: [1, 0, 0] },
        },
        pistol: {
          left:  { wrist: [-0.045, -0.05, 0.05], finger: [0.6, 0.2, -1], palm: [1, 0.3, 0] },
        },
      },
      fireHold: 0.22,           // s que dura el estado 'fire' tras el último disparo
      reloadInsertPhase: 0.62,  // fracción de la recarga en que se emite anim:reload:insert (por defecto)
      crouchHips: -0.36,        // m
      coverLowHips: -0.42,
    },

    // cobertura (cover-animator): src/anim/cover/. Unidades m, s, rad. "Marco de la pared": +X = derecha del
    // jugador mirando a la pared, −Z = hacia la pared (la pared está a −0.36 del anclaje). En cobertura el
    // personaje se gira π (espalda a la pared); asomándose gira de cara a la mira.
    cover: {
      // Geometría del Xbot en Idle (espacio de personaje, medida) para el IK analítico de piernas.
      legs: {
        hips: [0.002, 1.025, -0.017],
        hipJoint: [[0.080, -0.066, 0.026], [-0.083, -0.067, 0.015]],   // [derecha, izquierda] respecto a la cadera
        thigh: 0.442, shin: 0.442, ankleH: 0.087,
        restThigh: [0.066, -0.436, -0.033],   // dirección muslo en Idle (pierna derecha; la izquierda es el espejo en x)
        restShin: [0.070, -0.436, 0.043],
      },
      // Pose por altura × (agazapado | asomado). drop = bajada de cadera, back = cadera hacia la pared,
      // lean = inclinación del tronco hacia delante del cuerpo (rad), headUp = cabeza arriba (rad),
      // footW = semianchura de pisada, footF = pie por delante de la cadera, gun = [subir arma (rad), x, y, z] sobre 'ready'.
      high:     { drop: 0.06, back: 0.17, lean: 0.10, headUp: 0.0,  footW: 0.17, footF: 0.02, gunPitch: -0.5, gunYaw: 0.45, gunY: 0.0, gunZ: 0.12 },
      low:      { drop: 0.68, back: 0.17, lean: 1.25, headUp: -0.3, footW: 0.19, footF: 0.06, gunPitch: 0.3,  gunYaw: 0.4, gunY: 0.0, gunZ: 0.0 },
      peekHigh: { drop: 0.04, back: -0.12, lean: 0.0,  headUp: 0.0,  footW: 0.17, footF: 0.0,  gunPitch: 0.0,  gunYaw: 0.0, gunY: 0.0, gunZ: 0.0 },
      peekLow:  { drop: 0.16, back: 0.0,  lean: 0.1,  headUp: 0.0,  footW: 0.19, footF: 0.0,  gunPitch: 0.0,  gunYaw: 0.0, gunY: 0.0, gunZ: 0.0 },
      bodyBackZ: 0.17,          // z (marco de personaje, Idle) de la superficie de la espalda; lo que sobresalga (mochila…) se descuenta de `back`
      headComp: 0.3,            // fracción de la inclinación del tronco que la cabeza devuelve (mira al frente)
      peekShift: 0.32,          // m que se adelanta la cadera hacia el borde al asomarse en alta
      peekClear: 0.12,          // m mínimos de la boca del cañón sobre el borde al asomarse por encima (cobertura baja)
      peekLiftMax: 0.4,         // m máx. que se sube el cuerpo para cumplirlo (apuntando hacia abajo)
      peekRoll: 0.18,           // rad de inclinación lateral del tronco al asomarse en alta
      // Entrada: impacto y giro hasta quedar con la espalda a la pared (s desde la llegada)
      entry: { impactDrop: 0.10, impactTime: 0.28, squatStart: 0.05, squatTime: 0.38, turnStart: 0.08, turnTime: 0.32, handTime: 0.3, braceDist: 0.9 },
      // Desplazamiento lateral (paso de lado): amplitud de zancada, elevación y velocidad mínima para cadenciar
      step: { amp: 0.15, lift: 0.07, minSpeed: 0.12 },
      // SWAT y deslizamiento a la contigua (carrera agachada hacia la dirección de marcha)
      dash: {
        swat:  { drop: 0.40, lean: 0.70, amp: 0.34, lift: 0.15, footW: 0.13 },
        slide: { drop: 0.30, lean: 0.45, amp: 0.34, lift: 0.15, footW: 0.13 },
        headTurn: 25,           // 1/s: suavizado del rumbo
      },
      // Disparo a ciegas: arma por encima del borde (baja) o por el extremo (alta)
      blind: { lowLeanLess: 0.1, lowClear: 0.17, lowX: 0.15, wallZ: -0.28, highReach: 0.40, highShift: 0.03, highY: 1.28, pitch: 0.15 },
    },

    // locomoción (locomotion-animator): src/anim/locomotion/. Unidades m, s, rad.
    locomotion: {
      // Velocidad media (m/s) del pie apoyado de cada clip a ×1, medida con el tobillo en el suelo (la que
      // mide el núcleo subestima la del Run). La cadencia se deduce de aquí: cero patinaje.
      contactSpeed: { walk: 1.54, run: 3.65 },
      fade: { evade: 0.05, vault: 0.07, climb: 0.08, jump: 0.06 },   // s de crossfade de entrada (el rig usa 0.2 s)
      handLead: 0,              // s de adelanto de los puntos de agarre (0 es lo que menos error da: el hombro ya se filtra)
      lead: 0.065,              // s de adelanto de la pose en vault/trepar (compensa el suavizado de aditivos)
      blend: [1.75, 3.1],       // m/s: Walk puro hasta [0], Run puro desde [1]
      leanRun: 0.1,             // rad de inclinación extra del tronco a velocidad máxima de carrera
      // Arranque (inclina hacia delante) y frenada (contrapeso hacia atrás): ∝ (v − v filtrada)
      lean: { rate: 7, gain: 0.07, maxFwd: 0.2, maxBack: 0.22, headComp: 0.5 },
      // Inclinación lateral en curvas al correr: ∝ velocidad de giro × velocidad
      bank: { rate: 9, smooth: 12, gain: 0.032, max: 0.16, minSpeed: 1.6 },
      // Giro en el sitio con pasos (cuerpo quieto y yaw cambiando)
      turnSteps: { minRate: 1.3, maxRate: 4, maxSpeed: 0.45, stepSpeed: [0.45, 1.0] },
      crouch: { depth: -0.4, back: 0.11, lean: 0.32 },
      air: {
        stretchTime: 0.14,      // s de extensión al despegar
        tuckTime: 0.3,          // s hasta recoger las piernas
        fallRef: 8,             // m/s de caída para la pose de caída completa
      },
      land: {
        fade: 0.05,
        speeds: [3, 12],        // m/s de caída: aterrizaje suave → fuerte
        minImpact: 0.25,
        dip: [0.1, 0.4],        // m de bajada de cadera (suave, fuerte)
        down: 0.05,             // s hasta el punto más bajo
        recover: [0.14, 0.34],  // s totales de recuperación (suave, fuerte)
      },
      vault: { coverHeight: 1.0, span: 2.0, legLead: 0.1, handAhead: 0.62, hipsClear: 0.46, pitch: 1.15, tuckThigh: 2.0, tuckShin: -2.5 },
      climb: { height: 2.2, span: 0.9, reachHips: 0.22, bentHips: 0.42, handAhead: 0.5, handSide: 0.23 },
      evade: {
        delay: 0.0,             // fracción inicial antes de empezar a encogerse
        anticipate: 0.16,       // fracción de la maroma agachándose antes de girar
        roll: [0.2, 0.84],      // fracción de maroma en la que gira (de, a)
        hipsDrop: 0.42,         // m bajada de cadera en el giro
        extraTurns: 0,          // vueltas extra
        fwdLean: 0.35,          // rad de inclinación al salir
      },
      // Esqueleto Xbot medido en reposo (espacio de personaje, m): para llevar las manos a un punto.
      arm: {
        upper: 0.278, fore: 0.283, hipsY: 1.025, shoulderX: 0.152, shoulderY: 0.381,
        spineSeg: [0.101, 0.101, 0.092, 0.087],   // cadera→spine→spine1→spine2→hombro (alturas)
        pole: [0.55, -0.6, 0.45],                 // hacia dónde se dobla el codo (x hacia fuera)
        restU: { l: [-0.234, -0.972, 0.004], r: [0.202, -0.979, -0.022] },
        restF: { l: [-0.117, -0.975, -0.187], r: [0.167, -0.975, -0.145] },
      },
    },
  },

  // ── classes (gameplay-programmer; color: character-artist) — GDD §3 ──────
  classes: {
    // color/accessory: character-artist (ver cabecera de src/assets/models.js)
    medic:   { id: 'medic',   name: 'Médico',          color: 0x3fbf6f, accessory: 'medpack' },
    support: { id: 'support', name: 'Apoyo',           color: 0xf08419, accessory: 'ammo' },
    engineer:{ id: 'engineer',name: 'Ingeniero',       color: 0xf0c419, accessory: 'hardhat' },
    recon:   { id: 'recon',   name: 'Reconocimiento',  color: 0x2a4fa0, accessory: 'antenna' },
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
    reloadBarWidth: 220,      // px de referencia a 720p (escala con la ventana)
    ammoLowFraction: 0.25,
    lowHpFraction: 0.3,       // barra de vida en rojo pulsante por debajo de esta fracción
    reloadResultHold: 0.45,   // s que sigue visible el resultado de la recarga activa tras terminar
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
    // Trazadoras (cinta orientada a cámara, InstancedMesh)
    tracerWidth: 0.05,        // m
    tracerMaxDist: 80,        // m, si el payload no trae `end`
    tracerColor: 0xffc070,
    // Fogonazo + destellos (billboards aditivos, InstancedMesh) y luz compartida
    flashPool: 32,
    muzzleSize: 0.45,         // m
    muzzleMinFrames: 2,       // frames visibles como mínimo
    muzzleColor: 0xffb050,
    muzzleLightIntensity: 6,
    muzzleLightDistance: 7,   // m
    muzzleLightTime: 0.06,    // s
    impactFlashSize: 0.3,     // m
    // Chispas (Points, buffer fijo)
    sparkPool: 256,
    sparkSize: 0.07,          // m
    sparkSpeed: 5.5,          // m/s
    sparkLife: 0.35,          // s (±30 %)
    sparkGravity: 14,         // m/s²
    sparkDrag: 3,             // 1/s
    sparkColor: 0xffd27a,
    meleeSparkColor: 0xffffff,
    // Marcas de impacto (pool circular de quads)
    decalPool: 64,
    decalSize: 0.16,          // m
    decalLife: 14,            // s (se encogen el último segundo)
    // Recarga activa perfecta
    activeReloadColor: 0x9fd8ff,
    activeReloadSize: 0.7,    // m
    activeReloadHeight: 1.3,  // m sobre los pies si el payload no trae pos
  },
};

export default config;
