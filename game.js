import * as THREE from 'three';

const canvas = document.querySelector('#game-canvas');
const scoreNode = document.querySelector('#score');
const speedNode = document.querySelector('#speed');
const healthBar = document.querySelector('#health-bar');
const startScreen = document.querySelector('#start-screen');
const pauseScreen = document.querySelector('#pause-screen');
const gameoverScreen = document.querySelector('#gameover-screen');
const finalScoreNode = document.querySelector('#final-score');
const statusNode = document.querySelector('#status');
const startButton = document.querySelector('#start-button');
const resumeButton = document.querySelector('#resume-button');
const restartButton = document.querySelector('#restart-button');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080017, 0.018);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 140);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x080017);

const world = new THREE.Group();
scene.add(world);

const hemi = new THREE.HemisphereLight(0xa855f7, 0x06162f, 2.3);
scene.add(hemi);
const pulseLight = new THREE.PointLight(0x46e6ff, 6, 34, 2);
pulseLight.position.set(0, 0, 3);
scene.add(pulseLight);
const magentaLight = new THREE.PointLight(0xff4fa3, 5, 32, 2);
magentaLight.position.set(0, 0, -10);
scene.add(magentaLight);

const TUNNEL_RADIUS = 9.7;
const PLAYER_RADIUS = 7.25;
const WORLD_SPEED = 17;
const keys = new Set();
const clock = new THREE.Clock();

let state = 'menu';
let score = 0;
let health = 100;
let playerAngle = 0;
let playerAngularVelocity = 0;
let fireCooldown = 0;
let spawnTimer = 0;
let elapsed = 0;
let shake = 0;
let lastTime = 0;

const projectiles = [];
const hazards = [];
const tunnelRings = [];
const stars = [];

const player = new THREE.Group();
const playerCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(.42, 1),
  new THREE.MeshStandardMaterial({ color: 0xeef8ff, emissive: 0x46e6ff, emissiveIntensity: 4, roughness: .18, metalness: .75 })
);
const playerHalo = new THREE.Mesh(
  new THREE.TorusGeometry(.68, .07, 8, 24),
  new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: .9 })
);
playerHalo.rotation.x = Math.PI / 2;
player.add(playerCore, playerHalo);
scene.add(player);

function makeTunnel() {
  const geometry = new THREE.TorusGeometry(TUNNEL_RADIUS, .09, 8, 44);
  for (let i = 0; i < 28; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0xff4fa3 : i % 2 ? 0x46e6ff : 0xa855f7,
      transparent: true,
      opacity: .24
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.position.z = -i * 5.2;
    ring.rotation.z = i * .31;
    ring.userData.phase = i * .73;
    tunnelRings.push(ring);
    world.add(ring);
  }
}

function makeStars() {
  const geometry = new THREE.SphereGeometry(.027, 5, 5);
  const material = new THREE.MeshBasicMaterial({ color: 0xd9f7ff, transparent: true, opacity: .72 });
  for (let i = 0; i < 240; i += 1) {
    const star = new THREE.Mesh(geometry, material);
    resetStar(star, true);
    stars.push(star);
    world.add(star);
  }
}

function resetStar(star, initial = false) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 2 + Math.random() * 13;
  star.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, initial ? -Math.random() * 130 : -125 - Math.random() * 20);
}

function positionOnTunnel(object, angle, radius = PLAYER_RADIUS) {
  object.position.x = Math.cos(angle) * radius;
  object.position.y = Math.sin(angle) * radius;
}

function createBarrier() {
  const angle = Math.random() * Math.PI * 2;
  const width = .3 + Math.random() * .26;
  const geometry = new THREE.BoxGeometry(2.1, .62, .44);
  const material = new THREE.MeshStandardMaterial({ color: 0xff3d9a, emissive: 0x79003f, emissiveIntensity: 2, roughness: .25, metalness: .7 });
  const mesh = new THREE.Mesh(geometry, material);
  const radius = TUNNEL_RADIUS - .72;
  positionOnTunnel(mesh, angle, radius);
  mesh.position.z = -105;
  mesh.rotation.z = angle + Math.PI / 2;
  mesh.userData = { type: 'barrier', angle, angularWidth: width, radius, drift: (Math.random() - .5) * .3, spin: (Math.random() - .5) * 2.2, hitRadius: 1.2 };
  world.add(mesh);
  hazards.push(mesh);
}

function createEye() {
  const angle = Math.random() * Math.PI * 2;
  const group = new THREE.Group();
  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(.68, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0x8cf9ff, emissive: 0x046a98, emissiveIntensity: 3.6, roughness: .18, metalness: .35 })
  );
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(.22, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0x17001d })
  );
  pupil.position.z = .58;
  group.add(iris, pupil);
  const radius = TUNNEL_RADIUS - 1.45;
  positionOnTunnel(group, angle, radius);
  group.position.z = -108;
  group.rotation.z = angle - Math.PI / 2;
  group.userData = { type: 'eye', angle, angularWidth: .2, radius, hp: 2, pulse: Math.random() * 8, hitRadius: .9, value: 250 };
  world.add(group);
  hazards.push(group);
}

function createBlock() {
  const angle = Math.random() * Math.PI * 2;
  const geometry = new THREE.DodecahedronGeometry(.82, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x3a0764, emissiveIntensity: 2.2, roughness: .12, metalness: .75 });
  const mesh = new THREE.Mesh(geometry, material);
  const radius = TUNNEL_RADIUS - 1.3;
  positionOnTunnel(mesh, angle, radius);
  mesh.position.z = -102;
  mesh.userData = { type: 'block', angle, angularWidth: .16, radius, drift: (Math.random() > .5 ? 1 : -1) * (.25 + Math.random() * .4), hitRadius: .92 };
  world.add(mesh);
  hazards.push(mesh);
}

function spawnHazard() {
  const roll = Math.random();
  if (roll < .45) createBarrier();
  else if (roll < .75) createBlock();
  else createEye();
}

function fire() {
  if (state !== 'playing' || fireCooldown > 0) return;
  fireCooldown = .17;
  const geometry = new THREE.SphereGeometry(.14, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color: 0xd8ffff });
  const shot = new THREE.Mesh(geometry, material);
  shot.position.copy(player.position);
  shot.position.z = -.45;
  shot.userData = { life: 2.2 };
  projectiles.push(shot);
  scene.add(shot);
  pulseLight.intensity = 10;
}

function removeEntity(entity, list) {
  entity.parent?.remove(entity);
  const index = list.indexOf(entity);
  if (index >= 0) list.splice(index, 1);
}

function blast(position, color = 0x46e6ff, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(.045 + Math.random() * .06, 5, 5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    particle.position.copy(position);
    particle.userData = { velocity: new THREE.Vector3((Math.random() - .5) * 8, (Math.random() - .5) * 8, (Math.random() - .5) * 6), life: .4 + Math.random() * .4 };
    scene.add(particle);
    projectiles.push(particle);
  }
}

function damage(amount) {
  health = Math.max(0, health - amount);
  healthBar.style.width = `${health}%`;
  healthBar.style.background = health > 40 ? 'linear-gradient(90deg, #46e6ff, #c4ff51, #ff4fa3)' : 'linear-gradient(90deg, #ffcc4d, #ff3d70)';
  shake = .36;
  blast(player.position, 0xff4fa3, 18);
  if (health <= 0) endGame();
}

function updatePlayer(dt) {
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  const desired = (right ? -1 : 0) + (left ? 1 : 0);
  playerAngularVelocity = THREE.MathUtils.damp(playerAngularVelocity, desired * 3.4, 10, dt);
  playerAngle += playerAngularVelocity * dt;
  positionOnTunnel(player, playerAngle);
  player.position.z = .6;
  player.rotation.z = playerAngle - Math.PI / 2;
  player.rotation.x = Math.sin(elapsed * 4) * .09;
  playerHalo.rotation.z += dt * 3;
  playerCore.rotation.y += dt * 2.2;

  const cameraRadius = 1.1;
  camera.position.x = Math.cos(playerAngle) * cameraRadius;
  camera.position.y = Math.sin(playerAngle) * cameraRadius;
  camera.position.z = 4.8;
  camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, playerAngle - Math.PI / 2, 5, dt);
  camera.lookAt(0, 0, -23);
  camera.rotateZ(playerAngle - Math.PI / 2);
}

function updateTunnel(dt, speed) {
  for (const ring of tunnelRings) {
    ring.position.z += speed * dt;
    ring.rotation.z += dt * (.24 + Math.sin(elapsed + ring.userData.phase) * .07);
    ring.scale.setScalar(1 + Math.sin(elapsed * 2 + ring.userData.phase) * .045);
    if (ring.position.z > 9) ring.position.z -= 145.6;
  }
  for (const star of stars) {
    star.position.z += speed * dt * 1.2;
    if (star.position.z > 6) resetStar(star);
  }
}

function updateHazards(dt, speed) {
  for (const hazard of [...hazards]) {
    const data = hazard.userData;
    hazard.position.z += speed * dt;
    if (data.type === 'barrier' || data.type === 'block') {
      data.angle += (data.drift || 0) * dt;
      positionOnTunnel(hazard, data.angle, data.radius);
      hazard.rotation.z = data.angle + (data.type === 'barrier' ? Math.PI / 2 : 0);
      hazard.rotation.x += (data.spin || .8) * dt;
      hazard.rotation.y += .8 * dt;
    } else {
      hazard.scale.setScalar(1 + Math.sin(elapsed * 5 + data.pulse) * .14);
      hazard.rotation.y += dt * 1.2;
    }

    if (hazard.position.z > 6) {
      removeEntity(hazard, hazards);
      continue;
    }

    const angularDistance = Math.abs(Math.atan2(Math.sin(playerAngle - data.angle), Math.cos(playerAngle - data.angle)));
    if (hazard.position.z > -.8 && hazard.position.z < 2.1 && angularDistance < data.angularWidth + .15) {
      damage(data.type === 'barrier' ? 32 : 21);
      removeEntity(hazard, hazards);
    }
  }
}

function updateProjectiles(dt) {
  for (const projectile of [...projectiles]) {
    const data = projectile.userData;
    if (data.velocity) {
      projectile.position.addScaledVector(data.velocity, dt);
      data.life -= dt;
      projectile.material.opacity = Math.max(0, data.life * 1.5);
      if (data.life <= 0) removeEntity(projectile, projectiles);
      continue;
    }

    projectile.position.z -= 58 * dt;
    data.life -= dt;
    if (data.life <= 0) {
      removeEntity(projectile, projectiles);
      continue;
    }

    for (const hazard of [...hazards]) {
      if (hazard.userData.type !== 'eye') continue;
      if (projectile.position.distanceTo(hazard.position) < hazard.userData.hitRadius) {
        hazard.userData.hp -= 1;
        removeEntity(projectile, projectiles);
        pulseLight.intensity = 8;
        if (hazard.userData.hp <= 0) {
          score += hazard.userData.value;
          blast(hazard.position, 0x8cf9ff, 17);
          removeEntity(hazard, hazards);
        }
        break;
      }
    }
  }
}

function updateHud(speed) {
  scoreNode.textContent = Math.floor(score).toString().padStart(6, '0');
  speedNode.textContent = `${(speed / WORLD_SPEED).toFixed(1)}×`;
}

function clearGameObjects() {
  for (const item of [...hazards]) removeEntity(item, hazards);
  for (const item of [...projectiles]) removeEntity(item, projectiles);
}

function beginGame() {
  clearGameObjects();
  score = 0;
  health = 100;
  playerAngle = 0;
  playerAngularVelocity = 0;
  elapsed = 0;
  spawnTimer = .8;
  healthBar.style.width = '100%';
  healthBar.style.background = 'linear-gradient(90deg, #46e6ff, #c4ff51, #ff4fa3)';
  state = 'playing';
  startScreen.classList.remove('active');
  gameoverScreen.classList.remove('active');
  pauseScreen.classList.remove('active');
  statusNode.textContent = 'КОРИДОР НЕСТАБИЛЕН';
}

function endGame() {
  state = 'gameover';
  finalScoreNode.textContent = Math.floor(score).toString().padStart(6, '0');
  gameoverScreen.classList.add('active');
  statusNode.textContent = 'СИГНАЛ ОБОРВАН';
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    pauseScreen.classList.add('active');
    statusNode.textContent = 'ВРЕМЯ ЗАФИКСИРОВАНО';
  } else if (state === 'paused') {
    state = 'playing';
    pauseScreen.classList.remove('active');
    statusNode.textContent = 'КОРИДОР НЕСТАБИЛЕН';
  }
}

function animate(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, .05);
  lastTime = time;
  const ambientSpeed = state === 'playing' ? WORLD_SPEED * (1 + Math.min(elapsed / 90, .95)) : 2.6;

  if (state === 'playing') {
    elapsed += dt;
    score += dt * 42 * (ambientSpeed / WORLD_SPEED);
    fireCooldown = Math.max(0, fireCooldown - dt);
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnHazard();
      spawnTimer = Math.max(.4, 1.24 - elapsed * .007) + Math.random() * .5;
    }
    updatePlayer(dt);
    updateHazards(dt, ambientSpeed);
    updateProjectiles(dt);
    updateHud(ambientSpeed);
  } else {
    updateTunnel(dt, ambientSpeed);
    playerHalo.rotation.z += dt * .5;
  }

  updateTunnel(dt, ambientSpeed);
  pulseLight.intensity = THREE.MathUtils.damp(pulseLight.intensity, 5.5, 5, dt);
  pulseLight.color.setHSL(.51 + Math.sin(time * .001) * .05, .95, .62);
  if (shake > 0) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
    shake = Math.max(0, shake - dt * 1.5);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Space') fire();
  if (event.code === 'KeyP' && !event.repeat) togglePause();
  if (event.code === 'KeyR' && state === 'gameover') beginGame();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('pointerdown', () => fire());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startButton.addEventListener('click', beginGame);
resumeButton.addEventListener('click', togglePause);
restartButton.addEventListener('click', beginGame);

makeTunnel();
makeStars();
positionOnTunnel(player, playerAngle);
statusNode.textContent = 'ОЖИДАНИЕ ВХОДА';
requestAnimationFrame(animate);
