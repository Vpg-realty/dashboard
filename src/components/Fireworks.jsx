import { useEffect, useRef } from 'react';

// Canvas fireworks for the closed-deal celebration (Luke, Oct 8). A rocket
// rises from the bottom every ~0.7s and bursts into coloured sparks that
// fall and fade. Fills its parent; stops when unmounted.
const COLORS = ['#facc15', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#3b82f6', '#22d3ee', '#10b981', '#ffffff'];

export default function Fireworks() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const rockets = [];
    const sparks = [];
    const rand = (a, b) => a + Math.random() * (b - a);
    const launch = () => rockets.push({
      x: rand(w * 0.1, w * 0.9), y: h, vx: rand(-1, 1), vy: rand(-h / 60, -h / 45),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    const burst = (r) => {
      const n = 70 + Math.floor(Math.random() * 40);
      const speed = rand(4, 7);
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        const s = speed * rand(0.4, 1);
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: Math.random() < 0.8 ? r.color : '#ffffff' });
      }
    };

    let raf;
    let last = 0;
    let nextLaunch = 0;
    const frame = (t) => {
      if (t - last > 16) {
        last = t;
        if (t > nextLaunch) { launch(); if (Math.random() < 0.4) launch(); nextLaunch = t + rand(450, 900); }
        // Trails: fade the previous frame instead of clearing it.
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.x += r.vx; r.y += r.vy; r.vy += 0.18;
          ctx.fillStyle = r.color;
          ctx.beginPath(); ctx.arc(r.x, r.y, 3, 0, Math.PI * 2); ctx.fill();
          if (r.vy >= -1) { burst(r); rockets.splice(i, 1); }
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.x += s.vx; s.y += s.vy; s.vx *= 0.98; s.vy = s.vy * 0.98 + 0.06; s.life -= 0.012;
          if (s.life <= 0) { sparks.splice(i, 1); continue; }
          ctx.globalAlpha = s.life;
          ctx.fillStyle = s.color;
          ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />;
}
