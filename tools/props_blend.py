# ColdShore build 59: props for Haven and the towns, modelled in Blender and exported as one GLB (props.json in the game).
# Uses the materials and primitives of haven_blend.py. Every asset is an empty named HP_<thing> with its meshes under it.
# Units are metres, origin on the ground at the asset's centre, front toward Blender -Y (game +y, "south").
import bpy, math, random, sys, os
SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'haven_blend.py')).read()
exec(SRC.split('def tower(L):')[0])
random.seed(59)
M.update(dict(contB=mat('contB', 0x2c5a7a, .7, .35), contR=mat('contR', 0x8a2a1e, .7, .35), contG=mat('contG', 0x3e5a3a, .7, .35), contY=mat('contY', 0xc08a22, .7, .35),
  stripeO=mat('stripeO', 0xe0661c, .6), bag=mat('bag', 0x121314, .35, .1), brick=mat('brick', 0x8a4a36, .95), tentW=mat('tentW', 0xd9d6cc, .9), navy=mat('navy', 0x23324a, .8),
  brown=mat('brown', 0x5a3a22, .8), blueC=mat('blueC', 0x2a5a9a, .7), pot=mat('pot', 0x2a2a2a, .4, .7), signG=mat('signG', 0x1f5a34, .6), net=mat('net', 0x3a4628, .95)))
def ring(cx, cy, z, r, n, fn):
    for i in range(n): a = i / n * 2 * math.pi; fn(cx + math.cos(a) * r, cy + math.sin(a) * r, a)
# ================================================================= shipping containers (20 ft)
def container(nm, m):
    begin(); L, Wd, Ht = 6.06, 2.44, 2.59
    box(L, Wd, .12, 0, 0, .06, M['steelD'], bev=0)
    for sx in (-1, 1):
        for sy in (-1, 1): box(.16, .16, Ht, sx * (L / 2 - .08), sy * (Wd / 2 - .08), Ht / 2, M['steelD'], bev=0)
    for z in (.12, Ht - .08):
        for sy in (-1, 1): box(L, .14, .16, 0, sy * (Wd / 2 - .07), z, m, bev=0)
    for sy in (-1, 1): corrugated(L - .3, Ht - .3, 0, sy * (Wd / 2 - .02), Ht / 2, m, 0, 0, 34, .035)
    corrugated(Wd - .3, Ht - .3, -L / 2 + .03, 0, Ht / 2, m, math.pi / 2, 0, 14, .03)
    box(L, Wd, .06, 0, 0, Ht - .03, m, bev=0)
    for k in range(6): box(.9, Wd - .3, .03, -L / 2 + .6 + k * 1, 0, Ht + .005, m, bev=0)
    for sy in (-1, 1):   # the doors at +X: two leaves, four lock bars, hinges
        box(.05, Wd / 2 - .1, Ht - .3, L / 2 - .02, sy * (Wd / 4), Ht / 2, m, bev=0)
        for k in (-.25, .25): cyl(.022, Ht - .2, L / 2 + .03, sy * (Wd / 4) + k * sy, Ht / 2, M['galv'], 6)
        for z in (.7, Ht - .7): box(.06, .18, .1, L / 2 + .02, sy * (Wd / 2 - .12), z, M['steelD'], bev=0)
    box(.04, .5, .3, L / 2 + .04, -.25, 1.3, M['white'], bev=0)
    for k in range(3): box(random.uniform(.3, .9), .02, random.uniform(.2, .5), random.uniform(-2.5, 2.5), -Wd / 2 - .03, random.uniform(.4, 2.2), M['rust'], bev=0)
    end(nm)
for nm, m in (('HP_container_b', M['contB']), ('HP_container_r', M['contR']), ('HP_container_g', M['contG']), ('HP_container_y', M['contY'])): container(nm, m)
# ================================================================= water tower
begin(); H0 = 5.2
for sx in (-1, 1):
    for sy in (-1, 1): beam((sx * 1.6, sy * 1.6, 0), (sx * 1.15, sy * 1.15, H0), .18, M['log'])
for z in (1.6, 3.4):
    k = 1.6 - (1.6 - 1.15) * z / H0
    for s in (-1, 1): beam((-k, s * k, z), (k, s * k, z), .1, M['plankD']); beam((s * k, -k, z), (s * k, k, z), .1, M['plankD'])
for s in (-1, 1): beam((-1.6, s * 1.6, .1), (1.3, s * 1.3, 3.3), .07, M['plankD']); beam((s * 1.6, -1.6, .1), (s * 1.3, 1.3, 3.3), .07, M['plankD'])
box(3, 3, .18, 0, 0, H0 + .09, M['plankD'])
cyl(1.45, 2.6, 0, 0, H0 + 1.48, M['plank2'], 20)
for z in (H0 + .45, H0 + 1.4, H0 + 2.35): torus(1.47, .035, 0, 0, z, M['steelD'], seg=20, seg2=4)
cyl(1.6, .9, 0, 0, H0 + 3.2, M['rust'], 20, r2=.08)
ladder(0, -1.5, 0, H0 + 2.8, .45); rod((1.1, -1.1, H0), (1.3, -1.3, .3), .08, M['steelD'], 8); cyl(.12, .3, 1.3, -1.3, .15, M['steelD'], 8)
box(.4, .4, .6, 1.6, -1.6, .3, M['steel'])
end('HP_watertower')
# ================================================================= sandbag nest with a camo net
begin()
sandbags(0, -1.3, 0, 3.0, 4); sandbags(-1.4, 0, 0, 2.4, 4, math.pi / 2); sandbags(1.4, 0, 0, 2.4, 4, math.pi / 2)
for x, y in ((-1.6, -1.5), (1.6, -1.5), (-1.6, 1.4), (1.6, 1.4)): cyl(.05, 2.3, x, y, 1.15, M['plankD'], 6)
o = box(3.6, 3.3, .02, 0, 0, 2.25, M['net'], 0, .05, bev=0)
for k in range(14): box(random.uniform(.3, .6), random.uniform(.3, .6), .02, random.uniform(-1.6, 1.6), random.uniform(-1.4, 1.4), 2.27, random.choice([M['olive'], M['tarpG'], M['net']]), random.uniform(0, 3), bev=0)
crate(.7, .6, 0, .55, .2, M['olive']); box(.45, .25, .22, -.6, .8, .11, M['olive']); box(.45, .25, .22, -.6, .8, .33, M['olive'])
rod((0, -.9, .95), (0, -2.1, 1.05), .03, M['steelD'], 6); box(.5, .3, .25, 0, -.8, .95, M['steelD'])
end('HP_nest')
# ================================================================= firewood store
begin()
for x in (-1.5, 1.5):
    for y in (-.5, .5): box(.1, .1, 1.9, x, y, .95, M['log'], bev=0)
box(3.3, 1.4, .04, 0, 0, 1.95, M['rust'], 0, .1, bev=0)
for r in range(5):
    for i in range(9): cyl(.12, 1.0, -1.2 + i * .3 + (r % 2) * .15, 0, .13 + r * .22, random.choice([M['log'], M['bark']]), 7, 0, math.pi / 2, math.pi / 2)
cyl(.28, .5, 2.2, -.3, .25, M['log'], 10); box(.04, .04, .6, 2.2, -.3, .7, M['plankD'], 0, .5, bev=0); box(.2, .05, .12, 2.33, -.3, .95, M['steel'], bev=0)
for k in range(4): cyl(.11, .4, 2.0 + k * .15, .4, .06, M['log'], 6, math.pi / 2, 0, random.uniform(0, 3))
end('HP_woodpile')
# ================================================================= scrap heap
begin()
for k in range(7):
    o = corrugated(random.uniform(1.4, 2.4), random.uniform(.8, 1.2), random.uniform(-1, 1), random.uniform(-.8, .8), .3 + k * .07, random.choice([M['rust'], M['rust2'], M['galv']]), random.uniform(0, 3), random.uniform(1.2, 1.7), 10, .03)
for k in range(4): tire(random.uniform(-1.4, 1.4), random.uniform(-1, 1), random.uniform(0, .4))
for k in range(5): rod((random.uniform(-1.5, 1.5), random.uniform(-1, 1), random.uniform(0, .3)), (random.uniform(-1.5, 1.5), random.uniform(-1, 1), random.uniform(.2, .9)), .04, M['steel'], 6)
barrel(1.6, .8, 0, M['rust']); box(1.1, .08, .9, -1.3, .9, .5, M['contR'], .4, .2, -.3); box(.7, .5, .45, .4, 1.1, .22, M['steelD'])
end('HP_scrap')
# ================================================================= burn barrel
begin()
cyl(.3, .9, 0, 0, .45, M['rust'], 14)
for k in range(8): a = k / 8 * 2 * math.pi; box(.06, .02, .08, math.cos(a) * .3, math.sin(a) * .3, .28 + (k % 2) * .22, M['black'], a + math.pi / 2, bev=0)
for k in range(3): box(.7, .02, .02, 0, -.2 + k * .2, .93, M['steelD'], bev=0)
for k in range(4): cyl(.06, .45, random.uniform(-.1, .1), random.uniform(-.1, .1), .85, M['bark'], 6, random.uniform(-.5, .5), random.uniform(-.5, .5))
end('HP_burnbarrel')
# ================================================================= mess hall: an open pavilion with long tables and a cook station
begin(); w, d, h = 9, 5.4, 2.8
for i in range(4):
    for s in (-1, 1): box(.2, .2, h, -w / 2 + i * w / 3, s * d / 2, h / 2, M['log'])
for s in (-1, 1): box(w + .4, .18, .25, 0, s * d / 2, h, M['plankD'], bev=0)
for i in range(4): beam((-w / 2 + i * w / 3, -d / 2 - .2, h), (-w / 2 + i * w / 3, 0, h + 1.2), .14, M['plankD']); beam((-w / 2 + i * w / 3, d / 2 + .2, h), (-w / 2 + i * w / 3, 0, h + 1.2), .14, M['plankD'])
th = math.atan2(1.2, d / 2 + .4); sl = math.hypot(d / 2 + .4, 1.2)
for s in (-1, 1):
    box(w + .6, sl, .04, 0, s * (d / 2 + .4) / 2, h + .6, M['rust'] if s < 0 else M['galv'], 0, -s * th, bev=0)
    for k in range(12): box(.05, sl, .03, -w / 2 - .2 + k * (w + .4) / 11, s * (d / 2 + .4) / 2, h + .64, M['rust2'] if s < 0 else M['steel'], 0, -s * th, bev=0)
for t in (-1.1, 1.1):
    box(6, .9, .06, -.6, t, .78, M['plank2']); [box(.08, .8, .76, -.6 + x, t, .38, M['plankD'], bev=0) for x in (-2.6, 0, 2.6)]
    for b in (-.65, .65): box(6, .3, .05, -.6, t + b, .45, M['plank'], bev=0); [box(.06, .25, .43, -.6 + x, t + b, .21, M['plankD'], bev=0) for x in (-2.6, 2.6)]
for k in range(8): cyl(.07, .1, -3 + k * .8, -1.1 + (k % 2) * 2.2, .86, random.choice([M['white'], M['steel'], M['blueC']]), 8)
box(1.4, .8, .9, 3.6, 0, .45, M['steelD']); box(1.4, .8, .04, 3.6, 0, .92, M['steel'], bev=0)
cyl(.22, .28, 3.3, 0, 1.08, M['pot'], 12); cyl(.18, .2, 3.85, .1, 1.04, M['pot'], 12); rod((3.9, 0, .92), (3.9, 0, h + 1), .07, M['steelD'], 8)
for k in range(3): crate(4.2, -2 + k * .7, 0, .55, .1, M['plank2'])
for k in range(4): box(.02, .4, .3, -w / 2 - .02, -1.2 + k * .8, 1.6, random.choice([M['paper'], M['white']]), bev=0)
lamp(-w / 2 + .2, d / 2 + .3, 0, 3.2, .4)
end('HP_messhall')
# ================================================================= lookout platform
begin(); hh = 3.2
for sx in (-1, 1):
    for sy in (-1, 1): box(.18, .18, hh + 1.1, sx * 1.2, sy * 1.2, (hh + 1.1) / 2, M['log'])
box(2.8, 2.8, .14, 0, 0, hh, M['plank'])
for s in (-1, 1): beam((-1.2, s * 1.2, .3), (1.2, s * 1.2, hh - .3), .08, M['plankD']); beam((s * 1.2, -1.2, .3), (s * 1.2, 1.2, hh - .3), .08, M['plankD'])
sandbags(0, 1.25, hh + .07, 2.4, 2); sandbags(-1.25, 0, hh + .07, 2.4, 2, math.pi / 2); sandbags(1.25, 0, hh + .07, 2.4, 2, math.pi / 2)
box(3, 3, .05, 0, 0, hh + 1.15, M['tarpG'], 0, .06, bev=0); ladder(.4, -1.45, 0, hh + .8, .5)
box(.3, .3, .2, .6, .6, hh + .17, M['olive'])
end('HP_lookout')
# ================================================================= small things
begin()   # picnic table
box(1.9, .8, .06, 0, 0, .76, M['plank2'])
for s in (-1, 1): box(1.9, .28, .05, 0, s * .68, .45, M['plank'], bev=0); beam((s * .75, -.8, 0), (s * .75, .8, .78), .07, M['plankD']); beam((s * .75, .8, 0), (s * .75, -.8, .78), .07, M['plankD'])
end('HP_picnic')
begin()   # outdoor shelving under a lean-to
for x in (-1.2, 1.2):
    for y in (-.3, .3): box(.05, .05, 2, x, y, 1, M['steelD'], bev=0)
for z in (.25, .9, 1.55): box(2.5, .65, .04, 0, 0, z, M['galv'], bev=0)
for z in (.25, .9, 1.55):
    for k in range(4): r = random.random(); (crate(-.9 + k * .6, 0, z + .02, .4, random.uniform(-.2, .2), random.choice([M['plank2'], M['olive'], M['white']])) if r < .55 else jerry(-.9 + k * .6, 0, z + .02, random.choice([M['red'], M['olive']])) if r < .8 else cyl(.15, .3, -.9 + k * .6, 0, z + .17, M['blueC'], 10))
for x in (-1.5, 1.5): cyl(.04, 2.6, x, -.9, 1.3, M['plankD'], 6)
box(3.3, 1.8, .03, 0, -.1, 2.45, M['tarpB'], 0, -.18, bev=0)
end('HP_shelves')
begin()   # lean-to with a cot
for x in (-1.3, 1.3): cyl(.05, 2.2, x, .9, 1.1, M['plankD'], 6); cyl(.05, 1.2, x, -.9, .6, M['plankD'], 6)
box(2.9, 2.1, .03, 0, 0, 1.68, M['tarpG'], 0, .52, bev=0)
box(1.9, .7, .08, 0, .1, .42, M['olive'], bev=0); [box(.04, .04, .4, x, y, .2, M['steelD'], bev=0) for x in (-.9, .9) for y in (-.2, .4)]
box(.5, .4, .12, -.6, .1, .52, M['canvas']); crate(1.1, -.6, 0, .5, .3); cyl(.1, .3, 1.1, -.6, .65, M['red'], 8)
end('HP_leanto')
begin()   # outhouse
box(1.2, 1.2, 2.1, 0, 0, 1.05, M['plank2']); gable(1.5, 1.5, .35, 0, 0, 2.1, M['rust'], 'x')
box(.75, .04, 1.8, 0, -.62, .95, M['plankD'], bev=0); sphere(.08, 0, -.65, 1.6, M['black'], 1, .2, 1.2, 8); box(.05, .06, .12, .3, -.66, .95, M['steelD'], bev=0)
end('HP_outhouse')
begin()   # pallets and a crate stack
for k in range(5): pallet(0, 0, k * .15, .03 * k)
crate(1.3, .2, 0, .8, .1); crate(1.3, .2, .8, .7, .3); crate(2.1, -.2, 0, .8, -.15, M['olive'])
end('HP_pallets')
begin()   # oil drums on a pallet
pallet(0, 0, 0)
for k in range(4): barrel(-.3 + (k % 2) * .6, -.3 + (k // 2) * .6, .15, random.choice([M['red'], M['contB'], M['olive'], M['steel']]))
barrel(1.0, .4, 0, M['rust']); barrel(1.1, -.3, 0, M['contY'])
end('HP_drums')
begin()   # tyre stack and a wheelbarrow
for k in range(5): tire(0, 0, k * .26)
for k in range(3): tire(.85, .2, k * .26)
box(.7, .5, .3, -1, .3, .5, M['steel'], .2, bev=.02); cyl(.17, .06, -1.45, .15, .17, M['tire'], 12, math.pi / 2, 0, .2)
rod((-1.4, .12, .17), (-.4, .55, .55), .025, M['steelD']); rod((-1.3, .45, .17), (-.3, .85, .55), .025, M['steelD'])
end('HP_tires')
begin()   # a makeshift lamp
cyl(.07, 3.6, 0, 0, 1.8, M['plankD'], 6); beam((0, 0, 3.4), (0, -.7, 3.5), .05, M['plankD']); box(.22, .22, .25, 0, -.7, 3.3, M['wire'], bev=0); box(.12, .12, .14, 0, -.7, 3.25, M['bulb'], bev=0)
rod((0, 0, 3.5), (.4, .3, 0), .008, M['black'], 3); box(.4, .3, .5, .5, .4, .25, M['steel'])
end('HP_lampm')
begin()   # signpost with arrow planks
cyl(.08, 2.8, 0, 0, 1.4, M['log'], 7)
for k, (rz, m) in enumerate(((0, M['white']), (math.pi, M['yellow']), (.5, M['white']))):
    o = box(1.2, .05, .26, math.cos(rz) * .55, math.sin(rz) * .55, 2.5 - k * .38, m, rz); pyramid(.26, .25, math.cos(rz) * 1.2, math.sin(rz) * 1.2, 2.5 - k * .38 - .13, m)
end('HP_signpost')
begin()   # three HESCO baskets
for k in range(3):
    x = -1.1 + k * 1.1; box(1.05, 1.05, 1.3, x, 0, .65, M['sand'], bev=0)
    for s in (-1, 1): chainlink(x - .52, x + .52, s * .53, 0, 1.32) if False else None
    for i in range(5): box(.02, 1.07, 1.32, x - .52 + i * .26, 0, .66, M['galv'], bev=0)
    for i in range(5): box(1.07, 1.07, .02, x, 0, .05 + i * .31, M['galv'], bev=0) if i in (0, 4) else box(1.07, .02, .02, x, -.53, .05 + i * .31, M['galv'], bev=0)
end('HP_hesco')
begin()   # concrete jersey barrier
me = bpy.data.meshes.new('jb'); bm = bmesh.new(); prof = [(-.3, 0), (.3, 0), (.3, .08), (.1, .3), (.08, .81), (-.08, .81), (-.1, .3), (-.3, .08)]
for x in (-1.5, 1.5): [bm.verts.new((x, py, pz)) for py, pz in prof]
bm.verts.ensure_lookup_table(); n = len(prof)
for i in range(n): bm.faces.new((bm.verts[i], bm.verts[(i + 1) % n], bm.verts[n + (i + 1) % n], bm.verts[n + i]))
bm.faces.new([bm.verts[i] for i in range(n)][::-1]); bm.faces.new([bm.verts[n + i] for i in range(n)])
bm.normal_update(); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('jb', me); _link(o, M['conc'])
for x in (-1.2, 0, 1.2): box(.25, .62, .05, x, 0, .55, M['stripeO'], bev=0) if x == 0 else None
end('HP_jersey')
# ================================================================= town things
begin()   # police sawhorse barricade
for x in (-1.1, 1.1):
    for s in (-1, 1): beam((x, s * .35, 0), (x, 0, 1.05), .06, M['steelD'])
for k, z in enumerate((.55, .95)):
    box(2.6, .05, .2, 0, 0, z, M['white'], bev=0)
    for i in range(5): box(.25, .06, .2, -1.1 + i * .55, 0, z, M['stripeO'], .7, bev=0)
box(.12, .04, .12, 1.2, 0, 1.12, M['stripeO'], bev=0)
end('HP_sawhorse')
begin()   # a relief tent with supplies
w, d, hh = 6, 4, 2.2
for x in (-w / 2, 0, w / 2): [box(.06, .06, hh * .6, x, s * d / 2, hh * .3, M['steelD'], bev=0) for s in (-1, 1)]
for x in (-w / 2, w / 2): box(.06, .06, hh * .6 + 1.0, x, 0, (hh * .6 + 1.0) / 2, M['steelD'], bev=0)
box(w, d, hh * .6, 0, 0, hh * .3, M['tentW'], bev=0); gable(w + .2, d + .4, 1.0, 0, 0, hh * .6, M['tentW'], 'x')
box(1.6, .05, 1.4, -1.2, -d / 2 - .03, .7, M['blueC'], bev=0); box(1.3, .03, .4, 1, -d / 2 - .03, hh * .5, M['white'], bev=0)
for k in range(5): crate(-2.4 + k * .6, -d / 2 - .8, 0, .5, random.uniform(-.3, .3), M['white'])
for k in range(3): cyl(.15, .4, 2 + k * .35, -d / 2 - .7, .2, M['blueC'], 10)
for s in (-1, 1):
    for x in (-w / 2, w / 2): rod((x, s * d / 2, hh * .6), (x * 1.25, s * (d / 2 + 1), 0), .006, M['canvas'], 3)
end('HP_tent')
begin()   # rubbish bags
for k in range(9): sphere(random.uniform(.25, .38), random.uniform(-.8, .8), random.uniform(-.5, .5), .22, M['bag'], 1, 1, random.uniform(.7, 1.0), 9)
for k in range(3): box(random.uniform(.2, .4), .02, random.uniform(.2, .3), random.uniform(-.9, .9), random.uniform(-.7, .7), .03, random.choice([M['paper'], M['white']]), random.uniform(0, 3), math.pi / 2, bev=0)
end('HP_bags')
begin()   # bus shelter
box(3.2, .08, .1, 0, .7, 2.3, M['steelD'], bev=0); box(3.4, 1.7, .08, 0, 0, 2.4, M['galv'], bev=0)
for x in (-1.55, 1.55): [box(.08, .08, 2.35, x, y, 1.17, M['steelD'], bev=0) for y in (-.7, .7)]
box(3.1, .03, 1.8, 0, .72, 1.25, M['glass'], bev=0); box(.03, 1.3, 1.8, -1.55, 0, 1.25, M['glass'], bev=0); box(.03, 1.3, 1.8, 1.55, 0, 1.25, M['brick'], bev=0)
box(2.6, .4, .05, 0, .45, .48, M['plank'], bev=0); [box(.06, .3, .46, x, .45, .23, M['steelD'], bev=0) for x in (-1.1, 1.1)]
cyl(.04, 2.6, -2, -.6, 1.3, M['galv'], 6); box(.5, .03, .4, -2, -.6, 2.4, M['signG'], bev=0)
end('HP_busstop')
begin()   # park bench
for x in (-.75, .75): box(.06, .55, .45, x, 0, .22, M['steelD'], bev=0); box(.06, .06, .5, x, .25, .7, M['steelD'], bev=0)
for k in range(4): box(1.7, .1, .03, 0, -.2 + k * .13, .46, M['plank'], bev=0)
for k in range(3): box(1.7, .03, .1, 0, .27, .62 + k * .13, M['plank'], .0, -.15, bev=0)
end('HP_bench')
begin()   # newspaper boxes
for k, m in enumerate((M['blueC'], M['red'], M['yellow'])): box(.45, .45, .95, -.5 + k * .5, 0, .5, m); box(.36, .02, .3, -.5 + k * .5, -.23, .72, M['glass'], bev=0)
end('HP_newsbox')
begin()   # shopping cart, tipped
for x in (-.3, .3):
    for y in (-.4, .4): cyl(.06, .04, x, y, .06, M['black'], 8, math.pi / 2)
box(.62, .9, .05, 0, 0, .25, M['galv'], bev=0)
for k in range(6): box(.62, .02, .45, 0, -.45 + k * .18, .5, M['wire'], bev=0)
for k in range(4): box(.02, .9, .45, -.3 + k * .2, 0, .5, M['wire'], bev=0)
rod((-.3, .5, .75), (.3, .5, .75), .02, M['red'], 6)
end('HP_cart')
begin()   # rubble and planks
for k in range(14): box(random.uniform(.2, .4), random.uniform(.1, .2), random.uniform(.08, .12), random.uniform(-1, 1), random.uniform(-.7, .7), random.uniform(0, .25), M['brick'], random.uniform(0, 3), random.uniform(-.3, .3), bev=0)
for k in range(5): box(random.uniform(1.2, 2.2), .18, .04, random.uniform(-.6, .6), random.uniform(-.6, .6), .3 + k * .05, random.choice([M['plank'], M['plankD']]), random.uniform(0, 3), random.uniform(-.25, .25), bev=0)
box(.9, .5, .8, .9, .5, .3, M['brown'], .4, .3)   # a broken dresser
end('HP_rubble')
begin()   # abandoned luggage
for k in range(6):
    m = random.choice([M['navy'], M['red'], M['brown'], M['olive'], M['black']]); s = random.uniform(.8, 1.2)
    box(.5 * s, .22 * s, .7 * s, random.uniform(-.6, .6), random.uniform(-.4, .4), .11 * s if random.random() < .6 else .35 * s, m, random.uniform(0, 3), math.pi / 2 if random.random() < .6 else 0)
box(.4, .3, .35, .8, .3, .17, M['olive']); sphere(.2, -.8, .4, .12, M['blueC'], 1, .7, .6)
end('HP_luggage')
begin()   # roadside billboard (the game paints the face)
for x in (-2.4, 2.4): box(.25, .25, 6.4, x, 0, 3.2, M['steelD'], bev=0)
box(6.4, .25, 3.0, 0, .1, 5.0, M['white'], bev=0); box(6.6, .3, .12, 0, .1, 3.45, M['steelD'], bev=0); box(6.6, .3, .12, 0, .1, 6.55, M['steelD'], bev=0)
grating(6.4, .6, 0, -.45, 3.4, M['galv'])
for x in (-1.8, 0, 1.8): rod((x, -.75, 3.45), (x, -.9, 3.9), .03, M['steelD'], 6); box(.25, .2, .12, x, -.92, 3.95, M['steel'], bev=0)
end('HP_billboard')
begin()   # phone booth
box(.9, .9, .1, 0, 0, .05, M['conc'], bev=0)
for x in (-.42, .42): [box(.06, .06, 2.2, x, y, 1.15, M['galv'], bev=0) for y in (-.42, .42)]
box(.9, .9, .2, 0, 0, 2.3, M['galv'], bev=0); box(.86, .02, .2, 0, -.44, 2.2, M['blueC'], bev=0)
for s in (-1, 1): box(.02, .82, 1.5, s * .42, 0, 1.1, M['glass'], bev=0)
box(.8, .02, 1.5, 0, .42, 1.1, M['glass'], bev=0); box(.3, .1, .45, 0, .34, 1.35, M['black'])
end('HP_phone')
begin()   # a burned-out car shell (cheap, low poly)
char = mat('char', 0x2b2622, .95, .2); char2 = mat('char2', 0x4a3428, .9, .25)
box(4.2, 1.8, .55, 0, 0, .55, char); box(2.1, 1.6, .55, -.3, 0, 1.1, char2); box(2, 1.5, .04, -.3, 0, 1.38, M['black'], bev=0)
for k in range(9): box(random.uniform(.3, .9), .02, random.uniform(.15, .35), random.uniform(-1.9, 1.9), random.choice((-.91, .91)), random.uniform(.35, .75), random.choice([M['rust'], M['rust2']]), bev=0)
for k in range(4): box(random.uniform(.4, 1.0), random.uniform(.4, .8), .02, random.uniform(-1.6, 1.6), random.uniform(-.6, .6), .83 if k < 2 else 1.39, M['rust'], bev=0)
box(.9, 1.3, .03, 1.75, 0, .86, char, 0, .25, bev=0)
for x in (-1.35, 1.35):
    for y in (-.85, .85): cyl(.33, .2, x, y, .3, M['black'], 10, math.pi / 2)
for k in range(5): box(random.uniform(.3, .8), .02, random.uniform(.2, .4), random.uniform(-1.8, 1.8), -.91, random.uniform(.4, .8), M['black'], bev=0)
box(.9, .02, .5, 1.6, -.9, .7, M['steelD'], 0, .3, bev=0)
end('HP_burnt')
# ================================================================= export (same as haven_blend.py)
for o in bpy.data.objects:
    if o.type == 'MESH':
        for md in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            try: bpy.ops.object.modifier_apply(modifier=md.name)
            except Exception as e: pass
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
for root in ASSETS: print('FACES', root.name, sum(len(c.data.polygons) for c in root.children if c.type == 'MESH'))
tot = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('TOTAL faces', tot, 'assets', len(ASSETS))
out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/props.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_attributes=False, export_vertex_color='NONE', export_texcoords=False)
