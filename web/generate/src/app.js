const PRIMARY_PARAMETERS = [
  { group: "头部整体", key: "headCirc", label: "头围", min: 500, max: 620, value: 560, unit: "mm" },
  { group: "头部整体", key: "headLen", label: "头长", min: 165, max: 215, value: 190, unit: "mm" },
  { group: "头部整体", key: "headWidth", label: "头宽", min: 130, max: 175, value: 155, unit: "mm" },
  { group: "头部整体", key: "headHeight", label: "头高", min: 190, max: 260, value: 225, unit: "mm" },
  { group: "脸型比例", key: "faceWidth", label: "面宽", min: 120, max: 165, value: 142, unit: "mm" },
  { group: "五官比例", key: "pupilDistance", label: "瞳孔间距", min: 55, max: 75, value: 64, unit: "mm" },
  { group: "五官比例", key: "noseHeight", label: "鼻高", min: 42, max: 70, value: 55, unit: "mm" },
  { group: "五官比例", key: "noseWidth", label: "鼻宽", min: 28, max: 48, value: 36, unit: "mm" },
  { group: "耳部参数", key: "earLength", label: "容貌耳长", min: 52, max: 78, value: 64, unit: "mm" },
  { group: "耳部参数", key: "earWidth", label: "容貌耳宽", min: 26, max: 44, value: 34, unit: "mm" },
];

const INTERNAL_MODEL_PARAMETERS = [
  { key: "faceLen", label: "形态面长", min: 100, max: 150, value: 125, unit: "mm" },
  { key: "jawWidth", label: "两下颌角间宽", min: 95, max: 145, value: 118, unit: "mm" },
  { key: "subnasaleToChin", label: "鼻下至颏下点距", min: 52, max: 90, value: 70, unit: "mm" },
  { key: "eyeEarHeight", label: "眼耳高", min: 10, max: 45, value: 25, unit: "mm" },
];

const DERIVED_PARAMETERS = [
  { group: "自动推导参数", key: "sagittalArc", label: "头矢状弧", unit: "mm" },
  { group: "自动推导参数", key: "coronalArc", label: "耳屏间弧（头冠状弧）", unit: "mm" },
  { group: "自动推导参数", key: "noseToOcciput", label: "鼻尖点至枕后点距", unit: "mm" },
  { group: "自动推导参数", key: "tragusToOcciput", label: "耳屏至枕后点距", unit: "mm" },
  { group: "自动推导参数", key: "tragusWidth", label: "两耳屏间宽", unit: "mm" },
  { group: "自动推导参数", key: "browToChinArc", label: "眉间弧颏顶长", unit: "mm" },
  { group: "自动推导参数", key: "coronalCirc", label: "头冠状围", unit: "mm" },
  { group: "自动推导参数", key: "headEarHeight", label: "头耳高", unit: "mm" },
  { group: "自动推导参数", key: "tragusToNasion", label: "耳屏鼻根长", unit: "mm" },
  { group: "自动推导参数", key: "tragusToChin", label: "耳屏颏下长", unit: "mm" },
  { group: "自动推导参数", key: "tragusForeheadArc", label: "耳屏点间额弧长", unit: "mm" },
  { group: "自动推导参数", key: "tragusChinArc", label: "耳屏点间颏下弧长", unit: "mm" },
  { group: "自动推导参数", key: "vertexToBrow", label: "头顶点至眉间点距", unit: "mm" },
  { group: "自动推导参数", key: "vertexToNose", label: "头顶点至鼻尖点距", unit: "mm" },
];

const MODEL_PARAMETER_META = [...PRIMARY_PARAMETERS, ...INTERNAL_MODEL_PARAMETERS];

const MODEL_OPTIONS = {
  male: { label: "男性", url: "../assets/models/asian-head.obj", filePrefix: "male-head-parametric" },
  female: { label: "女性", url: "../assets/models/female-head.obj", filePrefix: "female-head-parametric" },
};
const MAX_PREVIEW_FACES = 16000;
const primaryParameters = Object.fromEntries(PRIMARY_PARAMETERS.map((item) => [item.key, item.value]));
const state = primaryParameters;
const canvas = document.querySelector("#viewer");
const ctx = canvas.getContext("2d");
const controls = document.querySelector("#controls");
const stats = document.querySelector("#meshStats");

let currentView = "three";
let showWire = false;
let selectedGender = "male";
let baseMesh = null;
let mesh = null;
const modelCache = {};
let lastCanvasSize = { width: 0, height: 0 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function gaussian(value, center, width) {
  return Math.exp(-Math.pow((value - center) / width, 2));
}

function normalizeParam(key, value = state[key]) {
  const meta = MODEL_PARAMETER_META.find((item) => item.key === key);
  if (!meta) return 0;
  return (value - meta.value) / ((meta.max - meta.min) * 0.5);
}

function computeInternalModelParameters(primary) {
  // TODO: Replace these internal helper estimates with real anthropometric statistics.
  return {
    faceLen: primary.headHeight * 0.56,
    jawWidth: primary.faceWidth * 0.83,
    subnasaleToChin: primary.noseHeight * 0.72 + primary.headHeight * 0.14,
    eyeEarHeight: primary.earLength * 0.34 + (primary.headHeight - 225) * 0.04,
  };
}

function computeDerivedParameters(primary) {
  const internal = computeInternalModelParameters(primary);
  // TODO: Replace these first-pass proportional rules with real statistical formulas.
  return {
    sagittalArc: primary.headCirc * 0.52,
    coronalArc: primary.headCirc * 0.52,
    noseToOcciput: primary.headLen * 0.72,
    tragusToOcciput: primary.headLen * 0.42,
    tragusWidth: primary.headWidth * 0.92,
    browToChinArc: internal.faceLen * 1.08,
    coronalCirc: primary.headCirc * 0.48,
    headEarHeight: primary.headHeight - internal.eyeEarHeight,
    tragusToNasion: primary.faceWidth * 0.55,
    tragusToChin: internal.faceLen * 0.72,
    tragusForeheadArc: primary.headCirc * 0.3,
    tragusChinArc: primary.headCirc * 0.36,
    vertexToBrow: primary.headHeight * 0.32,
    vertexToNose: primary.headHeight * 0.52,
  };
}

function getDerivedState() {
  return computeDerivedParameters(primaryParameters);
}

function formatMm(value) {
  return `${Math.round(value)}mm`;
}

function parseObj(text) {
  const vertices = [];
  const faces = [];

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("v ")) {
      const [, x, y, z] = trimmed.split(/\s+/);
      vertices.push({ x: Number(x), y: Number(y), z: Number(z) });
    } else if (trimmed.startsWith("f ")) {
      const indexes = trimmed
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((token) => Number(token.split("/")[0]) - 1)
        .filter((index) => Number.isFinite(index));
      if (indexes.length >= 3) {
        for (let i = 1; i < indexes.length - 1; i += 1) {
          faces.push([indexes[0], indexes[i], indexes[i + 1]]);
        }
      }
    }
  });

  const bounds = getBounds(vertices);
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  const size = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };

  const normalizedVertices = vertices.map((vertex) => ({
    x: vertex.x - center.x,
    y: vertex.y - center.y,
    z: vertex.z - center.z,
  }));

  return {
    vertices: normalizedVertices,
    faces,
    previewFaces: createPreviewFaces(faces),
    bounds: getBounds(normalizedVertices),
    originalBounds: bounds,
    size,
  };
}

function createPreviewFaces(faces) {
  if (faces.length <= MAX_PREVIEW_FACES) return faces;
  const stride = Math.ceil(faces.length / MAX_PREVIEW_FACES);
  const previewFaces = [];
  for (let i = 0; i < faces.length; i += stride) {
    previewFaces.push(faces[i]);
  }
  return previewFaces;
}

function getBounds(vertices) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  vertices.forEach((vertex) => {
    min.x = Math.min(min.x, vertex.x);
    min.y = Math.min(min.y, vertex.y);
    min.z = Math.min(min.z, vertex.z);
    max.x = Math.max(max.x, vertex.x);
    max.y = Math.max(max.y, vertex.y);
    max.z = Math.max(max.z, vertex.z);
  });
  return { min, max };
}

function buildControls() {
  let activeGroup = "";
  const fragment = document.createDocumentFragment();

  PRIMARY_PARAMETERS.forEach((item) => {
    if (item.group !== activeGroup) {
      activeGroup = item.group;
      const title = document.createElement("div");
      title.className = "group-title";
      title.textContent = activeGroup;
      fragment.appendChild(title);
    }

    const row = document.createElement("label");
    row.className = "control-row";
    row.innerHTML = `
      <span class="control-label">${item.label}</span>
      <span class="control-value" data-value="${item.key}">${item.value}${item.unit}</span>
      <input type="range" min="${item.min}" max="${item.max}" value="${item.value}" step="1" data-key="${item.key}" aria-label="${item.label}" />
    `;
    fragment.appendChild(row);
  });

  const details = document.createElement("details");
  details.className = "derived-panel";
  details.innerHTML = `
    <summary>自动推导参数</summary>
    <div class="derived-list"></div>
  `;
  const list = details.querySelector(".derived-list");
  DERIVED_PARAMETERS.forEach((item) => {
    const row = document.createElement("div");
    row.className = "derived-row";
    row.innerHTML = `
      <span class="control-label">${item.label}</span>
      <span class="control-value" data-derived-value="${item.key}">0${item.unit}</span>
    `;
    list.appendChild(row);
  });
  fragment.appendChild(details);
  controls.appendChild(fragment);
  updateDerivedDisplay();
}

function updateDerivedDisplay() {
  const derived = getDerivedState();
  DERIVED_PARAMETERS.forEach((item) => {
    const value = controls.querySelector(`[data-derived-value="${item.key}"]`);
    if (value) value.textContent = formatMm(derived[item.key]);
  });
}

function deformVertex(vertex) {
  const bounds = baseMesh.bounds;
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const depth = bounds.max.z - bounds.min.z;
  const nx = vertex.x / (width * 0.5);
  const ny = vertex.y / (height * 0.5);
  const nz = vertex.z / (depth * 0.5);

  const side = Math.abs(nx);
  const front = smoothstep(0.12, 0.86, nz);
  const back = smoothstep(-0.18, -0.9, nz);
  const upper = smoothstep(0.18, 0.95, ny);
  const lower = smoothstep(-0.12, -0.95, ny);
  const faceMask = front * gaussian(ny, -0.16, 0.72) * smoothstep(1.06, 0.1, side);
  const jawMask = front * gaussian(ny, -0.62, 0.28);
  const chinMask = front * gaussian(ny, -0.86, 0.18) * smoothstep(0.7, 0.05, side);
  const noseMask = front * gaussian(nx, 0, 0.23) * gaussian(ny, -0.12, 0.28);
  const eyeMask = front * gaussian(ny, 0.16, 0.19) * gaussian(side, 0.32, 0.16);
  const earMask = smoothstep(0.76, 1.02, side) * gaussian(ny, -0.12, 0.42) * gaussian(nz, -0.02, 0.46);
  const crownMask = upper * smoothstep(0.8, 0.1, side);
  const occiputMask = back * gaussian(ny, 0.0, 0.78);
  const internal = computeInternalModelParameters(state);

  const headCirc = normalizeParam("headCirc");
  const faceLen = normalizeParam("faceLen", internal.faceLen);
  const headLen = normalizeParam("headLen");
  const headWidth = normalizeParam("headWidth");
  const headHeight = normalizeParam("headHeight");
  const faceWidth = normalizeParam("faceWidth");
  const jawWidth = normalizeParam("jawWidth", internal.jawWidth);
  const noseHeight = normalizeParam("noseHeight");
  const noseWidth = normalizeParam("noseWidth");
  const subnasaleToChin = normalizeParam("subnasaleToChin", internal.subnasaleToChin);
  const pupilDistance = normalizeParam("pupilDistance");
  const earLength = normalizeParam("earLength");
  const earWidth = normalizeParam("earWidth");
  const eyeEarHeight = normalizeParam("eyeEarHeight", internal.eyeEarHeight);

  const xScale = state.headWidth / baseMesh.size.x;
  const yScale = state.headHeight / baseMesh.size.y;
  const zScale = state.headLen / baseMesh.size.z;

  const faceVerticalStretch = faceMask * faceLen * 0.075;
  const lowerVerticalStretch = lower * (subnasaleToChin * 0.08 + faceLen * 0.025);
  const crownLift = crownMask * (headHeight * 4.2 + headCirc * 2.6);
  const browShift = eyeMask * eyeEarHeight * 2.3;
  const noseLevelShift = noseMask * noseHeight * 1.5;

  let x = vertex.x * xScale;
  let y = vertex.y * yScale;
  let z = vertex.z * zScale;

  x *= 1 + crownMask * headCirc * 0.035;
  x *= 1 + faceMask * (faceWidth * 0.085 + headCirc * 0.012);
  x *= 1 + jawMask * jawWidth * 0.13;
  x *= 1 + noseMask * (noseWidth * 0.12);
  x += Math.sign(nx) * eyeMask * pupilDistance * 3.8;

  y += Math.sign(ny || -1) * Math.abs(vertex.y) * faceVerticalStretch;
  y -= lowerVerticalStretch * 7.5;
  y += crownLift;
  y += browShift + noseLevelShift;
  y -= earMask * eyeEarHeight * 2.6;

  z *= 1 + front * headLen * 0.025 + back * (headLen * 0.035 + headCirc * 0.015);
  z += noseMask * noseHeight * 9.5;
  z += chinMask * (subnasaleToChin * 4.8 + faceLen * 2.2);
  z -= occiputMask * (headLen * 8.5 + headCirc * 3.0);
  z += upper * front * (headCirc * 3.2 + headHeight * 2.2);

  return { x, y, z };
}

function generateMesh() {
  if (!baseMesh) return { vertices: [], faces: [] };
  let vertices = normalizeMainDimensions(baseMesh.vertices.map(deformVertex));
  vertices = applyLocalCalibrations(vertices);
  vertices = normalizeMainDimensions(vertices);
  vertices = applyLocalCalibrations(vertices);
  return {
    vertices,
    faces: baseMesh.faces,
    previewFaces: baseMesh.previewFaces,
  };
}

function normalizeMainDimensions(vertices) {
  const bounds = getMainDimensionBounds(vertices);
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  const size = {
    x: bounds.max.x - bounds.min.x || 1,
    y: bounds.max.y - bounds.min.y || 1,
    z: bounds.max.z - bounds.min.z || 1,
  };
  const scale = {
    x: state.headWidth / size.x,
    y: state.headHeight / size.y,
    z: state.headLen / size.z,
  };

  return vertices.map((vertex) => ({
    x: (vertex.x - center.x) * scale.x,
    y: (vertex.y - center.y) * scale.y,
    z: (vertex.z - center.z) * scale.z,
  }));
}

function getMainDimensionBounds(vertices) {
  const axisBounds = {
    x: spanForIndexes(vertices, getCoreIndexes("width"), "x"),
    y: spanForIndexes(vertices, getCoreIndexes("height"), "y"),
    z: spanForIndexes(vertices, getCoreIndexes("length"), "z"),
  };
  return {
    min: { x: axisBounds.x.min, y: axisBounds.y.min, z: axisBounds.z.min },
    max: { x: axisBounds.x.max, y: axisBounds.y.max, z: axisBounds.z.max },
  };
}

function getBaseNormalized(vertex) {
  const width = baseMesh.bounds.max.x - baseMesh.bounds.min.x;
  const height = baseMesh.bounds.max.y - baseMesh.bounds.min.y;
  const depth = baseMesh.bounds.max.z - baseMesh.bounds.min.z;
  return {
    x: vertex.x / (width * 0.5),
    y: vertex.y / (height * 0.5),
    z: vertex.z / (depth * 0.5),
  };
}

function getLocalMask(name) {
  return baseMesh.vertices
    .map((vertex, index) => ({ index, n: getBaseNormalized(vertex) }))
    .filter(({ n }) => {
      const side = Math.abs(n.x);
      if (name === "nose") return side < 0.2 && n.y > -0.38 && n.y < 0.18 && n.z > 0.62;
      if (name === "bridge") return side < 0.16 && n.y > -0.08 && n.y < 0.38 && n.z > 0.52;
      if (name === "face") return side > 0.22 && side < 0.72 && n.y > -0.38 && n.y < 0.28 && n.z > 0.14;
      if (name === "jaw") return side > 0.28 && n.y > -0.85 && n.y < -0.34 && n.z > -0.05;
      if (name === "leftEar") return n.x < -0.72 && n.y > -0.42 && n.y < 0.42 && n.z > -0.42 && n.z < 0.32;
      if (name === "rightEar") return n.x > 0.72 && n.y > -0.42 && n.y < 0.42 && n.z > -0.42 && n.z < 0.32;
      return false;
    })
    .map(({ index }) => index);
}

function getCoreIndexes(axis) {
  return baseMesh.vertices
    .map((vertex, index) => ({ index, n: getBaseNormalized(vertex) }))
    .filter(({ n }) => {
      const side = Math.abs(n.x);
      if (axis === "width") return side < 0.86 && n.y > 0.42 && n.y < 0.9 && n.z > -0.74 && n.z < -0.08;
      if (axis === "height") return side < 0.78 && n.z > -0.82 && n.z < 0.68;
      if (axis === "length") return side < 0.66 && n.y > -0.72 && n.y < 0.78 && n.z < 0.7;
      return false;
    })
    .map(({ index }) => index);
}

function spanForIndexes(vertices, indexes, axis) {
  if (!indexes.length) return 0;
  let min = Infinity;
  let max = -Infinity;
  indexes.forEach((index) => {
    min = Math.min(min, vertices[index][axis]);
    max = Math.max(max, vertices[index][axis]);
  });
  return { min, max, span: max - min || 1, center: (min + max) * 0.5 };
}

function rangeWeight(value, innerMin, innerMax, outerMin, outerMax) {
  if (value >= innerMin && value <= innerMax) return 1;
  if (value < outerMin || value > outerMax) return 0;
  if (value < innerMin) return smoothstep(outerMin, innerMin, value);
  return 1 - smoothstep(innerMax, outerMax, value);
}

function minWeight(value, innerMin, outerMin) {
  if (value >= innerMin) return 1;
  if (value <= outerMin) return 0;
  return smoothstep(outerMin, innerMin, value);
}

function maxWeight(value, innerMax, outerMax) {
  if (value <= innerMax) return 1;
  if (value >= outerMax) return 0;
  return 1 - smoothstep(innerMax, outerMax, value);
}

function getInfluenceWeights(name) {
  return baseMesh.vertices
    .map((vertex, index) => {
      const n = getBaseNormalized(vertex);
      const side = Math.abs(n.x);
      let weight = 0;

      if (name === "nose") {
        weight =
          maxWeight(side, 0.2, 0.34) *
          rangeWeight(n.y, -0.38, 0.18, -0.54, 0.34) *
          minWeight(n.z, 0.62, 0.42);
      } else if (name === "bridge") {
        weight =
          maxWeight(side, 0.16, 0.28) *
          rangeWeight(n.y, -0.08, 0.38, -0.24, 0.56) *
          minWeight(n.z, 0.52, 0.34);
      } else if (name === "face") {
        weight =
          rangeWeight(side, 0.22, 0.72, 0.1, 0.86) *
          rangeWeight(n.y, -0.38, 0.28, -0.56, 0.44) *
          minWeight(n.z, 0.14, -0.04);
      } else if (name === "jaw") {
        weight =
          minWeight(side, 0.28, 0.12) *
          rangeWeight(n.y, -0.85, -0.34, -0.98, -0.18) *
          minWeight(n.z, -0.05, -0.26);
      } else if (name === "leftEar") {
        weight =
          rangeWeight(n.x, -1.08, -0.72, -1.16, -0.58) *
          rangeWeight(n.y, -0.42, 0.42, -0.56, 0.56) *
          rangeWeight(n.z, -0.42, 0.32, -0.58, 0.48);
      } else if (name === "rightEar") {
        weight =
          rangeWeight(n.x, 0.72, 1.08, 0.58, 1.16) *
          rangeWeight(n.y, -0.42, 0.42, -0.56, 0.56) *
          rangeWeight(n.z, -0.42, 0.32, -0.58, 0.48);
      }

      return { index, weight };
    })
    .filter(({ weight }) => weight > 0);
}

function scaleWithFalloff(vertices, measureIndexes, influenceWeights, axis, targetSpan) {
  if (!measureIndexes.length || !influenceWeights.length || targetSpan <= 0) return;
  const span = spanForIndexes(vertices, measureIndexes, axis);
  const scale = targetSpan / span.span;
  influenceWeights.forEach(({ index, weight }) => {
    const targetValue = span.center + (vertices[index][axis] - span.center) * scale;
    vertices[index] = {
      ...vertices[index],
      [axis]: vertices[index][axis] + (targetValue - vertices[index][axis]) * weight,
    };
  });
}

function centerForIndexes(vertices, indexes) {
  const center = { x: 0, y: 0, z: 0 };
  if (!indexes.length) return center;
  indexes.forEach((index) => {
    center.x += vertices[index].x;
    center.y += vertices[index].y;
    center.z += vertices[index].z;
  });
  center.x /= indexes.length;
  center.y /= indexes.length;
  center.z /= indexes.length;
  return center;
}

function scaleEarAsUnit(vertices, indexes, influenceWeights, targetLength, targetDepth) {
  if (!indexes.length || !influenceWeights.length) return;
  const ySpan = spanForIndexes(vertices, indexes, "y");
  const zSpan = spanForIndexes(vertices, indexes, "z");
  const yScale = clamp(targetLength / ySpan.span, 0.88, 1.12);
  const zScale = clamp(targetDepth / zSpan.span, 0.88, 1.12);

  influenceWeights.forEach(({ index, weight }) => {
    const vertex = vertices[index];
    const targetY = ySpan.center + (vertex.y - ySpan.center) * yScale;
    const targetZ = zSpan.center + (vertex.z - zSpan.center) * zScale;
    vertices[index] = {
      ...vertex,
      y: vertex.y + (targetY - vertex.y) * weight,
      z: vertex.z + (targetZ - vertex.z) * weight,
    };
  });
}

function applyLocalCalibrations(vertices) {
  const calibrated = vertices.map((vertex) => ({ ...vertex }));
  const internal = computeInternalModelParameters(state);
  const nose = getLocalMask("nose");
  const bridge = getLocalMask("bridge");
  const face = getLocalMask("face");
  const jaw = getLocalMask("jaw");
  const leftEar = getLocalMask("leftEar");
  const rightEar = getLocalMask("rightEar");

  scaleWithFalloff(calibrated, nose, getInfluenceWeights("nose"), "x", state.noseWidth);
  scaleWithFalloff(calibrated, bridge, getInfluenceWeights("bridge"), "y", state.noseHeight);
  scaleWithFalloff(calibrated, face, getInfluenceWeights("face"), "x", state.faceWidth);
  scaleWithFalloff(calibrated, jaw, getInfluenceWeights("jaw"), "x", internal.jawWidth);
  scaleEarAsUnit(calibrated, leftEar, getInfluenceWeights("leftEar"), state.earLength, state.earWidth);
  scaleEarAsUnit(calibrated, rightEar, getInfluenceWeights("rightEar"), state.earLength, state.earWidth);

  return calibrated;
}

function faceNormal(face, vertices) {
  const a = vertices[face[0]];
  const b = vertices[face[1]];
  const c = vertices[face[2]];
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  return {
    x: uy * vz - uz * vy,
    y: uz * vx - ux * vz,
    z: ux * vy - uy * vx,
  };
}

function project(point) {
  const w = canvas.width;
  const h = canvas.height;
  let x = point.x;
  let y = point.y;
  let z = point.z;
  const rotY = currentView === "side" ? Math.PI * 0.5 : currentView === "three" ? -0.58 : 0;
  const rotX = currentView === "three" ? 0.12 : 0;
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  const scale = Math.min(w, h) / 330;
  const perspective = 1 / (1 + (z2 - 60) / 980);
  return {
    x: w * 0.5 + x1 * scale * perspective,
    y: h * 0.52 - y1 * scale * perspective,
    z: z2,
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(640, Math.round(rect.width * ratio));
  const height = Math.max(460, Math.round(rect.height * ratio));
  if (width !== lastCanvasSize.width || height !== lastCanvasSize.height) {
    canvas.width = width;
    canvas.height = height;
    lastCanvasSize = { width, height };
  }
}

function drawEmptyState(message) {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#68707d";
  ctx.font = `${16 * (window.devicePixelRatio || 1)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(message, canvas.width * 0.5, canvas.height * 0.5);
}

function drawMesh() {
  if (!baseMesh) {
    drawEmptyState("正在加载基础头部 OBJ...");
    return;
  }

  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  mesh = generateMesh();
  const projected = mesh.vertices.map(project);
  const light = { x: -0.35, y: 0.58, z: 0.72 };
  const sortedFaces = mesh.previewFaces
    .map((face) => ({
      face,
      depth: (projected[face[0]].z + projected[face[1]].z + projected[face[2]].z) / 3,
      normal: faceNormal(face, mesh.vertices),
    }))
    .sort((a, b) => a.depth - b.depth);

  sortedFaces.forEach(({ face, normal }) => {
    const len = Math.hypot(normal.x, normal.y, normal.z) || 1;
    const shade = clamp((normal.x * light.x + normal.y * light.y + normal.z * light.z) / len, -1, 1);
    const red = Math.round(203 + shade * 32);
    const green = Math.round(169 + shade * 24);
    const blue = Math.round(144 + shade * 18);
    ctx.beginPath();
    ctx.moveTo(projected[face[0]].x, projected[face[0]].y);
    ctx.lineTo(projected[face[1]].x, projected[face[1]].y);
    ctx.lineTo(projected[face[2]].x, projected[face[2]].y);
    ctx.closePath();
    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    ctx.fill();
    if (showWire) {
      ctx.strokeStyle = "rgba(22, 25, 31, 0.13)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  });

  const previewNote = mesh.previewFaces.length < mesh.faces.length ? ` · 预览 ${mesh.previewFaces.length} faces` : "";
  stats.textContent = `${MODEL_OPTIONS[selectedGender].label} · ${mesh.vertices.length} vertices · ${mesh.faces.length} faces${previewNote}`;
}

function exportObj() {
  if (!mesh) mesh = generateMesh();
  const lines = [
    `# Deformed from ${MODEL_OPTIONS[selectedGender].url}`,
    "# Units: millimeters",
    `o ${selectedGender}_head_parametric_deformed`,
  ];
  mesh.vertices.forEach((v) => {
    lines.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`);
  });
  mesh.faces.forEach((face) => {
    lines.push(`f ${face.map((index) => index + 1).join(" ")}`);
  });
  return lines.join("\n");
}

function downloadObj() {
  if (!baseMesh) return;
  const blob = new Blob([exportObj()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${MODEL_OPTIONS[selectedGender].filePrefix}-${stamp}.obj`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resetParameters() {
  PRIMARY_PARAMETERS.forEach((item) => {
    state[item.key] = item.value;
    const input = controls.querySelector(`[data-key="${item.key}"]`);
    const value = controls.querySelector(`[data-value="${item.key}"]`);
    input.value = item.value;
    value.textContent = `${item.value}${item.unit}`;
  });
  updateDerivedDisplay();
  drawMesh();
}

async function loadBaseModel(gender = selectedGender) {
  selectedGender = gender;
  const option = MODEL_OPTIONS[selectedGender];
  baseMesh = null;
  mesh = null;
  stats.textContent = `正在加载${option.label}头模...`;
  drawEmptyState(`正在加载${option.label}基础 OBJ...`);

  try {
    if (!modelCache[selectedGender]) {
      const response = await fetch(option.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      modelCache[selectedGender] = parseObj(text);
    }
    baseMesh = modelCache[selectedGender];
    drawMesh();
  } catch (error) {
    stats.textContent = "OBJ 加载失败";
    drawEmptyState(`无法加载 ${option.url}`);
    console.error(error);
  }
}

buildControls();
drawMesh();
loadBaseModel();

controls.addEventListener("input", (event) => {
  const input = event.target.closest("input[type='range']");
  if (!input) return;
  const key = input.dataset.key;
  state[key] = Number(input.value);
  controls.querySelector(`[data-value="${key}"]`).textContent = `${input.value}mm`;
  updateDerivedDisplay();
  drawMesh();
});

document.querySelector("#downloadButton").addEventListener("click", downloadObj);
document.querySelector("#resetButton").addEventListener("click", resetParameters);
document.querySelectorAll("[data-gender]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.gender === selectedGender) return;
    document.querySelectorAll("[data-gender]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    loadBaseModel(button.dataset.gender);
  });
});

document.querySelector("#wireToggle").addEventListener("change", (event) => {
  showWire = event.target.checked;
  drawMesh();
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    drawMesh();
  });
});

window.addEventListener("resize", drawMesh);
