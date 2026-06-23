import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelDirectory = path.join(root, "web", "modules", "generate", "assets", "models");
const outputPath = path.join(modelDirectory, "semantic-regions.json");
const models = {
  male: "asian-head.obj",
  female: "female-head.obj",
};

function parseObj(text) {
  const vertices = [];
  const faces = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/);
      vertices.push({ x: Number(x), y: Number(y), z: Number(z) });
    } else if (line.startsWith("f ")) {
      const indexes = line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((token) => Number(token.split("/")[0]) - 1);
      for (let index = 1; index < indexes.length - 1; index += 1) {
        faces.push([indexes[0], indexes[index], indexes[index + 1]]);
      }
    }
  }
  return { vertices, faces };
}

function getBounds(vertices) {
  return vertices.reduce(
    (bounds, vertex) => ({
      min: {
        x: Math.min(bounds.min.x, vertex.x),
        y: Math.min(bounds.min.y, vertex.y),
        z: Math.min(bounds.min.z, vertex.z),
      },
      max: {
        x: Math.max(bounds.max.x, vertex.x),
        y: Math.max(bounds.max.y, vertex.y),
        z: Math.max(bounds.max.z, vertex.z),
      },
    }),
    {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity },
    },
  );
}

function findComponents(adjacency) {
  const componentByVertex = new Int32Array(adjacency.length).fill(-1);
  const components = [];
  for (let start = 0; start < adjacency.length; start += 1) {
    if (componentByVertex[start] !== -1) continue;
    const componentId = components.length;
    const queue = [start];
    const indexes = [];
    componentByVertex[start] = componentId;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      indexes.push(index);
      adjacency[index].forEach((neighbor) => {
        if (componentByVertex[neighbor] !== -1) return;
        componentByVertex[neighbor] = componentId;
        queue.push(neighbor);
      });
    }
    components.push(indexes);
  }
  return { components, componentByVertex };
}

function buildTopology(vertices, faces) {
  const faceAdjacency = Array.from({ length: vertices.length }, () => new Set());
  faces.forEach((face) => {
    for (let edge = 0; edge < 3; edge += 1) {
      const from = face[edge];
      const to = face[(edge + 1) % 3];
      faceAdjacency[from].add(to);
      faceAdjacency[to].add(from);
    }
  });
  const faceComponents = findComponents(faceAdjacency).components;
  const adjacency = faceAdjacency.map((neighbors) => new Set(neighbors));
  const positionGroups = new Map();
  vertices.forEach((vertex, index) => {
    const key = `${vertex.x.toFixed(5)},${vertex.y.toFixed(5)},${vertex.z.toFixed(5)}`;
    const group = positionGroups.get(key) || [];
    group.push(index);
    positionGroups.set(key, group);
  });
  const weldGroups = [...positionGroups.values()].filter((group) => group.length > 1);
  weldGroups.forEach((group) => {
    const representative = group[0];
    group.slice(1).forEach((index) => {
      adjacency[representative].add(index);
      adjacency[index].add(representative);
    });
  });
  const { components, componentByVertex } = findComponents(adjacency);
  return { adjacency, faceAdjacency, faceComponents, components, componentByVertex, weldGroups };
}

function normalizedVertices(vertices) {
  const bounds = getBounds(vertices);
  const center = {
    x: (bounds.min.x + bounds.max.x) * 0.5,
    y: (bounds.min.y + bounds.max.y) * 0.5,
    z: (bounds.min.z + bounds.max.z) * 0.5,
  };
  const half = {
    x: (bounds.max.x - bounds.min.x) * 0.5,
    y: (bounds.max.y - bounds.min.y) * 0.5,
    z: (bounds.max.z - bounds.min.z) * 0.5,
  };
  return vertices.map((vertex) => ({
    x: (vertex.x - center.x) / half.x,
    y: (vertex.y - center.y) / half.y,
    z: (vertex.z - center.z) / half.z,
  }));
}

function expandBlend(core, adjacency, allowed, ringCount = 4) {
  const coreSet = new Set(core);
  const visited = new Set(core);
  let frontier = [...core];
  const blend = [];
  for (let ring = 1; ring <= ringCount; ring += 1) {
    const next = [];
    frontier.forEach((index) => {
      adjacency[index].forEach((neighbor) => {
        if (visited.has(neighbor) || !allowed.has(neighbor)) return;
        visited.add(neighbor);
        next.push(neighbor);
        blend.push([neighbor, Number((1 - ring / (ringCount + 1)).toFixed(3))]);
      });
    });
    frontier = next;
  }
  return { core: [...coreSet].sort((a, b) => a - b), blend: blend.sort((a, b) => a[0] - b[0]) };
}

function propagateWeldWeights(region, weldGroups) {
  const weights = new Map(region.blend);
  region.core.forEach((index) => weights.set(index, 1));
  weldGroups.forEach((group) => {
    const weight = Math.max(...group.map((index) => weights.get(index) || 0));
    if (weight <= 0) return;
    group.forEach((index) => weights.set(index, weight));
  });
  return {
    core: [...weights].filter(([, weight]) => weight >= 0.999).map(([index]) => index).sort((a, b) => a - b),
    blend: [...weights]
      .filter(([, weight]) => weight > 0 && weight < 0.999)
      .map(([index, weight]) => [index, weight])
      .sort((a, b) => a[0] - b[0]),
  };
}

function makeCoresExclusive(regions, names) {
  const assigned = new Set();
  names.forEach((name) => {
    const region = regions[name];
    const demoted = region.core.filter((index) => assigned.has(index));
    region.core = region.core.filter((index) => !assigned.has(index));
    region.core.forEach((index) => assigned.add(index));
    const blend = new Map(region.blend);
    demoted.forEach((index) => blend.set(index, Math.max(blend.get(index) || 0, 0.95)));
    region.blend = [...blend].sort((a, b) => a[0] - b[0]);
  });
}

function select(indexes, normalized, predicate) {
  return indexes.filter((index) => predicate(normalized[index], index));
}

function closestSeed(indexes, normalized, target) {
  return indexes.reduce(
    (best, index) => {
      const point = normalized[index];
      const distance =
        (point.x - target.x) ** 2 +
        (point.y - target.y) ** 2 +
        (point.z - target.z) ** 2;
      return distance < best.distance ? { index, distance } : best;
    },
    { index: -1, distance: Infinity },
  ).index;
}

function growPatch(seed, adjacency, allowed, ringCount) {
  if (seed < 0) return [];
  const visited = new Set([seed]);
  let frontier = [seed];
  for (let ring = 0; ring < ringCount; ring += 1) {
    const next = [];
    frontier.forEach((index) => {
      adjacency[index].forEach((neighbor) => {
        if (visited.has(neighbor) || !allowed.has(neighbor)) return;
        visited.add(neighbor);
        next.push(neighbor);
      });
    });
    frontier = next;
  }
  return [...visited];
}

function mirrorPatch(source, candidates, normalized) {
  const candidateIndexes = [...candidates];
  const mirrored = new Set();
  source.forEach((sourceIndex) => {
    const point = normalized[sourceIndex];
    const target = { x: -point.x, y: point.y, z: point.z };
    mirrored.add(closestSeed(candidateIndexes, normalized, target));
  });
  return [...mirrored].filter((index) => index >= 0);
}

function quantile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function buildRegions(mesh, gender) {
  const { vertices, faces } = mesh;
  const normalized = normalizedVertices(vertices);
  const { adjacency, components, faceComponents, weldGroups } = buildTopology(vertices, faces);
  const surface = [...components]
    .filter((component) => component.length > 3000)
    .sort((a, b) => b.length - a.length)[0];
  if (!surface) throw new Error(`${gender}: head surface component not found`);
  const surfaceSet = new Set(surface);

  const sideSurface = (side) => new Set(surface.filter((index) => (side === "left" ? normalized[index].x < 0 : normalized[index].x > 0)));
  const leftSurface = sideSurface("left");
  const rightSurface = sideSurface("right");
  const topologyPatch = (allowed, target, rings) =>
    growPatch(closestSeed([...allowed], normalized, target), adjacency, allowed, rings);
  const pairedPatch = (leftTarget, rightTarget, rings) => {
    const leftCandidate = topologyPatch(leftSurface, leftTarget, rings);
    const rightCandidate = topologyPatch(rightSurface, rightTarget, rings);
    if (leftCandidate.length >= rightCandidate.length) {
      return [leftCandidate, mirrorPatch(leftCandidate, rightSurface, normalized)];
    }
    return [mirrorPatch(rightCandidate, leftSurface, normalized), rightCandidate];
  };
  const [leftCheek, rightCheek] = pairedPatch(
    { x: -0.45, y: -0.14, z: 0.72 },
    { x: 0.45, y: -0.14, z: 0.72 },
    10,
  );
  const [leftEyeSocket, rightEyeSocket] = pairedPatch(
    { x: -0.32, y: 0.14, z: 0.78 },
    { x: 0.32, y: 0.14, z: 0.78 },
    8,
  );
  const [leftBrow, rightBrow] = pairedPatch(
    { x: -0.32, y: 0.31, z: 0.72 },
    { x: 0.32, y: 0.31, z: 0.72 },
    6,
  );
  const noseSurface = new Set(
    surface.filter((index) => {
      const point = normalized[index];
      return Math.abs(point.x) <= 0.26 && point.y >= -0.38 && point.y <= 0.3;
    }),
  );
  const protectedFaceIndexes = new Set([...leftEyeSocket, ...rightEyeSocket, ...leftBrow, ...rightBrow]);
  const nose = topologyPatch(noseSurface, { x: 0, y: -0.1, z: 0.96 }, 11).filter(
    (index) => !protectedFaceIndexes.has(index),
  );
  const noseRoot = topologyPatch(noseSurface, { x: 0, y: 0.18, z: 0.76 }, 4);

  const earComponents = faceComponents.filter((component) => {
    if (component.length < 250 || component.length > 1200) return false;
    const centerX = component.reduce((sum, index) => sum + normalized[index].x, 0) / component.length;
    return Math.abs(centerX) > 0.72;
  });
  const componentEar = (side) =>
    earComponents.find((component) => {
      const centerX = component.reduce((sum, index) => sum + normalized[index].x, 0) / component.length;
      return side === "left" ? centerX < 0 : centerX > 0;
    });
  const coordinateEar = (side) =>
    surface.filter((index) => {
      const point = normalized[index];
      const sideMatch = side === "left" ? point.x < 0 : point.x > 0;
      return sideMatch && Math.abs(point.x) >= 0.69 && point.y >= -0.34 && point.y <= 0.28 && point.z >= -0.52 && point.z <= 0.2;
    });
  const leftEar = componentEar("left") || coordinateEar("left");
  const rightEar = componentEar("right") || coordinateEar("right");

  const rootFromEar = (ear) => {
    const cutoff = quantile(ear.map((index) => Math.abs(normalized[index].x)), 0.32);
    return ear.filter((index) => Math.abs(normalized[index].x) <= cutoff);
  };
  const leftEarRoot = rootFromEar(leftEar);
  const rightEarRoot = rootFromEar(rightEar);
  const earAllowed = new Set([...surfaceSet, ...leftEar, ...rightEar]);
  const lockedFaceIndexes = new Set([
    ...leftEyeSocket,
    ...rightEyeSocket,
    ...leftBrow,
    ...rightBrow,
    ...nose,
  ]);
  lockedFaceIndexes.forEach((index) => earAllowed.delete(index));

  const region = (core, allowed = surfaceSet, rings = 10) => propagateWeldWeights(expandBlend(core, adjacency, allowed, rings), weldGroups);
  const regions = {
    leftCheek: region(leftCheek, surfaceSet, 14),
    rightCheek: region(rightCheek, surfaceSet, 14),
    leftEyeSocket: region(leftEyeSocket, surfaceSet, 12),
    rightEyeSocket: region(rightEyeSocket, surfaceSet, 12),
    leftBrow: region(leftBrow, surfaceSet, 12),
    rightBrow: region(rightBrow, surfaceSet, 12),
    nose: region(nose, surfaceSet, 14),
    noseRoot: region(noseRoot, surfaceSet, 8),
    leftEar: region(leftEar, earAllowed, 18),
    rightEar: region(rightEar, earAllowed, 18),
    leftEarRoot: region(leftEarRoot, earAllowed, 10),
    rightEarRoot: region(rightEarRoot, earAllowed, 10),
  };
  makeCoresExclusive(regions, ["leftEyeSocket", "rightEyeSocket", "leftBrow", "rightBrow", "nose"]);

  const minimums = {
    leftCheek: 40,
    rightCheek: 40,
    leftEyeSocket: 25,
    rightEyeSocket: 25,
    leftBrow: 15,
    rightBrow: 15,
    nose: 80,
    noseRoot: 5,
    leftEar: 100,
    rightEar: 100,
    leftEarRoot: 20,
    rightEarRoot: 20,
  };
  Object.entries(minimums).forEach(([name, minimum]) => {
    if (regions[name].core.length < minimum) {
      throw new Error(`${gender}: ${name} has ${regions[name].core.length} vertices; expected at least ${minimum}`);
    }
  });

  const lockNames = ["leftEyeSocket", "rightEyeSocket", "leftBrow", "rightBrow", "nose"];
  for (let first = 0; first < lockNames.length; first += 1) {
    for (let second = first + 1; second < lockNames.length; second += 1) {
      const firstCore = new Set(regions[lockNames[first]].core);
      const overlap = regions[lockNames[second]].core.filter((index) => firstCore.has(index));
      if (overlap.length) throw new Error(`${gender}: ${lockNames[first]} overlaps ${lockNames[second]}`);
    }
  }
  Object.entries(regions).forEach(([name, region]) => {
    const weights = new Map(region.blend);
    region.core.forEach((index) => weights.set(index, 1));
    weldGroups.forEach((group) => {
      const values = group.map((index) => weights.get(index) || 0);
      if (Math.max(...values) - Math.min(...values) > 1e-6) {
        throw new Error(`${gender}: ${name} assigns different weights to a welded seam`);
      }
    });
  });

  return {
    vertexCount: vertices.length,
    weldGroups,
    regions,
    audit: Object.fromEntries(
      Object.entries(regions).map(([name, value]) => [name, { core: value.core.length, blend: value.blend.length }]),
    ),
  };
}

const output = { version: 2, models: {} };
for (const [gender, filename] of Object.entries(models)) {
  const mesh = parseObj(await readFile(path.join(modelDirectory, filename), "utf8"));
  output.models[gender] = buildRegions(mesh, gender);
}

await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(JSON.stringify(Object.fromEntries(Object.entries(output.models).map(([gender, model]) => [gender, model.audit])), null, 2));
