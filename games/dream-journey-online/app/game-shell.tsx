'use client';

import Image from 'next/image';
import { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { equipmentSlotLabels, formatItemStats, getItemDefinition, itemCatalog, rarityMeta, type ItemSlot } from '@/game/item-catalog';

type HeroId = 'vanguard' | 'sage' | 'guardian' | 'ranger';
type SkillId = 'staff-sweep' | 'sky-breaker' | 'blazing-rush';
type EnemyType = 'mountain-scout' | 'stone-brute' | 'ember-shaman' | 'cloud-horn-king';
type RoomMode = 'create' | 'join';
type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'error';

type PlayerState = {
  id: string;
  slot: number;
  name: string;
  hero: HeroId;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  inventory: Array<{ itemId: string; quantity: number }>;
  equipment: { weapon: string | null; armor: string | null; trinket: string | null };
  combatStats: { attack: number; defense: number; crit: number };
  onGround: boolean;
  attacking: boolean;
  attackTimer: number;
  attackDuration: number;
  attackImpactAt: number;
  attackStart: number;
  attackReach: number;
  comboStep: number;
  hitStun: number;
  invulnerable: number;
  skill: SkillId | null;
  skillTimer: number;
  skillDuration: number;
  skillCooldowns: Record<SkillId, number>;
  respawnTimer: number;
};

type EnemyState = {
  id: string;
  type: EnemyType;
  name: string;
  x: number;
  y: number;
  vx: number;
  facing: number;
  hp: number;
  maxHp: number;
  scale: number;
  elite: boolean;
  boss: boolean;
  ranged: boolean;
  attacking: boolean;
  attackTimer: number;
  hitStun: number;
  dead: boolean;
  deathTimer: number;
  respawnTimer: number;
};

type RoomState = {
  roomCode: string;
  serverTick: number;
  sentAt: number;
  paused: boolean;
  pausedBy: Array<{ id: string; name: string }>;
  stage: { state: 'waiting' | 'active' | 'intermission' | 'victory'; wave: number; maxWaves: number; waveName: string; intermission: number; remainingEnemies: number; defeated: number };
  players: PlayerState[];
  enemies: EnemyState[];
  projectiles: Array<{ id: string; x: number; y: number; radius: number; color: string; boss: boolean }>;
  combatEffects: Array<{ id: string; type: 'damage-player' | 'damage-enemy' | 'impact' | 'victory'; x: number; y: number; value: number; color: string; critical: boolean; life: number }>;
  drops: Array<{ id: string; itemId: string; x: number; y: number; quantity: number }>;
};

type InputState = { left: boolean; right: boolean; jump: boolean; attack: boolean };

const heroes: Array<{ id: HeroId; name: string; mark: string; color: string; detail: string }> = [
  { id: 'vanguard', name: '斗战者', mark: '斗', color: '#d85a34', detail: '近战 · 爆发' },
  { id: 'sage', name: '玄法师', mark: '玄', color: '#4f8f9d', detail: '远程 · 控场' },
  { id: 'guardian', name: '镇岳者', mark: '岳', color: '#b28a3f', detail: '防御 · 反击' },
  { id: 'ranger', name: '流云客', mark: '云', color: '#6b78b8', detail: '机动 · 连击' },
];

const emptyInput: InputState = { left: false, right: false, jump: false, attack: false };
const profileStorageKey = 'dream-journey-profile-v1';
const skills: Array<{ id: SkillId; key: string; name: string; cost: number; detail: string }> = [
  { id: 'staff-sweep', key: 'U', name: '横扫千军', cost: 12, detail: '大范围击退' },
  { id: 'sky-breaker', key: 'O', name: '破空一击', cost: 20, detail: '重击破阵' },
  { id: 'blazing-rush', key: 'P', name: '烈焰突进', cost: 28, detail: '突进爆发' },
];

export default function GameShell() {
  const [selectedHero, setSelectedHero] = useState<HeroId>('vanguard');
  const [roomMode, setRoomMode] = useState<RoomMode>('create');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [playerName, setPlayerName] = useState('旅人');
  const [roomPassword, setRoomPassword] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [notice, setNotice] = useState('启动联机服务器后即可创建真实房间');
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<InputState>({ ...emptyInput });
  const inputSequenceRef = useRef(0);
  const profileFingerprintRef = useRef('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const heardEffectsRef = useRef(new Set<string>());

  const unlockAudio = useCallback(() => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    if (audioContextRef.current.state === 'suspended') void audioContextRef.current.resume();
  }, []);

  const sendInput = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    inputSequenceRef.current += 1;
    socket.send(JSON.stringify({
      type: 'input',
      sequence: inputSequenceRef.current,
      ...inputRef.current,
    }));
  }, []);

  const updateInput = useCallback((key: keyof InputState, pressed: boolean) => {
    if (pressed && roomState?.paused) return;
    if (inputRef.current[key] === pressed) return;
    if (pressed) unlockAudio();
    inputRef.current = { ...inputRef.current, [key]: pressed };
    sendInput();
  }, [roomState?.paused, sendInput, unlockAudio]);

  const castSkill = useCallback((skillId: SkillId) => {
    if (roomState?.paused) return;
    unlockAudio();
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'cast_skill', skillId }));
  }, [roomState?.paused, unlockAudio]);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    inputRef.current = { ...emptyInput };
    setStatus('idle');
    setRoomCode('');
    setPlayerId('');
    setRoomState(null);
    setLatency(null);
    setEvents([]);
    setInventoryOpen(false);
    setPauseMenuOpen(false);
    setNotice('已离开房间');
  }, []);

  useEffect(() => () => socketRef.current?.close(), []);

  const pauseRequested = inventoryOpen || pauseMenuOpen;

  useEffect(() => {
    if (!roomCode) return;
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'set_pause', paused: pauseRequested }));
  }, [pauseRequested, roomCode]);

  useEffect(() => {
    if (!roomState?.paused) return;
    inputRef.current = { ...emptyInput };
    sendInput();
  }, [roomState?.paused, sendInput]);

  useEffect(() => {
    if (!roomCode) return;

    const keyMap: Record<string, keyof InputState | undefined> = {
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      KeyK: 'jump',
      Space: 'jump',
      KeyJ: 'attack',
    };

    function handleKey(event: KeyboardEvent, pressed: boolean) {
      if (event.code === 'KeyI' && pressed && !event.repeat) {
        event.preventDefault();
        setInventoryOpen((open) => {
          const next = !open;
          if (next) setPauseMenuOpen(false);
          return next;
        });
        return;
      }
      if (event.code === 'Escape' && pressed && !event.repeat) {
        event.preventDefault();
        if (inventoryOpen) setInventoryOpen(false);
        else setPauseMenuOpen((open) => !open);
        return;
      }
      const skillIndex = ['KeyU', 'KeyO', 'KeyP'].indexOf(event.code);
      if (skillIndex >= 0 && pressed && !event.repeat) {
        event.preventDefault();
        castSkill(skills[skillIndex].id);
        return;
      }
      const inputKey = keyMap[event.code];
      if (!inputKey) return;
      event.preventDefault();
      updateInput(inputKey, pressed);
    }

    const onKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => handleKey(event, false);
    const onBlur = () => {
      inputRef.current = { ...emptyInput };
      sendInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [castSkill, inventoryOpen, roomCode, sendInput, updateInput]);

  useEffect(() => {
    if (status !== 'online') return;
    const timer = window.setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', at: Date.now() }));
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!playerId || !roomState) return;
    const player = roomState.players.find((item) => item.id === playerId);
    if (!player) return;
    const profile = JSON.stringify({
      inventory: player.inventory,
      equipment: player.equipment,
    });
    if (profile === profileFingerprintRef.current) return;
    profileFingerprintRef.current = profile;
    window.localStorage.setItem(profileStorageKey, profile);
  }, [playerId, roomState]);

  useEffect(() => {
    if (!roomState) return;
    const heard = heardEffectsRef.current;
    for (const effect of roomState.combatEffects || []) {
      if (heard.has(effect.id)) continue;
      heard.add(effect.id);
      playCombatTone(audioContextRef.current, effect.type, effect.critical);
    }
    if (heard.size > 240) heardEffectsRef.current = new Set((roomState.combatEffects || []).map((effect) => effect.id));
  }, [roomState]);

  function connectToRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'connecting') return;

    const requestedRoom = cleanRoomCode(roomCodeInput);
    if (roomMode === 'join' && requestedRoom.length !== 6) {
      setStatus('error');
      setNotice('请输入六位房间码');
      return;
    }
    if (roomPassword.trim().length < 4) {
      setStatus('error');
      setNotice('房间口令至少需要四个字符');
      return;
    }

    socketRef.current?.close();
    setStatus('connecting');
    setNotice('正在连接联机服务器…');
    const socket = new WebSocket(getGameServerUrl());
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        type: roomMode === 'create' ? 'create_room' : 'join_room',
        roomCode: requestedRoom,
        name: playerName,
        hero: selectedHero,
        password: roomPassword,
        profile: loadPlayerProfile(),
      }));
    });

    socket.addEventListener('message', (messageEvent) => {
      const message = JSON.parse(String(messageEvent.data));
      if (message.type === 'joined') {
        setStatus('online');
        setRoomCode(message.roomCode);
        setPlayerId(message.playerId);
        setRoomState(message.state);
        setNotice('已进入队伍，复制邀请信息发给朋友');
        return;
      }
      if (message.type === 'state') {
        setRoomState(message.state);
        return;
      }
      if (message.type === 'system') {
        setEvents((current) => [message.message, ...current].slice(0, 4));
        return;
      }
      if (message.type === 'pong') {
        setLatency(Math.max(0, Date.now() - Number(message.echo || Date.now())));
        return;
      }
      if (message.type === 'error') {
        if (String(message.code || '').startsWith('ITEM_') || String(message.code || '').startsWith('SKILL_')) {
          setNotice(message.message || '道具操作失败');
          return;
        }
        setStatus('error');
        setNotice(message.message || '服务器拒绝了请求');
      }
    });

    socket.addEventListener('error', () => {
      setStatus('error');
      setNotice('无法连接联机服务器，请先运行 npm run dev:all');
    });

    socket.addEventListener('close', () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      setStatus((current) => current === 'error' ? current : 'idle');
      setRoomCode('');
      setPlayerId('');
      setRoomState(null);
      setInventoryOpen(false);
      setPauseMenuOpen(false);
    });
  }

  async function copyRoomCode() {
    await navigator.clipboard.writeText(`房间码：${roomCode}\n房间口令：${roomPassword}`);
    setNotice('房间码和口令已复制');
  }

  function sendItemAction(type: 'equip_item' | 'use_item', itemId: string) {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type, itemId }));
  }

  function restartStage() {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'restart_stage' }));
  }

  const currentHero = heroes.find((hero) => hero.id === selectedHero) ?? heroes[0];
  const players = roomState?.players ?? [];
  const currentPlayer = players.find((player) => player.id === playerId);
  const localPauseOwner = roomState?.pausedBy?.some((entry) => entry.id === playerId) === true;

  return (
    <main className="app-shell">
      <div className="cloud cloud-one" aria-hidden="true" />
      <div className="cloud cloud-two" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-seal">梦</span>
          <div>
            <p className="eyebrow">FOUR-PLAYER ONLINE PROTOTYPE</p>
            <h1>西行战记</h1>
          </div>
        </div>
        <div className={`server-pill ${status}`}>
          <span /> {status === 'online' ? `联机正常${latency === null ? '' : ` · ${latency}ms`}` : status === 'connecting' ? '正在连接' : '本地框架服'}
        </div>
      </header>

      {roomCode && roomState ? (
        <section className="game-layout">
          <aside className="party-panel parchment">
            <p className="chapter">远程小队</p>
            <div className="room-code-block">
              <span>房间码</span>
              <strong>{roomCode}</strong>
              <button onClick={copyRoomCode}>复制邀请</button>
            </div>

            <div className="party-roster">
              {[0, 1, 2, 3].map((slot) => {
                const player = players.find((item) => item.slot === slot);
                const hero = heroes.find((item) => item.id === player?.hero);
                return player ? (
                  <div className={player.id === playerId ? 'party-member me' : 'party-member'} key={slot}>
                    <HeroPortrait hero={player.hero} />
                    <div><strong>{player.name}</strong><small>{hero?.name} {player.id === playerId ? '· 你' : ''}</small><i><b style={{ width: `${100 * player.hp / player.maxHp}%` }} /></i></div>
                  </div>
                ) : (
                  <div className="party-member empty" key={slot}><span>＋</span><div><strong>等待玩家</strong><small>分享房间码和口令</small></div></div>
                );
              })}
            </div>

            <div className="event-feed" aria-live="polite">
              <b>队伍动态</b>
              {events.length ? events.map((item, index) => <p key={`${item}-${index}`}>◆ {item}</p>) : <p>◆ 房间已建立</p>}
            </div>
            <button className="leave-button" onClick={disconnect}>离开房间</button>
          </aside>

          <div className="arena-wrap">
            <div className="arena-heading">
              <div><p>第一章 · 完整试玩关</p><h2>云栈古道</h2></div>
              <div className="arena-actions"><span>{players.length} / 4 名玩家</span><button className={`pause-button${localPauseOwner ? ' active' : ''}`} disabled={roomState.paused && !localPauseOwner} onClick={() => { setInventoryOpen(false); setPauseMenuOpen((open) => !open); }}>{localPauseOwner ? '继续' : roomState.paused ? '等待' : '暂停'} <kbd>Esc</kbd></button><button className="inventory-button" onClick={() => { setPauseMenuOpen(false); setInventoryOpen(true); }}>行囊 <kbd>I</kbd></button></div>
            </div>
            <StageTracker stage={roomState.stage} paused={roomState.paused} />
            <div className="canvas-stage">
              <GameCanvas state={roomState} playerId={playerId} />
              {roomState.paused && !inventoryOpen && (
                <div className="pause-overlay" role="status">
                  <p>GAME PAUSED</p>
                  <h3>游戏暂停</h3>
                  <span>{roomState.pausedBy.map((entry) => entry.name).join('、')} 正在暂停</span>
                  {localPauseOwner ? <button onClick={() => setPauseMenuOpen(false)}>继续游戏</button> : <small>等待暂停者继续游戏</small>}
                </div>
              )}
              {roomState.stage.state === 'victory' && (
                <div className="victory-overlay">
                  <p>CHAPTER CLEAR</p>
                  <h3>云栈古道 · 平定</h3>
                  <span>曜火战棍、养元露与山妖残晶已放入全队行囊</span>
                  <button onClick={restartStage}>重新挑战</button>
                </div>
              )}
            </div>
            {currentPlayer && <SkillBar player={currentPlayer} onCast={castSkill} paused={roomState.paused} />}
            {currentPlayer && (
              <div className="player-stat-strip">
                <span>生命 <b>{currentPlayer.hp}/{currentPlayer.maxHp}</b></span>
                <span>法力 <b>{currentPlayer.mp}/{currentPlayer.maxMp}</b></span>
                <span>攻击 <b>+{currentPlayer.combatStats.attack}</b></span>
                <span>防御 <b>+{currentPlayer.combatStats.defense}</b></span>
                <span>暴击 <b>{currentPlayer.combatStats.crit}%</b></span>
              </div>
            )}
            <div className="game-controls desktop-controls"><kbd>A</kbd><kbd>D</kbd> 移动 <kbd>K</kbd> 跳跃 <kbd>J</kbd> 三段连击 <kbd>U</kbd><kbd>O</kbd><kbd>P</kbd> 技能 <kbd>I</kbd> 行囊 <kbd>Esc</kbd> 暂停</div>
            <TouchControls updateInput={updateInput} paused={roomState.paused} />
          </div>
          {inventoryOpen && currentPlayer && (
            <InventoryPanel player={currentPlayer} onClose={() => setInventoryOpen(false)} onAction={sendItemAction} />
          )}
        </section>
      ) : (
        <section className="hero-grid">
          <div className="lobby-panel parchment">
            <div className="panel-heading">
              <div><p className="chapter">第一章 · 云栈古道</p><h2>集结你的取经小队</h2></div>
              <span className="party-count">0 / 4</span>
            </div>
            <p className="lead">创建房间后把六位房间码和口令发给朋友，四人可从不同地区进入同一关卡。</p>

            <div className="mode-tabs" role="tablist" aria-label="房间方式">
              <button className={roomMode === 'create' ? 'active' : ''} onClick={() => setRoomMode('create')} role="tab">创建房间</button>
              <button className={roomMode === 'join' ? 'active' : ''} onClick={() => setRoomMode('join')} role="tab">加入房间</button>
            </div>

            <form onSubmit={connectToRoom}>
              <label className="room-field"><span>玩家名称</span><input value={playerName} onChange={(event) => setPlayerName(event.target.value.slice(0, 12))} placeholder="你的名字" autoComplete="nickname" /></label>
              {roomMode === 'join' && (
                <label className="room-field"><span>房间码</span><input maxLength={6} value={roomCodeInput} onChange={(event) => setRoomCodeInput(cleanRoomCode(event.target.value))} placeholder="例如 X7K9QP" autoComplete="off" /></label>
              )}
              <label className="room-field"><span>房间口令</span><input type="password" minLength={4} maxLength={24} value={roomPassword} onChange={(event) => setRoomPassword(event.target.value.slice(0, 24))} placeholder="至少 4 个字符，只发给朋友" autoComplete={roomMode === 'create' ? 'new-password' : 'current-password'} /></label>

              <fieldset>
                <legend>选择流派</legend>
                <div className="hero-picker">
                  {heroes.map((hero) => (
                    <button type="button" key={hero.id} className={selectedHero === hero.id ? 'hero-card selected' : 'hero-card'} onClick={() => setSelectedHero(hero.id)} aria-pressed={selectedHero === hero.id}>
                      <HeroPortrait hero={hero.id} />
                      <span><strong>{hero.name}</strong><small>{hero.detail}</small></span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <button className="primary-action" type="submit" disabled={status === 'connecting'}>
                {status === 'connecting' ? '连接中…' : roomMode === 'create' ? '创建四人房间' : '加入远程队伍'}
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className={`notice ${status}`} aria-live="polite"><span>◆</span>{notice}</p>
          </div>

          <div className="stage-panel" aria-label="云栈古道关卡预览">
            <div className="moon" aria-hidden="true" />
            <div className="mountain mountain-back" aria-hidden="true" />
            <div className="mountain mountain-front" aria-hidden="true" />
            <div className="stage-copy"><p>当前关卡</p><h2>云栈古道</h2><span>推荐等级 1 · 小队上限 4</span></div>
            <div className="platform platform-a" aria-hidden="true" />
            <div className="platform platform-b" aria-hidden="true" />
            <div className="player-preview" style={{ background: currentHero.color }} aria-hidden="true"><HeroPortrait hero={currentHero.id} className="preview-face" /><span className="weapon" /></div>
            <div className="enemy-preview" aria-hidden="true" />
            <div className="stage-hud"><div><HeroPortrait hero={currentHero.id} className="avatar-mini" /><div><b>{playerName || '旅人'}</b><span className="health"><i /></span></div></div><div className="controls"><kbd>A</kbd><kbd>D</kbd> 移动 <kbd>J</kbd> 攻击 <kbd>K</kbd> 跳跃</div></div>
          </div>
        </section>
      )}

      <section className="feature-strip" aria-label="版本特性">
        <div><span>01</span><strong>四人房间</strong><p>短码邀请，满员自动锁定</p></div>
        <div><span>02</span><strong>服务端同步</strong><p>位置、伤害与怪物统一判定</p></div>
        <div><span>03</span><strong>横版战斗</strong><p>移动、跳跃、攻击与复活循环</p></div>
      </section>
    </main>
  );
}

function StageTracker({ stage, paused }: { stage: RoomState['stage']; paused: boolean }) {
  const status = paused
    ? '游戏已暂停'
    : stage.state === 'victory'
    ? '关卡完成'
    : stage.state === 'intermission'
      ? `下一波 ${stage.intermission.toFixed(1)} 秒`
      : `剩余妖怪 ${stage.remainingEnemies}`;
  return (
    <div className={`stage-tracker state-${stage.state}`} aria-label="关卡进度">
      <div><span>第 {stage.wave || 1} / {stage.maxWaves} 波</span><strong>{stage.waveName || '巡山妖兵'}</strong><small>{status}</small></div>
      <ol>{Array.from({ length: stage.maxWaves }, (_, index) => <li className={index + 1 < stage.wave || stage.state === 'victory' ? 'cleared' : index + 1 === stage.wave ? 'current' : ''} key={index}><i /></li>)}</ol>
    </div>
  );
}

function SkillBar({ player, onCast, paused }: { player: PlayerState; onCast: (skillId: SkillId) => void; paused: boolean }) {
  const supported = player.hero === 'vanguard';
  return (
    <div className="skill-bar" aria-label="斗战技能">
      <div className="combo-readout"><small>连击</small><b>{player.comboStep || 1}<i>/3</i></b></div>
      {skills.map((skill) => {
        const cooldown = player.skillCooldowns?.[skill.id] || 0;
        const disabled = paused || !supported || cooldown > 0 || player.mp < skill.cost || player.respawnTimer > 0;
        return (
          <button key={skill.id} className={player.skill === skill.id ? 'active' : ''} disabled={disabled} onClick={() => onCast(skill.id)} title={supported ? `${skill.detail} · 消耗 ${skill.cost} 法力` : '该流派技能仍在制作'}>
            <kbd>{skill.key}</kbd><span><strong>{skill.name}</strong><small>{supported ? `${skill.detail} · ${skill.cost} 法力` : '斗战者专属'}</small></span>
            {cooldown > 0 && <b className="skill-cooldown">{cooldown.toFixed(1)}</b>}
          </button>
        );
      })}
    </div>
  );
}

function InventoryPanel({
  player,
  onClose,
  onAction,
}: {
  player: PlayerState;
  onClose: () => void;
  onAction: (type: 'equip_item' | 'use_item', itemId: string) => void;
}) {
  const quantities = new Map(player.inventory.map((entry) => [entry.itemId, entry.quantity]));
  const equipmentSlots: Array<Extract<ItemSlot, 'weapon' | 'armor' | 'trinket'>> = ['weapon', 'armor', 'trinket'];
  const ownedKinds = player.inventory.filter((entry) => entry.quantity > 0).length;

  return (
    <div className="inventory-overlay" role="presentation" onMouseDown={onClose}>
      <section className="inventory-panel parchment" role="dialog" aria-modal="true" aria-label="行囊与装备" onMouseDown={(event) => event.stopPropagation()}>
        <div className="inventory-heading">
          <div><p className="chapter">旅人行囊</p><h2>装备与道具</h2><span className="inventory-pause-note">游戏已暂停</span></div>
          <button className="inventory-close" onClick={onClose} aria-label="关闭行囊">×</button>
        </div>

        <div className="equipment-layout">
          <div className="equipment-slots">
            {equipmentSlots.map((slot) => {
              const equipped = getItemDefinition(player.equipment[slot]);
              return (
                <div className="equipment-slot" key={slot}>
                  <span className="equipment-slot-label">{equipmentSlotLabels[slot]}</span>
                  {equipped ? (
                    <><ItemMark itemId={equipped.id} /><div><strong>{equipped.name}</strong><small>{formatItemStats(equipped.stats).join(' · ')}</small></div></>
                  ) : (
                    <div className="empty-equipment"><strong>尚未装备</strong><small>从行囊中选择</small></div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="combat-summary">
            <span><small>生命上限</small><b>{player.maxHp}</b></span>
            <span><small>法力上限</small><b>{player.maxMp}</b></span>
            <span><small>额外攻击</small><b>+{player.combatStats.attack}</b></span>
            <span><small>伤害减免</small><b>+{player.combatStats.defense}</b></span>
            <span><small>暴击率</small><b>{player.combatStats.crit}%</b></span>
          </div>
        </div>

        <div className="inventory-subheading"><div><strong>云栈道具图鉴</strong><small>靠近战利品会自动拾取，进度自动保存</small></div><span>{ownedKinds} / {itemCatalog.length}</span></div>
        <div className="item-grid">
          {itemCatalog.map((item) => {
            const quantity = quantities.get(item.id) || 0;
            const equipped = equippedItemIds(player).has(item.id);
            const stats = formatItemStats(item.stats);
            const effects = [item.effect?.health ? `恢复生命 ${item.effect.health}` : '', item.effect?.mana ? `恢复法力 ${item.effect.mana}` : ''].filter(Boolean);
            const actionable = quantity > 0 && item.slot !== 'material';
            return (
              <article className={`item-card rarity-${item.rarity}${quantity ? '' : ' locked'}`} key={item.id} style={{ '--item-color': rarityMeta[item.rarity].color } as CSSProperties}>
                <div className="item-card-top"><ItemMark itemId={item.id} /><div><strong>{item.name}</strong><small style={{ color: rarityMeta[item.rarity].color }}>{rarityMeta[item.rarity].name} · {item.slot === 'material' ? '材料' : item.slot === 'consumable' ? '消耗品' : equipmentSlotLabels[item.slot]}</small></div><b className="item-quantity">{quantity ? `×${quantity}` : '未获得'}</b></div>
                <p className="item-description">{item.description}</p>
                <div className="item-stats">{[...stats, ...effects].map((stat) => <span key={stat}>{stat}</span>)}</div>
                <button disabled={!actionable || equipped} onClick={() => onAction(item.slot === 'consumable' ? 'use_item' : 'equip_item', item.id)}>
                  {equipped ? '已装备' : quantity === 0 ? '尚未获得' : item.slot === 'consumable' ? '使用' : item.slot === 'material' ? '锻造材料' : '装备'}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function equippedItemIds(player: PlayerState) {
  return new Set(Object.values(player.equipment).filter(Boolean));
}

function HeroPortrait({ hero, className = '' }: { hero: HeroId; className?: string }) {
  return <span className={`hero-portrait hero-portrait-${hero} ${className}`} aria-hidden="true" />;
}

function ItemMark({ itemId }: { itemId: string }) {
  const item = getItemDefinition(itemId);
  if (!item) return <span className="item-mark">?</span>;
  return <span className="item-mark" style={{ '--item-color': rarityMeta[item.rarity].color } as CSSProperties}><Image src={item.icon} alt="" width={42} height={42} /></span>;
}

function GameCanvas({ state, playerId }: { state: RoomState; playerId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let animationFrame = 0;

    function render() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const shaking = (stateRef.current.combatEffects || []).some((effect) => effect.type === 'impact' && effect.life > 0.88);
      const shakeX = shaking ? (Math.random() - 0.5) * 10 : 0;
      const shakeY = shaking ? (Math.random() - 0.5) * 7 : 0;
      context.setTransform(width / 1200, 0, 0, height / 520, shakeX, shakeY);
      drawStage(context);
      drawBossHud(context, stateRef.current.enemies);
      for (const drop of stateRef.current.drops) drawGroundDrop(context, drop);
      for (const enemy of stateRef.current.enemies) drawEnemy(context, enemy);
      for (const projectile of stateRef.current.projectiles || []) drawProjectile(context, projectile);
      for (const player of stateRef.current.players) drawPlayer(context, player, player.id === playerId);
      for (const effect of stateRef.current.combatEffects || []) drawCombatEffect(context, effect);
      animationFrame = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [playerId]);

  return <canvas className="game-canvas" ref={canvasRef} aria-label="四人联机战斗场景" />;
}

function drawStage(context: CanvasRenderingContext2D) {
  const stageImage = getGameImage('/assets/stages/cloud-road-background.png');
  if (stageImage) {
    context.drawImage(stageImage, 0, 0, stageImage.naturalWidth, stageImage.naturalHeight, 0, 0, 1200, 520);
    const atmosphere = context.createLinearGradient(0, 0, 0, 520);
    atmosphere.addColorStop(0, 'rgba(25,41,45,.04)');
    atmosphere.addColorStop(.72, 'rgba(18,28,25,.12)');
    atmosphere.addColorStop(1, 'rgba(10,16,13,.62)');
    context.fillStyle = atmosphere;
    context.fillRect(0, 0, 1200, 520);
  } else {
    const sky = context.createLinearGradient(0, 0, 0, 520);
    sky.addColorStop(0, '#d9ca9d');
    sky.addColorStop(.58, '#8c7858');
    sky.addColorStop(1, '#2d342b');
    context.fillStyle = sky;
    context.fillRect(0, 0, 1200, 520);
  }

  context.fillStyle = 'rgba(38,48,39,.94)';
  context.fillRect(0, 440, 1200, 80);
  context.fillStyle = '#7e9368';
  context.fillRect(0, 440, 1200, 9);
  context.fillStyle = 'rgba(18,22,18,.22)';
  for (let x = 20; x < 1200; x += 78) context.fillRect(x, 474 + (x % 3) * 5, 42, 5);
}

function drawPlayer(context: CanvasRenderingContext2D, player: PlayerState, isCurrent: boolean) {
  const vanguardSheet = player.hero === 'vanguard' ? getTransparentSpriteSheet('/assets/characters/vanguard-sprite-sheet.png') : null;
  context.save();
  context.translate(player.x, player.y);
  if (isCurrent) {
    context.strokeStyle = '#f7e7aa';
    context.lineWidth = 4;
    context.beginPath();
    context.ellipse(0, 4, 35, 10, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.scale(player.facing, 1);
  if (player.skill) drawPlayerSkillEffect(context, player);
  if (player.attacking && player.attackTimer <= player.attackImpactAt) drawPlayerAttackEffect(context, player);
  if (vanguardSheet) {
    if (player.invulnerable > 0 && Math.floor(performance.now() / 70) % 2 === 0) context.globalAlpha = 0.45;
    drawSpriteFrame(context, vanguardSheet, playerAnimationFrame(player), -88, -220, 176, 235);
  } else {
    context.fillStyle = player.color;
    context.strokeStyle = '#2d231b';
    context.lineWidth = 4;
    context.beginPath();
    context.roundRect(-22, -62, 44, 64, 16);
    context.fill();
    context.stroke();
    const avatarSheet = getGameImage('/assets/ui/hero-avatars.png');
    if (avatarSheet) {
      const heroIndex = ['vanguard', 'sage', 'guardian', 'ranger'].indexOf(player.hero);
      const sourceX = (heroIndex % 2) * 128;
      const sourceY = Math.floor(heroIndex / 2) * 128;
      context.save();
      context.translate(0, -80);
      if (heroIndex === 0 || heroIndex === 2) context.rotate(-Math.PI / 2);
      context.drawImage(avatarSheet, sourceX, sourceY, 128, 128, -27, -27, 54, 54);
      context.restore();
    }
    context.strokeStyle = '#d7ad50';
    context.lineWidth = 7;
    context.beginPath();
    const reach = player.hero === 'sage' ? 72 : 55;
    context.moveTo(12, -45);
    context.lineTo(player.attacking ? reach + 34 : reach, player.attacking ? -54 : -34);
    context.stroke();
  }
  context.restore();

  const labelY = player.hero === 'vanguard' ? player.y - 198 : player.y - 112;
  context.textAlign = 'center';
  context.font = '700 14px sans-serif';
  context.fillStyle = '#fff0c8';
  context.fillText(player.respawnTimer > 0 ? `复活 ${player.respawnTimer.toFixed(1)}` : player.name, player.x, labelY);
  if (player.respawnTimer > 0) return;
  context.fillStyle = 'rgba(35,28,22,.75)';
  context.fillRect(player.x - 34, labelY + 9, 68, 7);
  context.fillStyle = player.hp > 30 ? '#c74d34' : '#e1a43a';
  context.fillRect(player.x - 34, labelY + 9, 68 * player.hp / player.maxHp, 7);
  context.fillStyle = 'rgba(35,28,22,.75)';
  context.fillRect(player.x - 34, labelY + 20, 68, 5);
  context.fillStyle = '#4d88b8';
  context.fillRect(player.x - 34, labelY + 20, 68 * player.mp / player.maxMp, 5);
}

function playerAnimationFrame(player: PlayerState) {
  if (player.respawnTimer > 0) return 7;
  if (player.hitStun > 0) return 6;
  if (player.skill) return player.skillTimer > player.skillDuration * 0.55 ? 4 : 5;
  if (player.attacking) return player.attackTimer > player.attackImpactAt ? 4 : 5;
  if (!player.onGround) return 3;
  if (Math.abs(player.vx) > 28) return Math.floor(performance.now() / 120) % 2 ? 1 : 2;
  return 0;
}

function drawPlayerAttackEffect(context: CanvasRenderingContext2D, player: PlayerState) {
  const reach = Math.max(player.attackStart + 24, player.attackReach);
  const progress = player.attackImpactAt > 0 ? 1 - player.attackTimer / player.attackImpactAt : 1;
  context.save();
  context.strokeStyle = `rgba(255,196,62,${0.66 - progress * 0.26})`;
  context.shadowColor = '#ff9d26';
  context.shadowBlur = 16;
  context.lineWidth = player.comboStep === 3 ? 12 : 8;
  context.beginPath();
  context.arc(8, -78, reach - 12, -0.78, 0.54);
  context.stroke();
  context.restore();
}

function drawPlayerSkillEffect(context: CanvasRenderingContext2D, player: PlayerState) {
  const progress = player.skillDuration > 0 ? 1 - player.skillTimer / player.skillDuration : 0;
  context.save();
  if (player.skill === 'blazing-rush') {
    const trail = context.createLinearGradient(-150, -70, 20, -70);
    trail.addColorStop(0, 'rgba(255,80,18,0)');
    trail.addColorStop(1, `rgba(255,190,42,${0.55 - progress * 0.2})`);
    context.fillStyle = trail;
    context.beginPath();
    context.moveTo(-160, -94);
    context.lineTo(10, -125);
    context.lineTo(10, -30);
    context.lineTo(-160, -48);
    context.closePath();
    context.fill();
  } else {
    context.strokeStyle = player.skill === 'sky-breaker' ? 'rgba(255,229,113,.78)' : 'rgba(255,143,45,.72)';
    context.lineWidth = player.skill === 'sky-breaker' ? 12 : 8;
    context.beginPath();
    context.arc(20, -80, 55 + progress * 80, -1.25, 0.8);
    context.stroke();
  }
  context.restore();
}

function drawGroundDrop(context: CanvasRenderingContext2D, drop: RoomState['drops'][number]) {
  const item = getItemDefinition(drop.itemId);
  if (!item) return;
  const color = rarityMeta[item.rarity].color;
  const bob = Math.sin(performance.now() / 260 + drop.x) * 5;
  context.save();
  context.translate(drop.x, drop.y + bob);
  context.shadowColor = color;
  context.shadowBlur = item.rarity === 'legendary' ? 28 : 16;
  context.fillStyle = 'rgba(31,28,23,.9)';
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(-17, -31, 34, 34, 9);
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  const itemIcon = getGameImage(item.icon);
  if (itemIcon) {
    context.drawImage(itemIcon, -16, -30, 32, 32);
  } else {
    context.fillStyle = '#fff0c8';
    context.font = '900 15px sans-serif';
    context.textAlign = 'center';
    context.fillText(item.mark, 0, -9);
  }
  if (drop.quantity > 1) {
    context.font = '700 10px sans-serif';
    context.fillText(`×${drop.quantity}`, 22, 4);
  }
  context.restore();
}

function drawEnemy(context: CanvasRenderingContext2D, enemy: EnemyState) {
  const spritePaths: Record<EnemyType, string> = {
    'mountain-scout': '/assets/enemies/mountain-scout-sprite-sheet.png',
    'stone-brute': '/assets/enemies/stone-brute-sprite-sheet.png',
    'ember-shaman': '/assets/enemies/ember-shaman-sprite-sheet.png',
    'cloud-horn-king': '/assets/enemies/cloud-horn-king-sprite-sheet.png',
  };
  const enemySheet = getTransparentSpriteSheet(spritePaths[enemy.type] || spritePaths['mountain-scout']);
  const drawWidth = 190 * enemy.scale;
  const drawHeight = 253 * enemy.scale;
  context.save();
  context.translate(enemy.x, enemy.y);
  if (enemy.elite || enemy.boss) {
    context.strokeStyle = enemy.boss ? 'rgba(255,90,38,.72)' : 'rgba(255,205,75,.68)';
    context.lineWidth = enemy.boss ? 8 : 5;
    context.shadowColor = enemy.boss ? '#ff4f22' : '#ffd34f';
    context.shadowBlur = enemy.boss ? 26 : 18;
    context.beginPath();
    context.ellipse(0, 4, drawWidth * 0.34, 13 * enemy.scale, 0, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
  }
  context.scale(-enemy.facing, 1);
  if (enemySheet) {
    context.globalAlpha = enemy.dead ? Math.max(0.35, enemy.deathTimer) : 1;
    const frame = enemyAnimationFrame(enemy);
    const bossRightTrim = enemy.boss ? ([0, 0, 0.09, 0, 0.12, 0, 0.18, 0][frame] || 0) : 0;
    drawSpriteFrame(context, enemySheet, frame, -drawWidth / 2, -drawHeight + 12, drawWidth, drawHeight, bossRightTrim);
  } else {
    context.fillStyle = '#4e6753';
    context.strokeStyle = '#263329';
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(-34, -68, 68, 70, 24);
    context.fill();
    context.stroke();
  }
  context.restore();
  if (enemy.dead || enemy.boss) return;
  const labelY = enemy.y - Math.min(340, 215 * enemy.scale);
  const barWidth = enemy.boss ? 260 : enemy.elite ? 142 : 104;
  context.fillStyle = 'rgba(35,28,22,.75)';
  context.fillRect(enemy.x - barWidth / 2, labelY + 9, barWidth, enemy.boss ? 13 : 9);
  context.fillStyle = enemy.boss ? '#e14e25' : enemy.elite ? '#d59b31' : '#bd4533';
  context.fillRect(enemy.x - barWidth / 2, labelY + 9, barWidth * enemy.hp / enemy.maxHp, enemy.boss ? 13 : 9);
  context.fillStyle = enemy.boss ? '#ffd97b' : '#f6e7bb';
  context.font = enemy.boss ? '900 17px sans-serif' : '700 13px sans-serif';
  context.textAlign = 'center';
  context.fillText(enemy.name, enemy.x, labelY);
}

function drawBossHud(context: CanvasRenderingContext2D, enemies: EnemyState[]) {
  const boss = enemies.find((enemy) => enemy.boss && !enemy.dead);
  if (!boss) return;
  const barWidth = 470;
  const barX = (1200 - barWidth) / 2;
  context.save();
  context.fillStyle = 'rgba(18,15,13,.88)';
  context.strokeStyle = 'rgba(240,190,87,.76)';
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(barX - 12, 17, barWidth + 24, 48, 10);
  context.fill();
  context.stroke();
  context.textAlign = 'center';
  context.font = '900 15px sans-serif';
  context.fillStyle = '#ffe09a';
  context.fillText(boss.name, 600, 36);
  context.fillStyle = 'rgba(60,27,23,.95)';
  context.fillRect(barX, 45, barWidth, 10);
  const healthGradient = context.createLinearGradient(barX, 0, barX + barWidth, 0);
  healthGradient.addColorStop(0, '#b72f22');
  healthGradient.addColorStop(1, '#f08334');
  context.fillStyle = healthGradient;
  context.fillRect(barX, 45, barWidth * boss.hp / boss.maxHp, 10);
  context.restore();
}

function enemyAnimationFrame(enemy: EnemyState) {
  if (enemy.dead) return 7;
  if (enemy.hitStun > 0) return 6;
  if (enemy.attacking) return enemy.attackTimer > 0.24 ? 4 : 5;
  if (Math.abs(enemy.vx) > 18) return Math.floor(performance.now() / 150) % 2 ? 1 : 2;
  return 0;
}

function drawProjectile(context: CanvasRenderingContext2D, projectile: RoomState['projectiles'][number]) {
  context.save();
  context.translate(projectile.x, projectile.y);
  context.shadowColor = projectile.color;
  context.shadowBlur = projectile.boss ? 30 : 18;
  const glow = context.createRadialGradient(0, 0, 2, 0, 0, projectile.radius * 1.7);
  glow.addColorStop(0, '#fff4a8');
  glow.addColorStop(0.35, projectile.color);
  glow.addColorStop(1, 'rgba(255,80,20,0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, 0, projectile.radius * 1.7, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(255,238,154,.78)';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, 0, projectile.radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawCombatEffect(context: CanvasRenderingContext2D, effect: RoomState['combatEffects'][number]) {
  const progress = 1 - effect.life / 1.1;
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, effect.life * 1.5));
  if (effect.type === 'damage-enemy' || effect.type === 'damage-player') {
    context.textAlign = 'center';
    context.font = effect.critical ? '900 30px sans-serif' : '900 22px sans-serif';
    context.lineWidth = 5;
    context.strokeStyle = 'rgba(34,24,18,.78)';
    context.fillStyle = effect.color;
    const text = effect.critical ? `${effect.value}!` : String(effect.value);
    context.strokeText(text, effect.x, effect.y - progress * 54);
    context.fillText(text, effect.x, effect.y - progress * 54);
  } else if (effect.type === 'impact') {
    context.translate(effect.x, effect.y);
    context.strokeStyle = effect.color;
    context.lineWidth = 5 * effect.life;
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = ray * Math.PI / 4;
      context.beginPath();
      context.moveTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
      context.lineTo(Math.cos(angle) * (28 + progress * 34), Math.sin(angle) * (28 + progress * 34));
      context.stroke();
    }
  }
  context.restore();
}

function drawSpriteFrame(context: CanvasRenderingContext2D, sheet: HTMLCanvasElement, frame: number, x: number, y: number, width: number, height: number, trimRight = 0) {
  const cellWidth = sheet.width / 4;
  const cellHeight = sheet.height / 2;
  const safeFrame = Math.max(0, Math.min(7, frame));
  const sourceX = (safeFrame % 4) * cellWidth;
  const sourceY = Math.floor(safeFrame / 4) * cellHeight;
  const visibleRatio = 1 - Math.max(0, Math.min(0.3, trimRight));
  context.drawImage(sheet, sourceX, sourceY, cellWidth * visibleRatio, cellHeight, x, y, width * visibleRatio, height);
}

const gameImageCache = new Map<string, HTMLImageElement>();
const spriteSheetCache = new Map<string, HTMLCanvasElement>();

function getGameImage(source: string) {
  let image = gameImageCache.get(source);
  if (!image) {
    image = new window.Image();
    image.src = source;
    gameImageCache.set(source, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

function getTransparentSpriteSheet(source: string) {
  const cached = spriteSheetCache.get(source);
  if (cached) return cached;
  const image = getGameImage(source);
  if (!image) return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);
    if (minimum > 218 && maximum - minimum < 20) pixels.data[index + 3] = 0;
  }
  context.putImageData(pixels, 0, 0);
  spriteSheetCache.set(source, canvas);
  return canvas;
}

function TouchControls({ updateInput, paused }: { updateInput: (key: keyof InputState, pressed: boolean) => void; paused: boolean }) {
  function bind(key: keyof InputState) {
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateInput(key, true);
      },
      onPointerUp: () => updateInput(key, false),
      onPointerCancel: () => updateInput(key, false),
      onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    };
  }
  return <div className="touch-controls"><div><button disabled={paused} {...bind('left')} aria-label="向左">←</button><button disabled={paused} {...bind('right')} aria-label="向右">→</button></div><div><button disabled={paused} {...bind('jump')}>跳</button><button disabled={paused} className="attack-touch" {...bind('attack')}>攻</button></div></div>;
}

function playCombatTone(context: AudioContext | null, type: RoomState['combatEffects'][number]['type'], critical: boolean) {
  if (!context || context.state !== 'running' || type === 'impact') return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type === 'victory' ? 'triangle' : type === 'damage-player' ? 'sawtooth' : 'square';
  oscillator.frequency.setValueAtTime(type === 'victory' ? 520 : type === 'damage-player' ? 105 : critical ? 245 : 175, now);
  oscillator.frequency.exponentialRampToValueAtTime(type === 'victory' ? 880 : 72, now + (type === 'victory' ? 0.28 : 0.09));
  gain.gain.setValueAtTime(type === 'victory' ? 0.055 : 0.035, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === 'victory' ? 0.32 : 0.1));
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + (type === 'victory' ? 0.34 : 0.11));
}

function getGameServerUrl() {
  const configured = process.env.NEXT_PUBLIC_GAME_SERVER_URL?.trim();
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocal ? `${protocol}//${window.location.hostname}:8787` : `${protocol}//${window.location.host}`;
}

function loadPlayerProfile() {
  try {
    const saved = window.localStorage.getItem(profileStorageKey);
    if (!saved) return null;
    const profile = JSON.parse(saved);
    return profile && typeof profile === 'object' ? profile : null;
  } catch {
    return null;
  }
}

function cleanRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
