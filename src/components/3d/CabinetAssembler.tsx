import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { PlacedItem, MaterialOption, GlobalDimensions, HandleDefinition } from '../../types';
import { CabinetRenderConfig, CONSTRUCTION_STANDARDS } from '../../types/cabinetConfig';
import {
  Gable,
  Shelf,
  DoorFront,
  DrawerFront,
  HandleMesh,
  BackPanel,
  BottomPanel,
  Kickboard,
  BenchtopMesh,
  FalseFront,
  CornerCarcass,
  TopPanel,
  DividerPanel,
  CabinetLegs,
  EdgeOutline,
} from './cabinet-parts';
import { 
  ConstructionRecipe, 
  getConstructionRecipe, 
  mergeRecipeWithOverrides,
  MV_CONSTRUCTION_RECIPES,
  getRecipeReveals,
  DEFAULT_REVEALS,
} from '@/lib/microvellum/constructionRecipes';
import { calculateHandlePosition } from '@/utils/snapping/gableSnapping';

interface MaterialProps {
  color: string;
  roughness: number;
  metalness: number;
  map: THREE.Texture | null;
}

interface CabinetMaterials {
  gable: MaterialProps;
  gableInterior: MaterialProps;  // Interior face (white melamine)
  gableExterior: MaterialProps;  // Exterior face (door finish)
  door: MaterialProps;
  drawer: MaterialProps;
  shelf: MaterialProps;
  bottom: MaterialProps;
  back: MaterialProps;
  kickboard: MaterialProps;
  benchtop: MaterialProps;
  endPanel: MaterialProps;
  falseFront: MaterialProps;
}

interface CabinetAssemblerProps {
  item: PlacedItem;
  config: CabinetRenderConfig;
  finishMaterial: MaterialOption;
  benchtopMaterial: MaterialOption;
  kickMaterial: MaterialOption;
  handle: HandleDefinition;
  globalDimensions: GlobalDimensions;
  materials: CabinetMaterials;
  isSelected: boolean;
  isDragged: boolean;
  hovered: boolean;
}

/**
 * Cabinet Assembler - Factory component that builds complete cabinet assemblies
 * from modular parts based on Microvellum construction recipes
 */
const CabinetAssembler: React.FC<CabinetAssemblerProps> = ({
  item,
  config,
  finishMaterial,
  benchtopMaterial,
  kickMaterial,
  handle,
  globalDimensions,
  materials,
  isSelected,
  isDragged,
  hovered,
}) => {
  const hasValidMaterials = Boolean(materials?.gable);

  // Get construction recipe from product name
  const recipe = useMemo(() => {
    // Try to get recipe by product name
    const baseRecipe = getConstructionRecipe(config.productName, MV_CONSTRUCTION_RECIPES);
    
    if (baseRecipe) {
      // Merge with any database overrides from the config
      return mergeRecipeWithOverrides(baseRecipe, {
        doorCount: config.doorCount,
        drawerCount: config.drawerCount,
        shelfCount: config.shelfCount,
        hasFalseFront: config.hasFalseFront,
        cornerType: config.cornerType || undefined,
        leftArmDepth: config.leftArmDepth,
        rightArmDepth: config.rightArmDepth,
        blindDepth: config.blindDepth,
        fillerWidth: config.fillerWidth,
      });
    }
    
    // Generate fallback recipe from config/name patterns
    return getConstructionRecipe(config.productName);
  }, [config]);

  // Validate item dimensions
  const safeWidth = item.width && item.width > 0 ? item.width : 600;
  const safeHeight = item.height && item.height > 0 ? item.height : 720;
  const safeDepth = item.depth && item.depth > 0 ? item.depth : 560;

  // Convert dimensions from mm to meters
  const widthM = safeWidth / 1000;
  const heightM = safeHeight / 1000;
  const depthM = safeDepth / 1000;
  
  // Use recipe construction values or fall back to standards
  const gableThickness = (recipe?.carcass.gableThickness || CONSTRUCTION_STANDARDS.gableThickness) / 1000;
  const shelfThickness = (recipe?.shelves.thickness || CONSTRUCTION_STANDARDS.shelfThickness) / 1000;
  const doorThickness = CONSTRUCTION_STANDARDS.doorThickness / 1000;
  const backPanelThickness = (recipe?.carcass.backPanelThickness || CONSTRUCTION_STANDARDS.backPanelThickness) / 1000;
  const bottomThickness = CONSTRUCTION_STANDARDS.bottomPanelThickness / 1000;
  
  // Toe kick from recipe or global dimensions
  const kickHeight = recipe?.toeKick.enabled 
    ? (recipe.toeKick.height / 1000) 
    : ((globalDimensions?.toeKickHeight || 135) / 1000);
  const hasKick = recipe?.toeKick.enabled ?? (config.category === 'Base' || config.category === 'Tall');
  
  // Other global dimensions
  const btThickness = recipe?.benchtop.thickness 
    ? (recipe.benchtop.thickness / 1000)
    : ((globalDimensions?.benchtopThickness || 33) / 1000);
  const btOverhang = recipe?.benchtop.frontOverhang 
    ? (recipe.benchtop.frontOverhang / 1000)
    : ((globalDimensions?.benchtopOverhang || 0) / 1000);
  
  // Reveals (gaps around doors/drawers) - priority: global dimensions > recipe > defaults
  // Recipe reveals allow per-cabinet-type customization
  const recipeReveals = recipe ? getRecipeReveals(recipe) : DEFAULT_REVEALS;
  const doorGap = (globalDimensions?.doorGap ?? recipeReveals.doorGap) / 1000;
  const drawerGap = (globalDimensions?.drawerGap ?? recipeReveals.drawerGap) / 1000;
  const topReveal = (globalDimensions?.topReveal ?? recipeReveals.topReveal) / 1000;
  const sideReveal = (globalDimensions?.sideReveal ?? recipeReveals.sideReveal) / 1000;
  const bottomReveal = recipeReveals.bottomReveal / 1000;
  
  // Back panel setback for hanging rails (16mm standard)
  const backSetback = (globalDimensions?.backPanelSetback || recipe?.carcass.backPanelSetback || 16) / 1000;
  
  // Calculate carcass dimensions (excluding kick)
  const carcassHeight = hasKick ? heightM - kickHeight : heightM;
  const carcassYOffset = hasKick ? kickHeight / 2 : 0;
  
  // Interior width (between gables)
  const interiorWidth = widthM - gableThickness * 2;
  
  if (!hasValidMaterials) {
    console.warn('CabinetAssembler: Invalid materials');
    return null;
  }

  // Use material props from hook (already has correct grain direction per part)
  const { gable: gableMat, gableInterior: gableIntMat, gableExterior: gableExtMat,
          door: doorMat, drawer: drawerMat, shelf: shelfMat, 
          bottom: bottomMat, kickboard: kickMat, benchtop: benchMat, 
          endPanel: endPanelMat, falseFront: falseFrontMat } = materials;
  
  // Physical shadow gap - real 3D gap between doors/drawers and carcass front
  const shadowGap = 0.002; // 2mm real gap for natural ambient occlusion

  // Determine hinge side from item or default
  const hingeLeft = item.hinge !== 'Right';

  // Check if this is a corner cabinet based on recipe
  const isCornerCabinet = recipe?.fronts.type === 'CORNER' || config.isCorner || config.cornerType !== null;
  const cornerRender = recipe?.fronts.corner?.render || 
    (config.cornerType === 'diagonal' ? 'DIAGONAL_FRONT_45' : 
     config.cornerType === 'l-shape' ? 'L_ARMS' : 'BLIND_EXTENSION');
  const cornerType = cornerRender === 'L_ARMS' ? 'l-shape' : 
                     cornerRender === 'DIAGONAL_FRONT_45' ? 'diagonal' : 'blind';
  
  // Corner dimensions from recipe or config (convert mm to meters)
  const leftArmDepthM = (recipe?.fronts.corner?.leftArmDepth || item.leftCarcaseDepth || config.leftArmDepth || 575) / 1000;
  const rightArmDepthM = (recipe?.fronts.corner?.rightArmDepth || item.rightCarcaseDepth || config.rightArmDepth || 575) / 1000;
  const blindDepthM = (recipe?.fronts.corner?.blindDepth || config.blindDepth || 150) / 1000;
  const fillerWidthM = (recipe?.fronts.corner?.fillerWidth || config.fillerWidth || 75) / 1000;

  // Determine if end panels are exposed (for dual-material rendering)
  const leftEndExposed = item.endPanelLeft ?? false;
  const rightEndExposed = item.endPanelRight ?? false;

  // Render gables (side panels) - skip for corner cabinets which use CornerCarcass
  const renderGables = () => {
    // Corner cabinets use special geometry
    if (isCornerCabinet) {
      return (
        <CornerCarcass
          width={widthM}
          height={carcassHeight}
          depth={depthM}
          cornerType={cornerType as 'l-shape' | 'blind' | 'diagonal'}
          leftArmDepth={leftArmDepthM}
          rightArmDepth={rightArmDepthM}
          blindDepth={blindDepthM}
          blindSide={item.blindSide}
          fillerWidth={fillerWidthM}
          hasReturnFiller={config.hasReturnFiller}
          gableThickness={gableThickness}
          color={gableMat.color}
          roughness={gableMat.roughness}
          metalness={gableMat.metalness}
          map={gableMat.map}
        />
      );
    }

    // Standard cabinets use regular gables with optional exposed end panel materials
    return (
      <>
        {/* Left gable - dual material if exposed end */}
        <Gable
          width={gableThickness}
          height={carcassHeight}
          depth={depthM}
          position={[-widthM / 2 + gableThickness / 2, carcassYOffset, 0]}
          color={leftEndExposed ? gableExtMat.color : gableMat.color}
          roughness={leftEndExposed ? gableExtMat.roughness : gableMat.roughness}
          metalness={leftEndExposed ? gableExtMat.metalness : gableMat.metalness}
          map={leftEndExposed ? gableExtMat.map : gableMat.map}
          grainRotation={0}
          isExposedEnd={leftEndExposed}
          side="left"
          interiorColor={gableIntMat.color}
          interiorRoughness={gableIntMat.roughness}
          interiorMetalness={gableIntMat.metalness}
          interiorMap={gableIntMat.map}
        />
        {/* Right gable - dual material if exposed end */}
        <Gable
          width={gableThickness}
          height={carcassHeight}
          depth={depthM}
          position={[widthM / 2 - gableThickness / 2, carcassYOffset, 0]}
          color={rightEndExposed ? gableExtMat.color : gableMat.color}
          roughness={rightEndExposed ? gableExtMat.roughness : gableMat.roughness}
          metalness={rightEndExposed ? gableExtMat.metalness : gableMat.metalness}
          map={rightEndExposed ? gableExtMat.map : gableMat.map}
          grainRotation={0}
          isExposedEnd={rightEndExposed}
          side="right"
          interiorColor={gableIntMat.color}
          interiorRoughness={gableIntMat.roughness}
          interiorMetalness={gableIntMat.metalness}
          interiorMap={gableIntMat.map}
        />
      </>
    );
  };

  // Render bottom panel
  const renderBottom = () => (
    <BottomPanel
      width={interiorWidth}
      depth={depthM - backPanelThickness}
      thickness={bottomThickness}
      position={[0, carcassYOffset - carcassHeight / 2 + bottomThickness / 2, backPanelThickness / 2]}
      color={bottomMat.color}
      roughness={bottomMat.roughness}
      map={bottomMat.map}
      hasSinkCutout={config.isSink}
    />
  );

  // Render back panel (with 16mm setback for hanging rails)
  const renderBack = () => (
    <BackPanel
      width={interiorWidth}
      height={carcassHeight - bottomThickness * 2}
      position={[0, carcassYOffset, -depthM / 2 + backSetback + backPanelThickness / 2]}
      setback={backSetback}
    />
  );

  // Render adjustable shelves based on recipe
  const renderShelves = () => {
    // Skip shelves for corner cabinets (they have internal shelves in CornerCarcass)
    if (isCornerCabinet) return null;
    
    // Use recipe shelf count, or fall back to config
    const shelfCount = recipe?.shelves.count ?? (config.shelfCount > 0 ? config.shelfCount : 1);
    if (shelfCount === 0) return null;
    
    const isAdjustable = recipe?.shelves.adjustable ?? true;
    const shelfSetback = (recipe?.shelves.setback ?? globalDimensions.shelfSetback ?? 20) / 1000;
    
    const shelves = [];
    const usableHeight = carcassHeight - bottomThickness * 2;
    const shelfSpacing = usableHeight / (shelfCount + 1);
    
    for (let i = 1; i <= shelfCount; i++) {
      const shelfY = carcassYOffset - carcassHeight / 2 + bottomThickness + shelfSpacing * i;
      shelves.push(
        <Shelf
          key={`shelf-${i}`}
          width={interiorWidth - 0.004} // Slight gap for adjustment
          depth={depthM - backPanelThickness - shelfSetback}
          thickness={shelfThickness}
          position={[0, shelfY, backPanelThickness / 2 + 0.005]}
          color="#f0f0f0"
          map={null}
          setback={shelfSetback}
          adjustable={isAdjustable}
        />
      );
    }
    return shelves;
  };

  /**
   * Calculate variable drawer heights - larger drawers at bottom (Microvellum standard)
   */
  const getDrawerHeights = (count: number, totalHeight: number): number[] => {
    // Microvellum-style drawer height distributions (proportions)
    const distributions: Record<number, number[]> = {
      1: [1.0],
      2: [0.40, 0.60],           // Top 40%, Bottom 60%
      3: [0.25, 0.33, 0.42],     // Small, Medium, Large
      4: [0.18, 0.24, 0.28, 0.30],
      5: [0.14, 0.18, 0.22, 0.22, 0.24],
    };
    
    const ratios = distributions[count] || Array(count).fill(1 / count);
    return ratios.map(ratio => ratio * totalHeight);
  };

  /**
   * Calculate section heights for door+drawer combination cabinets
   */
  const getDrawerSectionHeight = (drawerCount: number, carcassH: number): number => {
    // Standard drawer section heights based on count
    const drawerHeights: Record<number, number> = {
      1: 0.18,   // 180mm for single drawer
      2: 0.32,   // 320mm for 2 drawers
      3: 0.45,   // 450mm for 3 drawers
      4: 0.55,   // 550mm for 4 drawers
    };
    const baseHeight = drawerHeights[drawerCount] || drawerCount * 0.15;
    // Cap at 60% of carcass height to leave room for doors
    return Math.min(baseHeight, carcassH * 0.6);
  };

  // Check if this is a combination cabinet (has both doors AND drawers)
  const hasBothDoorsAndDrawers = config.doorCount > 0 && config.drawerCount > 0;
  const drawerSectionHeight = hasBothDoorsAndDrawers 
    ? getDrawerSectionHeight(config.drawerCount, carcassHeight)
    : 0;
  const doorSectionHeight = hasBothDoorsAndDrawers 
    ? carcassHeight - drawerSectionHeight - shelfThickness // Include divider
    : carcassHeight;

  // Render doors - now handles combination cabinets and corner cabinets
  // Uses physical shadow gap and 32mm system handle positioning
  // FIXED: Proper door height calculation based on opening, not arbitrary reductions
  const renderDoors = () => {
    // Skip if no doors (unless it's a sink cabinet which always has doors)
    if (config.doorCount === 0 && !config.isSink) return null;
    const actualDoorCount = config.doorCount > 0 ? config.doorCount : (config.isSink ? 2 : 0);
    if (actualDoorCount === 0) return null;
    
    // Physical shadow gap: doors sit in front of carcass with real 3D gap
    const frontZ = depthM / 2 + doorThickness / 2 + shadowGap;
    
    // For corner cabinets, render doors differently based on corner type
    if (isCornerCabinet) {
      return renderCornerDoors();
    }
    
    // Calculate available opening height for doors
    // For combo cabinets: opening is from bottom of carcass to bottom of drawer divider
    // For standard: full carcass height minus false front if present
    const falseFrontH = (config.isSink && config.hasFalseFront) ? 0.08 : 0; // 80mm false front
    const openingHeight = hasBothDoorsAndDrawers 
      ? doorSectionHeight
      : carcassHeight - falseFrontH;
    
    // Door fills opening minus reveals on all sides
    // Top reveal: gap between door top and carcass top (or divider bottom)
    // Bottom reveal: gap between door bottom and carcass bottom
    const effectiveDoorHeight = openingHeight - topReveal - bottomReveal;
    
    // Center doors vertically in their opening
    const openingCenterY = hasBothDoorsAndDrawers
      ? carcassYOffset - carcassHeight / 2 + doorSectionHeight / 2  // Center of door section
      : carcassYOffset - falseFrontH / 2;  // Shifted down if false front present
    
    const doorY = openingCenterY;
    
    // Two door cabinet (pair doors)
    if (actualDoorCount >= 2) {
      // Each door is half the interior width minus gap between them minus side reveals
      const totalDoorWidth = widthM - sideReveal * 2;
      const doorWidth = (totalDoorWidth - doorGap) / 2;
      
      // 32mm system handle positions
      const handleOffset = 0.032; // 32mm from door edge
      const handleY = config.category === 'Base' 
        ? effectiveDoorHeight / 2 - 0.096  // 96mm from top for base
        : -effectiveDoorHeight / 2 + 0.096; // 96mm from bottom for wall
      
      return (
        <>
          {/* Left door - hinge on left edge */}
          <DoorFront
            width={doorWidth}
            height={effectiveDoorHeight}
            thickness={doorThickness}
            position={[-doorWidth / 2 - doorGap / 2, doorY, frontZ]}
            color={doorMat.color}
            roughness={doorMat.roughness}
            map={doorMat.map}
            gap={0} // Gap already accounted for in positioning
            hingeLeft={true}
          />
          <HandleMesh
            type={handle.type}
            color={handle.hex}
            position={[
              doorWidth / 2 - handleOffset - doorGap / 2,  // Near right edge of left door
              doorY + handleY,
              frontZ + doorThickness / 2 + 0.015
            ]}
          />
          {/* Right door - hinge on right edge */}
          <DoorFront
            width={doorWidth}
            height={effectiveDoorHeight}
            thickness={doorThickness}
            position={[doorWidth / 2 + doorGap / 2, doorY, frontZ]}
            color={doorMat.color}
            roughness={doorMat.roughness}
            map={doorMat.map}
            gap={0}
            hingeLeft={false}
          />
          <HandleMesh
            type={handle.type}
            color={handle.hex}
            position={[
              -doorWidth / 2 + handleOffset + doorGap / 2,  // Near left edge of right door
              doorY + handleY,
              frontZ + doorThickness / 2 + 0.015
            ]}
          />
        </>
      );
    }
    
    // Single door - fills full width minus side reveals
    const doorWidth = widthM - sideReveal * 2;
    const handleOffset = 0.032; // 32mm from edge
    const handleX = hingeLeft ? doorWidth / 2 - handleOffset : -doorWidth / 2 + handleOffset;
    const handleY = config.category === 'Base' 
      ? effectiveDoorHeight / 2 - 0.096 
      : -effectiveDoorHeight / 2 + 0.096;
    
    return (
      <>
        <DoorFront
          width={doorWidth}
          height={effectiveDoorHeight}
          thickness={doorThickness}
          position={[0, doorY, frontZ]}
          color={doorMat.color}
          roughness={doorMat.roughness}
          map={doorMat.map}
          gap={0}
          hingeLeft={hingeLeft}
        />
        <HandleMesh
          type={handle.type}
          color={handle.hex}
          position={[handleX, doorY + handleY, frontZ + doorThickness / 2 + 0.015]}
          rotation={0}
        />
      </>
    );
  };

  // Render doors for corner cabinets - special positioning for L-shape, blind, diagonal
  const renderCornerDoors = () => {
    const doorHeight = carcassHeight - topReveal - bottomReveal;
    const doorY = carcassYOffset;
    const armWidth = 0.45; // 450mm standard arm opening (matches CornerCarcass)
    
    // For L-shape corner: doors on both arm fronts
    if (cornerType === 'l-shape') {
      const doorWidth = armWidth - sideReveal * 2;
      
      // Left arm door - at front of left arm (positive Z)
      const leftDoorX = -widthM / 2 + armWidth / 2 + gableThickness / 2;
      const leftDoorZ = leftArmDepthM / 2 + doorThickness / 2 + 0.002;
      
      // Right arm door - at front of right arm (positive X, rotated)
      const rightDoorX = rightArmDepthM / 2 + doorThickness / 2 + 0.002;
      const rightDoorZ = -depthM / 2 + armWidth / 2 + gableThickness / 2;
      
      return (
        <>
          {/* Left arm door - faces +Z direction */}
          <DoorFront
            width={doorWidth}
            height={doorHeight}
            thickness={doorThickness}
            position={[leftDoorX, doorY, leftDoorZ]}
            color={doorMat.color}
            roughness={doorMat.roughness}
            map={doorMat.map}
            gap={0}
            hingeLeft={true}
          />
          <HandleMesh
            type={handle.type}
            color={handle.hex}
            position={[
              leftDoorX + doorWidth / 2 - 0.04,
              doorY + doorHeight / 2 - 0.096,
              leftDoorZ + doorThickness / 2 + 0.015
            ]}
          />
          
          {/* Right arm door - faces +X direction (rotated 90 degrees) */}
          <group position={[rightDoorX, doorY, rightDoorZ]} rotation={[0, -Math.PI / 2, 0]}>
            <DoorFront
              width={doorWidth}
              height={doorHeight}
              thickness={doorThickness}
              position={[0, 0, 0]}
              color={doorMat.color}
              roughness={doorMat.roughness}
              map={doorMat.map}
              gap={0}
              hingeLeft={false}
            />
            <HandleMesh
              type={handle.type}
              color={handle.hex}
              position={[
                -doorWidth / 2 + 0.04,
                doorHeight / 2 - 0.096,
                doorThickness / 2 + 0.015
              ]}
            />
          </group>
        </>
      );
    }
    
    // Diagonal corner: angled door at 45 degrees
    if (cornerType === 'diagonal') {
      const diagonalDoorWidth = Math.sqrt(2) * widthM * 0.35;
      
      return (
        <group position={[0, 0, depthM / 4]} rotation={[0, -Math.PI / 4, 0]}>
          <DoorFront
            width={diagonalDoorWidth}
            height={doorHeight}
            thickness={doorThickness}
            position={[0, doorY, doorThickness / 2 + 0.01]}
            color={doorMat.color}
            roughness={doorMat.roughness}
            map={doorMat.map}
            gap={doorGap}
            hingeLeft={true}
          />
          <HandleMesh
            type={handle.type}
            color={handle.hex}
            position={[diagonalDoorWidth / 2 - 0.06, doorY + doorHeight / 2 - 0.08, doorThickness + 0.02]}
          />
        </group>
      );
    }
    
    // Blind corner: single door on accessible side
    const blindIsLeft = item.blindSide === 'Left';
    const frontZ = depthM / 2 + 0.01;
    
    // Door only on the accessible side (opposite of blind)
    const doorX = blindIsLeft ? widthM / 4 : -widthM / 4;
    const doorWidth = widthM / 2;
    
    return (
      <>
        <DoorFront
          width={doorWidth}
          height={doorHeight}
          thickness={doorThickness}
          position={[doorX, doorY, frontZ]}
          color={doorMat.color}
          roughness={doorMat.roughness}
          map={doorMat.map}
          gap={doorGap}
          hingeLeft={!blindIsLeft}
        />
        <HandleMesh
          type={handle.type}
          color={handle.hex}
          position={[blindIsLeft ? doorX - doorWidth / 2 + 0.04 : doorX + doorWidth / 2 - 0.04, doorY + doorHeight / 2 - 0.08, frontZ + doorThickness / 2 + 0.015]}
        />
      </>
    );
  };

  // Render drawers with variable heights (Microvellum-compliant)
  // Uses physical shadow gap and reveals
  // FIXED: Proper drawer positioning that fills the opening correctly
  const renderDrawers = () => {
    if (config.drawerCount === 0) return null;
    
    // Physical shadow gap: drawers sit in front of carcass with real 3D gap
    const frontZ = depthM / 2 + doorThickness / 2 + shadowGap;
    
    // Drawer width with side reveals
    const drawerWidth = widthM - sideReveal * 2;
    
    // For combination cabinets, drawers use only the drawer section
    // Total available height for drawers (minus top and bottom reveals)
    const totalOpeningHeight = hasBothDoorsAndDrawers ? drawerSectionHeight : carcassHeight;
    const usableHeight = totalOpeningHeight - topReveal - bottomReveal;
    
    // Get proportional heights for each drawer
    const drawerHeights = getDrawerHeights(config.drawerCount, usableHeight);
    
    // Starting Y position - top of usable area
    // For combo: from top of carcass down to divider
    // For drawer-only: from top of carcass down
    const topOfDrawers = carcassYOffset + carcassHeight / 2 - topReveal;
    
    let currentY = topOfDrawers;
    
    return drawerHeights.map((drawerHeight, i) => {
      // Each drawer has a gap above it (except first which has topReveal)
      const gapAbove = i > 0 ? drawerGap : 0;
      const effectiveHeight = drawerHeight - gapAbove;
      
      // Position drawer centered in its slot
      const drawerCenterY = currentY - gapAbove - effectiveHeight / 2;
      currentY -= drawerHeight;
      
      return (
        <React.Fragment key={`drawer-${i}`}>
          <DrawerFront
            width={drawerWidth}
            height={effectiveHeight}
            thickness={doorThickness}
            position={[0, drawerCenterY, frontZ]}
            color={drawerMat.color}
            roughness={drawerMat.roughness}
            map={drawerMat.map}
            gap={0} // Gap already accounted for
            showBox={true}
          />
          <HandleMesh
            type={handle.type}
            color={handle.hex}
            position={[0, drawerCenterY, frontZ + doorThickness / 2 + 0.015]}
            rotation={Math.PI / 2}
          />
        </React.Fragment>
      );
    });
  };

  // Render horizontal divider between drawers and doors (for combination cabinets)
  const renderDivider = () => {
    if (!hasBothDoorsAndDrawers) return null;
    
    const dividerY = carcassYOffset + carcassHeight / 2 - drawerSectionHeight - shelfThickness / 2;
    
    return (
      <DividerPanel
        width={interiorWidth}
        depth={depthM - backPanelThickness}
        thickness={shelfThickness}
        position={[0, dividerY, backPanelThickness / 2]}
        color={gableMat.color}
        roughness={gableMat.roughness}
        map={gableMat.map}
      />
    );
  };

  // Render top panel for wall cabinets
  const renderTopPanel = () => {
    if (config.category !== 'Wall') return null;
    
    return (
      <TopPanel
        width={interiorWidth}
        depth={depthM - backPanelThickness}
        thickness={bottomThickness}
        position={[0, carcassYOffset + carcassHeight / 2 - bottomThickness / 2, backPanelThickness / 2]}
        color={gableMat.color}
        roughness={gableMat.roughness}
        map={gableMat.map}
      />
    );
  };

  // Render false front for sink cabinets (ONLY if hasFalseFront is true)
  const renderFalseFront = () => {
    if (!config.isSink || !config.hasFalseFront) return null;
    
    const falseFrontHeight = 0.08; // 80mm false front
    const frontZ = depthM / 2 + 0.01;
    const falseFrontY = carcassYOffset + carcassHeight / 2 - falseFrontHeight / 2;
    
    return (
      <>
        <FalseFront
          width={widthM}
          height={falseFrontHeight}
          thickness={doorThickness}
          position={[0, falseFrontY, frontZ]}
          color={falseFrontMat.color}
          roughness={falseFrontMat.roughness}
          map={falseFrontMat.map}
        />
        <HandleMesh
          type={handle.type}
          color={handle.hex}
          position={[0, falseFrontY, frontZ + doorThickness / 2 + 0.015]}
          rotation={Math.PI / 2}
        />
      </>
    );
  };

  // Render kickboard and legs
  const renderKickboard = () => {
    if (!hasKick) return null;
    
    return (
      <>
        {/* Cabinet legs - visible under kick */}
        <CabinetLegs
          width={widthM}
          depth={depthM}
          height={kickHeight}
          isCorner={isCornerCabinet}
          cornerType={cornerType as 'l-shape' | 'blind' | 'diagonal'}
          leftArmDepth={leftArmDepthM}
          rightArmDepth={rightArmDepthM}
        />
        {/* Kickboard panel */}
        <Kickboard
          width={widthM}
          height={kickHeight}
          position={[0, -heightM / 2 + kickHeight / 2, isCornerCabinet ? 0 : depthM / 2 - 0.04]}
          color={kickMat.color}
          roughness={kickMat.roughness}
          map={kickMat.map}
          isCorner={isCornerCabinet}
          cornerType={cornerType as 'l-shape' | 'blind' | 'diagonal'}
          depth={depthM}
          leftArmDepth={leftArmDepthM}
          rightArmDepth={rightArmDepthM}
        />
      </>
    );
  };

  // Render benchtop (base cabinets only)
  const renderBenchtop = () => {
    if (config.category !== 'Base') return null;
    
    const fillerLeftM = (item.fillerLeft || 0) / 1000;
    const fillerRightM = (item.fillerRight || 0) / 1000;
    
    return (
      <BenchtopMesh
        width={widthM}
        depth={depthM}
        thickness={btThickness}
        position={[0, heightM / 2 + btThickness / 2, 0]}
        color={benchMat.color}
        roughness={benchMat.roughness}
        map={benchMat.map}
        overhang={btOverhang}
        leftOverhang={fillerLeftM}
        rightOverhang={fillerRightM}
        hasSinkCutout={config.isSink}
        isCorner={isCornerCabinet}
        cornerType={cornerType as 'l-shape' | 'blind' | 'diagonal'}
        leftArmDepth={leftArmDepthM}
        rightArmDepth={rightArmDepthM}
      />
    );
  };

  // Render end panels (if specified on item)
  const renderEndPanels = () => {
    const panels = [];
    
    if (item.endPanelLeft) {
      panels.push(
        <Gable
          key="end-panel-left"
          width={gableThickness}
          height={carcassHeight}
          depth={depthM}
          position={[-widthM / 2 - gableThickness / 2, carcassYOffset, 0]}
          color={endPanelMat.color}
          roughness={endPanelMat.roughness}
          map={endPanelMat.map}
        />
      );
    }
    
    if (item.endPanelRight) {
      panels.push(
        <Gable
          key="end-panel-right"
          width={gableThickness}
          height={carcassHeight}
          depth={depthM}
          position={[widthM / 2 + gableThickness / 2, carcassYOffset, 0]}
          color={endPanelMat.color}
          roughness={endPanelMat.roughness}
          map={endPanelMat.map}
        />
      );
    }
    
    return panels;
  };

  // Render filler strips
  const renderFillers = () => {
    const fillers = [];
    
    if (item.fillerLeft && item.fillerLeft > 0) {
      const fillerW = item.fillerLeft / 1000;
      fillers.push(
        <mesh key="filler-left" position={[-widthM / 2 - fillerW / 2, carcassYOffset, depthM / 2 + 0.005]}>
          <boxGeometry args={[fillerW, carcassHeight, 0.01]} />
          <meshStandardMaterial color={doorMat.color} roughness={doorMat.roughness} />
        </mesh>
      );
    }
    
    if (item.fillerRight && item.fillerRight > 0) {
      const fillerW = item.fillerRight / 1000;
      fillers.push(
        <mesh key="filler-right" position={[widthM / 2 + fillerW / 2, carcassYOffset, depthM / 2 + 0.005]}>
          <boxGeometry args={[fillerW, carcassHeight, 0.01]} />
          <meshStandardMaterial color={doorMat.color} roughness={doorMat.roughness} />
        </mesh>
      );
    }
    
    return fillers;
  };

  // Render oven cavity for appliance cabinets
  const renderOvenCavity = () => {
    if (!config.isOven) return null;
    
    return (
      <mesh position={[0, carcassYOffset + 0.1, 0.01]}>
        <boxGeometry args={[widthM - 0.04, carcassHeight * 0.6, depthM - 0.04]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.5} />
      </mesh>
    );
  };

  // Render fridge space indicator
  const renderFridgeSpace = () => {
    if (!config.isFridge) return null;
    
    return (
      <mesh position={[0, carcassYOffset, 0]}>
        <boxGeometry args={[widthM - 0.1, carcassHeight - 0.1, depthM - 0.1]} />
        <meshStandardMaterial color="#e5e7eb" transparent opacity={0.3} />
      </mesh>
    );
  };

  return (
    <>
      {/* Selection/hover highlight */}
      {(isSelected || hovered || isDragged) && (
        <mesh>
          <boxGeometry args={[widthM + 0.05, heightM + 0.05, depthM + 0.05]} />
          <meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent />
        </mesh>
      )}
      
      {/* Carcass interior (visible through gaps) - with edge outline */}
      <group position={[0, carcassYOffset, 0]}>
        <mesh>
          <boxGeometry args={[interiorWidth - 0.002, carcassHeight - 0.002, depthM - backPanelThickness - 0.002]} />
          <meshStandardMaterial color="#f5f5f5" roughness={0.7} />
        </mesh>
        <EdgeOutline 
          width={interiorWidth - 0.002} 
          height={carcassHeight - 0.002} 
          depth={depthM - backPanelThickness - 0.002}
          color="#888888"
        />
      </group>
      
      {/* Cabinet structure */}
      {renderGables()}
      {renderBottom()}
      {renderTopPanel()}
      {renderBack()}
      {renderShelves()}
      
      {/* Fronts - doors and/or drawers */}
      {renderDoors()}
      {renderDrawers()}
      {renderDivider()}
      {renderFalseFront()}
      
      {/* Accessories */}
      {renderEndPanels()}
      {renderFillers()}
      {renderKickboard()}
      {renderBenchtop()}
      
      {/* Special cabinet features */}
      {renderOvenCavity()}
      {renderFridgeSpace()}
      
      {/* Cabinet info label with debug info for corners */}
      {isSelected && (
        <Html position={[0, heightM / 2 + 0.4, 0]} center zIndexRange={[100, 0]}>
          <div className="bg-gray-900/90 backdrop-blur text-white px-3 py-2 rounded-md shadow-xl border border-white/20 flex flex-col items-center pointer-events-none select-none min-w-[100px]">
            <span className="text-xs font-bold tracking-wide text-blue-200">{item.cabinetNumber}</span>
            <div className="h-px w-full bg-white/20 my-1"></div>
            <span className="text-[10px] text-gray-300 truncate max-w-[150px]">{config.productName}</span>
            <span className="text-[10px] text-gray-400 font-mono">{Math.round(item.width)}w × {Math.round(item.height)}h × {Math.round(item.depth)}d</span>
            {isCornerCabinet && (
              <>
                <div className="h-px w-full bg-yellow-500/30 my-1"></div>
                <span className="text-[9px] text-yellow-300 font-mono">Corner: {cornerType}</span>
                {cornerType === 'l-shape' && (
                  <span className="text-[9px] text-yellow-200 font-mono">L: {Math.round(leftArmDepthM * 1000)}mm R: {Math.round(rightArmDepthM * 1000)}mm</span>
                )}
                {cornerType === 'blind' && (
                  <span className="text-[9px] text-yellow-200 font-mono">Blind: {item.blindSide || 'Left'} {Math.round(blindDepthM * 1000)}mm</span>
                )}
              </>
            )}
          </div>
        </Html>
      )}
    </>
  );
};

export default CabinetAssembler;
