'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import GameCanvas from '@/components/GameCanvas';
import { supabase } from '@/lib/supabase';
import {
  FLOOR_HEIGHT,
  INITIAL_HP,
  MAX_HEIGHT,
  MAX_WEIGHT_STACKS,
  QTE_TIME,
  type GameMode,
  type HudInfo,
  type PlayerRole,
  type QteKey,
} from '@/types/game';

const TOTAL_FLOORS = MAX_HEIGHT / FLOOR_HEIGHT;
const INITIAL_HUD: HudInfo = {
  floor: 1,
  hp: INITIAL_HP,
  warning: '',
  state: 'PLAYING',
  weightStacks: 0,
  shakeGauge: 0,
  qte: { active: false, sequence: [], currentIndex: 0, timer: 0, turn: 'P1' },
};

const ARROW: Record<QteKey, string> = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' };
const P1_KEY: Record<QteKey, string> = { UP: 'W', DOWN: 'S', LEFT: 'A', RIGHT: 'D' };

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function Home() {
  const [screen, setScreen] = useState<'MENU' | 'LOBBY' | 'GAME'>('MENU');
  const [mode, setMode] = useState<GameMode>('LOCAL');
  const [p1Role, setP1Role] = useState<PlayerRole>('UP');
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [playersCount, setPlayersCount] = useState(1);
  const [lobbyError, setLobbyError] = useState('');
  const [showControls, setShowControls] = useState(false);
  const [run, setRun] = useState(0);
  const [hud, setHud] = useState<HudInfo>(INITIAL_HUD);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handleHud = useCallback((next: HudInfo) => setHud(next), []);
  const p2Role: PlayerRole = p1Role === 'UP' ? 'DOWN' : 'UP';
  const p1Btn = p1Role === 'UP' ? 'W (Naik)' : 'S (Turun)';
  const p2Btn = p2Role === 'UP' ? '↑ (Naik)' : '↓ (Turun)';

  const leaveChannel = useCallback(() => {
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setChannel(null);
    }
  }, []);

  useEffect(() => () => leaveChannel(), [leaveChannel]);

  useEffect(() => {
    if (screen === 'GAME') return;
    const audio = new Audio('/music/musik_menu.mp3');
    audio.loop = true;
    audio.volume = 0.5;
    const tryPlay = () => {
      audio.play().catch(() => {});
    };
    tryPlay();
    window.addEventListener('pointerdown', tryPlay, { once: true });
    window.addEventListener('keydown', tryPlay, { once: true });
    return () => {
      window.removeEventListener('pointerdown', tryPlay);
      window.removeEventListener('keydown', tryPlay);
      audio.pause();
      audio.src = '';
    };
  }, [screen]);

  const connectRoom = (code: string, nextMode: 'HOST' | 'CLIENT') => {
    if (!supabase) {
      setLobbyError('Mode Online belum tersedia saat ini.');
      return;
    }
    leaveChannel();
    setLobbyError('');
    setMode(nextMode);
    setRoomCode(code);
    setPlayersCount(1);
    setScreen('LOBBY');

    const ch = supabase.channel(`room:${code}`, {
      config: { broadcast: { self: false }, presence: { key: nextMode } },
    });

    ch.on('presence', { event: 'sync' }, () => {
      const count = Object.keys(ch.presenceState()).length;
      setPlayersCount(count);
    });

    ch.on('broadcast', { event: 'role' }, ({ payload }: { payload: { p1Role: PlayerRole } }) => {
      setP1Role(payload.p1Role);
    });

    ch.on('broadcast', { event: 'start' }, ({ payload }: { payload: { p1Role: PlayerRole } }) => {
      setP1Role(payload.p1Role);
      setHud(INITIAL_HUD);
      setRun((r) => r + 1);
      setScreen('GAME');
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ role: nextMode });
      }
    });

    channelRef.current = ch;
    setChannel(ch);
  };

  const toggleRole = (role: PlayerRole) => {
    setP1Role(role);
    if (mode === 'HOST' && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'role', payload: { p1Role: role } });
    }
  };

  const startLocal = () => {
    leaveChannel();
    setMode('LOCAL');
    setHud(INITIAL_HUD);
    setRun((r) => r + 1);
    setScreen('GAME');
  };

  const startOnline = () => {
    if (mode === 'HOST' && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'start', payload: { p1Role } });
    }
    setHud(INITIAL_HUD);
    setRun((r) => r + 1);
    setScreen('GAME');
  };

  if (screen === 'MENU') {
    return (
      <main className="relative flex h-dvh w-full items-center justify-between overflow-hidden bg-[#0a0507] bg-[url('/assets/menu_bg.png')] bg-cover bg-center px-6 text-neutral-100 sm:px-12 lg:px-16">
        {/* Left Side: Checkered Pixel Cables + Open Vintage Steampunk Elevator anchored flush at bottom-left */}
        <div className="relative hidden h-full w-[46%] max-w-[540px] select-none md:block">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-[64%] left-[23.5%] w-3.5 [background-image:conic-gradient(#382220_90deg,#64413d_90deg_180deg,#382220_180deg_270deg,#64413d_270deg)] [background-size:10px_10px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-[24.5%] bottom-[64%] w-3.5 [background-image:conic-gradient(#382220_90deg,#64413d_90deg_180deg,#382220_180deg_270deg,#64413d_270deg)] [background-size:10px_10px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 h-[72%] w-full bg-[url('/assets/menu_elevator.png')] bg-contain bg-bottom bg-no-repeat [image-rendering:pixelated]"
          />
        </div>

        {/* Right Side: Exact GOING UP? Logo + Menu Cards matching the reference design */}
        <div className="relative z-10 mx-auto flex w-full max-w-[440px] flex-col items-center text-center md:mx-auto">
          <h1 className="sr-only">GOING UP?</h1>
          <div
            aria-hidden="true"
            className="h-20 w-72 bg-[url('/assets/going_up_logo.png')] bg-contain bg-center bg-no-repeat sm:h-24 sm:w-88 [image-rendering:pixelated]"
          />
          <p className="mt-2 font-sans text-lg tracking-tight text-white sm:text-xl">
            reach your room floor or die.
          </p>

          <div className="mt-7 flex w-full max-w-[390px] flex-col items-center gap-3.5">
            {/* Play Locally button */}
            <button
              type="button"
              onClick={startLocal}
              autoFocus
              className="w-full cursor-pointer rounded-lg bg-[#521520] py-2.5 font-serif text-lg font-bold tracking-wide text-white shadow-[0_3px_0_#2b090f] transition hover:bg-[#681b29]"
            >
              Play Locally
            </button>

            {/* Play Online CO-OP dark rounded container */}
            <div className="w-full rounded-xl bg-[#1e1d1d]/95 p-3.5 shadow-xl">
              <p className="mb-2.5 font-sans text-lg text-white">Play Online CO-OP</p>

              <button
                type="button"
                onClick={() => connectRoom(randomCode(), 'HOST')}
                className="w-full cursor-pointer rounded-lg bg-[#521520] py-2.5 font-serif text-lg font-bold tracking-wide text-white shadow-[0_3px_0_#2b090f] transition hover:bg-[#681b29]"
              >
                Create Lobby (p1)
              </button>

              <div className="mt-3 flex w-full items-stretch gap-2.5">
                <input
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 4))}
                  placeholder="Join Code (P2)"
                  aria-label="Join Code (P2)"
                  className="flex-1 rounded-lg bg-[#3c3c3c] px-4 py-2.5 text-center font-serif text-base italic text-white placeholder:italic placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                />
                <button
                  type="button"
                  onClick={() => joinInput.length === 4 && connectRoom(joinInput, 'CLIENT')}
                  disabled={joinInput.length !== 4}
                  className="cursor-pointer rounded-lg bg-[#521520] px-5 py-2.5 font-serif text-lg font-bold text-white shadow-[0_3px_0_#2b090f] transition hover:bg-[#681b29] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Join
                </button>
              </div>
              {lobbyError && <p className="mt-2 text-sm text-red-400">{lobbyError}</p>}
            </div>

            {/* Controls button */}
            <button
              type="button"
              onClick={() => setShowControls(true)}
              className="w-full cursor-pointer rounded-lg bg-[#cc8b4b] py-2.5 font-serif text-lg font-bold tracking-wide text-[#140a04] shadow-[0_3px_0_#734920] transition hover:bg-[#db9856]"
            >
              Controls
            </button>
          </div>
        </div>

        {/* Controls & Role Selection Modal when clicking "Controls" */}
        {showControls && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
            <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-[#16080b] p-6 text-left shadow-2xl">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h2 className="font-sans text-xl font-bold text-amber-300">Controls &amp; Role Assignment</h2>
                <button
                  type="button"
                  onClick={() => setShowControls(false)}
                  className="cursor-pointer rounded bg-neutral-800 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-700"
                >
                  Close
                </button>
              </div>

              <p className="mt-4 text-sm text-neutral-300"> Pilih pembagian tombol gerak lift (1 tombol per pemain):</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => toggleRole('UP')}
                  className={`cursor-pointer rounded-lg border p-3 text-left transition ${
                    p1Role === 'UP'
                      ? 'border-red-500 bg-[#521520]/70 text-white'
                      : 'border-neutral-800 bg-black/50 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <p className="font-bold text-sky-300">P1: W (Naik)</p>
                  <p className="mt-1 font-bold text-amber-300">P2: ↓ (Turun)</p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleRole('DOWN')}
                  className={`cursor-pointer rounded-lg border p-3 text-left transition ${
                    p1Role === 'DOWN'
                      ? 'border-red-500 bg-[#521520]/70 text-white'
                      : 'border-neutral-800 bg-black/50 text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <p className="font-bold text-sky-300">P1: S (Turun)</p>
                  <p className="mt-1 font-bold text-amber-300">P2: ↑ (Naik)</p>
                </button>
              </div>

              <div className="mt-4 space-y-2 rounded-lg bg-black/60 p-3.5 text-sm text-neutral-300">
                <p>
                  <strong className="text-sky-300">Player 1:</strong> Gerak <span className="text-white">{p1Btn}</span> · Repair QTE <span className="text-amber-200">W A S D</span>
                </p>
                <p>
                  <strong className="text-amber-300">Player 2:</strong> Gerak <span className="text-white">{p2Btn}</span> · Repair QTE <span className="text-amber-200">↑ ← ↓ →</span>
                </p>
                <p className="text-xs text-neutral-400">
                  Saat zombie/skeleton menempel, tekan tombol gerak P1 &amp; P2 secara bergantian untuk menggoyangkan lift.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (screen === 'LOBBY') {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-[#070304] px-4 text-neutral-100">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[url('/assets/shaft_bg.png')] bg-repeat opacity-35 [image-rendering:pixelated]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(45,8,12,0.35)_0%,rgba(5,2,3,0.95)_80%)]"
        />
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 border-4 border-[#5c1d1d] bg-[#120708]/95 p-6 text-center shadow-[8px_8px_0_#000]">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-400">Elevator Waiting Room</p>
          <div className="w-full border-2 border-amber-500 bg-black px-8 py-5 shadow-[4px_4px_0_#000]">
            <p className="font-mono text-[10px] text-neutral-400">ROOM CODE</p>
            <p className="mt-2 font-mono text-3xl tracking-[0.25em] text-amber-300 sm:text-4xl">{roomCode}</p>
          </div>
          <p className="text-xl text-neutral-200">
            Players Connected: <span className="font-mono text-sm text-green-400">{playersCount}/2</span> ({mode})
          </p>
          <p className="text-lg text-neutral-300">
            Tugas: <span className="font-mono text-xs text-sky-400">P1 = {p1Role}</span> ·{' '}
            <span className="font-mono text-xs text-amber-300">P2 = {p2Role}</span>
          </p>
          <div className="flex w-full justify-center gap-4">
            {mode === 'HOST' ? (
              <button
                onClick={startOnline}
                disabled={playersCount < 2}
                className="cursor-pointer border-2 border-red-400 bg-red-800 px-6 py-3 font-mono text-xs uppercase text-amber-100 shadow-[0_4px_0_#3b0707] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {playersCount < 2 ? 'Menunggu Player 2...' : 'Start Game'}
              </button>
            ) : (
              <p className="py-3 font-mono text-xs text-amber-300">Menunggu Host memulai game...</p>
            )}
            <button
              onClick={() => {
                leaveChannel();
                setScreen('MENU');
              }}
              className="cursor-pointer border-2 border-neutral-600 bg-neutral-900 px-5 py-3 font-mono text-xs uppercase text-neutral-300 hover:bg-neutral-800"
            >
              Batal
            </button>
          </div>
        </div>
      </main>
    );
  }

  const hpColor = hud.hp > 60 ? 'bg-green-600' : hud.hp > 30 ? 'bg-yellow-500' : 'bg-red-600';
  const ended = hud.state === 'GAMEOVER' || hud.state === 'VICTORY';
  const qte = hud.qte;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black p-3 font-mono text-neutral-200">
      <div className="relative w-full max-w-[1200px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-3">
          <div className="rounded bg-black/70 px-3 py-1 text-lg font-bold text-amber-300">
            FLOOR {hud.floor}/{TOTAL_FLOORS}
          </div>
          <div className="w-48 space-y-2 rounded bg-black/70 p-2">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span>ELEVATOR HP</span>
                <span>{hud.hp}</span>
              </div>
              <div
                className="h-3 w-full overflow-hidden rounded bg-neutral-800"
                role="progressbar"
                aria-label="Elevator HP"
                aria-valuenow={hud.hp}
                aria-valuemin={0}
                aria-valuemax={INITIAL_HP}
              >
                <div className={`h-full ${hpColor} transition-all`} style={{ width: `${hud.hp}%` }} />
              </div>
            </div>
            {hud.weightStacks > 0 && hud.state === 'PLAYING' && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-green-400">
                  <span>WEIGHT</span>
                  <span>
                    {hud.weightStacks}/{MAX_WEIGHT_STACKS}
                  </span>
                </div>
                <div
                  className="h-3 w-full overflow-hidden rounded bg-neutral-800"
                  role="progressbar"
                  aria-label="Shake gauge"
                  aria-valuenow={hud.shakeGauge}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full bg-green-500" style={{ width: `${hud.shakeGauge}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-green-300">
                  SHAKE! Alternate P1 ({p1Role === 'UP' ? 'W' : 'S'}) &amp; P2 ({p2Role === 'UP' ? '↑' : '↓'})
                </p>
              </div>
            )}
          </div>
        </div>

        {hud.warning && hud.state === 'PLAYING' && (
          <p
            role="alert"
            className="pointer-events-none absolute inset-x-0 top-16 z-10 animate-pulse text-center text-lg font-bold text-red-500 drop-shadow-[0_0_6px_rgba(0,0,0,1)]"
          >
            {hud.warning}
          </p>
        )}

        <GameCanvas key={run} mode={mode} p1Role={p1Role} channel={channel} onHud={handleHud} />

        {qte.active && hud.state === 'QTE' && (
          <div
            role="alert"
            className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-red-950/40"
          >
            <h2 className="animate-pulse text-3xl font-bold text-red-500 drop-shadow-[0_0_8px_rgba(0,0,0,1)]">
              CABLE SNAPPED! REPAIR TOGETHER!
            </h2>
            <div className="flex gap-3">
              {qte.sequence.map((key, i) => {
                const p1 = i % 2 === 0;
                const done = i < qte.currentIndex;
                const current = i === qte.currentIndex;
                return (
                  <div
                    key={i}
                    className={`flex h-24 w-20 flex-col items-center justify-center rounded border-4 bg-black/80 ${
                      done
                        ? 'border-green-600 opacity-50'
                        : p1
                          ? 'border-blue-500'
                          : 'border-yellow-400'
                    } ${current ? 'scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)]' : ''}`}
                  >
                    <span className="text-4xl font-bold">{done ? '✓' : ARROW[key]}</span>
                    <span className={`text-xs font-bold ${p1 ? 'text-blue-400' : 'text-yellow-300'}`}>
                      {p1 ? `P1 · ${P1_KEY[key]}` : `P2 · ${ARROW[key]}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className={`text-lg font-bold ${qte.turn === 'P1' ? 'text-blue-400' : 'text-yellow-300'}`}>
              {qte.turn === 'P1' ? 'PLAYER 1' : 'PLAYER 2'}&apos;S TURN
            </p>
            <div className="h-3 w-64 overflow-hidden rounded bg-neutral-800">
              <div className="h-full bg-red-500" style={{ width: `${(qte.timer / QTE_TIME) * 100}%` }} />
            </div>
          </div>
        )}

        {ended && (
          <div
            className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 rounded-md ${
              hud.state === 'VICTORY' ? 'bg-black/80' : 'bg-red-950/90'
            }`}
          >
            <h2
              className={`px-4 text-center text-4xl font-bold ${hud.state === 'VICTORY' ? 'text-amber-300' : 'text-red-500'}`}
            >
              {hud.state === 'VICTORY' ? 'YOU SURVIVED! WELCOME TO ROOM 1008' : 'ELEVATOR CRASHED - GAME OVER'}
            </h2>
            <div className="flex gap-4">
              {(mode === 'LOCAL' || mode === 'HOST') && (
                <button
                  onClick={mode === 'LOCAL' ? startLocal : startOnline}
                  autoFocus
                  className="rounded border-2 border-red-700 px-6 py-2 font-bold hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                >
                  Play Again
                </button>
              )}
              <button
                onClick={() => {
                  leaveChannel();
                  setScreen('MENU');
                }}
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
