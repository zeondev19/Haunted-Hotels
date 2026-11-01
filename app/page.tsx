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

  const connectRoom = (code: string, nextMode: 'HOST' | 'CLIENT') => {
    if (!supabase) {
      setLobbyError('Isi dulu NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local');
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
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#070304] px-4 py-8 text-center text-neutral-100">
        {/* Tiled blood-stained brick shaft background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[url('/assets/shaft_bg.png')] bg-repeat opacity-45 [image-rendering:pixelated]"
        />
        {/* Horror vignette + CRT scanlines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(45,8,12,0.35)_0%,rgba(5,2,3,0.94)_80%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.45)_50%)] bg-[length:100%_4px]"
        />

        {/* Left & Right Elevator Guide Rails + Floating Pixel Sprites */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-6 hidden w-3 border-x-2 border-neutral-800 bg-neutral-950/90 lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-6 hidden w-3 border-x-2 border-neutral-800 bg-neutral-950/90 lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-14 top-1/4 hidden h-28 w-24 animate-[floatSlow_3.2s_ease-in-out_infinite] bg-[url('/assets/ghost.png')] bg-[length:600%_200%] bg-[position:0%_100%] drop-shadow-[0_0_12px_rgba(220,38,38,0.45)] [image-rendering:pixelated] lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-14 top-1/4 hidden h-28 w-24 animate-[floatSlow_2.8s_ease-in-out_infinite] bg-[url('/assets/cute_ghost.png')] bg-[length:600%_200%] bg-[position:0%_100%] drop-shadow-[0_0_12px_rgba(255,255,255,0.3)] [image-rendering:pixelated] lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-10 left-16 hidden h-28 w-20 bg-[url('/assets/zombie.png')] bg-[length:600%_200%] bg-[position:0%_0%] opacity-85 [image-rendering:pixelated] lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-10 right-16 hidden h-28 w-20 bg-[url('/assets/skeleton.png')] bg-[length:600%_200%] bg-[position:0%_0%] opacity-85 [image-rendering:pixelated] lg:block"
        />

        <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-6">
          {/* Brass Floor Indicator Plaque */}
          <div className="inline-flex items-center gap-3 border-2 border-amber-600/80 bg-[#1a0d0a] px-4 py-1.5 shadow-[4px_4px_0_#000]">
            <span className="h-2.5 w-2.5 bg-red-500 animate-[flickerLamp_3s_infinite]" />
            <span className="font-mono text-[10px] tracking-widest text-amber-300 sm:text-xs">
              FLOOR 01 &gt;&gt; ROOM 1008
            </span>
            <span className="h-2.5 w-2.5 bg-red-500 animate-[flickerLamp_3s_infinite]" />
          </div>

          {/* Pixel Art Horror Title */}
          <div>
            <h1 className="font-mono text-2xl leading-snug tracking-wider text-red-500 drop-shadow-[4px_4px_0_#2a0404] sm:text-4xl">
              THE HAUNTED HOTEL
            </h1>
            <p className="mt-2 text-xl tracking-wide text-amber-100/85 sm:text-2xl">
              Naikkan lift tua bersama sampai lantai {TOTAL_FLOORS} (Room 1008). Wajib dimainkan berdua!
            </p>
          </div>

          {/* Iron & Brass Elevator Control Panel */}
          <div className="relative w-full border-4 border-[#5c1d1d] bg-[#120708]/95 p-5 shadow-[8px_8px_0_#000] sm:p-6">
            {/* Corner Brass Rivets */}
            <span aria-hidden="true" className="absolute left-2 top-2 h-2 w-2 bg-amber-600" />
            <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 bg-amber-600" />
            <span aria-hidden="true" className="absolute bottom-2 left-2 h-2 w-2 bg-amber-600" />
            <span aria-hidden="true" className="absolute bottom-2 right-2 h-2 w-2 bg-amber-600" />

            {/* Role Selector */}
            <div className="mb-5 border-2 border-[#381414] bg-[#090404] p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-amber-400 sm:text-xs">
                Pilih Pembagian Tugas (1 Tombol / Pemain)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => toggleRole('UP')}
                  className={`cursor-pointer border-2 p-3 text-left transition ${
                    p1Role === 'UP'
                      ? 'border-red-500 bg-red-950/60 text-white shadow-[4px_4px_0_#450a0a]'
                      : 'border-neutral-800 bg-[#0d0607] text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-sky-400">P1: NAIK</span>
                    <kbd className="border border-sky-500/60 bg-sky-950/70 px-2 py-0.5 font-mono text-[10px] text-sky-200">
                      W
                    </kbd>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-amber-300">P2: TURUN</span>
                    <kbd className="border border-amber-500/60 bg-amber-950/70 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                      ↓
                    </kbd>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => toggleRole('DOWN')}
                  className={`cursor-pointer border-2 p-3 text-left transition ${
                    p1Role === 'DOWN'
                      ? 'border-red-500 bg-red-950/60 text-white shadow-[4px_4px_0_#450a0a]'
                      : 'border-neutral-800 bg-[#0d0607] text-neutral-400 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-sky-400">P1: TURUN</span>
                    <kbd className="border border-sky-500/60 bg-sky-950/70 px-2 py-0.5 font-mono text-[10px] text-sky-200">
                      S
                    </kbd>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-amber-300">P2: NAIK</span>
                    <kbd className="border border-amber-500/60 bg-amber-950/70 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                      ↑
                    </kbd>
                  </div>
                </button>
              </div>
            </div>

            {/* Primary Local Co-op Button */}
            <button
              onClick={startLocal}
              autoFocus
              className="w-full cursor-pointer border-2 border-red-400 bg-red-800 px-6 py-3.5 font-mono text-xs uppercase tracking-wider text-amber-100 shadow-[0_5px_0_#3b0707,6px_6px_0_#000] transition hover:bg-red-700 active:translate-y-1 active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400 sm:text-sm"
            >
              Play Local Co-op (1 Layar)
            </button>

            {/* Online Co-op Sub-panel */}
            <div className="mt-5 border-2 border-amber-900/70 bg-[#090404] p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-amber-400 sm:text-xs">
                Online Co-op (Supabase Realtime)
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => connectRoom(randomCode(), 'HOST')}
                  className="cursor-pointer border-2 border-amber-500 bg-amber-950/50 py-2.5 font-mono text-[11px] uppercase tracking-wider text-amber-200 shadow-[0_4px_0_#451a03] transition hover:bg-amber-900/60 active:translate-y-0.5 sm:text-xs"
                >
                  Create Lobby (Host P1)
                </button>
                <div className="flex gap-2">
                  <input
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 4))}
                    placeholder="KODE ROOM (4 HURUF)"
                    aria-label="Room Code"
                    className="flex-1 border-2 border-neutral-700 bg-black px-3 py-2 text-center font-mono text-xs uppercase tracking-widest text-amber-200 placeholder:text-neutral-600 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={() => joinInput.length === 4 && connectRoom(joinInput, 'CLIENT')}
                    disabled={joinInput.length !== 4}
                    className="cursor-pointer border-2 border-sky-500 bg-sky-950/60 px-4 py-2 font-mono text-xs uppercase text-sky-200 shadow-[0_4px_0_#0c4a6e] transition hover:bg-sky-900/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Join (P2)
                  </button>
                </div>
                {lobbyError && <p className="text-base text-red-400">{lobbyError}</p>}
              </div>
            </div>
          </div>

          {/* Pixel Control Manual Footer */}
          <div className="grid w-full grid-cols-2 gap-4 border-2 border-[#381414] bg-[#0d0607]/90 p-3 text-left shadow-[6px_6px_0_#000]">
            <div className="border-r border-[#381414] pr-3">
              <p className="font-mono text-[11px] text-sky-400">PLAYER 1</p>
              <p className="mt-1 text-lg text-neutral-300">Gerak: <span className="text-white">{p1Btn}</span></p>
              <p className="text-lg text-neutral-400">QTE Kabel: <span className="text-amber-200">W A S D</span></p>
            </div>
            <div className="pl-1">
              <p className="font-mono text-[11px] text-amber-300">PLAYER 2</p>
              <p className="mt-1 text-lg text-neutral-300">Gerak: <span className="text-white">{p2Btn}</span></p>
              <p className="text-lg text-neutral-400">QTE Kabel: <span className="text-amber-200">↑ ← ↓ →</span></p>
            </div>
          </div>
        </div>
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-black p-4 font-mono text-neutral-200">
      <div className="relative w-full max-w-[800px]">
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
