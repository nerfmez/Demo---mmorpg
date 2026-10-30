"""Shared steps for monsters made with Meshy (shape from image-to-3D, texture from a Meshy 6
retexture): load a textured shape and split it into its loose pieces, group pieces into the parts
the game moves, stand each monster on its own foot in metres, and write the GLB.
Used by grotto-monsters.py and forest-monsters.py (Blender 4.2, run headless)."""
import bpy, bmesh
from mathutils import Matrix, Vector

TEXTURE = 1024  # px: plenty for a monster a couple of metres long, and light on the iPad


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return {}  # monster -> {part: object}


def load(path):
    """The textured shape, its seams merged, split into its loose pieces: [{ob, n, min, max, c, size}]."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    src = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in before][0]
    for o in bpy.context.scene.objects:
        o.select_set(o is src)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Meshy's retexture hands the shape back cut along every texture chart: weld the charts back
    # together (the texture keeps its seams, they live in the UVs), then bring it to a 1 unit box,
    # the size the untextured shape came at, which the sorting is measured in
    bm = bmesh.new()
    bm.from_mesh(src.data)
    ext = max((max(v.co[k] for v in bm.verts) - min(v.co[k] for v in bm.verts)) for k in range(3))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=ext * 2e-4)
    bmesh.ops.scale(bm, vec=(1 / ext, 1 / ext, 1 / ext), verts=bm.verts)
    bm.to_mesh(src.data)
    bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in list(bpy.context.scene.objects):
        if o not in before and o.type != 'MESH':
            bpy.data.objects.remove(o)  # the importer's empties
    out = []
    for o in bpy.context.scene.objects:
        if o in before or o.type != 'MESH' or not o.data.vertices:
            continue
        vs = [v.co for v in o.data.vertices]
        mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        out.append({'ob': o, 'n': len(vs), 'min': mn, 'max': mx, 'c': (mn + mx) / 2, 'size': mx - mn})
    return sorted(out, key=lambda p: -p['n'])


def put(monsters, monster, part, pieces):
    obs = [p['ob'] for p in pieces]
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = f'mon_{monster}_{part}'
    for poly in ob.data.polygons:
        poly.use_smooth = True
    monsters.setdefault(monster, {})[part] = ob


def stand(obs, axis, metres, turn):
    """Put the monster's parts on its own foot (the middle of its box, at its lowest point), `metres`
    long along `axis` before turning, turned by `turn` about Z. Returns its height."""
    vs = [v.co for ob in obs for v in ob.data.vertices]
    k = 'xyz'.index(axis)
    foot = Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, min(v.z for v in vs)))
    m = Matrix.Rotation(turn, 4, 'Z') @ Matrix.Scale(metres / (max(v[k] for v in vs) - min(v[k] for v in vs)), 4) @ Matrix.Translation(-foot)
    for ob in obs:
        ob.data.transform(m)
        ob.location = (0, 0, 0)
    return max(v.co.z for ob in obs for v in ob.data.vertices)


def write(monsters, out):
    """Bring the textures down, keep only the parts and write `out` (Y up, +Z forward in the game)."""
    for img in bpy.data.images:
        if img.size[0] > TEXTURE:
            img.scale(TEXTURE, TEXTURE)
    keep = {ob.name for kinds in monsters.values() for ob in kinds.values()}
    for o in list(bpy.context.scene.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True, export_normals=True,
                              export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=88)
    print('wrote', out, {o.name: len(o.data.polygons) for o in bpy.context.scene.objects})
