import React from 'react';
import { Html } from '@react-three/drei';
import { PlacedItem } from '../../types';
import { CabinetRenderConfig } from '../../types/cabinetConfig';

interface AppliancePlaceholderProps {
  item: PlacedItem;
  config: CabinetRenderConfig;
  isSelected: boolean;
  isDragged: boolean;
  hovered: boolean;
}

/**
 * Appliance Placeholder - Renders recognizable 3D shapes for different appliances
 * Handles: Fridges, Dishwashers, Ovens, Rangehoods, Cooktops, Microwaves
 */
const AppliancePlaceholder: React.FC<AppliancePlaceholderProps> = ({
  item,
  config,
  isSelected,
  isDragged,
  hovered,
}) => {
  // Dimensions in meters
  const widthM = (item.width || 600) / 1000;
  const heightM = (item.height || 870) / 1000;
  const depthM = (item.depth || 575) / 1000;

  const name = config.productName.toLowerCase();

  // Determine appliance type from config flags or name
  const isFridge = config.isFridge || name.includes('fridge') || name.includes('refrigerator');
  const isDishwasher = config.isDishwasher || name.includes('dishwasher') || name.includes('dw ');
  const isOven = config.isOven || name.includes('oven');
  const isRangehood = config.isRangehood || name.includes('rangehood') || name.includes('canopy');
  const isCooktop = name.includes('cooktop') || name.includes('hotplate');
  const isMicrowave = name.includes('microwave');

  const renderHighlight = () => (
    (isSelected || hovered || isDragged) && (
      <mesh>
        <boxGeometry args={[widthM + 0.02, heightM + 0.02, depthM + 0.02]} />
        <meshBasicMaterial color={isDragged ? "#2563eb" : "#3b82f6"} wireframe opacity={0.5} transparent />
      </mesh>
    )
  );

  const renderLabel = () => (
    isSelected && (
      <Html position={[0, heightM / 2 + 0.15, 0]} center zIndexRange={[100, 0]}>
        <div className="bg-gray-900/90 backdrop-blur text-white px-2 py-1 rounded-md shadow-xl text-xs font-medium pointer-events-none select-none">
          {config.productName}
        </div>
      </Html>
    )
  );

  // Fridge - Tall box with door handle indication
  if (isFridge) {
    return (
      <group>
        {renderHighlight()}
        {/* Main body - stainless steel look */}
        <mesh>
          <boxGeometry args={[widthM, heightM, depthM]} />
          <meshStandardMaterial color="#d4d4d8" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Door line */}
        <mesh position={[0, 0, depthM / 2 + 0.001]}>
          <planeGeometry args={[0.002, heightM - 0.05]} />
          <meshBasicMaterial color="#71717a" />
        </mesh>
        {/* Handle */}
        <mesh position={[-widthM / 2 + 0.05, 0, depthM / 2 + 0.015]}>
          <boxGeometry args={[0.02, 0.3, 0.02]} />
          <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Ice dispenser area */}
        <mesh position={[0, heightM * 0.2, depthM / 2 + 0.005]}>
          <boxGeometry args={[widthM * 0.3, 0.15, 0.01]} />
          <meshStandardMaterial color="#27272a" roughness={0.5} />
        </mesh>
        {renderLabel()}
      </group>
    );
  }

  // Dishwasher - Box with control panel
  if (isDishwasher) {
    return (
      <group>
        {renderHighlight()}
        {/* Main body */}
        <mesh>
          <boxGeometry args={[widthM, heightM, depthM]} />
          <meshStandardMaterial color="#e4e4e7" metalness={0.4} roughness={0.4} />
        </mesh>
        {/* Control panel strip */}
        <mesh position={[0, heightM / 2 - 0.03, depthM / 2 + 0.001]}>
          <boxGeometry args={[widthM - 0.04, 0.04, 0.005]} />
          <meshStandardMaterial color="#18181b" roughness={0.3} />
        </mesh>
        {/* Control buttons */}
        {[-0.08, -0.04, 0, 0.04, 0.08].map((xPos, i) => (
          <group key={i} position={[xPos, heightM / 2 - 0.03, depthM / 2 + 0.005]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
              <cylinderGeometry args={[0.008, 0.008, 0.003, 16]} />
              <meshStandardMaterial color="#3f3f46" metalness={0.5} roughness={0.3} />
            </mesh>
          </group>
        ))}
        {/* Handle */}
        <mesh position={[0, heightM / 2 - 0.07, depthM / 2 + 0.015]}>
          <boxGeometry args={[widthM * 0.6, 0.015, 0.02]} />
          <meshStandardMaterial color="#52525b" metalness={0.7} roughness={0.3} />
        </mesh>
        {renderLabel()}
      </group>
    );
  }

  // Oven - Box with glass door and controls
  if (isOven) {
    return (
      <group>
        {renderHighlight()}
        {/* Main body */}
        <mesh>
          <boxGeometry args={[widthM, heightM, depthM]} />
          <meshStandardMaterial color="#27272a" metalness={0.3} roughness={0.5} />
        </mesh>
        {/* Glass door */}
        <mesh position={[0, -heightM * 0.1, depthM / 2 + 0.001]}>
          <boxGeometry args={[widthM - 0.06, heightM * 0.6, 0.01]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.1} roughness={0.2} transparent opacity={0.8} />
        </mesh>
        {/* Control panel */}
        <mesh position={[0, heightM / 2 - 0.06, depthM / 2 + 0.001]}>
          <boxGeometry args={[widthM - 0.04, 0.08, 0.005]} />
          <meshStandardMaterial color="#3f3f46" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Control knobs */}
        {[-0.1, -0.05, 0.05, 0.1].map((xPos, i) => (
          <group key={i} position={[xPos, heightM / 2 - 0.06, depthM / 2 + 0.01]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
              <cylinderGeometry args={[0.012, 0.012, 0.015, 16]} />
              <meshStandardMaterial color="#71717a" metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        ))}
        {/* Handle */}
        <mesh position={[0, 0.02, depthM / 2 + 0.02]}>
          <boxGeometry args={[widthM * 0.5, 0.02, 0.02]} />
          <meshStandardMaterial color="#52525b" metalness={0.7} roughness={0.3} />
        </mesh>
        {renderLabel()}
      </group>
    );
  }

  // Rangehood - Canopy shape
  if (isRangehood) {
    return (
      <group>
        {renderHighlight()}
        {/* Main canopy */}
        <mesh position={[0, 0, depthM * 0.1]}>
          <boxGeometry args={[widthM, heightM * 0.4, depthM * 0.8]} />
          <meshStandardMaterial color="#e4e4e7" metalness={0.5} roughness={0.3} />
        </mesh>
        {/* Chimney/flue */}
        <mesh position={[0, heightM * 0.35, -depthM * 0.2]}>
          <boxGeometry args={[widthM * 0.4, heightM * 0.5, depthM * 0.3]} />
          <meshStandardMaterial color="#d4d4d8" metalness={0.5} roughness={0.3} />
        </mesh>
        {/* Filter grille */}
        <mesh position={[0, -heightM * 0.15, depthM * 0.15]}>
          <boxGeometry args={[widthM - 0.04, 0.01, depthM * 0.5]} />
          <meshStandardMaterial color="#a1a1aa" metalness={0.7} roughness={0.2} />
        </mesh>
        {/* Light indicators */}
        <mesh position={[-widthM * 0.25, -heightM * 0.12, depthM * 0.3]}>
          <boxGeometry args={[0.05, 0.01, 0.05]} />
          <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[widthM * 0.25, -heightM * 0.12, depthM * 0.3]}>
          <boxGeometry args={[0.05, 0.01, 0.05]} />
          <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.3} />
        </mesh>
        {renderLabel()}
      </group>
    );
  }

  // Cooktop - Flat surface with burners
  if (isCooktop) {
    return (
      <group>
        {renderHighlight()}
        {/* Glass/ceramic surface */}
        <mesh>
          <boxGeometry args={[widthM, 0.03, depthM]} />
          <meshStandardMaterial color="#18181b" metalness={0.1} roughness={0.2} />
        </mesh>
        {/* Burner circles */}
        {[
          [-widthM * 0.25, -depthM * 0.25],
          [widthM * 0.25, -depthM * 0.25],
          [-widthM * 0.25, depthM * 0.2],
          [widthM * 0.25, depthM * 0.2],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.016, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.06, 0.08, 32]} />
            <meshStandardMaterial color="#3f3f46" metalness={0.3} roughness={0.5} />
          </mesh>
        ))}
        {/* Control area */}
        <mesh position={[0, 0.016, depthM / 2 - 0.04]}>
          <boxGeometry args={[widthM - 0.1, 0.002, 0.05]} />
          <meshStandardMaterial color="#27272a" roughness={0.4} />
        </mesh>
        {renderLabel()}
      </group>
    );
  }

  // Microwave - Small box with display
  if (isMicrowave) {
    return (
      <group>
        {renderHighlight()}
        {/* Main body */}
        <mesh>
          <boxGeometry args={[widthM, heightM, depthM]} />
          <meshStandardMaterial color="#27272a" metalness={0.3} roughness={0.5} />
        </mesh>
        {/* Door/window */}
        <mesh position={[-widthM * 0.15, 0, depthM / 2 + 0.001]}>
          <boxGeometry args={[widthM * 0.5, heightM * 0.7, 0.01]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.1} roughness={0.2} transparent opacity={0.7} />
        </mesh>
        {/* Control panel */}
        <mesh position={[widthM * 0.3, 0, depthM / 2 + 0.001]}>
          <boxGeometry args={[widthM * 0.25, heightM * 0.8, 0.005]} />
          <meshStandardMaterial color="#3f3f46" roughness={0.4} />
        </mesh>
        {/* Display */}
        <mesh position={[widthM * 0.3, heightM * 0.2, depthM / 2 + 0.005]}>
          <boxGeometry args={[widthM * 0.15, 0.03, 0.002]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.3} />
        </mesh>
        {renderLabel()}
      </group>
    );
  }

  // Generic appliance fallback
  return (
    <group>
      {renderHighlight()}
      <mesh>
        <boxGeometry args={[widthM, heightM, depthM]} />
        <meshStandardMaterial color="#d4d4d8" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* Generic control panel */}
      <mesh position={[0, heightM / 2 - 0.04, depthM / 2 + 0.001]}>
        <boxGeometry args={[widthM * 0.6, 0.04, 0.005]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.4} />
      </mesh>
      {renderLabel()}
    </group>
  );
};

export default AppliancePlaceholder;
