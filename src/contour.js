import { useEffect, useState } from 'react';

const MAX_ANALYSIS_EDGE = 560;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function imageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = url;
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildContourAnalysis(image, settings) {
  const analysisScale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * analysisScale));
  const height = Math.max(1, Math.round(image.naturalHeight * analysisScale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.filter = `blur(${(settings.smooth / 100) * 2.2}px)`;
  context.drawImage(image, 0, 0, width, height);
  context.filter = 'none';

  const pixels = context.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const alpha = pixels.data[offset + 3] / 255;
    const luminance = pixels.data[offset] * .299 + pixels.data[offset + 1] * .587 + pixels.data[offset + 2] * .114;
    const foreground = settings.invert ? luminance >= settings.threshold : luminance <= settings.threshold;
    mask[index] = alpha > .08 && foreground ? 1 : 0;
  }

  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    const component = [];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const point = queue[cursor];
      component.push(point);
      const x = point % width;
      const y = Math.floor(point / width);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push(component);
  }

  components.sort((a, b) => b.length - a.length);
  const sourceToAnalysisArea = (width * height) / (image.naturalWidth * image.naturalHeight);
  const minimumArea = Math.max(2, settings.area * sourceToAnalysisArea);
  const retained = components.filter((component, index) => index === 0 || component.length >= minimumArea);
  mask.fill(0);
  retained.forEach(component => component.forEach(index => { mask[index] = 1; }));

  const exterior = new Uint8Array(mask.length);
  const exteriorQueue = [];
  const enqueueExterior = (x, y) => {
    const index = y * width + x;
    if (!mask[index] && !exterior[index]) {
      exterior[index] = 1;
      exteriorQueue.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueueExterior(x, 0);
    enqueueExterior(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueExterior(0, y);
    enqueueExterior(width - 1, y);
  }
  for (let cursor = 0; cursor < exteriorQueue.length; cursor += 1) {
    const point = exteriorQueue[cursor];
    const x = point % width;
    const y = Math.floor(point / width);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) enqueueExterior(nx, ny);
    }
  }

  const edge = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const adjacent = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([nx, ny]) => nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]);
      if (!adjacent.length) continue;
      const inner = adjacent.every(([nx, ny]) => nx >= 0 && nx < width && ny >= 0 && ny < height && !exterior[ny * width + nx]);
      edge.push({ x, y, inner });
    }
  }

  const sampleStep = Math.max(1, Math.ceil(edge.length / 1400));
  const sampledEdge = edge.filter((_, index) => index % sampleStep === 0);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext('2d');
  const maskPixels = maskContext.createImageData(width, height);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    maskPixels.data[offset] = 11;
    maskPixels.data[offset + 1] = 12;
    maskPixels.data[offset + 2] = 12;
    maskPixels.data[offset + 3] = 255;
  }
  maskContext.putImageData(maskPixels, 0, 0);
  return { width, height, maskUrl: maskCanvas.toDataURL('image/png'), edge: sampledEdge };
}

export function useContourAnalysis(source, settings) {
  const [analysis, setAnalysis] = useState(null);
  useEffect(() => {
    if (!source?.url) {
      setAnalysis(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const image = new Image();
      image.onload = () => {
        if (!cancelled) setAnalysis(buildContourAnalysis(image, settings));
      };
      image.src = source.url;
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source?.url, settings.threshold, settings.smooth, settings.area, settings.invert]);
  return analysis;
}
