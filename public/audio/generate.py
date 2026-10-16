#!/usr/bin/env python3
"""Original tactile fantasy cues. Deterministic standard-library PCM synthesis, no samples."""
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

# This low drum/wood cue is reserved for damage to a player, never life payments.
designs.append(("08-player-hit", "Player damage", "A deep, short body hit with a muted bronze tail.", .84,
    lambda t, lo, band, air: 1.1 * math.sin(TAU * (48 * t + 35 * .035 * (1 - math.exp(-t / .035)))) * math.exp(-t / .14)
    + .30 * modes(t, 109, .17, metallic=True) + .60 * lo * math.exp(-t / .10) + .16 * band * math.exp(-t / .014), .48))

designs.extend([
    ("09-opponent-turn", "Opponent turn", "Two low wooden knocks descend, clearly separate from your rising bronze notes.", .82,
     lambda t, lo, band, air: .65 * modes(t, 118, .11) + .15 * lo * math.exp(-t / .055)
     + (0 if t < .22 else .62 * modes(t - .22, 88, .14) * min(1, (t - .22) / .006)), .35),
    ("10-ability", "Ability activation", "A small wooden ratchet and a short resonant mechanism; less dramatic than a spell.", .48,
     lambda t, lo, band, air: .45 * modes(t, 330, .052) + .18 * band * math.exp(-t / .018)
     + (0 if t < .085 else .32 * modes(t - .085, 440, .065, metallic=True) * min(1, (t - .085) / .004)), .34),
    ("11-resolved", "Resolution", "A soft struck glass-and-bronze settling note with a short tail.", .60,
     lambda t, lo, band, air: .36 * modes(t, 392, .15, metallic=True) * min(1, t / .008)
     + .13 * modes(t, 196, .08) + .08 * band * math.exp(-t / .035), .29),
    ("12-countered", "Countered spell", "A dry metal snap cuts through a collapsing breath of magic.", .56,
     lambda t, lo, band, air: .42 * modes(t, 570, .045, metallic=True) + .32 * band * math.exp(-t / .024)
     + .24 * lo * math.exp(-t / .12) + .22 * math.sin(TAU * (190 * t - 85 * t * t)) * math.exp(-t / .11), .39),
    ("13-attack", "Attack declared", "A leather-and-air forward sweep followed by a restrained wooden strike.", .48,
     lambda t, lo, band, air: (.38 * band + .18 * lo + .045 * air) * math.exp(-((t - .11) / .07) ** 2)
     + (0 if t < .16 else .50 * modes(t - .16, 135, .065) * min(1, (t - .16) / .004)), .39),
    ("14-block", "Block declared", "A compact shield-like wood-and-metal contact, distinct from damage.", .42,
     lambda t, lo, band, air: .48 * modes(t, 240, .07, metallic=True) + .56 * modes(t, 105, .05)
     + .22 * band * math.exp(-t / .016), .42),
])

if __name__ == "__main__":
    for filename, title, description, duration, formula, peak in designs:
        print(json.dumps(render(filename, duration, formula, peak)))
