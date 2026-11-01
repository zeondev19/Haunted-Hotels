export const MAX_HEIGHT = 10000;
export const FLOOR_HEIGHT = 1000;
export const INITIAL_HP = 100;
export const MAX_WEIGHT_STACKS = 3;
export const QTE_TIME = 6;

export type GamePhase = 'MENU' | 'PLAYING' | 'QTE' | 'GAMEOVER' | 'VICTORY';
export type GameMode = 'LOCAL' | 'HOST' | 'CLIENT';
export type PlayerTurn = 'P1' | 'P2';
export type PlayerRole = 'UP' | 'DOWN';
export type Direction = 'LEFT' | 'RIGHT';
export type QteKey = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface PlayerInputPayload {
  type: 'HOLD' | 'TAP';
  key: QteKey;
  held?: boolean;
}

export interface HorizontalGhost {
  id: number;
  x: number;
  /** World Y (center), increases upward like the lift. */
  y: number;
  /** 0 = above the cabin, 1 = cabin level, 2 = below the cabin (relative to the lift at spawn time). */
  lane: number;
  /** Direction the ghost travels across the shaft. */
  direction: Direction;
  /** Seconds left before the ghost dashes; while > 0 a warning is shown. */
  warningTimer: number;
  /** Dash speed in px/s, set by the floor difficulty at spawn time. */
  speed: number;
  kind: 'vampire' | 'ghost';
}

export interface BottomCrawler {
  id: number;
  x: number;
  /** World Y of the crawler's top edge (ignored while attached; it hangs under the cabin). */
  y: number;
  attached: boolean;
  /** Shaken off or shocked by a cable repair, dropping down the shaft. */
  falling: boolean;
  speed: number;
  kind: 'zombie' | 'skeleton';
}

export interface QteState {
  active: boolean;
  sequence: QteKey[];
  currentIndex: number;
  timer: number;
  turn: PlayerTurn;
}

export interface GameState {
  /** Lift bottom position in world pixels, 0 = ground floor. */
  y: number;
  maxHeight: number;
  /** Current signed vertical velocity in px/s (positive = up). */
  speed: number;
  hp: number;
  state: GamePhase;
  /** Number of crawlers attached to the cabin; each slows the lift by 25%. */
  weightStacks: number;
  /** 0-100, filled by alternating UP/DOWN while crawlers are attached. */
  shakeGauge: number;
  ghosts: HorizontalGhost[];
  crawlers: BottomCrawler[];
  qte: QteState;
}

/** Snapshot pushed from the canvas to the React HUD. */
export interface HudInfo {
  floor: number;
  hp: number;
  warning: string;
  state: GamePhase;
  weightStacks: number;
  shakeGauge: number;
  qte: QteState;
}
