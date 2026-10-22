"""
Builds src/render/people.json from the KayKit Adventurers pack (CC0, Kay
Lousberg): one shared skeleton, the body parts the prison uses, and the
animations it plays. Each vertex keeps its atlas colour plus a colour role
(skin, hair, top, trim, trousers, shoes, belt), so the game can dress anyone
in anything without shipping textures.

  python3 -I tools/people.py <path to Characters/gltf>
"""
import base64, json, struct, sys
from PIL import Image

SRC = sys.argv[1]
OUT = 'src/render/people.json'
KEEP, SKIN, HAIR, TOP, TRIM, TROUSERS, SHOES, BELT = range(8)

# (file, node, role per atlas cell 'x,y'; unlisted cells keep their colour)
PARTS = {
    'body.tunic': ('Mage', 'Mage_Body', {'0,1': TOP, '3,0': TRIM, '4,0': TRIM, '2,2': TRIM, '5,0': BELT, '7,1': TROUSERS, '0,2': TRIM}),
    'body.vest': ('Rogue', 'Rogue_Body', {'0,1': TOP, '1,1': TRIM, '6,0': BELT, '5,0': BELT, '7,1': BELT}),
    'arm.l': ('Mage', 'Mage_ArmLeft', {'0,1': TOP, '4,0': TRIM, '7,2': SKIN}),
    'arm.r': ('Mage', 'Mage_ArmRight', {'0,1': TOP, '4,0': TRIM, '7,2': SKIN}),
    'leg.l': ('Mage', 'Mage_LegLeft', {'7,1': TROUSERS, '3,2': SHOES}),
    'leg.r': ('Mage', 'Mage_LegRight', {'7,1': TROUSERS, '3,2': SHOES}),
    'head.long': ('Rogue', 'Rogue_Head', {'0,0': SKIN, '1,0': HAIR}),
    'head.short': ('Mage', 'Mage_Head', {'0,0': SKIN, '1,0': HAIR, '1,1': TOP}),
    'head.beard': ('Barbarian', 'Barbarian_Head', {'0,0': SKIN, '1,0': HAIR}),
    'head.quiff': ('Knight', 'Knight_Head', {'0,0': SKIN, '1,0': HAIR}),
}
CLIPS = ['Idle', 'Unarmed_Idle', 'Walking_A', 'Walking_B', 'Running_A', 'Unarmed_Melee_Attack_Punch_A',
         'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Melee_Attack_Kick', 'Hit_A', 'Death_A', 'Lie_Idle',
         'Sit_Chair_Idle', 'Sit_Floor_Idle', 'Cheer', 'Interact', 'PickUp', 'Use_Item', 'Block']

CT = {5126: ('f', 4), 5123: ('H', 2), 5121: ('B', 1), 5125: ('I', 4)}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def load(name):
    d = open(f'{SRC}/{name}.glb', 'rb').read()
    clen = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + clen])
    off = 20 + clen
    blen = struct.unpack('<I', d[off:off + 4])[0]
    return j, d[off + 8: off + 8 + blen]

def acc(j, b, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    fmt, sz = CT[a['componentType']]
    n = NC[a['type']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', sz * n)
    norm = a.get('normalized', False)
    out = []
    for k in range(a['count']):
        o = start + k * stride
        v = struct.unpack('<' + fmt * n, b[o:o + sz * n])
        if norm and fmt == 'B': v = tuple(x / 255 for x in v)
        if norm and fmt == 'H': v = tuple(x / 65535 for x in v)
        out.append(v)
    return out

def b64(fmt, values):
    return base64.b64encode(struct.pack('<' + fmt * len(values), *values)).decode()

def r(x, p=5):
    return round(x, p)

files = {}
def get(name):
    if name not in files:
        files[name] = load(name)
    return files[name]

# Skeleton, from the Mage (every KayKit adventurer shares it).
j, b = get('Mage')
skin = j['skins'][0]
joints = skin['joints']
names = [j['nodes'][k]['name'] for k in joints]
parent = {}
for i, n in enumerate(j['nodes']):
    for c in n.get('children', []): parent[c] = i
bones = []
for k in joints:
    n = j['nodes'][k]
    p = parent.get(k)
    bones.append({
        'name': n['name'],
        'parent': joints.index(p) if p in joints else -1,
        't': [r(x) for x in n.get('translation', [0, 0, 0])],
        'r': [r(x, 6) for x in n.get('rotation', [0, 0, 0, 1])],
        's': [r(x) for x in n.get('scale', [1, 1, 1])],
    })
ibm = [r(x, 6) for m in acc(j, b, skin['inverseBindMatrices']) for x in m]
# The root bone's parent node (the Rig) may carry a transform too.
rig = j['nodes'][parent[joints[0]]] if joints[0] in parent else {}
rig_t = {'t': rig.get('translation', [0, 0, 0]), 'r': rig.get('rotation', [0, 0, 0, 1]), 's': rig.get('scale', [1, 1, 1])}

atlases = {}
def atlas(name):
    if name not in atlases:
        atlases[name] = Image.open(f'{SRC}/{name.lower().split("_")[0]}_texture.png').convert('RGB')
    return atlases[name]

parts = {}
for key, (fname, node, roles) in PARTS.items():
    j, b = get(fname)
    n = next(x for x in j['nodes'] if x.get('name') == node)
    assert j['nodes'][[k for k in j['skins'][n['skin']]['joints']][0]]['name'] == 'root'
    pjoints = [j['nodes'][k]['name'] for k in j['skins'][n['skin']]['joints']]
    remap = [names.index(x) for x in pjoints]
    tex = atlas(fname)
    W, H = tex.size
    pos, nor, jo, we, col, role, shade, idx = [], [], [], [], [], [], [], []
    luma = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    means = {}
    def cell_mean(cx, cy):
        if (cx, cy) not in means:
            x = cx * W // 8 + W // 16
            ys = range(cy * H // 4 + 4, (cy + 1) * H // 4 - 4, 4)
            means[(cx, cy)] = sum(luma(tex.getpixel((x, y))) for y in ys) / len(ys)
        return means[(cx, cy)]
    for prim in j['meshes'][n['mesh']]['primitives']:
        base = len(pos) // 3
        A = prim['attributes']
        P = acc(j, b, A['POSITION']); N = acc(j, b, A['NORMAL']); UV = acc(j, b, A['TEXCOORD_0'])
        J = acc(j, b, A['JOINTS_0']); WT = acc(j, b, A['WEIGHTS_0'])
        for v in range(len(P)):
            pos += [r(x) for x in P[v]]; nor += [r(x, 4) for x in N[v]]
            jo += [remap[x] for x in J[v]]; we += [r(x, 4) for x in WT[v]]
            u, w = UV[v]
            cx, cy = min(7, int(u * 8)), min(3, int(w * 4))
            px = tex.getpixel((min(W - 1, int(u * W)), min(H - 1, int(w * H))))
            col += list(px)
            role.append(roles.get(f'{cx},{cy}', KEEP))
            # How light this texel is against its swatch: recoloured
            # clothes keep the atlas's soft gradient.
            shade.append(max(0, min(255, round(100 * luma(px) / max(1, cell_mean(cx, cy))))))
        idx += [base + i[0] for i in acc(j, b, prim['indices'])]
    # Average normals across seams (vertices split for UVs at the same
    # spot), so the screen-space ink only finds real edges.
    groups = {}
    for v in range(len(pos) // 3):
        k = (round(pos[v * 3], 3), round(pos[v * 3 + 1], 3), round(pos[v * 3 + 2], 3), role[v] == KEEP)
        groups.setdefault(k, []).append(v)
    for vs in groups.values():
        if len(vs) < 2: continue
        sx = sum(nor[v * 3] for v in vs); sy = sum(nor[v * 3 + 1] for v in vs); sz = sum(nor[v * 3 + 2] for v in vs)
        ln = (sx * sx + sy * sy + sz * sz) ** 0.5 or 1
        for v in vs:
            # Only blend near-matching normals: a crease of more than ~60
            # degrees is a real edge and keeps its ink.
            if nor[v * 3] * sx / ln + nor[v * 3 + 1] * sy / ln + nor[v * 3 + 2] * sz / ln > 0.5:
                nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2] = r(sx / ln, 4), r(sy / ln, 4), r(sz / ln, 4)
    parts[key] = {
        'count': len(pos) // 3,
        'position': b64('f', pos), 'normal': b64('f', nor),
        'joints': b64('B', jo), 'weights': b64('f', we),
        'colour': b64('B', col), 'role': b64('B', role), 'shade': b64('B', shade), 'index': b64('H', idx),
    }

# Animations, from the Mage. Tracks name the bone; times and values flat.
j, b = get('Mage')
clips = []
for a in j['animations']:
    if a['name'] not in CLIPS: continue
    tracks = []
    for ch in a['channels']:
        node = j['nodes'][ch['target']['node']]['name']
        if node not in names: continue
        path = ch['target']['path']
        s = a['samplers'][ch['sampler']]
        times = [t[0] for t in acc(j, b, s['input'])]
        vals = [x for v in acc(j, b, s['output']) for x in v]
        if path == 'scale' and all(abs(x - 1) < 1e-4 for x in vals): continue
        if len(times) > 2 and all(abs(vals[i] - vals[i % (len(vals) // len(times))]) < 1e-5 for i in range(len(vals))): 
            times, vals = times[:1], vals[: len(vals) // len(times)]
        tracks.append({'bone': node, 'path': path, 'interp': s.get('interpolation', 'LINEAR'),
                       'times': b64('f', [r(t, 4) for t in times]), 'values': b64('f', [r(x, 5) for x in vals])})
    clips.append({'name': a['name'], 'tracks': tracks})

json.dump({'source': 'KayKit Character Pack: Adventurers 1.0 by Kay Lousberg, CC0', 'bones': bones, 'ibm': b64('f', ibm), 'rig': rig_t,
           'parts': parts, 'clips': clips}, open(OUT, 'w'), separators=(',', ':'))
import os
print(OUT, os.path.getsize(OUT) // 1024, 'KB;', len(parts), 'parts;', len(clips), 'clips;', len(bones), 'bones')
