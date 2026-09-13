import * as THREE from 'three';

export function initResinScene(canvas, initialTheme = 'dark') {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });

  const scene = new THREE.Scene();
  const palettes = {
    dark: {
      shell: new THREE.Color('#07130f'),
      shellEmissive: new THREE.Color('#0b2d20'),
      wire: new THREE.Color('#19f0a2'),
      ring: new THREE.Color('#79ffca'),
      particles: new THREE.Color('#5dffc0'),
      ambient: new THREE.Color('#6dffbe'),
      key: new THREE.Color('#a5ffd8'),
      rim: new THREE.Color('#0cf08d'),
      shellOpacity: 0.82,
      wireOpacity: 0.16,
      ringOpacity: 0.26,
      particleOpacity: 0.48,
      ambientIntensity: 0.45,
      keyIntensity: 2.2,
      rimIntensity: 2.9,
    },
    light: {
      shell: new THREE.Color('#d9fff0'),
      shellEmissive: new THREE.Color('#d5ffed'),
      wire: new THREE.Color('#087a50'),
      ring: new THREE.Color('#009965'),
      particles: new THREE.Color('#10a871'),
      ambient: new THREE.Color('#effff8'),
      key: new THREE.Color('#ffffff'),
      rim: new THREE.Color('#28d694'),
      shellOpacity: 0.42,
      wireOpacity: 0.11,
      ringOpacity: 0.18,
      particleOpacity: 0.24,
      ambientIntensity: 0.8,
      keyIntensity: 1.35,
      rimIntensity: 1.8,
    },
  };
  let targetPalette = palettes[initialTheme] ?? palettes.dark;
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.35, 8.2);

  const group = new THREE.Group();
  scene.add(group);

  const shellGeometry = new THREE.IcosahedronGeometry(2.1, 3);
  const shellMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#07130f'),
    roughness: 0.18,
    metalness: 0.08,
    transmission: 0.52,
    thickness: 1.2,
    transparent: true,
    opacity: 0.82,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color('#0b2d20'),
    emissiveIntensity: 0.45,
  });
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  shell.rotation.set(0.38, -0.55, 0.12);
  shell.position.set(2.65, -0.05, -0.2);
  group.add(shell);

  const wire = new THREE.Mesh(
    shellGeometry,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#19f0a2'),
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    })
  );
  wire.rotation.copy(shell.rotation);
  wire.position.copy(shell.position);
  group.add(wire);

  const ringGeometry = new THREE.TorusGeometry(2.65, 0.012, 12, 160);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#79ffca'),
    transparent: true,
    opacity: 0.26,
  });

  const rings = [];
  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
    ring.position.copy(shell.position);
    ring.rotation.set(Math.PI / 2.8 + i * 0.34, i * 0.72, Math.PI / 7);
    ring.material.opacity = 0.18 - i * 0.035;
    group.add(ring);
    rings.push(ring);
  }

  const particleCount = 180;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: new THREE.Color('#5dffc0'),
    size: 0.018,
    transparent: true,
    opacity: 0.48,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  const ambientLight = new THREE.AmbientLight('#6dffbe', 0.45);
  scene.add(ambientLight);
  const keyLight = new THREE.PointLight('#a5ffd8', 2.2, 14);
  keyLight.position.set(-3.5, 2.8, 4);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight('#0cf08d', 2.9, 18);
  rimLight.position.set(4, -1.4, 3);
  scene.add(rimLight);

  function setTheme(theme) {
    targetPalette = palettes[theme] ?? palettes.dark;
  }

  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  function animate() {
    const t = clock.getElapsedTime();

    if (!prefersReducedMotion) {
      shell.rotation.y = -0.55 + t * 0.11 + pointer.x * 0.11;
      shell.rotation.x = 0.38 + Math.sin(t * 0.42) * 0.04 + pointer.y * 0.05;
      wire.rotation.copy(shell.rotation);
      particles.rotation.y = t * 0.025;
      particles.rotation.x = Math.sin(t * 0.12) * 0.05;
      rings.forEach((ring, index) => {
        ring.rotation.z += 0.0018 + index * 0.0009;
        ring.rotation.x += 0.0008;
      });
      group.position.x = pointer.x * 0.11;
      group.position.y = -pointer.y * 0.08;
    }

    const speed = prefersReducedMotion ? 1 : 0.055;
    shellMaterial.color.lerp(targetPalette.shell, speed);
    shellMaterial.emissive.lerp(targetPalette.shellEmissive, speed);
    shellMaterial.opacity += (targetPalette.shellOpacity - shellMaterial.opacity) * speed;
    wire.material.color.lerp(targetPalette.wire, speed);
    wire.material.opacity += (targetPalette.wireOpacity - wire.material.opacity) * speed;
    ringMaterial.color.lerp(targetPalette.ring, speed);
    particleMaterial.color.lerp(targetPalette.particles, speed);
    particleMaterial.opacity += (targetPalette.particleOpacity - particleMaterial.opacity) * speed;
    ambientLight.color.lerp(targetPalette.ambient, speed);
    ambientLight.intensity += (targetPalette.ambientIntensity - ambientLight.intensity) * speed;
    keyLight.color.lerp(targetPalette.key, speed);
    keyLight.intensity += (targetPalette.keyIntensity - keyLight.intensity) * speed;
    rimLight.color.lerp(targetPalette.rim, speed);
    rimLight.intensity += (targetPalette.rimIntensity - rimLight.intensity) * speed;
    rings.forEach((ring, index) => {
      ring.material.color.lerp(targetPalette.ring, speed);
      const opacity = targetPalette.ringOpacity - index * 0.04;
      ring.material.opacity += (opacity - ring.material.opacity) * speed;
    });

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  return { setTheme };
}
