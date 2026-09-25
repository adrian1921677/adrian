"""
Making-of stills for the website's project card (public/making-of/).

    blender -b blender/momo_room_source.blend -P blender/making_of.py -- <mode> <out.jpg>

modes: final | clay | wire | parts
"""
import math
import sys

import bpy
from mathutils import Vector

mode, out = sys.argv[sys.argv.index("--") + 1:][:2]
sc = bpy.context.scene
rig = bpy.data.collections.new("MakingOfRig")
sc.collection.children.link(rig)


def light(name, kind, loc, energy, color, **kw):
    ld = bpy.data.lights.new(name, kind)
    ld.energy, ld.color = energy, color
    for k, v in kw.items():
        setattr(ld, k, v)
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    rig.objects.link(ob)
    return ob


def camera(target, direction, dist, lens=42):
    cd = bpy.data.cameras.new("MakingOfCam")
    cd.lens = lens
    cam = bpy.data.objects.new("MakingOfCam", cd)
    rig.objects.link(cam)
    d = Vector(direction).normalized()
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam


def world(rgb, strength=1.0):
    w = bpy.data.worlds.new("MakingOfWorld")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (*rgb, 1)
    bg.inputs[1].default_value = strength


def flat_material(name, color, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.8
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


def room_lights():
    sun = light("Sun", "SUN", (6, -5, 9), 2.2, (1.0, 0.9, 0.8), angle=math.radians(8))
    sun.rotation_euler = (-Vector((6, -5, 9))).to_track_quat("-Z", "Y").to_euler()
    light("Lamp", "POINT", (0.56, 2.5, 1.2), 60, (1.0, 0.72, 0.42), shadow_soft_size=0.1)
    win = light("Win", "AREA", (-2.6, 1.4, 2.0), 120, (0.62, 0.77, 1.0), size=1.2)
    win.rotation_euler = (0, math.radians(90), 0)
    light("Fill", "POINT", (3.5, -3.5, 3.5), 250, (1.0, 0.85, 0.95), shadow_soft_size=2.0)


HOME = ((-0.1, 0.1, 0.95), (1, -1, 0.78), 14.0)

if mode == "final":
    room_lights()
    world((0.035, 0.022, 0.06))
    camera((0.4, -0.4, 0.62), (1, -1, 0.35), 3.4)
elif mode == "clay":
    room_lights()
    world((0.035, 0.022, 0.06))
    bpy.context.view_layer.material_override = flat_material("Clay", (0.82, 0.8, 0.86))
    camera(*HOME)
elif mode == "wire":
    world((0.02, 0.012, 0.035))
    bpy.context.view_layer.material_override = flat_material("Wire", (0.73, 0.64, 1.0), emit=2.5)
    for ob in [o for o in bpy.data.objects if o.type == "MESH"]:
        mod = ob.modifiers.new("MakingOfWire", "WIREFRAME")
        mod.thickness = 0.006
        mod.use_even_offset = False
    camera(*HOME)
elif mode == "parts":
    # Momo, exploded: every part slides away from the body centre.
    room_lights()
    world((0.035, 0.022, 0.06))
    body = bpy.data.objects["Char_Body"]
    root = bpy.data.objects["Char_Root"]
    for ob in bpy.data.objects:
        if ob.type == "MESH" and not ob.name.startswith("Char_"):
            ob.hide_render = True
    bpy.context.view_layer.update()
    centre = body.matrix_world @ Vector((0, 0, 0.44))
    for ob in [o for o in bpy.data.objects if o.name.startswith("Char_") and o.parent in (body, root)]:
        if ob is body or ob.type != "MESH":
            continue
        pos = ob.matrix_world.translation.copy()
        away = pos - centre
        if away.length < 1e-4:
            away = Vector((0, -1, 0))
        ob.matrix_world.translation = pos + away.normalized() * 0.32
    camera(tuple(centre + Vector((0, 0, 0.18))), (1, -1, 0.3), 4.3)
else:
    raise SystemExit(f"unknown mode {mode}")

sc.render.resolution_x, sc.render.resolution_y = 1200, 750
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 82
sc.render.filepath = out
sc.eevee.taa_render_samples = 48
bpy.ops.render.render(write_still=True)
print("making-of ->", out)
