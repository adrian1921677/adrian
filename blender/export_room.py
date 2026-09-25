"""
Export the Momo room for the website.

    blender -b blender/momo_room_source.blend -P blender/export_room.py
    blender -b blender/momo_room_source.blend -P blender/export_room.py -- --out path/to/room.glb

or open momo_room_source.blend and run this from the Text Editor (the file is
reverted afterwards, so the source stays unmerged and editable).

What it does:
  1. Makes sure Desk_Screen has 0..1 UVs (the site draws a canvas onto it).
  2. Merges every Hotspot_* cluster into one multi-material mesh per hotspot and
     all remaining static room meshes into Room_Static (fewer draw calls).
     Char_* parts, Desk_Screen and all empties stay separate — the website
     finds them by name (see src/data/nodes.ts).
  3. Exports the MomoRoom collection to public/models/room.glb.
  4. Verifies every node name the website needs is present.
"""
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

COLLECTION = "MomoRoom"
REQUIRED = [
    "Char_Root", "Char_Body", "Char_BubbleAnchor", "Char_EyeL", "Char_EyeR", "Char_Mouth",
    "Char_ArmL", "Char_ArmR", "Char_FootL", "Char_FootR", "Char_Antenna", "Char_AntennaTip",
    "Char_EarL", "Char_EarR", "Desk_Screen", "Light_Lamp", "Light_Window",
    "Hotspot_About", "Hotspot_Work", "Hotspot_Skills", "Hotspot_Education", "Hotspot_Journey", "Hotspot_Contact",
    "Spot_Home", "Spot_About", "Spot_Work", "Spot_Skills", "Spot_Education", "Spot_Journey", "Spot_Contact",
]


def out_path():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--out" in argv:
        return os.path.abspath(argv[argv.index("--out") + 1])
    here = os.path.dirname(bpy.data.filepath)
    return os.path.abspath(os.path.join(here, "..", "public", "models", "room.glb"))


def ensure_screen_uvs():
    me = bpy.data.objects["Desk_Screen"].data
    if me.uv_layers:
        return
    uv = me.uv_layers.new(name="UVMap")
    xs = [v.co.x for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x - x0) / (x1 - x0), (co.z - z0) / (z1 - z0))


def ancestors(ob):
    p = ob.parent
    while p:
        yield p
        p = p.parent


def merge(objs, name, parent_ob, coll):
    dg = bpy.context.evaluated_depsgraph_get()
    inv = parent_ob.matrix_world.inverted() if parent_ob else Matrix.Identity(4)
    mats, bm, expected = [], bmesh.new(), 0
    for ob in objs:
        ev = ob.evaluated_get(dg)
        tmp = bmesh.new()
        tmp.from_mesh(ev.to_mesh())
        ev.to_mesh_clear()
        tmp.transform(inv @ ob.matrix_world)
        slot_map = {}
        for i, slot in enumerate(ob.material_slots):
            if slot.material not in mats:
                mats.append(slot.material)
            slot_map[i] = mats.index(slot.material)
        for f in tmp.faces:
            f.material_index = slot_map.get(f.material_index, 0)
        expected += len(tmp.verts)
        tm = bpy.data.meshes.new("tmp_merge")
        tmp.to_mesh(tm)
        tmp.free()
        bm.from_mesh(tm)
        bpy.data.meshes.remove(tm)
    assert len(bm.verts) == expected, (name, len(bm.verts), expected)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if parent_ob:
        ob.parent = parent_ob
        ob.matrix_parent_inverse = Matrix.Identity(4)
    return ob


def merge_room():
    coll = bpy.data.collections[COLLECTION]
    for hs in [o for o in coll.all_objects if o.name.startswith("Hotspot_")]:
        meshes = [o for o in coll.all_objects
                  if o.type == "MESH" and hs in ancestors(o) and o.name != "Desk_Screen"]
        if meshes:
            merge(meshes, hs.name.replace("Hotspot_", "HS_") + "_Mesh", hs, coll)
            for o in meshes:
                bpy.data.objects.remove(o, do_unlink=True)
    static = [o for o in coll.all_objects
              if o.type == "MESH" and not o.name.startswith("Char_") and o.name != "Desk_Screen"
              and not any(a.name.startswith(("Hotspot_", "Char_")) for a in ancestors(o))]
    if static:
        merge(static, "Room_Static", None, coll)
        for o in static:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in [o for o in coll.all_objects if o.type == "EMPTY" and not o.children
              and not o.name.startswith(("Hotspot_", "Spot_", "Light_", "Char_"))]:
        bpy.data.objects.remove(o, do_unlink=True)


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    vl = bpy.context.view_layer
    vl.active_layer_collection = vl.layer_collection.children[COLLECTION]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_active_collection=True,
        use_active_collection_with_nested=True, export_apply=True, export_yup=True,
        export_lights=False, export_cameras=False, export_extras=False,
        export_materials="EXPORT", export_animations=False, export_texcoords=True, export_normals=True,
    )


def main():
    missing = [n for n in REQUIRED if n not in bpy.data.objects]
    if missing:
        raise SystemExit(f"Missing objects the website needs: {missing}")
    path = out_path()
    ensure_screen_uvs()
    merge_room()
    export(path)
    meshes = sum(1 for o in bpy.data.collections[COLLECTION].all_objects if o.type == "MESH")
    print(f"[export_room] wrote {path} ({os.path.getsize(path)} bytes, {meshes} mesh objects)")
    if not bpy.app.background:
        bpy.ops.wm.revert_mainfile()


main()
