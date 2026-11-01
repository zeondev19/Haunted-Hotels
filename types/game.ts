export const MAX_HEIGHT = 10000;
export const FLOOR_HEIGHT = 1000;
export const INITIAL_HP = 100;

export type GamePhase = 'MENU' | 'PLAYING' | 'QTE' | 'GAMEOVER' | 'VICTORY';
export type PlayerTurn = 'P1' | 'P2';
export type Direction = 'LEFT' | 'RIGHT';
export type QteKey = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface HorizontalGhost {
  id: number;
  x: number;
  /** World Y (center), increases upward like the lift. */
  y: number;
  lane: number;
  /** Direction the ghost travels across the shaft. */
  direction: Direction;
  /** Seconds left before the ghost starts flying; while > 0 a warning is shown. */
  warningTimer: number;
}

export interface BottomCrawler {
  id: number;
  x: number;
  /** World Y of the crawler's top edge. */
  y: number;
  attached: boolean;
  /** Each stack slows the lift down. */
  weightStacks: number;
  /** Seconds spent attached since the last stack was added. */
  attachTimer: number;
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
}
