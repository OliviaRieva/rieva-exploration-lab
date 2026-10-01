#!/usr/bin/env python3
"""Build RIEVA's original browser-ready missionwear in Blender.

Run with Blender, not CPython. The input `.blend` is Blender Studio's CC0
Human Base Meshes v1.4.1 file and should already be open on the command line:

    blender -b human_base_meshes_bundle.blend \
      -P scripts/build_rieva_suits.py -- \
      --out public/models/rieva-missionwear.glb \
      --blend /tmp/rieva-missionwear.blend \
      --preview /tmp/rieva-missionwear-preview.png

The generated suit geometry, panels, helmet, accessories, hierarchy, materials,
and interaction metadata are original to this project. The body scaffold comes
from Blender Studio's CC0 base-mesh bundle; see public/models/README.md.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Callable, Iterable

import bpy
from mathutils import Matrix, Vector


CONCEPTS = (
    ("selene", "MAX"),
    ("areo", "MALTE"),
    ("vector", "BASTIAN"),
)


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--blend")
    parser.add_argument("--preview")
    return parser.parse_args(arguments)


def rgba(hex_color: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    value = hex_color.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)) + (alpha,)


def make_material(
    name: str,
    color: str,
    *,
    metallic: float = 0.0,
    roughness: float = 0.45,
    alpha: float = 1.0,
    transmission: float = 0.0,
    emission: str | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba(color, alpha)
    material.use_nodes = True
    material.surface_render_method = "DITHERED" if alpha < 1 else "DITHERED"
    node = material.node_tree.nodes.get("Principled BSDF")
    if node:
        node.inputs["Base Color"].default_value = rgba(color, alpha)
        node.inputs["Metallic"].default_value = metallic
        node.inputs["Roughness"].default_value = roughness
        node.inputs["Alpha"].default_value = alpha
        if "Transmission Weight" in node.inputs:
            node.inputs["Transmission Weight"].default_value = transmission
        if emission and "Emission Color" in node.inputs:
            node.inputs["Emission Color"].default_value = rgba(emission)
            node.inputs["Emission Strength"].default_value = emission_strength
    return material


def smooth(object_: bpy.types.Object) -> None:
    if object_.type != "MESH":
        return
    for polygon in object_.data.polygons:
        polygon.use_smooth = True


def add_bevel(object_: bpy.types.Object, width: float = 0.012, segments: int = 3) -> None:
    modifier = object_.modifiers.new("Soft manufactured edge", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"


def assign_material(object_: bpy.types.Object, material: bpy.types.Material) -> None:
    if object_.type == "MESH":
        object_.data.materials.clear()
        object_.data.materials.append(material)


def tag(
    object_: bpy.types.Object,
    *,
    role: str | None = None,
    part_id: str | None = None,
    concept: str | None = None,
    cutaway: bool = False,
    **properties: object,
) -> bpy.types.Object:
    if role:
        object_["materialRole"] = role
    if part_id:
        object_["part_id"] = part_id
    if concept:
        object_["conceptVariant"] = concept
    if cutaway:
        object_["cutawaySurface"] = True
    for key, value in properties.items():
        object_[key] = value
    return object_


def empty(
    name: str,
    parent: bpy.types.Object | None = None,
    location: Iterable[float] = (0, 0, 0),
    *,
    display: str = "PLAIN_AXES",
    **properties: object,
) -> bpy.types.Object:
    object_ = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(object_)
    object_.empty_display_type = display
    object_.empty_display_size = 0.08
    object_.location = location
    if parent:
        object_.parent = parent
    for key, value in properties.items():
        object_[key] = value
    return object_


def part(
    parent: bpy.types.Object,
    part_id: str,
    name: str,
    *,
    explode: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    return empty(
        name,
        parent,
        part_id=part_id,
        explode_offset=list(explode),
    )


def mesh_from_source_region(
    source: bpy.types.Mesh,
    name: str,
    predicate: Callable[[Vector], bool],
    *,
    parent: bpy.types.Object,
    pivot: Vector,
    material: bpy.types.Material,
    role: str,
    part_id: str | None = None,
    expansion: float = 0.0,
    cutaway: bool = False,
) -> bpy.types.Object:
    selected_polygons: list[bpy.types.MeshPolygon] = []
    used: set[int] = set()
    for polygon in source.polygons:
        center = sum((source.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        if predicate(center):
            selected_polygons.append(polygon)
            used.update(polygon.vertices)

    ordered = sorted(used)
    mapping = {old: new for new, old in enumerate(ordered)}
    vertices = []
    for index in ordered:
        source_vertex = source.vertices[index]
        vertices.append(tuple(source_vertex.co + source_vertex.normal * expansion - pivot))
    faces = [[mapping[index] for index in polygon.vertices] for polygon in selected_polygons]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    object_ = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(object_)
    object_.parent = parent
    object_.location = (0, 0, 0)
    assign_material(object_, material)
    smooth(object_)
    tag(object_, role=role, part_id=part_id, cutaway=cutaway)
    return object_


def uv_sphere(
    name: str,
    parent: bpy.types.Object,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    role: str,
    *,
    part_id: str | None = None,
    segments: int = 40,
    rings: int = 24,
    cutaway: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    object_ = bpy.context.object
    object_.name = name
    object_.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    object_.parent = parent
    assign_material(object_, material)
    smooth(object_)
    tag(object_, role=role, part_id=part_id, cutaway=cutaway)
    return object_


def rounded_box(
    name: str,
    parent: bpy.types.Object,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    role: str,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    bevel: float = 0.025,
    part_id: str | None = None,
    cutaway: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    object_ = bpy.context.object
    object_.name = name
    object_.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    object_.parent = parent
    assign_material(object_, material)
    add_bevel(object_, bevel, 4)
    tag(object_, role=role, part_id=part_id, cutaway=cutaway)
    return object_


def cylinder(
    name: str,
    parent: bpy.types.Object,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    role: str,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    part_id: str | None = None,
    vertices: int = 32,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    object_ = bpy.context.object
    object_.name = name
    object_.parent = parent
    assign_material(object_, material)
    add_bevel(object_, min(0.012, radius * 0.2), 3)
    smooth(object_)
    tag(object_, role=role, part_id=part_id)
    return object_


def torus(
    name: str,
    parent: bpy.types.Object,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    role: str,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    scale: tuple[float, float, float] = (1, 1, 1),
    part_id: str | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=48,
        minor_segments=10,
        location=location,
        rotation=rotation,
    )
    object_ = bpy.context.object
    object_.name = name
    object_.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    object_.parent = parent
    assign_material(object_, material)
    smooth(object_)
    tag(object_, role=role, part_id=part_id)
    return object_


def curve_tube(
    name: str,
    parent: bpy.types.Object,
    points: list[tuple[float, float, float]],
    material: bpy.types.Material,
    role: str,
    *,
    radius: float = 0.012,
    part_id: str | None = None,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    object_ = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(object_)
    object_.parent = parent
    assign_material(object_, material)
    tag(object_, role=role, part_id=part_id)
    return object_


def duplicate_object(
    source: bpy.types.Object,
    name: str,
    parent: bpy.types.Object,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    duplicate = source.copy()
    duplicate.data = source.data.copy()
    duplicate.animation_data_clear()
    duplicate.name = name
    duplicate.parent = parent
    duplicate.location = (0, 0, 0)
    duplicate.rotation_euler = (0, 0, 0)
    duplicate.scale = (1, 1, 1)
    bpy.context.scene.collection.objects.link(duplicate)
    for modifier in list(duplicate.modifiers):
        duplicate.modifiers.remove(modifier)
    assign_material(duplicate, material)
    smooth(duplicate)
    tag(duplicate, role=role)
    return duplicate


def delete_faces(object_: bpy.types.Object, keep: Callable[[Vector], bool]) -> None:
    mesh = object_.data
    keep_polygons = []
    used: set[int] = set()
    for polygon in mesh.polygons:
        center = sum((mesh.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        if keep(center):
            keep_polygons.append(polygon)
            used.update(polygon.vertices)
    ordered = sorted(used)
    mapping = {old: new for new, old in enumerate(ordered)}
    vertices = [tuple(mesh.vertices[index].co) for index in ordered]
    faces = [[mapping[index] for index in polygon.vertices] for polygon in keep_polygons]
    replacement = bpy.data.meshes.new(f"{mesh.name}_trimmed")
    replacement.from_pydata(vertices, [], faces)
    replacement.update(calc_edges=True)
    old = object_.data
    object_.data = replacement
    bpy.data.meshes.remove(old)
    smooth(object_)


def concept_materials(concept: str) -> dict[str, bpy.types.Material]:
    palettes = {
        "selene": {
            "shell": "#ecf2f4", "secondaryShell": "#aab8c4", "underlayer": "#18222d",
            "accent": "#65d5ec", "metal": "#687684", "dust": "#bda57f", "assist": "#9aaebb",
        },
        "areo": {
            "shell": "#f2eee8", "secondaryShell": "#b9a990", "underlayer": "#241d20",
            "accent": "#d79258", "metal": "#776f70", "dust": "#9b624e", "assist": "#ab8f7e",
        },
        "vector": {
            "shell": "#171821", "secondaryShell": "#40364d", "underlayer": "#0a0b10",
            "accent": "#d9af5f", "metal": "#81785f", "dust": "#755d52", "assist": "#9c7e50",
        },
    }[concept]
    result = {
        role: make_material(f"{concept}_{role}", color, metallic=0.1 if role not in {"metal", "assist"} else 0.7,
                            roughness=0.35 if role in {"shell", "secondaryShell"} else 0.48)
        for role, color in palettes.items()
    }
    result["skin"] = make_material(f"{concept}_skin", "#9b6957", roughness=0.62)
    result["hair"] = make_material(f"{concept}_hair", "#2b2024", roughness=0.7)
    result["visor"] = make_material(f"{concept}_visor", "#79b9d0", metallic=0.15, roughness=0.09, alpha=0.36, transmission=0.3)
    result["sunVisor"] = make_material(f"{concept}_sunVisor", "#c48e3d", metallic=0.48, roughness=0.16, alpha=0.62)
    result["light"] = make_material(f"{concept}_light", "#a8f4ff", metallic=0.12, roughness=0.18,
                                    emission="#91efff", emission_strength=4.0)
    result["haptic"] = make_material(f"{concept}_haptic", "#f0a8dc", metallic=0.14, roughness=0.28,
                                     emission="#ee8ed2", emission_strength=1.2)
    return result


def build_concept(source_object: bpy.types.Object, concept: str, display_name: str) -> bpy.types.Object:
    materials = concept_materials(concept)
    source = source_object.data
    root = empty(f"CONCEPT_{display_name}", conceptVariant=concept, display_name=display_name)
    body = empty(f"{display_name}_BODY", root, rig_role="body")

    # Anatomical rig pivots measured against the 1.69 m Blender Studio body.
    shoulder_l = Vector((0.205, 0.0, 1.315))
    shoulder_r = Vector((-0.205, 0.0, 1.315))
    elbow_l = Vector((0.315, -0.005, 1.055))
    elbow_r = Vector((-0.315, -0.005, 1.055))
    hip_l = Vector((0.105, 0.0, 0.86))
    hip_r = Vector((-0.105, 0.0, 0.86))
    knee_l = Vector((0.105, -0.005, 0.47))
    knee_r = Vector((-0.105, -0.005, 0.47))

    arm_l = empty(f"{display_name}_ARM_L", body, shoulder_l, rig_role="arm_l")
    arm_r = empty(f"{display_name}_ARM_R", body, shoulder_r, rig_role="arm_r")
    forearm_l = empty(f"{display_name}_FOREARM_L", arm_l, elbow_l - shoulder_l, rig_role="forearm_l")
    forearm_r = empty(f"{display_name}_FOREARM_R", arm_r, elbow_r - shoulder_r, rig_role="forearm_r")
    leg_l = empty(f"{display_name}_LEG_L", body, hip_l, rig_role="leg_l")
    leg_r = empty(f"{display_name}_LEG_R", body, hip_r, rig_role="leg_r")
    shin_l = empty(f"{display_name}_SHIN_L", leg_l, knee_l - hip_l, rig_role="shin_l")
    shin_r = empty(f"{display_name}_SHIN_R", leg_r, knee_r - hip_r, rig_role="shin_r")

    expansion = 0.012 if concept == "vector" else 0.025
    shell_role = "underlayer" if concept == "vector" else "shell"
    shell_material = materials[shell_role]

    # Real Blender Studio anatomy drives the surface silhouette. Overlapping
    # seams are intentionally covered by articulated bearings and textile bands.
    torso_group = part(body, "torso-shell", f"{display_name} anatomical torso", explode=(0, -0.04, 0.05))
    mesh_from_source_region(
        source, f"{display_name}_torso_tailored_surface",
        lambda c: 0.86 <= c.z < 1.39 and abs(c.x) < 0.27,
        parent=torso_group, pivot=Vector(), material=shell_material, role=shell_role,
        expansion=expansion, cutaway=concept != "vector",
    )
    layer_group = part(body, "torso-layers", f"{display_name} protective torso layers", explode=(0, -0.055, 0.08))
    mesh_from_source_region(
        source, f"{display_name}_ribbed_restraint_layer",
        lambda c: 0.91 <= c.z < 1.34 and abs(c.x) < 0.25,
        parent=layer_group, pivot=Vector(), material=materials["secondaryShell"], role="secondaryShell",
        expansion=expansion + (0.009 if concept != "vector" else 0.004), cutaway=True,
    )

    lower_group = part(body, "lower-body", f"{display_name} lower body", explode=(0, 0.0, -0.06))
    mesh_from_source_region(
        source, f"{display_name}_pelvis_tailoring",
        lambda c: 0.70 <= c.z < 0.96 and abs(c.x) < 0.245,
        parent=lower_group, pivot=Vector(), material=materials["secondaryShell"], role="secondaryShell",
        expansion=expansion, cutaway=concept != "vector",
    )

    for side, arm, forearm, shoulder, elbow in (
        (1, arm_l, forearm_l, shoulder_l, elbow_l),
        (-1, arm_r, forearm_r, shoulder_r, elbow_r),
    ):
        suffix = "left" if side > 0 else "right"
        shoulder_part = part(arm, f"shoulder-{suffix}", f"{display_name} {suffix} shoulder", explode=(side * 0.05, 0, 0.02))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_upper_arm_anatomical",
            lambda c, side=side: side * c.x > 0.17 and c.z >= 1.055,
            parent=shoulder_part, pivot=shoulder, material=shell_material, role=shell_role,
            expansion=expansion, cutaway=concept != "vector",
        )
        torus(
            f"{display_name}_{suffix}_shoulder_bearing", shoulder_part,
            (0, -0.005, 0), 0.094 if concept != "vector" else 0.075, 0.018,
            materials["metal"], "metal", rotation=(0, math.pi / 2, 0),
        )
        elbow_part = part(forearm, f"elbow-{suffix}", f"{display_name} {suffix} elbow", explode=(side * 0.045, 0, 0))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_forearm_anatomical",
            lambda c, side=side: side * c.x > 0.22 and 0.76 <= c.z < 1.09,
            parent=elbow_part, pivot=elbow, material=shell_material, role=shell_role,
            expansion=expansion, cutaway=concept != "vector",
        )
        torus(
            f"{display_name}_{suffix}_elbow_bearing", elbow_part,
            (0, 0, 0), 0.073 if concept != "vector" else 0.058, 0.016,
            materials["secondaryShell"], "secondaryShell", rotation=(0, math.pi / 2, 0),
        )
        glove_part = part(forearm, f"glove-{suffix}", f"{display_name} {suffix} glove", explode=(side * 0.055, -0.015, -0.02))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_articulated_glove",
            lambda c, side=side: side * c.x > 0.245 and c.z < 0.80 and c.z > 0.57,
            parent=glove_part, pivot=elbow, material=materials["underlayer"], role="underlayer",
            expansion=0.014,
        )
        wrist_part = part(forearm, f"wrist-ring-{suffix}", f"{display_name} {suffix} wrist interface", explode=(side * 0.04, 0, 0))
        torus(
            f"{display_name}_{suffix}_wrist_ring", wrist_part,
            (side * 0.065, -0.004, -0.255), 0.052, 0.014,
            materials["metal"], "metal", rotation=(0, math.pi / 2, 0),
        )

    for side, leg, shin, hip, knee in (
        (1, leg_l, shin_l, hip_l, knee_l),
        (-1, leg_r, shin_r, hip_r, knee_r),
    ):
        suffix = "left" if side > 0 else "right"
        leg_part = part(leg, "lower-body", f"{display_name} {suffix} upper leg", explode=(side * 0.035, 0, -0.04))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_upper_leg_anatomical",
            lambda c, side=side: side * c.x > 0.012 and 0.43 <= c.z < 0.86,
            parent=leg_part, pivot=hip, material=shell_material, role=shell_role,
            expansion=expansion, cutaway=concept != "vector",
        )
        knee_part = part(shin, f"knee-{suffix}", f"{display_name} {suffix} knee", explode=(side * 0.035, -0.01, -0.03))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_lower_leg_anatomical",
            lambda c, side=side: side * c.x > 0.012 and 0.12 <= c.z < 0.48,
            parent=knee_part, pivot=knee, material=shell_material, role=shell_role,
            expansion=expansion, cutaway=concept != "vector",
        )
        torus(
            f"{display_name}_{suffix}_knee_bearing", knee_part,
            (0, -0.006, 0), 0.085 if concept != "vector" else 0.066, 0.018,
            materials["secondaryShell"], "secondaryShell",
            scale=(1, 1.15, 1),
        )
        boot_part = part(shin, f"boot-{suffix}", f"{display_name} {suffix} terrain boot", explode=(side * 0.035, -0.04, -0.035))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_foot_last",
            lambda c, side=side: side * c.x > 0.006 and c.z < 0.16,
            parent=boot_part, pivot=knee, material=materials["underlayer"], role="underlayer",
            expansion=0.025 if concept != "vector" else 0.012,
        )
        rounded_box(
            f"{display_name}_{suffix}_replaceable_tread", boot_part,
            (side * 0.105 - knee.x, -0.04, 0.085 - knee.z),
            (0.09, 0.16, 0.022), materials["secondaryShell"], "secondaryShell",
            bevel=0.018,
        )
        gaiter_part = part(shin, f"dust-gaiter-{suffix}", f"{display_name} {suffix} dust gaiter", explode=(side * 0.04, 0, -0.025))
        torus(
            f"{display_name}_{suffix}_dust_gaiter", gaiter_part,
            (0, 0, 0.12 - knee.z), 0.074, 0.02,
            materials["dust"], "dust",
            scale=(1, 1.16, 1),
        )

    # A real human face from the CC0 base mesh remains visible behind the visor,
    # and is fully exposed on BASTIAN, which is explicitly not an EVA system.
    head_skin = mesh_from_source_region(
        source, f"{display_name}_human_head",
        lambda c: c.z >= 1.35,
        parent=body, pivot=Vector(), material=materials["skin"], role="skin",
    )
    head_skin["human_base"] = "Blender Studio Human Base Meshes v1.4.1 (CC0)"
    hair = uv_sphere(
        f"{display_name}_hair", body, (0, 0.008, 1.59), (0.105, 0.095, 0.115),
        materials["hair"], "hair", segments=32, rings=18,
    )
    delete_faces(hair, lambda c: c.z > -0.17 and c.y > -0.65)

    if concept != "vector":
        helmet = empty(f"{display_name}_HELMET_ASSEMBLY", body, helmet_assembly=True)
        shell_part = part(helmet, "helmet-pressure-shell", f"{display_name} pressure helmet", explode=(0, 0.02, 0.12))
        helmet_shell = uv_sphere(
            f"{display_name}_helmet_pressure_shell", shell_part, (0, 0.006, 1.55),
            (0.225, 0.238, 0.26), materials["shell"], "shell", cutaway=True,
        )
        # Cut a genuine face aperture into the pressure shell. Coordinates are
        # already expressed in metres after the ellipsoid scale is applied.
        # The former -0.24 threshold sat just outside the shell and therefore
        # left a toy-like opaque sphere in front of the face.
        delete_faces(
            helmet_shell,
            lambda c: not (c.y < -0.13 and -0.16 < c.z < 0.16 and abs(c.x) < 0.18),
        )
        visor_part = part(helmet, "helmet-visor", f"{display_name} protective visor", explode=(0, -0.08, 0.1))
        visor = uv_sphere(
            f"{display_name}_primary_visor", visor_part, (0, -0.012, 1.55),
            (0.221, 0.247, 0.245), materials["visor"], "visor", cutaway=True,
        )
        delete_faces(visor, lambda c: c.y < -0.08 and abs(c.x) < 0.9 and -0.72 < c.z < 0.72)
        sun_part = part(helmet, "helmet-sun-visor", f"{display_name} sun visor", explode=(0, -0.1, 0.13))
        sun = uv_sphere(
            f"{display_name}_sun_visor", sun_part, (0, -0.026, 1.57),
            (0.213, 0.252, 0.228), materials["sunVisor"], "sunVisor", segments=40, rings=22,
        )
        delete_faces(sun, lambda c: c.y < -0.12 and abs(c.x) < 0.86 and -0.1 < c.z < 0.72)
        neck_part = part(helmet, "helmet-neck-ring", f"{display_name} neck interface", explode=(0, 0, -0.05))
        torus(
            f"{display_name}_neck_bearing", neck_part, (0, 0, 1.355), 0.148, 0.026,
            materials["metal"], "metal", scale=(1, 1.08, 1),
        )
        lights_part = part(helmet, "helmet-lights", f"{display_name} helmet lighting", explode=(0, -0.05, 0.08))
        for side in (-1, 1):
            cylinder(
                f"{display_name}_{'left' if side < 0 else 'right'}_helmet_light", lights_part,
                (side * 0.17, -0.19, 1.575), 0.025, 0.035, materials["light"], "light",
                rotation=(math.pi / 2, 0, 0),
            )
        ears = part(helmet, "helmet-cat-ear-pods", f"{display_name} cat-ear antenna pods", explode=(0, 0, 0.16))
        for side in (-1, 1):
            pod = uv_sphere(
                f"{display_name}_{'left' if side < 0 else 'right'}_rounded_antenna_pod", ears,
                (side * 0.142, 0.012, 1.765), (0.033, 0.039, 0.052),
                materials["secondaryShell"], "secondaryShell", segments=28, rings=16,
            )
            pod.rotation_euler.y = side * -0.22
            cylinder(
                f"{display_name}_{'left' if side < 0 else 'right'}_pod_light", ears,
                (side * 0.15, -0.057, 1.805), 0.011, 0.018, materials["light"], "light",
                rotation=(math.pi / 2, 0, 0), vertices=20,
            )

        backpack = part(body, "backpack", f"{display_name} portable life support", explode=(0, 0.14, 0.02))
        rounded_box(
            f"{display_name}_life_support_backplate", backpack, (0, 0.18, 1.09),
            (0.255, 0.105, 0.31), materials["secondaryShell"], "secondaryShell", bevel=0.055,
        )
        for side in (-1, 1):
            cylinder(
                f"{display_name}_{'left' if side < 0 else 'right'}_service_tank", backpack,
                (side * 0.13, 0.295, 1.12), 0.055, 0.39,
                materials["metal"], "metal", vertices=32,
            )
        for z in (0.88, 1.05, 1.24):
            rounded_box(
                f"{display_name}_backpack_vent_{z}", backpack, (0, 0.294, z),
                (0.115, 0.012, 0.018), materials["underlayer"], "underlayer", bevel=0.008,
            )
        curve_tube(
            f"{display_name}_cooling_return_hose", backpack,
            [(0.16, 0.25, 1.26), (0.27, 0.08, 1.28), (0.19, -0.02, 1.34)],
            materials["accent"], "accent", radius=0.012,
        )

    # Three real tailoring options. They alter protective outer panels only and
    # never stand in for pressure retention or life support.
    # Tailoring choices are body-following textile shells extracted from the
    # same anatomical mesh—not cuboids pasted onto the chest. Their predicates
    # vary coverage and silhouette while leaving the pressure architecture
    # underneath unchanged.
    for style, z_min, z_max, x_limit, extra, material_key in (
        ("streamline", 0.99, 1.32, 0.195, 0.044, "secondaryShell"),
        ("field-rig", 0.95, 1.29, 0.225, 0.048, "secondaryShell"),
        ("adaptive", 1.01, 1.35, 0.205, 0.050, "metal"),
    ):
        panel = mesh_from_source_region(
            source,
            f"{display_name}_{style}_body_contoured_torso_panel",
            lambda c, z_min=z_min, z_max=z_max, x_limit=x_limit:
                z_min <= c.z <= z_max and abs(c.x) <= x_limit and c.y < -0.055,
            parent=layer_group,
            pivot=Vector(),
            material=materials[material_key],
            role=material_key,
            expansion=extra,
            cutaway=True,
        )
        panel["torsoStyle"] = style
        panel["cutawaySurface"] = True
        if style == "adaptive":
            for band in range(4):
                line = rounded_box(
                    f"{display_name}_adaptive_band_{band}", layer_group,
                    (0, -0.205, 1.05 + band * 0.08), (0.18 - band * 0.012, 0.012, 0.009),
                    materials["accent"], "accent", bevel=0.008,
                )
                line["torsoStyle"] = style

    for style, z_min, z_max, front_limit in (
        ("contour", 0.52, 0.80, -0.015),
        ("field", 0.48, 0.82, -0.005),
        ("mobility", 0.57, 0.82, -0.025),
    ):
        for side, leg, hip in ((-1, leg_r, hip_r), (1, leg_l, hip_l)):
            panel = mesh_from_source_region(
                source,
                f"{display_name}_{style}_{'left' if side > 0 else 'right'}_body_contoured_thigh_panel",
                lambda c, side=side, z_min=z_min, z_max=z_max, front_limit=front_limit:
                    side * c.x > 0.025 and z_min <= c.z <= z_max and c.y < front_limit,
                parent=leg,
                pivot=hip,
                material=materials["secondaryShell"],
                role="secondaryShell",
                expansion=expansion + 0.018,
                cutaway=True,
            )
            panel["pantsStyle"] = style

    for style, tread_depth in (("traverse", 0.17), ("rock", 0.19), ("stability", 0.205)):
        for side, shin in ((-1, shin_r), (1, shin_l)):
            sole = rounded_box(
                f"{display_name}_{style}_{'left' if side < 0 else 'right'}_sole",
                shin, (0, -0.05, -0.405), (0.095, tread_depth, 0.018),
                materials["underlayer"], "underlayer", bevel=0.016,
            )
            sole["bootStyle"] = style

    # Mission accessories are separate named nodes, making both selection and
    # honest equipment-state reporting possible in Three.js.
    staff = part(body, "walking-staff", f"{display_name} adjustable walking staff", explode=(0.18, -0.02, 0))
    cylinder(
        f"{display_name}_staff_shaft", staff, (0.46, -0.05, 0.58), 0.018, 1.12,
        materials["metal"], "metal",
    )
    cylinder(
        f"{display_name}_staff_grip", staff, (0.46, -0.05, 1.17), 0.033, 0.18,
        materials["underlayer"], "underlayer",
    )
    cylinder(
        f"{display_name}_staff_sensor_foot", staff, (0.46, -0.05, 0.035), 0.075, 0.025,
        materials["accent"], "accent",
    )
    cylinder(
        f"{display_name}_staff_light", staff, (0.46, -0.05, 1.29), 0.023, 0.05,
        materials["light"], "light",
    )

    assist = part(body, "assistive-lower-body-module", f"{display_name} assistive lower-body frame", explode=(0, 0.06, 0))
    curve_tube(
        f"{display_name}_assist_left", assist,
        [(0.22, 0.07, 0.85), (0.20, 0.075, 0.48), (0.16, 0.075, 0.14)],
        materials["assist"], "assist", radius=0.017,
    )
    curve_tube(
        f"{display_name}_assist_right", assist,
        [(-0.22, 0.07, 0.85), (-0.20, 0.075, 0.48), (-0.16, 0.075, 0.14)],
        materials["assist"], "assist", radius=0.017,
    )
    for side in (-1, 1):
        cylinder(
            f"{display_name}_{'left' if side < 0 else 'right'}_assist_joint", assist,
            (side * 0.2, 0.075, 0.48), 0.046, 0.04,
            materials["accent"], "accent", rotation=(math.pi / 2, 0, 0),
        )

    haptic = part(body, "haptic-module", f"{display_name} haptic navigation module", explode=(-0.05, -0.04, 0.02))
    for row in range(2):
        for column in range(3):
            cylinder(
                f"{display_name}_haptic_node_{row}_{column}", haptic,
                (-0.075 + column * 0.075, -0.208, 1.08 + row * 0.075),
                0.018, 0.014, materials["haptic"], "haptic",
                rotation=(math.pi / 2, 0, 0), vertices=20,
            )

    camera = part(body, "shoulder-camera", f"{display_name} shoulder camera", explode=(0.05, -0.05, 0.05))
    rounded_box(
        f"{display_name}_shoulder_camera_housing", camera, (0.25, -0.12, 1.38),
        (0.047, 0.052, 0.043), materials["secondaryShell"], "secondaryShell", bevel=0.015,
    )
    cylinder(
        f"{display_name}_shoulder_camera_lens", camera, (0.25, -0.177, 1.38),
        0.021, 0.019, materials["visor"], "visor", rotation=(math.pi / 2, 0, 0), vertices=24,
    )

    tether = part(body, "tether-reel", f"{display_name} tether reel", explode=(-0.07, 0.02, -0.02))
    cylinder(
        f"{display_name}_tether_reel", tether, (-0.24, -0.04, 0.84),
        0.065, 0.045, materials["metal"], "metal", rotation=(math.pi / 2, 0, 0),
    )
    sample = part(body, "sample-kit", f"{display_name} sealed sample kit", explode=(0.07, -0.04, -0.03))
    rounded_box(
        f"{display_name}_sample_container", sample, (0.245, -0.075, 0.76),
        (0.085, 0.055, 0.13), materials["secondaryShell"], "secondaryShell", bevel=0.028,
    )

    monitoring_id = "vector-monitoring" if concept == "vector" else "backpack"
    monitoring = part(body, monitoring_id, f"{display_name} biometric monitoring", explode=(0, -0.04, 0.01))
    rounded_box(
        f"{display_name}_biometric_patch", monitoring, (-0.115, -0.188, 1.225),
        (0.045, 0.012, 0.062), materials["light"], "light", bevel=0.012,
    )

    # Strong concept-specific visual language beyond palette changes.
    if concept == "selene":
        for side in (-1, 1):
            rounded_box(
                f"MAX_{'left' if side < 0 else 'right'}_lunar_clavicle", layer_group,
                (side * 0.13, -0.205, 1.32), (0.105, 0.018, 0.035),
                materials["shell"], "shell", rotation=(0, 0, side * -0.17), bevel=0.02,
            )
            shin = shin_l if side > 0 else shin_r
            knee = knee_l if side > 0 else knee_r
            mesh_from_source_region(
                source,
                f"MAX_{'left' if side > 0 else 'right'}_body_contoured_dust_shin_guard",
                lambda c, side=side: side * c.x > 0.02 and 0.19 <= c.z <= 0.43 and c.y < -0.015,
                parent=shin,
                pivot=knee,
                material=materials["secondaryShell"],
                role="secondaryShell",
                expansion=expansion + 0.025,
                cutaway=True,
            )
    elif concept == "areo":
        for band in range(5):
            rounded_box(
                f"MALTE_geology_lamella_{band}", layer_group,
                (-0.055 + band * 0.027, -0.213 - band * 0.001, 1.03 + band * 0.065),
                (0.19 - band * 0.012, 0.014, 0.013),
                materials["dust" if band % 2 else "secondaryShell"],
                "dust" if band % 2 else "secondaryShell", bevel=0.009,
            )
        rounded_box(
            "MALTE_asymmetric_geology_pocket", layer_group, (0.145, -0.217, 1.05),
            (0.075, 0.018, 0.09), materials["dust"], "dust", bevel=0.025,
        )
    else:
        for side in (-1, 1):
            curve_tube(
                f"BASTIAN_{'left' if side < 0 else 'right'}_kinetic_load_path", body,
                [(side * 0.16, -0.152, 1.33), (side * 0.11, -0.175, 1.02), (side * 0.14, -0.145, 0.76)],
                materials["accent"], "accent", radius=0.009, part_id="vector-monitoring",
            )
        sternum = mesh_from_source_region(
            source,
            "BASTIAN_body_contoured_sternum_sensor_weave",
            lambda c: 1.03 <= c.z <= 1.34 and abs(c.x) <= 0.13 and c.y < -0.075,
            parent=layer_group,
            pivot=Vector(),
            material=materials["underlayer"],
            role="underlayer",
            expansion=0.044,
            cutaway=True,
        )
        sternum["torsoStyle"] = "streamline"

    return root


def clear_scene_except_source(source: bpy.types.Object) -> bpy.types.Object:
    source_copy = source.copy()
    source_copy.data = source.data.copy()
    source_copy.name = "RIEVA_CC0_BODY_SOURCE"
    bpy.context.scene.collection.objects.link(source_copy)
    source_copy.location = (0, 0, 0)
    source_copy.rotation_euler = (0, 0, 0)
    source_copy.scale = (1, 1, 1)
    for modifier in list(source_copy.modifiers):
        source_copy.modifiers.remove(modifier)
    for object_ in list(bpy.data.objects):
        if object_ != source_copy:
            bpy.data.objects.remove(object_, do_unlink=True)
    return source_copy


def look_at(object_: bpy.types.Object, target: Vector) -> None:
    direction = target - object_.location
    object_.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_preview(roots: list[bpy.types.Object], preview_path: Path) -> None:
    for root, x in zip(roots, (-1.25, 0.0, 1.25)):
        root.location.x = x

    hidden_preview_parts = {
        "walking-staff",
        "assistive-lower-body-module",
        "haptic-module",
        "shoulder-camera",
        "tether-reel",
        "sample-kit",
    }
    hidden_roots: list[bpy.types.Object] = []
    for object_ in bpy.context.scene.objects:
        if object_.get("part_id") in hidden_preview_parts:
            hidden_roots.append(object_)
        if object_.get("torsoStyle") and object_.get("torsoStyle") != "streamline":
            object_.hide_render = True
        if object_.get("pantsStyle") and object_.get("pantsStyle") != "contour":
            object_.hide_render = True
        if object_.get("bootStyle") and object_.get("bootStyle") != "traverse":
            object_.hide_render = True
    for root in hidden_roots:
        root.hide_render = True
        for child in root.children_recursive:
            child.hide_render = True

    floor_material = make_material("preview_floor", "#e8e9f4", roughness=0.68)
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.015))
    floor = bpy.context.object
    floor.name = "Preview floor"
    assign_material(floor, floor_material)

    bpy.ops.object.light_add(type="AREA", location=(0, -4.0, 4.2))
    key = bpy.context.object
    key.data.energy = 620
    key.data.shape = "DISK"
    key.data.size = 4.0
    look_at(key, Vector((0, 0, 0.9)))
    bpy.ops.object.light_add(type="AREA", location=(-3.4, 0.8, 2.4))
    rim = bpy.context.object
    rim.data.energy = 340
    rim.data.color = (0.48, 0.28, 1.0)
    rim.data.size = 3.0
    look_at(rim, Vector((0, 0, 1.0)))
    bpy.ops.object.light_add(type="AREA", location=(3.4, -0.2, 1.8))
    fill = bpy.context.object
    fill.data.energy = 320
    fill.data.color = (0.25, 0.72, 1.0)
    fill.data.size = 2.5
    look_at(fill, Vector((0, 0, 0.95)))

    bpy.ops.object.camera_add(location=(0, -7.2, 1.0))
    camera = bpy.context.object
    camera.data.lens = 58
    look_at(camera, Vector((0, 0, 0.88)))
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(preview_path)
    scene.render.film_transparent = False
    scene.world.color = (0.028, 0.025, 0.06)
    scene.view_settings.exposure = -0.65
    scene.view_settings.look = "Medium High Contrast"
    bpy.ops.render.render(write_still=True)


def export_glb(roots: list[bpy.types.Object], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    for object_ in bpy.context.scene.objects:
        object_.select_set(False)
    for root in roots:
        root.select_set(True)
        for child in root.children_recursive:
            child.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_unused_images=False,
    )


def main() -> None:
    args = parse_args()
    source = bpy.data.objects.get("GEO-body_male_realistic")
    if not source or source.type != "MESH":
        raise RuntimeError(
            "Open Blender Studio Human Base Meshes v1.4.1 before running this script; "
            "GEO-body_male_realistic was not found."
        )
    source = clear_scene_except_source(source)
    roots = [build_concept(source, concept, display_name) for concept, display_name in CONCEPTS]
    bpy.data.objects.remove(source, do_unlink=True)

    output_path = Path(args.out).resolve()
    export_glb(roots, output_path)
    print(f"RIEVA_GLTF={output_path}")

    if args.blend:
        blend_path = Path(args.blend).resolve()
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        print(f"RIEVA_BLEND={blend_path}")
    if args.preview:
        preview_path = Path(args.preview).resolve()
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        setup_preview(roots, preview_path)
        print(f"RIEVA_PREVIEW={preview_path}")


if __name__ == "__main__":
    main()
