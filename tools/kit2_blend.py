# ColdShore build 59: pieces taken from two CC0 BlendSwap packs, cleaned up and exported as one GLB (kit2.json in the game).
#   "Warehouse" by argonius (blendswap.com/blend/19307, CC0): forklift, pallet jack, barrel, pallet racking with stock, boxes, pallet, 40 ft container.
#   ("Street Props lp" by Duion, blendswap.com/blend/9685, CC0, was also downloaded; its pieces rely on textures that do not survive the conversion, so none are used.)
# Old Blender Internal materials lose their textures in Blender 2.8+, so every material becomes a flat colour from its diffuse colour.
# usage: python3 kit2_blend.py <warehouse1.blend> <street_props_lp dir> -- out.glb
import bpy, sys, os
from mathutils import Vector
args = sys.argv[sys.argv.index('--') - 2:sys.argv.index('--')] if '--' in sys.argv else sys.argv[-2:]
WH, SP = args; OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/kit2.glb'
bpy.ops.wm.open_mainfile(filepath=WH)
for f in ('parkbench_wood_01.blend', 'street_barrier_01_a.blend'):
    with bpy.data.libraries.load(os.path.join(SP, f)) as (src, dst): dst.objects = [n for n in src.objects]
    for o in dst.objects:
        if o and o.type == 'MESH': bpy.context.scene.collection.objects.link(o)
O = bpy.data.objects
def pick(names=None, box=None):
    out = []
    for o in O:
        if o.type != 'MESH': continue
        if names and o.name in names: out.append(o)
        elif box:
            p = o.matrix_world.translation; (x0, x1), (y0, y1) = box
            if x0 <= p.x <= x1 and y0 <= p.y <= y1 and o.dimensions.z < 6: out.append(o)
    return out
SETS = {
  'HK_forklift': pick(['Cube', 'Cube.002']), 'HK_palletjack': pick(['Cube.009']), 'HK_barrel': pick(['Circle.001']),
  'HK_rack': pick(box=((-10.7, -3.3), (20.0, 23.2))), 'HK_boxes': pick(['Cube.007', 'Cube.008']),
  'HK_container40': pick(['Circle']) }
for k, v in SETS.items(): print('SET', k, len(v), [o.name for o in v][:8])
# flat colours for every material
for m in bpy.data.materials:
    col = tuple(m.diffuse_color)
    m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); outn = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(bsdf.outputs[0], outn.inputs[0])
    bsdf.inputs['Base Color'].default_value = (col[0], col[1], col[2], 1); bsdf.inputs['Roughness'].default_value = .7
    if 'metal' in m.name.lower() or 'girder' in m.name.lower(): bsdf.inputs['Metallic'].default_value = .5
    m.name = 'HK_' + m.name
keep = []
dg = bpy.context.evaluated_depsgraph_get()
for name, obs in SETS.items():
    if not obs: continue
    copies = []
    for o in obs:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world)
        c = bpy.data.objects.new(name + '_p', me); bpy.context.scene.collection.objects.link(c); copies.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for c in copies: c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1: bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = name
    vs = [v.co for v in j.data.vertices]; mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ctr = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)); j.data.transform(__import__('mathutils').Matrix.Translation(-ctr))
    j.location = (0, 0, 0); keep.append(j); print('ASSET', name, 'faces', len(j.data.polygons), 'size', tuple(round(v, 2) for v in (mx - mn)))
for o in list(O):
    if o not in keep: bpy.data.objects.remove(o)
# an empty root per asset so the game finds it by name
for j in keep:
    root = bpy.data.objects.new(j.name, None); bpy.context.scene.collection.objects.link(root); nm = j.name; j.name = nm + '__mesh'; root.name = nm; j.parent = root
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_attributes=False, export_vertex_color='NONE', export_texcoords=False, export_materials='EXPORT')
