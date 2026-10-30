# The chibi hero's hand poses from a CC0 reference (Quaternius Universal Animation Library,
# tests/browser/out/ual/UAL1.glb via scripts/pose-retarget/fetch-ual.sh): for each pose a clip and a
# time, and for each hand the direction of every finger bone (from its joint to the next) in the
# hand's own frame: F out along the hand (wrist to the middle knuckle), A across it toward the thumb
# side (pinky knuckle to index knuckle, square to F) and P = F x A. The game builds the same frame
# from the chibi's finger bones (chibi-body.js handPose) and turns each bone onto these directions,
# so the poses carry over whatever the two hands' proportions. Writes data/models.json
# characters.hero_chibi.hands.poses.
#   python3 scripts/hand-poses.py
import json, struct, sys
import numpy as np

SRC = 'tests/browser/out/ual/UAL1.glb'
# pose: (clip, fraction of its length, hand) - None takes each hand from the clip itself
# (UAL's idle hands are closed fists; the open hand is the "paper" of its rock-paper-scissors idles,
# the relaxed one the free left hand of its sword idle; every pose takes one hand for both)
POSES = {
    'open': ('Idle_Paper', 0.7, 'r'),     # the right hand opened flat
    'relaxed': ('Sword_Idle', 0.5, 'l'),  # the free hand, curled a little
    'fist': ('Idle_Rock', 0.7, 'r'),      # a closed fist
    'grip': ('Sword_Idle', 0.25, 'r'),    # round a sword's grip
}
FINGERS = {'Thumb': 'thumb', 'Index': 'index', 'Middle': 'middle', 'Ring': 'ring', 'Pinky': 'pinky'}

raw = open(SRC, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]
G = json.loads(raw[20:20 + jl])
B = raw[28 + jl:]
names = [n.get('name', '') for n in G['nodes']]
parent = {c: i for i, n in enumerate(G['nodes']) for c in n.get('children', [])}


def acc(i):
    a = G['accessors'][i]; v = G['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return np.frombuffer(B, np.float32, a['count'] * n, v.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], n)


def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                     w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2])


def qrot(q, v):
    return qmul(qmul(q, np.r_[v, 0]), q * np.array([-1, -1, -1, 1]))[:3]


def sample(anim, t):
    """each animated node's local rotation and translation at time t"""
    out = {}
    for ch in anim['channels']:
        s = anim['samplers'][ch['sampler']]
        T = acc(s['input'])[:, 0]; V = acc(s['output'])
        if s.get('interpolation') == 'CUBICSPLINE': V = V[1::3]
        k = int(np.clip(np.searchsorted(T, t) - 1, 0, len(T) - 2)); f = np.clip((t - T[k]) / max(T[k + 1] - T[k], 1e-9), 0, 1)
        if ch['target']['path'] == 'rotation':
            a, b = V[k], V[k + 1]
            if np.dot(a, b) < 0: b = -b
            q = a * (1 - f) + b * f; out.setdefault(ch['target']['node'], {})['r'] = q / np.linalg.norm(q)
        elif ch['target']['path'] == 'translation':
            out.setdefault(ch['target']['node'], {})['t'] = V[k] * (1 - f) + V[k + 1] * f
    return out


def local(i, S):
    n = G['nodes'][i]
    r = S.get(i, {}).get('r', np.array(n.get('rotation', [0, 0, 0, 1]), float))
    t = S.get(i, {}).get('t', np.array(n.get('translation', [0, 0, 0]), float))
    return r, t


def in_hand(i, hand, S):
    """node i's position in the hand's frame (the hand bone's local space)"""
    chain = []
    while i != hand: chain.append(i); i = parent[i]
    p, q = np.zeros(3), np.array([0, 0, 0, 1.0])
    for j in reversed(chain):
        r, t = local(j, S)
        p = p + qrot(q, t); q = qmul(q, r)
    return p


def pose(S, s, mirror=False):
    hand = names.index(f'hand_{s}')
    pos = {f: [in_hand(names.index(f'{u}_{k:02d}{"_leaf" if k == 4 else ""}_{s}'), hand, S) for k in (1, 2, 3, 4)] for f, u in FINGERS.items()}
    F = pos['Middle'][0] / np.linalg.norm(pos['Middle'][0])
    A = pos['Index'][0] - pos['Pinky'][0]; A -= F * np.dot(A, F); A /= np.linalg.norm(A)
    P = np.cross(F, A)
    out = {}
    for f, p in pos.items():
        d = [(p[k + 1] - p[k]) / np.linalg.norm(p[k + 1] - p[k]) for k in range(3)]
        # P = F x A points to the palm on one hand and to its back on the other: a pose taken from the
        # other hand turns its P over
        out[f] = [[round(float(np.dot(v, F)), 4), round(float(np.dot(v, A)), 4), round(float(np.dot(v, P)) * (-1 if mirror else 1), 4)] for v in d]
    return out


anims = {a['name']: a for a in G['animations']}
res = {}
for name, (clip, frac, only) in POSES.items():
    a = anims[clip]
    end = max(acc(s['input'])[-1, 0] for s in a['samplers'])
    S = sample(a, frac * end)
    res[name] = {'clip': f'UAL1 {clip} at {frac:.2f}'}
    for s, side in (('l', 'Left'), ('r', 'Right')):
        res[name][side] = pose(S, only or s, mirror=bool(only) and only != s)

# `rest`: the empty hand at rest, as an anime hand hangs: the open hand's fingers drawn together
# (`together`: that share of their spread kept) and each curled a little further toward the fist than
# the one before it, the index least (`curl`). The reference's free hand (its sword idle's left) holds
# its fingers fanned and bent unevenly, and on the chibi's short fingers it read as a claw.
REST = {'together': 0.25, 'curl': {'Thumb': 0.25, 'Index': 0.3, 'Middle': 0.36, 'Ring': 0.42, 'Pinky': 0.48}}


def between(a, b, k):
    v = (1 - k) * np.array(a) + k * np.array(b)
    return v / np.linalg.norm(v)


res['rest'] = {'clip': 'UAL1 Idle_Paper at 0.70 and Idle_Rock at 0.70, between (scripts/hand-poses.py REST)'}
for side in ('Left', 'Right'):
    res['rest'][side] = {}
    for f in FINGERS:
        out = []
        for o, c in zip(res['open'][side][f], res['fist'][side][f]):
            o = np.array(o, float)
            if f != 'Thumb': o[1] *= REST['together']
            out.append([round(float(x), 4) for x in between(o / np.linalg.norm(o), c, REST['curl'][f])])
        res['rest'][side][f] = out
for name in res:
    curl = {f: round(float(np.degrees(np.arccos(np.clip(res[name]['Right'][f][2][0], -1, 1)))), 0) for f in FINGERS}
    print(name, 'tip bone off the hand line (deg):', curl)

# into data/models.json as text (the file's own layout kept): the `hands` entry replaced or added
# as hero_chibi's first key
txt = open('data/models.json').read()
M = json.loads(txt)
hands = dict(M['characters']['hero_chibi'].get('hands', {}), poses=res)
start = txt.index('"hero_chibi": {') + len('"hero_chibi": {')
body = json.dumps({'hands': hands}, indent=2, ensure_ascii=False)[1:-1].strip('\n')
import re
body = re.sub(r'\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]', r'[\1, \2, \3]', body)  # a direction on one line
body = '\n'.join('    ' + l for l in body.split('\n'))
if 'hands' in M['characters']['hero_chibi']:
    i = txt.index('"hands": {', start); depth = 0
    for j in range(i + len('"hands": '), len(txt)):
        depth += {'{': 1, '}': -1}.get(txt[j], 0)
        if depth == 0: break
    txt = txt[:txt.rindex('\n', 0, i) + 1] + body.lstrip('\n') + txt[j + 1:]
else:
    txt = txt[:start] + '\n' + body + ',' + txt[start:]
json.loads(txt)
open('data/models.json', 'w').write(txt)
print('wrote data/models.json characters.hero_chibi.hands.poses')
