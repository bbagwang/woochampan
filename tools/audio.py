"""Soundtrack for the 우참판 showreel — synthesised from scratch with numpy only.

120 BPM, D minor pentatonic. Gayageum-like Karplus-Strong plucks over a modern
hybrid-trailer bed (sub impacts, risers, kick/clap/hats). Every hit is placed on
the same timeline as reel/reel.js (HITS / scene boundaries).

    python3 tools/audio.py out.wav
"""
import sys
import wave
import numpy as np

SR = 48000
DUR = 36.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
SEND_L = np.zeros(N)  # reverb send
SEND_R = np.zeros(N)


def note_hz(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + (o - 4) * 12 - 9) / 12)


def place(sig, t, gain=1.0, pan=0.0, send=0.0):
    i = int(t * SR)
    if i >= N:
        return
    if sig.ndim == 1:
        sl, sr_ = sig, sig
    else:
        sl, sr_ = sig[0], sig[1]
    n = min(len(sl), N - i)
    gl = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    gr = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    L[i:i + n] += sl[:n] * gl
    R[i:i + n] += sr_[:n] * gr
    if send:
        SEND_L[i:i + n] += sl[:n] * gl * send
        SEND_R[i:i + n] += sr_[:n] * gr * send


def env_ad(n, a, d, curve=4.0):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), np.exp(-(t - a) / max(d, 1e-6) * curve / 4 * 4))
    return e


def fft_filter(x, lo=0.0, hi=SR / 2, soft=0.15):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo > 0:
        m *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (2 / soft * 0.15 + 2))
    if hi < SR / 2:
        m *= 1 / (1 + (f / hi) ** (2 / soft * 0.15 + 2))
    return np.fft.irfft(X * m, len(x))


def sweep_filter(x, lo_fn, hi_fn, block=2048):
    """time-varying band-pass via windowed overlap-add."""
    hop = block // 2
    win = np.hanning(block)
    out = np.zeros(len(x) + block)
    xp = np.concatenate([x, np.zeros(block)])
    f = np.fft.rfftfreq(block, 1 / SR)
    for s in range(0, len(x), hop):
        seg = xp[s:s + block] * win
        tt = s / SR
        lo, hi = lo_fn(tt), hi_fn(tt)
        m = 1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4) / (1 + (f / hi) ** 4)
        out[s:s + block] += np.fft.irfft(np.fft.rfft(seg) * m, block)
    return out[:len(x)] / 1.0


def noise(n):
    return rng.standard_normal(n)


def sine_sweep(f0, f1, dur, curve=0.08):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / curve)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph)


# ----------------------------------------------------------------- instruments
def kick(gain=1.0):
    n = int(0.45 * SR)
    s = sine_sweep(170, 46, 0.45, 0.035) * np.exp(-np.arange(n) / SR / 0.16)
    click = fft_filter(noise(int(0.01 * SR)), 2000, 9000) * np.linspace(1, 0, int(0.01 * SR)) * 0.4
    s[:len(click)] += click
    return np.tanh(s * 1.6) * gain


def clap():
    n = int(0.3 * SR)
    x = fft_filter(noise(n), 900, 6000)
    e = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.022]):
        i = int(d * SR)
        e[i:] += np.exp(-np.arange(n - i) / SR / (0.012 if k < 2 else 0.09)) * (0.7 if k < 2 else 1)
    body = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * np.exp(-np.arange(n) / SR / 0.05) * 0.3
    return (x * e * 0.5 + body)


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    x = fft_filter(noise(n), 7000, 16000)
    return x * np.exp(-np.arange(n) / SR / (0.08 if open_ else 0.018)) * 0.5


def boom(dur=2.2, f0=90, f1=34):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = sine_sweep(f0, f1, dur, 0.25) * np.exp(-t / 0.9)
    crack = fft_filter(noise(n), 200, 9000) * np.exp(-t / 0.18) * 0.5
    tail = fft_filter(noise(n), 60, 1200) * np.exp(-t / 0.8) * 0.25
    return np.tanh((s * 1.4 + crack + tail) * 1.2)


def taiko(f=88):
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    s = sine_sweep(f * 1.6, f, 0.9, 0.04) * np.exp(-t / 0.28)
    skin = fft_filter(noise(n), 300, 3000) * np.exp(-t / 0.03) * 0.5
    return np.tanh((s + skin) * 1.5)


def riser(dur, f_lo=300, f_hi=9000):
    n = int(dur * SR)
    x = noise(n)
    y = sweep_filter(x, lambda tt: f_lo * (f_hi / f_lo) ** (tt / dur) * 0.6, lambda tt: f_lo * (f_hi / f_lo) ** (tt / dur) * 1.6)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * np.cumsum(120 * (8 ** (t / dur))) / SR) * 0.25
    e = (t / dur) ** 2.2
    return (y / (np.abs(y).max() + 1e-9) * 0.8 + tone) * e


def whoosh(dur=0.45, f0=600, f1=4000):
    n = int(dur * SR)
    x = noise(n)
    y = sweep_filter(x, lambda tt: f0 + (f1 - f0) * (tt / dur), lambda tt: (f0 + (f1 - f0) * (tt / dur)) * 2.2, block=1024)
    t = np.arange(n) / SR
    e = np.sin(np.pi * t / dur) ** 2
    return y / (np.abs(y).max() + 1e-9) * e


def pluck(f, dur=2.4, bright=0.6):
    """Karplus-Strong string, block-vectorised (gayageum-ish with a pitch bend-in)."""
    n = int(dur * SR)
    p = int(SR / f)
    buf = fft_filter(noise(p * 4), 80, 2000 + 6000 * bright)[:p]
    out = np.zeros(n)
    out[:p] = buf
    decay = 0.996
    for s in range(p, n, p):
        prev = out[s - p:s]
        avg = 0.5 * (prev + np.roll(prev, 1))
        m = min(p, n - s)
        out[s:s + m] = (avg * decay)[:m]
    t = np.arange(n) / SR
    out *= np.exp(-t / (dur * 0.45))
    # body + gentle vibrato wobble on the tail (농현)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t - 0.25, 0, 1)
    idx = np.clip(np.cumsum(vib), 0, n - 1).astype(int)
    out = out[idx]
    return out / (np.abs(out).max() + 1e-9)


def pad(freqs, dur, attack=1.2, release=1.5, bright=1800):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            for h in range(1, 9):
                if ff * h > bright * 2:
                    break
                s += np.sin(2 * np.pi * ff * h * t + h * det * 7) / h * (1 / (1 + (ff * h / bright) ** 2))
    e = np.clip(t / attack, 0, 1) * np.clip((dur - t) / release, 0, 1)
    return s * e / (len(freqs) * 3)


def sizzle(dur):
    n = int(dur * SR)
    x = fft_filter(noise(n), 2500, 14000) * 0.25
    pops = np.zeros(n)
    k = int(dur * 380)
    for i in rng.integers(0, n - 400, k):
        ln = rng.integers(40, 300)
        pops[i:i + ln] += rng.standard_normal(ln) * np.exp(-np.arange(ln) / (ln / 4)) * rng.uniform(0.2, 1)
    pops = fft_filter(pops, 1500, 12000)
    amp = 0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * np.arange(n) / SR) ** 2
    return (x + pops * 0.8) * amp


def ping(f, dur=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t)) * np.exp(-t / (dur * 0.25))


def knock():
    n = int(0.8 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * 135 * t) * np.exp(-t / 0.12) + 0.5 * np.sin(2 * np.pi * 310 * t) * np.exp(-t / 0.06)
    s += fft_filter(noise(n), 200, 2500) * np.exp(-t / 0.02) * 0.8
    return np.tanh(s * 1.6)


# ----------------------------------------------------------------- arrangement
BEAT = 0.5
PENT = ['D', 'F', 'G', 'A', 'C']


def pent(i, octave=4):
    return note_hz(PENT[i % 5] + str(octave + i // 5))


# pads / chords per section
CHORDS = [(0, 4, ['D2', 'A2']), (4, 8, ['D3', 'F3', 'A3']), (8, 12, ['A#2', 'D3', 'F3']), (12, 16, ['D3', 'F3', 'A3', 'E4']),
          (16, 20, ['D3', 'A3', 'C4']), (20, 22, ['C3', 'G3', 'E4']), (22, 24, ['A#2', 'F3', 'D4']), (24, 26, ['A2', 'E3', 'C#4']),
          (26, 30, ['D3', 'F3', 'A3', 'C4']), (30, 36, ['D3', 'A3', 'D4', 'F4', 'E5'])]
for t0, t1, ch in CHORDS:
    place(pad([note_hz(c) for c in ch], t1 - t0 + 1.2, attack=0.6 if t0 else 2.5, release=1.4, bright=1400 if t0 < 12 else 2200), t0, gain=0.10, send=0.4)

# sub drone under the intro
place(np.sin(2 * np.pi * note_hz('D1') * np.arange(int(4.2 * SR)) / SR) * np.clip(np.arange(int(4.2 * SR)) / SR / 3, 0, 1) * 0.35, 0.0)

# HUD type-on ticks
for k in np.arange(0.35, 1.4, 0.045):
    place(hat() * 0.5, k, gain=0.25, pan=-0.6)

# intro gayageum phrase
for t, i, g in [(0.5, 5, .5), (1.0, 7, .45), (1.25, 8, .35), (1.75, 6, .45), (2.5, 4, .5), (3.0, 7, .4), (3.25, 9, .35)]:
    place(pluck(pent(i, 3)), t, gain=g * 0.55, pan=-0.3 + 0.15 * i % 0.6, send=0.5)

# risers into each drop
for t_end, d in [(4.0, 1.7), (12.0, 0.9), (16.0, 0.7), (20.0, 0.8), (30.0, 1.2)]:
    place(riser(d), t_end - d, gain=0.32, send=0.3)

# impacts
for t, a in [(4.0, 1.0), (12.0, .8), (16.0, .8), (20.0, .9), (30.0, 1.0)]:
    place(boom(2.6 if t in (4.0, 30.0) else 1.8), t, gain=0.85 * a, send=0.45)
for t in (5.0, 5.5, 6.0):
    place(taiko(92 - (t - 5) * 12), t, gain=0.75, send=0.35)
place(taiko(70), 8.0, gain=0.5, send=0.3)
place(taiko(80), 10.0, gain=0.6, send=0.3)
place(knock(), 28.5, gain=0.8, send=0.4)

# whooshes on wipes / camera moves
for t, d, g in [(7.55, .5, .5), (10.05, .6, .45), (11.45, .5, .35), (15.55, .5, .55), (19.5, .5, .3), (20.85, .3, .35), (21.85, .3, .35),
                (22.85, .3, .35), (23.85, .3, .35), (24.85, .3, .35), (25.6, .45, .4), (27.85, .65, .45), (29.6, .8, .5)]:
    place(whoosh(d), t, gain=g, pan=(t * 7 % 2) - 1, send=0.2)

# marbling score: ascending blips on 16ths 9.0 → 10.0
for k in range(9):
    place(ping(pent(k, 5), 0.35), 9.0 + k * 0.125, gain=0.18, pan=-0.8 + k * 0.2, send=0.3)
for k in range(9):  # strips appearing
    place(hat() * 0.6, 8.12 + k * 0.045, gain=0.25, pan=-0.8 + k * 0.2)

# drums: 12 → 26 (plate & grill & table), lighter in the plate section
for b in np.arange(12.0, 26.0, BEAT):
    sect_plate = 12.0 <= b < 16.0
    place(kick(0.9 if not sect_plate else 0.7), b, gain=0.8)
    if int(round((b - 12.0) / BEAT)) % 2 == 1:
        place(clap(), b, gain=0.38 if sect_plate else 0.55, send=0.35)
    for s in range(4):
        tt = b + s * BEAT / 4
        place(hat(open_=(s == 2 and not sect_plate)), tt, gain=(0.22 if s % 2 else 0.12), pan=0.35)

# bass line (sidechained feel via short notes) 12 → 26
roots = {12: 'D2', 14: 'F2', 16: 'D2', 18: 'C2', 20: 'C2', 22: 'A#1', 24: 'A1'}
for b in np.arange(12.0, 26.0, BEAT / 2):
    r = roots[max(k for k in roots if k <= b)]
    f = note_hz(r)
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2 * t)) * np.clip(t / 0.01, 0, 1) * np.exp(-t / 0.12)
    if (b * 4) % 2 == 1:
        s *= 0.7
    place(s, b + 0.06, gain=0.42)

# plate section melody (gayageum)
mel = [(12.25, 7), (12.75, 9), (13.25, 8), (13.75, 6), (14.25, 10), (14.75, 9), (15.0, 7), (15.25, 8)]
for t, i in mel:
    place(pluck(pent(i, 3), 1.8), t, gain=0.32, pan=0.25, send=0.55)

# salt shimmer
for k in range(46):
    t = 14.15 + rng.uniform(0, 1.2)
    place(ping(rng.choice([2349, 2794, 3136, 3520, 4186]), 0.25), t, gain=0.05, pan=rng.uniform(-0.8, 0.8), send=0.6)

# grill: sizzle bed + bursts
place(sizzle(4.0) * np.clip(np.arange(int(4.0 * SR)) / SR / 0.3, 0, 1), 16.0, gain=0.22, pan=0.0)
place(sizzle(1.2) * np.exp(-np.arange(int(1.2 * SR)) / SR / 0.5), 17.45, gain=0.35)
place(sizzle(1.6) * np.exp(-np.arange(int(1.6 * SR)) / SR / 0.6), 18.0, gain=0.3)

# table: accent plucks on each card
for k, t in enumerate([20.0, 21.0, 22.0, 23.0, 24.0, 25.0]):
    place(pluck(pent([5, 7, 6, 8, 9, 10][k], 3), 1.2), t, gain=0.3, pan=-0.4 + k * 0.16, send=0.4)

# place: pin drop + map pings
place(sine_sweep(900, 420, 0.4, 0.06) * np.exp(-np.arange(int(0.4 * SR)) / SR / 0.12), 27.0, gain=0.3, send=0.5)
place(taiko(60) * 0.6, 27.0, gain=0.5)
for k in range(6):
    place(ping(pent(k + 4, 4), 0.5), 26.1 + k * 0.25, gain=0.07, pan=-0.6 + k * 0.24, send=0.6)

# end: resolution phrase
for t, i, g in [(30.0, 5, .55), (30.5, 7, .45), (31.0, 9, .4), (31.5, 8, .35), (32.5, 10, .45), (33.5, 7, .35), (34.5, 5, .3)]:
    place(pluck(pent(i, 3), 3.0), t, gain=g * 0.6, pan=-0.2 + (i % 3) * 0.2, send=0.6)

# ----------------------------------------------------------------- reverb (FFT convolution)
ir_n = int(2.6 * SR)
tt = np.arange(ir_n) / SR
ir_l = fft_filter(rng.standard_normal(ir_n), 150, 7000) * np.exp(-tt / 0.55)
ir_r = fft_filter(rng.standard_normal(ir_n), 150, 7000) * np.exp(-tt / 0.55)
ir_l /= np.sqrt((ir_l ** 2).sum()); ir_r /= np.sqrt((ir_r ** 2).sum())


def conv(x, h):
    m = len(x) + len(h)
    k = 1 << (m - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, k) * np.fft.rfft(h, k), k)[:len(x)]


L += conv(SEND_L, ir_l) * 0.9
R += conv(SEND_R, ir_r) * 0.9

# ----------------------------------------------------------------- master
mix = np.stack([L, R])
mix = fft_filter(mix[0], 25), fft_filter(mix[1], 25)
mix = np.stack(mix)
peak = np.abs(mix).max()
mix = mix / peak * 1.25
mix = np.tanh(mix) / np.tanh(1.25) * 0.93
fade = np.ones(N)
fi = int(35.2 * SR)
fade[fi:] = np.linspace(1, 0, N - fi) ** 1.5
mix *= fade
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')

out = sys.argv[1] if len(sys.argv) > 1 else 'showreel.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'wrote {out}: {DUR}s, peak {np.abs(pcm).max() / 32767:.2f}')
