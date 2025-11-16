"use client";
import { useCallback, useMemo, useRef, useState } from "react";

type GeneratedScript = {
  hook: string;
  lines: { text: string; start: number; end: number }[];
  cta: string;
  visuals: string[];
  durationSec: number;
  keywords: { title: string; tags: string[]; description: string };
};

export default function HomePage() {
  const [niche, setNiche] = useState("");
  const [count, setCount] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [scripts, setScripts] = useState<GeneratedScript[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const canUpload = typeof window !== 'undefined' && !!(window as any).gapi;

  const requestScripts = useCallback(async () => {
    setStatus("Generating scripts...");
    const resp = await fetch("/api/generate-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche, count }),
    });
    const json = await resp.json();
    setScripts(json.items as GeneratedScript[]);
    setStatus("Optimizing keywords...");
    const opt = await fetch("/api/optimize-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: json.items }),
    });
    const optJson = await opt.json();
    setScripts(optJson.items as GeneratedScript[]);
    setStatus("Ready to render");
  }, [niche, count]);

  const renderOne = useCallback(async (idx: number) => {
    const script = scripts[idx];
    if (!script) return;

    const W = 720, H = 1280, FPS = 30;
    const durationMs = Math.max(15, Math.min(60, script.durationSec)) * 1000;

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Load one or more background images
    const images: HTMLImageElement[] = [];
    for (const v of script.visuals.slice(0, 3)) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `/api/stock-image?q=${encodeURIComponent(v)}`;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });
      images.push(img);
    }
    if (images.length === 0) {
      const fallback = new Image();
      fallback.src = "/api/stock-image?q=abstract background";
      await new Promise<void>((r) => (fallback.onload = () => r()));
      images.push(fallback);
    }

    // Prepare audio: simple background tone + gentle noise
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const oscillator = audioCtx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 220;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.02; // very low background
    oscillator.connect(gain).connect(dest);
    oscillator.start();

    const canvasStream = (canvas as any).captureStream(FPS) as MediaStream;
    const mixed = new MediaStream([
      canvasStream.getVideoTracks()[0],
      dest.stream.getAudioTracks()[0],
    ]);

    const recorder = new MediaRecorder(mixed, { mimeType: 'video/webm;codecs=vp9,opus' });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const complete = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    recorder.start();

    const start = performance.now();
    const lines = script.lines;

    function draw(now: number) {
      const t = now - start;
      if (t >= durationMs) {
        recorder.stop();
        oscillator.stop();
        return;
      }
      // Background
      ctx.fillStyle = "#0b0f14";
      ctx.fillRect(0, 0, W, H);

      // Ken Burns style pan/zoom between images
      const seg = Math.floor((t / durationMs) * images.length);
      const img = images[Math.max(0, Math.min(images.length - 1, seg))];
      const zoom = 1.05 + 0.05 * Math.sin(t / 1000);
      const iw = img.width * zoom, ih = img.height * zoom;
      const x = (W - iw) / 2 + 10 * Math.sin(t / 1200);
      const y = (H - ih) / 2 + 10 * Math.cos(t / 1300);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(img, x, y, iw, ih);
      ctx.globalAlpha = 1;

      // Overlay gradient
      const grad = ctx.createLinearGradient(0, H * 0.6, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Determine active caption line
      const sec = t / 1000;
      const active = lines.find(l => sec >= l.start && sec < l.end) ?? lines[0];

      // Hook/CTA banners
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(24, 24, W - 48, 56);
      ctx.fillRect(24, H - 120, W - 48, 96);

      ctx.fillStyle = "#e6edf3";
      ctx.textAlign = "center";
      ctx.font = "bold 26px system-ui";
      ctx.fillText(script.hook, W / 2, 60);

      ctx.font = "bold 34px system-ui";
      const wrapped = wrapText(ctx, active?.text || "", W - 120);
      drawMultiline(ctx, wrapped, W / 2, H - 80);

      ctx.font = "600 22px system-ui";
      ctx.fillStyle = "#93c5fd";
      ctx.fillText(script.cta, W / 2, H - 24);

      requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
    const blob = await complete;

    const url = URL.createObjectURL(blob);
    if (videoEl.current) videoEl.current.src = url;

    // thumb
    const thumbUrl = await captureFrame(canvas);
    setThumbs(prev => {
      const next = [...prev];
      next[idx] = thumbUrl;
      return next;
    });

    // save log locally
    const logKey = "agentic_logs";
    const logs = JSON.parse(localStorage.getItem(logKey) || "[]");
    logs.push({ time: Date.now(), niche, title: script.keywords.title, durationSec: script.durationSec });
    localStorage.setItem(logKey, JSON.stringify(logs));

    return { blob, url };
  }, [scripts, niche]);

  const generateAll = useCallback(async () => {
    setStatus("Rendering videos...");
    for (let i = 0; i < scripts.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await renderOne(i);
    }
    setStatus("Done");
  }, [scripts, renderOne]);

  const uploadToYouTube = useCallback(async (i: number) => {
    const s = scripts[i];
    if (!s) return;
    alert("Client-side YouTube upload requires OAuth configuration. See Settings.");
  }, [scripts]);

  return (
    <div className="container">
      <h1 className="title">Agentic YouTube Shorts</h1>
      <div className="card grid" style={{ gap: 16 }}>
        <div className="grid" style={{ gap: 8 }}>
          <label className="label">Niche</label>
          <input className="input" value={niche} onChange={e=>setNiche(e.target.value)} placeholder="e.g. personal finance, fitness, trivia"/>
        </div>
        <div className="row">
          <div className="grid" style={{ width: 200 }}>
            <label className="label">Number of Shorts</label>
            <input type="number" className="input" value={count} min={1} max={10} onChange={e=>setCount(parseInt(e.target.value||'1',10))}/>
          </div>
          <div className="grid" style={{ minWidth: 200 }}>
            <label className="label">Actions</label>
            <div className="row">
              <button className="button" onClick={requestScripts}>Generate Scripts</button>
              <button className="button secondary" onClick={generateAll}>Render All</button>
            </div>
          </div>
        </div>
        <div className="small">{status}</div>
      </div>

      {!!scripts.length && (
        <div style={{ height: 12 }} />
      )}

      <div className="grid" style={{ gap: 16 }}>
        {scripts.map((s, i) => (
          <div key={i} className="card">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 200 }}>
                {thumbs[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs[i]} alt="thumb" style={{ width: '100%', borderRadius: 8 }} />
                ) : (
                  <div style={{ width: 200, height: 355, background: '#0b1420', borderRadius: 8, display:'grid',placeItems:'center' }}>Preview</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div className="title" style={{ margin: 0 }}>{s.keywords.title}</div>
                <div className="small" style={{ marginBottom: 8 }}>{s.keywords.description}</div>
                <div className="small" style={{ marginBottom: 8 }}>Tags: {s.keywords.tags.join(', ')}</div>
                <div className="row">
                  <button className="button" onClick={() => renderOne(i)}>Render</button>
                  <button className="button secondary" onClick={() => uploadToYouTube(i)}>Upload</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 16 }} />

      <video ref={videoEl} controls style={{ width: 240, display: 'block' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    const m = ctx.measureText(test);
    if (m.width > maxWidth) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawMultiline(ctx: CanvasRenderingContext2D, lines: string[], centerX: number, baseY: number) {
  const lineHeight = 38;
  const total = lines.length * lineHeight;
  let y = baseY - total / 2;
  for (const line of lines) {
    ctx.fillStyle = "#111827";
    roundRect(ctx, 60, y - 28, 600, 42, 8);
    ctx.fillStyle = "#e6edf3";
    ctx.textAlign = "center";
    ctx.fillText(line, centerX, y);
    y += lineHeight;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

async function captureFrame(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL("image/png");
}
