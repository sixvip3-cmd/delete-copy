// Запись и воспроизведение голосовых сообщений
import { I } from './icons.js';
import { dur } from './util.js';

function pickMime() {
  const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
  if (!window.MediaRecorder) return null;
  return c.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

export function canRecord() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

/**
 * Запускает запись. onLevel(level 0..1) вызывается ~16 раз/сек.
 * Возвращает { stop(): Promise<{blob, duration, waveform, mime}>, cancel() }
 */
export async function startRecording(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(250);
  const started = performance.now();

  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  const levels = [];
  const iv = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
    levels.push(lvl);
    onLevel?.(lvl, (performance.now() - started) / 1000);
  }, 60);

  const cleanup = () => {
    clearInterval(iv);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  return {
    elapsed: () => (performance.now() - started) / 1000,
    cancel() { try { rec.stop(); } catch {} cleanup(); },
    stop() {
      return new Promise((resolve) => {
        rec.onstop = () => {
          cleanup();
          const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
          resolve({
            blob: new Blob(chunks, { type }),
            mime: type,
            duration: (performance.now() - started) / 1000,
            waveform: downsample(levels, 40),
          });
        };
        try { rec.requestData(); } catch {}
        rec.stop();
      });
    },
  };
}

function downsample(arr, n) {
  if (!arr.length) return Array(n).fill(0.1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * arr.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * arr.length) / n));
    let m = 0;
    for (let j = a; j < b && j < arr.length; j++) m = Math.max(m, arr[j]);
    out.push(m);
  }
  const max = Math.max(...out, 0.05);
  return out.map((v) => +(Math.max(0.08, v / max)).toFixed(2));
}

/* ---------------- плеер: один на всё приложение */
let current = null; // { audio, node, msg }
const SPEEDS = [1, 1.5, 2];
let speed = 1;

export function voiceHtml(m, extra = '') {
  const wf = (m.waveform && m.waveform.length ? m.waveform : Array(40).fill(0.3));
  const bars = wf.map((v) => `<i style="height:${Math.max(12, Math.round(v * 100))}%"></i>`).join('');
  return `<div class="voice" data-voice="${m.id}">
    <button class="play" aria-label="Воспроизвести">${I.play}</button>
    <div class="wave-col"><div class="wave">${bars}</div>
      <div class="vmeta"><span class="vtime">${dur(m.duration)}</span><button class="speed hidden">${speed}x</button>${extra}</div>
    </div></div>`;
}

export function bindVoice(node, m, onEnded) {
  const btn = node.querySelector('.play');
  const wave = node.querySelector('.wave');
  const bars = [...wave.children];
  const time = node.querySelector('.vtime');
  const spd = node.querySelector('.speed');

  const paint = (p) => {
    const k = Math.round(p * bars.length);
    bars.forEach((b, i) => b.classList.toggle('on', i < k));
  };

  const setUi = (playing) => {
    btn.innerHTML = playing ? I.pause : I.play;
    spd.classList.toggle('hidden', !playing && !(current && current.node === node));
  };

  const play = (seek) => {
    if (current && current.node !== node) current.stop();
    if (!current || current.node !== node) {
      const audio = new Audio(m.media);
      audio.playbackRate = speed;
      const total = () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : m.duration || 1);
      audio.ontimeupdate = () => {
        const p = Math.min(1, audio.currentTime / total());
        paint(p);
        time.textContent = dur(audio.currentTime);
      };
      audio.onended = () => { stop(); onEnded?.(); };
      const stop = () => {
        audio.pause();
        paint(0);
        time.textContent = dur(m.duration);
        current = null;
        setUi(false);
        spd.classList.add('hidden');
      };
      current = { audio, node, stop, total };
    }
    if (seek != null) {
      const t = seek * current.total();
      try { current.audio.currentTime = t; } catch {}
      paint(seek);
    }
    current.audio.play().catch(() => {});
    setUi(true);
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (current && current.node === node && !current.audio.paused) { current.audio.pause(); setUi(false); spd.classList.remove('hidden'); }
    else play();
  });
  wave.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = wave.getBoundingClientRect();
    play(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  });
  spd.addEventListener('click', (e) => {
    e.stopPropagation();
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    spd.textContent = speed + 'x';
    if (current) current.audio.playbackRate = speed;
  });

  node._play = () => play();
}

export function stopVoice() { current?.stop(); }

/** Длительность и волна для готового аудиофайла (фолбэк, когда микрофон недоступен). */
export async function analyzeAudio(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const n = 40, step = Math.floor(data.length / n) || 1, out = [];
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) m = Math.max(m, Math.abs(data[j]));
      out.push(m);
    }
    const max = Math.max(...out, 0.01);
    return { duration: buf.duration, waveform: out.map((v) => +Math.max(0.08, v / max).toFixed(2)) };
  } catch {
    return { duration: 0, waveform: Array(40).fill(0.4) };
  } finally { ctx.close?.().catch(() => {}); }
}
