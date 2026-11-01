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
      <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-black px-4 py-8 text-center text-neutral-200">
        <div>
          <h1 className="font-mono text-5xl font-bold tracking-widest text-red-600 drop-shadow-[0_0_12px_rgba(220,38,38,0.6)]">
            THE HAUNTED HOTEL
          </h1>
          <p className="mt-2 font-mono text-sm text-neutral-400">
            Naikkan lift bersama sampai lantai {TOTAL_FLOORS} (Room 1008). Wajib dimainkan berdua!
          </p>
        </div>

        <div className="w-full max-w-md rounded border border-neutral-800 bg-neutral-950 p-5 font-mono">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
            Pilih Pembagian Tugas (1 Tombol per Pemain)
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <button
              type="button"
              onClick={() => toggleRole('UP')}
              className={`rounded border-2 p-3 text-left transition ${
                p1Role === 'UP'
                  ? 'border-red-600 bg-red-950/40 text-white'
                  : 'border-neutral-800 bg-black text-neutral-400 hover:border-neutral-700'
              }`}
            >
              <p className="font-bold text-blue-400">P1: NAIK (W)</p>
              <p className="mt-1 font-bold text-yellow-400">P2: TURUN (↓)</p>
            </button>
            <button
              type="button"
              onClick={() => toggleRole('DOWN')}
              className={`rounded border-2 p-3 text-left transition ${
                p1Role === 'DOWN'
                  ? 'border-red-600 bg-red-950/40 text-white'
                  : 'border-neutral-800 bg-black text-neutral-400 hover:border-neutral-700'
              }`}
            >
              <p className="font-bold text-blue-400">P1: TURUN (S)</p>
              <p className="mt-1 font-bold text-yellow-400">P2: NAIK (↑)</p>
            </button>
          </div>
        </div>

        <div className="flex w-full max-w-md flex-col gap-3 font-mono">
          <button
            onClick={startLocal}
            autoFocus
            className="rounded border-2 border-red-700 bg-red-950/40 px-8 py-3 text-lg font-bold text-red-100 transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400"
          >
            Play Local Co-op (1 Layar)
          </button>

          <div className="mt-2 rounded border border-neutral-800 bg-neutral-950 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-400">
              Online Co-op (Supabase Realtime)
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => connectRoom(randomCode(), 'HOST')}
                className="rounded border border-amber-600 bg-amber-950/30 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-900/50"
              >
                Create Lobby (Host P1)
              </button>
              <div className="flex gap-2">
                <input
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 4))}
                  placeholder="KODE ROOM (4 HURUF)"
                  aria-label="Room Code"
                  className="flex-1 rounded border border-neutral-700 bg-black px-3 py-2 text-center text-sm uppercase tracking-widest text-white"
                />
                <button
                  onClick={() => joinInput.length === 4 && connectRoom(joinInput, 'CLIENT')}
                  disabled={joinInput.length !== 4}
                  className="rounded border border-blue-600 bg-blue-950/40 px-4 py-2 text-sm font-bold text-blue-200 disabled:opacity-40"
                >
                  Join (P2)
                </button>
              </div>
              {lobbyError && <p className="text-xs text-red-400">{lobbyError}</p>}
            </div>
          </div>
        </div>

        <div className="grid max-w-md grid-cols-2 gap-8 font-mono text-sm text-neutral-400">
          <div>
            <p className="font-bold text-blue-400">Player 1</p>
            <p>Gerak: {p1Btn}</p>
            <p>QTE: W A S D</p>
          </div>
          <div>
            <p className="font-bold text-yellow-400">Player 2</p>
            <p>Gerak: {p2Btn}</p>
            <p>QTE: ↑ ← ↓ →</p>
          </div>
        </div>
      </main>
    );
  }

  if (screen === 'LOBBY') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-4 font-mono text-neutral-200">
        <p className="text-xs uppercase tracking-widest text-neutral-400">Waiting Room</p>
        <div className="rounded border-2 border-amber-500 bg-neutral-950 px-10 py-6 text-center">
          <p className="text-xs text-neutral-400">ROOM CODE</p>
          <p className="mt-1 text-5xl font-bold tracking-[0.3em] text-amber-300">{roomCode}</p>
        </div>
        <p className="text-sm text-neutral-300">
          Players Connected: <span className="font-bold text-green-400">{playersCount}/2</span> ({mode})
        </p>
        <p className="text-xs text-neutral-400">
          Tugas: <span className="text-blue-400">P1 = {p1Role}</span> ·{' '}
          <span className="text-yellow-400">P2 = {p2Role}</span>
        </p>
        <div className="flex gap-4">
          {mode === 'HOST' ? (
            <button
              onClick={startOnline}
              disabled={playersCount < 2}
              className="rounded border-2 border-red-700 bg-red-950/50 px-6 py-3 font-bold text-white disabled:opacity-40"
            >
              {playersCount < 2 ? 'Menunggu Player 2...' : 'Start Game'}
            </button>
          ) : (
            <p className="py-3 text-sm text-amber-300">Menunggu Host memulai game...</p>
          )}
          <button
            onClick={() => {
              leaveChannel();
              setScreen('MENU');
            }}
            className="rounded border border-neutral-700 px-5 py-3 text-sm text-neutral-400 hover:bg-neutral-900"
          >
            Batal
          </button>
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
