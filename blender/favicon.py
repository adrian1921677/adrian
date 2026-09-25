"""
Momo's face as the browser tab icon (transparent PNG).

    blender -b blender/momo_room_source.blend -P blender/favicon.py -- public/momo-icon.png
"""
import math
import sys

import bpy
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
sc = bpy.context.scene

for ob in bpy.data.objects:
    if ob.type == "MESH" and not ob.name.startswith("Char_"):
        ob.hide_render = True

rig = bpy.data.collections.new("IconRig")
sc.collection.children.link(rig)


def light(name, kind, loc, energy, **kw):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    for k, v in kw.items():
        setattr(ld, k, v)
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    rig.objects.link(ob)
    return ob


root = bpy.data.objects["Char_Root"]
front = (root.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()  # Momo faces local -Y
centre = root.matrix_world.translation + Vector((0, 0, 0.66))

key = light("Key", "AREA", centre + front * 2.5 + Vector((0.8, 0, 1.8)), 180, size=2.0)
key.rotation_euler = (centre - key.location).to_track_quat("-Z", "Y").to_euler()
light("Fill", "POINT", centre + front * 2.0 + Vector((-1.2, 0, 0.3)), 60, shadow_soft_size=1.5)

cd = bpy.data.cameras.new("IconCam")
cd.type = "ORTHO"
cd.ortho_scale = 1.3
cam = bpy.data.objects.new("IconCam", cd)
rig.objects.link(cam)
cam.location = centre + front * 5 + Vector((0, 0, 0.35))
cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.camera = cam

w = bpy.data.worlds.new("IconWorld")
sc.world = w
w.use_nodes = True
next(n for n in w.node_tree.nodes if n.type == "BACKGROUND").inputs[1].default_value = 0.6

sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = 512
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.render.filepath = out
sc.eevee.taa_render_samples = 64
bpy.ops.render.render(write_still=True)
print("icon ->", out)
