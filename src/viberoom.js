import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Audio Synthesizer: Cozy Lo-Fi Rhodes Chords & Night Rain (Web Audio API)
// 100% client-side, zero external assets, no network dependency
// ---------------------------------------------------------------------------
class LofiSynthesizer {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.timer = null;
    this.chordIndex = 0;
    this.masterGain = null;
    this.rainSource = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.55, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Warm master filter
    this.warmFilter = this.ctx.createBiquadFilter();
    this.warmFilter.type = 'lowpass';
    this.warmFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
    this.warmFilter.connect(this.masterGain);

    this.startRain();
  }

  startRain() {
    if (!this.ctx) return;
    // Generate pink/white noise buffer for soft window rain
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99 * b0 + white * 0.05;
      b1 = 0.96 * b1 + white * 0.11;
      b2 = 0.86 * b2 + white * 0.25;
      data[i] = (b0 + b1 + b2) * 0.08;
    }

    this.rainSource = this.ctx.createBufferSource();
    this.rainSource.buffer = buffer;
    this.rainSource.loop = true;

    // Filter rain to sound like distant soothing night rain
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.setValueAtTime(650, this.ctx.currentTime);
    rainFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

    this.rainSource.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    this.rainSource.start();
  }

  // Warm Rhodes-like electric piano note
  playRhodesNote(freq, time, dur = 2.4, velocity = 0.16) {
    if (!this.ctx) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const noteGain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);

    // Overtone with slight detune for warmth
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2 + 0.5, time);

    const gain1 = this.ctx.createGain();
    const gain2 = this.ctx.createGain();
    gain1.gain.setValueAtTime(0.75, time);
    gain2.gain.setValueAtTime(0.25, time);

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(noteGain);
    gain2.connect(noteGain);

    // Warm envelope
    noteGain.gain.setValueAtTime(0.0001, time);
    noteGain.gain.exponentialRampToValueAtTime(velocity, time + 0.04);
    noteGain.gain.exponentialRampToValueAtTime(velocity * 0.45, time + 0.35);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    noteGain.connect(this.warmFilter);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + dur);
    osc2.stop(time + dur);
  }

  playChord() {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Cozy late-night progression in C major / A minor
    // Fmaj7 -> Em7 -> Dm7 -> Cmaj7
    const chords = [
      [174.61, 220.00, 261.63, 329.63], // Fmaj7 (F3, A3, C4, E4)
      [164.81, 196.00, 246.94, 293.66], // Em7   (E3, G3, B3, D4)
      [146.83, 174.61, 220.00, 261.63], // Dm7   (D3, F3, A3, C4)
      [130.81, 164.81, 196.00, 246.94], // Cmaj7 (C3, E3, G3, B3)
    ];

    const currentNotes = chords[this.chordIndex % chords.length];
    this.chordIndex++;

    // Strum notes slightly
    currentNotes.forEach((freq, idx) => {
      this.playRhodesNote(freq, now + idx * 0.05, 3.2, 0.14);
    });

    // Schedule next chord every 3.8 seconds
    this.timer = setTimeout(() => this.playChord(), 3800);
  }

  start() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isPlaying = true;
    if (this.rainGain) {
      this.rainGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.rainGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 1.2);
    }
    this.playChord();
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.rainGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.8);
    }
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }
}

// ---------------------------------------------------------------------------
// Face & Texture Generators
// ---------------------------------------------------------------------------
function drawFallbackSleepyFace(ctx, seed) {
  const num = parseInt((seed || "0000").slice(0, 4), 16) || 0;
  ctx.fillStyle = "#ffe4c4";
  ctx.fillRect(0, 0, 256, 256);

  // Soft cheeks
  ctx.fillStyle = "rgba(255, 120, 140, 0.35)";
  ctx.beginPath();
  ctx.arc(60, 155, 24, 0, Math.PI * 2);
  ctx.arc(196, 155, 24, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";

  const style = num % 3;
  if (style === 0) {
    // Relaxed sleeping eyes (curves)
    ctx.beginPath();
    ctx.arc(75, 115, 22, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(181, 115, 22, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // Little peaceful smile
    ctx.beginPath();
    ctx.arc(128, 160, 16, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  } else if (style === 1) {
    // Tired cute half-open eyes
    ctx.beginPath();
    ctx.moveTo(55, 120); ctx.lineTo(95, 120);
    ctx.moveTo(161, 120); ctx.lineTo(201, 120);
    ctx.stroke();

    // Little mouth
    ctx.beginPath();
    ctx.arc(128, 170, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#555";
    ctx.fill();
  } else {
    // Starry / sleepy eyes (dot and curve)
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(75, 120, 8, 0, Math.PI * 2);
    ctx.arc(181, 120, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(128, 155, 20, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
}

function createFaceTexture(seed) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  drawFallbackSleepyFace(ctx, seed);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  if (typeof window.avatarUri === "function") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.fillStyle = "#ffe4c4";
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(img, 18, 18, 220, 220);
      texture.needsUpdate = true;
    };
    img.src = window.avatarUri(seed);
  }

  return texture;
}

// ---------------------------------------------------------------------------
// Roblox R6 Blocky Character Rig
// ---------------------------------------------------------------------------
class RobloxCharacter {
  constructor({ seed, name, isLocal = false, scene, color = null, initialPosition = [0, 0, 0] }) {
    this.seed = seed;
    this.name = name;
    this.isLocal = isLocal;
    this.scene = scene;

    // Movement state
    this.position = new THREE.Vector3(initialPosition[0], initialPosition[1], initialPosition[2]);
    this.targetPosition = this.position.clone();
    this.isMoving = false;
    this.moveSpeed = 4.2;
    this.rotationY = 0;
    this.targetRotationY = 0;

    // Current emote state: 'idle', 'walk', 'sit', 'vibe', 'dance', 'sleep'
    this.state = 'idle';
    this.animTime = Math.random() * 10;
    this.sitTarget = null;

    // Speech bubble state
    this.speechText = "";
    this.speechExpires = 0;

    this.initMesh(color);
  }

  initMesh(customColor) {
    const num = parseInt((this.seed || "4444").slice(2, 6), 16) || 1234;
    const palette = [
      0x2c3e50, 0x34495e, 0x1e272e, 0x485460, 0x2f3542,
      0x57606f, 0x3742fa, 0x5352ed, 0x5f27cd, 0x341f97
    ];
    const hoodieColor = customColor || palette[num % palette.length];
    const pantsColor = 0x19191d;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    // Torso group
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 1.45, 0);
    this.group.add(this.torsoGroup);

    // Torso geometry
    const torsoMat = new THREE.MeshLambertMaterial({ color: hoodieColor });
    const torsoGeo = new THREE.BoxGeometry(1.2, 1.35, 0.65);
    this.torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    this.torsoMesh.castShadow = true;
    this.torsoMesh.receiveShadow = true;
    this.torsoGroup.add(this.torsoMesh);

    // Head group
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.15, 0);
    this.torsoGroup.add(this.headGroup);

    // Head multi-material (face on front)
    const faceTex = createFaceTexture(this.seed);
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffe4c4 });
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTex });

    // Box face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
    const headMaterials = [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat];
    const headGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    this.headMesh = new THREE.Mesh(headGeo, headMaterials);
    this.headMesh.castShadow = true;
    this.headGroup.add(this.headMesh);

    // Sleepy Beanie / Cap on head
    const beanieMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
    const beanie = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 0.9), beanieMat);
    beanie.position.set(0, 0.38, 0);
    beanie.castShadow = true;
    this.headGroup.add(beanie);

    // Left Arm
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-0.85, 0.5, 0);
    this.torsoGroup.add(this.leftArmGroup);
    const armMat = new THREE.MeshLambertMaterial({ color: hoodieColor });
    const armGeo = new THREE.BoxGeometry(0.42, 1.25, 0.45);
    const leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.set(0, -0.5, 0);
    leftArmMesh.castShadow = true;
    this.leftArmGroup.add(leftArmMesh);

    // Right Arm
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.85, 0.5, 0);
    this.torsoGroup.add(this.rightArmGroup);
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.set(0, -0.5, 0);
    rightArmMesh.castShadow = true;
    this.rightArmGroup.add(rightArmMesh);

    // Left Leg
    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.32, 0.75, 0);
    this.group.add(this.leftLegGroup);
    const legMat = new THREE.MeshLambertMaterial({ color: pantsColor });
    const legGeo = new THREE.BoxGeometry(0.46, 1.35, 0.48);
    const leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.set(0, -0.6, 0);
    leftLegMesh.castShadow = true;
    this.leftLegGroup.add(leftLegMesh);

    // Right Leg
    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(0.32, 0.75, 0);
    this.group.add(this.rightLegGroup);
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.set(0, -0.6, 0);
    rightLegMesh.castShadow = true;
    this.rightLegGroup.add(rightLegMesh);

    // Subtle drop shadow ring
    const shadowGeo = new THREE.RingGeometry(0.05, 0.7, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.02;
    this.group.add(this.shadowMesh);

    this.scene.add(this.group);
  }

  setEmote(emote) {
    if (this.state === emote) return;
    this.state = emote;
    // Reset limb defaults
    this.leftArmGroup.rotation.set(0, 0, 0);
    this.rightArmGroup.rotation.set(0, 0, 0);
    this.leftLegGroup.rotation.set(0, 0, 0);
    this.rightLegGroup.rotation.set(0, 0, 0);
    this.torsoGroup.position.set(0, 1.45, 0);
    this.torsoGroup.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    this.shadowMesh.visible = emote !== 'sleep';
  }

  moveTo(targetPos) {
    this.targetPosition.copy(targetPos);
    this.targetPosition.y = 0;
    this.sitTarget = null;
    this.isMoving = true;
    this.setEmote('walk');
  }

  sitAt(seatPos, seatRotationY = 0) {
    this.sitTarget = { pos: seatPos, rot: seatRotationY };
    this.targetPosition.copy(seatPos);
    this.targetPosition.y = 0;
    this.isMoving = true;
    this.setEmote('walk');
  }

  say(text) {
    this.speechText = text;
    this.speechExpires = Date.now() + 6500;
  }

  update(delta) {
    this.animTime += delta;
    const t = this.animTime;

    // Movement calculation
    if (this.isMoving) {
      const dir = new THREE.Vector3().subVectors(this.targetPosition, this.position);
      dir.y = 0;
      const dist = dir.length();

      if (dist < 0.12) {
        this.position.copy(this.targetPosition);
        this.isMoving = false;
        if (this.sitTarget) {
          this.setEmote('sit');
          this.rotationY = this.sitTarget.rot;
          this.targetRotationY = this.sitTarget.rot;
        } else {
          this.setEmote('idle');
        }
      } else {
        dir.normalize();
        this.position.addScaledVector(dir, Math.min(dist, this.moveSpeed * delta));
        this.targetRotationY = Math.atan2(dir.x, dir.z);
      }
    }

    // Smooth rotation interpolation
    let rotDiff = this.targetRotationY - this.rotationY;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.rotationY += rotDiff * Math.min(1, delta * 12);
    this.group.rotation.y = this.rotationY;
    this.group.position.copy(this.position);

    // Animation frames based on state
    if (this.state === 'walk') {
      const walkCycle = t * 9;
      this.leftLegGroup.rotation.x = Math.sin(walkCycle) * 0.7;
      this.rightLegGroup.rotation.x = -Math.sin(walkCycle) * 0.7;
      this.leftArmGroup.rotation.x = -Math.sin(walkCycle) * 0.6;
      this.rightArmGroup.rotation.x = Math.sin(walkCycle) * 0.6;
      this.torsoGroup.position.y = 1.45 + Math.abs(Math.sin(walkCycle)) * 0.12;
      this.headGroup.rotation.y = Math.sin(walkCycle * 0.5) * 0.1;
    } else if (this.state === 'idle') {
      this.torsoGroup.position.y = 1.45 + Math.sin(t * 2) * 0.03;
      this.headGroup.rotation.x = Math.sin(t * 1.5) * 0.04;
      this.leftArmGroup.rotation.z = -0.05 + Math.sin(t * 2) * 0.02;
      this.rightArmGroup.rotation.z = 0.05 - Math.sin(t * 2) * 0.02;
      this.leftLegGroup.rotation.set(0, 0, 0);
      this.rightLegGroup.rotation.set(0, 0, 0);
    } else if (this.state === 'vibe') {
      // Chill lo-fi head bobbing and torso sway
      const vibeCycle = t * 4.2;
      this.headGroup.rotation.x = 0.1 + Math.sin(vibeCycle) * 0.18;
      this.headGroup.rotation.z = Math.sin(vibeCycle * 0.5) * 0.1;
      this.torsoGroup.rotation.z = Math.sin(vibeCycle * 0.5) * 0.08;
      this.torsoGroup.position.y = 1.45 + Math.abs(Math.sin(vibeCycle)) * 0.06;
      this.leftArmGroup.rotation.z = -0.25 + Math.sin(vibeCycle * 0.5) * 0.12;
      this.rightArmGroup.rotation.z = 0.25 + Math.sin(vibeCycle * 0.5) * 0.12;
      this.leftLegGroup.rotation.set(0, 0, 0);
      this.rightLegGroup.rotation.set(0, 0, 0);
    } else if (this.state === 'dance') {
      // Classic Roblox blocky step dance
      const danceCycle = t * 6.5;
      this.torsoGroup.position.y = 1.45 + Math.abs(Math.sin(danceCycle)) * 0.22;
      this.leftArmGroup.rotation.x = Math.PI * 0.75 + Math.sin(danceCycle) * 0.4;
      this.rightArmGroup.rotation.x = Math.PI * 0.75 - Math.sin(danceCycle) * 0.4;
      this.leftLegGroup.rotation.x = Math.sin(danceCycle) * 0.4;
      this.rightLegGroup.rotation.x = -Math.sin(danceCycle) * 0.4;
      this.headGroup.rotation.y = Math.sin(danceCycle * 0.5) * 0.25;
    } else if (this.state === 'sit') {
      // Sitting pose (legs bent 90 degrees forward)
      this.torsoGroup.position.y = 0.95;
      this.leftLegGroup.position.y = 0.75;
      this.rightLegGroup.position.y = 0.75;
      this.leftLegGroup.rotation.x = -Math.PI / 2;
      this.rightLegGroup.rotation.x = -Math.PI / 2;
      this.leftArmGroup.rotation.x = -0.3;
      this.rightArmGroup.rotation.x = -0.3;
      this.headGroup.rotation.x = Math.sin(t * 1.5) * 0.05;
      this.headGroup.rotation.y = Math.sin(t * 0.8) * 0.1;
    } else if (this.state === 'sleep') {
      // Laying down on sofa or rug
      this.torsoGroup.position.y = 0.35;
      this.group.rotation.x = -Math.PI / 2;
      this.leftLegGroup.rotation.set(0, 0, 0);
      this.rightLegGroup.rotation.set(0, 0, 0);
      this.leftArmGroup.rotation.set(0, 0, 0);
      this.rightArmGroup.rotation.set(0, 0, 0);
      this.headGroup.rotation.z = Math.sin(t * 1.2) * 0.05;
    }
  }

  destroy() {
    if (this.group && this.scene) {
      this.scene.remove(this.group);
    }
  }
}

// ---------------------------------------------------------------------------
// Vibe Room World Builder (Cozy Modern Lo-Fi Loft at Midnight)
// ---------------------------------------------------------------------------
function buildVibeWorld(scene) {
  const interactables = [];

  // 1. Floor
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x141416,
    roughness: 0.65,
    metalness: 0.1
  });
  const floorGeo = new THREE.BoxGeometry(13.8, 0.4, 13.8);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = -0.2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);
  interactables.push({ type: 'floor', mesh: floorMesh });

  // Wooden floor slats overlay pattern (subtle grid)
  const gridHelper = new THREE.GridHelper(13.8, 20, 0x222228, 0x1c1c22);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // 2. Base Platform Outer Border
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.9 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.5, 0.3), borderMat);
  b1.position.set(0, -0.15, 7.0);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 14.4), borderMat);
  b2.position.set(7.0, -0.15, 0);
  scene.add(b1, b2);

  // 3. Walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.85,
    metalness: 0.05
  });

  // Back Wall (Z = -6.9)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(13.8, 6.5, 0.4), wallMat);
  backWall.position.set(0, 3.05, -7.0);
  backWall.receiveShadow = true;
  scene.add(backWall);

  // Left Wall (X = -6.9)
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.5, 13.8), wallMat);
  leftWall.position.set(-7.0, 3.05, 0);
  leftWall.receiveShadow = true;
  scene.add(leftWall);

  // 4. Large Floor-to-Ceiling Midnight Window Frame (Right side)
  const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x0f0f12, roughness: 0.5 });
  const winTop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 9.6), windowFrameMat);
  winTop.position.set(6.8, 5.6, -1.0);
  const winBottom = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 9.6), windowFrameMat);
  winBottom.position.set(6.8, 0.3, -1.0);
  const winLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 0.3), windowFrameMat);
  winLeft.position.set(6.8, 3.0, -5.8);
  const winRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 0.3), windowFrameMat);
  winRight.position.set(6.8, 3.0, 3.8);
  const winCenter = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 0.25), windowFrameMat);
  winCenter.position.set(6.8, 3.0, -1.0);
  scene.add(winTop, winBottom, winLeft, winRight, winCenter);

  // Glass pane
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1128,
    transparent: true,
    opacity: 0.35,
    roughness: 0.1,
    transmission: 0.8,
    ior: 1.4
  });
  const glassPane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.0, 9.4), glassMat);
  glassPane.position.set(6.8, 3.0, -1.0);
  scene.add(glassPane);

  // 5. Exterior Night City Skyline & Starry Sky
  const cityGroup = new THREE.Group();
  cityGroup.position.set(12.5, 0, -1.0);

  // Dark sky backdrop
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x050711 });
  const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(28, 20), skyMat);
  skyMesh.rotation.y = -Math.PI / 2;
  skyMesh.position.set(7.5, 8.0, 0);
  cityGroup.add(skyMesh);

  // Glowing Crescent Moon
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xfff3d1 });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 16), moonMat);
  moon.position.set(6.5, 11.5, -4.5);
  cityGroup.add(moon);

  // City skyscrapers with glowing windows
  const bldgMat = new THREE.MeshBasicMaterial({ color: 0x070914 });
  const winYellow = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const winCyan = new THREE.MeshBasicMaterial({ color: 0x06d6a0 });
  const winBlue = new THREE.MeshBasicMaterial({ color: 0x118ab2 });

  const bldgConfigs = [
    { x: 3.5, z: -5.5, w: 2.2, h: 9.0, d: 2.2 },
    { x: 4.0, z: -2.8, w: 1.8, h: 7.2, d: 1.8 },
    { x: 3.2, z: 0.2, w: 2.5, h: 10.5, d: 2.0 },
    { x: 4.2, z: 3.2, w: 2.0, h: 8.4, d: 2.0 },
    { x: 4.8, z: 5.8, w: 2.4, h: 6.5, d: 2.4 },
    { x: 5.5, z: -4.0, w: 3.0, h: 12.0, d: 3.0 },
    { x: 5.8, z: 1.5, w: 2.8, h: 11.0, d: 2.8 },
  ];

  bldgConfigs.forEach((cfg) => {
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), bldgMat);
    bldg.position.set(cfg.x, cfg.h / 2, cfg.z);
    cityGroup.add(bldg);

    // Random glowing window dots on front face
    const winCount = 8;
    for (let w = 0; w < winCount; w++) {
      const mat = (w % 3 === 0) ? winCyan : (w % 2 === 0 ? winYellow : winBlue);
      const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.28), mat);
      dot.rotation.y = -Math.PI / 2;
      const dotY = 1.5 + (w * 0.9) % (cfg.h - 2.0);
      const dotZ = cfg.z - cfg.d / 2 + 0.3 + (w * 0.45) % (cfg.d - 0.6);
      dot.position.set(cfg.x - cfg.w / 2 - 0.05, dotY, dotZ);
      cityGroup.add(dot);
    }
  });

  scene.add(cityGroup);

  // 6. Rain particles outside window
  const rainCount = 180;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3 + 0] = 7.5 + Math.random() * 3.5;
    rainPos[i * 3 + 1] = Math.random() * 8;
    rainPos[i * 3 + 2] = -6.5 + Math.random() * 11;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0x88bbff,
    size: 0.12,
    transparent: true,
    opacity: 0.55
  });
  const rainParticles = new THREE.Points(rainGeo, rainMat);
  scene.add(rainParticles);

  // 7. Sectional Sofa / Lounge (Roblox low-poly modular style)
  const sofaMat = new THREE.MeshStandardMaterial({
    color: 0x22252a,
    roughness: 0.75
  });
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0x2d3239,
    roughness: 0.6
  });

  const sofaGroup = new THREE.Group();
  sofaGroup.position.set(-2.8, 0, -4.6);

  // Main back piece
  const sBase = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.45, 1.8), sofaMat);
  sBase.position.set(0, 0.22, 0);
  sBase.castShadow = true;
  sBase.receiveShadow = true;
  sofaGroup.add(sBase);

  // Back rest
  const sBack = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 0.45), sofaMat);
  sBack.position.set(0, 0.95, -0.68);
  sBack.castShadow = true;
  sofaGroup.add(sBack);

  // Left arm rest
  const sLeftArm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 1.8), sofaMat);
  sLeftArm.position.set(-2.6, 0.65, 0);
  sLeftArm.castShadow = true;
  sofaGroup.add(sLeftArm);

  // Seat cushions
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 1.35), cushionMat);
    c.position.set(-1.6 + i * 1.6, 0.55, 0.1);
    c.castShadow = true;
    c.receiveShadow = true;
    sofaGroup.add(c);
  }

  // Cozy throw pillows (mustard & dusty rose)
  const p1Mat = new THREE.MeshStandardMaterial({ color: 0xd9915b, roughness: 0.7 });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.25), p1Mat);
  p1.position.set(-2.1, 0.78, -0.35);
  p1.rotation.y = 0.35;
  p1.castShadow = true;
  sofaGroup.add(p1);

  const p2Mat = new THREE.MeshStandardMaterial({ color: 0x3d7068, roughness: 0.7 });
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.25), p2Mat);
  p2.position.set(2.1, 0.78, -0.35);
  p2.rotation.y = -0.35;
  p2.castShadow = true;
  sofaGroup.add(p2);

  scene.add(sofaGroup);

  // Clickable couch seat spots
  const seatPositions = [
    { pos: new THREE.Vector3(-4.4, 0.65, -4.5), rot: 0, label: "Left Sofa" },
    { pos: new THREE.Vector3(-2.8, 0.65, -4.5), rot: 0, label: "Center Sofa" },
    { pos: new THREE.Vector3(-1.2, 0.65, -4.5), rot: 0, label: "Right Sofa" },
  ];

  seatPositions.forEach((sp) => {
    const seatClickBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.7, 1.4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    seatClickBox.position.copy(sp.pos);
    scene.add(seatClickBox);
    interactables.push({ type: 'seat', mesh: seatClickBox, seatPos: sp.pos, seatRot: sp.rot });
  });

  // 8. Soft Plush Floor Rug
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0x1f2329,
    roughness: 0.95
  });
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.05, 32), rugMat);
  rug.position.set(-2.6, 0.03, -1.8);
  rug.receiveShadow = true;
  scene.add(rug);

  // Rug center cushion / bean bag
  const beanMat = new THREE.MeshStandardMaterial({ color: 0x7158e2, roughness: 0.8 });
  const beanBag = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.45, 18), beanMat);
  beanBag.position.set(-4.5, 0.22, -1.4);
  beanBag.castShadow = true;
  beanBag.receiveShadow = true;
  scene.add(beanBag);
  interactables.push({
    type: 'seat',
    mesh: beanBag,
    seatPos: new THREE.Vector3(-4.5, 0.45, -1.4),
    seatRot: 0.8
  });

  // 9. Modern Low Coffee Table with Steaming Mug
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.4, metalness: 0.2 });
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.4), tableMat);
  tableTop.position.set(-2.6, 0.55, -2.0);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x333338, metalness: 0.8 });
  const legOffsets = [
    [-1.0, -0.55], [1.0, -0.55],
    [-1.0, 0.55], [1.0, 0.55]
  ];
  legOffsets.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(-2.6 + lx, 0.26, -2.0 + lz);
    leg.castShadow = true;
    scene.add(leg);
  });

  // Ceramic Mug
  const mugMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f7, roughness: 0.3 });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.22, 16), mugMat);
  mug.position.set(-2.2, 0.72, -1.9);
  mug.castShadow = true;
  scene.add(mug);

  // Steam particles
  const steamCount = 14;
  const steamGeo = new THREE.BufferGeometry();
  const steamPos = new Float32Array(steamCount * 3);
  for (let i = 0; i < steamCount; i++) {
    steamPos[i * 3 + 0] = -2.2 + (Math.random() - 0.5) * 0.08;
    steamPos[i * 3 + 1] = 0.85 + Math.random() * 0.45;
    steamPos[i * 3 + 2] = -1.9 + (Math.random() - 0.5) * 0.08;
  }
  steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
  const steamMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.07,
    transparent: true,
    opacity: 0.28
  });
  const steamParticles = new THREE.Points(steamGeo, steamMat);
  scene.add(steamParticles);

  // Open notebook on table
  const bookCover = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.38), new THREE.MeshStandardMaterial({ color: 0x0071e3 }));
  bookCover.position.set(-2.8, 0.63, -2.1);
  bookCover.rotation.y = 0.25;
  scene.add(bookCover);

  // 10. Floor Lamp (Warm Glow in corner)
  const lampGroup = new THREE.Group();
  lampGroup.position.set(-6.0, 0, -5.8);

  const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.1, 16), legMat);
  lBase.position.y = 0.05;
  lampGroup.add(lBase);

  const lPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.4, 12), legMat);
  lPole.position.y = 2.2;
  lampGroup.add(lPole);

  const lShadeMat = new THREE.MeshStandardMaterial({
    color: 0xffe8b0,
    emissive: 0xffa43b,
    emissiveIntensity: 0.6,
    roughness: 0.3
  });
  const lShade = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.7, 18, 1, true), lShadeMat);
  lShade.position.y = 4.2;
  lampGroup.add(lShade);
  scene.add(lampGroup);

  // Warm Point Light from Lamp
  const lampLight = new THREE.PointLight(0xffbe6b, 1.4, 11, 1.8);
  lampLight.position.set(-6.0, 4.1, -5.8);
  lampLight.castShadow = true;
  lampLight.shadow.bias = -0.002;
  lampLight.shadow.mapSize.width = 1024;
  lampLight.shadow.mapSize.height = 1024;
  scene.add(lampLight);

  // 11. Neon Wall Sign ("LITLY" / "VIBE")
  const neonGroup = new THREE.Group();
  neonGroup.position.set(2.0, 4.2, -6.8);

  const neonMat = new THREE.MeshStandardMaterial({
    color: 0xff2a85,
    emissive: 0xff0066,
    emissiveIntensity: 1.6,
    roughness: 0.2
  });

  // Geometric glowing frame
  const nf1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 0.06), neonMat);
  nf1.position.y = 0.75;
  const nf2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 0.06), neonMat);
  nf2.position.y = -0.75;
  const nf3 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), neonMat);
  nf3.position.x = -1.8;
  const nf4 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), neonMat);
  nf4.position.x = 1.8;
  neonGroup.add(nf1, nf2, nf3, nf4);

  // Glowing "VIBE" lettering
  const textMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  // Stylized glowing bars inside frame
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.05), textMat);
  t1.position.set(-1.1, 0.2, 0.01);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.05), textMat);
  t2.position.set(-1.1, -0.05, 0.01);

  const t3 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.05), textMat);
  t3.position.set(-0.3, 0, 0.01);

  const t4 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), textMat);
  t4.position.set(0.5, 0, 0.01);

  const t5 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), textMat);
  t5.position.set(1.2, 0.2, 0.01);
  const t6 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), textMat);
  t6.position.set(1.2, 0, 0.01);
  const t7 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), textMat);
  t7.position.set(1.2, -0.2, 0.01);

  neonGroup.add(t1, t2, t3, t4, t5, t6, t7);
  scene.add(neonGroup);

  // Neon Point Light (Magenta / Violet glow)
  const neonLight = new THREE.PointLight(0xd946ef, 1.1, 10, 1.9);
  neonLight.position.set(2.0, 4.2, -6.4);
  scene.add(neonLight);

  // 12. Potted Monstera Plant in corner
  const plantGroup = new THREE.Group();
  plantGroup.position.set(5.5, 0, 4.5);

  const potMat = new THREE.MeshStandardMaterial({ color: 0x1d1d21, roughness: 0.8 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.8, 16), potMat);
  pot.position.y = 0.4;
  pot.castShadow = true;
  plantGroup.add(pot);

  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.6 });
  const leafCount = 7;
  for (let i = 0; i < leafCount; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.45), leafMat);
    const angle = (i / leafCount) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.45, 0.95 + i * 0.12, Math.sin(angle) * 0.45);
    leaf.rotation.set(0.35, angle, 0.35);
    leaf.castShadow = true;
    plantGroup.add(leaf);
  }
  scene.add(plantGroup);

  // 13. Floating Ambient Dust / Firefly Particles
  const dustCount = 45;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3 + 0] = (Math.random() - 0.5) * 11;
    dustPos[i * 3 + 1] = 0.5 + Math.random() * 4.5;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 11;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xa5b4fc,
    size: 0.08,
    transparent: true,
    opacity: 0.45
  });
  const dustParticles = new THREE.Points(dustGeo, dustMat);
  scene.add(dustParticles);

  // Target indicator ring (shown when clicking to move)
  const targetRingGeo = new THREE.RingGeometry(0.18, 0.3, 24);
  const targetRingMat = new THREE.MeshBasicMaterial({
    color: 0x2997ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  });
  const targetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.03;
  scene.add(targetRing);

  return {
    interactables,
    rainParticles,
    steamParticles,
    dustParticles,
    neonLight,
    targetRing
  };
}

// ---------------------------------------------------------------------------
// VibeRoom Controller
// ---------------------------------------------------------------------------
export class VibeRoom {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      localSeed: options.localSeed || "000000000000",
      localName: options.localName || "Restless Soul",
      posts: options.posts || [],
      ...options
    };

    this.synth = new LofiSynthesizer();
    this.characters = [];
    this.localPlayer = null;
    this.keysDown = {};
    this.isDragging = false;
    this.prevPointer = { x: 0, y: 0 };
    this.clock = new THREE.Clock();

    // Camera angles
    this.cameraAzimuth = Math.PI * 0.25; // 45 degrees
    this.cameraElevation = 0.55;         // ~31 degrees
    this.cameraDistance = 15.5;
    this.cameraTarget = new THREE.Vector3(0, 1.2, 0);

    this.init();
  }

  init() {
    this.container.classList.add('vibe-room-active');
    this.container.innerHTML = '';

    // Create Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vibe-canvas';
    this.container.appendChild(this.canvas);

    // Create UI Overlay Container
    this.overlay = document.createElement('div');
    this.overlay.className = 'vibe-overlay';
    this.container.appendChild(this.overlay);

    // Setup Three.js Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080c);
    this.scene.fog = new THREE.FogExp2(0x07080c, 0.025);

    // Camera
    const aspect = this.container.clientWidth / (this.container.clientHeight || 450);
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    this.updateCameraPosition();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x24243a, 0.9);
    this.scene.add(ambientLight);

    const moonLight = new THREE.DirectionalLight(0x5c7cfa, 0.85);
    moonLight.position.set(10, 14, 2);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 1024;
    moonLight.shadow.mapSize.height = 1024;
    moonLight.shadow.camera.near = 0.5;
    moonLight.shadow.camera.far = 30;
    moonLight.shadow.camera.left = -9;
    moonLight.shadow.camera.right = 9;
    moonLight.shadow.camera.top = 9;
    moonLight.shadow.camera.bottom = -9;
    moonLight.shadow.bias = -0.001;
    this.scene.add(moonLight);

    // Build Room Environment
    this.world = buildVibeWorld(this.scene);

    // Raycaster for click-to-move
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Spawn Local Player
    this.spawnLocalPlayer();

    // Spawn Community Night Owls
    this.spawnCommunityNightOwls(this.options.posts);

    // Build DOM UI (Controls, Emotes, Fullscreen, Audio)
    this.buildUI();

    // Bind Event Listeners
    this.bindEvents();

    // Start Animation Loop
    this.animate = this.animate.bind(this);
    this.animId = requestAnimationFrame(this.animate);
  }

  updateCameraPosition() {
    const x = this.cameraTarget.x + this.cameraDistance * Math.cos(this.cameraElevation) * Math.sin(this.cameraAzimuth);
    const y = this.cameraTarget.y + this.cameraDistance * Math.sin(this.cameraElevation);
    const z = this.cameraTarget.z + this.cameraDistance * Math.cos(this.cameraElevation) * Math.cos(this.cameraAzimuth);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.cameraTarget);
  }

  spawnLocalPlayer() {
    this.localPlayer = new RobloxCharacter({
      seed: this.options.localSeed,
      name: `${this.options.localName} (You)`,
      isLocal: true,
      scene: this.scene,
      color: 0x0071e3,
      initialPosition: [0.5, 0, 1.2]
    });
    this.characters.push(this.localPlayer);
  }

  spawnCommunityNightOwls(posts = []) {
    // 3 cozy chill spots for fellow night owls
    const spots = [
      { pos: [-4.4, 0.65, -4.5], state: 'sit', rot: 0, defaultThought: "Couldn't sleep, staring at the rain." },
      { pos: [-4.5, 0.45, -1.4], state: 'sit', rot: 0.8, defaultThought: "3 AM hits different tonight." },
      { pos: [5.2, 0, 0.5], state: 'vibe', rot: -1.2, defaultThought: "Night breeze is peaceful." }
    ];

    spots.forEach((sp, idx) => {
      const p = posts[idx];
      const seed = p ? (p.avatar || String(p.id)) : `npc_${idx}_seed`;
      const name = p ? (typeof window.nameFor === 'function' ? window.nameFor(seed) : "Midnight Soul") : `Owl #${idx + 1}`;
      const thought = p ? p.body.slice(0, 60) : sp.defaultThought;

      const npc = new RobloxCharacter({
        seed,
        name,
        isLocal: false,
        scene: this.scene,
        initialPosition: sp.pos
      });
      npc.rotationY = sp.rot;
      npc.targetRotationY = sp.rot;
      npc.setEmote(sp.state);
      npc.say(thought);
      this.characters.push(npc);
    });
  }

  updatePosts(posts) {
    this.options.posts = posts;
    // Update existing NPC quotes
    let npcIdx = 0;
    this.characters.forEach((char) => {
      if (!char.isLocal && posts[npcIdx]) {
        char.say(posts[npcIdx].body.slice(0, 60));
        npcIdx++;
      }
    });
  }

  updateIdentity(seed, name) {
    this.options.localSeed = seed;
    this.options.localName = name;
    if (this.localPlayer) {
      this.localPlayer.destroy();
      this.characters = this.characters.filter(c => c !== this.localPlayer);
      this.spawnLocalPlayer();
    }
  }

  buildUI() {
    this.overlay.innerHTML = `
      <div class="vibe-top-bar">
        <div class="vibe-badge">
          <span class="vibe-pulse"></span>
          <span><b>Vibe Room</b> · ${this.characters.length} Night Owls</span>
        </div>
        <div class="vibe-top-actions">
          <button type="button" class="vibe-btn vibe-audio-btn" id="vr-audio" aria-label="Toggle Lofi Music">
            <span class="vibe-icon">🎵</span>
            <span class="vibe-audio-label">Lofi Audio: Off</span>
          </button>
          <button type="button" class="vibe-btn" id="vr-reset-cam" title="Reset View" aria-label="Reset Camera">
            <span class="vibe-icon">🎥</span>
          </button>
          <button type="button" class="vibe-btn vibe-fs-btn" id="vr-fullscreen" aria-label="Toggle Fullscreen">
            <span class="vibe-icon">⛶</span>
            <span class="vibe-fs-label">Fullscreen</span>
          </button>
        </div>
      </div>

      <div class="vibe-nametags" id="vr-nametags"></div>

      <div class="vibe-bottom-bar">
        <div class="vibe-emotes">
          <button type="button" class="vibe-emote-btn" data-emote="vibe" title="Chill Vibe">✨ Vibe</button>
          <button type="button" class="vibe-emote-btn" data-emote="sit" title="Sit Down">🛋️ Sit</button>
          <button type="button" class="vibe-emote-btn" data-emote="dance" title="Dance">💃 Dance</button>
          <button type="button" class="vibe-emote-btn" data-emote="sleep" title="Lie Down / Sleep">💤 Rest</button>
        </div>

        <div class="vibe-chat-dock">
          <div class="vibe-chips">
            <button type="button" class="vibe-chip" data-text="Can't sleep...">Can't sleep...</button>
            <button type="button" class="vibe-chip" data-text="Vibing to the rain 🌧️">Vibing 🌧️</button>
            <button type="button" class="vibe-chip" data-text="3 AM thoughts...">3 AM thoughts</button>
            <button type="button" class="vibe-chip" data-text="Anyone still awake?">Anyone awake?</button>
          </div>
          <form class="vibe-say-form" id="vr-say-form">
            <input type="text" id="vr-say-input" maxlength="60" placeholder="Say something to the room…" autocomplete="off" />
            <button type="submit" class="vibe-btn vibe-say-btn">Say</button>
          </form>
        </div>
      </div>

      <div class="vibe-hint">WASD / Arrow keys or click floor to walk · Drag to rotate</div>
    `;

    this.nametagsContainer = this.overlay.querySelector('#vr-nametags');
    this.audioBtn = this.overlay.querySelector('#vr-audio');
    this.audioLabel = this.overlay.querySelector('.vibe-audio-label');
    this.fsBtn = this.overlay.querySelector('#vr-fullscreen');
    this.fsLabel = this.overlay.querySelector('.vibe-fs-label');
    this.sayForm = this.overlay.querySelector('#vr-say-form');
    this.sayInput = this.overlay.querySelector('#vr-say-input');
    this.resetCamBtn = this.overlay.querySelector('#vr-reset-cam');

    // Emote buttons
    this.overlay.querySelectorAll('.vibe-emote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emote = btn.getAttribute('data-emote');
        if (this.localPlayer) {
          if (emote === 'sit') {
            // Find nearest couch seat or sit in place
            this.sitNearest();
          } else {
            this.localPlayer.isMoving = false;
            this.localPlayer.setEmote(emote);
          }
        }
      });
    });

    // Quick chips
    this.overlay.querySelectorAll('.vibe-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-text');
        if (this.localPlayer) this.localPlayer.say(text);
      });
    });

    // Say form
    this.sayForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = this.sayInput.value.trim();
      if (val && this.localPlayer) {
        this.localPlayer.say(val);
        this.sayInput.value = '';
      }
    });

    // Audio toggle
    this.audioBtn.addEventListener('click', () => {
      const active = this.synth.toggle();
      this.audioLabel.textContent = active ? 'Lofi Audio: ON' : 'Lofi Audio: Off';
      this.audioBtn.classList.toggle('active', active);
    });

    // Reset Camera
    this.resetCamBtn.addEventListener('click', () => {
      this.cameraAzimuth = Math.PI * 0.25;
      this.cameraElevation = 0.55;
      this.cameraDistance = 15.5;
      if (this.localPlayer) {
        this.cameraTarget.copy(this.localPlayer.position).add(new THREE.Vector3(0, 1.2, 0));
      }
    });

    // Fullscreen toggle
    this.fsBtn.addEventListener('click', () => this.toggleFullscreen());
  }

  sitNearest() {
    if (!this.localPlayer) return;
    const seats = this.world.interactables.filter(i => i.type === 'seat');
    let closest = null, minDist = Infinity;
    seats.forEach(s => {
      const d = s.seatPos.distanceTo(this.localPlayer.position);
      if (d < minDist) { minDist = d; closest = s; }
    });
    if (closest) {
      this.localPlayer.sitAt(closest.seatPos, closest.seatRot);
    } else {
      this.localPlayer.setEmote('sit');
    }
  }

  toggleFullscreen() {
    const isFs = document.fullscreenElement || this.container.classList.contains('is-fullscreen');
    if (!isFs) {
      if (this.container.requestFullscreen) {
        this.container.requestFullscreen().catch(() => {
          this.container.classList.add('is-fullscreen');
        });
      } else {
        this.container.classList.add('is-fullscreen');
      }
      this.fsLabel.textContent = 'Exit';
      this.container.classList.add('is-fullscreen');
    } else {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      this.container.classList.remove('is-fullscreen');
      this.fsLabel.textContent = 'Fullscreen';
    }
    setTimeout(() => this.onResize(), 150);
  }

  bindEvents() {
    // Keyboard Controls
    window.addEventListener('keydown', (e) => {
      if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
      this.keysDown[e.key.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown[e.key.toLowerCase()] = false;
    });

    // Pointer Drag & Orbit / Tap to Move
    let downTime = 0;
    let downPos = { x: 0, y: 0 };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.prevPointer = { x: e.clientX, y: e.clientY };
      downPos = { x: e.clientX, y: e.clientY };
      downTime = Date.now();
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevPointer.x;
      const dy = e.clientY - this.prevPointer.y;
      this.prevPointer = { x: e.clientX, y: e.clientY };

      // Orbit camera
      this.cameraAzimuth -= dx * 0.006;
      this.cameraElevation = Math.max(0.18, Math.min(1.1, this.cameraElevation + dy * 0.006));
    });

    this.canvas.addEventListener('pointerup', (e) => {
      this.isDragging = false;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch {}

      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      const elapsed = Date.now() - downTime;

      // Click / Tap detection
      if (dist < 8 && elapsed < 350) {
        this.handleClick(e);
      }
    });

    // Scroll Wheel Zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(8.5, Math.min(22, this.cameraDistance + e.deltaY * 0.015));
    }, { passive: false });

    // Fullscreen change events
    document.addEventListener('fullscreenchange', () => {
      const isFs = !!document.fullscreenElement;
      this.container.classList.toggle('is-fullscreen', isFs);
      this.fsLabel.textContent = isFs ? 'Exit' : 'Fullscreen';
      this.onResize();
    });

    // Resize Observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);
  }

  handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const hitTargets = this.world.interactables.map(i => i.mesh);
    const intersects = this.raycaster.intersectObjects(hitTargets, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const match = this.world.interactables.find(i => i.mesh === hit.object);

      if (match?.type === 'seat' && this.localPlayer) {
        this.localPlayer.sitAt(match.seatPos, match.seatRot);
        this.showClickRing(match.seatPos);
      } else if (match?.type === 'floor' && this.localPlayer) {
        // Clamp to room bounds
        const targetX = Math.max(-5.8, Math.min(5.8, hit.point.x));
        const targetZ = Math.max(-5.8, Math.min(5.8, hit.point.z));
        const dest = new THREE.Vector3(targetX, 0, targetZ);
        this.localPlayer.moveTo(dest);
        this.showClickRing(dest);
      }
    }
  }

  showClickRing(pos) {
    if (!this.world.targetRing) return;
    this.world.targetRing.position.set(pos.x, 0.04, pos.z);
    this.world.targetRing.scale.set(0.5, 0.5, 0.5);
    this.world.targetRing.material.opacity = 0.8;
  }

  handleKeyboard(delta) {
    if (!this.localPlayer) return;
    let moveX = 0, moveZ = 0;
    if (this.keysDown['w'] || this.keysDown['arrowup']) moveZ -= 1;
    if (this.keysDown['s'] || this.keysDown['arrowdown']) moveZ += 1;
    if (this.keysDown['a'] || this.keysDown['arrowleft']) moveX -= 1;
    if (this.keysDown['d'] || this.keysDown['arrowright']) moveX += 1;

    if (moveX !== 0 || moveZ !== 0) {
      // Align movement to camera azimuth
      const angle = this.cameraAzimuth;
      const fwd = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).negate();
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x).negate();

      const dir = new THREE.Vector3()
        .addScaledVector(fwd, -moveZ)
        .addScaledVector(right, moveX)
        .normalize();

      const nextPos = this.localPlayer.position.clone().addScaledVector(dir, this.localPlayer.moveSpeed * delta);
      nextPos.x = Math.max(-5.8, Math.min(5.8, nextPos.x));
      nextPos.z = Math.max(-5.8, Math.min(5.8, nextPos.z));

      this.localPlayer.position.copy(nextPos);
      this.localPlayer.targetPosition.copy(nextPos);
      this.localPlayer.targetRotationY = Math.atan2(dir.x, dir.z);
      this.localPlayer.setEmote('walk');
      this.localPlayer.isMoving = false;
    } else if (this.localPlayer.state === 'walk' && !this.localPlayer.isMoving) {
      this.localPlayer.setEmote('idle');
    }
  }

  updateOverheadUI() {
    if (!this.nametagsContainer) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const now = Date.now();

    let html = '';
    this.characters.forEach((char) => {
      // Calculate 3D head position
      const headPos = char.position.clone().add(new THREE.Vector3(0, 2.65, 0));
      headPos.project(this.camera);

      // Check if behind camera
      if (headPos.z > 1) return;

      const screenX = (headPos.x * 0.5 + 0.5) * width;
      const screenY = (-(headPos.y * 0.5) + 0.5) * height;

      // Status indicator
      const statusIcon = char.state === 'vibe' ? '✨' : (char.state === 'sit' ? '🛋️' : (char.state === 'dance' ? '💃' : (char.state === 'sleep' ? '💤' : '🌙')));
      const speech = (char.speechExpires > now && char.speechText) ? char.speechText : null;

      html += `
        <div class="vr-tag" style="transform: translate(-50%, -100%) translate(${screenX}px, ${screenY}px);">
          ${speech ? `<div class="vr-speech-bubble">${this.escapeHTML(speech)}</div>` : ''}
          <div class="vr-nameplate ${char.isLocal ? 'is-me' : ''}">
            <span class="vr-icon">${statusIcon}</span>
            <span>${this.escapeHTML(char.name)}</span>
          </div>
        </div>
      `;
    });

    this.nametagsContainer.innerHTML = html;
  }

  escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || 450;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate() {
    this.animId = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    // Handle keyboard movement
    this.handleKeyboard(delta);

    // Update characters
    this.characters.forEach(c => c.update(delta));

    // Smoothly follow local player with camera target
    if (this.localPlayer) {
      const targetVec = this.localPlayer.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      this.cameraTarget.lerp(targetVec, delta * 3.5);
    }
    this.updateCameraPosition();

    // Animate Rain
    if (this.world.rainParticles) {
      const positions = this.world.rainParticles.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= delta * 14;
        if (positions[i] < 0) positions[i] = 7.5;
      }
      this.world.rainParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Animate Steam
    if (this.world.steamParticles) {
      const spos = this.world.steamParticles.geometry.attributes.position.array;
      for (let i = 1; i < spos.length; i += 3) {
        spos[i] += delta * 0.45;
        if (spos[i] > 1.3) spos[i] = 0.85;
      }
      this.world.steamParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Animate Neon Glow Pulse
    if (this.world.neonLight) {
      this.world.neonLight.intensity = 1.0 + Math.sin(time * 3.2) * 0.2;
    }

    // Animate Click Ring Fade
    if (this.world.targetRing && this.world.targetRing.material.opacity > 0) {
      this.world.targetRing.material.opacity -= delta * 1.8;
      const s = this.world.targetRing.scale.x + delta * 1.2;
      this.world.targetRing.scale.set(s, s, s);
    }

    // Render Scene
    this.renderer.render(this.scene, this.camera);

    // Update screen-space Nametags & Speech bubbles
    this.updateOverheadUI();
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.synth.stop();
    this.characters.forEach(c => c.destroy());
    if (this.renderer) this.renderer.dispose();
  }
}

// Global hook for initialization
window.initVibeRoom = (container, options) => new VibeRoom(container, options);
