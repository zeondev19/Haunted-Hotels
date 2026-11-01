'use client';

import { useEffect, useRef } from 'react';
import {
  FLOOR_HEIGHT,
  INITIAL_HP,
  MAX_HEIGHT,
  type BottomCrawler,
  type GameState,
  type HorizontalGhost,
  type HudInfo,
} from '@/types/game';

const W = 800;
const H = 600;

const SHAFT_L = 220;
const SHAFT_R = 580;
const LIFT_W = 150;
const LIFT_H = 160;
const LIFT_X = (W - LIFT_W) / 2;
/** Screen Y of the cabin's bottom edge; the camera follows the lift. */
const BASE_Y = 430;

const BASE_SPEED = 260;
const GHOST_SPEED = 520;
const GHOST_W = 56;
const GHOST_H = 48;
const GHOST_WARNING = 1.5;
const GHOST_DAMAGE = 20;
const LANE_OFFSETS = [30, 80, 130];

const CRAWLER_W = 44;
const CRAWLER_H = 60;
const CRAWLER_CLIMB = 150;
const STACK_INTERVAL = 4;
const MAX_STACKS = 3;
const STACK_SLOWDOWN = 0.15;

const P1_UP = ['w', 'W'];
const P1_DOWN = ['s', 'S'];
const P2_UP = ['ArrowUp'];
const P2_DOWN = ['ArrowDown'];

type Sprites = Record<'lift' | 'ghost' | 'zombie', HTMLImageElement>;

interface Props {
  onHud: (hud: HudInfo) => void;
}

function createState(): GameState {
  return {
    y: 0,
    maxHeight: MAX_HEIGHT,
    speed: 0,
    hp: INITIAL_HP,
    state: 'PLAYING',
    ghosts: [],
    crawlers: [],
    qte: { active: false, sequence: [], currentIndex: 0, timer: 0, turn: 'P1' },
  };
}

function loadSprite(src: string) {
  const img = new Image();
  img.src = src;
  return img;
}

function ready(img: HTMLImageElement) {
  return img.complete && img.naturalWidth > 0;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function GameCanvas({ onHud }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onHudRef = useRef(onHud);

  useEffect(() => {
    onHudRef.current = onHud;
  }, [onHud]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const sprites: Sprites = {
      lift: loadSprite('/assets/lift.png'),
      ghost: loadSprite('/assets/ghost.png'),
      zombie: loadSprite('/assets/zombie.png'),
    };

    const s = createState();
    const keys = new Set<string>();
    let nextId = 1;
    let ghostTimer = 2.5;
    let crawlerTimer = 6;
    let time = 0;
    let lastHud = '';
    let raf = 0;
    let last = performance.now();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) e.preventDefault();
      keys.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key);
    const onBlur = () => keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const pressed = (list: string[]) => list.some((k) => keys.has(k));
    const toScreen = (worldY: number) => BASE_Y - (worldY - s.y);

    // ---------- update ----------
    function update(dt: number) {
      time += dt;
      if (s.state !== 'PLAYING') return;

      const p1 = (pressed(P1_UP) ? 1 : 0) - (pressed(P1_DOWN) ? 1 : 0);
      const p2 = (pressed(P2_UP) ? 1 : 0) - (pressed(P2_DOWN) ? 1 : 0);
      // Both up = 100%, one up = 50%, opposite inputs cancel out.
      const stacks = s.crawlers.reduce((n, c) => n + (c.attached ? c.weightStacks : 0), 0);
      const weight = 1 - stacks * STACK_SLOWDOWN;
      s.speed = ((p1 + p2) / 2) * BASE_SPEED * weight;
      s.y = Math.max(0, s.y + s.speed * dt);

      if (s.y >= MAX_HEIGHT) {
        s.y = MAX_HEIGHT;
        s.state = 'VICTORY';
        return;
      }

      // Ghost spawning (not on the ground floor, give players a moment to learn controls).
      ghostTimer -= dt;
      if (ghostTimer <= 0 && s.y > 300) {
        const lane = Math.floor(Math.random() * LANE_OFFSETS.length);
        const direction = Math.random() < 0.5 ? 'RIGHT' : 'LEFT';
        s.ghosts.push({
          id: nextId++,
          x: direction === 'RIGHT' ? -GHOST_W : W + GHOST_W,
          y: s.y + LANE_OFFSETS[lane],
          lane,
          direction,
          warningTimer: GHOST_WARNING,
        });
        ghostTimer = rand(2.5, 4.5);
      }

      const liftLeft = LIFT_X;
      const liftRight = LIFT_X + LIFT_W;
      s.ghosts = s.ghosts.filter((g) => {
        if (g.warningTimer > 0) {
          g.warningTimer -= dt;
          return true;
        }
        g.x += (g.direction === 'RIGHT' ? 1 : -1) * GHOST_SPEED * dt;
        const hitX = g.x + GHOST_W / 2 > liftLeft && g.x - GHOST_W / 2 < liftRight;
        const hitY = g.y + GHOST_H / 2 > s.y && g.y - GHOST_H / 2 < s.y + LIFT_H;
        if (hitX && hitY) {
          s.hp = Math.max(0, s.hp - GHOST_DAMAGE);
          return false;
        }
        return g.x > -GHOST_W * 2 && g.x < W + GHOST_W * 2;
      });

      if (s.hp <= 0) {
        s.state = 'GAMEOVER';
        return;
      }

      // Bottom crawler: one at a time, climbs from below and latches onto the cabin.
      if (s.crawlers.length === 0) {
        crawlerTimer -= dt;
        if (crawlerTimer <= 0 && s.y > 400) {
          s.crawlers.push({
            id: nextId++,
            x: W / 2 + rand(-40, 40),
            y: s.y - 350,
            attached: false,
            weightStacks: 0,
            attachTimer: 0,
          });
          crawlerTimer = rand(8, 12);
        }
      }
      s.crawlers = s.crawlers.filter((c: BottomCrawler) => {
        if (c.attached) {
          c.y = s.y;
          c.attachTimer += dt;
          if (c.attachTimer >= STACK_INTERVAL && c.weightStacks < MAX_STACKS) {
            c.weightStacks++;
            c.attachTimer = 0;
          }
          return true;
        }
        c.y += CRAWLER_CLIMB * dt;
        if (c.y >= s.y) {
          c.attached = true;
          c.weightStacks = 1;
          c.y = s.y;
        }
        // Lift outran it.
        return toScreen(c.y) < H + 300;
      });
    }

    // ---------- render ----------
    function drawBricks(x0: number, x1: number, offset: number, shades: string[], mortar: string) {
      const bw = 48;
      const bh = 22;
      const n = Math.floor(offset / bh);
      const rem = offset - n * bh;
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(x0, 0, x1 - x0, H);
      ctx!.clip();
      ctx!.fillStyle = mortar;
      ctx!.fillRect(x0, 0, x1 - x0, H);
      for (let i = -1; i <= H / bh + 1; i++) {
        const y = i * bh + rem;
        const row = i - n;
        const shift = (row & 1) * (bw / 2);
        for (let x = x0 - bw + shift, col = 0; x < x1; x += bw, col++) {
          const hash = Math.abs((row * 73856093) ^ (col * 19349663)) % shades.length;
          ctx!.fillStyle = shades[hash];
          ctx!.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        }
      }
      ctx!.restore();
    }

    function drawCorridor(floorIndex: number) {
      const worldY = floorIndex * FLOOR_HEIGHT;
      const slabY = toScreen(worldY);
      if (slabY < -200 || slabY > H + 40) return;
      const roomH = 150;
      const isRoof = floorIndex >= MAX_HEIGHT / FLOOR_HEIGHT;

      for (const side of [0, 1]) {
        const x0 = side === 0 ? 0 : SHAFT_R;
        const x1 = side === 0 ? SHAFT_L : W;
        // Corridor opening with warm dim light.
        const grad = ctx!.createLinearGradient(0, slabY - roomH, 0, slabY);
        grad.addColorStop(0, isRoof ? '#1b2238' : '#2a1610');
        grad.addColorStop(1, isRoof ? '#2c3658' : '#4a2a18');
        ctx!.fillStyle = grad;
        ctx!.fillRect(x0, slabY - roomH, x1 - x0, roomH);
        // Carpet
        ctx!.fillStyle = '#5a0f14';
        ctx!.fillRect(x0, slabY - 14, x1 - x0, 14);
        if (isRoof) continue;
        // Door
        const doorW = 54;
        const doorX = side === 0 ? x1 - doorW - 40 : x0 + 40;
        ctx!.fillStyle = '#3b2314';
        ctx!.fillRect(doorX - 4, slabY - 110, doorW + 8, 96);
        ctx!.fillStyle = '#5c3a22';
        ctx!.fillRect(doorX, slabY - 106, doorW, 92);
        ctx!.fillStyle = '#7a5232';
        ctx!.fillRect(doorX + 6, slabY - 98, doorW - 12, 34);
        ctx!.fillRect(doorX + 6, slabY - 58, doorW - 12, 38);
        ctx!.fillStyle = '#d9b44a';
        ctx!.beginPath();
        ctx!.arc(side === 0 ? doorX + doorW - 9 : doorX + 9, slabY - 58, 3, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.font = 'bold 11px monospace';
        ctx!.textAlign = 'center';
        ctx!.fillText(`${floorIndex + 1}0${side + 1}`, doorX + doorW / 2, slabY - 114);
        // Flickering wall lamp
        const flicker = Math.sin(time * 13 + floorIndex) > -0.7 ? 1 : 0.3;
        const lampX = side === 0 ? 40 : W - 40;
        const glow = ctx!.createRadialGradient(lampX, slabY - 120, 2, lampX, slabY - 120, 60);
        glow.addColorStop(0, `rgba(255,190,90,${0.55 * flicker})`);
        glow.addColorStop(1, 'rgba(255,190,90,0)');
        ctx!.fillStyle = glow;
        ctx!.fillRect(lampX - 60, slabY - 180, 120, 120);
      }

      // Floor slab across the whole width with the floor sign in the shaft.
      ctx!.fillStyle = '#222';
      ctx!.fillRect(0, slabY, W, 12);
      ctx!.fillStyle = '#3a3a3a';
      ctx!.fillRect(0, slabY, W, 3);
      ctx!.fillStyle = isRoof ? '#7fd1ff' : '#e8c26a';
      ctx!.font = 'bold 14px monospace';
      ctx!.textAlign = 'left';
      ctx!.fillText(isRoof ? 'ROOFTOP' : `LANTAI ${floorIndex + 1}`, SHAFT_L + 8, slabY - 6);
    }

    function drawLiftFallback(x: number, y: number) {
      // Outer frame
      ctx!.fillStyle = '#2b1a12';
      ctx!.fillRect(x - 4, y - 4, LIFT_W + 8, LIFT_H + 8);
      ctx!.fillStyle = '#6b3d22';
      ctx!.fillRect(x, y, LIFT_W, LIFT_H);
      // Wood grain panels
      ctx!.strokeStyle = '#5a321b';
      ctx!.lineWidth = 1;
      for (let gy = y + 8; gy < y + LIFT_H; gy += 7) {
        ctx!.beginPath();
        ctx!.moveTo(x + 4, gy);
        ctx!.lineTo(x + LIFT_W - 4, gy + Math.sin(gy) * 1.5);
        ctx!.stroke();
      }
      // Interior light
      const lamp = Math.sin(time * 20) > -0.85 ? 1 : 0.4;
      ctx!.fillStyle = `rgba(255,220,140,${0.25 * lamp})`;
      ctx!.fillRect(x + 12, y + 20, LIFT_W - 24, LIFT_H - 32);
      // Accordion brass gate
      ctx!.strokeStyle = '#c9a24a';
      ctx!.lineWidth = 3;
      for (let gx = x + 14; gx <= x + LIFT_W - 14; gx += 12) {
        ctx!.beginPath();
        ctx!.moveTo(gx, y + 20);
        ctx!.lineTo(gx, y + LIFT_H - 12);
        ctx!.stroke();
      }
      ctx!.lineWidth = 1.5;
      for (let gx = x + 14; gx < x + LIFT_W - 14; gx += 12) {
        ctx!.beginPath();
        ctx!.moveTo(gx, y + 20);
        ctx!.lineTo(gx + 12, y + LIFT_H - 12);
        ctx!.moveTo(gx + 12, y + 20);
        ctx!.lineTo(gx, y + LIFT_H - 12);
        ctx!.stroke();
      }
      // Header with floor dial
      ctx!.fillStyle = '#3d2416';
      ctx!.fillRect(x, y, LIFT_W, 16);
      ctx!.fillStyle = '#c9a24a';
      ctx!.beginPath();
      ctx!.arc(x + LIFT_W / 2, y + 8, 6, Math.PI, 0);
      ctx!.fill();
      const dial = Math.PI + (s.y / MAX_HEIGHT) * Math.PI;
      ctx!.strokeStyle = '#7a0000';
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(x + LIFT_W / 2, y + 8);
      ctx!.lineTo(x + LIFT_W / 2 + Math.cos(dial) * 6, y + 8 + Math.sin(dial) * 6);
      ctx!.stroke();
      // Base plate with rivets
      ctx!.fillStyle = '#3a3a3a';
      ctx!.fillRect(x - 4, y + LIFT_H - 8, LIFT_W + 8, 12);
      ctx!.fillStyle = '#888';
      for (let rx = x + 4; rx < x + LIFT_W; rx += 16) {
        ctx!.fillRect(rx, y + LIFT_H - 4, 3, 3);
      }
    }

    function drawGhost(g: HorizontalGhost) {
      const sx = g.x;
      const sy = toScreen(g.y);
      if (ready(sprites.ghost)) {
        ctx!.save();
        if (g.direction === 'LEFT') {
          ctx!.translate(sx, 0);
          ctx!.scale(-1, 1);
          ctx!.translate(-sx, 0);
        }
        ctx!.drawImage(sprites.ghost, sx - GHOST_W / 2, sy - GHOST_H / 2, GHOST_W, GHOST_H);
        ctx!.restore();
        return;
      }
      const wob = Math.sin(time * 10 + g.id) * 3;
      ctx!.fillStyle = 'rgba(220,30,40,0.8)';
      ctx!.beginPath();
      ctx!.arc(sx, sy - 6 + wob, GHOST_W / 2 - 4, Math.PI, 0);
      const bottom = sy + GHOST_H / 2 + wob;
      ctx!.lineTo(sx + GHOST_W / 2 - 4, bottom);
      for (let i = 4; i >= 0; i--) {
        const px = sx - GHOST_W / 2 + 4 + (i * (GHOST_W - 8)) / 4;
        ctx!.lineTo(px, bottom - (i % 2 === 0 ? 0 : 8));
      }
      ctx!.closePath();
      ctx!.fill();
      const look = g.direction === 'RIGHT' ? 4 : -4;
      ctx!.fillStyle = '#100';
      ctx!.fillRect(sx - 10 + look, sy - 12 + wob, 6, 9);
      ctx!.fillRect(sx + 4 + look, sy - 12 + wob, 6, 9);
    }

    function drawGhostWarning(g: HorizontalGhost) {
      if (Math.floor(time * 8) % 2 === 0) return;
      const sy = toScreen(g.y);
      const left = g.direction === 'RIGHT';
      const x = left ? 8 : W - 8;
      const dir = left ? 1 : -1;
      ctx!.fillStyle = '#ff2a2a';
      ctx!.beginPath();
      ctx!.moveTo(x, sy - 18);
      ctx!.lineTo(x + dir * 28, sy);
      ctx!.lineTo(x, sy + 18);
      ctx!.closePath();
      ctx!.fill();
      ctx!.font = 'bold 22px monospace';
      ctx!.textAlign = left ? 'left' : 'right';
      ctx!.fillText('!', x + dir * 34, sy + 8);
    }

    function drawCrawler(c: BottomCrawler) {
      const top = toScreen(c.y);
      const x = c.x - CRAWLER_W / 2;
      if (ready(sprites.zombie)) {
        ctx!.drawImage(sprites.zombie, x, top, CRAWLER_W, CRAWLER_H);
        return;
      }
      const reach = c.attached ? 0 : Math.sin(time * 12) * 4;
      // Arms reaching up
      ctx!.fillStyle = '#2f7a2a';
      ctx!.fillRect(x + 2, top - 2 + reach, 8, 26);
      ctx!.fillRect(x + CRAWLER_W - 10, top - 2 - reach, 8, 26);
      // Head
      ctx!.fillStyle = '#4caf3f';
      ctx!.fillRect(x + 10, top + 6, CRAWLER_W - 20, 20);
      ctx!.fillStyle = '#ff3030';
      ctx!.fillRect(x + 15, top + 13, 4, 4);
      ctx!.fillRect(x + CRAWLER_W - 19, top + 13, 4, 4);
      // Torso in torn clothes
      ctx!.fillStyle = '#3a5a8a';
      ctx!.fillRect(x + 8, top + 26, CRAWLER_W - 16, CRAWLER_H - 26);
      ctx!.fillStyle = '#2f7a2a';
      ctx!.fillRect(x + 14, top + 34, 6, 6);
      if (c.weightStacks > 0) {
        ctx!.fillStyle = '#9dff8a';
        ctx!.font = 'bold 12px monospace';
        ctx!.textAlign = 'center';
        ctx!.fillText(`x${c.weightStacks}`, c.x, top + CRAWLER_H + 14);
      }
    }

    function render() {
      ctx!.clearRect(0, 0, W, H);
      // Back wall of the shaft scrolls slower for depth.
      drawBricks(SHAFT_L, SHAFT_R, s.y * 0.5, ['#1a1414', '#1e1717', '#161111'], '#0b0909');
      // Side walls scroll 1:1 with the lift.
      drawBricks(0, SHAFT_L, s.y, ['#3a2420', '#43291f', '#332019'], '#140c0a');
      drawBricks(SHAFT_R, W, s.y, ['#3a2420', '#43291f', '#332019'], '#140c0a');

      const first = Math.max(0, Math.floor((s.y - H) / FLOOR_HEIGHT));
      const lastFloor = Math.min(MAX_HEIGHT / FLOOR_HEIGHT, Math.ceil((s.y + H) / FLOOR_HEIGHT));
      for (let f = first; f <= lastFloor; f++) drawCorridor(f);

      // Guide rails with scrolling rivets
      ctx!.fillStyle = '#2d2d2d';
      ctx!.fillRect(SHAFT_L, 0, 10, H);
      ctx!.fillRect(SHAFT_R - 10, 0, 10, H);
      ctx!.fillStyle = '#5a5a5a';
      const rivetOff = s.y % 40;
      for (let ry = rivetOff - 40; ry < H; ry += 40) {
        ctx!.fillRect(SHAFT_L + 3, ry, 4, 4);
        ctx!.fillRect(SHAFT_R - 7, ry, 4, 4);
      }

      const liftTop = BASE_Y - LIFT_H;
      // Cables
      ctx!.strokeStyle = '#111';
      ctx!.lineWidth = 3;
      for (const cx of [LIFT_X + 35, LIFT_X + LIFT_W - 35]) {
        ctx!.beginPath();
        ctx!.moveTo(cx, 0);
        ctx!.lineTo(cx, liftTop);
        ctx!.stroke();
      }

      for (const c of s.crawlers) drawCrawler(c);

      if (ready(sprites.lift)) ctx!.drawImage(sprites.lift, LIFT_X, liftTop, LIFT_W, LIFT_H);
      else drawLiftFallback(LIFT_X, liftTop);

      for (const g of s.ghosts) {
        if (g.warningTimer > 0) drawGhostWarning(g);
        else drawGhost(g);
      }

      // Vignette
      const v = ctx!.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 520);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx!.fillStyle = v;
      ctx!.fillRect(0, 0, W, H);
    }

    function pushHud() {
      const incoming = s.ghosts.find((g) => g.warningTimer > 0);
      const attached = s.crawlers.find((c) => c.attached);
      const climbing = s.crawlers.find((c) => !c.attached);
      let warning = '';
      if (incoming) warning = `HANTU DATANG DARI ${incoming.direction === 'RIGHT' ? 'KIRI' : 'KANAN'}!`;
      else if (attached) warning = `ZOMBIE MENEMPEL! Lift melambat (x${attached.weightStacks})`;
      else if (climbing) warning = 'Ada yang merayap dari bawah...';

      const hud: HudInfo = {
        floor: Math.min(MAX_HEIGHT / FLOOR_HEIGHT, Math.floor(s.y / FLOOR_HEIGHT) + 1),
        hp: Math.round(s.hp),
        warning,
        state: s.state,
      };
      const key = JSON.stringify(hud);
      if (key !== lastHud) {
        lastHud = key;
        onHudRef.current(hud);
      }
    }

    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      render();
      pushHud();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="block h-auto w-full max-w-[800px] rounded-md border border-red-950 bg-black [image-rendering:pixelated]"
      aria-label="The Haunted Hotel game canvas"
    />
  );
}
