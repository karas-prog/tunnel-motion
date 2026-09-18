import * as THREE from 'three';

const canvas = document.querySelector('#game-canvas');
const scoreNode = document.querySelector('#score');
const speedNode = document.querySelector('#speed');
const healthBar = document.querySelector('#health-bar');
const coinCountNode = document.querySelector('#coin-count');
const levelNode = document.querySelector('#level');
const levelBanner = document.querySelector('#level-banner');
const levelBannerValue = document.querySelector('#level-banner-value');
const startScreen = document.querySelector('#start-screen');
const pauseScreen = document.querySelector('#pause-screen');
const gameoverScreen = document.querySelector('#gameover-screen');
const finalScoreNode = document.querySelector('#final-score');
const statusNode = document.querySelector('#status');
const startButton = document.querySelector('#start-button');
const resumeButton = document.querySelector('#resume-button');
const restartButton = document.querySelector('#restart-button');
const shipIcon = document.querySelector('#ship-icon');
const shipMuzzle = document.querySelector('#ship-muzzle');
const shipCollectRing = document.querySelector('#ship-collect-ring');

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
const COINS_PER_LEVEL = 10;
const SHIP_BASE_RADIUS = 46;
const keys = new Set();

let state = 'menu';
let score = 0;
let health = 100;
let playerAngle = 0;
let playerAngularVelocity = 0;
let fireCooldown = 0;
let spawnTimer = 0;
let coinTimer = 0;
let elapsed = 0;
let shake = 0;
let lastTime = 0;
let shipFlash = 0;
let collectFlash = 0;
let shipMuzzleFlash = 0;
let shipCollectPulse = 0;
let coinsCollected = 0;
let level = 1;
let levelSpeedBoost = 1;

const projectiles = [];
const hazards = [];
const coins = [];
const tunnelRings = [];
const stars = [];

// Игровой корабль-коллектор: летит вперёд, собирает монеты и стреляет по кляксам.
const player = new THREE.Group();
const shipBody = new THREE.Mesh(
  new THREE.ConeGeometry(.34, .95, 8),
  new THREE.MeshStandardMaterial({ color: 0xeef8ff, emissive: 0x46e6ff, emissiveIntensity: 3.6, roughness: .16, metalness: .8 })
);
shipBody.rotation.x = Math.PI / 2;
const shipFin = new THREE.Mesh(
  new THREE.TorusGeometry(.5, .05, 8, 20),
  new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: .92 })
);
shipFin.rotation.x = Math.PI / 2;
shipFin.position.z = .18;
const collectorRing = new THREE.Mesh(
  new THREE.TorusGeometry(.82, .035, 6, 26),
  new THREE.MeshBasicMaterial({ color: 0xc4ff51, transparent: true, opacity: .55 })
);
collectorRing.rotation.x = Math.PI / 2;
// Дуло-вспышка на носу 3D-корабля: невидима по умолчанию, вспыхивает синхронно с выстрелом.
const shipMuzzleFlare = new THREE.Mesh(
  new THREE.ConeGeometry(.22, .5, 10),
  new THREE.MeshBasicMaterial({ color: 0xd8ffff, transparent: true, opacity: 0 })
);
shipMuzzleFlare.rotation.x = -Math.PI / 2;
shipMuzzleFlare.position.z = -.62;
const shipMuzzleLight = new THREE.PointLight(0xd8ffff, 0, 6, 2);
shipMuzzleLight.position.z = -.7;
player.add(shipBody, shipFin, collectorRing, shipMuzzleFlare, shipMuzzleLight);
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

// Барьер: разрушаемое препятствие, требует одного попадания.
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
  mesh.userData = { type: 'barrier', angle, angularWidth: width, radius, drift: (Math.random() - .5) * .3, spin: (Math.random() - .5) * 2.2, hitRadius: 1.2, hp: 1, value: 40 };
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

// Многогранник: разрушаемое препятствие, требует двух попаданий.
function createBlock() {
  const angle = Math.random() * Math.PI * 2;
  const geometry = new THREE.DodecahedronGeometry(.82, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x3a0764, emissiveIntensity: 2.2, roughness: .12, metalness: .75 });
  const mesh = new THREE.Mesh(geometry, material);
  const radius = TUNNEL_RADIUS - 1.3;
  positionOnTunnel(mesh, angle, radius);
  mesh.position.z = -102;
  mesh.userData = { type: 'block', angle, angularWidth: .16, radius, drift: (Math.random() > .5 ? 1 : -1) * (.25 + Math.random() * .4), hitRadius: .92, hp: 2, value: 90 };
  world.add(mesh);
  hazards.push(mesh);
}

// Бесформенная клякса: деформированная сфера со случайным шумом вершин и органическим покачиванием.
function createBlob() {
  const angle = Math.random() * Math.PI * 2;
  const geometry = new THREE.IcosahedronGeometry(.62, 2);
  const positionAttr = geometry.attributes.position;
  const noise = [];
  for (let i = 0; i < positionAttr.count; i += 1) {
    const vertex = new THREE.Vector3().fromBufferAttribute(positionAttr, i);
    const offset = .82 + Math.random() * .4;
    vertex.normalize().multiplyScalar(offset);
    positionAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    noise.push(.5 + Math.random());
  }
  geometry.computeVertexNormals();
  const palette = [0x39ff8c, 0xff5d3d, 0xffe14d, 0x6bffe0];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: .55, metalness: .05, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  const basePositions = positionAttr.array.slice();
  const radius = TUNNEL_RADIUS - (1.1 + Math.random() * .9);
  positionOnTunnel(mesh, angle, radius);
  mesh.position.z = -110;
  mesh.userData = {
    type: 'blob', angle, angularWidth: .22, radius, hp: 2, value: 180,
    drift: (Math.random() - .5) * .5, wobble: Math.random() * 10, hitRadius: .95,
    basePositions, noise
  };
  world.add(mesh);
  hazards.push(mesh);
}

function spawnHazard() {
  const roll = Math.random();
  if (roll < .3) createBarrier();
  else if (roll < .5) createBlock();
  else if (roll < .72) createEye();
  else createBlob();
}

// Собираемая монета: вращающийся сияющий диск, притягивающийся к кораблю в радиусе коллектора.
function createCoin() {
  const angle = Math.random() * Math.PI * 2;
  const geometry = new THREE.TorusGeometry(.26, .09, 8, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xffb100, emissiveIntensity: 2.4, roughness: .2, metalness: .85 });
  const mesh = new THREE.Mesh(geometry, material);
  const radius = TUNNEL_RADIUS - (.9 + Math.random() * 1.6);
  positionOnTunnel(mesh, angle, radius);
  mesh.position.z = -115;
  mesh.userData = { type: 'coin', angle, radius, value: 60, magnetized: false };
  world.add(mesh);
  coins.push(mesh);
}

// Выстрел: создаёт снаряд и включает вспышку на носу и 3D-модели, и HUD-иконки.
function fire() {
  if (state !== 'playing' || fireCooldown > 0) return;
  fireCooldown = .17;
  shipFlash = .18;
  shipMuzzleFlash = .16;
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

// Обработка сбора монеты: увеличивает счёт очков и прогресс до следующего уровня, запускает пульс коллектора.
function collectCoin(value) {
  score += value;
  coinsCollected += 1;
  collectFlash = .32;
  shipCollectPulse = .32;
  if (coinsCollected >= COINS_PER_LEVEL) {
    coinsCollected -= COINS_PER_LEVEL;
    levelUp();
  }
  updateCoinHud();
}

function levelUp() {
  level += 1;
  levelSpeedBoost = 1 + (level - 1) * .12;
  levelNode.textContent = level.toString();
  levelBannerValue.textContent = level.toString();
  health = Math.min(100, health + 15);
  healthBar.style.width = `${health}%`;
  levelBanner.classList.remove('show');
  void levelBanner.offsetWidth;
  levelBanner.classList.add('show');
}

function updateCoinHud() {
  coinCountNode.textContent = `${coinsCollected} / ${COINS_PER_LEVEL}`;
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
  shipBody.rotation.y += dt * 1.6;

  // Вспышка дула на 3D-модели: конус растёт и гаснет, точечный свет усиливает эффект попадания.
  shipMuzzleFlash = Math.max(0, shipMuzzleFlash - dt);
  const muzzleT = shipMuzzleFlash / .16;
  shipMuzzleFlare.material.opacity = muzzleT;
  shipMuzzleFlare.scale.setScalar(.6 + muzzleT * 1.1);
  shipMuzzleLight.intensity = muzzleT * 4;

  // Пульс коллекторного кольца на 3D-модели при сборе монеты: резкое расширение и яркая вспышка.
  shipCollectPulse = Math.max(0, shipCollectPulse - dt);
  const collectT = shipCollectPulse / .32;
  collectorRing.scale.setScalar(1 + collectT * .9);
  collectorRing.material.opacity = .55 + collectT * .45;
  collectorRing.rotation.z += dt * (3 + collectT * 10);

  const cameraRadius = 1.1;
  camera.position.x = Math.cos(playerAngle) * cameraRadius;
  camera.position.y = Math.sin(playerAngle) * cameraRadius;
  camera.position.z = 4.8;
  camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, playerAngle - Math.PI / 2, 5, dt);
  camera.lookAt(0, 0, -23);
  camera.rotateZ(playerAngle - Math.PI / 2);
}

// Обновление 2D-иконки корабля внизу экрана: наклон, выстрел из носа и вспышка сбора монет.
function updateShipIcon(dt) {
  if (!shipIcon) return;
  const tilt = THREE.MathUtils.clamp(-playerAngularVelocity * 9, -32, 32);
  const bob = state === 'playing' ? Math.sin(elapsed * 5) * 3 : Math.sin(elapsed * 1.4) * 2;
  shipIcon.style.transform = `translateY(${bob}px) rotate(${tilt}deg)`;

  shipFlash = Math.max(0, shipFlash - dt);
  const glow = 12 + shipFlash * 40;
  shipIcon.style.filter = `drop-shadow(0 0 ${glow}px rgba(70, 230, 255, .85)) drop-shadow(0 0 22px rgba(255, 79, 163, .35))`;
  if (shipMuzzle) shipMuzzle.style.opacity = shipFlash > 0 ? Math.min(1, shipFlash * 6).toString() : '0';

  collectFlash = Math.max(0, collectFlash - dt);
  if (shipCollectRing) {
    const progress = 1 - collectFlash / .32;
    shipCollectRing.style.opacity = collectFlash > 0 ? (1 - progress).toString() : '0';
    shipCollectRing.setAttribute('r', (SHIP_BASE_RADIUS + progress * 22).toString());
    shipCollectRing.setAttribute('stroke-width', (4 - progress * 3).toString());
  }
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
    } else if (data.type === 'blob') {
      data.angle += (data.drift || 0) * dt;
      positionOnTunnel(hazard, data.angle, data.radius);
      hazard.rotation.y += dt * .6;
      hazard.rotation.x = Math.sin(elapsed * 1.6 + data.wobble) * .3;
      const positionAttr = hazard.geometry.attributes.position;
      for (let i = 0; i < positionAttr.count; i += 1) {
        const bx = data.basePositions[i * 3];
        const by = data.basePositions[i * 3 + 1];
        const bz = data.basePositions[i * 3 + 2];
        const pulse = 1 + Math.sin(elapsed * 3 + data.noise[i] * 6) * .14;
        positionAttr.setXYZ(i, bx * pulse, by * pulse, bz * pulse);
      }
      positionAttr.needsUpdate = true;
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
      damage(data.type === 'barrier' ? 32 : data.type === 'blob' ? 24 : 21);
      removeEntity(hazard, hazards);
    }
  }
}

function updateCoins(dt, speed) {
  for (const coin of [...coins]) {
    const data = coin.userData;
    coin.position.z += speed * dt;
    coin.rotation.z += dt * 4;
    coin.rotation.x += dt * 2;

    const angularDistance = Math.abs(Math.atan2(Math.sin(playerAngle - data.angle), Math.cos(playerAngle - data.angle)));
    const closeInDepth = coin.position.z > -3 && coin.position.z < 3;

    if (!data.magnetized && closeInDepth && angularDistance < .5) {
      data.magnetized = true;
    }

    if (data.magnetized) {
      coin.position.x = THREE.MathUtils.damp(coin.position.x, player.position.x, 9, dt);
      coin.position.y = THREE.MathUtils.damp(coin.position.y, player.position.y, 9, dt);
      coin.position.z = THREE.MathUtils.damp(coin.position.z, player.position.z, 9, dt);
    } else {
      positionOnTunnel(coin, data.angle, data.radius);
    }

    if (coin.position.z > 6) {
      removeEntity(coin, coins);
      continue;
    }

    if (coin.position.distanceTo(player.position) < .85) {
      collectCoin(data.value);
      blast(coin.position, 0xffe14d, 12);
      pulseLight.intensity = 9;
      removeEntity(coin, coins);
    }
  }
}

// Обработка попаданий снарядов: глаза и кляксы требуют hp-урона, барьеры и блоки разрушаются аналогично.
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
      if (projectile.position.distanceTo(hazard.position) < hazard.userData.hitRadius) {
        hazard.userData.hp -= 1;
        removeEntity(projectile, projectiles);
        pulseLight.intensity = 8;
        if (hazard.userData.hp <= 0) {
          score += hazard.userData.value;
          const debrisColor = hazard.userData.type === 'blob' ? 0x39ff8c
            : hazard.userData.type === 'barrier' ? 0xff3d9a
            : hazard.userData.type === 'block' ? 0xa855f7
            : 0x8cf9ff;
          blast(hazard.position, debrisColor, 17);
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
  for (const item of [...coins]) removeEntity(item, coins);
}

function beginGame() {
  clearGameObjects();
  score = 0;
  health = 100;
  playerAngle = 0;
  playerAngularVelocity = 0;
  elapsed = 0;
  spawnTimer = .8;
  coinTimer = .4;
  coinsCollected = 0;
  level = 1;
  levelSpeedBoost = 1;
  levelNode.textContent = '1';
  updateCoinHud();
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
  const ambientSpeed = state === 'playing' ? WORLD_SPEED * levelSpeedBoost * (1 + Math.min(elapsed / 90, .95)) : 2.6;

  if (state === 'playing') {
    elapsed += dt;
    score += dt * 42 * (ambientSpeed / WORLD_SPEED);
    fireCooldown = Math.max(0, fireCooldown - dt);
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnHazard();
      spawnTimer = Math.max(.4, 1.24 - elapsed * .007) + Math.random() * .5;
    }
    coinTimer -= dt;
    if (coinTimer <= 0) {
      createCoin();
      coinTimer = .5 + Math.random() * .6;
    }
    updatePlayer(dt);
    updateHazards(dt, ambientSpeed);
    updateCoins(dt, ambientSpeed);
    updateProjectiles(dt);
    updateHud(ambientSpeed);
  } else {
    collectorRing.rotation.z += dt * .5;
  }

  updateShipIcon(dt);
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
window.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button')) return;
  fire();
});
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
updateCoinHud();
statusNode.textContent = 'ОЖИДАНИЕ ВХОДА';
requestAnimationFrame(animate);
