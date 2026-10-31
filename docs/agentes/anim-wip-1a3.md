# WIP de animación 1a.3 (aparcado)

Trabajo parcial del `animation-engineer` sobre la pose de cobertura alta / agarre de manos y D1–D3,
interrumpido y fuera del alcance reducido de la 1a.3. Se retoma en otro entorno.
Aplicar con `git apply docs/agentes/anim-wip-1a3.patch` (src/anim/core/characterRig.js,
src/anim/cover/poses.js, src/anim/locomotion/evade.js). Sin revisar ni probar.

Además, en src/core/config.js (sección anim) el WIP usaba:
  footMinY: 0.075  (rig.groundFeet)
  cover high: gunPitch -0.5, gunYaw 0.45, gunY 0, gunZ 0.12 · low: gunYaw 0.4, gunZ 0 · peek*: gunZ 0
