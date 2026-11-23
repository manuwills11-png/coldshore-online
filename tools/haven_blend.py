# Haven structures for ColdShore, built in Blender and exported as one GLB.
# Every asset is an empty named HV_<thing>[_<level>] with its meshes under it. Units are metres.
# Convention: origin on the ground at the asset's anchor, front (doors, ladders, openings) toward Blender -Y
# (= three.js +Z = game +y, "south") unless noted. Materials are named HV_* so the game can tune them.
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, Euler
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene

# ---------------------------------------------------------------- materials
MATS = {}
def mat(name, col, rough=.85, metal=0., emit=None, alpha=1.):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new('HV_' + name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*[((col >> s) & 255) / 255 for s in (16, 8, 0)], 1)
    # sRGB -> linear for the factor glTF stores
    b.inputs['Base Color'].default_value = tuple([(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4) for c in b.inputs['Base Color'].default_value[:3]] + [1])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit is not None:
        b.inputs['Emission Color'].default_value = b.inputs['Base Color'].default_value; b.inputs['Emission Strength'].default_value = emit
    if alpha < 1: b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'
    MATS[name] = m; return m
M = dict(
    plank=mat('plank', 0x7b5c3c), plank2=mat('plank2', 0x8c6a45), plankD=mat('plankD', 0x4c3825), log=mat('log', 0x5e4630), bark=mat('bark', 0x4a3a2a),
    galv=mat('galv', 0x9aa3a8, .45, .7), steel=mat('steel', 0x4b535a, .5, .65), steelD=mat('steelD', 0x2d3236, .55, .6), rust=mat('rust', 0x7d4a2a, .8, .35), rust2=mat('rust2', 0x9a5a30, .85, .25),
    conc=mat('conc', 0x9c9d98, .95), concD=mat('concD', 0x7a7b76, .95), sand=mat('sand', 0xa8996f, .98), tarpG=mat('tarpG', 0x4d5a38, .9), tarpB=mat('tarpB', 0x2e4b66, .8),
    canvas=mat('canvas', 0xd6d0be, .9), red=mat('red', 0xa31f1f, .6), green=mat('green', 0x3e5b3b, .7), yellow=mat('yellow', 0xd2a024, .6), black=mat('black', 0x17181a, .8),
    tire=mat('tire', 0x1b1b1c, .95), glass=mat('glass', 0x8fb4c0, .1, 0, None, .35), bulb=mat('bulb', 0xffe2a0, .5, 0, 6.), redL=mat('redL', 0xff2a1a, .5, 0, 8.),
    copper=mat('copper', 0xb06a3a, .45, .8), white=mat('white', 0xe6e2d8, .7), solar=mat('solar', 0x1b2944, .25, .5), wire=mat('wire', 0xb0b6ba, .4, .8), hay=mat('hay', 0xcaa848, .95),
    olive=mat('olive', 0x4a5236, .8, .2), orange=mat('orange', 0xc8641e, .6), paper=mat('paper', 0xe9e1c8, .95), stone=mat('stone', 0x6d6a64, .95), soil=mat('soil', 0x3e2c1e, .98))

# ---------------------------------------------------------------- primitives
CUR = []   # objects of the asset being built
def _link(o, m):
    SC.collection.objects.link(o)
    if m is not None: o.data.materials.append(m)
    CUR.append(o); return o
def box(sx, sy, sz, x, y, z, m, rz=0., rx=0., ry=0., bev=.012):
    me = bpy.data.meshes.new('b'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('b', me); o.scale = (sx, sy, sz); o.location = (x, y, z); o.rotation_euler = (rx, ry, rz)
    _link(o, m)
    if bev and min(sx, sy, sz) > bev * 3: md = o.modifiers.new('bv', 'BEVEL'); md.width = bev; md.segments = 1; md.limit_method = 'NONE'
    return o
def cyl(r, h, x, y, z, m, seg=10, rx=0., ry=0., rz=0., r2=None, cap=True):
    me = bpy.data.meshes.new('c'); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('c', me); o.location = (x, y, z); o.rotation_euler = (rx, ry, rz); return _link(o, m)
def sphere(r, x, y, z, m, sx=1, sy=1, sz=1, seg=8):
    me = bpy.data.meshes.new('s'); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(4, seg // 2), radius=r); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('s', me); o.location = (x, y, z); o.scale = (sx, sy, sz); return _link(o, m)
def torus(R, r, x, y, z, m, rx=0., ry=0., seg=12, seg2=6):
    me = bpy.data.meshes.new('t'); bm = bmesh.new(); verts = []
    for i in range(seg):
        a = i / seg * 2 * math.pi; ring = []
        for j in range(seg2):
            b = j / seg2 * 2 * math.pi; ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        verts.append(ring)
    for i in range(seg):
        for j in range(seg2): bm.faces.new((verts[i][j], verts[(i + 1) % seg][j], verts[(i + 1) % seg][(j + 1) % seg2], verts[i][(j + 1) % seg2]))
    bm.normal_update(); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('t', me); o.location = (x, y, z); o.rotation_euler = (rx, ry, 0); return _link(o, m)
def beam(p, q, t, m, t2=None):   # a square beam from p to q
    p, q = Vector(p), Vector(q); d = q - p; L = d.length
    o = box(t, t2 or t, L, 0, 0, 0, m, bev=0); o.location = (p + q) / 2; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); return o
def rod(p, q, r, m, seg=6):
    p, q = Vector(p), Vector(q); d = q - p; o = cyl(r, d.length, 0, 0, 0, m, seg); o.location = (p + q) / 2; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); return o
def corrugated(w, h, x, y, z, m, rz=0., rx=0., waves=None, amp=.025):   # a corrugated sheet lying in its local XZ plane, w along X, h along Z
    me = bpy.data.meshes.new('cg'); bm = bmesh.new(); n = waves or max(4, int(w / .076)); cols = []
    for i in range(n * 2 + 1):
        u = i / (n * 2); xx = (u - .5) * w; yy = amp * math.sin(u * n * 2 * math.pi)
        cols.append((bm.verts.new((xx, yy, -h / 2)), bm.verts.new((xx, yy, h / 2))))
    for i in range(len(cols) - 1): bm.faces.new((cols[i][0], cols[i + 1][0], cols[i + 1][1], cols[i][1]))
    bm.normal_update(); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('cg', me); o.location = (x, y, z); o.rotation_euler = (rx, 0, rz); return _link(o, m)
def pyramid(w, h, x, y, z, m, d=None):
    me = bpy.data.meshes.new('p'); bm = bmesh.new(); d = d or w
    vs = [bm.verts.new(v) for v in ((-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0), (0, 0, h))]
    for f in ((0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)): bm.faces.new([vs[i] for i in f])
    bm.normal_update(); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('p', me); o.location = (x, y, z); return _link(o, m)
def gable(w, d, h, x, y, z, m, ridge='x'):   # a two-slope roof, ridge along x or y
    me = bpy.data.meshes.new('g'); bm = bmesh.new()
    if ridge == 'x': V = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0), (-w / 2, 0, h), (w / 2, 0, h)]; F = ((0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (3, 2, 1, 0))
    else: V = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0), (0, -d / 2, h), (0, d / 2, h)]; F = ((0, 4, 5, 3), (1, 2, 5, 4), (0, 1, 4), (2, 3, 5), (3, 2, 1, 0))
    vs = [bm.verts.new(v) for v in V]
    for f in F: bm.faces.new([vs[i] for i in f])
    bm.normal_update(); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('g', me); o.location = (x, y, z); return _link(o, m)

# ---------------------------------------------------------------- composite props
def sandbags(x, y, z, length, rows, rz=0., m=None):
    m = m or M['sand']; n = max(1, int(length / .55)); out = []
    for r in range(rows):
        off = (.275 if r % 2 else 0)
        for i in range(n - (1 if r % 2 else 0)):
            t = -length / 2 + .275 + off + i * .55; px = x + math.cos(rz) * t; py = y + math.sin(rz) * t
            s = sphere(.29, px, py, z + .1 + r * .19, m, 1, .62, .38, 8); s.rotation_euler = (0, 0, rz + random.uniform(-.08, .08))
def barrel(x, y, z, m=None, r=.29, h=.88):
    m = m or random.choice([M['rust'], M['red'], M['steel'], M['olive']])
    cyl(r, h, x, y, z + h / 2, m, 12); torus(r + .005, .018, x, y, z + h * .33, M['steelD'], seg=12, seg2=4); torus(r + .005, .018, x, y, z + h * .66, M['steelD'], seg=12, seg2=4)
def crate(x, y, z, s=.8, rz=0., m=None):
    m = m or M['plank2']; box(s, s, s, x, y, z + s / 2, m, rz)
    for k in (-1, 1): box(s * 1.02, .05, .09, x, y, z + s / 2 + k * s * .35, M['plankD'], rz, bev=0)
def tire(x, y, z, flat=True): torus(.34, .13, x, y, z + .13, M['tire'], 0 if flat else math.pi / 2, 0, 14, 6)
def pallet(x, y, z, rz=0.):
    for k in range(5): box(1.2, .14, .022, x + math.cos(rz + math.pi / 2) * 0 + math.cos(rz) * 0, y, z + .13, M['plank2'], rz, bev=0).location = (x + math.cos(rz) * 0 - math.sin(rz) * (-.5 + k * .25), y + math.sin(rz) * 0 + math.cos(rz) * (-.5 + k * .25), z + .13)
    for k in (-1, 0, 1): b = box(.1, 1.2, .1, 0, 0, z + .06, M['plankD'], rz, bev=0); b.location = (x + math.cos(rz) * k * .55, y + math.sin(rz) * k * .55, z + .06)
def jerry(x, y, z, m=None): box(.17, .35, .47, x, y, z + .235, m or M['red'], bev=.02); box(.03, .1, .06, x, y + .1, z + .5, M['steelD'], bev=0)
def lamp(x, y, z, h=4.5, arm=.6):
    cyl(.06, h, x, y, z + h / 2, M['steelD'], 8); beam((x, y, z + h), (x, y - arm, z + h), .06, M['steelD']); box(.35, .22, .14, x, y - arm, z + h - .1, M['steel'], bev=0); box(.28, .16, .02, x, y - arm, z + h - .18, M['bulb'], bev=0)
def ladder(x, y, z0, z1, w=.5, rz=0., m=None):
    m = m or M['plankD']; c, s = math.cos(rz), math.sin(rz)
    for k in (-1, 1): rod((x + c * k * w / 2, y + s * k * w / 2, z0), (x + c * k * w / 2, y + s * k * w / 2, z1), .035, m)
    n = int((z1 - z0) / .3)
    for i in range(1, n): rod((x - c * w / 2, y - s * w / 2, z0 + i * .3), (x + c * w / 2, y + s * w / 2, z0 + i * .3), .022, m)
def razor(x0, x1, y, z, axis='x'):
    n = int(abs(x1 - x0) / .42)
    for i in range(n):
        t = x0 + (i + .5) * (x1 - x0) / n
        if axis == 'x': torus(.27, .012, t, y, z, M['wire'], 0, math.pi / 2 + .25, 10, 3)
def chainlink(x0, x1, y, z0, z1):   # posts + a translucent-looking mesh panel (thin wire grid)
    n = max(1, int(abs(x1 - x0) / 2.5))
    for i in range(n + 1): cyl(.035, z1 - z0, x0 + i * (x1 - x0) / n, y, (z0 + z1) / 2, M['galv'], 6)
    beam((x0, y, z1), (x1, y, z1), .04, M['galv'])
    k = int((z1 - z0) / .15)
    for i in range(int(abs(x1 - x0) / .15)): rod((x0 + i * .15, y, z0), (x0 + i * .15 + .15, y, z1), .004, M['wire'], 3)
def flag(x, y, z, h, m):
    cyl(.035, h, x, y, z + h / 2, M['galv'], 6); fl = box(.9, .02, .55, x + .47, y, z + h - .35, m, bev=0)
def grating(sx, sy, x, y, z, m):
    box(sx, sy, .05, x, y, z - .025, m, bev=0)
    for k in range(int(sx / .25)): box(.02, sy, .06, x - sx / 2 + k * .25, y, z, M['steelD'], bev=0)

# ---------------------------------------------------------------- asset bookkeeping
ASSETS = []
def begin(): CUR.clear()
def end(name):
    root = bpy.data.objects.new(name, None); SC.collection.objects.link(root)
    for o in CUR: o.parent = root
    ASSETS.append(root); print('ASSET', name, len(CUR)); CUR.clear(); return root

# ================================================================= TOWERS (L1..L5)
def tower(L):
    begin(); hh = 6 + (1.2 if L >= 4 else 0); legs = [(-1.3, -1.3), (1.3, -1.3), (-1.3, 1.3), (1.3, 1.3)]
    wood = L <= 2
    if L == 5: box(3.4, 3.4, 1.6, 0, 0, .8, M['conc'], bev=.04); [box(.3, .3, .1, px * 1.45, py * 1.45, 1.65, M['steelD'], bev=0) for px, py in legs]
    for px, py in legs:
        if wood: cyl(.13, hh + 1.9, px, py, (hh + 1.9) / 2, M['log'], 8)
        else: box(.2, .2, hh, px, py, hh / 2, M['steel']); box(.08, .26, hh, px, py, hh / 2, M['steelD'], bev=0)
    # bracing: X on every side at two heights
    for lo, hi in ((.3, hh * .5), (hh * .5, hh - .2)):
        for a, b in ((0, 1), (2, 3), (0, 2), (1, 3)):
            p, q = legs[a], legs[b]
            beam((p[0], p[1], lo), (q[0], q[1], hi), .09 if wood else .07, M['plankD'] if wood else M['steelD'])
            beam((q[0], q[1], lo), (p[0], p[1], hi), .09 if wood else .07, M['plankD'] if wood else M['steelD'])
        for a, b in ((0, 1), (2, 3), (0, 2), (1, 3)): beam((legs[a][0], legs[a][1], hi), (legs[b][0], legs[b][1], hi), .12 if wood else .1, M['log'] if wood else M['steel'])
    # platform
    if L <= 2:
        for k in range(14): box(3.5, .23, .07, 0, -1.6 + k * .245, hh, M['plank'] if k % 3 else M['plank2'], bev=0)
    else: grating(3.5, 3.5, 0, 0, hh, M['steel'])
    # railings / walls
    if L <= 2:
        for px, py in legs: box(.1, .1, 1.1, px * 1.3, py * 1.3, hh + .55, M['plankD'], bev=0)
        for z in (hh + .5, hh + 1.05):
            for s in (-1, 1): box(3.5, .07, .1, 0, s * 1.72, z, M['plank'], bev=0); box(.07, 3.5, .1, s * 1.72, 0, z, M['plank'], bev=0)
        if L == 2: sandbags(0, 1.55, hh, 3.2, 3); sandbags(1.55, 0, hh, 3.2, 3, math.pi / 2); sandbags(-1.55, 0, hh, 3.2, 3, math.pi / 2)
    elif L == 3:
        for s in (-1, 1):
            corrugated(3.5, 1.1, 0, s * 1.74, hh + .55, M['galv']); corrugated(3.5, 1.1, s * 1.74, 0, hh + .55, M['galv'], math.pi / 2)
        box(3.6, .1, .08, 0, -1.74, hh + 1.12, M['steelD'], bev=0)
    else:   # enclosed cabin with a window band
        for s in (-1, 1):
            box(3.5, .1, 1.0, 0, s * 1.75, hh + .5, M['green'] if L == 4 else M['steel']); box(.1, 3.5, 1.0, s * 1.75, 0, hh + .5, M['green'] if L == 4 else M['steel'])
            box(3.5, .1, .35, 0, s * 1.75, hh + 2.05, M['green'] if L == 4 else M['steel']); box(.1, 3.5, .35, s * 1.75, 0, hh + 2.05, M['green'] if L == 4 else M['steel'])
            for t in (-1.2, 0, 1.2): box(.12, .14, .7, t, s * 1.75, hh + 1.35, M['steelD'], bev=0); box(.14, .12, .7, s * 1.75, t, hh + 1.35, M['steelD'], bev=0)
        for px, py in legs: box(.14, .14, 2.3, px * 1.33, py * 1.33, hh + 1.15, M['steelD'], bev=0)
        sandbags(0, -2.0, hh - .05, 2.6, 2) if L == 5 else None
        if L == 5:
            for s in (-1, 1): box(3.7, .06, .9, 0, s * 1.84, hh + .45, M['rust'], bev=0); box(.06, 3.7, .9, s * 1.84, 0, hh + .45, M['rust'], bev=0)
            cyl(.05, .9, 1.1, -1.9, hh + 1.3, M['steelD'], 6); box(.14, 1.1, .16, 1.1, -2.3, hh + 1.75, M['steelD'], bev=0); box(.2, .3, .22, 1.1, -1.85, hh + 1.75, M['steelD'], bev=0)   # pintle MG
            cyl(.02, 3, -1.5, 1.5, hh + 3.8, M['steelD'], 4); cyl(.02, 2, -1.2, 1.6, hh + 3.3, M['steelD'], 4)
    # roof
    rz = hh + (2.3 if L >= 4 else 1.9)
    if L <= 3:
        for px, py in legs: (cyl(.07, 1.9, px * 1.3, py * 1.3, hh + .95, M['log'], 6) if wood else box(.08, .08, 1.9, px * 1.3, py * 1.3, hh + .95, M['steel'], bev=0))
        r = pyramid(4.1, 1.2 if L < 3 else .9, 0, 0, rz, M['rust'] if L < 3 else M['galv']); r.rotation_euler.z = 0
        if L == 2: box(4.2, 4.2, .05, 0, 0, rz - .02, M['tarpG'], bev=0)
    else: box(4.2, 4.2, .18, 0, 0, rz + .09, M['steelD'], bev=.03); box(3.0, 3.0, .12, 0, 0, rz + .24, M['steel'], bev=0)
    # access
    if L <= 3: ladder(0, -1.85, 0 if L < 5 else 1.6, hh + .9, .55, 0, M['plankD'] if wood else M['steel'])
    else:
        ladder(0, -1.95, 1.6 if L == 5 else 0, hh, .6, 0, M['steel'])
        for k in range(int(hh / .7)): torus(.42, .015, 0, -2.25, (1.6 if L == 5 else 0) + 1.8 + k * .7, M['steel'], 0, 0, 10, 3) if k * .7 + 1.8 < hh else None
    if L >= 2: flag(1.6, 1.6, rz + (.2 if L >= 4 else .9), 1.6, M['red'] if L < 4 else M['olive'])
    if L >= 4: lamp(-1.6, -1.6, hh, 1.4, .3)
    end('HV_tower_%d' % L)
for L in range(1, 6): tower(L)

# ================================================================= WALL MODULES (4 m long, along X; inside = -Y)
HG = [1.3, 3.0, 3.6, 4.2, 4.8, 5.4]
def wall(L):
    begin(); h = HG[L]
    if L == 0:   # scrap barricade
        pallet(-1.4, 0, 0, .1); pallet(-1.4, 0, .15, -.05); pallet(-1.35, .05, .3, .2)
        for k in range(3): tire(-.2, .1, k * .27)
        box(1.3, .08, 1.0, .9, .15, .5, M['rust2'], 0, .1); box(.9, .06, .5, .9, .1, .7, M['glass'], 0, .1)   # a car door
        crate(1.6, -.1, 0, .8, .3); barrel(.5, -.35, 0); corrugated(1.4, 1.2, -1.2, .45, .55, M['rust'], 0, -.25)
        beam((-2, .3, .2), (2, .3, .9), .08, M['plankD'])
    elif L in (1, 2):   # timber palisade
        n = 12
        for i in range(n):
            x = -2 + (i + .5) * 4 / n; jit = random.uniform(-.12, .12); r = random.uniform(.15, .19)
            cyl(r, h + jit, x, 0, (h + jit) / 2, M['log'], 8); cyl(r, .55, x, 0, h + jit + .27, M['plank2'], 8, r2=.02)
        for z in (h * .3, h * .75): box(4.05, .12, .2, 0, -.25, z, M['plankD'], bev=0)
        if L == 2:   # inner walkway with posts and a rail
            for x in (-1.6, 0, 1.6): box(.16, .16, 2.2, x, -1.0, 1.1, M['log']); beam((x, -1.0, 1.2), (x, -.3, 2.1), .09, M['plankD'])
            for k in range(5): box(4.0, .2, .06, 0, -.35 - k * .2, 2.2, M['plank'] if k % 2 else M['plank2'], bev=0)
            box(4.0, .08, .08, 0, -1.25, 2.2, M['plankD'], bev=0); box(4.0, .08, .08, 0, -.3, 2.12, M['plankD'], bev=0)
    elif L == 3:   # jersey barriers + chain-link
        for x in (-1, 1):
            me = gable(1.96, .8, .3, x, 0, .86, M['conc'], 'x'); box(1.96, .8, .5, x, 0, .25, M['conc'], bev=.03); box(1.96, .4, .32, x, 0, .66, M['conc'], bev=.02)
        chainlink(-2, 2, 0, 1.1, h - .25); razor(-2, 2, 0, h - .1)
        for x in (-2, 0): rod((x, 0, h - .25), (x, .3, h), .02, M['galv'])
    elif L == 4:   # concrete + steel plate + razor wire
        for x in (-1, 1): box(1.96, 1.0, h * .55, x, 0, h * .275, M['conc'] if x < 0 else M['concD'], bev=.04)
        for x in (-1.33, 0, 1.33): box(1.3, .1, h * .45, x, .1, h * .775, random.choice([M['rust'], M['rust2'], M['steel']]), random.uniform(-.02, .02), bev=0)
        for x in (-2, 0, 2): box(.14, .18, h * .48, x, .2, h * .78, M['steelD'], bev=0)
        razor(-2, 2, .1, h + .25)
        box(4, .4, .08, 0, -.55, h * .55, M['steel'], bev=0)
    else:   # reinforced wall with buttresses, plating, wire and a lamp
        box(4.0, 1.0, h, 0, 0, h / 2, M['conc'], bev=.05)
        for z in (h * .33, h * .66): box(4.02, .04, .06, 0, .51, z, M['concD'], bev=0)
        box(4.0, .08, h * .55, 0, .54, h * .55, M['steel'], bev=0)
        for x in (-1.3, 0, 1.3): box(.06, .1, h * .55, x, .58, h * .55, M['steelD'], bev=0)
        for x in (-1.5, 1.5): box(.6, 1.4, h * .7, x, -1.1, h * .35, M['concD'], 0, .0, 0, .04); box(.6, 1.0, .2, x, -.9, h * .72, M['concD'], bev=0)
        razor(-2, 2, .2, h + .25)
        for x in (-2, 0, 2): beam((x, .2, h), (x, .45, h + .5), .04, M['steelD'])
        box(.8, 1.6, .1, 0, -1.2, h - 1.3, M['steel'], bev=0)   # firing step
        box(.3, .2, .14, 0, -.55, h - .2, M['steel'], bev=0); box(.24, .02, .1, 0, -.66, h - .25, M['bulb'], bev=0)
    end('HV_wall_%d' % L)
for L in range(6): wall(L)

# ================================================================= GATES (gap 13 m centred on origin; posts at +-6.7 m)
def gate(L):
    begin(); gt = HG[L] if L else 1.2; W = 6.7
    for s in (-1, 1):
        if L <= 2: cyl(.28, gt + 1.2, s * W, 0, (gt + 1.2) / 2, M['log'], 10); cyl(.28, .5, s * W, 0, gt + 1.45, M['plank2'], 10, r2=.03)
        elif L == 3: box(.9, .9, gt + .4, s * W, 0, (gt + .4) / 2, M['conc'], bev=.04)
        else: box(1.1, 1.3, gt + .8, s * W, 0, (gt + .8) / 2, M['conc'] if L == 5 else M['concD'], bev=.05); box(1.2, 1.4, .2, s * W, 0, gt + .9, M['steel'], bev=.02)
        # build 61: the leaves are built and animated by the game (they open as you come up to the gate)
        continue
        # # an open leaf, swung in (toward -Y) so the road stays clear
        # lw = W - .5; hinge = (s * (W - .35), -.2); a = -s * 1.25
        # cx, cy = hinge[0] - s * math.cos(a) * lw / 2 * -1 * 0, hinge[1]
        # leaf_c = Vector((hinge[0] + -s * lw / 2 * math.cos(a) * 0, hinge[1], 0))
        # ux, uy = -s * math.cos(1.25), -math.sin(1.25)   # leaf direction from the hinge, swung inward
        # mx, my = hinge[0] + ux * lw / 2, hinge[1] + uy * lw / 2; rz = math.atan2(uy, ux)
        # hh = gt * .9
        # if L <= 2:
        #     for k in range(9): t = (k + .5) / 9 * lw - lw / 2; box(.12, .28, hh, mx + math.cos(rz) * t, my + math.sin(rz) * t, hh / 2 + .1, M['plank'] if k % 2 else M['plank2'], rz, bev=0)
        #     for z in (hh * .25, hh * .8): box(lw, .08, .16, mx, my, z, M['plankD'], rz, bev=0)
        #     beam((hinge[0], hinge[1], hh * .25), (hinge[0] + ux * lw, hinge[1] + uy * lw, hh * .8), .1, M['plankD'])
        # else:
        #     box(lw, .12, hh, mx, my, hh / 2 + .1, M['steel'] if L >= 4 else M['rust'], rz, bev=0)
        #     for k in range(5): t = (k + .5) / 5 * lw - lw / 2; box(.1, .2, hh, mx + math.cos(rz) * t, my + math.sin(rz) * t, hh / 2 + .1, M['steelD'], rz, bev=0)
        #     if L >= 4: box(lw, .14, .25, mx, my, hh * .5, M['yellow'], rz, bev=0)
    # the sign beam (the game draws "HAVEN" on it at gt + .9)
    box(2 * W + .8, .3, .5, 0, 0, gt + .9, M['plankD'] if L <= 2 else M['steel'], bev=.03)
    if L >= 3: lamp(-W - .2, 1.2, 0, gt + 1.6, .9); lamp(W + .2, 1.2, 0, gt + 1.6, .9)
    if L >= 2: sandbags(-W - 1.6, .6, 0, 2.2, 3); sandbags(W + 1.6, .6, 0, 2.2, 3)
    end('HV_gate_%d' % L)
for L in range(6): gate(L)

# ================================================================= GARAGE (L1..L5); origin at the footprint centre, open side +Y
def garage(L):
    begin(); w = 16 if L == 1 else 19; d = 10; H = 3.6 + (.6 if L >= 3 else 0)
    xs = [-w / 2 + i * w / (4 if L == 1 else 5) for i in range(5 if L == 1 else 6)]
    for x in xs:
        for y in (-d / 2, d / 2): box(.22, .22, H, x, y, H / 2, M['steel']); box(.08, .3, H, x, y, H / 2, M['steelD'], bev=0)
        beam((x, -d / 2, H), (x, d / 2, H), .2, M['steel'])
    for y in (-d / 2, d / 2): beam((-w / 2, y, H), (w / 2, y, H), .2, M['steel'])
    # pitched corrugated roof (ridge along x)
    for s in (-1, 1):
        n = int(w / 1.0)
        for i in range(n):
            o = corrugated(1.02, d / 2 + .5, -w / 2 + (i + .5) * w / n, s * (d / 4 + .12), H + .45, M['rust'] if (L <= 2 and i % 3) else M['galv'] if L <= 3 else M['green'], 0, s * (math.pi / 2 - .18))
    box(w + .3, .2, .2, 0, 0, H + .9, M['steelD'], bev=0)
    # walls
    back = []
    for i in range(int(w / 1.0)): corrugated(1.02, H, -w / 2 + (i + .5) * w / int(w / 1.0), -d / 2, H / 2, M['galv'] if L >= 3 else M['rust'], 0, 0)
    if L >= 2:
        for s in (-1, 1):
            hs = H if L >= 3 else H * .5
            for i in range(int(d / 1.0)): corrugated(1.02, hs, s * w / 2, -d / 2 + (i + .5) * d / int(d / 1.0), hs / 2, M['galv'] if L >= 3 else M['rust2'], math.pi / 2, 0)
    if L >= 4:
        for x in (-w / 4, w / 4): box(w / 2 - 1, .5, .6, x, d / 2, H - .3, M['steelD'], bev=.03)   # roller doors, rolled up
        for s in (-1, 1): box(w, .04, 1.2, 0, -d / 2 + .05, 1.2, M['green'], bev=0) if s < 0 else None
    # floor slab and gear
    box(w + .6, d + .6, .12, 0, 0, .06, M['concD'], bev=0)
    box(3, .8, .9, -w / 2 + 2, -d / 2 + .6, .45, M['plank']); box(3, .8, .05, -w / 2 + 2, -d / 2 + .6, .92, M['steel'], bev=0)   # workbench
    box(2.6, .06, 1.6, -w / 2 + 2, -d / 2 + .12, 1.9, M['plankD'], bev=0)   # pegboard
    for k in range(6): box(.04, .06, .3, -w / 2 + 1 + k * .4, -d / 2 + .16, 1.9 + (k % 2) * .3, M['steelD'], bev=0)
    for k in range(min(5, L + 1)): tire(w / 2 - 1, -d / 2 + 1, k * .27)
    for k in range(L): jerry(w / 2 - 2 - k * .3, -d / 2 + .5, .12)
    barrel(w / 2 - .8, d / 2 - 1.2, .12, M['red']); barrel(w / 2 - 1.5, d / 2 - 1.2, .12, M['olive'])
    if L >= 2:   # engine hoist
        beam((-1, -2, .12), (0, -2, 2.6), .1, M['yellow']); beam((1, -2, .12), (0, -2, 2.6), .1, M['yellow']); beam((0, -2, 2.6), (0, -.2, 2.4), .1, M['yellow']); cyl(.02, 1, 0, -.2, 1.9, M['steelD'], 4)
        box(.6, .5, .5, 0, -.2, 1.2, M['steelD'])
    if L >= 3:   # car lift
        for x in (3, 6): box(.35, .35, 3.2, x, -2.5, 1.6, M['yellow']); box(.15, 1.5, .12, x, -1.8, .4, M['steelD'], bev=0)
        for k in range(6): box(.5, .04, .04, -w / 2 + .3, -2 + k * .7, H - .2, M['bulb'], bev=0)
        box(.8, .6, .9, -w / 2 + 1, 1.5, .57, M['red'])   # compressor
    if L >= 4: box(2.4, 2.4, 2.4, -w / 2 + 1.8, d / 2 - 1.8, 1.32, M['plank2']); box(.9, .05, .8, -w / 2 + 1.8, d / 2 - .58, 1.6, M['glass'], bev=0)   # office
    if L >= 5:
        beam((-w / 2 + .5, 0, H - .3), (w / 2 - .5, 0, H - .3), .3, M['yellow']); box(.6, .5, .4, 2, 0, H - .65, M['steelD']); cyl(.015, 1.5, 2, 0, H - 1.6, M['steelD'], 4)
        lamp(-w / 2 - .5, d / 2 + .8, 0, 5, .6); lamp(w / 2 + .5, d / 2 + .8, 0, 5, .6)
        for x in (-w / 2, w / 2): sandbags(x, d / 2 + .6, .0, 1.8, 3)
    end('HV_garage_%d' % L)
for L in range(1, 6): garage(L)

# ================================================================= RADIO (L0..L5); the mast at the origin
def radio(L):
    begin(); hh = 5 + L * 4
    if L == 0:
        cyl(.1, hh, 0, 0, hh / 2, M['log'], 8); rod((0, 0, hh), (3, 2, .2), .006, M['wire'], 3); rod((0, 0, hh), (-3, -2.5, .2), .006, M['wire'], 3)
        crate(1, .6, 0, .7); box(.4, .25, .25, 1, .6, .82, M['black'], bev=0); box(.3, .02, .1, 1, .47, .85, M['bulb'], bev=0)
        end('HV_radio_0'); return
    legs = [(.4 * math.cos(a), .4 * math.sin(a)) for a in (math.pi / 2, math.pi / 2 + 2.094, math.pi / 2 + 4.189)]
    for px, py in legs: rod((px, py, 0), (px * .6, py * .6, hh), .04, M['galv'], 6)
    seg = 1.5; n = int(hh / seg)
    for k in range(n):
        z0, z1 = k * seg, (k + 1) * seg; s0, s1 = 1 - .4 * z0 / hh, 1 - .4 * z1 / hh
        for i in range(3):
            a, b = legs[i], legs[(i + 1) % 3]
            rod((a[0] * s0, a[1] * s0, z0), (b[0] * s1, b[1] * s1, z1), .015, M['galv'], 4); rod((a[0] * s1, a[1] * s1, z1), (b[0] * s1, b[1] * s1, z1), .015, M['galv'], 4)
    box(1.2, 1.2, .3, 0, 0, .15, M['conc'], bev=.03)
    cyl(.02, 2.5, 0, 0, hh + 1.2, M['steelD'], 4)
    if L >= 1: d = sphere(.75, .45, 0, hh * .72, M['white'], .25, 1, 1, 12); d.rotation_euler = (0, 0, 0)
    if L >= 2:   # guy wires and the radio shack
        for i in range(3): a = i * 2.094 + .5; gr = min(hh * .45, 5.5); rod((0, 0, hh * .8), (math.cos(a) * gr, math.sin(a) * gr, .1), .008, M['wire'], 3); box(.4, .4, .3, math.cos(a) * gr, math.sin(a) * gr, .15, M['conc'])
        sx, sy = 2.6, -.4
        box(2.6, 2.2, 2.4, sx, sy, 1.2, M['plank2'] if L < 4 else M['green']); gable(2.9, 2.5, .6, sx, sy, 2.4, M['rust'] if L < 4 else M['steelD'], 'x')
        box(.9, .06, 1.9, sx, sy - 1.11, .95, M['plankD'], bev=0); box(.8, .06, .5, sx + .8, sy + 1.11, 1.5, M['glass'], bev=0)
        rod((sx, sy, 2.8), (0, 0, hh * .5), .01, M['black'], 3)
    if L >= 3:
        d2 = sphere(.55, -.4, .1, hh * .5, M['white'], .25, 1, 1, 10); d2.rotation_euler = (0, 0, 2.2)
        grating(1.4, 1.4, 0, 0, hh * .45, M['steel'])
        ladder(0, -.45, 0, hh * .95, .4, 0, M['steel'])
    if L >= 4:
        o = box(1.6, .06, 1.0, 2.6, -.4, 3.0, M['solar'], 0, -.4, bev=0); box(.3, .1, .35, 0, 0, hh - .5, M['steelD'], bev=0)
        for z in (hh * .3, hh * .6): rod((0, 0, z), (0, -.9, z + .2), .02, M['steelD'], 4); box(.05, .05, 1.2, 0, -.9, z + .6, M['steelD'], bev=0)
    if L >= 5:
        d3 = sphere(1.4, -3.2, 1.8, 1.4, M['white'], .3, 1, 1, 14); d3.rotation_euler = (0, -.6, .7); box(.4, .4, 1.2, -3.2, 1.8, .6, M['steelD'])
        for x in (-4.5, 4.5):
            chainlink(-4.5, 4.5, 4.5, 0, 2) if x < 0 else None
        chainlink(-4.5, 4.5, -4.5, 0, 2); box(1.6, 1, 1.1, 4.2, 2, .55, M['olive'])
    end('HV_radio_%d' % L)
for L in range(6): radio(L)

# ================================================================= POWER: generator yard (L1..L5) + one solar panel
def power(L):
    begin()
    def genset(x, y):
        box(2.4, 1.2, .16, x, y, .08, M['steelD'], bev=0); box(1.6, 1.0, 1.0, x - .2, y, .66, M['yellow'] if L < 4 else M['olive']); box(.7, .95, .8, x + .85, y, .56, M['steel'])
        for k in range(6): box(.02, .9, .04, x - .8 + k * .25, y - .51, .7, M['steelD'], bev=0)
        cyl(.07, 1.2, x + .9, y + .3, 1.5, M['steelD'], 8); cyl(.09, .2, x + .9, y + .3, 2.15, M['rust'], 8)
        box(.5, .1, .35, x - .2, y - .53, .9, M['black'], bev=0)
    if L < 4: genset(0, 0)
    else:   # inside a container shed with louvres
        box(4, 2.2, 2.4, 0, 0, 1.2, M['green'] if L == 4 else M['steel'])
        for k in range(10): box(.06, .02, 1.2, -1.6 + k * .35, -1.11, 1.4, M['steelD'], bev=0)
        cyl(.1, 1.2, 1.3, .5, 2.9, M['steelD'], 8)
    for k in range(3 + L): jerry(-1.6 + (k % 4) * .25, 1.1 + (k // 4) * .4, 0)
    torus(.35, .12, 1.8, 1.2, .5, M['black'], math.pi / 2, 0, 12, 6)   # cable spool
    if L >= 2: cyl(.6, 2.4, -2.6, 0, 1.6, M['white'], 14, 0, math.pi / 2); [box(.1, .8, .9, -2.6 + s, 0, .45, M['steelD'], bev=0) for s in (-.8, .8)]   # fuel tank
    if L >= 3: box(1.4, .6, 1.8, 2.8, -.4, .9, M['galv']); box(.8, .02, .3, 2.8, -.71, 1.4, M['red'], bev=0); box(1, 1, 1.2, 2.8, 1, .6, M['steelD'])   # batteries, transformer
    if L >= 5: genset(-.4, -2.6 + 0); box(2.2, 2, 2.3, 4.4, -1.6, 1.15, M['plank2']); gable(2.4, 2.2, .5, 4.4, -1.6, 2.3, M['steelD'])
    for px, py in ((-1.8, -1.3), (2, -1.4)): cyl(.06, 4.5, px, py, 2.25, M['plankD'], 6)
    rod((-1.8, -1.3, 4.3), (2, -1.4, 4.3), .008, M['black'], 3)
    end('HV_power_%d' % L)
for L in range(1, 6): power(L)
begin()
for s in (-1, 1): beam((s * 1.4, .5, 0), (s * 1.4, .5, 1.2), .07, M['galv']); beam((s * 1.4, -.55, 0), (s * 1.4, -.55, .55), .07, M['galv'])
box(3.2, 1.7, .05, 0, 0, .95, M['solar'], 0, -.5, bev=0); box(3.3, .06, .08, 0, -.75, .55, M['galv'], 0, 0, bev=0); box(3.3, .06, .08, 0, .75, 1.35, M['galv'], bev=0)
for k in range(5): box(.02, 1.65, .055, -1.3 + k * .65, 0, .96, M['galv'], 0, -.5, bev=0)
end('HV_solar')

# ================================================================= WORKSHOP bench (L0) and yard dressing (L1..L5, south of the door)
begin()
for x, y in ((-2, -1), (2, -1), (-2, 1), (2, 1)): cyl(.08, 2.4 if y < 0 else 2.0, x, y, (2.4 if y < 0 else 2.0) / 2, M['log'], 6)
o = box(4.6, 2.6, .04, 0, 0, 2.25, M['tarpB'], 0, .15, bev=0)
box(2.4, .9, .9, 0, .5, .45, M['plank']); box(2.4, .9, .06, 0, .5, .93, M['plank2'], bev=0); box(.25, .2, .2, .9, .2, 1.05, M['steelD'], bev=0)
for k in range(5): box(.05, .05, .35, -.9 + k * .2, .95, 1.5, M['steelD'], bev=0)
box(2.4, .05, .9, 0, 1, 1.5, M['plankD'], bev=0)
crate(-1.6, -.6, 0, .7); barrel(1.7, -.5, 0, M['rust']); corrugated(1.4, 1, -1.8, .9, .5, M['rust'], 0, -.3)
end('HV_bench')
def wsyard(L):
    begin(); barrel(-3, 0, 0, M['rust'])
    box(.6, .3, .35, -2, 0, .75, M['steelD']); cyl(.18, .55, -2, 0, .28, M['log'], 8)   # anvil on a stump
    if L >= 2: box(.5, .4, .6, 0, 0, .3, M['red']); cyl(.11, 1.1, .4, .1, .55, M['green'], 8); cyl(.11, 1.1, .65, .1, .55, M['orange'], 8)   # welding cart, gas bottles
    if L >= 3: [box(3, .08, .08, 2.5, 0, .4 + k * .4, M['steel'], bev=0) for k in range(3)]; [box(.1, .6, 1.4, 2.5 + s * 1.4, 0, .7, M['steelD'], bev=0) for s in (-1, 1)]; [rod((1.2, -.1 + k * .1, .9 + k * .4), (3.8, -.1 + k * .1, .9 + k * .4), .03, M['rust'], 5) for k in range(3)]
    if L >= 4: box(.9, .6, .7, -4.5, .3, .9, M['steelD']); box(.2, .5, .9, -4.9, .3, .45, M['steel']); box(.2, .5, .9, -4.1, .3, .45, M['steel'])   # engine on a stand
    if L >= 5: box(1.2, 1.2, 1, 5, .2, .5, M['stone']); cyl(.25, 4, 5, .2, 3, M['steelD'], 8); sphere(.3, 5, -.3, 1.1, M['orange'], 1, 1, .5, 8)   # forge and chimney
    end('HV_wsyard_%d' % L)
for L in range(1, 6): wsyard(L)

# ================================================================= TENTS: survivor tent, medical tents (L1, L2)
begin()
for s in (-1, 1):
    o = box(2.3, .04, 2.6, 0, s * .78, 1.0, M['tarpG'], 0, s * -.58 * 1, bev=0); o.rotation_euler = (s * .64, 0, 0)
cyl(.03, 2.0, -1.1, 0, 1.0, M['plankD'], 5); cyl(.03, 2.0, 1.1, 0, 1.0, M['plankD'], 5); rod((-1.2, 0, 1.95), (1.2, 0, 1.95), .03, M['plankD'], 5)
for s in (-1, 1): rod((s * 1.1, 0, 1.95), (s * 2.0, 0, 0), .006, M['canvas'], 3)
box(.8, .5, .4, 1.6, -1.2, .2, M['plank2']); cyl(.12, .3, 1.6, -1.2, .55, M['steelD'], 8)
end('HV_tent')
def medtent(L):
    begin(); w, d, h = (6, 4.5, 2.6) if L == 1 else (8, 5, 2.9)
    box(w, d, h * .55, 0, 0, h * .275, M['canvas'], bev=0)
    gable(w, d + .3, h * .45, 0, 0, h * .55, M['canvas'], 'x')
    for x in (-w / 2, w / 2): box(.06, .06, h, x, 0, h / 2, M['steelD'], bev=0)
    for s in (-1, 1): box(1.2, .3, .02, 0, s * (d / 2 + .02), h * .3, M['red'], bev=0); box(.3, 1.2, .02, 0, 0, 0, M['red'], bev=0) if False else None
    box(.32, .02, 1.1, 0, -d / 2 - .03, h * .3 + .05, M['red'], bev=0); box(1.1, .02, .32, 0, -d / 2 - .03, h * .3 + .05, M['red'], bev=0)
    box(.32, .02, 1.1, 0, d / 2 + .03, h * .3 + .05, M['red'], bev=0); box(1.1, .02, .32, 0, d / 2 + .03, h * .3 + .05, M['red'], bev=0)
    box(1.4, .05, 1.9, -w / 2 + 1, -d / 2 - .02, .95, M['tarpG'], bev=0)   # door flap
    for k in range(L + 1): box(.75, 2, .45, -w / 2 - 1.2 - k * .1, -d / 2 + 1 + k * 1.0, .23, M['olive'])   # cots outside
    for k in range(2): crate(w / 2 + .9, -1 + k * .9, 0, .6, 0, M['white']); box(.32, .02, .1, w / 2 + .9, -1.31 + k * .9, .35, M['red'], bev=0)
    if L == 2: cyl(.5, 1.4, w / 2 + 1, 1.6, .7, M['tarpB'], 12)   # water tank
    for s in (-1, 1):
        for x in (-w / 2, 0, w / 2): rod((x, s * (d / 2 + .1), h * .55), (x, s * (d / 2 + 1.2), 0), .006, M['canvas'], 3)
    end('HV_medtent_%d' % L)
for L in (1, 2): medtent(L)
begin()   # infirmary yard (L3+): stretchers, med crates, a generator light
for k in range(3): box(.6, 2, .1, -2 + k * .9, 0, .5, M['olive'], bev=0); [box(.04, .04, .5, -2 + k * .9 + s * .27, t, .25, M['steelD'], bev=0) for s in (-1, 1) for t in (-.9, .9)]
for k in range(3): crate(1.5 + k * .7, -.5, 0, .55, 0, M['white']); box(.3, .02, .1, 1.5 + k * .7, -.78, .3, M['red'], bev=0)
cyl(.55, 1.6, 4, .5, .8, M['tarpB'], 12); lamp(-3.5, .8, 0, 3.2, .4)
end('HV_medyard')

# ================================================================= FARM: coop, pig shed, greenhouse
begin()
for x, y in ((-1, -.7), (1, -.7), (-1, .7), (1, .7)): box(.1, .1, .6, x, y, .3, M['plankD'], bev=0)
box(2.2, 1.6, 1.1, 0, 0, 1.15, M['plank2']); gable(2.5, 1.9, .6, 0, 0, 1.7, M['rust'], 'x')
box(.5, .05, .4, .4, -.81, 1.0, M['black'], bev=0); o = box(.4, 1.1, .04, .4, -1.3, .35, M['plank'], 0, .6, bev=0)
box(.8, .5, .4, -1.4, 0, .9, M['plank']); box(.9, .55, .06, -1.4, 0, 1.15, M['rust'], bev=0)
end('HV_coop')
begin()
for x in (-2, 0, 2):
    for y in (-1.4, 1.4): box(.12, .12, 1.8, x, y, .9, M['log'])
box(4.4, 3.2, .06, 0, 0, 1.85, M['rust'], 0, .08, bev=0); box(4.2, .08, 1.0, 0, 1.4, .5, M['plankD'], bev=0)
box(2.2, .5, .3, 1, -1.2, .15, M['steel']); box(1.5, 1, .9, -1.5, .9, .45, M['hay'], bev=.05)
end('HV_pigshed')
begin()
gw, gd, gh = 12, 7, 2.4
for i in range(7):
    x = -gw / 2 + i * gw / 6
    for y in (-gd / 2, gd / 2): box(.08, .08, gh, x, y, gh / 2, M['white'], bev=0)
    beam((x, -gd / 2, gh), (x, 0, gh + 1.1), .07, M['white']); beam((x, gd / 2, gh), (x, 0, gh + 1.1), .07, M['white'])
for y in (-gd / 2, gd / 2): box(gw, .06, gh, 0, y, gh / 2, M['glass'], bev=0)
for x in (-gw / 2, gw / 2): box(.06, gd, gh, x, 0, gh / 2, M['glass'], bev=0)
for s in (-1, 1): o = box(gw, math.hypot(gd / 2, 1.1), .03, 0, s * gd / 4, gh + .55, M['glass'], 0, s * math.atan2(1.1, gd / 2) * -1, bev=0)
for y in (-1.6, 0, 1.6): box(gw - 1.5, .9, .5, 0, y, .25, M['plank2']); box(gw - 1.6, .8, .06, 0, y, .53, M['soil'], bev=0)
for k in range(18): sphere(.2, -gw / 2 + 1.2 + (k % 9) * 1.15, -1.6 + (k // 9) * 3.2, .7, M['green'], 1, 1, .9, 6)
end('HV_greenhouse')

# ================================================================= PLAZA: command table, mission board, fire pit
begin()
box(2.6, 1.5, .1, 0, 0, 1.0, M['plank']); [box(.1, .1, 1.0, x, y, .5, M['plankD'], bev=0) for x in (-1.1, 1.1) for y in (-.6, .6)]
[beam((x, -.6, .2), (x, .6, .2), .06, M['plankD']) for x in (-1.1, 1.1)]
for x, y in ((-1.9, -1.4), (1.9, -1.4), (-1.9, 1.4), (1.9, 1.4)): cyl(.05, 2.6, x, y, 1.3, M['plankD'], 6)
o = box(4.1, 3.1, .04, 0, 0, 2.62, M['tarpG'], 0, .12, bev=0)
for x, y in ((-1.9, -1.4), (1.9, 1.4)): rod((x, y, 2.5), (x * 1.6, y * 1.6, 0), .006, M['canvas'], 3)
crate(-1.8, .9, 0, .6); jerry(1.6, .9, 0, M['olive']); box(.3, .2, .25, .8, .4, 1.18, M['black'], bev=0); cyl(.012, .5, .9, .4, 1.5, M['steelD'], 3)
lamp(0, 1.2, 0, 2.9, .0)
end('HV_table')
begin()
box(2.6, .14, 1.7, 0, 0, 1.75, M['plankD']); box(2.3, .04, 1.45, 0, -.08, 1.75, M['bark'], bev=0)
for s in (-1, 1): box(.16, .16, 3, s * 1.2, 0, 1.5, M['log'])
gable(3, 1.0, .45, 0, 0, 2.95, M['rust'], 'x')
for k in range(9): box(.32, .02, .4, -.9 + (k % 5) * .45, -.11, 2.15 - (k // 5) * .6, random.choice([M['paper'], M['white'], M['paper']]), random.uniform(-.1, .1), bev=0)
lamp(1.4, -.4, 0, 3.0, .6)
end('HV_board')
begin()
for i in range(12): a = i / 12 * 2 * math.pi; sphere(.2, math.cos(a) * .85, math.sin(a) * .85, .1, M['stone'], 1.2, 1, .7, 6)
for i in range(4): a = i / 4 * 2 * math.pi + .4; b = box(1.8, .42, .38, math.cos(a) * 2.6, math.sin(a) * 2.6, .25, M['log'], a + math.pi / 2)
for i in range(5): a = i / 5 * 2 * math.pi; rod((math.cos(a) * .5, math.sin(a) * .5, .05), (0, 0, .5), .07, M['bark'], 6)
end('HV_firepit')

# ================================================================= export
for o in bpy.data.objects:
    if o.type == 'MESH':
        for md in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            try: bpy.ops.object.modifier_apply(modifier=md.name)
            except Exception as e: pass
# join each asset's meshes per material so the GLB stays small and the game merges fast
for root in ASSETS:
    kids = [c for c in root.children if c.type == 'MESH']
    bymat = {}
    for c in kids: bymat.setdefault(c.data.materials[0].name if c.data.materials else '', []).append(c)
    for mn, obs in bymat.items():
        bpy.ops.object.select_all(action='DESELECT')
        for c in obs: c.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        if len(obs) > 1: bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active; j.name = root.name + '__' + mn
tot = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('TOTAL faces', tot, 'assets', len(ASSETS))
out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/haven.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_attributes=False, export_vertex_color='NONE', export_texcoords=False)
