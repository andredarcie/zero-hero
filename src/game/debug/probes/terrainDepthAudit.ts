import * as THREE from 'three';

type Face = { label: string; points: THREE.Vector2[]; bounds: THREE.Box2 };

const intersects = (a: Face, b: Face): boolean => {
  if (!a.bounds.intersectsBox(b.bounds)) return false;
  for (const points of [a.points, b.points]) for (let i = 0; i < 3; i++) {
    const edge = points[(i + 1) % 3].clone().sub(points[i]);
    const axis = new THREE.Vector2(-edge.y, edge.x);
    const pa = a.points.map((p) => p.dot(axis));
    const pb = b.points.map((p) => p.dot(axis));
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 1e-6) return false;
  }
  return true;
};

export const terrainDepthAudit = (scene: THREE.Scene) => {
  const cells = new Map<string, Face[]>();
  const overlaps: Record<string, { count: number; sample: number[] }> = {};
  let faces = 0;
  scene.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || !object.material.depthWrite || object instanceof THREE.InstancedMesh) return;
    const geometry = object.geometry;
    const pos = geometry.getAttribute('position');
    const ids = geometry.getIndex();
    if (!pos || !ids) return;
    const material = object.material as THREE.MeshLambertMaterial;
    const label = object.name || material.name || (material.map?.image as { src?: string } | undefined)?.src?.split('/').at(-1) || (object.renderOrder === -2 ? 'árvore sprite' : material.type);
    for (let i = geometry.drawRange.start; i + 2 < Math.min(ids.count, geometry.drawRange.start + geometry.drawRange.count); i += 3) {
      const v = [i, i + 1, i + 2].map((j) => new THREE.Vector3().fromBufferAttribute(pos, ids.getX(j)).applyMatrix4(object.matrixWorld));
      const horizontal = v.every((p) => Math.abs(p.y - v[0].y) < 1e-5);
      const tree = material.name === 'terrain-trees' || object.renderOrder === -2;
      const vertical = tree && v.every((p) => Math.abs(p.z - v[0].z) < 1e-5);
      if (!horizontal && !vertical) continue;
      const points = v.map((p) => new THREE.Vector2(p.x, horizontal ? p.z : p.y));
      const bounds = new THREE.Box2().setFromPoints(points);
      const area = (points[1].x - points[0].x) * (points[2].y - points[0].y) - (points[1].y - points[0].y) * (points[2].x - points[0].x);
      if (Math.abs(area) <= 1e-6 || (horizontal && area > 0 && material.side === THREE.FrontSide)) continue;
      if (horizontal && (bounds.max.x < 0 || bounds.min.x > 59 || bounds.max.y < -24 || bounds.min.y > 59)) continue;
      const face = { label, points, bounds };
      const seen = new Set<Face>();
      const depth = horizontal ? v[0].y : v[0].z;
      for (let row = Math.floor(bounds.min.y / 2); row <= Math.floor(bounds.max.y / 2); row++) for (let col = Math.floor(bounds.min.x / 2); col <= Math.floor(bounds.max.x / 2); col++) {
        const key = [horizontal ? 'H' : 'V', Math.round(depth * 100000), col, row].join(',');
        const nearby = cells.get(key) ?? [];
        for (const other of nearby) {
          if (seen.has(other)) continue;
          seen.add(other);
          if (!intersects(face, other)) continue;
          const pair = [label, other.label].sort().join(' × ');
          const name = (horizontal ? 'H ' : 'V ') + pair;
          const item = overlaps[name] ??= { count: 0, sample: [Math.max(bounds.min.x, other.bounds.min.x), Math.max(bounds.min.y, other.bounds.min.y), depth] };
          item.count++;
        }
        nearby.push(face);
        cells.set(key, nearby);
      }
      faces++;
    }
  });
  return { faces, overlaps };
};
