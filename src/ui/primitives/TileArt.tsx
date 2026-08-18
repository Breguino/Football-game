import { useEffect, useRef } from 'react';
import { createRng } from '@/world/rng';
import { token } from '@/ui/tokens/read';

/**
 * Generated tile art: the brand surface from PROMPT.md §3.2 — near-black navy,
 * blurred aurora blobs, and the fine contour overlay — seeded per tile so every
 * mode gets its own recognisable image without shipping any.
 */
export function TileArt({ seed }: { seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rng = createRng(seed);
    const palette = [
      token('--fc-aurora-1'),
      token('--fc-aurora-2'),
      token('--fc-aurora-3'),
      token('--fc-aurora-4'),
    ].filter(Boolean);
    if (palette.length === 0) return;

    // Each tile draws from two neighbouring hues, so rails read as a family
    // rather than as four unrelated colour schemes.
    const start = rng.int(0, palette.length - 1);
    const blobs = Array.from({ length: 4 }, (_, i) => ({
      x: rng.range(-0.1, 1.1),
      y: rng.range(-0.1, 1.1),
      r: rng.range(0.42, 0.85),
      colour: palette[(start + (i % 2)) % palette.length]!,
    }));

    function draw() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 336;
      const h = canvas.clientHeight || 212;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = token('--fc-brand-ink');
      ctx.fillRect(0, 0, w, h);

      const span = Math.max(w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const blob of blobs) {
        const gradient = ctx.createRadialGradient(
          blob.x * w,
          blob.y * h,
          0,
          blob.x * w,
          blob.y * h,
          blob.r * span,
        );
        gradient.addColorStop(0, `${blob.colour}59`);
        gradient.addColorStop(0.55, `${blob.colour}1F`);
        gradient.addColorStop(1, `${blob.colour}00`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';

      // The topographic contour overlay that runs across FC brand surfaces.
      ctx.strokeStyle = token('--fc-contour');
      ctx.lineWidth = 1;
      const phase = rng.range(0, Math.PI * 2);
      for (let i = 0; i < 16; i += 1) {
        ctx.beginPath();
        const base = (i / 16) * h * 1.6 - h * 0.3;
        for (let x = 0; x <= w; x += 10) {
          const y =
            base +
            Math.sin((x / w) * 4.4 + i * 0.5 + phase) * 16 +
            Math.sin((x / w) * 9 + i) * 5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [seed]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true" />;
}
