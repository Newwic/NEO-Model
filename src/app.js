import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const DEFAULT_MODEL_URL = "./assets/model.glb";

const canvas = document.querySelector("#viewer");
const modelName = document.querySelector("#modelName");
const statusText = document.querySelector("#statusText");
const progressFill = document.querySelector("#progressFill");
const fileInput = document.querySelector("#fileInput");
const dropHint = document.querySelector("#dropHint");
const settingsPanel = document.querySelector("#settingsPanel");
const settingsButton = document.querySelector("#settingsButton");
const closePanelButton = document.querySelector("#closePanelButton");
const trianglesValue = document.querySelector("#trianglesValue");
const meshesValue = document.querySelector("#meshesValue");
const sizeValue = document.querySelector("#sizeValue");
const selectionPanel = document.querySelector("#selectionPanel");
const selectedName = document.querySelector("#selectedName");
const selectedType = document.querySelector("#selectedType");
const selectedTriangles = document.querySelector("#selectedTriangles");
const selectedSize = document.querySelector("#selectedSize");
const selectedPosition = document.querySelector("#selectedPosition");
const focusSelectedButton = document.querySelector("#focusSelectedButton");
const clearSelectedButton = document.querySelector("#clearSelectedButton");
const playButton = document.querySelector("#playButton");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151718);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 2000);
camera.position.set(3.2, 2.6, 2.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.75;
controls.minDistance = 0.15;
controls.maxDistance = 80;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xf8efe1, 0x273033, 1.1);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xfff1d2, 2.3);
keyLight.position.set(4, 5, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x52fff0, 0.9);
rimLight.position.set(-4, 2, -3);
scene.add(rimLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4, 96),
  new THREE.MeshStandardMaterial({
    color: 0x242727,
    roughness: 0.82,
    metalness: 0.02,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(8, 24, 0x17c4bd, 0x3d4243);
grid.material.transparent = true;
grid.material.opacity = 0.32;
grid.position.y = 0.002;
scene.add(grid);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let currentModel = null;
let currentObjectUrl = null;
let currentMode = "original";
let resizeTimer = null;
let selectedMesh = null;
let selectionBox = null;
let pointerStart = null;
let isolateMode = false;
const meshRecords = [];
const dropRecords = [];
let dropStartedAt = null;
let dropDuration = 0;

const studioMaterial = new THREE.MeshStandardMaterial({
  color: 0xdcd6c7,
  roughness: 0.46,
  metalness: 0.05,
});

const xrayMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x3ee7dc,
  roughness: 0.24,
  metalness: 0.02,
  transparent: true,
  opacity: 0.36,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const selectionMaterial = new THREE.LineBasicMaterial({
  color: 0x51f2df,
  depthTest: false,
  transparent: true,
  opacity: 0.92,
});

function setStatus(text, progress = null) {
  statusText.style.color = "";
  statusText.textContent = text;
  if (progress !== null) {
    progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}

function disposeObject(object) {
  const disposed = new Set();
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    const sourceMaterial = child.userData.originalMaterial ?? child.material;
    const materials = Array.isArray(sourceMaterial) ? sourceMaterial : [sourceMaterial];
    for (const material of materials) {
      if (!material || disposed.has(material)) continue;
      disposed.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material?.dispose?.();
    }
  });
}

function clearModel() {
  exitIsolation();
  clearSelection();
  if (currentModel) {
    scene.remove(currentModel);
    disposeObject(currentModel);
    currentModel = null;
  }
  meshRecords.length = 0;
  dropRecords.length = 0;
  dropStartedAt = null;
  dropDuration = 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function getTriangleCount(geometry) {
  if (!geometry) return 0;
  if (geometry.index) return geometry.index.count / 3;
  if (geometry.attributes.position) return geometry.attributes.position.count / 3;
  return 0;
}

function formatVector(vector) {
  return `${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)}`;
}

function getReadyStatus() {
  return dropRecords.length ? `${dropRecords.length} pellets - Play / Spacebar to drop` : "Ready";
}

function isSelectableMesh(mesh) {
  return mesh?.isMesh && !/^(studio_)?floor$|ground|grid/i.test(mesh.name || "");
}

function updateStats(object) {
  let triangles = 0;
  let meshes = 0;
  object.traverse((child) => {
    if (!child.isMesh) return;
    meshes += 1;
    const geometry = child.geometry;
    triangles += getTriangleCount(geometry);
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  trianglesValue.textContent = formatNumber(triangles);
  meshesValue.textContent = formatNumber(meshes);
  sizeValue.textContent = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
}

function getFrameDistance(size) {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const fitFov = Math.max(0.01, Math.min(verticalFov, horizontalFov));
  const radius = Math.max(size.length() / 2, 0.1);
  const margin = window.innerWidth <= 760 ? 1.02 : 1.08;

  return (radius / Math.sin(fitFov / 2)) * margin;
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  object.position.sub(center);

  const normalizedBox = new THREE.Box3().setFromObject(object);
  const normalizedSize = new THREE.Vector3();
  normalizedBox.getSize(normalizedSize);
  const maxDim = Math.max(normalizedSize.x, normalizedSize.y, normalizedSize.z, 0.1);

  ground.scale.setScalar(maxDim * 0.54);
  ground.position.y = normalizedBox.min.y - maxDim * 0.03;
  grid.position.y = ground.position.y + maxDim * 0.012;
  grid.scale.setScalar(Math.max(maxDim / 4, 0.25));

  const distance = getFrameDistance(normalizedSize);
  const cameraDirection = new THREE.Vector3(0.86, 0.64, 0.72).normalize();
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 120;
  camera.position.copy(cameraDirection.multiplyScalar(distance));
  camera.updateProjectionMatrix();

  controls.target.set(0, normalizedSize.y * 0.04, 0);
  controls.minDistance = Math.max(distance * 0.08, 0.05);
  controls.maxDistance = distance * 4;
  controls.update();
}

function collectMeshes(object) {
  meshRecords.length = 0;
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.userData.originalMaterial = child.material;
    meshRecords.push(child);
  });
}

function clearSelection() {
  selectedMesh = null;
  if (selectionBox) {
    scene.remove(selectionBox);
    selectionBox.geometry?.dispose?.();
    selectionBox = null;
  }
  if (selectionPanel) selectionPanel.hidden = true;
}

function exitIsolation() {
  isolateMode = false;
  for (const mesh of meshRecords) mesh.visible = true;
  ground.visible = document.querySelector("#gridToggle")?.checked ?? true;
  grid.visible = document.querySelector("#gridToggle")?.checked ?? true;
}

function updateSelectionPanel(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  selectedName.textContent = mesh.name || "Unnamed mesh";
  selectedType.textContent = /pellet/i.test(mesh.name) ? "Pellet" : "Mesh";
  selectedTriangles.textContent = formatNumber(getTriangleCount(mesh.geometry));
  selectedSize.textContent = formatVector(size);
  selectedPosition.textContent = formatVector(center);
  selectionPanel.hidden = false;
}

function selectMesh(mesh) {
  selectedMesh = mesh;
  if (selectionBox) {
    scene.remove(selectionBox);
    selectionBox.geometry?.dispose?.();
  }
  selectionBox = new THREE.BoxHelper(mesh, 0x51f2df);
  selectionBox.material = selectionMaterial;
  selectionBox.renderOrder = 999;
  scene.add(selectionBox);
  updateSelectionPanel(mesh);
  isolateSelectedMesh();
  setStatus(`Selected ${mesh.name || "mesh"}`, 100);
}

function focusSelectedMesh(zoom = 1.15) {
  if (!selectedMesh) return;

  const box = new THREE.Box3().setFromObject(selectedMesh);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const distance = getFrameDistance(size) * zoom;
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  controls.target.copy(center);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = Math.max(distance * 120, camera.far);
  controls.minDistance = Math.max(distance * 0.08, 0.02);
  controls.maxDistance = Math.max(distance * 8, 1);
  camera.updateProjectionMatrix();
  controls.update();
}

function isolateSelectedMesh() {
  if (!selectedMesh) return;
  isolateMode = true;
  for (const mesh of meshRecords) mesh.visible = mesh === selectedMesh;
  ground.visible = true;
  grid.visible = true;
  focusSelectedMesh(0.72);
}

function pickMesh(event) {
  if (!currentModel || !pointerStart) return;
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (moved > 6) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(meshRecords, false);
  const hit = hits.find((item) => item.object.visible && isSelectableMesh(item.object));
  if (hit) {
    selectMesh(hit.object);
  } else {
    clearSelection();
    exitIsolation();
    setStatus(getReadyStatus(), 100);
  }
}

function seededRandom(seed) {
  const value = Math.sin(seed * 9283.17) * 43758.5453;
  return value - Math.floor(value);
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function collectDropObjects(object) {
  dropRecords.length = 0;
  const pellets = [];
  object.traverse((child) => {
    if (!child.isMesh || !/pellet/i.test(child.name)) return;
    pellets.push(child);
  });

  if (!pellets.length) return;

  const pileBox = new THREE.Box3();
  for (const pellet of pellets) pileBox.expandByObject(pellet);

  const pileSize = new THREE.Vector3();
  const pileCenter = new THREE.Vector3();
  pileBox.getSize(pileSize);
  pileBox.getCenter(pileCenter);

  const floorY = pileBox.min.y;
  const spreadRadius = Math.max(pileSize.x, pileSize.z, 0.8) * 1.25;
  const settleHeight = Math.max(pileSize.y * 0.055, 0.035);

  pellets.forEach((pellet, index) => {
    const angle = seededRandom(index + 1) * Math.PI * 2;
    const radius = Math.sqrt(seededRandom(index + 31)) * spreadRadius;
    const layer = Math.floor(index / Math.max(18, Math.sqrt(pellets.length)));
    const delay = seededRandom(index + 71) * 0.45;
    const duration = 1.45 + seededRandom(index + 101) * 0.8;

    dropRecords.push({
      object: pellet,
      startPosition: pellet.position.clone(),
      targetPosition: new THREE.Vector3(
        pileCenter.x + Math.cos(angle) * radius,
        floorY + (layer % 8) * settleHeight * 0.22 + seededRandom(index + 13) * settleHeight,
        pileCenter.z + Math.sin(angle) * radius,
      ),
      startRotation: pellet.rotation.clone(),
      targetRotation: new THREE.Euler(
        pellet.rotation.x + (seededRandom(index + 151) - 0.5) * Math.PI * 3,
        pellet.rotation.y + (seededRandom(index + 181) - 0.5) * Math.PI * 3,
        pellet.rotation.z + (seededRandom(index + 211) - 0.5) * Math.PI * 3,
      ),
      delay,
      duration,
    });
    dropDuration = Math.max(dropDuration, delay + duration);
  });
}

function resetDropObjects() {
  for (const record of dropRecords) {
    record.object.position.copy(record.startPosition);
    record.object.rotation.copy(record.startRotation);
  }
  dropStartedAt = null;
}

function startDropAnimation() {
  if (!dropRecords.length) {
    setStatus("No pellet animation found", 100);
    statusText.style.color = "var(--danger)";
    return;
  }

  exitIsolation();
  clearSelection();
  resetDropObjects();
  dropStartedAt = clock.getElapsedTime();
  controls.autoRotate = false;
  document.querySelector("#rotateToggle").checked = false;
  setStatus("Dropping media", 100);
}

function updateDropAnimation() {
  if (dropStartedAt === null) return;

  const elapsed = clock.getElapsedTime() - dropStartedAt;
  for (const record of dropRecords) {
    const progress = THREE.MathUtils.clamp((elapsed - record.delay) / record.duration, 0, 1);
    const eased = easeOutCubic(progress);
    record.object.position.lerpVectors(record.startPosition, record.targetPosition, eased);
    record.object.rotation.set(
      THREE.MathUtils.lerp(record.startRotation.x, record.targetRotation.x, eased),
      THREE.MathUtils.lerp(record.startRotation.y, record.targetRotation.y, eased),
      THREE.MathUtils.lerp(record.startRotation.z, record.targetRotation.z, eased),
    );
  }

  if (elapsed >= dropDuration) {
    dropStartedAt = null;
    setStatus("Ready - Spacebar to replay", 100);
  }

  if (selectionBox) selectionBox.update();
  if (selectedMesh) updateSelectionPanel(selectedMesh);
}

function applyWireframe(enabled) {
  for (const mesh of meshRecords) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.wireframe = enabled;
      material.needsUpdate = true;
    }
  }
}

function applyMode(mode) {
  currentMode = mode;
  for (const mesh of meshRecords) {
    if (mode === "original") {
      mesh.material = mesh.userData.originalMaterial;
    } else if (mode === "studio") {
      mesh.material = studioMaterial;
    } else {
      mesh.material = xrayMaterial;
    }
  }
  applyWireframe(document.querySelector("#wireToggle").checked);
}

function loadModel(url, name = "Untitled model") {
  setStatus("Loading model", 3);
  clearModel();

  const loader = new GLTFLoader();
  loader.load(
    url,
    (gltf) => {
      const object = gltf.scene;
      currentModel = object;
      scene.add(object);
      collectMeshes(object);
      collectDropObjects(object);
      frameObject(object);
      updateStats(object);
      applyMode(currentMode);
      modelName.textContent = name;
      setStatus(getReadyStatus(), 100);
      if (dropRecords.length && window.location.hash === "#drop") {
        window.setTimeout(startDropAnimation, 250);
      }
    },
    (event) => {
      if (!event.total) {
        setStatus("Loading model");
        return;
      }
      const progress = (event.loaded / event.total) * 100;
      setStatus(`Loading ${Math.round(progress)}%`, progress);
    },
    (error) => {
      console.error(error);
      setStatus("Model load failed", 100);
      statusText.style.color = "var(--danger)";
    },
  );
}

function resetView() {
  if (!currentModel) return;
  exitIsolation();
  clearSelection();
  resetDropObjects();
  frameObject(currentModel);
  setStatus(getReadyStatus(), 100);
}

function saveScreenshot() {
  renderer.render(scene, camera);
  const link = document.createElement("a");
  link.download = "neo-3d-viewer-screenshot.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function openLocalFile(file) {
  if (!file) return;
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);
  loadModel(currentObjectUrl, file.name);
}

function bindUi() {
  document.querySelector("#loadButton").addEventListener("click", () => fileInput.click());
  document.querySelector("#resetButton").addEventListener("click", resetView);
  document.querySelector("#shotButton").addEventListener("click", saveScreenshot);
  playButton.addEventListener("click", startDropAnimation);
  focusSelectedButton.addEventListener("click", isolateSelectedMesh);
  clearSelectedButton.addEventListener("click", () => {
    exitIsolation();
    clearSelection();
    setStatus(getReadyStatus(), 100);
  });
  settingsButton.addEventListener("click", () => {
    setSettingsPanelOpen(!settingsPanel.classList.contains("open"));
  });
  closePanelButton.addEventListener("click", () => setSettingsPanelOpen(false));
  document.querySelector("#fullButton").addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  });

  fileInput.addEventListener("change", (event) => openLocalFile(event.target.files?.[0]));
  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener("pointerup", pickMesh);
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    startDropAnimation();
  });

  document.querySelector("#rotateToggle").addEventListener("change", (event) => {
    controls.autoRotate = event.target.checked;
  });
  document.querySelector("#gridToggle").addEventListener("change", (event) => {
    grid.visible = event.target.checked;
    ground.visible = event.target.checked;
  });
  document.querySelector("#wireToggle").addEventListener("change", (event) => {
    applyWireframe(event.target.checked);
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      applyMode(button.dataset.mode);
    });
  });

  const exposureSlider = document.querySelector("#exposureSlider");
  const exposureValue = document.querySelector("#exposureValue");
  exposureSlider.addEventListener("input", () => {
    renderer.toneMappingExposure = Number(exposureSlider.value);
    exposureValue.textContent = Number(exposureSlider.value).toFixed(2);
  });

  const keySlider = document.querySelector("#keySlider");
  const keyValue = document.querySelector("#keyValue");
  keySlider.addEventListener("input", () => {
    keyLight.intensity = Number(keySlider.value);
    keyValue.textContent = Number(keySlider.value).toFixed(2);
  });

  const ambientSlider = document.querySelector("#ambientSlider");
  const ambientValue = document.querySelector("#ambientValue");
  ambientSlider.addEventListener("input", () => {
    hemi.intensity = Number(ambientSlider.value);
    ambientValue.textContent = Number(ambientSlider.value).toFixed(2);
  });

  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    dropHint.classList.add("visible");
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropHint.classList.remove("visible");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropHint.classList.remove("visible");
    openLocalFile(event.dataTransfer.files?.[0]);
  });

  window.addEventListener("hashchange", syncPanelFromHash);
}

function setSettingsPanelOpen(open) {
  settingsPanel.classList.toggle("open", open);
  settingsButton.setAttribute("aria-expanded", String(open));
}

function syncPanelFromHash() {
  setSettingsPanelOpen(window.location.hash === "#settings");
  if (currentModel && dropRecords.length && window.location.hash === "#drop") {
    startDropAnimation();
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);

  if (currentModel) {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => frameObject(currentModel), 120);
  }
}

function animate() {
  requestAnimationFrame(animate);
  updateDropAnimation();
  if (selectionBox) selectionBox.update();
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", resize);
bindUi();
syncPanelFromHash();
if (window.lucide) window.lucide.createIcons();
loadModel(DEFAULT_MODEL_URL, "Untitled.glb");
animate();
