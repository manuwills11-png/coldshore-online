# ColdShore build 64: "Victorian Style House" by MrChimp2313 (blendswap.com/blend/12687, CC0), made into an enterable landmark.
# Output: vic.glb (one mesh per material, metres, ground-floor surface at z=0, footprint centred, front door toward -Y = game +y)
#         vic_col.json (wall boxes in game units for both floors, the stairs, the floor heights)
# The doors are left out (every doorway open), subdivision is turned off, tiny dense fittings are dropped, materials become flat colours.
# usage: python3 vic_blend.py "Victorian House Blendswap.blend" -- out.glb out_col.json
import bpy, bmesh, sys, json, math, re
from mathutils import Vector, Matrix
SRC = sys.argv[sys.argv.index('--') - 1]; OUT, COL = sys.argv[sys.argv.index('--') + 1:sys.argv.index('--') + 3]
S3 = .05
bpy.ops.wm.open_mainfile(filepath=SRC)
for c in bpy.data.collections: c.hide_viewport = False; c.hide_render = False
def unexclude(lc):
    lc.exclude = False
    for ch in lc.children: unexclude(ch)
unexclude(bpy.context.view_layer.layer_collection)
for o in bpy.data.objects:
    o.hide_set(False); o.hide_viewport = False
    for m in o.modifiers:
        if m.type == 'SUBSURF': m.levels = 0; m.render_levels = 0
        if m.type == 'BEVEL': m.segments = 1
bpy.context.view_layer.update()
DROP = re.compile(r'^(Door_|Doors_)|Handle|handle|Knob|knob|^Circle|Switch|Taps|Toilet Roll|Shower Heads|Draw Knobs|Lights|Lantern|Mirror|^Ground$|UVs_ Low poly|Glass_Entrances|UVs_Gate|Doors_Balcony Glass')
objs = [o for o in bpy.data.objects if o.type == 'MESH' and not DROP.search(o.name)]
print('keeping', len(objs), 'of', len([o for o in bpy.data.objects if o.type == 'MESH']))
dg = bpy.context.evaluated_depsgraph_get()
def zr(name):
    o = bpy.data.objects[name]; vs = [o.matrix_world @ v.co for v in o.data.vertices]; return min(v.z for v in vs), max(v.z for v in vs)
from collections import Counter
def zmode(name):   # the floor surface: the most common vertex height of the slab (its top is not a flat sheet)
    o = bpy.data.objects[name]; return Counter(round((o.matrix_world @ v.co).z, 2) for v in o.data.vertices).most_common(1)[0][0]
G0 = zmode('Ground Floor'); F1 = zr('UVs_1st Floor')[1]; F2 = zr('UVs_2nd Floor')[1]
ow = bpy.data.objects['Outer Walls']; vs = [ow.matrix_world @ v.co for v in ow.data.vertices]
CX = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; CY = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
print('floors', G0, F1, F2, 'centre', CX, CY)
T = Matrix.Translation(Vector((-CX, -CY, -G0)))
COLS = {'White_Diffuse': (0xeeeae2, .7, 0), 'Wall Material': (0xd8cdb4, .9, 0), 'Floorboards': (0x8e5e38, .6, 0), 'Pink': (0xc49a96, .7, 0), 'White Glossy': (0xf4f4f0, .25, 0),
  'Roof Tile Base': (0x4a3a36, .9, 0), 'Brick Texture Base': (0x8a4a36, .95, 0), 'Deck Wood Base': (0x7a5a3e, .85, 0), 'Fence Wood Base': (0xd8d2c6, .85, 0), 'Driveway Base': (0x6a6864, .95, 0),
  'Tile Base': (0xd8dad4, .3, 0), 'Step_Base': (0x6a4a30, .7, 0), 'Garage Door Base': (0xe6e2d8, .7, 0), 'Outer walls Base': (0xe8e0d0, .8, 0), 'Blue Glossy': (0x3a5a8a, .25, 0),
  'Chrome': (0xc8ccd0, .2, .9), 'Chrome.001': (0xc8ccd0, .2, .9), 'StainlessSteel': (0xb0b4b6, .3, .8), 'Darker Grey': (0x4a4a4a, .6, 0), 'Black_Diffuse': (0x1a1a1a, .6, 0), 'Pale Yellow': (0xe6d9a2, .5, 0),
  'BrassOld': (0x9a7a3a, .4, .7), 'Brown': (0x5a3a26, .8, 0), 'Shower Floor Base': (0xd8d8d0, .4, 0), 'Red': (0xa02020, .4, 0), 'Blue': (0x2040a0, .4, 0), 'Yellow Diffuse': (0xe8d070, .5, 0),
  'Ground Material': (0x4a5a3a, 1, 0), 'Wall_Material': (0xd8cdb4, .9, 0)}
MATS = {}
def gmat(n):
    if n in MATS: return MATS[n]
    m = bpy.data.materials.new('VH_' + re.sub(r'[^A-Za-z0-9]', '', n)[:20]); m.use_nodes = True; nt = m.node_tree
    for k in list(nt.nodes): nt.nodes.remove(k)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(b.outputs[0], o.inputs[0])
    if n == 'Glass': b.inputs['Base Color'].default_value = (.05, .07, .08, 1); b.inputs['Roughness'].default_value = .05; m.name = 'VH_glass'
    else:
        hx, r, mt = COLS.get(n, (0xbbbbbb, .8, 0)); c = [((hx >> s) & 255) / 255 for s in (16, 8, 0)]
        b.inputs['Base Color'].default_value = (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1); b.inputs['Roughness'].default_value = r; b.inputs['Metallic'].default_value = mt
    MATS[n] = m; return m
baked = []
for o in objs:
    try: me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    except Exception: continue
    if not me.polygons: continue
    me.transform(T @ o.matrix_world)
    for i, sl in enumerate(me.materials): me.materials[i] = gmat(sl.name if sl else 'White_Diffuse')
    if not me.materials: me.materials.append(gmat('White_Diffuse'))
    nb = bpy.data.objects.new('V_' + o.name, me); bpy.context.scene.collection.objects.link(nb); baked.append((o.name, nb))
# ---- collision: inner walls sliced at 1.3 m (above the panelling, below the door heads), outer walls, fences and fittings at 0.45 m (below the sills)
HI = ['Inner Wall Ground', 'Wall_1st Floor', 'Stairwell_Panels', 'Wall_Panels_Bathrooms', 'Glass_Shower']
LO = ['Outer Walls', 'Outer Wall Corners', 'Outer Wall 02', 'UVs_Fence', 'UVs_Garage Door', 'Kitchen Cupboards', 'Subsurfed_Kitchen Cupboards', 'Subsurfed Bath', 'Subsurfed Free Standing Bath',
  'Cupboards_Bathroom', 'Cupboards_Downstairs Toilet', 'Subsurfed_Stove', 'UVs_Fireplace', 'Subsurfed_Toilet ground', 'Subsurfed_Toilets 1st Floor', 'Subsurfed_Laundry Sink', 'Cupboards Utility ']
H1 = F1 - G0
segs = []
for name, nb in baked:
    hs = [1.3] if name in HI else [.45] if name in LO else []
    for h in hs:
        for lv, z in ((0, h), (1, H1 + h)):
            if lv == 1 and name not in ('Wall_1st Floor', 'Outer Walls', 'Outer Wall Corners', 'Outer Wall 02', 'Subsurfed Bath', 'Subsurfed Free Standing Bath'): continue   # upstairs: walls and the baths only
            bm = bmesh.new(); bm.from_mesh(nb.data)
            r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
            for e in r['geom_cut']:
                if isinstance(e, bmesh.types.BMEdge):
                    a, b = e.verts[0].co, e.verts[1].co
                    if abs(a.z - z) < 1e-3 and abs(b.z - z) < 1e-3: segs.append((lv, a.x / S3, -a.y / S3, b.x / S3, -b.y / S3, name))
            bm.free()
print('segments', len(segs))
# doorways: the model's doors are 0.86 m, narrower than the player; clear 1.8 m of wall around every door leaf
CARVE = []
for o in bpy.data.objects:
    if o.type != 'MESH' or not re.match(r'^(Door_|Doors_)', o.name) or 'Closet' in o.name or 'Glass' in o.name: continue
    vv = [T @ o.matrix_world @ v.co for v in o.data.vertices]; x0, x1 = min(v.x for v in vv) / S3, max(v.x for v in vv) / S3; y0, y1 = -max(v.y for v in vv) / S3, -min(v.y for v in vv) / S3
    zc = (min(v.z for v in vv) + max(v.z for v in vv)) / 2; lv = 1 if zc > H1 * .6 else 0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; along_x = (x1 - x0) >= (y1 - y0)
    if min(x1 - x0, y1 - y0) > 5: CARVE.append((lv, cx - 25, cy - 25, cx + 25, cy + 25))   # a leaf left ajar: clear a square around it
    else: CARVE.append((lv, cx - (22 if along_x else 11), cy - (11 if along_x else 22), cx + (22 if along_x else 11), cy + (11 if along_x else 22)))
# the door frames are the real doorways: every loose part of the frame objects is one frame
for name, nb in baked:
    if not re.search(r'DoorFrames|Doorframes', name): continue
    bm = bmesh.new(); bm.from_mesh(nb.data); bm.verts.ensure_lookup_table(); seen = set()
    for v0 in bm.verts:
        if v0.index in seen: continue
        stack = [v0]; comp = []; seen.add(v0.index)
        while stack:
            v = stack.pop(); comp.append(v.co.copy())
            for e in v.link_edges:
                w = e.other_vert(v)
                if w.index not in seen: seen.add(w.index); stack.append(w)
        xs = [c.x / S3 for c in comp]; ys = [-c.y / S3 for c in comp]; zs = [c.z for c in comp]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys); w_, d_ = x1 - x0, y1 - y0
        if max(zs) - min(zs) < 1.6 or max(w_, d_) < 12 or max(w_, d_) > 50: continue   # not a door frame
        lv = 1 if min(zs) > H1 * .6 else 0; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if w_ >= d_: CARVE.append((lv, cx - max(w_ / 2, 20), cy - 16, cx + max(w_ / 2, 20), cy + 16))
        else: CARVE.append((lv, cx - 16, cy - max(d_ / 2, 20), cx + 16, cy + max(d_ / 2, 20)))
    bm.free()
print('doors', len(CARVE))
# ---- stairs: the flight's footprint and which end is at the top
st = bpy.data.objects['UVs_Stairs']; sv = [T @ st.matrix_world @ v.co for v in st.data.vertices]
sx0, sx1 = min(v.x for v in sv), max(v.x for v in sv); sy0, sy1 = min(v.y for v in sv), max(v.y for v in sv)
lo = [v.z for v in sv if v.y < sy0 + .4]; hi = [v.z for v in sv if v.y > sy1 - .4]
upNorth = (sum(hi) / len(hi)) > (sum(lo) / len(lo))   # top end at Blender +Y = game -y
stairs = {'x0': sx0 / S3, 'x1': sx1 / S3, 'y0': -sy1 / S3, 'y1': -sy0 / S3, 'ax': 'y', 'dir': -1 if upNorth else 1}
SX0, SX1, SY0, SY1 = stairs['x0'] + 5, stairs['x1'] - 5, stairs['y0'] - 2, stairs['y1'] + 2
# rasterise the cut lines onto a 6-unit grid per floor, then merge runs into boxes (walls in the game are axis-aligned boxes)
C = 6; boxes = []
for lv in (0, 1):
    cells = set()
    for s in segs:
        if s[0] != lv: continue
        x0, y0, x1, y1 = s[1:5]; L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L / 2))
        for k in range(n + 1):
            x = x0 + (x1 - x0) * k / n; y = y0 + (y1 - y0) * k / n
            if any(c[0] == lv and c[1] <= x <= c[3] and c[2] <= y <= c[4] for c in CARVE): continue
            if SX0 <= x <= SX1 and SY0 <= y <= SY1: continue
            cells.add((math.floor(x / C), math.floor(y / C)))
    # merge horizontal runs, then stack identical runs vertically
    runs = {}
    for (i, j) in sorted(cells, key=lambda c: (c[1], c[0])):
        pass
    rows = {}
    for (i, j) in cells: rows.setdefault(j, []).append(i)
    rl = []
    for j, xs in rows.items():
        xs.sort(); a = xs[0]; p = a
        for x in xs[1:] + [None]:
            if x is not None and x == p + 1: p = x; continue
            rl.append((a, p, j)); a = x; p = x
    rl.sort(key=lambda r: (r[0], r[1], r[2])); used = [False] * len(rl); idx = {(r[0], r[1], r[2]): k for k, r in enumerate(rl)}
    for k, (a, b, j) in enumerate(rl):
        if used[k]: continue
        used[k] = True; j1 = j
        while (a, b, j1 + 1) in idx and not used[idx[(a, b, j1 + 1)]]: j1 += 1; used[idx[(a, b, j1)]] = True
        boxes.append([a * C, j * C, (b - a + 1) * C, (j1 - j + 1) * C, lv])
print('boxes', len(boxes))
foot = [min(v.x for v in vs) - CX, max(v.x for v in vs) - CX, min(v.y for v in vs) - CY, max(v.y for v in vs) - CY]
json.dump({'boxes': boxes, 'stairs': stairs, 'f1': F1 - G0, 'f2': F2 - G0, 'foot': [foot[0] / S3, -foot[3] / S3, foot[1] / S3, -foot[2] / S3]}, open(COL, 'w'))
print('stairs', stairs, 'f1', F1 - G0)
# ---- join everything into one object, decimate the dense bits, export
for name, nb in baked:
    n = len(nb.data.polygons)
    if n > 4000:
        bpy.ops.object.select_all(action='DESELECT'); nb.select_set(True); bpy.context.view_layer.objects.active = nb
        m = nb.modifiers.new('d', 'DECIMATE'); m.ratio = max(.03, 3000 / n); bpy.ops.object.modifier_apply(modifier='d')
for o in list(bpy.data.objects):
    if not o.name.startswith('V_'): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active = baked[0][1]; bpy.ops.object.join()
j = bpy.context.view_layer.objects.active; j.name = 'VIC_house'
for ca in list(j.data.color_attributes): j.data.color_attributes.remove(ca)
while len(j.data.uv_layers): j.data.uv_layers.remove(j.data.uv_layers[0])
print('faces', len(j.data.polygons))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_vertex_color='NONE', export_tangents=False, export_texcoords=False, export_animations=False)
