import * as THREE from 'three';

function roundedShape(width, height, radius) {
  const shape = new THREE.Shape(), x = -width / 2, y = -height / 2;
  shape.moveTo(x + radius, y); shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius); shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

export function createLandingScene(canvas, initiallyPaused = false) {
  const host = canvas.parentElement;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    host.dataset.renderer = 'fallback';
    return { setPaused() {}, setAssembled() {}, destroy() {} };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 50);
  camera.position.set(6, 5.8, 8); camera.lookAt(0, 0, 0);
  const group = new THREE.Group(); scene.add(group);
  const environment = new THREE.Scene();
  environment.background = new THREE.Color('#183d30');
  const softbox = (color, intensity, scale, position) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...scale), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    panel.material.color.multiplyScalar(intensity); panel.position.set(...position); panel.lookAt(0, 0, 0); environment.add(panel);
  };
  softbox('#effff4', 4, [4, 7], [-4, 4, 3]);
  softbox('#85ffc7', 2, [2, 7], [4, 1, -3]);
  softbox('#ffffff', 3, [6, 2], [0, 7, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(environment, .05);
  scene.environment = envMap.texture;
  environment.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
  pmrem.dispose();
  scene.add(new THREE.AmbientLight('#b7ffdb', 2));
  const key = new THREE.DirectionalLight('#ffffff', 4); key.position.set(3, 6, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#65ffc0', 5); rim.position.set(-4, 1, -2); scene.add(rim);

  const geometry = new THREE.ExtrudeGeometry(roundedShape(3.65, 2.95, .6), { depth: .16, steps: 1, bevelEnabled: true, bevelSegments: 4, bevelSize: .085, bevelThickness: .075, curveSegments: 24 });
  geometry.center(); geometry.rotateX(-Math.PI / 2);
  const layers = [];
  ['#123e2d', '#27b47c', '#abffdc'].forEach((color, index) => {
    const material = new THREE.MeshPhysicalMaterial({ color, metalness: .16, roughness: .15, transmission: index === 2 ? .48 : .2, thickness: .5, ior: 1.45, clearcoat: 1, envMapIntensity: 1.7 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = (index - 1) * .95; mesh.rotation.y = (index - 1) * .16;
    group.add(mesh); layers.push(mesh);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 24), new THREE.LineBasicMaterial({ color: '#9cffd5', transparent: true, opacity: index === 2 ? .44 : .25 }));
    mesh.add(edge);
  });
  // Fine inlay lines tie the sculpture back to the three strokes of the brand mark.
  const inlayGeometry = new THREE.BoxGeometry(1.35, .012, .055);
  for (let index = 0; index < 3; index++) {
    const inlay = new THREE.Mesh(inlayGeometry, new THREE.MeshStandardMaterial({ color: '#d5ffe8', metalness: .7, roughness: .2 }));
    inlay.position.set(-.15, .168, (index - 1) * .36); layers[2].add(inlay);
  }
  const beadGeometry = new THREE.SphereGeometry(.055, 12, 8);
  const beadMaterial = new THREE.MeshStandardMaterial({ color: '#d7ce96', metalness: .8, roughness: .25 });
  for (let i = 0; i < 20; i++) {
    const bead = new THREE.Mesh(beadGeometry, beadMaterial);
    const angle = i * 2.399;
    bead.position.set(Math.cos(angle) * (1.15 + (i % 3) * .12), .18, Math.sin(angle) * .95);
    bead.scale.setScalar(.4 + (i % 4) * .2); layers[2].add(bead);
  }
  group.rotation.y = -.2;
  let paused = initiallyPaused, visible = true, disposed = false, frame = 0, time = 0, lastTime = 0;
  let assembled = false, separation = .95, scroll = 0;
  const pointer = new THREE.Vector2(), target = new THREE.Vector2();
  const abort = new AbortController(), { signal } = abort;
  function render(timestamp = 0) {
    frame = 0;
    if (disposed || document.hidden || !visible) { lastTime = 0; return; }
    if (!paused) {
      const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, .05) : 0;
      time += dt; lastTime = timestamp;
      pointer.lerp(target, .045);
      separation += ((assembled ? .33 : .95) - separation) * .06;
      group.rotation.y = -.2 + Math.sin(time * .3) * .15 + pointer.x * .3;
      group.rotation.x += (scroll * .18 - group.rotation.x) * .04;
      group.rotation.z = Math.sin(time * .4) * .03 + pointer.y * .05;
      layers.forEach((layer, i) => {
        layer.position.y = (i - 1) * separation + (assembled ? 0 : Math.sin(time * .9 + i * .7) * .1);
        layer.rotation.y += ((assembled ? 0 : (i - 1) * .16 + Math.sin(time * .4 + i * .6) * .07) - layer.rotation.y) * .06;
      });
    }
    renderer.render(scene, camera);
    if (!paused) frame = requestAnimationFrame(render);
  }
  function schedule() { if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(render); }
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height;
    camera.position.setLength(camera.aspect < .9 ? 13.6 : 11.6); camera.updateProjectionMatrix(); schedule();
  });
  resize.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule(); else { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
  });
  intersection.observe(host);
  host.closest('[data-hero-art]').addEventListener('pointermove', (event) => {
    if (paused || event.pointerType === 'touch') return;
    const rect = host.getBoundingClientRect();
    target.set((event.clientX - rect.left) / rect.width - .5, (event.clientY - rect.top) / rect.height - .5);
  }, { signal });
  host.closest('[data-hero-art]').addEventListener('pointerleave', () => target.set(0, 0), { signal });
  window.addEventListener('scroll', () => {
    if (!paused && visible) scroll = THREE.MathUtils.clamp(-host.getBoundingClientRect().top / innerHeight, -.5, 1);
  }, { signal, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; } else schedule();
  }, { signal });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); paused = true; cancelAnimationFrame(frame); frame = 0; host.dataset.renderer = 'fallback';
  }, { signal });
  host.dataset.renderer = 'webgl'; schedule();
  return {
    setPaused(value) { paused = value; lastTime = 0; cancelAnimationFrame(frame); frame = 0; schedule(); },
    setAssembled(value) {
      assembled = value;
      if (paused) {
        separation = assembled ? .33 : .95;
        layers.forEach((layer, i) => { layer.position.y = (i - 1) * separation; layer.rotation.y = assembled ? 0 : (i - 1) * .16; });
      }
      schedule();
    },
    destroy() {
      disposed = true; cancelAnimationFrame(frame); abort.abort(); resize.disconnect(); intersection.disconnect();
      const geometries = new Set(), materials = new Set();
      scene.traverse((object) => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
      geometries.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose());
      envMap.dispose(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
