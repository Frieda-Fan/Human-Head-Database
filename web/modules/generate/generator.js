const RANGE_EXPANSION = 0;

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
  { group: "头部尺寸", key: "headCirc", label: "1 头围", min: 520, max: 630, value: 560, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "sagittalArc", label: "5 头矢状弧（纵弧）", min: 310, max: 380, value: 345, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "coronalArc", label: "6 耳屏间弧（横弧）", min: 350, max: 430, value: 390, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "headLen", label: "3 头长", min: 180, max: 250, value: 190, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "headWidth", label: "4 头宽", min: 140, max: 180, value: 155, unit: "mm", step: 1 },
  { group: "头部尺寸", key: "headHeight", label: "7 头高", min: 210, max: 270, value: 225, unit: "mm", step: 1 },
  { group: "面部与比例", key: "pupilDistance", label: "16 瞳距", min: 50, max: 80, value: 64, unit: "mm", step: 1 },
  { group: "面部与比例", key: "headEarHeight", label: "22 头耳高", min: 120, max: 170, value: 145, unit: "mm", step: 1 },
  { group: "面部与比例", key: "earNoseDistance", label: "23 耳鼻距", min: 80, max: 100, value: 86, unit: "mm", step: 1 },
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
const MODEL_ASSET_VERSION = "base-models-20260604-male-cheeks";
const SEMANTIC_REGIONS_URL = "/web/modules/generate/assets/models/semantic-regions.json";
const SEMANTIC_REGIONS_VERSION = "welded-regions-20260622";
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
let semanticRegionsPromise = null;
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
  return value * 1.17;
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
    subnasaleToChin: metaFor("earNoseDistance").value * 0.48 + primary.headHeight * 0.12,
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

function deformVertex(vertex, index) {
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
  const faceMask = Math.max(getSemanticWeight("leftCheek", index), getSemanticWeight("rightCheek", index));
  const jawMask = front * gaussian(ny, -0.62, 0.28);
  const chinMask = front * gaussian(ny, -0.86, 0.18) * smoothstep(0.7, 0.05, side);
  const eyeMask = front * gaussian(ny, 0.16, 0.19) * gaussian(side, 0.32, 0.16);
  const crownMask = upper * smoothstep(0.8, 0.1, side);
  const occiputMask = back * gaussian(ny, 0.0, 0.78);
  const internal = computeInternalModelParameters(state);

  const headCirc = normalizeParam("headCirc");
  const faceLen = normalizeParam("faceLen", internal.faceLen);
  const headLen = normalizeParam("headLen");
  const headHeight = normalizeParam("headHeight");
  const sagittalArc = normalizeParam("sagittalArc");
  const coronalArc = normalizeParam("coronalArc");
  const heightWidthRatio = normalizeParam("headHeightWidthRatio");
  const faceWidth = normalizeParam("faceWidth");
  const jawWidth = normalizeParam("jawWidth", internal.jawWidth);
  const subnasaleToChin = normalizeParam("subnasaleToChin", internal.subnasaleToChin);
  const pupilDistance = normalizeParam("pupilDistance");

  const xScale = state.headWidth / baseMesh.size.x;
  const yScale = state.headHeight / baseMesh.size.y;
  const zScale = state.headLen / baseMesh.size.z;

  const faceVerticalStretch = faceMask * faceLen * 0.075;
  const lowerVerticalStretch = lower * (subnasaleToChin * 0.08 + faceLen * 0.025);
  const crownLift = crownMask * (headHeight * 4.2 + headCirc * 2.6 + sagittalArc * 2.1 + heightWidthRatio * 1.4);

  let x = vertex.x * xScale;
  let y = vertex.y * yScale;
  let z = vertex.z * zScale;

  x *= 1 + crownMask * (headCirc * 0.028 + coronalArc * 0.04);
  x *= 1 + faceMask * (faceWidth * 0.085 + headCirc * 0.012 + coronalArc * 0.018);
  x *= 1 + jawMask * jawWidth * 0.13;
  x += Math.sign(nx) * eyeMask * pupilDistance * 3.2;

  y += Math.sign(ny || -1) * Math.abs(vertex.y) * faceVerticalStretch;
  y -= lowerVerticalStretch * 7.5;
  y += crownLift;

  z *= 1 + front * (headLen * 0.02 + sagittalArc * 0.028) + back * (headLen * 0.032 + headCirc * 0.012 + sagittalArc * 0.03);
  z += chinMask * (subnasaleToChin * 4.8 + faceLen * 2.2);
  z -= occiputMask * (headLen * 8.2 + headCirc * 2.5 + sagittalArc * 5.6);
  z += upper * front * (headCirc * 3.2 + headHeight * 2.2);

  return { x, y, z };
}

function generateMesh() {
  if (!baseMesh) return { vertices: [], faces: [] };
  let vertices = normalizeMainDimensions(baseMesh.vertices.map(deformVertex));
  const normalizedAudit = location.hostname === "127.0.0.1" || location.hostname === "localhost" ? auditMeshGeometry(vertices) : null;
  const beforeLocal = normalizedAudit ? vertices.map((vertex) => ({ ...vertex })) : null;
  vertices = applyLocalCalibrations(vertices);
  return {
    vertices,
    faces: baseMesh.faces,
    previewFaces: baseMesh.previewFaces,
    audit: normalizedAudit
      ? { normalized: normalizedAudit, final: auditMeshGeometry(vertices), localDelta: deformationDeltaStats(beforeLocal, vertices) }
      : null,
  };
}

async function loadSemanticRegionAsset() {
  if (!semanticRegionsPromise) {
    semanticRegionsPromise = fetch(`${SEMANTIC_REGIONS_URL}?v=${SEMANTIC_REGIONS_VERSION}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Semantic regions HTTP ${response.status}`);
        return response.json();
      })
      .then((asset) => {
        if (asset.version !== 2 || !asset.models) throw new Error("Unsupported semantic region asset");
        return asset;
      });
  }
  return semanticRegionsPromise;
}

function hydrateSemanticRegions(model, definition, gender) {
  if (!definition || definition.vertexCount !== model.vertices.length) {
    throw new Error(`${gender} semantic regions do not match the base model`);
  }
  if (!Array.isArray(definition.weldGroups)) throw new Error(`${gender} semantic regions are missing weld groups`);
  model.weldGroups = definition.weldGroups.map((group) => Object.freeze([...group]));
  model.adjacency = buildMeshAdjacency(model.vertices.length, model.faces, model.weldGroups);
  const regions = {};
  Object.entries(definition.regions).forEach(([name, region]) => {
    const weights = new Float32Array(model.vertices.length);
    region.core.forEach((index) => {
      if (index < 0 || index >= model.vertices.length) throw new Error(`${gender}.${name} contains an invalid vertex`);
      weights[index] = 1;
    });
    region.blend.forEach(([index, weight]) => {
      if (index < 0 || index >= model.vertices.length) throw new Error(`${gender}.${name} contains an invalid blend vertex`);
      weights[index] = Math.max(weights[index], weight);
    });
    regions[name] = {
      core: Object.freeze([...region.core]),
      influences: Object.freeze(Array.from(weights, (weight, index) => ({ index, weight })).filter(({ weight }) => weight > 0)),
      weights,
    };
  });
  return Object.freeze(regions);
}

function buildMeshAdjacency(vertexCount, faces, weldGroups) {
  const adjacency = Array.from({ length: vertexCount }, () => new Set());
  faces.forEach((face) => {
    for (let edge = 0; edge < 3; edge += 1) {
      const from = face[edge];
      const to = face[(edge + 1) % 3];
      adjacency[from].add(to);
      adjacency[to].add(from);
    }
  });
  weldGroups.forEach((group) => {
    const representative = group[0];
    group.slice(1).forEach((index) => {
      adjacency[representative].add(index);
      adjacency[index].add(representative);
    });
  });
  return adjacency.map((neighbors) => Object.freeze([...neighbors]));
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
  return baseMesh?.semanticRegions?.[name]?.core || [];
}

function getSemanticWeight(name, index) {
  return baseMesh?.semanticRegions?.[name]?.weights[index] || 0;
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

function getInfluenceWeights(name) {
  return baseMesh?.semanticRegions?.[name]?.influences || [];
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

function uniformRegionScale(vertices, baseVertices, indexes, currentCenter, baseCenter) {
  let currentRadiusSquared = 0;
  let baseRadiusSquared = 0;
  indexes.forEach((index) => {
    const current = vertices[index];
    const base = baseVertices[index];
    currentRadiusSquared +=
      (current.x - currentCenter.x) ** 2 +
      (current.y - currentCenter.y) ** 2 +
      (current.z - currentCenter.z) ** 2;
    baseRadiusSquared +=
      (base.x - baseCenter.x) ** 2 +
      (base.y - baseCenter.y) ** 2 +
      (base.z - baseCenter.z) ** 2;
  });
  return baseRadiusSquared > 0 ? Math.sqrt(currentRadiusSquared / baseRadiusSquared) : 1;
}

function getRegionShapeTargets(vertices, name) {
  const indexes = getLocalMask(name);
  if (!indexes.length) return [];
  const currentCenter = centerForIndexes(vertices, indexes);
  const baseCenter = centerForIndexes(baseMesh.vertices, indexes);
  const scale = uniformRegionScale(vertices, baseMesh.vertices, indexes, currentCenter, baseCenter);
  return indexes.map((index) => {
    const base = baseMesh.vertices[index];
    return {
      index,
      target: {
        x: currentCenter.x + (base.x - baseCenter.x) * scale,
        y: currentCenter.y + (base.y - baseCenter.y) * scale,
        z: currentCenter.z + (base.z - baseCenter.z) * scale,
      },
    };
  });
}

function synchronizeWeldedVertices(vertices) {
  baseMesh.weldGroups.forEach((group) => {
    const center = centerForIndexes(vertices, group);
    group.forEach((index) => {
      vertices[index] = { ...center };
    });
  });
}

function addConstraint(constraints, index, target, strength = 1) {
  const constraint = constraints.get(index) || { targets: [] };
  constraint.targets.push({ target, strength });
  constraints.set(index, constraint);
}

function averagedConstraintTarget(constraint) {
  const totalWeight = constraint.targets.reduce((sum, item) => sum + Math.max(item.strength, 0.001), 0) || 1;
  const target = constraint.targets.reduce(
    (sum, item) => {
      const weight = Math.max(item.strength, 0.001);
      return {
        x: sum.x + item.target.x * weight,
        y: sum.y + item.target.y * weight,
        z: sum.z + item.target.z * weight,
      };
    },
    { x: 0, y: 0, z: 0 },
  );
  target.x /= totalWeight;
  target.y /= totalWeight;
  target.z /= totalWeight;
  return {
    target,
    strength: Math.max(...constraint.targets.map((item) => item.strength)),
  };
}

function collectActiveWeights(names) {
  const active = new Map();
  names.forEach((name) => {
    getInfluenceWeights(name).forEach(({ index, weight }) => {
      active.set(index, Math.max(active.get(index) || 0, weight));
    });
  });
  return active;
}

function expandActiveWeights(activeWeights, rings = 2, falloff = 0.72) {
  const expanded = new Map(activeWeights);
  let frontier = [...activeWeights.entries()];
  for (let ring = 0; ring < rings; ring += 1) {
    const next = new Map();
    frontier.forEach(([index, weight]) => {
      baseMesh.adjacency[index].forEach((neighbor) => {
        const nextWeight = weight * falloff;
        if (nextWeight <= 0.05) return;
        const current = expanded.get(neighbor) || 0;
        if (nextWeight > current) {
          expanded.set(neighbor, nextWeight);
          next.set(neighbor, nextWeight);
        }
      });
    });
    frontier = [...next.entries()];
    if (!frontier.length) break;
  }
  return expanded;
}

function earTranslation(vertices) {
  const leftRoot = getLocalMask("leftEarRoot");
  const rightRoot = getLocalMask("rightEarRoot");
  const noseRoot = getLocalMask("noseRoot");
  if (!leftRoot.length || !rightRoot.length || !noseRoot.length) return { x: 0, y: 0, z: 0 };

  const leftCenter = centerForIndexes(vertices, leftRoot);
  const rightCenter = centerForIndexes(vertices, rightRoot);
  const noseCenter = centerForIndexes(vertices, noseRoot);
  const currentEarCenter = {
    y: (leftCenter.y + rightCenter.y) * 0.5,
    z: (leftCenter.z + rightCenter.z) * 0.5,
  };
  const crownY = getHeadHeightBounds(vertices).max;
  return {
    x: 0,
    y: crownY - state.headEarHeight - currentEarCenter.y,
    z: noseCenter.z - state.earNoseDistance - currentEarCenter.z,
  };
}

function subtractVector(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addVector(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVector(v, factor) {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

function multiplyMatrixVector(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

function identityMatrix3() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

function transposeMatrix3(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function multiplyMatrix3(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function invertMatrix3(m) {
  const det =
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6]);
  if (Math.abs(det) < 1e-9) return null;
  const invDet = 1 / det;
  return [
    (m[4] * m[8] - m[5] * m[7]) * invDet,
    (m[2] * m[7] - m[1] * m[8]) * invDet,
    (m[1] * m[5] - m[2] * m[4]) * invDet,
    (m[5] * m[6] - m[3] * m[8]) * invDet,
    (m[0] * m[8] - m[2] * m[6]) * invDet,
    (m[2] * m[3] - m[0] * m[5]) * invDet,
    (m[3] * m[7] - m[4] * m[6]) * invDet,
    (m[1] * m[6] - m[0] * m[7]) * invDet,
    (m[0] * m[4] - m[1] * m[3]) * invDet,
  ];
}

function orthonormalizeMatrix3(matrix) {
  let rotation = matrix.slice();
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const inverse = invertMatrix3(rotation);
    if (!inverse) break;
    const inverseTranspose = transposeMatrix3(inverse);
    rotation = rotation.map((value, index) => (value + inverseTranspose[index]) * 0.5);
  }

  let x = { x: rotation[0], y: rotation[3], z: rotation[6] };
  let y = { x: rotation[1], y: rotation[4], z: rotation[7] };
  const xLen = Math.hypot(x.x, x.y, x.z) || 1;
  x = scaleVector(x, 1 / xLen);
  const dotXY = x.x * y.x + x.y * y.y + x.z * y.z;
  y = subtractVector(y, scaleVector(x, dotXY));
  const yLen = Math.hypot(y.x, y.y, y.z) || 1;
  y = scaleVector(y, 1 / yLen);
  const z = {
    x: x.y * y.z - x.z * y.y,
    y: x.z * y.x - x.x * y.z,
    z: x.x * y.y - x.y * y.x,
  };
  return [x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z];
}

function covarianceToRotation(covariance) {
  const basis = [
    covariance.xx,
    covariance.xy,
    covariance.xz,
    covariance.yx,
    covariance.yy,
    covariance.yz,
    covariance.zx,
    covariance.zy,
    covariance.zz,
  ];
  const rotation = orthonormalizeMatrix3(basis);
  const det =
    rotation[0] * (rotation[4] * rotation[8] - rotation[5] * rotation[7]) -
    rotation[1] * (rotation[3] * rotation[8] - rotation[5] * rotation[6]) +
    rotation[2] * (rotation[3] * rotation[7] - rotation[4] * rotation[6]);
  if (det >= 0) return rotation;
  return [rotation[0], rotation[1], -rotation[2], rotation[3], rotation[4], -rotation[5], rotation[6], rotation[7], -rotation[8]];
}

function buildArapRotations(restVertices, currentVertices, activeIndexes) {
  const rotations = new Map();
  activeIndexes.forEach((index) => {
    const neighbors = baseMesh.adjacency[index];
    if (!neighbors.length) {
      rotations.set(index, identityMatrix3());
      return;
    }
    const covariance = { xx: 0, xy: 0, xz: 0, yx: 0, yy: 0, yz: 0, zx: 0, zy: 0, zz: 0 };
    const restOrigin = restVertices[index];
    const currentOrigin = currentVertices[index];
    neighbors.forEach((neighbor) => {
      const p = subtractVector(restVertices[neighbor], restOrigin);
      const q = subtractVector(currentVertices[neighbor], currentOrigin);
      covariance.xx += q.x * p.x;
      covariance.xy += q.x * p.y;
      covariance.xz += q.x * p.z;
      covariance.yx += q.y * p.x;
      covariance.yy += q.y * p.y;
      covariance.yz += q.y * p.z;
      covariance.zx += q.z * p.x;
      covariance.zy += q.z * p.y;
      covariance.zz += q.z * p.z;
    });
    rotations.set(index, covarianceToRotation(covariance));
  });
  return rotations;
}

function solveSmoothDisplacement(vertices, constraints, activeWeights, iterations = 24, restVerticesOverride = null) {
  const activeIndexes = [...activeWeights.keys()];
  if (!activeIndexes.length) return;
  const restVertices = restVerticesOverride || vertices.map((vertex) => ({ ...vertex }));
  const fixed = new Uint8Array(vertices.length);
  const constraintTargets = new Map();
  constraints.forEach((constraint, index) => {
    const averaged = averagedConstraintTarget(constraint);
    fixed[index] = averaged.strength >= 0.95 ? 1 : 0;
    constraintTargets.set(index, averaged);
  });
  constraintTargets.forEach(({ target, strength }, index) => {
    const amount = fixed[index] ? 1 : Math.min(strength, 0.65);
    vertices[index] = {
      x: vertices[index].x + (target.x - vertices[index].x) * amount,
      y: vertices[index].y + (target.y - vertices[index].y) * amount,
      z: vertices[index].z + (target.z - vertices[index].z) * amount,
    };
  });

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const rotations = buildArapRotations(restVertices, vertices, activeIndexes);
    const next = vertices.map((vertex) => ({ ...vertex }));

    activeIndexes.forEach((index) => {
      if (fixed[index]) {
        next[index] = { ...constraintTargets.get(index).target };
        return;
      }
      const neighbors = baseMesh.adjacency[index];
      if (!neighbors.length) return;

      let rhs = { x: 0, y: 0, z: 0 };
      const rotationI = rotations.get(index) || identityMatrix3();
      neighbors.forEach((neighbor) => {
        const rotationJ = rotations.get(neighbor) || rotationI;
        const restEdge = subtractVector(restVertices[index], restVertices[neighbor]);
        const rotated = scaleVector(addVector(multiplyMatrixVector(rotationI, restEdge), multiplyMatrixVector(rotationJ, restEdge)), 0.5);
        rhs = addVector(rhs, addVector(vertices[neighbor], rotated));
      });

      const envelope = activeWeights.get(index) || 0;
      const constraint = constraintTargets.get(index);
      if (constraint) {
        const targetWeight = constraint.strength * 7;
        rhs = addVector(rhs, scaleVector(constraint.target, targetWeight));
      }
      const anchorWeight = 0.18 + (1 - envelope) * 0.82;
      rhs = addVector(rhs, scaleVector(restVertices[index], anchorWeight));
      const constraintWeight = constraint ? constraint.strength * 7 : 0;
      const solved = scaleVector(rhs, 1 / (baseMesh.adjacency[index].length + anchorWeight + constraintWeight));
      next[index] = {
        x: restVertices[index].x + (solved.x - restVertices[index].x) * envelope,
        y: restVertices[index].y + (solved.y - restVertices[index].y) * envelope,
        z: restVertices[index].z + (solved.z - restVertices[index].z) * envelope,
      };
    });

    constraintTargets.forEach(({ target }, index) => {
      if (fixed[index]) next[index] = { ...target };
    });
    for (let index = 0; index < vertices.length; index += 1) vertices[index] = next[index];
    synchronizeWeldedVertices(vertices);
  }
}

function countOrientationChanges(reference, candidate) {
  let changes = 0;
  baseMesh.faces.forEach((face) => {
    const referenceNormal = faceNormal(face, reference);
    const candidateNormal = faceNormal(face, candidate);
    if (
      referenceNormal.x * candidateNormal.x +
        referenceNormal.y * candidateNormal.y +
        referenceNormal.z * candidateNormal.z <
      0
    ) {
      changes += 1;
    }
  });
  return changes;
}

function countBaseOrientationChanges(vertices) {
  return countOrientationChanges(baseMesh.vertices, vertices);
}

function limitLocalDeformation(source, candidate) {
  const sourceFlips = countBaseOrientationChanges(source);
  const isSafe = (vertices) =>
    countOrientationChanges(source, vertices) === 0 && countBaseOrientationChanges(vertices) <= sourceFlips;
  if (isSafe(candidate)) return candidate;
  let safe = 0;
  let unsafe = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const amount = (safe + unsafe) * 0.5;
    const blended = source.map((vertex, index) => ({
      x: vertex.x + (candidate[index].x - vertex.x) * amount,
      y: vertex.y + (candidate[index].y - vertex.y) * amount,
      z: vertex.z + (candidate[index].z - vertex.z) * amount,
    }));
    if (isSafe(blended)) safe = amount;
    else unsafe = amount;
  }
  return source.map((vertex, index) => ({
    x: vertex.x + (candidate[index].x - vertex.x) * safe,
    y: vertex.y + (candidate[index].y - vertex.y) * safe,
    z: vertex.z + (candidate[index].z - vertex.z) * safe,
  }));
}

function applyLocalCalibrations(vertices) {
  const source = vertices.map((vertex) => ({ ...vertex }));
  const calibrated = vertices.map((vertex) => ({ ...vertex }));
  const cheeks = [...getLocalMask("leftCheek"), ...getLocalMask("rightCheek")];
  const cheekInfluences = new Map();
  [...getInfluenceWeights("leftCheek"), ...getInfluenceWeights("rightCheek")].forEach(({ index, weight }) => {
    cheekInfluences.set(index, Math.max(cheekInfluences.get(index) || 0, weight));
  });
  scaleWithFalloff(
    calibrated,
    cheeks,
    [...cheekInfluences].map(([index, weight]) => ({ index, weight })),
    "x",
    state.faceWidth,
  );

  synchronizeWeldedVertices(calibrated);
  const lockNames = ["leftEyeSocket", "rightEyeSocket", "nose", "leftBrow", "rightBrow", "leftEar", "rightEar"];
  const arapNames = [...lockNames, "leftCheek", "rightCheek", "leftEarRoot", "rightEarRoot", "noseRoot"];
  const constraints = new Map();
  const earTargets = new Map();
  cheekInfluences.forEach((weight, index) => {
    if (weight > 0.12) addConstraint(constraints, index, calibrated[index], Math.min(0.72, weight * 0.62));
  });
  lockNames.forEach((name) => {
    getRegionShapeTargets(calibrated, name).forEach(({ index, target }) => {
      if (name === "leftEar" || name === "rightEar") earTargets.set(index, target);
      else addConstraint(constraints, index, target);
    });
  });
  const provisional = calibrated.map((vertex) => ({ ...vertex }));
  earTargets.forEach((target, index) => {
    provisional[index] = { ...target };
  });
  const delta = earTranslation(provisional);
  earTargets.forEach((target, index) => {
    addConstraint(constraints, index, { x: target.x + delta.x, y: target.y + delta.y, z: target.z + delta.z });
  });
  const activeWeights = expandActiveWeights(collectActiveWeights(arapNames), 5, 0.82);
  solveSmoothDisplacement(calibrated, constraints, activeWeights, 26, source);
  synchronizeWeldedVertices(calibrated);
  const safe = limitLocalDeformation(source, calibrated);
  synchronizeWeldedVertices(safe);
  return safe;
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

function auditMeshGeometry(vertices) {
  let maxSeamGap = 0;
  baseMesh.weldGroups.forEach((group) => {
    const anchor = vertices[group[0]];
    group.slice(1).forEach((index) => {
      const vertex = vertices[index];
      maxSeamGap = Math.max(maxSeamGap, Math.hypot(vertex.x - anchor.x, vertex.y - anchor.y, vertex.z - anchor.z));
    });
  });
  let flippedFaces = 0;
  let degenerateFaces = 0;
  baseMesh.faces.forEach((face) => {
    const baseNormal = faceNormal(face, baseMesh.vertices);
    const currentNormal = faceNormal(face, vertices);
    const baseArea = Math.hypot(baseNormal.x, baseNormal.y, baseNormal.z);
    const currentArea = Math.hypot(currentNormal.x, currentNormal.y, currentNormal.z);
    if (currentArea < baseArea * 1e-4) degenerateFaces += 1;
    if (baseNormal.x * currentNormal.x + baseNormal.y * currentNormal.y + baseNormal.z * currentNormal.z < 0) flippedFaces += 1;
  });
  return { maxSeamGap, flippedFaces, degenerateFaces };
}

function deformationDeltaStats(source, candidate) {
  let max = 0;
  let sum = 0;
  let moved = 0;
  source.forEach((vertex, index) => {
    const next = candidate[index];
    const distance = Math.hypot(next.x - vertex.x, next.y - vertex.y, next.z - vertex.z);
    max = Math.max(max, distance);
    sum += distance;
    if (distance > 0.05) moved += 1;
  });
  return {
    max: Number(max.toFixed(4)),
    mean: Number((sum / Math.max(source.length, 1)).toFixed(4)),
    moved,
  };
}

function drawMesh() {
  if (!baseMesh) {
    drawEmptyState("正在加载基础头部 OBJ...");
    return;
  }

  resizeCanvas();
  drawPreviewBackdrop();

  mesh = generateMesh();
  if (mesh.audit) canvas.dataset.meshAudit = JSON.stringify(mesh.audit);
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
    const semanticAssetPromise = loadSemanticRegionAsset();
    if (!modelCache[cacheKey]) {
      const response = await fetch(modelUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      modelCache[cacheKey] = parseObj(text);
    }
    baseMesh = modelCache[cacheKey];
    if (!baseMesh.semanticRegions) {
      const semanticAsset = await semanticAssetPromise;
      baseMesh.semanticRegions = hydrateSemanticRegions(baseMesh, semanticAsset.models[selectedGender], selectedGender);
    }
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

