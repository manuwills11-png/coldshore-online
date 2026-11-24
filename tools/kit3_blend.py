# ColdShore build 64: pieces from five BlendSwap packs, cleaned up and exported as one GLB (kit3.json in the game).
#   military_outpost_kit_1.0 by Britdawgmasterfunk (blendswap.com/blend/28377, CC0)  -> MK_*
#   Buildings_kit_1.0 by Britdawgmasterfunk (blendswap.com/blend/29298, CC0)          -> BK_*
#   The_Breakers_yard_1.0 by Britdawgmasterfunk (blendswap.com/blend/29497, CC0)      -> JK_*
#   Living/TV Room Study by mbarros (blendswap.com/blend/25834, CC0)                  -> LR_*
#   Family House Collection by tastyfish (blendswap.com/blend/21776, CC0)            -> FH_*
# Every asset is an empty named after it with one mesh per material under it; metres, origin on the ground at the centre.
# Textures are dropped (except the family houses' baked atlas): each material becomes a flat colour taken from its
# base colour or the average of its image, or from the name table below when the pack has no materials at all.
# usage: python3 kit3_blend.py <mil.blend> <bk.blend> <brk.blend> <living.blend> <houses.blend> -- out.glb
import bpy, bmesh, sys, os, math, re
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') - 5:sys.argv.index('--')]
OUT = sys.argv[sys.argv.index('--') + 1]
MIL, BK, BRK, LIV, FH = args

def mat_flat(name, rgb, rough=.75, metal=0.0, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (emit[0], emit[1], emit[2], 1); b.inputs['Emission Strength'].default_value = 1.0
    return m

def srgb(h): return tuple(((h >> s) & 255) / 255.0 for s in (16, 8, 0))
def lin(c): return tuple(x ** 2.2 for x in c)

def img_avg(img):
    try:
        if img.size[0] == 0: return None
        im = img.copy(); im.scale(8, 8); px = list(im.pixels); bpy.data.images.remove(im)
        n = len(px) // 4; return (sum(px[0::4]) / n, sum(px[1::4]) / n, sum(px[2::4]) / n)
    except Exception: return None

def flat_of(m):
    """(rgb_linear, rough, metal) for an existing material"""
    if m is None: return None
    rough, metal, col = .7, 0.0, None
    if m.use_nodes and m.node_tree:
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b:
            rough = b.inputs['Roughness'].default_value; metal = b.inputs['Metallic'].default_value
            bc = b.inputs['Base Color']
            if bc.links:
                src = bc.links[0].from_node
                if src.type == 'TEX_IMAGE' and src.image: col = img_avg(src.image)
                elif src.type == 'RGB': col = tuple(src.outputs[0].default_value[:3])
                elif src.type in ('VALTORGB',): col = tuple(src.color_ramp.elements[-1].color[:3])
            else: col = tuple(bc.default_value[:3])
        else:
            d = next((n for n in m.node_tree.nodes if n.type == 'BSDF_DIFFUSE'), None)
            if d: col = tuple(d.inputs['Color'].default_value[:3])
    if col is None: col = tuple(m.diffuse_color[:3])
    return col, rough, metal

MATS = {}
def gamemat(prefix, key, rgb, rough, metal):
    k = '%s_%s' % (prefix, key)
    if k not in MATS: MATS[k] = mat_flat(k, rgb, rough, metal)
    return MATS[k]

ASSETS = []   # (name, [objects]) gathered across packs, all in this one file

def load_all(path):
    # objects keep their names from the source file (another pack may already use the same name)
    with bpy.data.libraries.load(path, link=False) as (src, dst): names = list(src.objects); dst.objects = list(names)
    return {n: o for n, o in zip(names, dst.objects) if o is not None}

def bake(o, scale, keep_mats=True):
    """evaluated copy of o in world space, scaled about the world origin; returns a new mesh object"""
    for md in o.modifiers:
        if md.type == 'SUBSURF': md.levels = 0; md.render_levels = 0
        if md.type == 'BEVEL': md.segments = 1
    linked = False
    if o.name not in bpy.context.scene.objects: bpy.context.scene.collection.objects.link(o); linked = True
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
    me.transform(Matrix.Scale(scale, 4) @ o.matrix_world)
    if linked: bpy.context.scene.collection.objects.unlink(o)
    n = bpy.data.objects.new('t_' + o.name, me); bpy.context.scene.collection.objects.link(n); return n

def decimate(o, target):
    n = len(o.data.polygons)
    if n <= target or n < 40: return
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('pl', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(3); bpy.ops.object.modifier_apply(modifier='pl')
    n = len(o.data.polygons)
    if n > target: m = o.modifiers.new('d', 'DECIMATE'); m.ratio = max(.01, target / n); bpy.ops.object.modifier_apply(modifier='d')

def make_asset(name, parts, target, colour=None):
    """parts: list of (object, scale). colour: function(objname, matname) -> (hex, rough, metal) or None to keep"""
    tmp = []
    for o, sc in parts:
        if o is None: print('MISSING part for', name); continue
        t = bake(o, sc); tmp.append((o.name, t))
    if not tmp: print('SKIP', name); return
    tot = sum(len(t.data.polygons) for _, t in tmp) or 1
    for on, t in tmp:
        share = max(30, int(target * len(t.data.polygons) / tot)); decimate(t, share)
        # materials -> flat game materials
        if not t.data.materials: t.data.materials.append(None)
        for i, slot in enumerate(t.material_slots):
            m = slot.material; c = colour(on, m.name if m else '') if colour else None
            if c: hx, r, mt = c; rgb = lin(srgb(hx)); slot.material = gamemat(name[:2], '%06x' % hx, rgb, r, mt)
            elif m is not None:
                f = flat_of(m); rgb, r, mt = f; slot.material = gamemat(name[:2], re.sub(r'[^A-Za-z0-9]', '', m.name)[:18], rgb, r, mt)
            else: slot.material = gamemat(name[:2], 'grey', lin(srgb(0x808080)), .8, 0)
    bpy.ops.object.select_all(action='DESELECT')
    for _, t in tmp: t.select_set(True)
    bpy.context.view_layer.objects.active = tmp[0][1]
    if len(tmp) > 1: bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    for ca in list(j.data.color_attributes): j.data.color_attributes.remove(ca)
    vs = [v.co for v in j.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    j.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    j.name = name + '__mesh'; j.location = (0, 0, 0)
    root = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(root); j.parent = root
    ASSETS.append(root)
    print('ASSET', name, 'faces', len(j.data.polygons), 'size', tuple(round(v, 2) for v in (mx - mn)))

bpy.ops.wm.read_factory_settings(use_empty=True)

# ------------------------------------------------------------------ military outpost kit (metres)
mo = load_all(MIL)
def mcol(on, mn):
    t = (mn or '').lower()
    if 'green' in t: return (0x4a5236, .8, .1)
    if 'tan canvas' in t: return (0xa8956a, .95, 0)
    if 'green canvas' in t: return (0x4b5a36, .95, 0)
    if 'dirt' in t: return (0x5a4632, 1, 0)
    if 'stone' in t: return (0x77736a, .95, 0)
    if 'wire' in t or 'galv' in t or 'alumin' in t or 'steel' in t: return (0x9a9fa2, .5, .7)
    if 'rebar' in t or 'rust' in t: return (0x6a3a22, .8, .4)
    if 'concrete' in t: return (0x9c9a94, .95, 0)
    if 'black' in t: return (0x1c1d1e, .6, .2)
    if 'brown' in t: return (0x4a3424, .7, .3)
    if 'grey metal' in t: return (0x6e7376, .5, .6)
    if 'glass' in t: return (0xf2f0d8, .1, 0)
    if 'wood' in t: return (0xb08a5a, .9, 0)
    if 'string' in t: return (0x3e4a2a, 1, 0)
    if 'roof sheet' in t or 'corrugated' in t: return (0x7d8486, .55, .6)
    return None
M = lambda *ns: [(mo.get(n), 1.0) for n in ns]
make_asset('MK_hesco', M('hesco_large_fabric', 'hesco_large_dirt', 'hesco_large_stones'), 1600, mcol)
make_asset('MK_hesco_s', M('hesco_small_fabric', 'hesco_small_dirt', 'hesco_small_stones'), 700, mcol)
make_asset('MK_sandbags', M('sandbags'), 1800, mcol)
make_asset('MK_barrier', M('concretebarrier_small_main', 'concretebarrier_small_loops'), 300, mcol)
make_asset('MK_barrier_t', M('concretebarrier_tall_main', 'concretebarrier_tall_loops'), 360, mcol)
make_asset('MK_barrier_w', M('concretebarrier_wide_main', 'concretebarrier_wide_loops'), 360, mcol)
make_asset('MK_flood', M('floodlight_bar', 'floodlight_feet', 'floodlight_glass', 'floodlight_lights', 'floodlight_main', 'Plane.011', 'Plane.012', 'Plane.013', 'Plane.014'), 1200, mcol)
make_asset('MK_gen', M('generator'), 900, mcol)
make_asset('MK_cot', M('campcot_frame', 'campcot_fabric', 'campcot_hinges'), 500, mcol)
make_asset('MK_ammo', M('ammotin_40mm', 'ammotin_50cal', 'ammotin_556big', 'ammotin_762'), 900, mcol)
make_asset('MK_explo', M('ammotin_explosives_main', 'ammotin_explosives_lid', 'ammotin_explosives_handles', 'ammotin_explosives_hinges'), 500, mcol)
make_asset('MK_case', M('Cube.034', 'Cube.037'), 700, mcol)
make_asset('MK_net', M('fabric'), 1200, mcol)
make_asset('MK_aa', M('AAmissile_base', 'AAmissile_fins', 'AAmissile_legs', 'AAmissile_main', 'AAmissile_systems', 'AAmissile_turret'), 1400, mcol)
make_asset('MK_post', M('steel_post'), 40, mcol)
make_asset('MK_sheet', M('metal_sheet_01'), 240, mcol)
make_asset('MK_ply', M('plywood_sheet'), 12, mcol)
make_asset('MK_lumber', M('1by4', '2by4', '4by4'), 60, mcol)

# ------------------------------------------------------------------ buildings kit (modelled at double size)
bk = load_all(BK)
def bcol(on, mn):
    t = on.lower()
    if 'door' in t and 'handle' not in t and 'knob' not in t: return None
    if 'fence' in t or 'lattice' in t: return (0x8a6a48, .9, 0) if 'wood' in t or 'rail' in t or 'lattice' in t else (0x2a2b2c, .6, .6)
    if 'chainlink' in t: return (0x9aa0a2, .5, .7)
    if 'radiator' in t or 'towel' in t: return (0xe8e6e0, .4, .3)
    if 'toilet' in t or 'basin' in t or 'sink' in t: return (0xf2f2ee, .25, 0)
    if 'logburner' in t: return (0x1a1a1a, .7, .5)
    if 'fireplace' in t: return (0x8a4a36, .95, 0)
    if 'acunit' in t: return (0xc8cac6, .6, .3)
    if 'lantern' in t or t.startswith('light'): return (0x1e1e1e, .5, .5)
    if 'porch' in t: return (0xe6e2d8, .7, 0)
    if 'stair rails' in t: return (0xf0ede6, .5, 0)
    if 'sash' in t: return (0xf0ede6, .5, 0)
    if 'drawers' in t: return (0x6a4a30, .7, 0)
    return (0xd8d4cc, .7, 0)
def dcol(hexc):
    return lambda on, mn: (hexc, .65, 0)
B = lambda *ns: [(bk.get(n), .5) for n in ns]
make_asset('BK_door4', B('door_4panel'), 200, dcol(0xe9e6de))
make_asset('BK_door6', B('door_6panel'), 260, dcol(0x5a2a22))
make_asset('BK_doorM', B('door_modern'), 200, dcol(0x2a3a48))
make_asset('BK_doorB', B('door_boardnbatten'), 200, dcol(0x6a4a2e))
make_asset('BK_sash', B('DS Window Sash lower', 'DS Window Sash upper'), 400, bcol)
make_asset('BK_porch', B('Porch'), 2600, bcol)
make_asset('BK_fenceH', B('HorizontalWoodFence'), 700, lambda on, mn: (0x7a5a3e, .9, 0))
make_asset('BK_fenceS', B('SplitRailFence'), 500, lambda on, mn: (0x8a7258, .95, 0))
make_asset('BK_fenceR', B('RoughtWoodFence'), 500, lambda on, mn: (0x6e5a44, .95, 0))
# make_asset('BK_fenceI', B('WroughtIronFence'), 1400, lambda on, mn: (0x1e1f20, .5, .6))
# make_asset('BK_fenceC', B('ChainLinkFence'), 1200, lambda on, mn: (0x9aa0a2, .5, .7))
make_asset('BK_lattice', B('Lattice'), 600, lambda on, mn: (0xe8e4da, .8, 0))
make_asset('BK_logburner', B('logburner'), 1400, lambda on, mn: (0x1b1b1b, .65, .55))
make_asset('BK_radiator', B('radiator'), 900, lambda on, mn: (0xeae8e2, .4, .3))
make_asset('BK_ac', B('ACunit'), 1400, lambda on, mn: (0xc9cbc7, .6, .3))
make_asset('BK_lantern', B('Lanterns'), 600, lambda on, mn: (0x1e1e1e, .5, .5))
make_asset('BK_lightL', B('Light Large'), 900, lambda on, mn: (0x2a2a2a, .5, .5))
make_asset('BK_rails', B('Stair Rails'), 1200, lambda on, mn: (0xf0ede6, .5, 0))
# make_asset('BK_towel', B('Heated Towel Rail'), 500, lambda on, mn: (0xd8d8d8, .3, .8))
make_asset('BK_toilet', B('toilet'), 900, lambda on, mn: (0xf2f2ee, .25, 0))
make_asset('BK_basin', B('Basin'), 900, lambda on, mn: (0xf2f2ee, .25, 0))
make_asset('BK_ksink', B('sink.001'), 700, lambda on, mn: (0xb8bcbe, .3, .8))
make_asset('BK_golf', B('Golf-Course-Fence'), 900, lambda on, mn: (0x2f3a2f, .6, .5))

# ------------------------------------------------------------------ the breakers' yard (double size)
jk = load_all(BRK)
def jcol(hexc, r=.8, mt=.3): return lambda on, mn: (hexc, r, mt)
J = lambda *ns: [(jk.get(n), .5) for n in ns]
make_asset('JK_shell', J('interior_Interior.007'), 2600, jcol(0x6e3a26, .85, .35))
make_asset('JK_chassis', J('bottom.002'), 1500, jcol(0x3a2a20, .85, .5))
make_asset('JK_frame', J('Jeep Frame.237'), 1600, jcol(0x433024, .85, .5))
make_asset('JK_susp', J('suspension01.001'), 900, jcol(0x3e3a36, .7, .6))
make_asset('JK_bumper', J('body.025'), 500, jcol(0x7a7e80, .5, .6))
make_asset('JK_bumper2', J('front_bumber'), 500, jcol(0x2a2c2e, .6, .2))
make_asset('JK_fenders', J('ailes'), 600, jcol(0x8a4a2a, .8, .3))
make_asset('JK_seat', J('seat-driver'), 1200, jcol(0x2a2624, .9, 0))
make_asset('JK_bench', J('RearSeat'), 900, jcol(0x4a3a2c, .9, 0))
make_asset('JK_tire', J('Car_Tires_BRL'), 500, jcol(0x151515, .95, 0))
make_asset('JK_tire2', J('Ext_wheel01_tyres_Submesh_1250_Root_008'), 500, jcol(0x171717, .95, 0))
make_asset('JK_motor', J('Motor TEFC 143TC'), 900, jcol(0x2c4a6a, .6, .5))
make_asset('JK_alt', J('altenator/motor'), 600, jcol(0x7a7a78, .5, .7))
make_asset('JK_battery', J('battery'), 300, jcol(0x1e1e20, .6, .1))
make_asset('JK_grill', J('Grill'), 700, jcol(0x9a9ea0, .35, .8))
make_asset('JK_bed', J('Cube.002'), 1400, jcol(0x5a4a3a, .85, .4))
make_asset('JK_door', J('doorLF_animated_Interior'), 700, jcol(0x3a4a5a, .7, .4))

# ------------------------------------------------------------------ living room (metres)
lr = load_all(LIV)
L = lambda *ns: [(lr.get(n), 1.0) for n in ns]
def lcol(on, mn):
    t = (mn or '').lower()
    if 'anigre' in t: return (0x8a5a36, .55, 0)
    if 'leather' in t: return (0x3a2418, .5, 0)
    if 'rug' in t: return (0x8a7f6c, 1, 0)
    if 'white shiny' in t: return (0xeeeeea, .2, 0)
    if 'lamp shade' in t: return (0xe8dcc0, .9, 0)
    if 'grey dark' in t: return (0x2a2b2c, .7, .1)
    if 'grey - metal' in t: return (0x8a8c8e, .35, .8)
    if 'black shiny' in t: return (0x0c0c0e, .15, .2)
    if 'back rough' in t: return (0x1a1a1a, .8, 0)
    if 'concrete' in t: return (0x8e8a84, .9, 0)
    if t == 'material.003': return (0x3d6a2e, .7, 0)
    if t == 'material': return (0x3a2a1e, 1, 0)
    if 'red' in t: return (0x9a1e1e, .3, 0)
    return None
make_asset('LR_couch', L('couch body', 'back cushion', 'seat cushion', 'feet'), 1400, lcol)
make_asset('LR_media', L('media center', 'media center door', 'media center door handle', 'TV', 'buttons'), 300, lcol)
make_asset('LR_side', L('side table left', 'leg 1', 'leg 2', 'leg 3'), 260, lcol)
make_asset('LR_tlamp', L('table lamp base', 'table lamp crown', 'table lamp light'), 300, lcol)
make_asset('LR_rug', L('rug', 'edge'), 80, lcol)
make_asset('LR_plant', L('plant pot', 'Plane') + [(lr.get('Plane.%03d' % k), 1.0) for k in range(1, 18)], 900, lcol)
make_asset('LR_vase1', L('vase 1'), 300, lcol)
make_asset('LR_vase2', L('vase 2'), 300, lcol)

# ------------------------------------------------------------------ family houses (tiny scale; baked texture kept)
fh = load_all(FH)
for k in range(1, 7):
    o = fh.get('house%d_baked' % k)
    if o is None: continue
    t = bake(o, 3.0)
    vs = [v.co for v in t.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    t.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    nm = 'FH_h%d' % k; t.name = nm + '__mesh'
    root = bpy.data.objects.new(nm, None); bpy.context.scene.collection.objects.link(root); t.parent = root; ASSETS.append(root)
    # the pack's material is an old Diffuse BSDF, which glTF drops: rebuild it as Principled with the baked atlas
    img = bpy.data.images.get('house_b_bake.png')
    fm = bpy.data.materials.get('FH_baked')
    if fm is None:
        fm = bpy.data.materials.new('FH_baked'); fm.use_nodes = True; nt = fm.node_tree
        for n in list(nt.nodes): nt.nodes.remove(n)
        bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); ou = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(bs.outputs[0], ou.inputs[0]); bs.inputs['Roughness'].default_value = .9
        if img: tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img; nt.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
    t.data.materials.clear(); t.data.materials.append(fm)
    print('ASSET', nm, 'faces', len(t.data.polygons), 'size', tuple(round(v, 2) for v in (mx - mn)))
for img in bpy.data.images:
    if img.size[0] > 512: img.scale(512, 512)

# keep only the assets
keep = set(ASSETS) | {c for a in ASSETS for c in a.children}
for o in list(bpy.data.objects):
    if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.context.scene.collection.objects): pass
print('TOTAL faces', sum(len(c.data.polygons) for a in ASSETS for c in a.children))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_vertex_color='NONE', export_tangents=False, export_image_format='JPEG', export_jpeg_quality=80, export_animations=False)
