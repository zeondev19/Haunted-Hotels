'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  FLOOR_HEIGHT,
  INITIAL_HP,
  MAX_HEIGHT,
  MAX_WEIGHT_STACKS,
  QTE_TIME,
  type BottomCrawler,
  type GameMode,
  type GameState,
  type HorizontalGhost,
  type HudInfo,
  type PlayerInputPayload,
  type PlayerRole,
  type PlayerTurn,
  type QteKey,
  type QteState,
} from '@/types/game';

const W = 800;
const H = 600;

const SHAFT_L = 220;
const SHAFT_R = 580;
const LIFT_W = 164;
const LIFT_H = 172;
const LIFT_X = (W - LIFT_W) / 2;
/** Screen Y of the cabin's bottom edge; the camera follows the lift. */
const BASE_Y = 430;

const BASE_SPEED = 210;
const GHOST_W = 56;
const GHOST_H = 48;
const GHOST_DRAW_W = 76;
const GHOST_DRAW_H = 100;
const GHOST_SHEET_COLS = 6;
const GHOST_SHEET_ROWS = 2;
const GHOST_WARNING = 1.0;
const GHOST_DAMAGE = 20;
/** Ghost center relative to the lift bottom: above the cabin, cabin level, below the cabin. */
const LANE_OFFSETS = [LIFT_H + 55, LIFT_H / 2, -45];

const CRAWLER_W = 44;
const CRAWLER_H = 60;
const CRAWLER_DRAW_W = 68;
const CRAWLER_DRAW_H = 104;
const CRAWLER_SHEET_COLS = 6;
const CRAWLER_SHEET_ROWS = 2;
const STACK_SLOWDOWN = 0.25;

const SHAKE_GAIN = 14;
const SHAKE_DECAY = 18;

const QTE_STEPS = 4;
const QTE_DAMAGE = 25;
const QTE_DROP = 150;
const QTE_KEYS: QteKey[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
const INTRO_DURATION = 3.8;

/** Source regions inside Vintage Steampunk Elevator Asset Collection-no-bg.png & Gothic Horror Elevator Sprite Sheet.png. */
const STEAM_OPEN = { sx: 425, sy: 12, sw: 381, sh: 407 };
const STEAM_GATE = { sx: 429, sy: 590, sw: 319, sh: 365 };
const STEAM_BANNER = { sx: 1320, sy: 638, sw: 141, sh: 221 };
const ELEV_CABLE = { sx: 970, sy: 30, sw: 39, sh: 450 };
const ELEV_LAMP = { sx: 975, sy: 680, sw: 135, sh: 205 };
const ELEV_DANGER = { sx: 812, sy: 690, sw: 118, sh: 285 };

const BGM_SRC = '/music/musik_latar_1.wav';
const GHOST_SFX = '/music/ghost.wav';
const ELEVATOR_HIT_SFX = '/music/elevator_hit.ogg';
const SKELETON_SFX = Array.from({ length: 10 }, (_, i) => `/music/${i}.ogg`);
const ZOMBIE_SFX = [1, 2, 3, 4].map((i) => `/music/zombieYell${i}.wav`);

function playClip(src: string, volume = 0.65) {
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    // Ignore autoplay errors.
  }
}

function playSfx(kind: 'door' | 'step' | 'gate') {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    if (kind === 'door') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.linearRampToValueAtTime(95, now + 0.45);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (kind === 'step') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.06);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.35);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.start(now);
      osc.stop(now + 0.38);
    }
  } catch {
    // Ignore audio context restrictions if blocked.
  }
}

const KEYMAP: Record<string, { player: PlayerTurn; key: QteKey }> = {
  w: { player: 'P1', key: 'UP' },
  s: { player: 'P1', key: 'DOWN' },
  a: { player: 'P1', key: 'LEFT' },
  d: { player: 'P1', key: 'RIGHT' },
  ArrowUp: { player: 'P2', key: 'UP' },
  ArrowDown: { player: 'P2', key: 'DOWN' },
  ArrowLeft: { player: 'P2', key: 'LEFT' },
  ArrowRight: { player: 'P2', key: 'RIGHT' },
};

interface Difficulty {
  ghostSpeed: number;
  ghostEvery: [number, number];
  lanes: number[];
  dualGhosts: boolean;
  crawlerWave: number;
  crawlerEvery: [number, number];
  crawlerClimb: number;
}

/** PRD 6.2: floors 1-3 warm-up, 4-6 escalation, 7-9 chaos, 10 safe. Crawlers always climb faster than BASE_SPEED. */
function difficulty(floor: number): Difficulty | null {
  if (floor >= 10) return null;
  if (floor <= 3)
    return { ghostSpeed: 420, ghostEvery: [2.2, 3.4], lanes: [0, 1], dualGhosts: false, crawlerWave: 2, crawlerEvery: [6, 9], crawlerClimb: 340 };
  if (floor <= 6)
    return { ghostSpeed: 560, ghostEvery: [1.7, 2.8], lanes: [0, 1, 2], dualGhosts: true, crawlerWave: 2, crawlerEvery: [5, 7.5], crawlerClimb: 380 };
  return { ghostSpeed: 700, ghostEvery: [1.3, 2.2], lanes: [0, 1, 2], dualGhosts: true, crawlerWave: 3, crawlerEvery: [4, 6], crawlerClimb: 430 };
}

type Sprites = Record<'elevator' | 'steampunk' | 'ghost' | 'cuteGhost' | 'zombie' | 'skeleton' | 'shaft', HTMLImageElement>;

interface Props {
  mode: GameMode;
  p1Role: PlayerRole;
  channel?: RealtimeChannel | null;
  onHud: (hud: HudInfo) => void;
}

const idleQte = (): QteState => ({ active: false, sequence: [], currentIndex: 0, timer: 0, turn: 'P1' });

function createState(): GameState {
  return {
    y: 0,
    maxHeight: MAX_HEIGHT,
    speed: 0,
    hp: INITIAL_HP,
    state: 'PLAYING',
    weightStacks: 0,
    shakeGauge: 0,
    ghosts: [],
    crawlers: [],
    qte: idleQte(),
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

function rand([min, max]: [number, number]) {
  return min + Math.random() * (max - min);
}

function pick<T>(list: T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

export default function GameCanvas({ mode, p1Role, channel, onHud }: Props) {
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
      elevator: loadSprite('/assets/elevator.png'),
      steampunk: loadSprite('/assets/steampunk_elevator.png'),
      ghost: loadSprite('/assets/ghost.png'),
      cuteGhost: loadSprite('/assets/cute_ghost.png'),
      zombie: loadSprite('/assets/zombie.png'),
      skeleton: loadSprite('/assets/skeleton.png'),
      shaft: loadSprite('/assets/shaft_bg.png'),
    };
    let shaftPattern: CanvasPattern | null = null;

    const bgm = new Audio(BGM_SRC);
    bgm.loop = true;
    bgm.volume = 0.35;
    bgm.play().catch(() => {});

    const s = createState();
    const keys = new Set<string>();
    const p2OnlineHeld = new Set<QteKey>();
    const seenGhosts = new Set<number>();
    const seenCrawlers = new Set<number>();
    let skeletonStepTimer = 0;
    const p2Role: PlayerRole = p1Role === 'UP' ? 'DOWN' : 'UP';
    const p1MoveKey = p1Role === 'UP' ? 'w' : 's';
    const p2MoveKey = p2Role === 'UP' ? 'ArrowUp' : 'ArrowDown';
    let lastShakePlayer: PlayerTurn | null = null;
    let nextId = 1;
    let ghostTimer = 1.8;
    let crawlerTimer = 3.5;
    let time = 0;
    let doorSfxPlayed = false;
    let gateSfxPlayed = false;
    let lastStepTick = 0;
    let shakeTime = 0;
    let shakeMag = 0;
    let syncTimer = 0;
    let lastHud = '';
    let raf = 0;
    let last = performance.now();

    const normalize = (k: string) => (k.length === 1 ? k.toLowerCase() : k);
    const held = (k: string) => keys.has(k);
    const toScreen = (worldY: number) => BASE_Y - (worldY - s.y);
    const floorOf = (y: number) => Math.min(MAX_HEIGHT / FLOOR_HEIGHT, Math.floor(y / FLOOR_HEIGHT) + 1);

    function screenShake(duration: number, magnitude: number) {
      shakeMag = shakeTime > 0 ? Math.max(shakeMag, magnitude) : magnitude;
      shakeTime = Math.max(shakeTime, duration);
    }

    function dropAttachedCrawlers() {
      for (const c of s.crawlers) {
        if (!c.attached) continue;
        c.attached = false;
        c.falling = true;
        c.y = s.y;
      }
      s.weightStacks = 0;
      s.shakeGauge = 0;
      lastShakePlayer = null;
    }

    function newQte(): QteState {
      return {
        active: true,
        sequence: Array.from({ length: QTE_STEPS }, () => pick(QTE_KEYS)),
        currentIndex: 0,
        timer: QTE_TIME,
        turn: 'P1',
      };
    }

    function failQte() {
      s.hp = Math.max(0, s.hp - QTE_DAMAGE);
      s.y = Math.max(0, s.y - QTE_DROP);
      screenShake(0.6, 16);
      if (s.hp <= 0) {
        s.state = 'GAMEOVER';
        s.qte = idleQte();
        screenShake(1.2, 22);
      } else {
        s.qte = newQte();
      }
    }

    function handleQteKey(player: PlayerTurn, key: QteKey) {
      const q = s.qte;
      // Off-turn presses are ignored so the partner can't fail the repair by accident.
      if (player !== q.turn) return;
      if (key !== q.sequence[q.currentIndex]) return failQte();
      q.currentIndex++;
      q.turn = q.turn === 'P1' ? 'P2' : 'P1';
      if (q.currentIndex >= q.sequence.length) {
        dropAttachedCrawlers();
        s.qte = idleQte();
        s.state = 'PLAYING';
      }
    }

    function applyPlayerTap(player: PlayerTurn, key: QteKey) {
      if (s.state === 'QTE') {
        handleQteKey(player, key);
      } else if (s.state === 'PLAYING' && s.weightStacks > 0) {
        const assignedRole = player === 'P1' ? p1Role : p2Role;
        // Must alternate between P1 and P2 pressing their assigned single movement key (cannot solo shake).
        if (key === assignedRole && lastShakePlayer !== player) {
          s.shakeGauge = Math.min(100, s.shakeGauge + SHAKE_GAIN);
          lastShakePlayer = player;
          if (s.shakeGauge >= 100) {
            dropAttachedCrawlers();
            screenShake(0.25, 6);
          }
        }
      }
    }

    if (mode === 'HOST' && channel) {
      channel.on('broadcast', { event: 'input' }, ({ payload }: { payload: PlayerInputPayload }) => {
        if (payload.type === 'HOLD') {
          if (payload.held) p2OnlineHeld.add(payload.key);
          else p2OnlineHeld.delete(payload.key);
        } else if (payload.type === 'TAP') {
          applyPlayerTap('P2', payload.key);
        }
      });
    } else if (mode === 'CLIENT' && channel) {
      channel.on('broadcast', { event: 'state' }, ({ payload }: { payload: GameState }) => {
        if (payload.hp < s.hp) {
          if (s.state === 'PLAYING') playClip(ELEVATOR_HIT_SFX, 0.85);
          screenShake(0.4, 12);
        }
        Object.assign(s, payload);
      });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const k = normalize(e.key);
      const input = KEYMAP[k];
      if (!input) return;
      e.preventDefault();
      const firstPress = !keys.has(k) && !e.repeat;
      keys.add(k);
      if (!firstPress) return;

      if (mode === 'CLIENT') {
        channel?.send({ type: 'broadcast', event: 'input', payload: { type: 'HOLD', key: input.key, held: true } });
        channel?.send({ type: 'broadcast', event: 'input', payload: { type: 'TAP', key: input.key } });
        return;
      }
      const player: PlayerTurn = mode === 'HOST' ? 'P1' : input.player;
      applyPlayerTap(player, input.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = normalize(e.key);
      const input = KEYMAP[k];
      keys.delete(k);
      if (mode === 'CLIENT' && input) {
        channel?.send({ type: 'broadcast', event: 'input', payload: { type: 'HOLD', key: input.key, held: false } });
      }
    };
    const onBlur = () => keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // ---------- update ----------
    function updateCrawlers(dt: number) {
      for (const c of s.crawlers) {
        if (c.falling) {
          c.y -= 700 * dt;
        } else if (!c.attached) {
          c.y += c.speed * dt;
          if (c.y >= s.y) {
            const slot = s.crawlers.filter((o) => o.attached).length;
            c.attached = true;
            c.x = W / 2 + (slot - 1) * 48;
          }
        }
      }
      s.crawlers = s.crawlers.filter((c) => c.attached || toScreen(c.y) < H + 400);
      s.weightStacks = s.crawlers.filter((c) => c.attached).length;
    }

    function update(dt: number) {
      if (time < INTRO_DURATION) {
        if (!doorSfxPlayed && time >= 0.15) {
          doorSfxPlayed = true;
          playSfx('door');
        }
        if (time >= 0.8 && time < 3.0) {
          const tick = Math.floor(time * 5);
          if (tick !== lastStepTick) {
            lastStepTick = tick;
            playSfx('step');
          }
        }
        if (!gateSfxPlayed && time >= 3.1) {
          gateSfxPlayed = true;
          playSfx('gate');
        }
        return;
      }
      if (mode === 'CLIENT') return;
      if (s.state === 'QTE') {
        s.qte.timer -= dt;
        if (s.qte.timer <= 0) failQte();
        return;
      }
      if (s.state !== 'PLAYING') return;

      const p1Active =
        mode === 'HOST'
          ? p1Role === 'UP'
            ? held('w') || held('ArrowUp')
            : held('s') || held('ArrowDown')
          : held(p1MoveKey);
      const p2Active = mode === 'HOST' ? p2OnlineHeld.has(p2Role) : held(p2MoveKey);
      const p1Dir = p1Active ? (p1Role === 'UP' ? 1 : -1) : 0;
      const p2Dir = p2Active ? (p2Role === 'UP' ? 1 : -1) : 0;
      // Smoothly ramp velocity toward target so starting/stopping feels like a real heavy cabin.
      const targetSpeed = (p1Dir + p2Dir) * BASE_SPEED * (1 - s.weightStacks * STACK_SLOWDOWN);
      s.speed += (targetSpeed - s.speed) * Math.min(1, dt * 11);
      s.y = Math.max(0, s.y + s.speed * dt);

      if (s.y >= MAX_HEIGHT) {
        s.y = MAX_HEIGHT;
        s.state = 'VICTORY';
        return;
      }

      const diff = difficulty(floorOf(s.y));

      // Ghosts
      ghostTimer -= dt;
      if (diff && ghostTimer <= 0 && s.y > 120) {
        const lanes = [...diff.lanes].sort(() => Math.random() - 0.5).slice(0, diff.dualGhosts ? 2 : 1);
        const leadY = s.speed * GHOST_WARNING * 0.85;
        for (const lane of lanes) {
          const direction = Math.random() < 0.5 ? 'RIGHT' : 'LEFT';
          s.ghosts.push({
            id: nextId++,
            x: direction === 'RIGHT' ? -GHOST_W : W + GHOST_W,
            y: s.y + leadY + LANE_OFFSETS[lane],
            lane,
            direction,
            warningTimer: GHOST_WARNING,
            speed: diff.ghostSpeed,
            kind: Math.random() < 0.5 ? 'vampire' : 'ghost',
          });
        }
        ghostTimer = rand(diff.ghostEvery);
      }

      s.ghosts = s.ghosts.filter((g) => {
        if (g.warningTimer > 0) {
          g.warningTimer -= dt;
          return true;
        }
        g.x += (g.direction === 'RIGHT' ? 1 : -1) * g.speed * dt;
        const hitX = g.x + GHOST_W / 2 > LIFT_X && g.x - GHOST_W / 2 < LIFT_X + LIFT_W;
        const hitY = g.y + GHOST_H / 2 > s.y && g.y - GHOST_H / 2 < s.y + LIFT_H;
        if (hitX && hitY) {
          s.hp = Math.max(0, s.hp - GHOST_DAMAGE);
          playClip(ELEVATOR_HIT_SFX, 0.85);
          screenShake(0.35, 10);
          return false;
        }
        return g.x > -GHOST_W * 2 && g.x < W + GHOST_W * 2;
      });

      if (s.hp <= 0) {
        s.state = 'GAMEOVER';
        screenShake(1.2, 22);
        return;
      }

      // Crawlers spawn in waves from below and climb faster than the lift can flee.
      crawlerTimer -= dt;
      if (diff && crawlerTimer <= 0 && s.y > 180) {
        for (let i = 0; i < diff.crawlerWave; i++) {
          s.crawlers.push({
            id: nextId++,
            x: W / 2 + (Math.random() - 0.5) * (LIFT_W - CRAWLER_W),
            y: s.y - 280 - i * 75,
            attached: false,
            falling: false,
            speed: diff.crawlerClimb,
            kind: Math.random() < 0.5 ? 'zombie' : 'skeleton',
          });
        }
        crawlerTimer = rand(diff.crawlerEvery);
      }
      updateCrawlers(dt);

      // Shake Gauge ("Goyangkan Lift")
      if (s.weightStacks > 0) {
        s.shakeGauge = Math.max(0, s.shakeGauge - SHAKE_DECAY * dt);
      } else {
        s.shakeGauge = 0;
      }

      if (s.weightStacks >= MAX_WEIGHT_STACKS) {
        s.state = 'QTE';
        s.speed = 0;
        s.shakeGauge = 0;
        s.qte = newQte();
        screenShake(0.5, 14);
      }
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

    function drawWallTile(x0: number, x1: number, offset: number, darken: number, fallbackShades: string[], mortar: string) {
      if (!ready(sprites.shaft)) {
        drawBricks(x0, x1, offset, fallbackShades, mortar);
        return;
      }
      shaftPattern ??= ctx!.createPattern(sprites.shaft, 'repeat');
      const th = sprites.shaft.naturalHeight;
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(x0, 0, x1 - x0, H);
      ctx!.clip();
      ctx!.translate(x0, offset % th);
      ctx!.fillStyle = shaftPattern!;
      ctx!.fillRect(0, -th, x1 - x0, H + th * 2);
      if (darken > 0) {
        ctx!.fillStyle = `rgba(0,0,0,${darken})`;
        ctx!.fillRect(0, -th, x1 - x0, H + th * 2);
      }
      ctx!.restore();
    }

    function drawCorridor(floorIndex: number) {
      const slabY = toScreen(floorIndex * FLOOR_HEIGHT);
      if (slabY < -200 || slabY > H + 40) return;
      const roomH = 150;
      const isTop = floorIndex >= MAX_HEIGHT / FLOOR_HEIGHT;

      for (const side of [0, 1]) {
        const x0 = side === 0 ? 0 : SHAFT_R;
        const x1 = side === 0 ? SHAFT_L : W;
        const grad = ctx!.createLinearGradient(0, slabY - roomH, 0, slabY);
        grad.addColorStop(0, isTop ? '#1b2238' : '#2a1610');
        grad.addColorStop(1, isTop ? '#2c3658' : '#4a2a18');
        ctx!.fillStyle = grad;
        ctx!.fillRect(x0, slabY - roomH, x1 - x0, roomH);
        ctx!.fillStyle = '#5a0f14';
        ctx!.fillRect(x0, slabY - 14, x1 - x0, 14);
        // Door
        const doorW = 54;
        const doorX = side === 0 ? x1 - doorW - 40 : x0 + 40;
        const openAmt =
          floorIndex === 0 && time > 0.15 && time < 3.4
            ? Math.min(1, (time - 0.15) / 0.5)
            : 0;
        ctx!.fillStyle = '#3b2314';
        ctx!.fillRect(doorX - 4, slabY - 110, doorW + 8, 96);
        // Dark room interior behind the door when open
        ctx!.fillStyle = '#0c0604';
        ctx!.fillRect(doorX, slabY - 106, doorW, 92);
        const leafW = doorW * (1 - openAmt * 0.72);
        ctx!.fillStyle = '#5c3a22';
        ctx!.fillRect(doorX, slabY - 106, leafW, 92);
        if (leafW > 18) {
          ctx!.fillStyle = '#7a5232';
          ctx!.fillRect(doorX + 5, slabY - 98, leafW - 10, 34);
          ctx!.fillRect(doorX + 5, slabY - 58, leafW - 10, 38);
          ctx!.fillStyle = '#d9b44a';
          ctx!.beginPath();
          ctx!.arc(side === 0 ? doorX + leafW - 7 : doorX + 7, slabY - 58, 3, 0, Math.PI * 2);
          ctx!.fill();
        }
        ctx!.fillStyle = '#d9b44a';
        ctx!.font = 'bold 11px monospace';
        ctx!.textAlign = 'center';
        ctx!.fillText(isTop ? '1008' : `${floorIndex + 1}0${side + 1}`, doorX + doorW / 2, slabY - 114);
        // Flickering wall lamp + asset fixture
        const flicker = Math.sin(time * 13 + floorIndex) > -0.7 ? 1 : 0.3;
        const lampX = side === 0 ? 45 : W - 45;
        if (ready(sprites.elevator)) {
          ctx!.drawImage(
            sprites.elevator,
            ELEV_LAMP.sx,
            ELEV_LAMP.sy,
            ELEV_LAMP.sw,
            ELEV_LAMP.sh,
            lampX - 24,
            slabY - 148,
            48,
            72,
          );
          if (side === 0 && floorIndex % 2 === 0 && ready(sprites.steampunk)) {
            ctx!.drawImage(
              sprites.steampunk,
              STEAM_BANNER.sx,
              STEAM_BANNER.sy,
              STEAM_BANNER.sw,
              STEAM_BANNER.sh,
              SHAFT_L - 44,
              slabY - 122,
              32,
              54,
            );
          }
          if (side === 1 && floorIndex % 2 === 1) {
            ctx!.drawImage(
              sprites.elevator,
              ELEV_DANGER.sx,
              ELEV_DANGER.sy,
              ELEV_DANGER.sw,
              ELEV_DANGER.sh,
              SHAFT_R - 46,
              slabY - 108,
              34,
              82,
            );
          }
        }
        const glow = ctx!.createRadialGradient(lampX, slabY - 118, 2, lampX, slabY - 118, 65);
        glow.addColorStop(0, `rgba(255,190,90,${0.6 * flicker})`);
        glow.addColorStop(1, 'rgba(255,190,90,0)');
        ctx!.fillStyle = glow;
        ctx!.fillRect(lampX - 65, slabY - 180, 130, 130);
      }

      ctx!.fillStyle = '#222';
      ctx!.fillRect(0, slabY, W, 12);
      ctx!.fillStyle = '#3a3a3a';
      ctx!.fillRect(0, slabY, W, 3);
      ctx!.fillStyle = isTop ? '#7fd1ff' : '#e8c26a';
      ctx!.font = 'bold 14px monospace';
      ctx!.textAlign = 'left';
      ctx!.fillText(isTop ? 'ROOM 1008' : `FLOOR ${floorIndex + 1}`, SHAFT_L + 8, slabY - 6);
    }

    function drawLiftFallback(x: number, y: number) {
      ctx!.fillStyle = '#2b1a12';
      ctx!.fillRect(x - 4, y - 4, LIFT_W + 8, LIFT_H + 8);
      ctx!.fillStyle = '#6b3d22';
      ctx!.fillRect(x, y, LIFT_W, LIFT_H);
      ctx!.strokeStyle = '#5a321b';
      ctx!.lineWidth = 1;
      for (let gy = y + 8; gy < y + LIFT_H; gy += 7) {
        ctx!.beginPath();
        ctx!.moveTo(x + 4, gy);
        ctx!.lineTo(x + LIFT_W - 4, gy + Math.sin(gy) * 1.5);
        ctx!.stroke();
      }
      const lamp = s.state === 'QTE' ? (Math.sin(time * 30) > 0 ? 1 : 0.1) : Math.sin(time * 20) > -0.85 ? 1 : 0.4;
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

    function drawCables(liftX: number, liftTop: number) {
      const segH = 120;
      const scroll = (s.y * 1.4) % segH;
      for (const cx of [liftX + 35, liftX + LIFT_W - 35]) {
        if (s.state !== 'QTE' && ready(sprites.elevator)) {
          ctx!.save();
          ctx!.beginPath();
          ctx!.rect(cx - 10, 0, 20, liftTop + 6);
          ctx!.clip();
          for (let cy = -segH + scroll; cy < liftTop + 6; cy += segH) {
            ctx!.drawImage(
              sprites.elevator,
              ELEV_CABLE.sx,
              ELEV_CABLE.sy,
              ELEV_CABLE.sw,
              ELEV_CABLE.sh,
              cx - 7,
              cy,
              14,
              segH + 2,
            );
          }
          ctx!.restore();
          continue;
        }
        ctx!.strokeStyle = '#111';
        ctx!.lineWidth = 3;
        ctx!.beginPath();
        if (s.state === 'QTE') {
          // Snapped: upper end dangling, short stub on the cabin.
          const sway = Math.sin(time * 4 + cx) * 10;
          ctx!.moveTo(cx, 0);
          ctx!.quadraticCurveTo(cx + sway, liftTop * 0.3, cx + sway * 2, liftTop * 0.55);
          ctx!.moveTo(cx, liftTop);
          ctx!.lineTo(cx, liftTop - 30);
        } else {
          ctx!.moveTo(cx, 0);
          ctx!.lineTo(cx, liftTop);
        }
        ctx!.stroke();
        if (s.state === 'QTE' && Math.random() < 0.5) {
          ctx!.fillStyle = Math.random() < 0.5 ? '#fff6a0' : '#7fd1ff';
          ctx!.fillRect(cx - 4 + Math.random() * 8, liftTop - 34 + Math.random() * 8, 3, 3);
        }
      }
    }

    function drawCharacter(x: number, groundY: number, female: boolean, walking: boolean) {
      const step = walking ? Math.sin(time * 16) * 4 : 0;
      const bob = walking ? Math.abs(Math.sin(time * 16)) * 2 : 0;
      const y = groundY - bob;
      // Legs
      ctx!.fillStyle = '#1f2430';
      ctx!.fillRect(x - 6, y - 14 + step * 0.5, 5, 14);
      ctx!.fillRect(x + 1, y - 14 - step * 0.5, 5, 14);
      // Outfit (male: blue jacket, female: crimson dress)
      ctx!.fillStyle = female ? '#b91c1c' : '#2563eb';
      if (female) {
        ctx!.beginPath();
        ctx!.moveTo(x - 8, y - 32);
        ctx!.lineTo(x + 8, y - 32);
        ctx!.lineTo(x + 12, y - 12);
        ctx!.lineTo(x - 12, y - 12);
        ctx!.closePath();
        ctx!.fill();
      } else {
        ctx!.fillRect(x - 8, y - 32, 16, 19);
      }
      // Head
      ctx!.fillStyle = '#f5d0b5';
      ctx!.fillRect(x - 7, y - 46, 14, 14);
      // Hair
      ctx!.fillStyle = female ? '#3b1d0e' : '#18181b';
      ctx!.fillRect(x - 8, y - 49, 16, 5);
      if (female) {
        ctx!.fillRect(x - 9, y - 46, 3, 14);
        ctx!.fillRect(x + 6, y - 46, 3, 14);
      }
      // Eyes
      ctx!.fillStyle = '#111';
      ctx!.fillRect(x - 4, y - 40, 2, 3);
      ctx!.fillRect(x + 2, y - 40, 2, 3);
    }

    function drawElevatorAndPlayers(liftX: number, liftTop: number) {
      const walkProgress = Math.max(0, Math.min(1, (time - 0.65) / 2.2));
      const walking = time >= 0.65 && time < 2.85;
      const maleX = 153 + (liftX + 58 - 153) * walkProgress;
      const femaleX = 647 + (liftX + LIFT_W - 58 - 647) * walkProgress;
      const insideLift = walkProgress >= 0.85;
      const gateProgress = Math.max(0, Math.min(1, (time - 2.95) / 0.3));

      if (!ready(sprites.steampunk)) {
        drawLiftFallback(liftX, liftTop);
        drawCharacter(maleX, BASE_Y - 8, false, walking);
        drawCharacter(femaleX, BASE_Y - 8, true, walking);
        return;
      }

      // 1. Open Vintage Steampunk elevator cabin (chandelier, ruby crest, sconces, red carpet)
      ctx!.drawImage(
        sprites.steampunk,
        STEAM_OPEN.sx,
        STEAM_OPEN.sy,
        STEAM_OPEN.sw,
        STEAM_OPEN.sh,
        liftX,
        liftTop,
        LIFT_W,
        LIFT_H,
      );

      // 2. Players inside the cabin (drawn behind the accordion brass gate)
      if (insideLift) {
        drawCharacter(maleX, BASE_Y - 14, false, walking);
        drawCharacter(femaleX, BASE_Y - 14, true, walking);
      }

      // 3. Sliding brass accordion gate once players step inside
      if (gateProgress > 0) {
        const doorwayX = liftX + 28;
        const doorwayY = liftTop + 26;
        const doorwayW = (LIFT_W - 56) * gateProgress;
        const doorwayH = LIFT_H - 34;
        ctx!.drawImage(
          sprites.steampunk,
          STEAM_GATE.sx,
          STEAM_GATE.sy,
          STEAM_GATE.sw,
          STEAM_GATE.sh,
          doorwayX,
          doorwayY,
          doorwayW,
          doorwayH,
        );
      }

      // 4. Players still walking in the corridor
      if (!insideLift && time >= 0.35) {
        drawCharacter(maleX, BASE_Y - 10, false, walking);
        drawCharacter(femaleX, BASE_Y - 10, true, walking);
      }
    }

    function drawGhost(g: HorizontalGhost) {
      const sx = g.x;
      const sy = toScreen(g.y);
      const img = g.kind === 'ghost' ? sprites.cuteGhost : sprites.ghost;
      if (ready(img)) {
        const fw = img.naturalWidth / GHOST_SHEET_COLS;
        const fh = img.naturalHeight / GHOST_SHEET_ROWS;
        const col = Math.floor(time * 10 + g.id) % GHOST_SHEET_COLS;
        // cute_ghost.png: row 0 faces right, row 1 faces left. Vampire.png: row 0 faces left, row 1 faces right.
        const row = g.kind === 'ghost' ? (g.direction === 'RIGHT' ? 0 : 1) : g.direction === 'RIGHT' ? 1 : 0;
        const bob = Math.sin(time * 10 + g.id) * 3;
        ctx!.drawImage(
          img,
          col * fw,
          row * fh,
          fw,
          fh,
          sx - GHOST_DRAW_W / 2,
          sy - GHOST_DRAW_H / 2 + bob,
          GHOST_DRAW_W,
          GHOST_DRAW_H,
        );
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

    function drawCrawler(c: BottomCrawler, jitterX: number) {
      const top = c.attached ? BASE_Y - 12 : toScreen(c.y);
      const cx = c.x + (c.attached ? jitterX : 0);
      const sprite = c.kind === 'skeleton' ? sprites.skeleton : sprites.zombie;
      if (ready(sprite)) {
        const fw = sprite.naturalWidth / CRAWLER_SHEET_COLS;
        const fh = sprite.naturalHeight / CRAWLER_SHEET_ROWS;
        const total = CRAWLER_SHEET_COLS * CRAWLER_SHEET_ROWS;
        const frame = c.falling ? 0 : Math.floor(time * (c.attached ? 6 : 12) + c.id) % total;
        const col = frame % CRAWLER_SHEET_COLS;
        const row = Math.floor(frame / CRAWLER_SHEET_COLS);
        const dx = cx - CRAWLER_DRAW_W / 2;
        ctx!.save();
        if (c.falling) {
          ctx!.translate(cx, top + CRAWLER_DRAW_H / 2);
          ctx!.rotate(Math.PI);
          ctx!.translate(-cx, -(top + CRAWLER_DRAW_H / 2));
        }
        ctx!.drawImage(sprite, col * fw, row * fh, fw, fh, dx, top, CRAWLER_DRAW_W, CRAWLER_DRAW_H);
        ctx!.restore();
        return;
      }
      const x = cx - CRAWLER_W / 2;
      const reach = c.attached || c.falling ? 0 : Math.sin(time * 12) * 4;
      ctx!.fillStyle = '#2f7a2a';
      ctx!.fillRect(x + 2, top - 2 + reach, 8, 26);
      ctx!.fillRect(x + CRAWLER_W - 10, top - 2 - reach, 8, 26);
      ctx!.fillStyle = '#4caf3f';
      ctx!.fillRect(x + 10, top + 6, CRAWLER_W - 20, 20);
      ctx!.fillStyle = '#ff3030';
      ctx!.fillRect(x + 15, top + 13, 4, 4);
      ctx!.fillRect(x + CRAWLER_W - 19, top + 13, 4, 4);
      ctx!.fillStyle = '#3a5a8a';
      ctx!.fillRect(x + 8, top + 26, CRAWLER_W - 16, CRAWLER_H - 26);
      ctx!.fillStyle = '#2f7a2a';
      ctx!.fillRect(x + 14, top + 34, 6, 6);
    }

    function render() {
      ctx!.clearRect(0, 0, W, H);
      ctx!.save();
      if (shakeTime > 0) {
        ctx!.translate((Math.random() - 0.5) * shakeMag * 2, (Math.random() - 0.5) * shakeMag * 2);
      }

      drawWallTile(SHAFT_L, SHAFT_R, s.y * 0.5, 0.45, ['#1a1414', '#1e1717', '#161111'], '#0b0909');
      drawWallTile(0, SHAFT_L, s.y, 0.1, ['#3a2420', '#43291f', '#332019'], '#140c0a');
      drawWallTile(SHAFT_R, W, s.y, 0.1, ['#3a2420', '#43291f', '#332019'], '#140c0a');

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

      // Cabin wobbles while players shake it.
      const jitterX = s.weightStacks > 0 ? Math.sin(time * 60) * (s.shakeGauge / 20) : 0;
      const liftX = LIFT_X + jitterX;
      const liftTop = BASE_Y - LIFT_H;
      drawCables(liftX, liftTop);

      for (const c of s.crawlers) drawCrawler(c, jitterX);

      drawElevatorAndPlayers(liftX, liftTop);

      for (const g of s.ghosts) {
        if (g.warningTimer > 0) drawGhostWarning(g);
        else drawGhost(g);
      }

      ctx!.restore();

      const v = ctx!.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 520);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, s.state === 'QTE' ? 'rgba(120,0,0,0.8)' : 'rgba(0,0,0,0.75)');
      ctx!.fillStyle = v;
      ctx!.fillRect(0, 0, W, H);
    }

    function pushHud() {
      const incoming = s.ghosts.find((g) => g.warningTimer > 0);
      let warning = '';
      if (incoming) warning = `GHOST INCOMING FROM THE ${incoming.direction === 'RIGHT' ? 'LEFT' : 'RIGHT'}!`;
      else if (s.weightStacks > 0) warning = 'ZOMBIE ATTACHED! SHAKE THE ELEVATOR!';
      else if (s.crawlers.some((c) => !c.attached && !c.falling)) warning = 'Something is climbing up the shaft...';
      else if (floorOf(s.y) >= 10) warning = 'SAFE ZONE - ROOM 1008 IS RIGHT ABOVE!';

      const hud: HudInfo = {
        floor: floorOf(s.y),
        hp: Math.round(s.hp),
        warning,
        state: s.state,
        weightStacks: s.weightStacks,
        shakeGauge: Math.round(s.shakeGauge),
        qte: { ...s.qte, timer: Math.max(0, Math.round(s.qte.timer * 10) / 10) },
      };
      const key = JSON.stringify(hud);
      if (key !== lastHud) {
        lastHud = key;
        onHudRef.current(hud);
      }
    }

    function syncAudio(dt: number) {
      let playedGhostWave = false;
      for (const g of s.ghosts) {
        if (!seenGhosts.has(g.id)) {
          seenGhosts.add(g.id);
          if (!playedGhostWave) {
            playedGhostWave = true;
            playClip(GHOST_SFX, 0.55);
          }
        }
      }
      for (const c of s.crawlers) {
        if (!seenCrawlers.has(c.id)) {
          seenCrawlers.add(c.id);
          playClip(pick(c.kind === 'zombie' ? ZOMBIE_SFX : SKELETON_SFX), 0.7);
        }
      }
      if (s.state === 'PLAYING' && s.crawlers.some((c) => !c.attached && !c.falling && c.kind === 'skeleton')) {
        skeletonStepTimer -= dt;
        if (skeletonStepTimer <= 0) {
          skeletonStepTimer = 0.35;
          playClip(pick(SKELETON_SFX), 0.6);
        }
      } else {
        skeletonStepTimer = 0;
      }
    }

    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      shakeTime = Math.max(0, shakeTime - dt);
      update(dt);
      syncAudio(dt);
      if (mode === 'HOST' && channel) {
        syncTimer += dt;
        if (syncTimer >= 0.033 || s.state !== 'PLAYING') {
          syncTimer = 0;
          channel.send({ type: 'broadcast', event: 'state', payload: s });
        }
      }
      render();
      pushHud();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      bgm.pause();
      bgm.src = '';
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [mode, p1Role, channel]);

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
