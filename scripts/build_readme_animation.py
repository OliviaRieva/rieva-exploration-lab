#!/usr/bin/env python3
"""Build the original, non-generative RIEVA README hero animation.

Run with Blender's bundled Python, not CPython:

    /Applications/Blender.app/Contents/MacOS/Blender -b \
      -P scripts/build_readme_animation.py -- \
      --frames-dir /tmp/rieva-readme-frames \
      --webp docs/media/rieva-readme-hero.webp \
      --blend /tmp/rieva-readme-hero.blend

The scene, wordmark, orbit, and small spacecraft are constructed entirely from
procedural Blender geometry in this file. No generative imagery, downloaded
models, textures, logos, or third-party artwork are used.
"""

from __future__ import annotations

import argparse
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector


TAU = math.pi * 2.0


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--webp")
    parser.add_argument("--blend")
    parser.add_argument("--preview")
    parser.add_argument("--width", type=int, default=1200)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--frames", type=int, default=72)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--quality", type=int, default=82)
    parser.add_argument("--max-mib", type=float, default=8.0)
    parser.add_argument(
        "--preview-only",
        action="store_true",
        help="Render frame 1 to --preview without rendering or encoding the sequence.",
    )
    return parser.parse_args(arguments)


def srgb_channel(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color(hex_color: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    value = hex_color.lstrip("#")
    channels = [int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)]
    return tuple(srgb_channel(channel) for channel in channels) + (alpha,)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def principled_material(
    name: str,
    hex_color: str,
    *,
    metallic: float = 0.0,
    roughness: float = 0.4,
    alpha: float = 1.0,
    emission: str | None = None,
    emission_strength: float = 0.0,
    coat: float = 0.0,
    coat_roughness: float = 0.12,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color(hex_color, alpha)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color(hex_color, alpha)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Alpha"].default_value = alpha
        if "Coat Weight" in shader.inputs:
            shader.inputs["Coat Weight"].default_value = coat
        if "Coat Roughness" in shader.inputs:
            shader.inputs["Coat Roughness"].default_value = coat_roughness
        if emission and "Emission Color" in shader.inputs:
            shader.inputs["Emission Color"].default_value = color(emission)
            shader.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        material.surface_render_method = "DITHERED"
        material.use_transparency_overlap = False
    return material


def mesh_object(
    name: str,
    vertices: Sequence[Sequence[float]],
    faces: Sequence[Sequence[int]],
    material: bpy.types.Material,
    *,
    parent: bpy.types.Object | None = None,
    smooth: bool = False,
    bevel: float = 0.0,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    object_ = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(object_)
    mesh.materials.append(material)
    if parent:
        object_.parent = parent
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    if bevel > 0:
        modifier = object_.modifiers.new("Soft manufactured edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    return object_


def extruded_polygon(
    name: str,
    points: Sequence[tuple[float, float]],
    thickness: float,
    material: bpy.types.Material,
    *,
    parent: bpy.types.Object | None = None,
    z: float = 0.0,
    bevel: float = 0.0,
) -> bpy.types.Object:
    half = thickness / 2.0
    vertices = [(x, y, z + half) for x, y in points]
    vertices.extend((x, y, z - half) for x, y in points)
    count = len(points)
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    return mesh_object(name, vertices, faces, material, parent=parent, bevel=bevel)


def loft_along_x(
    name: str,
    stations: Sequence[tuple[float, float, float, float]],
    material: bpy.types.Material,
    *,
    parent: bpy.types.Object | None = None,
    segments: int = 24,
) -> bpy.types.Object:
    """Create a closed, original aerodynamic loft along local +X."""

    vertices: list[tuple[float, float, float]] = []
    for x, half_width, half_height, center_z in stations:
        for index in range(segments):
            angle = TAU * index / segments
            cosine = math.cos(angle)
            sine = math.sin(angle)
            y = math.copysign(abs(cosine) ** 0.78, cosine) * half_width
            z = center_z + math.copysign(abs(sine) ** 0.9, sine) * half_height
            vertices.append((x, y, z))

    faces: list[tuple[int, ...]] = []
    for station_index in range(len(stations) - 1):
        start = station_index * segments
        following_start = (station_index + 1) * segments
        for index in range(segments):
            following = (index + 1) % segments
            faces.append(
                (
                    start + index,
                    start + following,
                    following_start + following,
                    following_start + index,
                )
            )

    front_center = len(vertices)
    vertices.append((stations[0][0], 0.0, stations[0][3]))
    rear_center = len(vertices)
    vertices.append((stations[-1][0], 0.0, stations[-1][3]))
    rear_start = (len(stations) - 1) * segments
    for index in range(segments):
        following = (index + 1) % segments
        faces.append((front_center, index, following))
        faces.append((rear_center, rear_start + following, rear_start + index))

    return mesh_object(name, vertices, faces, material, parent=parent, smooth=True)


def curve_path(
    name: str,
    points: Iterable[Sequence[float]],
    material: bpy.types.Material,
    *,
    bevel_depth: float,
    cyclic: bool = False,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_CURVE", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    curve.resolution_u = 2
    spline = curve.splines.new("POLY")
    coordinates = list(points)
    spline.points.add(len(coordinates) - 1)
    for point, coordinate in zip(spline.points, coordinates):
        point.co = (*coordinate, 1.0)
    spline.use_cyclic_u = cyclic
    object_ = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(object_)
    curve.materials.append(material)
    if parent:
        object_.parent = parent
    return object_


def disc(
    name: str,
    radius: float,
    thickness: float,
    material: bpy.types.Material,
    *,
    location: Sequence[float],
    segments: int = 40,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for z in (-thickness / 2, thickness / 2):
        vertices.extend(
            (
                radius * math.cos(TAU * index / segments),
                radius * math.sin(TAU * index / segments),
                z,
            )
            for index in range(segments)
        )
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(segments))),
        tuple(range(segments, segments * 2)),
    ]
    for index in range(segments):
        following = (index + 1) % segments
        faces.append((index, following, segments + following, segments + index))
    object_ = mesh_object(name, vertices, faces, material, parent=parent, bevel=0.012)
    object_.location = location
    return object_


def look_at(object_: bpy.types.Object, target: Sequence[float]) -> None:
    direction = Vector(target) - object_.location
    object_.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(
    name: str,
    location: Sequence[float],
    energy: float,
    size: float,
    hex_color: str,
) -> bpy.types.Object:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color(hex_color)[:3]
    look_at(light, (0.0, 0.0, 0.0))
    return light


def create_materials() -> dict[str, bpy.types.Material]:
    return {
        "backdrop": principled_material("Pearl backdrop", "#F4F6FC", roughness=0.74, coat=0.08),
        "word": principled_material(
            "RIEVA chrome white",
            "#F9FBFF",
            metallic=0.58,
            roughness=0.19,
            coat=0.62,
            coat_roughness=0.08,
        ),
        "caption": principled_material("Caption graphite", "#77778C", metallic=0.08, roughness=0.35),
        "orbit": principled_material(
            "Orbital pearl",
            "#E7EAF6",
            metallic=0.48,
            roughness=0.2,
            emission="#CFD8FF",
            emission_strength=0.12,
        ),
        "purple": principled_material(
            "Violet orbital light",
            "#9A7BFF",
            metallic=0.12,
            roughness=0.22,
            emission="#9A7BFF",
            emission_strength=3.2,
        ),
        "blue": principled_material(
            "Cyan orbital light",
            "#70DDF1",
            metallic=0.08,
            roughness=0.24,
            emission="#70DDF1",
            emission_strength=3.0,
        ),
        "pink": principled_material(
            "Rose orbital light",
            "#FF9AD5",
            metallic=0.08,
            roughness=0.24,
            emission="#FF9AD5",
            emission_strength=2.7,
        ),
        "gold": principled_material(
            "Warm orbital light",
            "#F8D875",
            metallic=0.16,
            roughness=0.23,
            emission="#F8D875",
            emission_strength=2.2,
        ),
        "shell": principled_material(
            "Spacecraft pearl shell",
            "#F8FAFF",
            metallic=0.32,
            roughness=0.2,
            coat=0.72,
            coat_roughness=0.07,
        ),
        "chrome": principled_material(
            "Spacecraft chrome trim",
            "#C7CAD8",
            metallic=0.84,
            roughness=0.14,
            coat=0.28,
        ),
        "canopy": principled_material(
            "Spacecraft violet canopy",
            "#302056",
            metallic=0.44,
            roughness=0.1,
            emission="#6B4BA4",
            emission_strength=0.28,
            coat=0.8,
            coat_roughness=0.04,
        ),
        "plume": principled_material(
            "Electric propulsion plume",
            "#B8F7FF",
            roughness=0.18,
            alpha=0.62,
            emission="#75E7FF",
            emission_strength=5.6,
        ),
        "plume_core": principled_material(
            "Electric propulsion core",
            "#FFF6D3",
            roughness=0.14,
            alpha=0.84,
            emission="#FFF0A7",
            emission_strength=7.5,
        ),
    }


def create_backdrop(materials: dict[str, bpy.types.Material]) -> None:
    extruded_polygon(
        "Pearl background",
        [(-9.0, -4.0), (9.0, -4.0), (9.0, 4.0), (-9.0, 4.0)],
        0.04,
        materials["backdrop"],
        z=-2.2,
    )

    add_area_light("Soft white key", (0.0, -0.4, 8.0), 610, 7.5, "#FFFFFF")
    add_area_light("Violet atmosphere", (-5.0, 2.8, 5.0), 430, 4.2, "#AF92FF")
    add_area_light("Cyan atmosphere", (5.3, 1.6, 4.6), 390, 4.0, "#83E5FF")
    add_area_light("Rose atmosphere", (1.2, 4.0, 3.8), 230, 3.4, "#FFB0DD")
    add_area_light("Warm lower fill", (-2.2, -4.2, 3.5), 170, 3.2, "#FFE39A")


def create_wordmark(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = bpy.data.objects.new("RIEVA wordmark", None)
    bpy.context.scene.collection.objects.link(root)

    font_curve = bpy.data.curves.new("RIEV lettering", "FONT")
    font_curve.body = "RIEV"
    font_curve.align_x = "LEFT"
    font_curve.align_y = "CENTER"
    font_curve.size = 1.62
    font_curve.space_character = 1.07
    font_curve.extrude = 0.13
    font_curve.bevel_depth = 0.026
    font_curve.bevel_resolution = 4
    lettering = bpy.data.objects.new("RIEV", font_curve)
    bpy.context.scene.collection.objects.link(lettering)
    lettering.parent = root
    font_curve.materials.append(materials["word"])
    bpy.context.view_layer.update()

    gap = 0.22
    a_width = 1.24
    total_width = lettering.dimensions.x + gap + a_width
    left = -total_width / 2.0
    lettering.location = (left, 0.10, 0.0)
    a_center = left + lettering.dimensions.x + gap + a_width / 2.0

    a_stroke = [
        (a_center - 0.53, -0.70, 0.06),
        (a_center, 0.91, 0.06),
        (a_center + 0.53, -0.70, 0.06),
    ]
    curve_path(
        "A without crossbar",
        a_stroke,
        materials["word"],
        bevel_depth=0.095,
        parent=root,
    )
    disc(
        "A orbital dot",
        0.115,
        0.075,
        materials["purple"],
        location=(a_center, -0.08, 0.14),
        parent=root,
    )

    caption_curve = bpy.data.curves.new("Exploration systems caption", "FONT")
    caption_curve.body = "EXPLORATION  SYSTEMS  LABORATORY"
    caption_curve.align_x = "CENTER"
    caption_curve.align_y = "CENTER"
    caption_curve.size = 0.205
    caption_curve.space_character = 1.18
    caption_curve.extrude = 0.012
    caption_curve.bevel_depth = 0.002
    caption = bpy.data.objects.new("EXPLORATION SYSTEMS LABORATORY", caption_curve)
    bpy.context.scene.collection.objects.link(caption)
    caption.parent = root
    caption.location = (0.0, -1.04, -0.01)
    caption_curve.materials.append(materials["caption"])
    return root


def orbit_point(angle: float) -> tuple[float, float, float]:
    return (5.08 * math.cos(angle), 1.64 * math.sin(angle), -0.58 * math.sin(angle) - 0.03)


def orbit_arc(start: float, end: float, count: int = 48) -> list[tuple[float, float, float]]:
    return [orbit_point(start + (end - start) * index / (count - 1)) for index in range(count)]


def create_orbit(materials: dict[str, bpy.types.Material]) -> None:
    curve_path(
        "RIEVA orbital path",
        [orbit_point(TAU * index / 192) for index in range(192)],
        materials["orbit"],
        bevel_depth=0.018,
        cyclic=True,
    )
    for name, start, end, material in [
        ("Cyan orbital accent", -0.04, 0.42, materials["blue"]),
        ("Violet orbital accent", 0.46, 0.79, materials["purple"]),
        ("Rose orbital accent", math.pi + 0.06, math.pi + 0.43, materials["pink"]),
        ("Warm orbital accent", math.pi + 0.47, math.pi + 0.68, materials["gold"]),
    ]:
        curve_path(name, orbit_arc(start, end), material, bevel_depth=0.031)

    for index, (angle, material_name) in enumerate(
        [
            (0.88, "purple"),
            (2.30, "blue"),
            (3.91, "pink"),
            (5.42, "gold"),
        ]
    ):
        x, y, z = orbit_point(angle)
        disc(
            f"Orbital marker {index + 1}",
            0.042,
            0.035,
            materials[material_name],
            location=(x, y, z + 0.025),
            segments=24,
        )


def create_spacecraft(materials: dict[str, bpy.types.Material]) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    root = bpy.data.objects.new("Original RIEVA orbital craft", None)
    bpy.context.scene.collection.objects.link(root)

    loft_along_x(
        "Pearl lifting-body fuselage",
        [
            (1.02, 0.012, 0.014, 0.00),
            (0.76, 0.12, 0.075, 0.00),
            (0.34, 0.19, 0.115, 0.00),
            (-0.22, 0.21, 0.13, 0.00),
            (-0.70, 0.15, 0.095, -0.005),
            (-0.91, 0.075, 0.055, -0.006),
        ],
        materials["shell"],
        parent=root,
        segments=28,
    )

    wing_points = [
        (0.42, 0.05),
        (-0.24, 0.72),
        (-0.68, 0.58),
        (-0.47, 0.12),
        (-0.72, 0.09),
        (-0.79, -0.09),
        (-0.47, -0.12),
        (-0.68, -0.58),
        (-0.24, -0.72),
        (0.42, -0.05),
    ]
    extruded_polygon(
        "Cranked pearl flight surface",
        wing_points,
        0.072,
        materials["shell"],
        parent=root,
        z=-0.015,
        bevel=0.018,
    )

    for side in (-1, 1):
        tail_points = [
            (-0.38, side * 0.12),
            (-0.71, side * 0.39),
            (-0.86, side * 0.33),
            (-0.72, side * 0.10),
        ]
        extruded_polygon(
            f"Canted tailplane {'left' if side > 0 else 'right'}",
            tail_points,
            0.065,
            materials["chrome"],
            parent=root,
            z=0.035,
            bevel=0.014,
        )

    loft_along_x(
        "Violet panoramic canopy",
        [
            (0.52, 0.018, 0.012, 0.095),
            (0.36, 0.105, 0.055, 0.12),
            (0.02, 0.14, 0.082, 0.13),
            (-0.22, 0.085, 0.045, 0.115),
        ],
        materials["canopy"],
        parent=root,
        segments=24,
    )

    curve_path(
        "Chrome leading-edge signature",
        [(0.38, 0.04, 0.045), (-0.25, 0.68, 0.045), (-0.64, 0.56, 0.045)],
        materials["chrome"],
        bevel_depth=0.013,
        parent=root,
    )
    curve_path(
        "Chrome leading-edge signature mirrored",
        [(0.38, -0.04, 0.045), (-0.25, -0.68, 0.045), (-0.64, -0.56, 0.045)],
        materials["chrome"],
        bevel_depth=0.013,
        parent=root,
    )

    plume_objects: list[bpy.types.Object] = []
    for side in (-1, 1):
        plume = extruded_polygon(
            f"Electric plume {'left' if side > 0 else 'right'}",
            [(-0.79, side * 0.105), (-1.48, side * 0.17), (-1.67, side * 0.09), (-0.82, side * 0.04)],
            0.026,
            materials["plume"],
            parent=root,
            z=-0.005,
            bevel=0.012,
        )
        plume_objects.append(plume)
        core = extruded_polygon(
            f"Electric plume core {'left' if side > 0 else 'right'}",
            [(-0.82, side * 0.082), (-1.28, side * 0.105), (-1.42, side * 0.075), (-0.83, side * 0.055)],
            0.031,
            materials["plume_core"],
            parent=root,
            z=0.012,
            bevel=0.009,
        )
        plume_objects.append(core)

    disc(
        "Port navigation light",
        0.034,
        0.025,
        materials["pink"],
        location=(-0.28, 0.70, 0.07),
        parent=root,
        segments=20,
    )
    disc(
        "Starboard navigation light",
        0.034,
        0.025,
        materials["blue"],
        location=(-0.28, -0.70, 0.07),
        parent=root,
        segments=20,
    )
    root.scale = (0.72, 0.72, 0.72)
    return root, plume_objects


def animate_spacecraft(
    craft: bpy.types.Object,
    plume_objects: Sequence[bpy.types.Object],
    frame_count: int,
) -> None:
    craft.rotation_mode = "XYZ"
    for frame in range(1, frame_count + 1):
        angle = TAU * (frame - 1) / frame_count + 0.34
        x, y, z = orbit_point(angle)
        craft.location = (x, y, z + 0.16)
        dx = -5.08 * math.sin(angle)
        dy = 1.64 * math.cos(angle)
        heading = math.atan2(dy, dx)
        craft.rotation_euler = (
            0.13 * math.cos(angle),
            -0.08 * math.sin(angle),
            heading,
        )
        craft.keyframe_insert(data_path="location", frame=frame)
        craft.keyframe_insert(data_path="rotation_euler", frame=frame)

        pulse = 0.94 + 0.08 * math.sin(TAU * (frame - 1) / 8.0)
        for plume in plume_objects:
            plume.scale = (pulse, 1.0, 1.0)
            plume.keyframe_insert(data_path="scale", frame=frame)

    # Every rendered frame has an explicit key, so Blender does not interpolate
    # across a visible output frame. This also avoids depending on Blender 5's
    # action-slot internals, which are not needed for this deterministic loop.


def setup_camera_and_render(args: argparse.Namespace) -> bpy.types.Scene:
    bpy.ops.object.camera_add(location=(0.0, 0.0, 16.0))
    camera = bpy.context.object
    camera.name = "README hero orthographic camera"
    camera.data.type = "ORTHO"
    # Blender's orthographic scale is the frame width for this wide aspect.
    # 13 world units leaves a restrained margin around the 10.2-unit orbit.
    camera.data.ortho_scale = 13.0
    camera.data.lens = 70
    look_at(camera, (0.0, 0.0, 0.0))

    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.render.fps = args.fps
    scene.frame_start = 1
    scene.frame_end = args.frames
    scene.render.image_settings.color_depth = "8"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = args.samples

    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = color("#F1F3FA")
        background.inputs["Strength"].default_value = 0.62
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.18
    scene.view_settings.gamma = 1.0
    return scene


def setup_subtle_glow(scene: bpy.types.Scene) -> None:
    """Add a restrained compositor glow; safely skip if an API changes."""

    try:
        scene.use_nodes = True
        nodes = scene.node_tree.nodes
        links = scene.node_tree.links
        nodes.clear()
        render_layers = nodes.new("CompositorNodeRLayers")
        glare = nodes.new("CompositorNodeGlare")
        glare.glare_type = "FOG_GLOW"
        glare.quality = "HIGH"
        glare.threshold = 1.15
        glare.size = 6
        glare.mix = -0.72
        composite = nodes.new("CompositorNodeComposite")
        links.new(render_layers.outputs["Image"], glare.inputs["Image"])
        links.new(glare.outputs["Image"], composite.inputs["Image"])
    except (AttributeError, RuntimeError, TypeError):
        print("RIEVA_NOTE=Compositor glow unavailable; rendering clean base image")


def encode_webp(
    frames_dir: Path,
    output_path: Path,
    *,
    fps: int,
    frame_count: int,
    requested_quality: int,
    max_bytes: int,
) -> None:
    ffmpeg = shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg"
    if not Path(ffmpeg).exists():
        raise FileNotFoundError("FFmpeg is required for animated WebP output")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    qualities = [requested_quality, 76, 70, 64, 58]
    qualities = list(dict.fromkeys(max(1, min(100, value)) for value in qualities))
    for quality in qualities:
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-framerate",
            str(fps),
            "-start_number",
            "1",
            "-i",
            str(frames_dir / "frame_%04d.png"),
            "-frames:v",
            str(frame_count),
            "-vf",
            "format=bgra",
            "-c:v",
            "libwebp_anim",
            "-lossless",
            "0",
            "-preset",
            "picture",
            "-quality",
            str(quality),
            "-loop",
            "0",
            "-an",
            str(output_path),
        ]
        subprocess.run(command, check=True)
        size = output_path.stat().st_size
        print(f"RIEVA_WEBP_ATTEMPT=quality:{quality},bytes:{size}")
        if size <= max_bytes:
            return
    raise RuntimeError(
        f"Animated WebP remains above {max_bytes} bytes at the lowest configured quality"
    )


def main() -> None:
    args = parse_args()
    if args.width < 320 or args.height < 160:
        raise ValueError("README hero dimensions are unexpectedly small")
    if args.frames < 2 and not args.preview_only:
        raise ValueError("A loop needs at least two frames")
    if args.fps < 1:
        raise ValueError("FPS must be positive")

    clear_scene()
    materials = create_materials()
    create_backdrop(materials)
    create_wordmark(materials)
    create_orbit(materials)
    craft, plume_objects = create_spacecraft(materials)
    animate_spacecraft(craft, plume_objects, max(2, args.frames))
    scene = setup_camera_and_render(args)
    setup_subtle_glow(scene)

    frames_dir = Path(args.frames_dir).expanduser().resolve()
    frames_dir.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(frames_dir / "frame_")

    if args.blend:
        blend_path = Path(args.blend).expanduser().resolve()
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        print(f"RIEVA_BLEND={blend_path}")

    if args.preview_only:
        if not args.preview:
            raise ValueError("--preview-only requires --preview")
        preview_path = Path(args.preview).expanduser().resolve()
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        scene.frame_set(1)
        scene.render.filepath = str(preview_path)
        bpy.ops.render.render(write_still=True)
        print(f"RIEVA_PREVIEW={preview_path}")
        return

    bpy.ops.render.render(animation=True)

    if args.preview:
        preview_path = Path(args.preview).expanduser().resolve()
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        source = frames_dir / "frame_0001.png"
        shutil.copyfile(source, preview_path)
        print(f"RIEVA_PREVIEW={preview_path}")

    if args.webp:
        output_path = Path(args.webp).expanduser().resolve()
        encode_webp(
            frames_dir,
            output_path,
            fps=args.fps,
            frame_count=args.frames,
            requested_quality=args.quality,
            max_bytes=round(args.max_mib * 1024 * 1024),
        )
        print(f"RIEVA_WEBP={output_path}")
        print(f"RIEVA_WEBP_BYTES={output_path.stat().st_size}")


if __name__ == "__main__":
    main()
