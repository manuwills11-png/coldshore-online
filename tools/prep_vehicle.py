# prep a car .blend for convert_vehicle: realize collection instances (wheels named WHL_*), drop junk, save
import bpy, sys, re
a = sys.argv[sys.argv.index('--') + 1:]
src, out, wheelcolls, drop = a[0], a[1], a[2].split(','), a[3]
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene; sc.frame_set(sc.frame_start)
for c in bpy.data.collections: c.hide_viewport = False
for lc in bpy.context.view_layer.layer_collection.children: lc.exclude = False
bpy.context.view_layer.update()
fix = a[4] if len(a) > 4 else ''
if fix:   # name:x,y,z,rx,ry,rz ; ...
    import math
    for f in fix.split(';'):
        n, v = f.split(':'); v = [float(x) for x in v.split(',')]; o = bpy.data.objects[n]; o.location = v[:3]; o.rotation_euler = v[3:6]
    bpy.context.view_layer.update()
insts = [o for o in bpy.data.objects if o.type == 'EMPTY' and o.instance_type == 'COLLECTION' and o.instance_collection]
src_objs = set()
for e in insts:
    cname = e.instance_collection.name.strip(); src_objs |= set(e.instance_collection.all_objects)
    bpy.ops.object.select_all(action='DESELECT'); e.hide_set(False); e.select_set(True); bpy.context.view_layer.objects.active = e
    before = set(bpy.data.objects)
    bpy.ops.object.duplicates_make_real(use_base_parent=False, use_hierarchy=False)
    new = [o for o in bpy.data.objects if o not in before]
    pre = 'WHL_' if cname in wheelcolls else ('DROP_' if cname not in wheelcolls else '')
    if not new and cname in wheelcolls:   # instancer parented to a bone: copy the collection by hand at the evaluated transform
        dg = bpy.context.evaluated_depsgraph_get(); M = e.evaluated_get(dg).matrix_world.copy()
        for so in e.instance_collection.all_objects:
            if so.type != 'MESH': continue
            n = so.copy(); n.data = so.data.copy(); n.parent = None; n.constraints.clear(); [n.modifiers.remove(m) for m in list(n.modifiers) if m.type in ("ARMATURE", "HOOK")]; n.animation_data_clear(); bpy.context.scene.collection.objects.link(n); n.matrix_world = M @ so.matrix_world; new.append(n)
        bpy.context.view_layer.update()   # centre the copied wheel on the hub (the bone head)
        from mathutils import Vector
        pts = [o.matrix_world @ v.co for o in new for v in o.data.vertices]
        if pts:
            c = Vector([(min(p[i] for p in pts) + max(p[i] for p in pts)) / 2 for i in range(3)]); d = M.translation - c
            for o in new: o.matrix_world.translation += d
    for o in new: o.name = pre + e.name + '_' + o.name
    print('realized', e.name, cname, len(new))
for o in list(src_objs) + insts:
    try: bpy.data.objects.remove(o, do_unlink=True)
    except Exception: pass
for o in list(bpy.data.objects):
    if (drop and re.search(drop, o.name)) or o.name.startswith('DROP_'): bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    o.hide_set(False); o.hide_viewport = False
bpy.ops.wm.save_as_mainfile(filepath=out)
print('PREP OK', len(bpy.data.objects))
