# build 68: two guns assembled from "Firearms_kit_1.0" (CC0, Britdawgmasterfunk): an M249-style LMG and an MX4-style thumbhole carbine
# usage: python3 -I kitgun_blend.py -- Firearms_kit_1.0.blend out.blend
import bpy, sys, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
sc = bpy.context.scene
def M(name, col, met, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Metallic'].default_value = met; b.inputs['Roughness'].default_value = rough; return m
STEEL = M('GunSteel', (.045, .047, .05), .85, .42); POLY = M('GunPolymer', (.03, .031, .03), 0, .62); MAG = M('GunMag', (.05, .05, .045), .55, .5); OD = M('GunOD', (.12, .13, .09), 0, .7)
def part(n, mat):
    src = sc.objects[n]; me = src.data.copy(); o = bpy.data.objects.new(n + '_k', me); sc.collection.objects.link(o); o.matrix_world = src.matrix_world.copy()
    me.materials.clear(); me.materials.append(mat); return o
def bb(o):
    pts = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return mathutils.Vector([min(p[i] for p in pts) for i in range(3)]), mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
def put(o, x=None, x0=None, x1=None, z=None, z0=None, z1=None):
    mn, mx = bb(o); d = mathutils.Vector((0, -(mn.y + mx.y) / 2, 0))
    if x is not None: d.x = x - (mn.x + mx.x) / 2
    if x0 is not None: d.x = x0 - mn.x
    if x1 is not None: d.x = x1 - mx.x
    if z is not None: d.z = z - (mn.z + mx.z) / 2
    if z0 is not None: d.z = z0 - mn.z
    if z1 is not None: d.z = z1 - mx.z
    o.location += d; bpy.context.view_layer.update()
def join(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = bpy.context.view_layer.objects.active; o.name = name; return o
# --- LMG: long receiver with feed cover, ventilated guard, barrel, G3-style stock, pistol grip, box magazine, folded bipod
r = part('body', STEEL); put(r, x=0, z=0); R0, R1 = bb(r); H = R1.z - R0.z
hg = part('hand_guard.003', POLY); put(hg, x0=R1.x - .05, z=R0.z + .55 * H); G0, G1 = bb(hg)
br = part('barrel', STEEL); put(br, x0=G1.x - .35, z=(G0.z + G1.z) / 2)
st = part('stock.002', POLY); put(st, x1=R0.x + .12, z1=R1.z - .08)
gp = part('grip.003', POLY); put(gp, x=R0.x + .32 * (R1.x - R0.x), z1=R0.z + .2)
mg = part('magazine.003', OD); put(mg, x=R0.x + .58 * (R1.x - R0.x), z1=R0.z + .15)
bp = part('bipod', STEEL); put(bp, x1=G1.x - .05, z1=G0.z + .08)
join([r, hg, br, st, gp, mg, bp], 'LMG_asm')
# --- MX4-style carbine (build 68): compact receiver with grip, short ventilated guard, barrel, folding stock, slim magazine
r = part('body.001', STEEL); put(r, x=0, z=0); R0, R1 = bb(r); H = R1.z - R0.z
hg = part('hand_guard.006', POLY); put(hg, x0=R1.x - .1, z=R0.z + .78 * H); G0, G1 = bb(hg)
br = part('barrel', STEEL); put(br, x0=G1.x - .9, z=(G0.z + G1.z) / 2)
st = part('stock.004', POLY); put(st, x1=R0.x + .42 * (R1.x - R0.x), z1=R1.z - .12 * H)
mg = part('magazine.001', MAG); put(mg, x=R0.x + .7 * (R1.x - R0.x), z1=R0.z + .62 * H)
join([r, hg, br, st, mg], 'MX4_asm')
for o in list(sc.objects):
    if o.name not in ('LMG_asm', 'MX4_asm'): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=a[1]); print('SAVED')
