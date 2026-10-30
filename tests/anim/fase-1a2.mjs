// Captura visual y métricas de la Fase 1a.2 (animation-reviewer). Uso: node build.js --debug && node tests/anim/fase-1a2.mjs
import { launch, openGame, waitFor } from '../e2e/lib.mjs';
import { writeFileSync } from 'node:fs';
const OUT = new URL('../../docs/qa/animacion/fase-1a2/', import.meta.url).pathname;
const b = await launch();
const { page, logs } = await openGame(b);
const E = (fn, a) => page.evaluate(fn, a);
const adv = (ms) => E((ms) => window.__adv(ms), ms);
const st = () => E(() => window.__game.playerState());
const press = async (k, ms = 80) => { await E((k) => window.__pad.down(k), k); await adv(ms); await E((k) => window.__pad.up(k), k); };
const stick = (w, x, y) => E(([w, x, y]) => window.__pad.stick(w, x, y), [w, x, y]);
const trigger = (w, v) => E(([w, v]) => window.__pad.trigger(w, v), [w, v]);
const tp = async (x, z, yaw) => { await E(() => window.__pad.reset()); await E(([x, z, y]) => window.__game.teleport(x, z, y), [x, z, yaw]); await adv(200); };
await E(() => window.__pad.press('A', 300)); await new Promise(r => setTimeout(r, 2500));
if ((await E(() => window.__game.state)) !== 'playing') await E(() => window.__game.events.emit('menu:start', { classId: 'medic', difficulty: 'normal' }));
await waitFor(page, () => window.__game.player && window.__game.state === 'playing', { timeout: 15000 });
await E(() => {
  const g = window.__game; g.loop.stop(); const dt = g.loop.fixedDt;
  window.__adv = (ms) => { const n = Math.max(1, Math.round(ms / 1000 / dt)); for (let i = 0; i < n; i++) { g.loop.stepN(1); for (const s of g.systems) if (s.update && (g.state === 'playing' || s.alwaysRun)) s.update(dt, 1); } };
  window.__samples = [];
  const V = (o) => { const v = new g.player.pos.constructor(); o.getWorldPosition(v); return v; };
  window.__sample = () => {
    const rig = g.anim.rigOf(g.player); const p = g.player.pos;
    const bp = (n) => { const v = V(rig.bones[rig.boneIndex[n]]); return [v.x, v.y, v.z]; };
    const w = rig.weapon; const wp = (o) => { if (!o) return null; const v = V(o); return [v.x, v.y, v.z]; };
    return { t: performance.now(), body: rig.state, up: rig.upper, pos: [p.x, p.y, p.z], lF: bp('lFoot'), rF: bp('rFoot'), lH: bp('lHand'), rH: bp('rHand'), head: bp('head'), hips: bp('hips'),
      grip: w ? wp(w.grip) : null, sup: w ? wp(w.support) : null, muz: w ? wp(w.muzzle) : null, bones: rig.bones.map(o => { const v = new g.player.pos.constructor(); o.getWorldPosition(v); return [v.x, v.y, v.z]; }) };
  };
});
const rec = async (n, stepMs = 17) => { const a = []; for (let i = 0; i < n; i++) { await adv(stepMs); a.push(await E(() => window.__sample())); } return a; };
const shot = async (name, view='side') => { await E((view) => { const g = window.__game; const p = g.player.pos, y = g.player.yaw;
  if (!window.__cam) window.__cam = new g.camera.constructor(55, innerWidth/innerHeight, 0.1, 200);
  const c = view==='game' ? g.camera : window.__cam;
  if (view!=='game') { const f=[-Math.sin(y),-Math.cos(y)], r=[Math.cos(y),-Math.sin(y)]; const d = view==='side'?[r[0]*3.2,r[1]*3.2]:[f[0]*3.2,f[1]*3.2];
    c.position.set(p.x+d[0], p.y+1.1, p.z+d[1]); c.lookAt(p.x, p.y+0.95, p.z); c.updateMatrixWorld(true); }
  g.renderer.render(g.scene, c); }, view); await page.screenshot({ path: OUT + name + '.png' }); };
const R = {};
await adv(300);
// camera: lateral relativa al yaw del jugador
const side = (yawOff = Math.PI / 2, pitch = 0.1) => E(([o, p]) => { const g = window.__game; g.setCamera(g.player.yaw + o, p); }, [yawOff, pitch]);

// --- Idle
await tp(0.65, 14, 0); await adv(500); await shot('loc-idle');
// --- Run 4.14
await stick('LS', 0, 1); await adv(700); R.run = await rec(120); await shot('loc-run'); await shot('loc-run-frontal','front'); await shot('loc-run-juego','game'); 
await E(() => window.__pad.stick('LS', 0, 0.45)); await adv(600); R.walk = await rec(90); await shot('loc-walk');
await stick('LS', 0, 0.75); await adv(600); R.jog = await rec(90); await shot('loc-jog');
await stick('LS', 0, 0); await adv(400);
// strafe
await stick('LS', 1, 0); await adv(600); R.strafe = await rec(60); await shot('loc-strafe'); await stick('LS', 0, 0); await adv(300);
// --- Crouch? find binding
R.crouchInfo = await E(() => { const r = window.__game.anim.rigOf(window.__game.player); return Object.keys(r.params||{}); });
// --- Jump
await tp(-5, 5, 0); await press('Y'); R.jump = await rec(70, 17);
await shot('loc-jump-air');
// --- Vault
await tp(8.4, 14, -Math.PI / 2); await press('Y'); R.vault = []; 
for (let i=0;i<50;i++){ await adv(17); R.vault.push(await E(()=>window.__sample())); if (i===14) await shot('loc-vault'); }
await adv(800);
await tp(12.2, 14, -Math.PI / 2); await press('Y'); R.climb = [];
for (let i=0;i<90;i++){ await adv(17); R.climb.push(await E(()=>window.__sample())); if (i===30) await shot('loc-climb'); }
await adv(800);
// --- Evade
await tp(-5, 5, Math.PI / 2); await stick('LS', 0, 1); await adv(150); await press('A'); R.evade = [];
for (let i=0;i<40;i++){ await adv(17); R.evade.push(await E(()=>window.__sample())); if (i===10) await shot('loc-evade'); }
await stick('LS', 0, 0); await adv(800);
// --- Cover medio
const enter = async (x, z) => { await tp(x, z, 0); await stick('LS', 0, 1); await adv(80); await press('A'); await adv(50); await stick('LS', 0, 0); for (let i=0;i<120;i++){ if ((await st()).mode==='cover') break; await adv(17);} await adv(500); };
await tp(-5.45, 11.5, 0); await stick('LS', 0, 1); await adv(80); await press('A'); await adv(50); await stick('LS', 0, 0); R.coverEnter = []; for (let i=0;i<40;i++){ await adv(17); R.coverEnter.push(await E(()=>window.__sample())); if (i===12) await shot('cov-entrada'); }
await adv(500); R.coverLow = await rec(30); await shot('cov-media'); await shot('cov-media-juego','game');
await shot('cov-media-frontal','front'); await shot('cov-media-juego','game');
await trigger('LT', 1); await adv(500); R.peekLow = await rec(20); await shot('cov-media-asomar'); await trigger('LT', 0); await adv(300);
await stick('LS', 1, 0); await adv(300); R.coverSlide = await rec(80); await shot('cov-lateral'); await adv(1000); await stick('LS', 0, 0);
await press('A'); await adv(100); R.swat = [];  for (let i=0;i<60;i++){ await adv(17); R.swat.push(await E(()=>window.__sample())); if (i===25) await shot('cov-swat'); }
await adv(800);
// alta
await enter(2.75, 11.5); R.coverHigh = await rec(30); await shot('cov-alta'); await shot('cov-alta-frontal','front');
await stick('LS', -1, 0); await adv(1500); await stick('LS', 0, 0); await trigger('LT', 1); await adv(500); R.peekHigh = await rec(20); await shot('cov-alta-asomar'); await trigger('LT', 0); await adv(300);
R.coverState = await st();
// --- Armas
await tp(0.65, 14, 0); await adv(300);
await trigger('LT', 1); await adv(400); R.aim = await rec(20); await shot('arm-apuntar-rifle'); await shot('arm-apuntar-rifle-juego','game');
await trigger('RT', 1); await adv(150); R.fire = await rec(30); await shot('arm-disparo'); await trigger('RT', 0); await trigger('LT', 0); await adv(300);
await E(() => window.__game.combat.setAmmo(10, 200, 'assaultRifle'));
await press('RB'); R.reload = []; for (let i=0;i<60;i++){ await adv(34); R.reload.push(await E(()=>window.__sample())); if (i===20) await shot('arm-recarga-rifle'); }
await adv(2000);
await E(() => window.__game.combat.setAmmo(10, 200, 'assaultRifle'));
await press('RB'); await adv(50);
const w = await E(() => { const w = window.__game.player.weapon; return [...w.activeWindow]; });
const mid = (w[0]+w[1])/2;
for (let i=0;i<400;i++){ const f = await E(()=>{const w=window.__game.player.weapon;return w.reloadT/w.reloadDur;}); if (f>=mid-0.01) break; await adv(17);}
await press('RB', 50); R.perfect = await rec(30,34); await shot('arm-recarga-perfecta'); await adv(2000);
// fallida: pulsar RB muy pronto
await E(() => window.__game.combat.setAmmo(10, 200, 'assaultRifle'));
await E(() => { window.__ev=[]; window.__game.events.on('weapon:activeReload', p=>window.__ev.push(p.result)); });
await press('RB'); await adv(50); await adv(100); await press('RB', 50); R.failEv = await E(()=>window.__ev); R.fail = await rec(30,34); await shot('arm-recarga-fallida'); await adv(2500);
await press('B'); R.meleeRifle = []; for (let i=0;i<40;i++){ await adv(17); R.meleeRifle.push(await E(()=>window.__sample())); if (i===8) await shot('arm-melee-rifle'); } await adv(600);
await press('Down'); R.swapDown = []; for (let i=0;i<40;i++){ await adv(17); R.swapDown.push(await E(()=>window.__sample())); if (i===10) await shot('arm-cambio-pistola'); } await adv(500);
await trigger('LT', 1); await adv(400); R.aimPistol = await rec(10); await shot('arm-apuntar-pistola'); await trigger('LT', 0); await adv(200);
await press('B'); R.meleePistol = []; for (let i=0;i<40;i++){ await adv(17); R.meleePistol.push(await E(()=>window.__sample())); if (i===8) await shot('arm-melee-pistola'); } await adv(600);
await press('Left'); R.swapLeft = await rec(30); await adv(500); R.weaponAfter = await E(()=>window.__game.player.weapon.id);
R.errors = logs.errors.map(e=>e.text.slice(0,200)); R.warnings = logs.warnings.map(e=>e.text.slice(0,200));
writeFileSync(OUT + 'datos.json', JSON.stringify(R));
console.log('done', R.errors, R.warnings.slice(0,5), R.failEv, R.weaponAfter);
await b.close();
