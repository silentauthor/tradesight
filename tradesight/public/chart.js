/* TradeSight — canvas candlestick chart with overlays. No dependencies. */
'use strict';

class CandleChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.candles = [];
    this.overlays = [];   // {name, series, color, width}
    this.zones = [];      // {min, max, role, strength}
    this.lines = [];      // {price, color, label, dash}
    this.markers = [];    // {i, dir:'up'|'down', label, color}
    this.viewStart = 0;   // index of first visible candle
    this.crosshair = null;
    this.pad = { l: 10, r: 64, t: 12, b: 46 };
    this._bindEvents();
  }

  setData({ candles, overlays = [], zones = [], lines = [], markers = [] }) {
    this.candles = candles;
    this.overlays = overlays;
    this.zones = zones;
    this.lines = lines;
    this.markers = markers;
    this.viewCount = Math.min(candles.length, 160);
    this.viewStart = Math.max(0, candles.length - this.viewCount);
    this.draw();
  }

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      this.crosshair = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.draw();
    });
    c.addEventListener('mouseleave', () => { this.crosshair = null; this.draw(); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoom = e.deltaY > 0 ? 1.12 : 0.89;
      const newCount = Math.round(Math.min(this.candles.length, Math.max(30, this.viewCount * zoom)));
      this.viewStart = Math.max(0, Math.min(this.candles.length - newCount, this.viewStart + (this.viewCount - newCount)));
      this.viewCount = newCount;
      this.draw();
    }, { passive: false });
    let dragX = null;
    c.addEventListener('mousedown', (e) => { dragX = e.clientX; });
    window.addEventListener('mouseup', () => { dragX = null; });
    window.addEventListener('mousemove', (e) => {
      if (dragX == null) return;
      const dx = e.clientX - dragX;
      const perCandle = (this.canvas.clientWidth - this.pad.l - this.pad.r) / this.viewCount;
      const shift = Math.round(-dx / perCandle);
      if (shift !== 0) {
        this.viewStart = Math.max(0, Math.min(this.candles.length - this.viewCount, this.viewStart + shift));
        dragX = e.clientX;
        this.draw();
      }
    });
    new ResizeObserver(() => this.draw()).observe(c.parentElement);
  }

  draw() {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement.clientWidth;
    const H = canvas.parentElement.clientHeight || 420;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.candles.length) return;

    const { l: pl, r: pr, t: pt, b: pb } = this.pad;
    const plotW = W - pl - pr, plotH = H - pt - pb;
    const view = this.candles.slice(this.viewStart, this.viewStart + this.viewCount);
    let lo = Infinity, hi = -Infinity;
    for (const c of view) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
    for (const ln of this.lines) { lo = Math.min(lo, ln.price); hi = Math.max(hi, ln.price); }
    const span = (hi - lo) || 1; lo -= span * 0.05; hi += span * 0.05;
    const y = (p) => pt + plotH * (1 - (p - lo) / (hi - lo));
    const x = (i) => pl + ((i - this.viewStart) + 0.5) * (plotW / this.viewCount);
    const cw = Math.max(1.5, (plotW / this.viewCount) * 0.65);
    this._y = y; this._x = x; this._range = { lo, hi };

    const css = getComputedStyle(document.documentElement);
    const col = (name, fb) => (css.getPropertyValue(name) || fb).trim() || fb;
    const GRID = col('--grid', '#1e2733'), TXT = col('--muted', '#7d8b9d');
    const UP = col('--up', '#2fbf71'), DOWN = col('--down', '#e5484d');

    // grid + y labels
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const p = lo + (hi - lo) * (s / steps);
      const yy = y(p);
      ctx.strokeStyle = GRID; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pl, yy); ctx.lineTo(W - pr, yy); ctx.stroke();
      ctx.fillStyle = TXT;
      ctx.fillText(this._fmt(p), W - pr + 6, yy);
    }
    // x labels
    ctx.textAlign = 'center';
    const labelEvery = Math.ceil(this.viewCount / 7);
    for (let i = 0; i < view.length; i += labelEvery) {
      const d = new Date(view[i].t);
      ctx.fillText(`${d.toLocaleString('en', { month: 'short' })} ${d.getDate()} '${String(d.getFullYear()).slice(2)}`,
        x(this.viewStart + i), H - pb + 16);
    }

    // S/R zones
    for (const z of this.zones) {
      if (z.max < lo || z.min > hi) continue;
      const yTop = y(Math.min(z.max + (z.max === z.min ? span * 0.004 : 0), hi));
      const yBot = y(Math.max(z.min - (z.max === z.min ? span * 0.004 : 0), lo));
      ctx.fillStyle = z.role === 'support' ? 'rgba(47,191,113,0.10)' : 'rgba(229,72,77,0.10)';
      ctx.fillRect(pl, yTop, plotW, yBot - yTop);
    }

    // volume bars
    const maxV = Math.max(...view.map(c => c.v || 0), 1);
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const vh = (c.v / maxV) * plotH * 0.14;
      ctx.fillStyle = (c.c >= c.o ? UP : DOWN) + '55';
      ctx.fillRect(x(this.viewStart + i) - cw / 2, pt + plotH - vh, cw, vh);
    }

    // overlays
    for (const ov of this.overlays) {
      ctx.strokeStyle = ov.color; ctx.lineWidth = ov.width || 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < view.length; i++) {
        const v = ov.series[this.viewStart + i];
        if (v == null) continue;
        const xx = x(this.viewStart + i), yy = y(v);
        if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }

    // candles
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const xx = x(this.viewStart + i);
      const up = c.c >= c.o;
      ctx.strokeStyle = ctx.fillStyle = up ? UP : DOWN;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xx, y(c.h)); ctx.lineTo(xx, y(c.l)); ctx.stroke();
      const yo = y(c.o), yc = y(c.c);
      const top = Math.min(yo, yc), hgt = Math.max(1, Math.abs(yo - yc));
      ctx.fillRect(xx - cw / 2, top, cw, hgt);
    }

    // markers (detected patterns)
    ctx.font = '10px ui-sans-serif, system-ui';
    for (const m of this.markers) {
      if (m.i < this.viewStart || m.i >= this.viewStart + this.viewCount) continue;
      const c = this.candles[m.i];
      const xx = x(m.i);
      const up = m.dir === 'up';
      const yy = up ? y(c.l) + 14 : y(c.h) - 14;
      ctx.fillStyle = m.color || (up ? UP : DOWN);
      ctx.beginPath();
      if (up) { ctx.moveTo(xx, yy - 8); ctx.lineTo(xx - 5, yy); ctx.lineTo(xx + 5, yy); }
      else { ctx.moveTo(xx, yy + 8); ctx.lineTo(xx - 5, yy); ctx.lineTo(xx + 5, yy); }
      ctx.closePath(); ctx.fill();
    }

    // horizontal trade lines (entry/stop/targets)
    ctx.textAlign = 'left';
    for (const ln of this.lines) {
      const yy = y(ln.price);
      if (yy < pt || yy > pt + plotH) continue;
      ctx.strokeStyle = ln.color; ctx.lineWidth = 1.2;
      ctx.setLineDash(ln.dash || [6, 4]);
      ctx.beginPath(); ctx.moveTo(pl, yy); ctx.lineTo(W - pr, yy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ln.color;
      ctx.font = 'bold 10px ui-sans-serif, system-ui';
      const label = `${ln.label} ${this._fmt(ln.price)}`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(pl + 4, yy - 15, tw + 10, 14);
      ctx.fillStyle = '#0b0f14';
      ctx.fillText(label, pl + 9, yy - 8);
    }

    // crosshair
    if (this.crosshair && this.crosshair.x > pl && this.crosshair.x < W - pr) {
      const i = Math.min(this.candles.length - 1, Math.max(0,
        this.viewStart + Math.floor((this.crosshair.x - pl) / (plotW / this.viewCount))));
      const c = this.candles[i];
      if (c) {
        const xx = x(i);
        ctx.strokeStyle = TXT + '66'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(xx, pt); ctx.lineTo(xx, pt + plotH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pl, this.crosshair.y); ctx.lineTo(W - pr, this.crosshair.y); ctx.stroke();
        ctx.setLineDash([]);
        const d = new Date(c.t);
        const info = `${d.toISOString().slice(0, 10)}  O ${this._fmt(c.o)}  H ${this._fmt(c.h)}  L ${this._fmt(c.l)}  C ${this._fmt(c.c)}  V ${this._fmtVol(c.v)}`;
        ctx.font = '11px ui-monospace, Menlo, monospace';
        const tw = ctx.measureText(info).width;
        ctx.fillStyle = 'rgba(11,15,20,0.9)';
        ctx.fillRect(pl + 2, pt + 2, tw + 12, 18);
        ctx.fillStyle = col('--text', '#dfe7f0');
        ctx.textAlign = 'left';
        ctx.fillText(info, pl + 8, pt + 11);
      }
    }
  }

  _fmt(p) {
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 10) return p.toFixed(2);
    if (p >= 0.1) return p.toFixed(3);
    return p.toPrecision(3);
  }
  _fmtVol(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }
}
