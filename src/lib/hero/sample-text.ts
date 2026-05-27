// Offscreen-canvas text sampler. Used by all three hero variants to compute the
// resting-position field for the word "RichardTheBruce".
//
// Strategy: render the word into a hidden 2D canvas at high contrast, scan pixels,
// emit (x, y) sample points for every "lit" pixel inside the glyph footprint.
// Each sample point is one resting position for a particle. The variants then
// distribute their actual particle count by sampling-with-replacement from this
// pool, so density grows naturally with N rather than skewing the glyph shape.
//
// Why an offscreen canvas instead of an SDF or vector outline:
//   - Fonts may be loading (next/font swap window). The sampler reads what the
//     browser would actually rasterize, including font fallback. Reliable.
//   - Density per glyph stroke comes for free from the font's own anti-aliasing.
//   - Cheap. One scan at mount, results are stable until viewport-size changes.
//
// References:
//   - Visual target: Taste BABY/ImportantParticleWork5.png middle panel (gridded
//     dense particle field forming a square unit). The text sampler is the same
//     idea but with letterforms instead of a square.
//   - Layout: v0-1-interface-MASTER-desktop.png (oversized serif, single word,
//     negative-space heavy).
//
// SSR safety: this module is only ever called from inside useEffect / a client
// component's mount path. Do not import at module top-level of any RSC.

export interface SampledPoint {
  x: number; // pixel x relative to the canvas the sampler ran on
  y: number; // pixel y
}

export interface SamplerOptions {
  width: number;
  height: number;
  word: string;
  // Cormorant Garamond Bold per spec § Typography. Falls back to "serif" if not loaded.
  fontFamily?: string;
  fontWeight?: number | string;
  // Pixel size for the rasterized text. Spec calls for 200px display name.
  fontSize: number;
  // Render scale multiplier. >1 oversamples then we read at full resolution;
  // useful for retina without blowing up the sample count. Default 1.
  scale?: number;
  // Sample stride. 1 = every pixel. 2 = every other pixel (4x fewer samples).
  // Variants pick stride to land on the right pool size.
  stride?: number;
  // Alpha threshold for treating a pixel as "inside the glyph." 0..255.
  alphaThreshold?: number;
}

export interface SampledTextField {
  points: SampledPoint[];
  // Per-letter index map: tells the variants which sampled points belong to which
  // letter (used for the accent-letter pulse, where only one letter glows amber).
  // Index `letterIndex[i]` is the letter number (0-based, in source `word` order)
  // for `points[i]`.
  letterIndex: Uint8Array;
  // Bounding box of the rendered word (after scale collapse), useful for centering.
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function sampleTextField(opts: SamplerOptions): SampledTextField {
  const {
    width,
    height,
    word,
    fontFamily = "'Cormorant Garamond', serif",
    fontWeight = 700,
    fontSize,
    scale = 1,
    stride = 2,
    alphaThreshold = 128,
  } = opts;

  // Create the working canvas at scale. We do not append to DOM.
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("sampleTextField: 2D context unavailable. Cannot proceed.");
  }

  // We render each letter into its own pass so we can label points by letter index.
  // This is what enables the per-letter accent-pulse without a second scan.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontWeight} ${Math.floor(fontSize * scale)}px ${fontFamily}`;

  // Measure first to compute per-letter x positions.
  const letterWidths: number[] = [];
  for (let i = 0; i < word.length; i++) {
    letterWidths.push(ctx.measureText(word[i]).width);
  }
  const totalWidth = letterWidths.reduce((a, b) => a + b, 0);
  const startX = (canvas.width - totalWidth) / 2;
  const baselineY = canvas.height / 2;

  // Render letters in distinct red-channel values (1..255). The red value encodes
  // the letter index. Anti-aliased edges land on the correct letter because the
  // glyphs don't overlap horizontally; the alpha threshold prunes the soft fringe.
  let cursor = startX;
  for (let i = 0; i < word.length; i++) {
    const r = i + 1; // 1-based so 0 stays as "background"
    ctx.fillStyle = `rgb(${r}, 255, 255)`;
    const letter = word[i];
    const w = letterWidths[i];
    ctx.fillText(letter, cursor + w / 2, baselineY);
    cursor += w;
  }

  // Scan.
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const points: SampledPoint[] = [];
  const letterIndices: number[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (let y = 0; y < canvas.height; y += stride) {
    for (let x = 0; x < canvas.width; x += stride) {
      const idx = (y * canvas.width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < alphaThreshold) continue;
      const r = data[idx];
      // r encodes letter index (1..wordLength). If r is 0 the pixel is background.
      if (r === 0) continue;
      // Collapse from scaled-space back to caller's space so coordinates match width/height.
      const cx = x / scale;
      const cy = y / scale;
      points.push({ x: cx, y: cy });
      letterIndices.push(r - 1);
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx > maxX) maxX = cx;
      if (cy > maxY) maxY = cy;
    }
  }

  if (points.length === 0) {
    // Font likely not loaded yet. Caller should retry on `document.fonts.ready`.
    return {
      points: [],
      letterIndex: new Uint8Array(0),
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }

  return {
    points,
    letterIndex: Uint8Array.from(letterIndices),
    bounds: { minX, minY, maxX, maxY },
  };
}

// Resample a fixed-count point cloud from the sampled field. Uses uniform random
// sampling-with-replacement so density falls out of the source's anti-aliased mask.
//
// Returns flat arrays for direct upload to InstancedBufferAttribute / typed buffers.
export interface ResampledField {
  positions: Float32Array; // length = count * 2 (x, y per particle)
  letter: Uint8Array; // length = count, value is the letter index (0..word.length-1)
}

export function resampleTo(
  field: SampledTextField,
  count: number,
  rng: () => number = Math.random,
): ResampledField {
  const positions = new Float32Array(count * 2);
  const letter = new Uint8Array(count);
  const pool = field.points;
  const labels = field.letterIndex;
  if (pool.length === 0) {
    return { positions, letter };
  }
  for (let i = 0; i < count; i++) {
    const j = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    positions[i * 2] = pool[j].x;
    positions[i * 2 + 1] = pool[j].y;
    letter[i] = labels[j];
  }
  return { positions, letter };
}
