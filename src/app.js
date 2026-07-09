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

let currentModel = null;
let currentObjectUrl = null;
let currentMode = "original";
const meshRecords = [];

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

function setStatus(text, progress = null) {
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
  if (currentModel) {
    scene.remove(currentModel);
    disposeObject(currentModel);
    currentModel = null;
  }
  meshRecords.length = 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function updateStats(object) {
  let triangles = 0;
  let meshes = 0;
  object.traverse((child) => {
    if (!child.isMesh) return;
    meshes += 1;
    const geometry = child.geometry;
    if (geometry.index) {
      triangles += geometry.index.count / 3;
    } else if (geometry.attributes.position) {
      triangles += geometry.attributes.position.count / 3;
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  trianglesValue.textContent = formatNumber(triangles);
  meshesValue.textContent = formatNumber(meshes);
  sizeValue.textContent = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
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

  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.72;
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 120;
  camera.position.set(distance * 0.86, distance * 0.64, distance * 0.72);
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
      frameObject(object);
      updateStats(object);
      applyMode(currentMode);
      modelName.textContent = name;
      setStatus("Ready", 100);
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
  frameObject(currentModel);
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
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", resize);
bindUi();
syncPanelFromHash();
if (window.lucide) window.lucide.createIcons();
loadModel(DEFAULT_MODEL_URL, "Untitled.glb");
animate();
