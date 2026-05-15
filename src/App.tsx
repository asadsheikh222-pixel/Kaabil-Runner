/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trophy, ArrowUp, ArrowDown, Volume2, VolumeX } from 'lucide-react';

// --- Types & Constants ---

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const INITIAL_SPEED = 6;
const SPEED_INCREMENT = 0.001;
const OBSTACLE_SPAWN_RATE = 0.015;
const ORB_SPAWN_RATE = 0.01;

// --- Sound Engine ---

class SoundEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  isMuted: boolean = false;
  musicOscillators: (OscillatorNode | GainNode | { stop: () => void })[] = [];

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.musicGain.gain.setValueAtTime(0, this.ctx.currentTime);
    
    this.setMute(this.isMuted);
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.4, this.ctx!.currentTime, 0.05);
    }
  }

  playMusic() {
    if (!this.ctx || this.musicOscillators.length > 0) return;
    
    const now = this.ctx.currentTime;
    this.musicGain!.gain.cancelScheduledValues(now);
    this.musicGain!.gain.setTargetAtTime(0.3, now, 2); // Fade In

    // 1. Ambient Drones
    const createDrone = (freq: number, type: OscillatorType, gainVal: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const droneGain = this.ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(0.5, now);
      lfoGain.gain.setValueAtTime(freq * 0.01, now);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      
      droneGain.gain.setValueAtTime(gainVal, now);
      osc.connect(droneGain);
      droneGain.connect(this.musicGain!);
      osc.start();
      
      this.musicOscillators.push(osc, lfo, droneGain);
    };

    createDrone(55, 'sawtooth', 0.03); 
    createDrone(110, 'sine', 0.05);

    // 2. Rhythmic Sequencer
    const tempo = 135;
    const secondsPerBeat = 60 / tempo;
    let nextBeat = now;
    let beatStep = 0;

    const playKick = (time: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);
      gain.gain.setValueAtTime(0.6, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start(time);
      osc.stop(time + 0.15);
    };

    const playBass = (time: number, freq: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start(time);
      osc.stop(time + 0.2);
    };

    const sequence = [55, 55, 65.41, 55, 55, 55, 48.99, 61.74]; // Dynamic bassline
    const melody = [440, 0, 523, 587, 0, 659, 783, 0, 440, 0, 523, 587, 659, 0, 0, 0]; // Cyber melody

    const playLead = (time: number, freq: number) => {
      if (!this.ctx || freq === 0) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      
      // Slight vibrato
      const vLfo = this.ctx.createOscillator();
      const vGain = this.ctx.createGain();
      vLfo.frequency.setValueAtTime(5, time);
      vGain.gain.setValueAtTime(freq * 0.005, time);
      vLfo.connect(vGain);
      vGain.connect(osc.frequency);
      vLfo.start(time);
      vLfo.stop(time + 0.4);

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.06, time + 0.05);
      gain.gain.linearRampToValueAtTime(0, time + 0.4);
      
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start(time);
      osc.stop(time + 0.4);
    };
    
    const intervalId = setInterval(() => {
      if (!this.ctx) return;
      const scheduleAheadTime = 0.1;
      while (nextBeat < this.ctx.currentTime + scheduleAheadTime) {
        // Kick on every beat
        if (beatStep % 2 === 0) playKick(nextBeat);
        
        // Bass on every 8th note
        playBass(nextBeat, sequence[beatStep % sequence.length]);

        // Lead melody on every 8th note
        if (beatStep % 2 === 0) {
          playLead(nextBeat, melody[(beatStep / 2) % melody.length]);
        }
        
        nextBeat += secondsPerBeat / 2;
        beatStep++;
      }
    }, 25);

    this.musicOscillators.push({ stop: () => clearInterval(intervalId) });
  }

  stopMusic() {
    if (!this.ctx || this.musicOscillators.length === 0) return;
    const now = this.ctx.currentTime;
    this.musicGain!.gain.setTargetAtTime(0, now, 1.5); // Fade Out
    
    const activeNodes = [...this.musicOscillators];
    this.musicOscillators = [];
    
    setTimeout(() => {
      activeNodes.forEach(node => {
        if ('stop' in node && typeof node.stop === 'function') {
          try { node.stop(); } catch(e) {}
        }
      });
    }, 2000);
  }

  playJump() {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain!);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playOrb() {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain!);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playHit() {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const noise = this.ctx.createOscillator(); // Using a second osc for grit
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(this.masterGain!);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  playStart() {
    if (!this.ctx || this.isMuted) return;
    [440, 660, 880].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0, this.ctx!.currentTime + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.1, this.ctx!.currentTime + i * 0.1 + 0.05);
      gain.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + i * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(this.ctx!.currentTime + i * 0.1);
      osc.stop(this.ctx!.currentTime + i * 0.1 + 0.2);
    });
  }
}

const sounds = new SoundEngine();

interface Vector {
  x: number;
  y: number;
}

class Particle {
  pos: Vector;
  vel: Vector;
  life: number;
  color: string;
  size: number;

  constructor(x: number, y: number, color: string) {
    this.pos = { x, y };
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    this.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    this.life = 1.0;
    this.color = color;
    this.size = Math.random() * 3 + 1;
  }

  update() {
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;
    this.life -= 0.02;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

class Entity {
  pos: Vector;
  width: number;
  height: number;
  color: string;

  constructor(x: number, y: number, w: number, h: number, color: string) {
    this.pos = { x, y };
    this.width = w;
    this.height = h;
    this.color = color;
  }

  getBounds() {
    return {
      left: this.pos.x,
      right: this.pos.x + this.width,
      top: this.pos.y,
      bottom: this.pos.y + this.height,
    };
  }
}

class Obstacle extends Entity {
  type: 'GROUND' | 'AIR';
  constructor(x: number, y: number, w: number, h: number, type: 'GROUND' | 'AIR') {
    super(x, y, w, h, '#ff0033');
    this.type = type;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;
    ctx.fillStyle = '#222';
    
    // Draw neon block
    ctx.fillRect(this.pos.x, this.pos.y, this.width, this.height);
    
    // Glowing edge
    ctx.fillStyle = this.color;
    ctx.fillRect(this.pos.x, this.pos.y, 4, this.height);
    
    // Interior details
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const yPos = this.pos.y + (this.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(this.pos.x + 4, yPos);
      ctx.lineTo(this.pos.x + this.width, yPos);
      ctx.stroke();
    }
    
    ctx.shadowBlur = 0;
  }
}

class EnergyOrb extends Entity {
  constructor(x: number, y: number) {
    super(x, y, 20, 20, '#ff00ff');
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    const bounce = Math.sin(time / 200) * 5;
    ctx.shadowBlur = 25;
    ctx.shadowColor = this.color;
    ctx.fillStyle = '#ffffff';
    
    ctx.beginPath();
    ctx.arc(
      this.pos.x + this.width / 2,
      this.pos.y + this.height / 2 + bounce,
      this.width / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
    
    // Outer Ring
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.shadowBlur = 0;
  }
}

// --- Main App Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('kaabil-high-score');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [collectedOrbs, setCollectedOrbs] = useState(0);
  const [integrity, setIntegrity] = useState(3);
  const [isMuted, setIsMuted] = useState(false);

  // Game Engine Refs
  const engineRef = useRef({
    player: {
      pos: { x: 100, y: 0 },
      vel: { x: 0, y: 0 },
      width: 40,
      height: 60,
      isJumping: false,
      isSliding: false,
      trail: [] as Vector[],
    },
    obstacles: [] as Obstacle[],
    orbs: [] as EnergyOrb[],
    particles: [] as Particle[],
    speed: INITIAL_SPEED,
    distance: 0,
    orbsCount: 0,
    groundY: 0,
    time: 0,
    animationId: 0,
  });

  const updateHighScore = (newScore: number) => {
    if (newScore > highScore) {
      setHighScore(newScore);
      localStorage.setItem('kaabil-high-score', newScore.toString());
    }
  };

  const handleGameOver = useCallback(() => {
    setGameState('GAMEOVER');
    sounds.playHit();
    sounds.stopMusic();
    if (engineRef.current.animationId) {
      cancelAnimationFrame(engineRef.current.animationId);
    }
  }, []);

  const spawnObstacle = useCallback((canvasWidth: number) => {
    const engine = engineRef.current;
    const type = Math.random() > 0.3 ? 'GROUND' : 'AIR';
    const h = type === 'GROUND' ? 40 + Math.random() * 40 : 40;
    const w = 30 + Math.random() * 30;
    const y = type === 'GROUND' ? engine.groundY - h : engine.groundY - 120;
    
    // Prevent spawning too close to existing ones
    if (engine.obstacles.length > 0) {
      const last = engine.obstacles[engine.obstacles.length - 1];
      if (canvasWidth - last.pos.x < 300) return;
    }
    
    engine.obstacles.push(new Obstacle(canvasWidth + 100, y, w, h, type));
  }, []);

  const spawnOrb = useCallback((canvasWidth: number) => {
    const engine = engineRef.current;
    const y = engine.groundY - 50 - Math.random() * 100;
    
    if (engine.orbs.length > 0) {
      const last = engine.orbs[engine.orbs.length - 1];
      if (canvasWidth - last.pos.x < 150) return;
    }

    engine.orbs.push(new EnergyOrb(canvasWidth + 100, y));
  }, []);

  const gameLoop = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const engine = engineRef.current;
    const { player } = engine;

    // --- Update ---
    engine.time += 16;
    engine.speed += SPEED_INCREMENT;
    engine.distance += engine.speed / 10;
    setScore(Math.floor(engine.distance));

    // Player Physics
    player.vel.y += GRAVITY;
    player.pos.y += player.vel.y;

    if (player.pos.y + player.height > engine.groundY) {
      player.pos.y = engine.groundY - player.height;
      player.vel.y = 0;
      player.isJumping = false;
    }

    // Player Trail
    player.trail.push({ ...player.pos });
    if (player.trail.length > 10) player.trail.shift();

    // Spawn Logic
    if (Math.random() < OBSTACLE_SPAWN_RATE) spawnObstacle(canvas.width);
    if (Math.random() < ORB_SPAWN_RATE) spawnOrb(canvas.width);

    // Obstacles Update
    engine.obstacles = engine.obstacles.filter(obs => {
      obs.pos.x -= engine.speed;
      
      // Collision detection
      const pBounds = {
        left: player.pos.x + 5,
        right: player.pos.x + player.width - 5,
        top: player.isSliding ? player.pos.y + player.height / 2 : player.pos.y + 5,
        bottom: player.pos.y + player.height - 5,
      };
      
      const oBounds = obs.getBounds();
      
      if (
        pBounds.right > oBounds.left &&
        pBounds.left < oBounds.right &&
        pBounds.bottom > oBounds.top &&
        pBounds.top < oBounds.bottom
      ) {
        // Hit logic
        setIntegrity(prev => {
          const next = prev - 1;
          if (next <= 0) {
            handleGameOver();
          } else {
            sounds.playHit();
          }
          return next;
        });

        // Knockback particles
        for (let i = 0; i < 15; i++) {
          engine.particles.push(new Particle(player.pos.x + player.width, player.pos.y + player.height / 2, '#ff0033'));
        }

        return false; // Remove this obstacle
      }

      return obs.pos.x + obs.width > -100;
    });

    // Orbs Update
    engine.orbs = engine.orbs.filter(orb => {
      orb.pos.x -= engine.speed;
      
      const pBounds = {
        left: player.pos.x,
        right: player.pos.x + player.width,
        top: player.pos.y,
        bottom: player.pos.y + player.height,
      };
      
      const oBounds = orb.getBounds();
      
      if (
        pBounds.right > oBounds.left &&
        pBounds.left < oBounds.right &&
        pBounds.bottom > oBounds.top &&
        pBounds.top < oBounds.bottom
      ) {
        engine.distance += 50; // Bonus points
        engine.orbsCount += 1;
        setCollectedOrbs(engine.orbsCount);
        sounds.playOrb();
        // Particles on collect
        for (let i = 0; i < 8; i++) {
          engine.particles.push(new Particle(orb.pos.x + orb.width / 2, orb.pos.y + orb.height / 2, '#ff00ff'));
        }
        return false;
      }

      return orb.pos.x + orb.width > -100;
    });

    // Particles Update
    engine.particles = engine.particles.filter(p => {
      p.update();
      return p.life > 0;
    });

    // --- Draw ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background Grid
    ctx.strokeStyle = 'rgba(188, 19, 254, 0.08)';
    ctx.lineWidth = 1;
    const gridSpacing = 50;
    const gridOffset = (engine.distance * 2) % gridSpacing;
    
    for (let x = -gridOffset; x < canvas.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    const horizonY = engine.groundY - 100;
    for (let y = horizonY; y < canvas.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Ground line
    ctx.strokeStyle = '#bc13fe';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#bc13fe';
    ctx.beginPath();
    ctx.moveTo(0, engine.groundY);
    ctx.lineTo(canvas.width, engine.groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Entities
    engine.obstacles.forEach(obs => obs.draw(ctx));
    engine.orbs.forEach(orb => orb.draw(ctx, engine.time));
    engine.particles.forEach(p => p.draw(ctx));

    // Draw Player
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#00f2ff';
    
    const gradient = ctx.createLinearGradient(
      player.pos.x, player.pos.y, 
      player.pos.x + player.width, player.pos.y + player.height
    );
    gradient.addColorStop(0, '#00f2ff');
    gradient.addColorStop(1, '#bc13fe');

    // Player Trail
    player.trail.forEach((t, i) => {
      ctx.globalAlpha = i / player.trail.length * 0.2;
      ctx.fillStyle = '#00f2ff';
      const h = player.isSliding ? player.height / 2 : player.height;
      const y = player.isSliding ? t.y + player.height / 2 : t.y;
      ctx.fillRect(t.x, y, player.width, h);
    });
    ctx.globalAlpha = 1.0;

    // Actual Player
    const playerH = player.isSliding ? player.height / 2 : player.height;
    const playerY = player.isSliding ? player.pos.y + player.height / 2 : player.pos.y;
    
    ctx.fillStyle = gradient;
    ctx.fillRect(player.pos.x, playerY, player.width, playerH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(player.pos.x, playerY, player.width, playerH);
    
    // Eye/Core - White Glow
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(player.pos.x + player.width - 12, playerY + 8, 6, 6);
    
    ctx.shadowBlur = 0;

    engine.animationId = requestAnimationFrame(gameLoop);
  }, [handleGameOver, spawnObstacle, spawnOrb]);

  const startGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    sounds.init();
    sounds.playStart();
    sounds.playMusic();

    engineRef.current = {
      player: {
        pos: { x: 100, y: canvas.height / 2 },
        vel: { x: 0, y: 0 },
        width: 40,
        height: 60,
        isJumping: false,
        isSliding: false,
        trail: [],
      },
      obstacles: [],
      orbs: [],
      particles: [],
      speed: INITIAL_SPEED,
      distance: 0,
      orbsCount: 0,
      groundY: canvas.height * 0.75,
      time: 0,
      animationId: 0,
    };

    setGameState('PLAYING');
    setScore(0);
    setCollectedOrbs(0);
    setIntegrity(3);
    gameLoop();
  };

  const handleAction = useCallback((type: 'JUMP' | 'SLIDE_START' | 'SLIDE_END') => {
    if (gameState !== 'PLAYING') return;
    const { player } = engineRef.current;

    if (type === 'JUMP' && !player.isJumping) {
      player.vel.y = JUMP_FORCE;
      player.isJumping = true;
      player.isSliding = false;
      sounds.playJump();
    } else if (type === 'SLIDE_START') {
      player.isSliding = true;
    } else if (type === 'SLIDE_END') {
      player.isSliding = false;
    }
  }, [gameState]);

  // Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') handleAction('JUMP');
      if (e.code === 'ArrowDown') handleAction('SLIDE_START');
      if (e.code === 'Enter' && (gameState === 'START' || gameState === 'GAMEOVER')) startGame();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown') handleAction('SLIDE_END');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, handleAction]);

  // Resize Handler
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        engineRef.current.groundY = canvasRef.current.height * 0.75;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (gameState === 'GAMEOVER') {
      updateHighScore(score);
    }
  }, [gameState, score]);

  const multiplier = Math.max(1, 1 + Math.floor(score / 1000) * 0.5);
  const velocityPercent = Math.min(100, ((engineRef.current.speed - INITIAL_SPEED) / 5) * 100);

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    sounds.setMute(nextMute);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen bg-cyber-black overflow-hidden font-sans select-none"
      onTouchStart={() => handleAction('JUMP')}
    >
      {/* HUD Mute Toggle */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <button 
          onClick={toggleMute}
          className="p-2 border border-cyber-cyan/30 rounded-full bg-cyber-black/50 hover:bg-cyber-cyan/20 transition-all text-cyber-cyan/60"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Background Cyber Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute bottom-0 w-full h-[400px] bg-gradient-to-t from-cyber-cyan/5 to-transparent opacity-20"></div>
        <div className="absolute inset-0 cyber-grid" style={{ transform: 'perspective(500px) rotateX(60deg) translateY(-100px)', transformOrigin: 'top' }}></div>
      </div>

      <canvas
        ref={canvasRef}
        className="block w-full h-full relative z-0"
      />

      {/* Top HUD */}
      <div className="absolute top-0 left-0 w-full p-8 md:p-10 flex justify-between items-start z-20 pointer-events-none">
        <div className="flex flex-col">
          <span className="text-[10px] tracking-[0.3em] text-cyber-cyan font-bold uppercase mb-1 drop-shadow-[0_0_8px_rgba(0,242,255,0.5)]">Distance Protocol</span>
          <div className="text-4xl md:text-5xl font-black italic tracking-tighter text-white px-6">
            {score.toLocaleString()}<span className="text-lg ml-1 text-cyber-cyan">KM</span>
          </div>
        </div>
        
        <div className="hidden md:flex flex-col items-center">
          <div className="text-2xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyber-cyan via-cyber-purple to-cyber-pink">
            KAABIL RUNNER
          </div>
          <div className="w-32 h-[1px] bg-gradient-to-r from-transparent via-cyber-purple to-transparent mt-2"></div>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] tracking-[0.3em] text-cyber-pink font-bold uppercase mb-1 drop-shadow-[0_0_8px_rgba(255,0,255,0.5)]">System Integrity</span>
          <div className="flex gap-1.5">
            {[...Array(3)].map((_, i) => (
              <div 
                key={i}
                className={`w-6 h-2 md:w-8 md:h-2.5 transition-all duration-300 ${
                  i < integrity ? 'bg-cyber-pink shadow-[0_0_12px_#ff00ff]' : 'bg-gray-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Controls & Stats */}
      <div className="absolute bottom-0 left-0 w-full h-28 md:h-32 bg-cyber-black/80 backdrop-blur-md border-t border-cyber-purple/30 flex items-center px-6 md:px-12 z-20 pointer-events-none">
        <div className="flex-1 flex gap-8 md:gap-16">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.4em] text-gray-500 mb-2 font-bold">Multipliers</span>
            <span className="text-xl md:text-2xl font-black text-cyber-cyan italic px-1">X {multiplier.toFixed(1)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.4em] text-gray-500 mb-2 font-bold">Collected</span>
            <span className="text-xl md:text-2xl font-black text-cyber-pink italic px-1">
              {collectedOrbs} <span className="text-sm text-gray-400 font-normal not-italic">ORBS</span>
            </span>
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.4em] text-gray-500 mb-2 font-bold">Best Record</span>
            <span className="text-xl md:text-2xl font-black text-yellow-400 italic">{highScore}KM</span>
          </div>
        </div>

        <div className="flex gap-3 md:gap-4 pointer-events-auto">
          <div className="flex flex-col items-center">
            <button 
              onMouseDown={() => handleAction('JUMP')}
              className="w-10 h-10 md:w-12 md:h-12 border border-cyber-cyan flex items-center justify-center rounded-lg bg-cyber-cyan/10 hover:bg-cyber-cyan/30 transition-colors"
            >
              <ArrowUp className="w-5 h-5 text-cyber-cyan" />
            </button>
            <span className="text-[8px] mt-1 text-cyber-cyan uppercase tracking-widest font-bold">Jump</span>
          </div>
          <div className="flex flex-col items-center">
            <button 
              onMouseDown={() => handleAction('SLIDE_START')}
              onMouseUp={() => handleAction('SLIDE_END')}
              onMouseLeave={() => handleAction('SLIDE_END')}
              className="w-10 h-10 md:w-12 md:h-12 border border-cyber-purple flex items-center justify-center rounded-lg bg-cyber-purple/10 hover:bg-cyber-purple/30 transition-colors"
            >
              <ArrowDown className="w-5 h-5 text-cyber-purple" />
            </button>
            <span className="text-[8px] mt-1 text-cyber-purple uppercase tracking-widest font-bold">Slide</span>
          </div>
        </div>
      </div>

      {/* Speed Indicator Sidebar */}
      <div className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-20 pointer-events-none opacity-60">
        <div className="w-1 h-48 md:h-64 bg-gray-900 rounded-full overflow-hidden relative">
          <div 
            className="absolute bottom-0 w-full bg-gradient-to-t from-cyber-cyan to-cyber-purple shadow-[0_0_15px_#00f2ff] transition-all duration-300" 
            style={{ height: `${velocityPercent}%` }}
          />
        </div>
        <span className="text-[9px] [writing-mode:vertical-rl] rotate-180 uppercase tracking-[0.5em] text-gray-400 mt-4 font-bold">Velocity</span>
      </div>

      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-cyber-black/90 flex flex-col items-center justify-center p-4 text-center z-50 overflow-y-auto backdrop-blur-sm"
          >
            <div className="relative mb-12">
              <motion.h1 
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-7xl md:text-9xl font-black italic tracking-tighter text-white neon-glow-cyan px-10 pb-2"
              >
                KAABIL<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyber-cyan via-cyber-purple to-cyber-pink">RUNNER</span>
              </motion.h1>
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-48 h-0.5 bg-gradient-to-r from-transparent via-cyber-purple to-transparent" />
            </div>
            
            <p className="text-cyber-cyan/60 uppercase tracking-[0.4em] font-bold mb-12 text-xs">Synthetic Reality Interface // v2.0.4</p>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="group relative px-14 py-4 overflow-hidden rounded-sm transition-all pointer-events-auto"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyber-cyan via-cyber-purple to-cyber-pink transition-all group-hover:scale-110" />
              <div className="relative flex items-center gap-4 text-cyber-black font-bold uppercase tracking-widest px-8 whitespace-nowrap" style={{ fontSize: '14px', lineHeight: '20px', fontFamily: 'Arial, sans-serif' }}>
                <Play className="fill-current w-5 h-5" />
                Initialize Sync
              </div>
              <div className="absolute inset-0 border border-white/40 mix-blend-overlay" />
            </motion.button>

            <div className="mt-20 grid grid-cols-2 gap-12 text-gray-500 text-[10px] font-bold uppercase tracking-[0.3em]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border border-cyber-cyan/30 flex items-center justify-center rounded-lg bg-cyber-cyan/5">
                  <ArrowUp className="w-6 h-6 text-cyber-cyan/50" />
                </div>
                <span>Space / Up to Jump</span>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border border-cyber-purple/30 flex items-center justify-center rounded-lg bg-cyber-purple/5">
                  <ArrowDown className="w-6 h-6 text-cyber-purple/50" />
                </div>
                <span>Down to Slide</span>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-cyber-red/20 backdrop-blur-xl flex flex-col items-center justify-center p-4 text-center z-50 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-cyber-black border-2 border-cyber-red shadow-[0_0_40px_rgba(255,0,51,0.3)] max-w-lg w-full relative overflow-hidden"
            >
              {/* Caution Stripes */}
              <div className="absolute top-0 left-0 w-full h-2 bg-[repeating-linear-gradient(45deg,#ff0033,#ff0033_10px,#000_10px,#000_20px)]" />
              
              <div className="p-10 md:p-14">
                <h2 className="text-5xl md:text-6xl font-black text-cyber-red italic mb-2 tracking-tighter uppercase leading-none px-2">Connection<br/>Severed</h2>
                <p className="text-cyber-red/50 uppercase tracking-[0.3em] text-[10px] font-bold mb-10">Neural parity lost at grid horizon</p>
                
                <div className="flex flex-col gap-6 mb-12">
                  <div className="flex justify-between items-end border-b border-white/5 pb-3">
                    <span className="text-white/30 uppercase text-[10px] font-bold tracking-widest">Session Distance</span>
                    <span className="text-4xl font-black text-white italic">{score.toLocaleString()}<span className="text-base ml-1">KM</span></span>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-white/30 uppercase text-[10px] font-bold tracking-widest">Global Record</span>
                    <span className="text-4xl font-black text-yellow-500 italic">{highScore.toLocaleString()}<span className="text-base ml-1">KM</span></span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={startGame}
                    className="group relative flex items-center justify-center gap-3 py-4 bg-white hover:bg-cyber-cyan text-black font-black uppercase tracking-widest text-sm transition-all pointer-events-auto"
                  >
                    <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                    Reconnect
                  </button>
                  <button
                    onClick={() => setGameState('START')}
                    className="flex items-center justify-center gap-3 py-4 border border-white/10 text-white hover:bg-white/5 font-black uppercase tracking-widest text-sm transition-all pointer-events-auto"
                  >
                    Terminal
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Particles Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <div 
            key={i}
            className="absolute rounded-full bg-white opacity-20 animate-pulse shadow-[0_0_8px_white]"
            style={{
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${Math.random() * 3 + 2}s`
            }}
          />
        ))}
      </div>

      {/* Scanline Effect Overlay */}
      <div className="absolute inset-0 pointer-events-none scanline z-40 opacity-20" />
    </div>
  );
}
