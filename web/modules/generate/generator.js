const RANGE_EXPANSION = 0.2;

function decimalsForStep(step = 1) {
  const text = String(step);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function roundForStep(value, step = 1) {
  return Number(value.toFixed(decimalsForStep(step)));
}

function expandParameterRange(item) {
  const span = item.max - item.min;
  const extra = span * RANGE_EXPANSION * 0.5;
  const step = item.step || 1;
  return {
    ...item,
    min: roundForStep(item.min - extra, step),
    max: roundForStep(item.max + extra, step),
  };
}

const PRIMARY_PARAMETERS = [
  { group: "头部尺寸", key: "headCirc", label: "1 头围", min: 500, max: 620, value: 560, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "sagittalArc", label: "5 头矢状弧（纵弧）", min: 240, max: 360, value: 291, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "coronalArc", label: "6 耳屏间弧（横弧）", min: 240, max: 360, value: 291, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "headLen", label: "3 头长", min: 165, max: 215, value: 190, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "headWidth", label: "4 头宽", min: 130, max: 175, value: 155, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "headHeight", label: "7 头高", min: 190, max: 260, value: 225, unit: "mm", step: 1 },
  { group: "面部与比例", key: "pupilDistance", label: "16 瞳距", min: 55, max: 75, value: 64, unit: "mm", step: 1 },
  { group: "面部与比例", key: "headEarHeight", label: "22 头耳高", min: 150, max: 235, value: 203, unit: "mm", step: 1 },
  { group: "面部与比例", key: "earNoseDistance", label: "23 耳鼻距", min: 70, max: 120, value: 86, unit: "mm", step: 1 },
  { group: "面部与比例", key: "headHeightWidthRatio", label: "头高/头宽", min: 1.15, max: 1.75, value: 1.45, unit: "", step: 0.01 },
].map(expandParameterRange);

const INTERNAL_MODEL_PARAMETERS = [
  { key: "faceLen", label: "形态面长", min: 100, max: 150, value: 125, unit: "mm" },
  { key: "jawWidth", label: "下颌宽", min: 95, max: 145, value: 118, unit: "mm" },
  { key: "subnasaleToChin", label: "鼻下至颏下点距", min: 52, max: 90, value: 70, unit: "mm" },
  { key: "eyeEarHeight", label: "眼耳高", min: 10, max: 45, value: 25, unit: "mm" },
].map(expandParameterRange);

const DERIVED_MODEL_PARAMETERS = [
  { key: "faceWidth", min: 120, max: 165, value: 142 },
  { key: "noseHeight", min: 42, max: 70, value: 55 },
  { key: "noseWidth", min: 28, max: 48, value: 36 },
  { key: "earLength", min: 52, max: 78, value: 64 },
  { key: "earWidth", min: 26, max: 44, value: 34 },
].map(expandParameterRange);

const MODEL_PARAMETER_META = [...PRIMARY_PARAMETERS, ...INTERNAL_MODEL_PARAMETERS, ...DERIVED_MODEL_PARAMETERS];

const MODEL_OPTIONS = {
  male: { label: "男性", url: "/web/modules/generate/assets/models/asian-head.obj", filePrefix: "male-head-parametric" },
  female: { label: "女性", url: "/web/modules/generate/assets/models/female-head.obj", filePrefix: "female-head-parametric" },
};
const MODEL_ASSET_VERSION = "github-1bcab8a";
const MAX_PREVIEW_FACES = 4200;
const MAX_PREVIEW_POINTS = 9200;
const primaryParameters = Object.fromEntries(PRIMARY_PARAMETERS.map((item) => [item.key, item.value]));
const state = primaryParameters;
syncDerivedModelState();
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

function metaFor(key) {
  return MODEL_PARAMETER_META.find((item) => item.key === key);
}

function clampToMeta(key, value) {
  const meta = metaFor(key);
  if (!meta) return value;
  return clamp(value, meta.min, meta.max);
}

function displayValue(item, value = state[item.key]) {
  const decimals = item.step && item.step < 1 ? 2 : 0;
  const formatted = Number(value).toFixed(decimals).replace(/\.?0+$/, "");
  return `${formatted}${item.unit || ""}`;
}

function targetOutputHeadHeight(value = state.headHeight) {
  return value * 1.2;
}

function targetOutputHeadLength(value = state.headLen) {
  return value * 1.15;
}

function tragionWidthLimit() {
  const widthFromArc = state.coronalArc * 0.48;
  return clamp(widthFromArc, 120, state.headWidth);
}

function syncDerivedModelState() {
  const derivedFaceWidth = state.headWidth * 0.9 + (state.pupilDistance - 64) * 0.35;
  state.faceWidth = clampToMeta("faceWidth", Math.min(derivedFaceWidth, tragionWidthLimit()));
  state.noseHeight = clampToMeta("noseHeight", metaFor("noseHeight").value + (state.headLen - 190) * 0.08);
  state.noseWidth = clampToMeta("noseWidth", state.headWidth * 0.22 + (state.pupilDistance - 64) * 0.12);
  state.earLength = clampToMeta("earLength", (state.headHeight - state.headEarHeight) * 0.7 + 48);
  state.earWidth = clampToMeta("earWidth", state.earLength * 0.52);
}

function syncRatioFromDimensions() {
  state.headHeightWidthRatio = Number((state.headHeight / state.headWidth).toFixed(2));
}

function syncDimensionFromRatio() {
  state.headHeight = Math.round(clampToMeta("headHeight", state.headWidth * state.headHeightWidthRatio));
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
  return {
    faceLen: primary.sagittalArc * 0.43 + primary.headLen * 0.08,
    jawWidth: primary.faceWidth * 0.83,
    subnasaleToChin: primary.earNoseDistance * 0.48 + primary.headHeight * 0.12,
    eyeEarHeight: primary.headHeight - primary.headEarHeight,
  };
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
    previewPoints: createPreviewPoints(normalizedVertices),
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

function createPreviewPoints(vertices) {
  if (vertices.length <= MAX_PREVIEW_POINTS) return vertices.map((_, index) => index);
  const stride = Math.ceil(vertices.length / MAX_PREVIEW_POINTS);
  const previewPoints = [];
  for (let i = 0; i < vertices.length; i += stride) {
    previewPoints.push(i);
  }
  return previewPoints;
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
      <span class="control-value" data-value="${item.key}">${displayValue(item)}</span>
      <div class="control-inputs">
        <input type="range" min="${item.min}" max="${item.max}" value="${state[item.key]}" step="${item.step || 1}" data-key="${item.key}" data-control="range" aria-label="${item.label}" />
        <input type="number" min="${item.min}" max="${item.max}" value="${state[item.key]}" step="${item.step || 1}" data-key="${item.key}" data-control="number" aria-label="${item.label} 手动输入" />
      </div>
    `;
    fragment.appendChild(row);
  });

  controls.appendChild(fragment);
}

function updateControlDisplay(keys = PRIMARY_PARAMETERS.map((item) => item.key)) {
  keys.forEach((key) => {
    const item = PRIMARY_PARAMETERS.find((param) => param.key === key);
    const inputs = controls.querySelectorAll(`[data-key="${key}"]`);
    const value = controls.querySelector(`[data-value="${key}"]`);
    inputs.forEach((input) => {
      input.value = state[key];
    });
    if (value && item) value.textContent = displayValue(item);
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
  const sagittalArc = normalizeParam("sagittalArc");
  const coronalArc = normalizeParam("coronalArc");
  const headEarHeight = normalizeParam("headEarHeight");
  const heightWidthRatio = normalizeParam("headHeightWidthRatio");
  const faceWidth = normalizeParam("faceWidth");
  const jawWidth = normalizeParam("jawWidth", internal.jawWidth);
  const noseHeight = normalizeParam("noseHeight");
  const noseWidth = normalizeParam("noseWidth");
  const subnasaleToChin = normalizeParam("subnasaleToChin", internal.subnasaleToChin);
  const pupilDistance = normalizeParam("pupilDistance");
  const earLength = normalizeParam("earLength");
  const earWidth = normalizeParam("earWidth");

  const xScale = state.headWidth / baseMesh.size.x;
  const yScale = state.headHeight / baseMesh.size.y;
  const zScale = state.headLen / baseMesh.size.z;

  const faceVerticalStretch = faceMask * faceLen * 0.075;
  const lowerVerticalStretch = lower * (subnasaleToChin * 0.08 + faceLen * 0.025);
  const crownLift = crownMask * (headHeight * 4.2 + headCirc * 2.6 + sagittalArc * 2.1 + heightWidthRatio * 1.4);
  const noseLevelShift = noseMask * noseHeight * 1.5;

  let x = vertex.x * xScale;
  let y = vertex.y * yScale;
  let z = vertex.z * zScale;

  x *= 1 + crownMask * (headCirc * 0.028 + coronalArc * 0.04);
  x *= 1 + faceMask * (faceWidth * 0.085 + headCirc * 0.012 + coronalArc * 0.018);
  x *= 1 + jawMask * jawWidth * 0.13;
  x *= 1 + noseMask * (noseWidth * 0.12);
  x += Math.sign(nx) * eyeMask * pupilDistance * 3.2;

  y += Math.sign(ny || -1) * Math.abs(vertex.y) * faceVerticalStretch;
  y -= lowerVerticalStretch * 7.5;
  y += crownLift;
  y += noseLevelShift;
  y -= earMask * headEarHeight * 2.2;

  z *= 1 + front * (headLen * 0.02 + sagittalArc * 0.028) + back * (headLen * 0.032 + headCirc * 0.012 + sagittalArc * 0.03);
  z += noseMask * noseHeight * 8.8;
  z += chinMask * (subnasaleToChin * 4.8 + faceLen * 2.2);
  z -= occiputMask * (headLen * 8.2 + headCirc * 2.5 + sagittalArc * 5.6);
  z += upper * front * (headCirc * 3.2 + headHeight * 2.2);

  return { x, y, z };
}

function generateMesh() {
  if (!baseMesh) return { vertices: [], faces: [] };
  let vertices = normalizeMainDimensions(baseMesh.vertices.map(deformVertex));
  vertices = applyLocalCalibrations(vertices);
  vertices = normalizeMainDimensions(vertices);
  vertices = applyLocalCalibrations(vertices);
  vertices = normalizeMainDimensions(vertices);
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
    y: targetOutputHeadHeight() / size.y,
    z: targetOutputHeadLength() / size.z,
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
    y: getHeadHeightBounds(vertices),
    z: getHeadLengthBounds(vertices),
  };
  return {
    min: { x: axisBounds.x.min, y: axisBounds.y.min, z: axisBounds.z.min },
    max: { x: axisBounds.x.max, y: axisBounds.y.max, z: axisBounds.z.max },
  };
}

function getHeadHeightBounds(vertices) {
  const bounds = getBounds(vertices);
  const min = bounds.min.y;
  const max = bounds.max.y;
  return { min, max, span: max - min || 1, center: (min + max) * 0.5, count: vertices.length };
}

function getHeadLengthBounds(vertices) {
  const bounds = getBounds(vertices);
  const min = bounds.min.z;
  const max = bounds.max.z;
  return { min, max, span: max - min || 1, center: (min + max) * 0.5, count: vertices.length };
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

function getHeadHeightIndexes(part) {
  return baseMesh.vertices
    .map((vertex, index) => ({ index, n: getBaseNormalized(vertex) }))
    .filter(({ n }) => isHeadHeightPoint(n, part))
    .map(({ index }) => index);
}

function isHeadHeightPoint(n, part) {
  const side = Math.abs(n.x);
  if (part === "crown") return side < 0.45 && n.y > 0.55 && n.z > -0.45 && n.z < 0.55;
  if (part === "chin") return side < 0.32 && n.y < -0.5 && n.z > 0.18;
  return false;
}

function spanForIndexes(vertices, indexes, axis) {
  if (!indexes.length) return { min: 0, max: 1, span: 1, center: 0.5, count: 0 };
  let min = Infinity;
  let max = -Infinity;
  indexes.forEach((index) => {
    min = Math.min(min, vertices[index][axis]);
    max = Math.max(max, vertices[index][axis]);
  });
  return { min, max, span: max - min || 1, center: (min + max) * 0.5, count: indexes.length };
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
  const rotX = 0;
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  const scale = Math.min(w, h) / 330;
  return {
    x: w * 0.5 + x1 * scale,
    y: h * 0.52 - y1 * scale,
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

function getPreviewScale() {
  const widthMax = metaFor("headWidth").max;
  const heightMax = targetOutputHeadHeight(metaFor("headHeight").max);
  const lengthMax = targetOutputHeadLength(metaFor("headLen").max);
  return 238 / Math.max(widthMax, heightMax, lengthMax);
}

function drawPreviewBackdrop() {
  const w = canvas.width;
  const h = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#f8fbfb");
  gradient.addColorStop(1, "#e8eef0");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.min(w, h) * 0.48);
  glow.addColorStop(0, "rgba(13, 118, 111, 0.13)");
  glow.addColorStop(0.62, "rgba(217, 110, 56, 0.06)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.78, w * 0.18, h * 0.035, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(22, 25, 31, 0.1)";
  ctx.fill();
}

function drawMesh() {
  if (!baseMesh) {
    drawEmptyState("正在加载基础头部 OBJ...");
    return;
  }

  resizeCanvas();
  drawPreviewBackdrop();

  mesh = generateMesh();
  const fitScale = getPreviewScale();
  const previewVertices = mesh.vertices.map((vertex) => ({
    x: vertex.x * fitScale,
    y: vertex.y * fitScale,
    z: vertex.z * fitScale,
  }));
  const projected = previewVertices.map(project);
  const points = baseMesh.previewPoints
    .map((index) => {
      const point = projected[index];
      const source = previewVertices[index];
      const rim = clamp(Math.abs(source.x) / 118 + Math.abs(source.z) / 210, 0, 1);
      return {
        x: point.x,
        y: point.y,
        z: point.z,
        shade: clamp(0.72 + point.z / 520 - rim * 0.18 + source.y / 900, 0.34, 1),
      };
    })
    .sort((a, b) => a.z - b.z);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  points.forEach((point) => {
    const alpha = 0.28 + point.shade * 0.5;
    const radius = (1.05 + point.shade * 1.2) * (window.devicePixelRatio || 1);
    const red = Math.round(178 + point.shade * 48);
    const green = Math.round(142 + point.shade * 42);
    const blue = Math.round(119 + point.shade * 32);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    ctx.fill();
  });

  if (showWire) {
    ctx.strokeStyle = "rgba(8, 95, 89, 0.12)";
    ctx.lineWidth = 0.65 * (window.devicePixelRatio || 1);
    mesh.previewFaces.slice(0, 1300).forEach((face) => {
      ctx.beginPath();
      ctx.moveTo(projected[face[0]].x, projected[face[0]].y);
      ctx.lineTo(projected[face[1]].x, projected[face[1]].y);
      ctx.lineTo(projected[face[2]].x, projected[face[2]].y);
      ctx.closePath();
      ctx.stroke();
    });
  }

  const previewNote = mesh.previewFaces.length < mesh.faces.length ? ` · 预览 ${mesh.previewFaces.length} faces` : "";
  stats.textContent = `${MODEL_OPTIONS[selectedGender].label} · ${mesh.vertices.length} vertices · ${mesh.faces.length} faces${previewNote}`;
}

function exportObj() {
  const generatedMesh = generateMesh();
  const lines = [
    `# Deformed from ${MODEL_OPTIONS[selectedGender].url}`,
    "# Units: millimeters",
    `o ${selectedGender}_head_parametric_deformed`,
  ];
  generatedMesh.vertices.forEach((v) => {
    lines.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`);
  });
  generatedMesh.faces.forEach((face) => {
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
  });
  syncDerivedModelState();
  updateControlDisplay();
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
    const cacheKey = `${selectedGender}-${MODEL_ASSET_VERSION}`;
    const modelUrl = `${option.url}?v=${MODEL_ASSET_VERSION}`;
    if (!modelCache[cacheKey]) {
      const response = await fetch(modelUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      modelCache[cacheKey] = parseObj(text);
    }
    baseMesh = modelCache[cacheKey];
    drawMesh();
  } catch (error) {
    stats.textContent = "OBJ 加载失败";
    drawEmptyState(`无法加载 ${option.url}`);
    console.error(error);
  }
}

function applyParameterChange(key, rawValue) {
  const item = PRIMARY_PARAMETERS.find((param) => param.key === key);
  if (!item) return;
  if (rawValue === "") return;
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) return;
  state[key] = clamp(numericValue, item.min, item.max);
  if (key === "headHeightWidthRatio") {
    syncDimensionFromRatio();
    syncDerivedModelState();
    updateControlDisplay(["headHeightWidthRatio", "headHeight"]);
  } else if (key === "headHeight" || key === "headWidth") {
    syncRatioFromDimensions();
    syncDerivedModelState();
    updateControlDisplay([key, "headHeightWidthRatio"]);
  } else {
    syncDerivedModelState();
    updateControlDisplay([key]);
  }
  drawMesh();
}

buildControls();
drawMesh();
loadBaseModel();

controls.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-control='range']");
  if (!input) return;
  applyParameterChange(input.dataset.key, input.value);
});

controls.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-control='number']");
  if (!input) return;
  applyParameterChange(input.dataset.key, input.value);
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

