import bpy, bmesh, random
from mathutils import Vector
random.seed(7)
bpy.ops.wm.open_mainfile(filepath='/tmp/up/Trees__Bushes_pack/Trees & Bushes.blend')
for n in ['Plane', 'Plane.001']: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
col = {}
for m in bpy.data.materials:
    if m.use_nodes:
        d = [n for n in m.node_tree.nodes if n.type == 'BSDF_DIFFUSE']
        if d: c = d[0].inputs['Color'].default_value; col[m.name] = c[:3]; m.use_nodes = False; m.diffuse_color = c
def score(m):
    r, g, b = col.get(m.name, (0, 0, 0)); return r + g + b + .05 * g / max(r, 1e-3)
BIG = ['tree.005', 'tree.006', 'tree.007', 'tree.008', 'tree.009', 'leaves.001']
SMALL = ['tree', 'tree.001', 'leaves']
MINLIMB = 1.2
def process(o, newname, leaftarget, barkratio):
    global MINLIMB
    MINLIMB = 1.5 if newname.startswith('Broad') else 1.9
    mats = o.data.materials
    leaf = max(range(len(mats)), key=lambda i: score(mats[i])) if len(mats) > 1 else -1
    # 1. bark: copy out, decimate
    bark = o.copy(); bark.data = o.data.copy(); bpy.context.scene.collection.objects.link(bark)
    bm = bmesh.new(); bm.from_mesh(bark.data); bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == leaf], context='FACES')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    # twigs: small separate pieces go (the crown hides them); trunk and main limbs stay
    seen = set(); kill = []
    for f in bm.faces:
        if f.index in seen: continue
        isl = []; st = [f]; seen.add(f.index)
        while st:
            g = st.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); st.append(h)
        vs = [v.co for q in isl for v in q.verts]; d = (Vector([max(v[i] for v in vs) for i in range(3)]) - Vector([min(v[i] for v in vs) for i in range(3)])).length
        if d < MINLIMB: kill.extend(isl)
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(bark.data); bm.free()
    md = bark.modifiers.new('d', 'DECIMATE'); md.ratio = barkratio
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); bme = bpy.data.meshes.new_from_object(bark.evaluated_get(dg), depsgraph=dg)
    # 2. leaves: thin out faces, scale the survivors up
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != leaf], context='FACES')
    lf = list(bm.faces); p = min(1, leaftarget / max(1, len(lf))); sc = min(3.0, max(1, (1 / p) ** .5 * .75))
    bmesh.ops.delete(bm, geom=[f for f in lf if random.random() > p], context='FACES')
    bmesh.ops.split_edges(bm, edges=list(bm.edges))
    for f in bm.faces:
        c = f.calc_center_median()
        for v in f.verts: v.co = c + (v.co - c) * sc
    # 3. merge bark into the leaf mesh
    bk = bmesh.new(); bk.from_mesh(bme); off = len(bm.verts)
    tmp = bpy.data.meshes.new('t'); bm.to_mesh(tmp); bm.free()
    print('  parts', newname, len(tmp.polygons), len(bme.polygons))
    out = bmesh.new(); out.from_mesh(tmp); out.from_mesh(bme)
    out.to_mesh(o.data); out.free(); bk.free()
    bpy.data.objects.remove(bark, do_unlink=True)
    me = o.data; mw = o.matrix_world
    pts = [mw @ v.co for v in me.vertices]; mn = Vector([min(v[i] for v in pts) for i in range(3)]); mx = Vector([max(v[i] for v in pts) for i in range(3)])
    low = [v for v in pts if v.z < mn.z + .25]; cx = sum(low, Vector()) / max(1, len(low))
    o.location -= Vector((cx.x, cx.y, mn.z)); o.name = newname
    print('TREE', newname, len(me.polygons), [round(x, 1) for x in (mx - mn)], 'leafmat', leaf)
for i, n in enumerate(BIG): process(bpy.data.objects[n], 'Broad%d' % (i + 1), 4500, .25)
for i, n in enumerate(SMALL): process(bpy.data.objects[n], 'Shrub%d' % (i + 1), 1600, .2)
for o in list(bpy.data.objects):
    if not o.name.startswith(('Broad', 'Shrub')): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath='/tmp/trees2.glb', export_format='GLB', export_attributes=False, export_vertex_color='NONE', export_apply=True)
