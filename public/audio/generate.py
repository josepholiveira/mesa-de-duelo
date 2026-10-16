#!/usr/bin/env python3
"""Deterministic game cues. Standard library only; twelve original physical-model cues.

The two damage cues adapt bundled SFXMint-generated CC0 takes. Their checksums,
licenses and generation provenance are recorded in sources/manifest.json; regeneration needs no network.

Actions use different materials, envelopes and rhythms. Playback pitch variation is
only a finishing detail, not the source of their identity.
"""
from pathlib import Path
from functools import lru_cache
import array
import hashlib
import json
import math
import random
import sys
import wave

RATE = 44100
OUT = Path(__file__).resolve().parent
TAU = math.tau


def add_texture(buf, start, duration, band, amplitude, seed, envelope):
    """Band-limited friction, independently seeded for each material and layer."""
    rng = random.Random(seed)
    low = high = smooth = rounded = 0.0
    a = 1 - math.exp(-TAU * band[0] / RATE)
    b = 1 - math.exp(-TAU * band[1] / RATE)
    offset = round(start * RATE)
    for i in range(min(round(duration * RATE), len(buf) - offset)):
        sample = rng.uniform(-1, 1)
        high += b * (sample - high)
        smooth += b * (high - smooth)
        rounded += b * (smooth - rounded)
        low += a * (rounded - low)
        buf[offset + i] += (rounded - low) * amplitude * envelope(i / RATE)


def add_modes(buf, start, modes, amplitude=1.0, attack=.002):
    """Damped resonances: each material supplies its own frequencies and decay."""
    offset = round(start * RATE)
    for i in range(len(buf) - offset):
        t = i / RATE
        buf[offset + i] += amplitude * min(1, t / attack) * sum(
            weight * math.sin(TAU * frequency * t) * math.exp(-t / decay)
            for frequency, weight, decay in modes)


def add_drum(buf, start, frequency, sweep, decay, amplitude):
    offset = round(start * RATE)
    for i in range(len(buf) - offset):
        t = i / RATE
        phase = TAU * (frequency * t + sweep * .025 * (1 - math.exp(-t / .025)))
        buf[offset + i] += amplitude * math.sin(phase) * math.exp(-t / decay) * min(1, t / .003)


def bell(t, center, width):
    return math.exp(-((t - center) / width) ** 2)


def draw(buf):
    # Two uneven paper strokes, fine corrugation and a tiny edge flick. No tone.
    add_texture(buf, 0, .28, (1050, 6300), 1.3, 101,
                lambda t: (bell(t, .055, .035) + .60 * bell(t, .17, .055)) * (.72 + .28 * math.sin(TAU * 83 * t) ** 2))
    add_texture(buf, .205, .055, (1800, 7700), .24, 102, lambda t: math.exp(-t / .009))


def placement(buf):
    # Leather on a felt-covered table, deliberately short and quiet.
    add_texture(buf, 0, .10, (160, 1600), .9, 201, lambda t: math.exp(-t / .025))
    add_modes(buf, .004, [(178, .55, .027), (306, .19, .018), (487, .07, .011)])


def land(buf):
    # Broad wooden contact followed by a small, separate stone tick.
    add_modes(buf, 0, [(94, 1, .095), (173, .32, .052), (281, .13, .030)])
    add_texture(buf, 0, .12, (65, 950), 1.25, 301, lambda t: math.exp(-t / .035))
    add_modes(buf, .085, [(710, .22, .025), (1193, .12, .014)], attack=.001)
    add_texture(buf, .07, .16, (800, 3000), .22, 302, lambda t: bell(t, .035, .025))


def cast(buf):
    # A short staff-like strike anchors the growing air and glass/metal fifth.
    add_drum(buf, .025, 126, 24, .045, .57)
    add_modes(buf, .025, [(221, .16, .035), (487, .08, .023)], attack=.002)
    add_texture(buf, .025, .08, (140, 1500), .30, 403, lambda t: math.exp(-t / .016))
    add_texture(buf, 0, .46, (450, 4300), .85, 401, lambda t: bell(t, .18, .11))
    add_modes(buf, .19, [(659.25, .36, .23), (987.77, .23, .25), (1760, .055, .10)], attack=.055)
    add_modes(buf, .29, [(1318.5, .08, .17), (1975.5, .025, .11)], attack=.045)


@lru_cache(maxsize=2)
def damage_source(cue):
    """Use only the exact licensed source recorded with the repository."""
    source = json.loads((OUT / 'sources/manifest.json').read_text())['sources'][cue]
    path = OUT / 'sources' / source['file']
    data = path.read_bytes()
    if source['license'] != 'CC0-1.0' or hashlib.sha256(data).hexdigest() != source['sha256']:
        raise ValueError('Damage source license/checksum does not match its manifest')
    with wave.open(str(path), 'rb') as wav:
        if wav.getframerate() != RATE or wav.getnchannels() != 2 or wav.getsampwidth() != 2:
            raise ValueError('Damage source must be stereo 44.1 kHz PCM16')
        pcm = array.array('h', wav.readframes(wav.getnframes()))
    if sys.byteorder != 'little':
        pcm.byteswap()
    mono = [(pcm[i] + pcm[i + 1]) / 65534 for i in range(0, len(pcm), 2)]
    # Remove pre-roll, retaining 1 ms before the first meaningful transient.
    peak = max(map(abs, mono))
    onset = next(i for i, sample in enumerate(mono) if abs(sample) >= peak * .025)
    return mono[max(0, onset - round(.001 * RATE)):]


def add_explosion(buf, cue, speed, cutoff, decay, amplitude):
    source = damage_source(cue)
    a = 1 - math.exp(-TAU * cutoff / RATE)
    filtered = smooth = 0.0
    for i in range(len(buf)):
        position = i * speed
        at = int(position)
        if at + 1 >= len(source):
            break
        sample = source[at] + (source[at + 1] - source[at]) * (position - at)
        filtered += a * (sample - filtered)
        smooth += a * (filtered - smooth)
        t = i / RATE
        tail = min(1, (len(buf) - i - 1) / (RATE * .12))
        buf[i] += smooth * math.exp(-t / decay) * tail * amplitude


def creature_hit(buf):
    # Fast, dry little explosion; the source burst supplies the material.
    add_explosion(buf, 'creature', speed=1.65, cutoff=4400, decay=.22, amplitude=1.8)
    add_drum(buf, 0, 116, 46, .026, .08)


def your_turn(buf):
    # Three rising drum/wood strikes, ending in bronze: short-short-emphatic.
    for start, note, amplitude, seed in [(0, 88, .62, 601), (.105, 118, .72, 602), (.255, 164, 1, 603)]:
        add_drum(buf, start, note, 30, .085, amplitude)
        add_modes(buf, start, [(note * 2.1, .23, .050), (note * 3.7, .09, .025)], amplitude)
        add_texture(buf, start, .095, (160, 1900), .33 * amplitude, seed, lambda t: math.exp(-t / .018))
    add_modes(buf, .255, [(392, .28, .17), (653, .13, .11), (1081, .05, .065)], attack=.003)


def wing(buf):
    add_texture(buf, 0, .51, (180, 1700), 1, 701,
                lambda t: bell(t, .12, .065) + .62 * bell(t, .31, .085))


def player_hit(buf):
    # Slower blast with low body and a brief rumble; never used for life payment.
    add_explosion(buf, 'player', speed=.82, cutoff=2900, decay=.48, amplitude=1.6)
    add_drum(buf, .012, 44, 29, .14, .12)
    add_modes(buf, .012, [(98, .07, .13), (151, .025, .08)], attack=.004)


def opponent_turn(buf):
    # Two slower descending war-drum strikes; a dull shield edge, no melody.
    for start, note, amplitude, seed in [(0, 73, .76, 901), (.31, 51, 1, 902)]:
        add_drum(buf, start, note, 37, .145, amplitude)
        add_modes(buf, start, [(note * 2.2, .33, .11), (note * 3.9, .13, .065)], amplitude)
        add_texture(buf, start, .13, (70, 1250), .55 * amplitude, seed, lambda t: math.exp(-t / .028))
    add_modes(buf, .31, [(307, .11, .055), (519, .045, .035)], attack=.002)


def ability(buf):
    # Uneven ratchet teeth and a spring latch: three dry mechanical transients.
    for start, amplitude, seed in [(0, .75, 1001), (.046, .50, 1002), (.123, 1, 1003)]:
        add_texture(buf, start, .044, (850, 3900), amplitude, seed, lambda t: math.exp(-t / .006))
        add_modes(buf, start, [(1260, .12, .009), (1860, .065, .006)], amplitude, attack=.001)
    add_modes(buf, .123, [(395, .13, .032)], attack=.001)


def resolved(buf):
    # A fabric/air settling gesture, not a repeated bell after every spell.
    add_texture(buf, 0, .25, (160, 1900), .8, 1101,
                lambda t: bell(t, .045, .028) + .23 * bell(t, .13, .045))


def countered(buf):
    # Inward suction ends in a dry glass cut, without a descending beep.
    add_texture(buf, 0, .18, (600, 4600), .8, 1201, lambda t: (t / .18) ** 1.6)
    add_texture(buf, .18, .07, (1600, 6500), .8, 1202, lambda t: math.exp(-t / .009))
    add_modes(buf, .18, [(1680, .13, .015), (2715, .06, .010)], attack=.001)


def attack(buf):
    # Forward cloth-and-air rush, increasing movement instead of an impact.
    add_texture(buf, 0, .40, (130, 2600), 1, 1301,
                lambda t: bell(t, .235, .095) * (.80 + .20 * math.sin(TAU * (13 * t + 32 * t * t))))
    add_texture(buf, .09, .22, (2200, 5200), .16, 1302, lambda t: bell(t, .145, .05))


def block(buf):
    # Shield edge: bright inharmonic plate with a wooden contact underneath.
    add_modes(buf, 0, [(541, .50, .12), (913, .31, .10), (1478, .20, .075), (2123, .11, .05)], attack=.0015)
    add_modes(buf, 0, [(158, .20, .028)], attack=.002)
    add_texture(buf, 0, .06, (600, 4400), .6, 1401, lambda t: math.exp(-t / .008))


# file, material, duration, peak, reflection amount, composer
DESIGNS = [
    ('01-card-draw', 'paper / two brushed strokes', .30, .28, 0, draw),
    ('02-card-play', 'leather / soft placement', .23, .25, 0, placement),
    ('03-land', 'wood then stone / double contact', .48, .44, .025, land),
    ('04-cast', 'staff strike then air and glass / grounded bloom', .88, .40, .10, cast),
    ('05-impact', 'SFXMint explosion / compact fiery burst', .46, .46, .015, creature_hit),
    ('06-turn', 'drum, wood and bronze / three rising strikes', .94, .44, .065, your_turn),
    ('07-wing', 'cloth and air / two flutters', .53, .25, .015, wing),
    ('08-player-hit', 'SFXMint explosion / deeper blast and short rumble', .92, .50, .045, player_hit),
    ('09-opponent-turn', 'war drum and dull shield / two descending strikes', 1.04, .46, .06, opponent_turn),
    ('10-ability', 'ratchet and latch / three irregular clicks', .29, .31, 0, ability),
    ('11-resolved', 'fabric and air / quiet settle', .27, .18, 0, resolved),
    ('12-countered', 'suction and glass cut / swell then snap', .37, .36, .015, countered),
    ('13-attack', 'leather and air / forward rush', .43, .35, .03, attack),
    ('14-block', 'shield plate / bright contact', .52, .40, .045, block),
]


def render(name, material, duration, peak, room, compose):
    mono = [0.0] * round(duration * RATE)
    compose(mono)
    mean = sum(mono) / len(mono)
    mono = [(sample - mean) * min(1, i / (RATE * .002), (len(mono) - i - 1) / (RATE * .022))
            for i, sample in enumerate(mono)]
    channels = []
    for offset in [0, 97]:
        reflections = [(round(RATE * .029) + offset, room), (round(RATE * .071) + offset, room * .45)]
        channels.append([(sample + sum(mono[i - d] * gain for d, gain in reflections if i >= d))
                         * min(1, (len(mono) - i - 1) / (RATE * .015)) for i, sample in enumerate(mono)])
    gain = peak / (max(abs(sample) for channel in channels for sample in channel) or 1)
    pcm = array.array('h', (round(sample * gain * 32767) for pair in zip(*channels) for sample in pair))
    rms = math.sqrt(sum((sample / 32767) ** 2 for sample in pcm) / len(pcm))
    clipped = sum(abs(sample) >= 32767 for sample in pcm)
    if sys.byteorder != 'little':
        pcm.byteswap()
    path = OUT / f'{name}.wav'
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    return {'file': path.name, 'material': material, 'durationSeconds': duration,
            'peakDbFS': round(20 * math.log10(peak), 2), 'rmsDbFS': round(20 * math.log10(rms), 2),
            'clippedSamples': clipped, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == '__main__':
    for design in DESIGNS:
        print(json.dumps(render(*design)))
