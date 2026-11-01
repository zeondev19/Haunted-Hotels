'use client';

import { useCallback, useState } from 'react';
import GameCanvas from '@/components/GameCanvas';
import { INITIAL_HP, MAX_HEIGHT, FLOOR_HEIGHT, type HudInfo } from '@/types/game';

const TOTAL_FLOORS = MAX_HEIGHT / FLOOR_HEIGHT;
const INITIAL_HUD: HudInfo = { floor: 1, hp: INITIAL_HP, warning: '', state: 'PLAYING' };

export default function Home() {
  const [screen, setScreen] = useState<'MENU' | 'GAME'>('MENU');
  const [run, setRun] = useState(0);
  const [hud, setHud] = useState<HudInfo>(INITIAL_HUD);

  const handleHud = useCallback((next: HudInfo) => setHud(next), []);

  const start = () => {
    setHud(INITIAL_HUD);
    setRun((r) => r + 1);
    setScreen('GAME');
  };

  if (screen === 'MENU') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-black px-4 text-center text-neutral-200">
        <div>
          <h1 className="font-mono text-5xl font-bold tracking-widest text-red-600 drop-shadow-[0_0_12px_rgba(220,38,38,0.6)]">
            THE HAUNTED HOTEL
          </h1>
          <p className="mt-3 font-mono text-sm text-neutral-400">
            Naikkan lift bersama sampai lantai {TOTAL_FLOORS}. Jangan biarkan hantu menyentuhnya.
          </p>
        </div>
        <button
          onClick={start}
          autoFocus
          className="rounded border-2 border-red-700 bg-red-950/40 px-8 py-4 font-mono text-lg font-bold text-red-100 transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400"
        >
          Play Local Co-op (1 Layar)
        </button>
        <div className="grid grid-cols-2 gap-8 font-mono text-sm text-neutral-400">
          <div>
            <p className="font-bold text-neutral-200">Player 1</p>
            <p>W = Naik · S = Turun</p>
          </div>
          <div>
            <p className="font-bold text-neutral-200">Player 2</p>
            <p>↑ = Naik · ↓ = Turun</p>
          </div>
          <p className="col-span-2 text-xs text-neutral-500">
            Tekan Naik bersamaan untuk kecepatan penuh. Sendirian hanya 50%.
          </p>
        </div>
      </main>
    );
  }

  const hpColor = hud.hp > 60 ? 'bg-green-600' : hud.hp > 30 ? 'bg-yellow-500' : 'bg-red-600';
  const ended = hud.state === 'GAMEOVER' || hud.state === 'VICTORY';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black p-4 font-mono text-neutral-200">
      <div className="relative w-full max-w-[800px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-3">
          <div className="rounded bg-black/70 px-3 py-1 text-lg font-bold text-amber-300">
            LANTAI {hud.floor}/{TOTAL_FLOORS}
          </div>
          <div className="w-48 rounded bg-black/70 p-2">
            <div className="mb-1 flex justify-between text-xs">
              <span>HP LIFT</span>
              <span>{hud.hp}</span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded bg-neutral-800"
              role="progressbar"
              aria-label="HP Lift"
              aria-valuenow={hud.hp}
              aria-valuemin={0}
              aria-valuemax={INITIAL_HP}
            >
              <div className={`h-full ${hpColor} transition-all`} style={{ width: `${hud.hp}%` }} />
            </div>
          </div>
        </div>

        {hud.warning && !ended && (
          <p
            role="alert"
            className="pointer-events-none absolute inset-x-0 top-16 z-10 animate-pulse text-center text-lg font-bold text-red-500 drop-shadow-[0_0_6px_rgba(0,0,0,1)]"
          >
            {hud.warning}
          </p>
        )}

        <GameCanvas key={run} onHud={handleHud} />

        {ended && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-md bg-black/80">
            <h2 className={`text-4xl font-bold ${hud.state === 'VICTORY' ? 'text-amber-300' : 'text-red-600'}`}>
              {hud.state === 'VICTORY' ? 'KALIAN SELAMAT!' : 'LIFT HANCUR'}
            </h2>
            <div className="flex gap-4">
              <button
                onClick={start}
                autoFocus
                className="rounded border-2 border-red-700 px-6 py-2 font-bold hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
              >
                Main Lagi
              </button>
              <button
                onClick={() => setScreen('MENU')}
                className="rounded border-2 border-neutral-600 px-6 py-2 font-bold hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-400"
              >
                Menu
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
