import { useEffect, useRef } from 'react';
import { token } from '@/ui/tokens/read';

/**
 * The near-black stadium interior behind every menu: dark structural beams,
 * a few floodlight smudges, faint diagonal architecture — all at 3–6%
 * luminance and heavily blurred, so it reads as depth rather than as an image.
 */
export function StadiumBackdrop({ seed = 7 }: { seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Deterministic noise so the backdrop is stable across renders.
    let state = seed * 9301 + 49297;
    const rand = () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };

    function draw() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = token('--fc-void');
      ctx.fillRect(0, 0, w, h);

      // Structural beams — warm bronze, barely there, raked across the frame.
      ctx.save();
      ctx.filter = 'blur(9px)';
      ctx.strokeStyle = token('--fc-backdrop-beam');
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i += 1) {
        // Kept to the outer right third: menus occupy the left two thirds, and
        // the reference never lets structure read through the content column.
        const x = w * (0.80 + rand() * 0.28);
        const lean = (rand() - 0.5) * h * 0.7;
        ctx.lineWidth = 10 + rand() * 30;
        ctx.globalAlpha = 0.16 + rand() * 0.14;
        ctx.beginPath();
        ctx.moveTo(x, -40);
        ctx.lineTo(x + lean, h + 40);
        ctx.stroke();
      }
      ctx.restore();

      // Floodlight bank — a soft row of smudges across the upper third.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(26px)';
      const glow = token('--fc-backdrop-glow');
      for (let i = 0; i < 11; i += 1) {
        const x = w * (0.10 + (i / 10) * 0.85) + (rand() - 0.5) * 30;
        const y = h * (0.13 + rand() * 0.05);
        const r = 18 + rand() * 26;
        ctx.globalAlpha = 0.10 + rand() * 0.12;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Vignette back down to true black at the edges, so panels sit on void.
      const vignette = ctx.createRadialGradient(w * 0.62, h * 0.40, 0, w * 0.62, h * 0.40, Math.max(w, h) * 0.62);
      vignette.addColorStop(0, token('--fc-backdrop-clear'));
      vignette.addColorStop(0.55, token('--fc-backdrop-veil'));
      vignette.addColorStop(1, token('--fc-void'));
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    }

    draw();
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 140);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, [seed]);

  return <canvas ref={ref} className="fc-backdrop" aria-hidden="true" />;
}
