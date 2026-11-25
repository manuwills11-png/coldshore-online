# build 67: realistic guns -> one GLB, each gun a node "R_<id>": barrel along +X, top +Z, centred, real length in metres
# usage: python3 -I realgun_blend.py -- out.glb 'id;file.blend;objregex;rotZdeg|auto,rotXdeg;flipX;len;tex' ...
import bpy, sys, re, math, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
out, specs = a[0], a[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
made = []
for sp in specs:
    gid, fn, rx, rot, flip, length, tex = sp.split(';')
    with bpy.data.libraries.load(fn, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if re.search(rx, n)]
    objs = [o for o in dst.objects if o and o.type == 'MESH']
    for o in objs:
        bpy.context.scene.collection.objects.link(o)
        for m in o.modifiers:
            if m.type == 'SUBSURF': m.levels = min(m.levels, 1); m.render_levels = min(m.render_levels, 1)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    # bake modifiers into plain meshes, world space
    parts = []
    for o in objs:
        e = o.evaluated_get(dg); me = bpy.data.meshes.new_from_object(e, preserve_all_data_layers=True, depsgraph=dg)
        me.transform(o.matrix_world); n = bpy.data.objects.new(gid + '_p', me); bpy.context.scene.collection.objects.link(n)
        for i, s in enumerate(o.material_slots):
            if i < len(me.materials): me.materials[i] = s.material
        parts.append(n)
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1: bpy.ops.object.join()
    g = bpy.context.view_layer.objects.active; g.name = 'R_' + gid
    # drop helper geometry (wireframe overlays, background cards)
    import bmesh
    bad = [i for i, m in enumerate(g.data.materials) if m and re.search('wire|background', m.name, re.I)]
    if bad:
        bm = bmesh.new(); bm.from_mesh(g.data); bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in bad], context='FACES'); bm.to_mesh(g.data); bm.free()
    _v = [v.co for v in g.data.vertices]; print('PRE', gid, [round(max(v[i] for v in _v) - min(v[i] for v in _v), 3) for i in range(3)])
    if rot.startswith('auto'):   # square a gun that sits at an angle: the yaw with the tightest footprint, long side on X
        best = None
        for k in range(180):
            t = math.radians(k); c_, s_ = math.cos(t), math.sin(t); xs = [v.x * c_ - v.y * s_ for v in _v]; ys = [v.x * s_ + v.y * c_ for v in _v]
            ex, ey = max(xs) - min(xs), max(ys) - min(ys)
            if ex >= ey and (best is None or ex * ey < best[0]): best = (ex * ey, k)
        rot = '%d,%s' % (best[1], rot.split(',')[1]); print('AUTO', gid, rot)
    rz, rxd = [float(v) for v in rot.split(',')]
    R = mathutils.Matrix.Rotation(math.radians(rxd), 4, 'X') @ mathutils.Matrix.Rotation(math.radians(rz), 4, 'Z')
    if flip == '1': R = mathutils.Matrix.Rotation(math.pi, 4, 'Z') @ R
    g.data.transform(R)
    vs = [v.co for v in g.data.vertices]
    mn = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
    s = float(length) / (mx.x - mn.x); c = (mn + mx) / 2
    g.data.transform(mathutils.Matrix.Diagonal((s, s, s, 1)) @ mathutils.Matrix.Translation(-c))
    # cut it down for a viewmodel: ~20k triangles is plenty at arm's length
    tris = sum(len(p.vertices) - 2 for p in g.data.polygons)
    if tris > 24000:
        d = g.modifiers.new('dec', 'DECIMATE'); d.ratio = 22000 / tris
        bpy.context.view_layer.objects.active = g; bpy.ops.object.modifier_apply(modifier='dec')
    for p in g.data.polygons: p.use_smooth = True
    try: g.data.set_sharp_from_angle(angle=math.radians(35))
    except Exception: pass
    print('GUN', g.name, 'tris', sum(len(p.vertices) - 2 for p in g.data.polygons), 'dims', [round(x, 3) for x in g.dimensions], 'mats', [m.name if m else None for m in g.data.materials])
    made.append((g, int(tex)))
# textures: shrink, re-encode as jpeg
for im in bpy.data.images:
    if im.size[0] == 0: continue
    lim = 2048 if re.search('color|base|normal|albedo|diff', im.name, re.I) and not re.search('^(Metal|Plastic|Wood)0', im.name) else 1024
    if im.size[0] > lim: im.scale(lim, lim * im.size[1] // im.size[0])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_apply=True, export_animations=False, use_selection=False, export_cameras=False, export_lights=False)
print('EXPORT OK')
