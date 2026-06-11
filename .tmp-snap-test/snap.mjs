// src/utils/snapping/bounds.ts
function getRotatedBounds(item) {
  const rot = (item.rotation % 360 + 360) % 360;
  const isRotated90 = rot === 90 || rot === 270;
  const effectiveWidth = isRotated90 ? item.depth : item.width;
  const effectiveDepth = isRotated90 ? item.width : item.depth;
  return {
    left: item.x - effectiveWidth / 2,
    right: item.x + effectiveWidth / 2,
    front: item.z + effectiveDepth / 2,
    back: item.z - effectiveDepth / 2,
    centerX: item.x,
    centerZ: item.z
  };
}
function getEffectiveDimensions(item) {
  const rot = (item.rotation % 360 + 360) % 360;
  const isRotated90 = rot === 90 || rot === 270;
  return {
    width: isRotated90 ? item.depth : item.width,
    depth: isRotated90 ? item.width : item.depth
  };
}
function checkCollision(itemA, itemB, padding = 5) {
  const boundsA = getRotatedBounds(itemA);
  const boundsB = getRotatedBounds(itemB);
  const overlapX = boundsA.right > boundsB.left + padding && boundsA.left < boundsB.right - padding;
  const overlapZ = boundsA.front > boundsB.back + padding && boundsA.back < boundsB.front - padding;
  return overlapX && overlapZ;
}

// src/utils/snapping/wallSnapping.ts
var WALL_SNAP_THRESHOLD = 200;
var WALL_RELEASE_THRESHOLD = 350;
var CORNER_SNAP_THRESHOLD = 300;
function getWallDistances(x, z, item, room, globalDimensions) {
  const { width: effectiveWidth, depth: effectiveDepth } = getEffectiveDimensions(item);
  const wallGap = globalDimensions.wallGap;
  const itemDepth = item.depth;
  const backEdgeDistance = z - effectiveDepth / 2;
  const leftEdgeDistance = x - effectiveWidth / 2;
  const rightEdgeDistance = room.width - (x + effectiveWidth / 2);
  const frontEdgeDistance = room.depth - (z + effectiveDepth / 2);
  const walls = [
    {
      id: "back",
      distance: Math.abs(backEdgeDistance),
      rotation: 0,
      // After snapping to back wall with rotation 0, depth faces wall
      snapPosition: { x, z: itemDepth / 2 + wallGap }
    },
    {
      id: "left",
      distance: Math.abs(leftEdgeDistance),
      rotation: 270,
      // After snapping to left wall with rotation 270, depth faces wall
      snapPosition: { x: itemDepth / 2 + wallGap, z }
    },
    {
      id: "right",
      distance: Math.abs(rightEdgeDistance),
      rotation: 90,
      // After snapping to right wall with rotation 90, depth faces wall
      snapPosition: { x: room.width - itemDepth / 2 - wallGap, z }
    },
    {
      id: "front",
      distance: Math.abs(frontEdgeDistance),
      rotation: 180,
      // After snapping to front wall with rotation 180, depth faces wall
      snapPosition: { x, z: room.depth - itemDepth / 2 - wallGap }
    }
  ];
  return walls.sort((a, b) => a.distance - b.distance);
}
function detectCorner(x, z, item, room, globalDimensions) {
  const walls = getWallDistances(x, z, item, room, globalDimensions);
  const nearWalls = walls.filter((w) => w.distance < CORNER_SNAP_THRESHOLD);
  if (nearWalls.length < 2) return null;
  const wall1 = nearWalls[0];
  const wall2 = nearWalls[1];
  const isWall1Horizontal = wall1.id === "back" || wall1.id === "front";
  const isWall2Horizontal = wall2.id === "back" || wall2.id === "front";
  const isPerpendicular = isWall1Horizontal !== isWall2Horizontal;
  if (!isPerpendicular) return null;
  const wallGap = globalDimensions.wallGap;
  const itemDepth = item.depth;
  const itemWidth = item.width;
  let cornerX;
  let cornerZ;
  let rotation;
  if (wall1.id === "back" && wall2.id === "left" || wall1.id === "left" && wall2.id === "back") {
    rotation = 0;
    cornerX = itemWidth / 2 + wallGap;
    cornerZ = itemDepth / 2 + wallGap;
  } else if (wall1.id === "back" && wall2.id === "right" || wall1.id === "right" && wall2.id === "back") {
    rotation = 90;
    cornerX = room.width - itemDepth / 2 - wallGap;
    cornerZ = itemWidth / 2 + wallGap;
  } else if (wall1.id === "front" && wall2.id === "left" || wall1.id === "left" && wall2.id === "front") {
    rotation = 270;
    cornerX = itemDepth / 2 + wallGap;
    cornerZ = room.depth - itemWidth / 2 - wallGap;
  } else {
    rotation = 180;
    cornerX = room.width - itemWidth / 2 - wallGap;
    cornerZ = room.depth - itemDepth / 2 - wallGap;
  }
  return {
    walls: [wall1, wall2],
    position: { x: cornerX, z: cornerZ },
    rotation
  };
}
function findWallSnap(x, z, item, room, globalDimensions, currentlySnappedToWall = false) {
  const walls = getWallDistances(x, z, item, room, globalDimensions);
  const threshold = currentlySnappedToWall ? WALL_RELEASE_THRESHOLD : WALL_SNAP_THRESHOLD;
  const nearestWall = walls[0];
  if (nearestWall.distance < threshold) {
    return { wall: nearestWall, snapped: true };
  }
  return null;
}
function shouldMaintainWallAlignment(item, room) {
  const rot = (item.rotation % 360 + 360) % 360;
  const itemDepth = item.depth;
  const isBackAligned = rot === 0 && item.z <= itemDepth / 2 + 50;
  const isLeftAligned = rot === 270 && item.x <= itemDepth / 2 + 50;
  const isRightAligned = rot === 90 && item.x >= room.width - itemDepth / 2 - 50;
  const isFrontAligned = rot === 180 && item.z >= room.depth - itemDepth / 2 - 50;
  return isBackAligned || isLeftAligned || isRightAligned || isFrontAligned;
}
function getWallSurfaces(room) {
  return [
    {
      id: "back",
      startX: 0,
      startZ: 0,
      endX: room.width,
      endZ: 0,
      normal: { x: 0, z: 1 },
      // Points into room
      rotationForAlignment: 0
    },
    {
      id: "left",
      startX: 0,
      startZ: 0,
      endX: 0,
      endZ: room.depth,
      normal: { x: 1, z: 0 },
      // Points into room
      rotationForAlignment: 270
    },
    {
      id: "right",
      startX: room.width,
      startZ: 0,
      endX: room.width,
      endZ: room.depth,
      normal: { x: -1, z: 0 },
      // Points into room
      rotationForAlignment: 90
    },
    {
      id: "front",
      startX: 0,
      startZ: room.depth,
      endX: room.width,
      endZ: room.depth,
      normal: { x: 0, z: -1 },
      // Points into room
      rotationForAlignment: 180
    }
  ];
}
function findNearestWallSurface(x, z, room) {
  const surfaces = getWallSurfaces(room);
  let nearest = surfaces[0];
  let minDist = Infinity;
  for (const surface of surfaces) {
    let distance;
    if (surface.id === "back") {
      distance = z;
    } else if (surface.id === "front") {
      distance = room.depth - z;
    } else if (surface.id === "left") {
      distance = x;
    } else {
      distance = room.width - x;
    }
    if (distance < minDist) {
      minDist = distance;
      nearest = surface;
    }
  }
  return { surface: nearest, distance: minDist };
}

// src/utils/snapping/cabinetSnapping.ts
var CABINET_SNAP_THRESHOLD = 250;
var CABINET_ALIGN_THRESHOLD = 100;
var BACK_ALIGN_THRESHOLD = 80;
function hasSimilarRotation(rot1, rot2) {
  const norm1 = (rot1 % 360 + 360) % 360;
  const norm2 = (rot2 % 360 + 360) % 360;
  return norm1 === norm2;
}
function findCabinetSnapPoints(draggedItem, allItems, threshold = CABINET_SNAP_THRESHOLD) {
  const snapPoints = [];
  const draggedBounds = getRotatedBounds(draggedItem);
  const draggedDims = getEffectiveDimensions(draggedItem);
  const draggedRot = (draggedItem.rotation % 360 + 360) % 360;
  for (const other of allItems) {
    if (other.instanceId === draggedItem.instanceId) continue;
    if (other.itemType !== "Cabinet" && other.itemType !== "Appliance") continue;
    const otherBounds = getRotatedBounds(other);
    const otherDims = getEffectiveDimensions(other);
    const otherRot = (other.rotation % 360 + 360) % 360;
    const sameOrientation = hasSimilarRotation(draggedItem.rotation, other.rotation);
    const horizontalCenterDist = Math.abs(draggedItem.x - other.x);
    const verticalCenterDist = Math.abs(draggedItem.z - other.z);
    const gapRightToLeft = otherBounds.left - draggedBounds.right;
    const distRightToLeft = Math.abs(gapRightToLeft);
    if (distRightToLeft < threshold && gapRightToLeft > -draggedDims.width * 0.5) {
      const backAligned = Math.abs(draggedBounds.back - otherBounds.back) < BACK_ALIGN_THRESHOLD;
      const frontAligned = Math.abs(draggedBounds.front - otherBounds.front) < CABINET_ALIGN_THRESHOLD;
      const centerZAligned = Math.abs(draggedItem.z - other.z) < CABINET_ALIGN_THRESHOLD;
      let snapZ = draggedItem.z;
      if (backAligned && sameOrientation) {
        snapZ = otherBounds.back + draggedDims.depth / 2;
      } else if (frontAligned) {
        snapZ = otherBounds.front - draggedDims.depth / 2;
      } else if (centerZAligned) {
        snapZ = other.z;
      }
      const isAligned = backAligned || frontAligned || centerZAligned;
      const snapX = otherBounds.left - draggedDims.width / 2;
      snapPoints.push({
        x: snapX,
        z: snapZ,
        edge: "right",
        targetId: other.instanceId,
        distance: distRightToLeft,
        alignedZ: isAligned,
        alignedX: false,
        priority: sameOrientation && backAligned ? 5 : sameOrientation ? 4 : isAligned ? 3 : 2
      });
    }
    const gapLeftToRight = draggedBounds.left - otherBounds.right;
    const distLeftToRight = Math.abs(gapLeftToRight);
    if (distLeftToRight < threshold && gapLeftToRight > -draggedDims.width * 0.5) {
      const backAligned = Math.abs(draggedBounds.back - otherBounds.back) < BACK_ALIGN_THRESHOLD;
      const frontAligned = Math.abs(draggedBounds.front - otherBounds.front) < CABINET_ALIGN_THRESHOLD;
      const centerZAligned = Math.abs(draggedItem.z - other.z) < CABINET_ALIGN_THRESHOLD;
      let snapZ = draggedItem.z;
      if (backAligned && sameOrientation) {
        snapZ = otherBounds.back + draggedDims.depth / 2;
      } else if (frontAligned) {
        snapZ = otherBounds.front - draggedDims.depth / 2;
      } else if (centerZAligned) {
        snapZ = other.z;
      }
      const isAligned = backAligned || frontAligned || centerZAligned;
      const snapX = otherBounds.right + draggedDims.width / 2;
      snapPoints.push({
        x: snapX,
        z: snapZ,
        edge: "left",
        targetId: other.instanceId,
        distance: distLeftToRight,
        alignedZ: isAligned,
        alignedX: false,
        priority: sameOrientation && backAligned ? 5 : sameOrientation ? 4 : isAligned ? 3 : 2
      });
    }
    const gapFrontToBack = otherBounds.back - draggedBounds.front;
    const distFrontToBack = Math.abs(gapFrontToBack);
    if (distFrontToBack < threshold && gapFrontToBack > -draggedDims.depth * 0.5) {
      const leftAligned = Math.abs(draggedBounds.left - otherBounds.left) < CABINET_ALIGN_THRESHOLD;
      const rightAligned = Math.abs(draggedBounds.right - otherBounds.right) < CABINET_ALIGN_THRESHOLD;
      const centerXAligned = Math.abs(draggedItem.x - other.x) < CABINET_ALIGN_THRESHOLD;
      let snapX = draggedItem.x;
      if (leftAligned) {
        snapX = otherBounds.left + draggedDims.width / 2;
      } else if (rightAligned) {
        snapX = otherBounds.right - draggedDims.width / 2;
      } else if (centerXAligned) {
        snapX = other.x;
      }
      const isAligned = leftAligned || rightAligned || centerXAligned;
      const snapZ = otherBounds.back - draggedDims.depth / 2;
      snapPoints.push({
        x: snapX,
        z: snapZ,
        edge: "front",
        targetId: other.instanceId,
        distance: distFrontToBack,
        alignedZ: false,
        alignedX: isAligned,
        priority: isAligned ? 3 : 2
      });
    }
    const gapBackToFront = draggedBounds.back - otherBounds.front;
    const distBackToFront = Math.abs(gapBackToFront);
    if (distBackToFront < threshold && gapBackToFront > -draggedDims.depth * 0.5) {
      const leftAligned = Math.abs(draggedBounds.left - otherBounds.left) < CABINET_ALIGN_THRESHOLD;
      const rightAligned = Math.abs(draggedBounds.right - otherBounds.right) < CABINET_ALIGN_THRESHOLD;
      const centerXAligned = Math.abs(draggedItem.x - other.x) < CABINET_ALIGN_THRESHOLD;
      let snapX = draggedItem.x;
      if (leftAligned) {
        snapX = otherBounds.left + draggedDims.width / 2;
      } else if (rightAligned) {
        snapX = otherBounds.right - draggedDims.width / 2;
      } else if (centerXAligned) {
        snapX = other.x;
      }
      const isAligned = leftAligned || rightAligned || centerXAligned;
      const snapZ = otherBounds.front + draggedDims.depth / 2;
      snapPoints.push({
        x: snapX,
        z: snapZ,
        edge: "back",
        targetId: other.instanceId,
        distance: distBackToFront,
        alignedZ: false,
        alignedX: isAligned,
        priority: isAligned ? 3 : 2
      });
    }
  }
  return snapPoints.sort((a, b) => {
    const aPriority = a.priority || 1;
    const bPriority = b.priority || 1;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return a.distance - b.distance;
  });
}

// src/types/cabinetConfig.ts
var CONSTRUCTION_STANDARDS = {
  // Board thicknesses (mm)
  gableThickness: 18,
  shelfThickness: 18,
  backPanelThickness: 3,
  // Backing board
  doorThickness: 18,
  drawerFrontThickness: 18,
  bottomPanelThickness: 18,
  topPanelThickness: 18,
  kickboardThickness: 16,
  edgeBanding: 0.4,
  // Gaps & Reveals (mm) - Microvellum standard
  doorGap: 2,
  // Between doors
  drawerGap: 2,
  // Between drawers
  topReveal: 3,
  // Gap from carcass top to door
  bottomReveal: 2,
  // Gap from carcass bottom to door
  sideReveal: 2,
  // Gap from gable to door edge
  // Setbacks (mm)
  backPanelSetback: 16,
  // Recessed for hanging rails (industry standard)
  backPanelInset: 9,
  // Inset from gable edges (dado depth)
  // 32mm System drilling pattern
  shelfHoleSpacing: 32,
  // Standard 32mm system
  shelfHoleFromEdge: 37,
  // Distance from front/back edge
  hingeInset: 100,
  // From top/bottom of door
  handleInset: 40,
  // From edge of door
  handleCenterFromEdge: 40,
  // Standard handle position
  handleDrillPattern: 32,
  // 32mm, 64mm, 96mm, 128mm centers
  // Toe kick dimensions
  toeKickHeight: 135,
  toeKickSetback: 50,
  // Corner cabinet defaults (mm)
  defaultFillerWidth: 75,
  // Gap between blind panel and wall
  defaultStileWidth: 45,
  // Face frame stile width
  defaultBlindPullDistance: 100,
  // How far blind extends past face
  cornerOverlap: 50
  // Overlap for L-shape corners
};

// src/utils/snapping/gableSnapping.ts
function normalizeRightAngle(rotation) {
  const normalized = (rotation % 360 + 360) % 360;
  const snapped = Math.round(normalized / 90) * 90;
  return snapped === 360 ? 0 : snapped;
}
function getGableEdges(item, gableThickness = CONSTRUCTION_STANDARDS.gableThickness) {
  const halfWidth = item.width / 2;
  const thicknessM = gableThickness;
  const rot = normalizeRightAngle(item.rotation);
  const axis = rot === 90 || rot === 270 ? "z" : "x";
  const center = axis === "x" ? item.x : item.z;
  return {
    leftOuter: center - halfWidth,
    leftInner: center - halfWidth + thicknessM,
    rightOuter: center + halfWidth,
    rightInner: center + halfWidth - thicknessM,
    axis
  };
}
function rotationsAligned(rot1, rot2) {
  return normalizeRightAngle(rot1) === normalizeRightAngle(rot2);
}
function findGableSnapPoints(draggedItem, allItems, gableThickness = CONSTRUCTION_STANDARDS.gableThickness, threshold = 30) {
  const snapPoints = [];
  const draggedEdges = getGableEdges(draggedItem, gableThickness);
  for (const target of allItems) {
    if (target.instanceId === draggedItem.instanceId) continue;
    if (target.itemType !== "Cabinet") continue;
    if (!rotationsAligned(draggedItem.rotation, target.rotation)) continue;
    const targetEdges = getGableEdges(target, gableThickness);
    if (targetEdges.axis !== draggedEdges.axis) continue;
    const axis = draggedEdges.axis;
    const draggedCross = axis === "x" ? draggedItem.z : draggedItem.x;
    const targetCross = axis === "x" ? target.z : target.x;
    const crossDiff = Math.abs(draggedCross - targetCross);
    if (crossDiff > Math.max(draggedItem.depth, target.depth) / 2 + 50) continue;
    const makeSnap = (alongPos, edge, distance) => ({
      targetItem: target,
      snapX: axis === "x" ? alongPos : targetCross,
      snapZ: axis === "x" ? targetCross : alongPos,
      edge,
      distance
    });
    const leftToRightDist = Math.abs(draggedEdges.leftOuter - targetEdges.rightOuter);
    if (leftToRightDist < threshold) {
      snapPoints.push(makeSnap(targetEdges.rightOuter + draggedItem.width / 2, "left-to-right", leftToRightDist));
    }
    const rightToLeftDist = Math.abs(draggedEdges.rightOuter - targetEdges.leftOuter);
    if (rightToLeftDist < threshold) {
      snapPoints.push(makeSnap(targetEdges.leftOuter - draggedItem.width / 2, "right-to-left", rightToLeftDist));
    }
  }
  return snapPoints.sort((a, b) => a.distance - b.distance);
}
function getBestGableSnap(draggedItem, allItems, gableThickness, threshold) {
  const snaps = findGableSnapPoints(draggedItem, allItems, gableThickness, threshold);
  if (snaps.length === 0) return null;
  const best = snaps[0];
  return {
    x: best.snapX,
    z: best.snapZ,
    target: best.targetItem
  };
}
function calculateHandlePosition(doorHeight, doorWidth, category, hingeLeft, handleLength = 128, handleDrillPattern = 32) {
  const handleInset = CONSTRUCTION_STANDARDS.handleInset;
  const x = hingeLeft ? doorWidth / 2 - handleInset : -doorWidth / 2 + handleInset;
  let y;
  if (category === "Wall") {
    const rawY = -doorHeight / 2 + handleInset;
    y = Math.round(rawY / handleDrillPattern) * handleDrillPattern;
  } else {
    const rawY = doorHeight / 2 - handleInset;
    y = Math.round(rawY / handleDrillPattern) * handleDrillPattern;
  }
  return { x, y };
}
function calculateCornerPosition(adjacentCabinetX, adjacentCabinetZ, adjacentWidth, adjacentDepth, cornerCabinetWidth, cornerCabinetDepth, config, wallId) {
  const { fillerWidth, blindPullDistance, cornerType } = config;
  let x;
  let z;
  let rotation;
  if (cornerType === "blind-left" || cornerType === "blind-right") {
    if (wallId === "back") {
      if (cornerType === "blind-left") {
        x = fillerWidth + cornerCabinetDepth / 2;
        z = adjacentCabinetZ;
        rotation = 270;
      } else {
        x = adjacentCabinetX + adjacentWidth / 2 - blindPullDistance + cornerCabinetWidth / 2;
        z = adjacentCabinetZ;
        rotation = 0;
      }
    } else if (wallId === "left") {
      if (cornerType === "blind-left") {
        x = adjacentCabinetX;
        z = fillerWidth + cornerCabinetDepth / 2;
        rotation = 0;
      } else {
        x = adjacentCabinetX;
        z = adjacentCabinetZ + adjacentDepth / 2 - blindPullDistance + cornerCabinetDepth / 2;
        rotation = 270;
      }
    } else {
      x = adjacentCabinetX;
      z = adjacentCabinetZ;
      rotation = 0;
    }
  } else if (cornerType === "l-shape") {
    x = adjacentCabinetX - adjacentWidth / 2 + cornerCabinetWidth / 2;
    z = adjacentCabinetZ + adjacentDepth / 2 + cornerCabinetDepth / 2;
    rotation = 0;
  } else {
    x = adjacentCabinetX;
    z = adjacentCabinetZ;
    rotation = 45;
  }
  return { x, z, rotation };
}
function getEffectiveFillerWidth(itemFillerWidth, globalFillerWidth) {
  return itemFillerWidth ?? globalFillerWidth ?? CONSTRUCTION_STANDARDS.defaultFillerWidth;
}
function getEffectiveStileWidth(itemStileWidth, globalStileWidth) {
  return itemStileWidth ?? globalStileWidth ?? CONSTRUCTION_STANDARDS.defaultStileWidth;
}

// src/utils/snapping/index.ts
var GABLE_SNAP_THRESHOLD = 50;
function normalizeToRightAngle(rotation) {
  const normalized = (rotation % 360 + 360) % 360;
  const snapped = Math.round(normalized / 90) * 90;
  return snapped === 360 ? 0 : snapped;
}
function calculateSnapPosition(rawX, rawZ, draggedItem, allItems, room, gridSnap = 50, globalDimensions) {
  const dims = globalDimensions ?? {
    toeKickHeight: 135,
    shelfSetback: 5,
    baseHeight: 730,
    baseDepth: 575,
    wallHeight: 720,
    wallDepth: 350,
    tallHeight: 2100,
    tallDepth: 580,
    benchtopThickness: 33,
    benchtopOverhang: 25,
    splashbackHeight: 600,
    doorGap: 2,
    drawerGap: 2,
    leftGap: 1.5,
    rightGap: 1.5,
    topMargin: 0,
    bottomMargin: 0,
    wallGap: 10,
    // Construction parameters
    boardThickness: 18,
    backPanelSetback: 16,
    topReveal: 3,
    sideReveal: 2,
    handleDrillSpacing: 32
  };
  let x = Math.round(rawX / gridSnap) * gridSnap;
  let z = Math.round(rawZ / gridSnap) * gridSnap;
  let rotation = normalizeToRightAngle(draggedItem.rotation);
  let snappedTo = "grid";
  let snapEdge = void 0;
  let snappedItemId = void 0;
  let wallId = void 0;
  const wallGap = dims.wallGap;
  const itemDepth = draggedItem.depth;
  const isCornerCabinet = /corner|diagonal|blind/i.test(draggedItem.definitionId ?? "") || !!draggedItem.blindSide;
  const corner = isCornerCabinet ? detectCorner(rawX, rawZ, draggedItem, room, dims) : null;
  if (corner) {
    x = corner.position.x;
    z = corner.position.z;
    rotation = normalizeToRightAngle(corner.rotation);
    snappedTo = "corner";
  }
  const maintainWallAlignment = shouldMaintainWallAlignment(draggedItem, room);
  const wallSnap = corner ? null : findWallSnap(rawX, rawZ, draggedItem, room, dims, maintainWallAlignment);
  if (wallSnap?.snapped) {
    const wall = wallSnap.wall;
    wallId = wall.id;
    rotation = wall.rotation;
    snappedTo = "wall";
    const postSnapDepth = itemDepth;
    switch (wall.id) {
      case "back":
        z = postSnapDepth / 2 + wallGap;
        snapEdge = "back";
        break;
      case "left":
        x = postSnapDepth / 2 + wallGap;
        snapEdge = "left";
        break;
      case "right":
        x = room.width - postSnapDepth / 2 - wallGap;
        snapEdge = "right";
        break;
      case "front":
        z = room.depth - postSnapDepth / 2 - wallGap;
        snapEdge = "front";
        break;
    }
    if (wall.id === "back" || wall.id === "front") {
      x = Math.round(rawX / gridSnap) * gridSnap;
    } else {
      z = Math.round(rawZ / gridSnap) * gridSnap;
    }
  }
  const effectiveRotation = snappedTo === "wall" ? rotation : draggedItem.rotation;
  const tempItem = { ...draggedItem, x, z, rotation: effectiveRotation };
  const gableThickness = dims.boardThickness ?? CONSTRUCTION_STANDARDS.gableThickness;
  const gableSnaps = corner ? [] : findGableSnapPoints(tempItem, allItems, gableThickness, GABLE_SNAP_THRESHOLD);
  let usedGableSnap = false;
  if (gableSnaps.length > 0) {
    const bestGable = gableSnaps[0];
    if (snappedTo === "wall") {
      if (wallId === "back" || wallId === "front") {
        x = bestGable.snapX;
        snappedItemId = bestGable.targetItem.instanceId;
        snapEdge = bestGable.edge === "left-to-right" ? "left" : "right";
        usedGableSnap = true;
      } else if (wallId === "left" || wallId === "right") {
        z = bestGable.snapZ;
        snappedItemId = bestGable.targetItem.instanceId;
        snapEdge = bestGable.edge === "left-to-right" ? "left" : "right";
        usedGableSnap = true;
      }
    } else {
      x = bestGable.snapX;
      z = bestGable.snapZ;
      snappedTo = "cabinet";
      snapEdge = bestGable.edge === "left-to-right" ? "left" : "right";
      snappedItemId = bestGable.targetItem.instanceId;
      rotation = bestGable.targetItem.rotation;
      usedGableSnap = true;
    }
  }
  if (!usedGableSnap && !corner) {
    const dynamicSnapThreshold = Math.max(CABINET_SNAP_THRESHOLD, Math.round(Math.min(draggedItem.width, draggedItem.depth) * 0.45));
    const cabinetSnapPoints = findCabinetSnapPoints(tempItem, allItems, dynamicSnapThreshold);
    if (cabinetSnapPoints.length > 0) {
      const best = cabinetSnapPoints[0];
      if (snappedTo === "wall") {
        if ((wallId === "back" || wallId === "front") && (best.edge === "left" || best.edge === "right")) {
          x = best.x;
          snappedItemId = best.targetId;
          snapEdge = best.edge;
          if (best.alignedZ) {
            z = best.z;
          }
        } else if ((wallId === "left" || wallId === "right") && (best.edge === "front" || best.edge === "back")) {
          z = best.z;
          snappedItemId = best.targetId;
          snapEdge = best.edge;
          if (best.alignedX) {
            x = best.x;
          }
        }
      } else {
        x = best.x;
        z = best.z;
        snappedTo = "cabinet";
        snapEdge = best.edge;
        snappedItemId = best.targetId;
        const targetCabinet = allItems.find((item) => item.instanceId === best.targetId);
        if (targetCabinet) {
          if (isWallAligned(targetCabinet, room, dims) || best.edge === "left" || best.edge === "right") {
            rotation = normalizeToRightAngle(targetCabinet.rotation);
          }
        }
      }
    }
  }
  const effDims = getEffectiveDimensions({ ...draggedItem, rotation });
  const effectiveWidth = effDims.width;
  const effectiveDepth = effDims.depth;
  x = Math.max(effectiveWidth / 2 + wallGap, Math.min(room.width - effectiveWidth / 2 - wallGap, x));
  z = Math.max(effectiveDepth / 2 + wallGap, Math.min(room.depth - effectiveDepth / 2 - wallGap, z));
  const minXBound = effectiveWidth / 2 + wallGap;
  const maxXBound = room.width - effectiveWidth / 2 - wallGap;
  const minZBound = effectiveDepth / 2 + wallGap;
  const maxZBound = room.depth - effectiveDepth / 2 - wallGap;
  for (const other of allItems) {
    if (other.instanceId === draggedItem.instanceId) continue;
    const testItem = { ...draggedItem, x, z, rotation };
    if (!checkCollision(testItem, other)) continue;
    const otherBounds = getRotatedBounds(other);
    const testBounds = getRotatedBounds(testItem);
    const candidates = [
      { x: x - (testBounds.right - otherBounds.left) - 10, z },
      // push left
      { x: x + (otherBounds.right - testBounds.left) + 10, z },
      // push right
      { x, z: z - (testBounds.front - otherBounds.back) - 10 },
      // push back
      { x, z: z + (otherBounds.front - testBounds.back) + 10 }
      // push front
    ];
    const valid = candidates.filter((c) => c.x >= minXBound - 1e-3 && c.x <= maxXBound + 1e-3 && c.z >= minZBound - 1e-3 && c.z <= maxZBound + 1e-3).filter((c) => !checkCollision({ ...draggedItem, x: c.x, z: c.z, rotation }, other)).map((c) => ({ ...c, dist: Math.hypot(c.x - x, c.z - z) })).sort((a, b) => a.dist - b.dist);
    if (valid.length > 0) {
      x = valid[0].x;
      z = valid[0].z;
    }
  }
  x = Math.max(minXBound, Math.min(maxXBound, x));
  z = Math.max(minZBound, Math.min(maxZBound, z));
  rotation = normalizeToRightAngle(rotation);
  return { x, z, rotation, snappedTo, snapEdge, snappedItemId, wallId };
}
function isWallAligned(item, room, dims) {
  const rot = (item.rotation % 360 + 360) % 360;
  const depth = item.depth;
  const tolerance = 50;
  return rot === 0 && item.z <= depth / 2 + dims.wallGap + tolerance || rot === 90 && item.x >= room.width - depth / 2 - dims.wallGap - tolerance || rot === 270 && item.x <= depth / 2 + dims.wallGap + tolerance || rot === 180 && item.z >= room.depth - depth / 2 - dims.wallGap - tolerance;
}
export {
  CABINET_SNAP_THRESHOLD,
  GABLE_SNAP_THRESHOLD,
  WALL_SNAP_THRESHOLD,
  calculateCornerPosition,
  calculateHandlePosition,
  calculateSnapPosition,
  checkCollision,
  findGableSnapPoints,
  findNearestWallSurface,
  getBestGableSnap,
  getEffectiveFillerWidth,
  getEffectiveStileWidth,
  getGableEdges,
  getRotatedBounds,
  getWallSurfaces
};
