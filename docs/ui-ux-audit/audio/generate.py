#!/usr/bin/env python3
"""Original deterministic audio sketches. Standard-library PCM synthesis, no samples."""
from pathlib import Path
import array
import hashlib
import json
import math
import random
import wave

RATE = 44100
OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)
TAU = math.tau


def noise(duration, cutoff, seed=1):
    rng = random.Random(seed)
    a = 1 - math.exp(-TAU * cutoff / RATE)
    state = 0.0
    out = []
    for _ in range(round(duration * RATE)):
        state += a * (rng.uniform(-1, 1) - state)
        out.append(state)
    return out


def modes(t, fundamental, decay, amplitude=1.0, metallic=False):
    ratios = [1, 1.51, 2.11, 2.76, 3.47] if metallic else [1, 1.57, 2.33, 3.61]
    weights = [1, .32, .18, .10, .06] if metallic else [1, .27, .13, .055]
    return amplitude * sum(w * math.sin(TAU * fundamental * ratio * t) * math.exp(-t / (decay / (1 + i * .45))) for i, (ratio, w) in enumerate(zip(ratios, weights)))


def envelope(t, duration, attack=.01):
    return min(1, t / attack) * min(1, max(0, duration - t) / .04)


def render(name, duration, formula, peak=.50):
    low = noise(duration, 650, seed=11)
    mid = noise(duration, 3600, seed=11)
    air = noise(duration, 8000, seed=11)
    mono = []
    for i in range(len(low)):
        t = i / RATE
        sample = formula(t, low[i], mid[i] - low[i], air[i] - mid[i])
        mono.append(sample * envelope(t, duration, .003))
    mean = sum(mono) / len(mono)
    mono = [s - mean for s in mono]
    left, right = [], []
    delays = [(int(RATE * .019), .055), (int(RATE * .037), .035), (int(RATE * .061), .018)]
    for i, s in enumerate(mono):
        room = sum(mono[i - d] * gain for d, gain in delays if i >= d)
        end = min(1, (len(mono) - i - 1) / (RATE * .025))
        left.append((s + room) * end)
        right.append((s + sum(mono[i - d - 73] * gain for d, gain in delays if i >= d + 73)) * end)
    maximum = max(abs(v) for ch in [left, right] for v in ch) or 1
    gain = peak / maximum
    pcm = array.array('h')
    for a, b in zip(left, right):
        pcm.extend([round(a * gain * 32767), round(b * gain * 32767)])
    path = OUT / f"{name}.wav"
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    rms = math.sqrt(sum((s / 32767) ** 2 for s in pcm) / len(pcm))
    return {"file": path.name, "durationSeconds": round(len(left) / RATE, 3), "sampleRate": RATE, "channels": 2, "bitsPerSample": 16, "peakDbFS": round(20 * math.log10(peak), 2), "rmsDbFS": round(20 * math.log10(rms), 2), "clippedSamples": sum(abs(s) == 32767 for s in pcm), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


designs = [
    ("01-card-draw", "Card draw", "A short parchment scrape with a soft leather edge.", .34, lambda t, lo, band, air: .75 * band * (math.sin(math.pi * min(1, t / .27)) ** 1.2) * math.exp(-t * 5) + .16 * modes(t, 280, .026) + .03 * air * math.exp(-t * 16), .26),
    ("02-card-play", "Card play", "A compact leather-on-wood placement, warmer than a click.", .38, lambda t, lo, band, air: .65 * modes(t, 145, .052) + .37 * lo * math.exp(-t * 30) + .20 * band * math.exp(-t * 60), .40),
    ("03-land", "Land enters", "A low wooden body and a tiny stone texture.", .60, lambda t, lo, band, air: .8 * modes(t, 82, .105) + .13 * modes(t, 295, .07, metallic=True) + .38 * lo * math.exp(-t * 22) + .1 * band * math.exp(-t * 55), .46),
    ("04-cast", "Spell cast", "A breath of air into a muted, inharmonic metal resonance.", .95, lambda t, lo, band, air: .3 * band * math.sin(math.pi * min(1, t / .48)) ** 2 * math.exp(-t * 3) + (0 if t < .14 else .5 * modes(t - .14, 206, .25, metallic=True) * min(1, (t - .14) / .055)), .38),
    ("05-impact", "Combat impact", "A short drum-like thud with dull metal and rough texture.", .68, lambda t, lo, band, air: .85 * math.sin(TAU * (70 * t + 22 * .025 * (1 - math.exp(-t / .025)))) * math.exp(-t / .10) + .28 * modes(t, 220, .12, metallic=True) + .65 * lo * math.exp(-t / .08) + .25 * band * math.exp(-t / .018), .52),
    ("06-turn", "Your turn", "Two restrained bronze-like notes, rising by a fourth.", 1.0, lambda t, lo, band, air: .4 * modes(t, 196, .19, metallic=True) * min(1, t / .015) + (0 if t < .20 else .48 * modes(t - .20, 261.63, .21, metallic=True) * min(1, (t - .20) / .02)), .33),
    ("07-wing", "Flying cue", "A brief airy wing gesture. Intended for an ability change, not an idle loop.", .70, lambda t, lo, band, air: (.32 * band + .08 * air + .18 * lo) * (math.exp(-((t - .18) / .09) ** 2) + .65 * math.exp(-((t - .39) / .095) ** 2)), .22),
]

manifest = {"status": "Concept sketches; not integrated into Mesa de Duelo", "source": "Original deterministic procedural synthesis. No external samples or Arena audio.", "verification": "PCM format, durations, peak levels, clipping and filenames checked. Aesthetic listening review not performed by the generating agent.", "sounds": []}
for filename, title, description, duration, formula, peak in designs:
    result = render(filename, duration, formula, peak)
    result.update({"title": title, "description": description})
    manifest["sounds"].append(result)
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

cards = "\n".join(f'''<article><div class="number">{i:02}</div><div><h2>{x['title']}</h2><p>{x['description']}</p><audio controls preload="none" src="{x['file']}"></audio><a download href="{x['file']}">Download WAV</a></div><span class="duration">{x['durationSeconds']:.2f} s</span></article>''' for i, x in enumerate(manifest["sounds"], 1))
html = '''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mesa de Duelo — sound sketches</title>
<style>
:root{color-scheme:dark;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#141613;color:#f1eee4;font-size:16px}*{box-sizing:border-box}body{margin:0}main{max-width:850px;padding:64px 24px;margin:auto}.eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#c8ad74}h1{font-size:clamp(32px,6vw,52px);font-weight:550;letter-spacing:-.04em;margin:16px 0}header p{max-width:650px;line-height:1.6;color:#c5c7bd}header{padding-bottom:30px}aside{padding:16px 20px;border:1px solid #494b3e;border-radius:12px;color:#c5c7bd;line-height:1.5;font-size:14px;margin:20px 0 32px}article{display:grid;grid-template-columns:34px minmax(0,1fr) 48px;gap:16px;padding:28px 0;border-top:1px solid #34372d}.number,.duration{color:#a7ac9b;font-size:13px;padding-top:4px;font-variant-numeric:tabular-nums}h2{font-size:20px;font-weight:550;margin:0 0 8px}article p{color:#b5bbab;font-size:15px;line-height:1.5;margin:0 0 16px}audio{display:block;width:min(100%,410px);height:40px;margin-bottom:10px}a{font-size:13px;color:#d9c593;text-underline-offset:3px}footer{border-top:1px solid #34372d;padding-top:24px;color:#a7ac9b;font-size:13px;line-height:1.6}:focus-visible{outline:2px solid #d9c593;outline-offset:5px}@media(max-width:500px){main{padding:36px 18px}article{grid-template-columns:24px minmax(0,1fr);gap:12px}.duration{display:none}}
</style>
<main><header><div class="eyebrow">Mesa de Duelo / audio direction</div><h1>Wood, leather, air &amp; bronze.</h1><p>Seven short sound sketches for a quieter, tactile fantasy table. Each sound is original procedural synthesis, without external recordings or game samples.</p></header>
<aside><strong>Concept pack — not integrated into the app.</strong> No autoplay. Start with a comfortable device volume. Files passed format, duration and clipping checks; the generating agent did not perform an aesthetic listening review. Treat these as starting points for listening tests.</aside>
''' + cards + '''
<footer>Stereo PCM WAV · 44.1 kHz · 16-bit · Peaks below −5.6 dBFS.<br>Use the flying cue on entry or ability change; keep idle states silent. Audio should support the same information available visually.<br><a href="manifest.json">View synthesis manifest and technical checks</a></footer></main></html>'''
(OUT / "index.html").write_text(html)
print(json.dumps(manifest, indent=2))
