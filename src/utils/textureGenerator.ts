import * as THREE from 'three';

const textureCache: Record<string, THREE.CanvasTexture> = {};

export type TextureConfig = 'wood' | 'stone' | 'concrete' | 'marble' | 'noise';
export type GrainDirection = 'horizontal' | 'vertical' | 'none';

export interface TextureOptions {
  grainDirection?: GrainDirection;
  tintColor?: string;
}

/**
 * Check if we're in a browser environment with canvas support
 */
function canUseCanvas(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext && canvas.getContext('2d'));
  } catch {
    return false;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  try {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  } catch {
    return null;
  }
}

function createTextureCanvas(
  type: TextureConfig, 
  width: number = 512, 
  height: number = 512,
  options: TextureOptions = {}
): HTMLCanvasElement | null {
  if (!canUseCanvas()) {
    console.warn('Canvas not available for texture generation');
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;
  const { grainDirection = 'vertical', tintColor } = options;
  const tint = tintColor ? hexToRgb(tintColor) : null;

  for (let i = 0; i < data.length; i += 4) {
    let val = Math.random() * 255;
    const pixelIndex = i / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (type === 'wood') {
      // Create wood grain based on direction
      if (grainDirection === 'horizontal') {
        // Horizontal grain - lines run left to right
        const grain = (Math.sin(x * 0.1) + Math.cos(x * 0.05)) * 20;
        val = (Math.random() * 50 + 150) + grain;
        // Add occasional horizontal knots
        if (Math.random() > 0.998) val -= 80;
      } else {
        // Vertical grain - lines run top to bottom (default for doors/gables)
        const grain = (Math.sin(y * 0.1) + Math.cos(y * 0.05)) * 20;
        val = (Math.random() * 50 + 150) + grain;
        // Add occasional vertical knots
        if (Math.random() > 0.998) val -= 80;
      }
    }
    else if (type === 'stone') {
      val = Math.random() * 40 + 200;
    }
    else if (type === 'concrete') {
      val = Math.random() * 60 + 100;
    }
    else if (type === 'marble') {
      const vein = Math.sin(x * 0.02 + y * 0.02 + Math.random()) * 100;
      val = 220 + vein * 0.2;
    }

    val = Math.max(0, Math.min(255, val));
    
    // Apply tint if provided
    if (tint) {
      const brightness = val / 255;
      data[i] = Math.round(tint.r * brightness);
      data[i + 1] = Math.round(tint.g * brightness);
      data[i + 2] = Math.round(tint.b * brightness);
    } else {
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);

  // Add wood grain overlay lines
  if (type === 'wood') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(100, 80, 50, 0.08)';
    ctx.lineWidth = 1;
    
    if (grainDirection === 'horizontal') {
      // Horizontal grain lines
      for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.moveTo(0, Math.random() * height);
        ctx.bezierCurveTo(
          width / 3, Math.random() * height,
          width * 2 / 3, Math.random() * height,
          width, Math.random() * height
        );
        ctx.stroke();
      }
    } else {
      // Vertical grain lines
      for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, 0);
        ctx.bezierCurveTo(
          Math.random() * width, height / 3,
          Math.random() * width, height * 2 / 3,
          Math.random() * width, height
        );
        ctx.stroke();
      }
    }
  }

    return canvas;
  } catch (error) {
    console.warn('Failed to create texture canvas:', error);
    return null;
  }
}

/**
 * Get a procedural texture with optional grain direction and tint
 */
export const getProceduralTexture = (
  type: TextureConfig | 'none',
  options: TextureOptions = {}
): THREE.Texture | null => {
  if (type === 'none') return null;

  // Create cache key including options
  const cacheKey = `${type}_${options.grainDirection || 'vertical'}_${options.tintColor || 'none'}`;
  
  if (textureCache[cacheKey]) {
    return textureCache[cacheKey];
  }

  try {
    const canvas = createTextureCanvas(type, 512, 512, options);
    if (!canvas) return null;

    const texture = new THREE.CanvasTexture(canvas);

    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;

      if (type === 'wood') {
        texture.repeat.set(1, 1);
      } else if (type === 'concrete' || type === 'stone') {
        texture.repeat.set(2, 2);
      }

      textureCache[cacheKey] = texture;
      return texture;
    }
  } catch (e) {
    console.warn("Failed to generate texture:", e);
  }

  return null;
};

/**
 * Get wood texture with specific grain direction
 */
export const getWoodTexture = (
  grainDirection: GrainDirection = 'vertical',
  tintColor?: string
): THREE.Texture | null => {
  return getProceduralTexture('wood', { grainDirection, tintColor });
};

/**
 * Clear texture cache (useful when finish colors change)
 */
export const clearTextureCache = (): void => {
  Object.keys(textureCache).forEach(key => {
    textureCache[key].dispose();
    delete textureCache[key];
  });
};
