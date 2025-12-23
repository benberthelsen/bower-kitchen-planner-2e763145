import * as THREE from 'three';

const textureCache: Record<string, THREE.CanvasTexture> = {};

type TextureConfig = 'wood' | 'stone' | 'concrete' | 'marble' | 'noise';

function createTextureCanvas(type: TextureConfig, width: number = 512, height: number = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    let val = Math.random() * 255;

    if (type === 'wood') {
      const y = Math.floor((i / 4) / width);
      const grain = (Math.sin(y * 0.1) + Math.cos(y * 0.05)) * 20;
      val = (Math.random() * 50 + 150) + grain;
      if (Math.random() > 0.995) val -= 100;
    }
    else if (type === 'stone') {
      val = Math.random() * 40 + 200;
    }
    else if (type === 'concrete') {
      val = Math.random() * 60 + 100;
    }
    else if (type === 'marble') {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);
      const vein = Math.sin(x * 0.02 + y * 0.02 + Math.random()) * 100;
      val = 220 + vein * 0.2;
    }

    val = Math.max(0, Math.min(255, val));
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);

  if (type === 'wood') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(100, 80, 50, 0.1)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(0, Math.random() * height);
      ctx.bezierCurveTo(width/3, Math.random() * height, width * 2/3, Math.random() * height, width, Math.random() * height);
      ctx.stroke();
    }
  }

  return canvas;
}

export const getProceduralTexture = (type: TextureConfig | 'none'): THREE.Texture | null => {
  if (type === 'none') return null;

  if (textureCache[type]) {
    return textureCache[type];
  }

  try {
    const canvas = createTextureCanvas(type);
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

      textureCache[type] = texture;
      return texture;
    }
  } catch (e) {
    console.warn("Failed to generate texture:", e);
  }

  return null;
};
