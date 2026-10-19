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
    coat: float = 0.0,
    coat_roughness: float = 0.35,
    sheen: float = 0.0,
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
        if "Coat Weight" in node.inputs:
            node.inputs["Coat Weight"].default_value = coat
        if "Coat Roughness" in node.inputs:
            node.inputs["Coat Roughness"].default_value = coat_roughness
        if "Sheen Weight" in node.inputs:
            node.inputs["Sheen Weight"].default_value = sheen
    material["pbr_finish"] = (
        "coated technical textile" if coat > 0.08 else
        "woven technical textile" if sheen > 0.08 else
        "engineered surface"
    )
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
    if object_.type in {"MESH", "CURVE"} and hasattr(object_.data, "materials"):
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
    cyclic: bool = False,
    construction: str | None = None,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    spline.use_cyclic_u = cyclic
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    object_ = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(object_)
    object_.parent = parent
    assign_material(object_, material)
    tag(object_, role=role, part_id=part_id)
    if construction:
        object_["construction"] = construction
    return object_


def curve_tube_world(
    name: str,
    parent: bpy.types.Object,
    points: list[tuple[float, float, float]],
    pivot: Vector,
    material: bpy.types.Material,
    role: str,
    *,
    radius: float = 0.012,
    cyclic: bool = False,
    construction: str | None = None,
) -> bpy.types.Object:
    """Author a curve in body-space, then attach it to an articulated pivot."""
    local_points = [tuple(Vector(point) - pivot) for point in points]
    return curve_tube(
        name,
        parent,
        local_points,
        material,
        role,
        radius=radius,
        cyclic=cyclic,
        construction=construction,
    )


def mesh_object(
    name: str,
    parent: bpy.types.Object,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...] | list[int]],
    material: bpy.types.Material,
    role: str,
    *,
    part_id: str | None = None,
    cutaway: bool = False,
) -> bpy.types.Object:
    """Create a smooth authored mesh without relying on a stock primitive."""
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    object_ = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(object_)
    object_.parent = parent
    assign_material(object_, material)
    smooth(object_)
    tag(object_, role=role, part_id=part_id, cutaway=cutaway)
    return object_


def front_ribbon(
    name: str,
    parent: bpy.types.Object,
    points: list[tuple[float, float, float]],
    material: bpy.types.Material,
    role: str,
    *,
    width: float,
    width_axis: str = "x",
    construction: str = "woven restraint ribbon",
) -> bpy.types.Object:
    """Make a low-profile flat webbing strip that follows authored points."""
    vertices: list[tuple[float, float, float]] = []
    half = width * 0.5
    for x, y, z in points:
        if width_axis == "z":
            vertices.extend(((x, y, z - half), (x, y, z + half)))
        else:
            vertices.extend(((x - half, y, z), (x + half, y, z)))
    faces = [
        (index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2)
        for index in range(len(points) - 1)
    ]
    result = mesh_object(name, parent, vertices, faces, material, role)
    solidify = result.modifiers.new("Webbing thickness", "SOLIDIFY")
    solidify.thickness = 0.0024
    solidify.offset = 0.0
    bevel = result.modifiers.new("Soft webbing edge", "BEVEL")
    bevel.width = 0.0018
    bevel.segments = 2
    result["construction"] = construction
    return result


def lofted_round_rect(
    name: str,
    parent: bpy.types.Object,
    sections: list[tuple[float, float, float, float]],
    material: bpy.types.Material,
    role: str,
    *,
    y_center: float,
    part_id: str | None = None,
    corner_ratio: float = 0.34,
) -> bpy.types.Object:
    """Tapered eight-sided soft-shell volume.

    Each section is ``(z, half_width, half_depth, y_offset)``. The authored
    section changes read as sewn/formed equipment rather than a bevelled box.
    """
    vertices: list[tuple[float, float, float]] = []
    for z, width, depth, y_offset in sections:
        corner_x = width * corner_ratio
        corner_y = depth * corner_ratio
        outline = (
            (-width + corner_x, -depth), (width - corner_x, -depth),
            (width, -depth + corner_y), (width, depth - corner_y),
            (width - corner_x, depth), (-width + corner_x, depth),
            (-width, depth - corner_y), (-width, -depth + corner_y),
        )
        vertices.extend((x, y_center + y_offset + y, z) for x, y in outline)
    faces: list[tuple[int, ...]] = []
    faces.append(tuple(reversed(range(8))))
    for ring in range(len(sections) - 1):
        base = ring * 8
        next_base = (ring + 1) * 8
        for index in range(8):
            following = (index + 1) % 8
            faces.append((base + index, base + following, next_base + following, next_base + index))
    final = (len(sections) - 1) * 8
    faces.append(tuple(final + index for index in range(8)))
    result = mesh_object(name, parent, vertices, faces, material, role, part_id=part_id)
    bevel = result.modifiers.new("Soft equipment transitions", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    result["construction"] = "authored tapered soft-shell loft"
    return result


def helmet_dome(
    name: str,
    parent: bpy.types.Object,
    material: bpy.types.Material,
    role: str,
    *,
    part_id: str | None = None,
    cutaway: bool = True,
) -> bpy.types.Object:
    """Build an anthropometric pressure-shell dome with a true face opening."""
    sections = (
        (1.350, 0.120, 0.115, 0.014),
        (1.385, 0.167, 0.165, 0.012),
        (1.460, 0.188, 0.190, 0.010),
        (1.565, 0.190, 0.197, 0.012),
        (1.665, 0.170, 0.178, 0.018),
        (1.735, 0.112, 0.125, 0.024),
        (1.770, 0.025, 0.030, 0.030),
    )
    segment_count = 40
    vertices: list[tuple[float, float, float]] = []
    for z, radius_x, radius_y, center_y in sections:
        for segment in range(segment_count):
            theta = math.tau * segment / segment_count
            vertices.append((radius_x * math.sin(theta), center_y + radius_y * math.cos(theta), z))
    faces: list[tuple[int, ...]] = []
    # Front is negative Y (theta ~= pi). Leaving these faces absent makes the
    # visor a genuine aperture instead of an alpha-painted opaque sphere.
    for ring in range(len(sections) - 1):
        z_mid = (sections[ring][0] + sections[ring + 1][0]) * 0.5
        for segment in range(segment_count):
            next_segment = (segment + 1) % segment_count
            theta_mid = math.tau * (segment + 0.5) / segment_count
            front_delta = abs((theta_mid - math.pi + math.pi) % math.tau - math.pi)
            aperture = 1.02 if z_mid < 1.63 else 0.82
            if 1.405 < z_mid < 1.695 and front_delta < aperture:
                continue
            a = ring * segment_count + segment
            b = ring * segment_count + next_segment
            c = (ring + 1) * segment_count + next_segment
            d = (ring + 1) * segment_count + segment
            faces.append((a, b, c, d))
    result = mesh_object(
        name, parent, vertices, faces, material, role, part_id=part_id, cutaway=cutaway,
    )
    result["construction"] = "segmented anthropometric pressure shell"
    return result


def curved_visor(
    name: str,
    parent: bpy.types.Object,
    material: bpy.types.Material,
    role: str,
    *,
    z_min: float,
    z_max: float,
    outward: float,
    part_id: str | None = None,
    cutaway: bool = True,
) -> bpy.types.Object:
    """A double-curved rectangular visor panel sized to the face aperture."""
    columns = 20
    rows = 14
    vertices: list[tuple[float, float, float]] = []
    for row in range(rows + 1):
        v = -1.0 + 2.0 * row / rows
        z = z_min + (z_max - z_min) * (v + 1.0) * 0.5
        width = 0.158 * (1.0 - 0.12 * abs(v) ** 2.2)
        for column in range(columns + 1):
            u = -1.0 + 2.0 * column / columns
            x = width * u
            y = -0.181 - outward + 0.027 * u * u + 0.014 * v * v
            vertices.append((x, y, z))
    faces: list[tuple[int, ...]] = []
    stride = columns + 1
    for row in range(rows):
        for column in range(columns):
            a = row * stride + column
            faces.append((a, a + 1, a + stride + 1, a + stride))
    result = mesh_object(
        name, parent, vertices, faces, material, role, part_id=part_id, cutaway=cutaway,
    )
    result["construction"] = "compound-curved replaceable visor"
    return result


def boot_sole(
    name: str,
    parent: bpy.types.Object,
    material: bpy.types.Material,
    role: str,
    *,
    depth: float,
    style: str | None = None,
) -> bpy.types.Object:
    """Create a slim, rounded foot-shaped outsole in shin-local coordinates."""
    heel_y = 0.095
    toe_y = -depth
    outline = (
        (-0.065, heel_y), (0.065, heel_y),
        (0.087, 0.058), (0.103, -0.045),
        (0.096, toe_y + 0.042), (0.054, toe_y),
        (0.0, toe_y - 0.010), (-0.054, toe_y),
        (-0.096, toe_y + 0.042), (-0.103, -0.045),
        (-0.087, 0.058),
    )
    lower = tuple((x, y, -0.444) for x, y in outline)
    upper = tuple(
        (x * 0.91, y * 0.965, -0.416 + 0.006 * max(0.0, (-y) / max(depth, 0.001)))
        for x, y in outline
    )
    vertices = list(lower + upper)
    count = len(outline)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + i for i in range(count)),
    ]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    result = mesh_object(name, parent, vertices, faces, material, role)
    bevel = result.modifiers.new("Rounded outsole edge", "BEVEL")
    bevel.width = 0.010
    bevel.segments = 4
    bevel.limit_method = "ANGLE"
    if style:
        result["bootStyle"] = style
    result["construction"] = "replaceable shaped outsole"
    return result


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
            # Blender's material inputs are linear values. These deliberately
            # deeper inputs render as a saturated signal orange instead of the
            # pale, skin-like peach produced by the previous palette.
            "shell": "#a51b03", "secondaryShell": "#14161a", "underlayer": "#08090b",
            "accent": "#bd520d", "metal": "#25282d", "dust": "#5b210e", "assist": "#38251e",
        },
        "vector": {
            "shell": "#171821", "secondaryShell": "#40364d", "underlayer": "#0a0b10",
            "accent": "#d9af5f", "metal": "#81785f", "dust": "#755d52", "assist": "#9c7e50",
        },
    }[concept]
    result = {}
    for role, color in palettes.items():
        is_metal = role in {"metal", "assist"}
        is_outer = role in {"shell", "secondaryShell"}
        result[role] = make_material(
            f"{concept}_{role}",
            color,
            metallic=0.68 if is_metal else 0.035,
            roughness=0.26 if is_metal else (0.38 if is_outer else 0.64),
            coat=0.22 if is_outer else (0.1 if is_metal else 0.0),
            coat_roughness=0.42 if is_outer else 0.24,
            sheen=0.16 if role in {"shell", "secondaryShell", "underlayer", "dust"} else 0.0,
        )
    result["seam"] = make_material(f"{concept}_seam", "#27313a" if concept != "vector" else "#a58ac0", roughness=0.78, sheen=0.12)
    result["sole"] = make_material(f"{concept}_sole", "#20252c" if concept != "vector" else "#0e1017", roughness=0.82)
    result["lining"] = make_material(f"{concept}_lining", "#323b45" if concept != "vector" else "#1a1823", roughness=0.9, sheen=0.2)
    result["webbing"] = make_material(
        f"{concept}_webbing",
        "#34404a" if concept == "selene" else ("#0b0d11" if concept == "areo" else "#24202e"),
        roughness=0.84,
        sheen=0.22,
    )
    result["fold"] = make_material(
        f"{concept}_fold",
        palettes["secondaryShell"] if concept in {"areo", "vector"} else palettes["shell"],
        roughness=0.58,
        sheen=0.24,
    )
    result["gasket"] = make_material(
        f"{concept}_gasket",
        "#1d252c" if concept != "vector" else "#17131e",
        roughness=0.72,
        sheen=0.08,
    )
    result["outerPanel"] = make_material(
        f"{concept}_outer_panel",
        "#741505" if concept == "areo" else palettes["secondaryShell"],
        roughness=0.48,
        coat=0.16,
        coat_roughness=0.48,
        sheen=0.22,
    )
    result["skin"] = make_material(f"{concept}_skin", "#9b6957", roughness=0.62)
    result["hair"] = make_material(f"{concept}_hair", "#2b2024", roughness=0.7)
    result["visor"] = make_material(
        f"{concept}_visor", "#79b9d0", metallic=0.02, roughness=0.045,
        alpha=0.24, transmission=0.62, coat=1.0, coat_roughness=0.035,
    )
    result["sunVisor"] = make_material(
        f"{concept}_sunVisor", "#c48e3d", metallic=0.32, roughness=0.11,
        alpha=0.52, transmission=0.18, coat=0.75, coat_roughness=0.08,
    )
    result["light"] = make_material(f"{concept}_light", "#a8f4ff", metallic=0.12, roughness=0.18,
                                    emission="#91efff", emission_strength=4.0)
    result["haptic"] = make_material(f"{concept}_haptic", "#f0a8dc", metallic=0.14, roughness=0.28,
                                     emission="#ee8ed2", emission_strength=1.2)
    return result


def build_concept(source_object: bpy.types.Object, concept: str, display_name: str) -> bpy.types.Object:
    materials = concept_materials(concept)
    source = source_object.data
    root = empty(
        f"CONCEPT_{display_name}",
        conceptVariant=concept,
        display_name=display_name,
        design_revision="softgoods-tailoring-v3",
        authored_in="Blender 5",
    )
    root["garment_class"] = (
        "surface EVA concept with pressure enclosure and life support"
        if concept != "vector"
        else "Earth mobility research garment; not a vacuum pressure suit"
    )
    root["reference_translation"] = (
        "original RIEVA geometry informed by general aviation soft-goods construction; "
        "no third-party model geometry or textures"
    )
    concept_proportions = {
        "selene": (0.99, 1.00, 1.00),
        "areo": (1.025, 1.035, 1.005),
        "vector": (0.965, 0.985, 1.015),
    }
    root.scale = concept_proportions[concept]
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

    # A pressure garment is visibly thicker than skin, but its silhouette still
    # follows the wearer. Conservative offsets avoid the inflated toy look of
    # the earlier build while leaving room for layered restraint panels.
    expansion = 0.010 if concept == "vector" else (0.019 if concept == "areo" else 0.017)
    shell_role = "underlayer" if concept == "vector" else "shell"
    shell_material = materials[shell_role]
    # MALTE's outer restraint panels remain orange so the pressure garment
    # reads as one continuous tailored suit. Graphite is reserved for actual
    # articulation zones, seals, hard interfaces and equipment.
    outer_panel_material = materials["outerPanel"] if concept == "areo" else materials["secondaryShell"]
    outer_panel_role = "shell" if concept == "areo" else "secondaryShell"
    fold_role = "underlayer" if concept == "areo" else shell_role

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
        lambda c: (
            0.93 <= c.z < 1.34 and abs(c.x) < 0.245 and
            (c.y < -0.052 or c.y > 0.038)
        ),
        parent=layer_group, pivot=Vector(), material=outer_panel_material, role=outer_panel_role,
        expansion=expansion + (0.010 if concept != "vector" else 0.005), cutaway=True,
    )

    lower_group = part(body, "lower-body", f"{display_name} lower body", explode=(0, 0.0, -0.06))
    mesh_from_source_region(
        source, f"{display_name}_pelvis_tailoring",
        lambda c: 0.70 <= c.z < 0.96 and abs(c.x) < 0.245,
        parent=lower_group, pivot=Vector(), material=outer_panel_material, role=outer_panel_role,
        expansion=expansion, cutaway=concept != "vector",
    )

    # Anatomical collar/yoke and waist transition hide region boundaries while
    # communicating a continuous sewn restraint architecture.
    mesh_from_source_region(
        source, f"{display_name}_contoured_shoulder_yoke",
        lambda c: 1.285 <= c.z < 1.395 and abs(c.x) < 0.285 and c.y < -0.015,
        parent=layer_group, pivot=Vector(), material=outer_panel_material, role=outer_panel_role,
        expansion=expansion + 0.014, cutaway=True,
    )
    mesh_from_source_region(
        source, f"{display_name}_flexible_waist_transition",
        lambda c: 0.835 <= c.z < 0.925 and abs(c.x) < 0.24,
        parent=lower_group, pivot=Vector(), material=materials["underlayer"], role="underlayer",
        expansion=expansion + 0.006, cutaway=True,
    )
    for side in (-1, 1):
        curve_tube(
            f"{display_name}_{'left' if side < 0 else 'right'}_princess_seam",
            layer_group,
            [
                (side * 0.105, -0.164, 0.96),
                (side * 0.125, -0.176, 1.10),
                (side * 0.145, -0.158, 1.25),
                (side * 0.185, -0.112, 1.35),
            ],
            materials["seam"], "seam", radius=0.0032,
        )
    curve_tube(
        f"{display_name}_sternum_pressure_zip_guard", layer_group,
        [(0, -0.177, 0.96), (0, -0.188, 1.16), (0, -0.151, 1.34)],
        materials["seam"], "seam", radius=0.0036,
    )

    # A visible restraint/load path makes the garment read as technical soft
    # goods rather than a painted body. These straps are original RIEVA
    # geometry; they borrow only the general aviation practice of routing a
    # harness from the shoulders into a waist load path.
    for side in (-1, 1):
        harness = front_ribbon(
            f"{display_name}_{'left' if side < 0 else 'right'}_restraint_harness",
            layer_group,
            [
                (side * 0.165, -0.157, 1.345),
                (side * 0.128, -0.194, 1.245),
                (side * 0.105, -0.207, 1.090),
                (side * 0.145, -0.184, 0.925),
            ],
            materials["webbing"], "underlayer", width=0.015 if concept == "areo" else 0.022,
            construction="woven restraint webbing over the pressure architecture",
        )
        harness["garment_function"] = "load-path restraint; not a pressure seal"
    waist_harness = front_ribbon(
        f"{display_name}_scalloped_waist_harness",
        layer_group,
        [
            (-0.190, -0.142, 0.940),
            (-0.100, -0.181, 0.918),
            (0.0, -0.194, 0.912),
            (0.100, -0.181, 0.918),
            (0.190, -0.142, 0.940),
        ],
        materials["webbing"], "underlayer", width=0.014 if concept == "areo" else 0.020, width_axis="z",
        construction="shaped waist load-distribution webbing",
    )
    waist_harness["garment_function"] = "restraint and equipment load distribution"

    # Compact front service manifold: an authored tapered shell with individual
    # connectors. It deliberately avoids copying any flight garment layout.
    manifold = lofted_round_rect(
        f"{display_name}_pressure_service_manifold", layer_group,
        [
            (1.090, 0.055, 0.009, 0.002),
            (1.112, 0.068, 0.014, 0.000),
            (1.198, 0.067, 0.015, 0.000),
            (1.220, 0.050, 0.009, 0.002),
        ],
        materials["metal"], "metal", y_center=-0.199,
    )
    manifold["garment_function"] = "conceptual suit service and sensor interface"
    for side, connector_z, connector_radius, connector_material, connector_role in (
        (-1, 1.150, 0.0125, materials["metal"], "metal"),
        (1, 1.174, 0.0105, materials["accent"], "accent"),
    ):
        connector = cylinder(
            f"{display_name}_{'left' if side < 0 else 'right'}_service_connector",
            layer_group,
            (side * 0.037, -0.217, connector_z),
            connector_radius,
            0.014,
            connector_material,
            connector_role,
            rotation=(math.pi / 2, 0, 0),
            vertices=24,
        )
        connector["garment_function"] = "conceptual keyed utility coupling"
    cylinder(
        f"{display_name}_service_status_window",
        layer_group,
        (0.010, -0.218, 1.198),
        0.0085,
        0.012,
        materials["visor"],
        "visor",
        rotation=(math.pi / 2, 0, 0),
        vertices=24,
    )

    # Low-relief quilt channels imply controlled ease and local padding. They
    # are intentionally sparse so they do not masquerade as a certified layer
    # recipe or add cartoon bulk.
    quilt_rows = () if concept == "areo" else (0.985, 1.025, 1.305)
    for row, z in enumerate(quilt_rows):
        quilt = curve_tube(
            f"{display_name}_torso_quilt_channel_{row}",
            layer_group,
            [(-0.155, -0.171, z), (0.0, -0.193, z - 0.006), (0.155, -0.171, z)],
            materials["fold"], fold_role, radius=0.0025,
            construction="low-relief soft-goods quilting channel",
        )
        quilt["softgoods_detail"] = "illustrative quilting / controlled-ease channel"

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
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_contoured_scye_bearing",
            lambda c, side=side: (
                side * c.x > 0.165 and side * c.x < 0.285 and
                1.235 <= c.z < 1.395
            ),
            parent=shoulder_part, pivot=shoulder,
            material=outer_panel_material if concept == "areo" else materials["secondaryShell"],
            role=outer_panel_role if concept == "areo" else "secondaryShell",
            expansion=expansion + 0.016, cutaway=True,
        )
        elbow_part = part(forearm, f"elbow-{suffix}", f"{display_name} {suffix} elbow", explode=(side * 0.045, 0, 0))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_forearm_anatomical",
            lambda c, side=side: side * c.x > 0.22 and 0.76 <= c.z < 1.09,
            parent=elbow_part, pivot=elbow, material=shell_material, role=shell_role,
            expansion=expansion, cutaway=concept != "vector",
        )
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_articulated_elbow_bellows",
            lambda c, side=side: side * c.x > 0.265 and 0.985 <= c.z < 1.105,
            parent=elbow_part, pivot=elbow,
            material=materials["underlayer"], role="underlayer",
            expansion=expansion + 0.011, cutaway=True,
        )
        glove_part = part(forearm, f"glove-{suffix}", f"{display_name} {suffix} glove", explode=(side * 0.055, -0.015, -0.02))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_articulated_glove",
            lambda c, side=side: side * c.x > 0.245 and c.z < 0.80 and c.z > 0.57,
            parent=glove_part, pivot=elbow, material=materials["underlayer"], role="underlayer",
            expansion=0.007 if concept == "areo" else 0.012,
        )
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_glove_metacarpal_guard",
            lambda c, side=side: (
                side * c.x > 0.34 and 0.60 < c.z < 0.755 and c.y < -0.018
            ),
            parent=glove_part, pivot=elbow,
            material=materials["secondaryShell"], role="secondaryShell",
            expansion=0.011 if concept == "areo" else 0.020, cutaway=True,
        )
        wrist_part = part(forearm, f"wrist-ring-{suffix}", f"{display_name} {suffix} wrist interface", explode=(side * 0.04, 0, 0))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_anatomical_wrist_interface",
            lambda c, side=side: side * c.x > 0.31 and 0.72 <= c.z < 0.805,
            parent=wrist_part, pivot=elbow,
            material=materials["metal"], role="metal",
            expansion=0.020, cutaway=True,
        )
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_soft_wrist_gasket",
            lambda c, side=side: side * c.x > 0.30 and 0.755 <= c.z < 0.825,
            parent=wrist_part, pivot=elbow,
            material=materials["gasket"], role="underlayer",
            expansion=0.013, cutaway=True,
        )

        # Soft folds sit on the joint-facing forearm rather than forming a hard
        # mechanical ring. Their asymmetry keeps the cloth from reading as a
        # stack of primitives while preserving the existing animation pivot.
        for fold_index, (fold_z, fold_x) in enumerate(((1.035, 0.310), (1.008, 0.321), (0.980, 0.331))):
            center_x = side * fold_x
            curve_tube_world(
                f"{display_name}_{suffix}_elbow_ease_fold_{fold_index}",
                elbow_part,
                [
                    (center_x - side * 0.040, -0.052, fold_z - 0.011),
                    (center_x, -0.075 - fold_index * 0.002, fold_z),
                    (center_x + side * 0.038, -0.050, fold_z + 0.010),
                ],
                elbow,
                materials["fold"],
                fold_role,
                radius=0.0038,
                construction="controlled-ease pressure-garment fold",
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
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_anatomical_knee_bellows",
            lambda c, side=side: side * c.x > 0.025 and 0.405 <= c.z < 0.525,
            parent=knee_part, pivot=knee,
            material=materials["underlayer"], role="underlayer",
            expansion=expansion + 0.010, cutaway=True,
        )
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_floating_knee_guard",
            lambda c, side=side: (
                side * c.x > 0.035 and 0.425 <= c.z < 0.515 and c.y < -0.012
            ),
            parent=knee_part, pivot=knee,
            material=materials["secondaryShell"], role="secondaryShell",
            expansion=expansion + 0.026, cutaway=True,
        )
        boot_part = part(shin, f"boot-{suffix}", f"{display_name} {suffix} terrain boot", explode=(side * 0.035, -0.04, -0.035))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_foot_last",
            lambda c, side=side: side * c.x > 0.006 and c.z < 0.16,
            parent=boot_part, pivot=knee, material=materials["underlayer"], role="underlayer",
            expansion=0.025 if concept != "vector" else 0.012,
        )
        # Keep the articulated human foot last visible instead of covering it
        # with a primitive-looking toe block.  The shaped outsole below and the
        # contoured gaiter provide replaceable protection without sacrificing
        # the recognisable boot silhouette.
        gaiter_part = part(shin, f"dust-gaiter-{suffix}", f"{display_name} {suffix} dust gaiter", explode=(side * 0.04, 0, -0.025))
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_contoured_dust_gaiter",
            lambda c, side=side: side * c.x > 0.018 and 0.115 <= c.z < 0.205,
            parent=gaiter_part, pivot=knee,
            material=materials["dust"], role="dust",
            expansion=0.035 if concept != "vector" else 0.019, cutaway=True,
        )
        mesh_from_source_region(
            source, f"{display_name}_{suffix}_body_contoured_boot_vamp",
            lambda c, side=side: side * c.x > 0.008 and c.z < 0.135 and c.y < -0.030,
            parent=boot_part, pivot=knee,
            material=materials["secondaryShell"], role="secondaryShell",
            expansion=0.032 if concept != "vector" else 0.019, cutaway=True,
        )
        for fold_index, fold_z in enumerate((0.492, 0.455)):
            curve_tube_world(
                f"{display_name}_{suffix}_knee_ease_fold_{fold_index}",
                knee_part,
                [
                    (side * 0.058, -0.062, fold_z),
                    (side * 0.105, -0.103 - fold_index * 0.002, fold_z - 0.006),
                    (side * 0.151, -0.060, fold_z + 0.002),
                ],
                knee,
                materials["fold"],
                fold_role,
                radius=0.0024,
                construction="controlled-ease knee fold",
            )
        for closure_index, closure_z in enumerate((0.112,)):
            curve_tube_world(
                f"{display_name}_{suffix}_boot_vamp_closure_{closure_index}",
                boot_part,
                [
                    (side * 0.066, -0.135, closure_z),
                    (side * 0.105, -0.164, closure_z + 0.004),
                    (side * 0.144, -0.135, closure_z),
                ],
                knee,
                materials["webbing"],
                "underlayer",
                radius=0.0028,
                construction="low-profile replaceable boot closure webbing",
            )

    # A real human face from the CC0 base mesh remains visible behind the visor,
    # and is fully exposed on BASTIAN, which is explicitly not an EVA system.
    head_skin = mesh_from_source_region(
        source, f"{display_name}_human_head",
        lambda c: c.z >= 1.35,
        parent=body, pivot=Vector(), material=materials["skin"], role="skin",
    )
    head_skin["human_base"] = "Blender Studio Human Base Meshes v1.4.1 (CC0)"
    hair = mesh_from_source_region(
        source, f"{display_name}_anatomical_hair_cap",
        lambda c: c.z > 1.595 or (c.z > 1.505 and c.y > 0.025),
        parent=body, pivot=Vector(), material=materials["hair"], role="hair",
        expansion=0.004,
    )
    hair["construction"] = "head-conforming cropped hair cap"

    if concept != "vector":
        helmet = empty(f"{display_name}_HELMET_ASSEMBLY", body, helmet_assembly=True)
        shell_part = part(helmet, "helmet-pressure-shell", f"{display_name} pressure helmet", explode=(0, 0.02, 0.12))
        helmet_dome(
            f"{display_name}_faceted_pressure_shell", shell_part,
            materials["shell"], "shell", cutaway=True,
        )
        visor_part = part(helmet, "helmet-visor", f"{display_name} protective visor", explode=(0, -0.08, 0.1))
        curved_visor(
            f"{display_name}_compound_curved_primary_visor", visor_part,
            materials["visor"], "visor", z_min=1.415, z_max=1.690,
            outward=0.016, cutaway=True,
        )
        # One continuous rounded frame avoids the square, assembled appearance
        # of four independent seal strips while keeping the visor detachable.
        visor_outline = [
            (-0.100, -0.194, 1.695),
            (0.000, -0.210, 1.710),
            (0.100, -0.194, 1.695),
            (0.151, -0.196, 1.630),
            (0.158, -0.198, 1.530),
            (0.145, -0.192, 1.435),
            (0.000, -0.210, 1.405),
            (-0.145, -0.192, 1.435),
            (-0.158, -0.198, 1.530),
            (-0.151, -0.196, 1.630),
        ]
        rim = curve_tube(
            f"{display_name}_rounded_visor_retention_frame",
            visor_part,
            visor_outline,
            materials["metal"],
            "metal",
            radius=0.0052,
            cyclic=True,
            construction="continuous rounded visor-retention frame",
        )
        rim["qualification_note"] = "illustrative geometry; pressure retention requires verified hardware"
        gasket = curve_tube(
            f"{display_name}_continuous_secondary_visor_gasket",
            visor_part,
            [(x, y + 0.008, z) for x, y, z in visor_outline],
            materials["gasket"],
            "underlayer",
            radius=0.0032,
            cyclic=True,
            construction="continuous elastomeric visor-gasket concept",
        )
        gasket["qualification_note"] = "geometry is illustrative; sealing requires tested hardware"
        sun_part = part(helmet, "helmet-sun-visor", f"{display_name} sun visor", explode=(0, -0.1, 0.13))
        curved_visor(
            f"{display_name}_retractable_sun_visor", sun_part,
            materials["sunVisor"], "sunVisor", z_min=1.545, z_max=1.688,
            outward=0.025,
        )
        neck_part = part(helmet, "helmet-neck-ring", f"{display_name} neck interface", explode=(0, 0, -0.05))
        mesh_from_source_region(
            source, f"{display_name}_body_contoured_neck_interface",
            lambda c: 1.335 <= c.z < 1.415 and abs(c.x) < 0.19,
            parent=neck_part, pivot=Vector(), material=materials["metal"], role="metal",
            expansion=0.035, cutaway=True,
        )
        lights_part = part(helmet, "helmet-lights", f"{display_name} helmet lighting", explode=(0, -0.05, 0.08))
        for side in (-1, 1):
            cylinder(
                f"{display_name}_{'left' if side < 0 else 'right'}_helmet_light", lights_part,
                (side * 0.166, -0.194, 1.575), 0.014, 0.018, materials["light"], "light",
                rotation=(math.pi / 2, 0, 0),
            )
        ears = part(helmet, "helmet-cat-ear-pods", f"{display_name} cat-ear antenna pods", explode=(0, 0, 0.16))
        rail = curve_tube(
            f"{display_name}_external_crown_equipment_rail",
            ears,
            [
                (-0.154, 0.032, 1.708),
                (-0.112, 0.068, 1.750),
                (0.0, 0.083, 1.776),
                (0.112, 0.068, 1.750),
                (0.154, 0.032, 1.708),
            ],
            materials["metal"], "metal", radius=0.008,
            construction="external non-penetrating equipment rail",
        )
        rail["integration_note"] = "outside pressure shell; clearance, RF, thermal and snag testing required"
        for side in (-1, 1):
            curve_tube(
                f"{display_name}_{'left' if side < 0 else 'right'}_pod_rail_saddle",
                ears,
                [
                    (side * 0.154, 0.032, 1.708),
                    (side * 0.154, 0.024, 1.745),
                    (side * 0.143, 0.015, 1.770),
                ],
                materials["metal"], "metal", radius=0.009,
                construction="non-penetrating pod saddle",
            )
            pod = uv_sphere(
                f"{display_name}_{'left' if side < 0 else 'right'}_rounded_antenna_pod", ears,
                (side * 0.145, 0.010, 1.782), (0.031, 0.037, 0.047),
                materials["secondaryShell"], "secondaryShell", segments=28, rings=16,
            )
            pod.rotation_euler.y = side * -0.22
            cylinder(
                f"{display_name}_{'left' if side < 0 else 'right'}_pod_light", ears,
                (side * 0.151, -0.050, 1.813), 0.010, 0.016, materials["light"], "light",
                rotation=(math.pi / 2, 0, 0), vertices=20,
            )

        backpack = part(body, "backpack", f"{display_name} portable life support", explode=(0, 0.14, 0.02))
        pack_shell = lofted_round_rect(
            f"{display_name}_integrated_life_support_shell", backpack,
            [
                (0.795, 0.150, 0.050, -0.010),
                (0.855, 0.205, 0.076, 0.000),
                (1.070, 0.235, 0.095, 0.014),
                (1.285, 0.215, 0.082, 0.006),
                (1.370, 0.145, 0.052, -0.004),
            ],
            materials["secondaryShell"], "secondaryShell", y_center=0.185,
        )
        pack_shell["integration"] = "load-spreading torso yoke; conceptual packaging"
        for side in (-1, 1):
            canister = lofted_round_rect(
                f"{display_name}_{'left' if side < 0 else 'right'}_faceted_service_canister",
                backpack,
                [
                    (0.925, 0.047, 0.036, -0.006),
                    (0.960, 0.057, 0.046, 0.000),
                    (1.245, 0.057, 0.046, 0.000),
                    (1.285, 0.046, 0.035, -0.006),
                ],
                materials["metal"], "metal", y_center=0.300,
            )
            canister.location.x = side * 0.132
            curve_tube(
                f"{display_name}_{'left' if side < 0 else 'right'}_load_yoke",
                backpack,
                [
                    (side * 0.19, 0.105, 1.34),
                    (side * 0.23, 0.145, 1.23),
                    (side * 0.205, 0.175, 1.05),
                    (side * 0.17, 0.160, 0.88),
                ],
                materials["underlayer"], "underlayer", radius=0.018,
            )
        for z in (0.88, 1.05, 1.24):
            rounded_box(
                f"{display_name}_backpack_vent_{z}", backpack, (0, 0.294, z),
                (0.105, 0.009, 0.010), materials["underlayer"], "underlayer", bevel=0.006,
            )
        curve_tube(
            f"{display_name}_cooling_return_hose", backpack,
            [(0.16, 0.25, 1.26), (0.27, 0.08, 1.28), (0.19, -0.02, 1.34)],
            materials["accent"], "accent", radius=0.012,
        )
        for side in (-1, 1):
            service_hose = curve_tube(
                f"{display_name}_{'left' if side < 0 else 'right'}_braided_service_hose",
                backpack,
                [
                    (side * 0.125, 0.275, 1.225),
                    (side * 0.245, 0.125, 1.285),
                    (side * 0.225, -0.035, 1.270),
                    (side * 0.145, -0.150, 1.205),
                    (side * 0.048, -0.218, 1.165),
                ],
                materials["gasket" if side < 0 else "accent"],
                "underlayer" if side < 0 else "accent",
                radius=0.0085,
                construction="flexible suit-service hose with strain-relief routing",
            )
            service_hose["integration_note"] = "conceptual routing; bend radius and snag hazards require testing"

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
        panel_uses_outer_shell = concept == "areo" and material_key == "secondaryShell"
        panel = mesh_from_source_region(
            source,
            f"{display_name}_{style}_body_contoured_torso_panel",
            lambda c, z_min=z_min, z_max=z_max, x_limit=x_limit:
                z_min <= c.z <= z_max and abs(c.x) <= x_limit and c.y < -0.055,
            parent=layer_group,
            pivot=Vector(),
            material=outer_panel_material if panel_uses_outer_shell else materials[material_key],
            role="shell" if panel_uses_outer_shell else material_key,
            expansion=extra,
            cutaway=True,
        )
        panel["torsoStyle"] = style
        panel["cutawaySurface"] = True
        if style == "adaptive":
            for band in range(4):
                half_width = 0.17 - band * 0.012
                line = curve_tube(
                    f"{display_name}_adaptive_band_{band}", layer_group,
                    [
                        (-half_width, -0.175 + band * 0.004, 1.05 + band * 0.08),
                        (0, -0.192 + band * 0.003, 1.045 + band * 0.08),
                        (half_width, -0.175 + band * 0.004, 1.05 + band * 0.08),
                    ],
                    materials["accent"], "accent", radius=0.0045,
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
                material=outer_panel_material if concept == "areo" else materials["secondaryShell"],
                role="shell" if concept == "areo" else "secondaryShell",
                expansion=expansion + 0.018,
                cutaway=True,
            )
            panel["pantsStyle"] = style

    for style, tread_depth in (("traverse", 0.185), ("rock", 0.198), ("stability", 0.212)):
        for side, shin in ((-1, shin_r), (1, shin_l)):
            sole = boot_sole(
                f"{display_name}_{style}_{'left' if side < 0 else 'right'}_sole",
                shin, materials["sole"], "underlayer", depth=tread_depth, style=style,
            )
            tread_width = 0.068 if style == "traverse" else (0.056 if style == "rock" else 0.082)
            for lug_index, y in enumerate((-0.145, -0.088, -0.028, 0.035)):
                lug = rounded_box(
                    f"{display_name}_{style}_{'left' if side < 0 else 'right'}_tread_lug_{lug_index}",
                    shin,
                    (0, y, -0.451),
                    (tread_width, 0.013 if style != "stability" else 0.016, 0.006),
                    materials["sole"],
                    "underlayer",
                    rotation=(0, 0, (0.11 if lug_index % 2 else -0.11) if style == "rock" else 0),
                    bevel=0.004,
                )
                lug["bootStyle"] = style
                lug["construction"] = "replaceable outsole traction lug concept"

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
    uv_sphere(
        f"{display_name}_flush_biometric_patch", monitoring,
        (-0.115, -0.173, 1.225), (0.034, 0.009, 0.047),
        materials["light"], "light", segments=32, rings=18,
    )

    # Strong concept-specific visual language beyond palette changes.
    if concept == "selene":
        for side in (-1, 1):
            mesh_from_source_region(
                source,
                f"MAX_{'left' if side < 0 else 'right'}_body_contoured_lunar_clavicle",
                lambda c, side=side: (
                    side * c.x > 0.045 and side * c.x < 0.235 and
                    1.275 <= c.z < 1.385 and c.y < -0.035
                ),
                parent=layer_group,
                pivot=Vector(),
                material=materials["shell"],
                role="shell",
                expansion=expansion + 0.032,
                cutaway=True,
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
        for band in range(1):
            z = 1.02 + band * 0.062
            curve_tube(
                f"MALTE_geology_lamella_{band}", layer_group,
                [(-0.17 + band * 0.008, -0.182, z), (0.0, -0.201, z + 0.008), (0.16, -0.174, z + 0.022)],
                materials["dust" if band % 2 else "secondaryShell"],
                "dust" if band % 2 else "secondaryShell", radius=0.0032,
            )
        mesh_from_source_region(
            source, "MALTE_body_contoured_asymmetric_geology_pocket",
            lambda c: 0.07 < c.x < 0.225 and 0.97 < c.z < 1.17 and c.y < -0.04,
            parent=layer_group, pivot=Vector(), material=materials["dust"], role="dust",
            expansion=expansion + 0.036, cutaway=True,
        )
    else:
        recovery_yoke = curve_tube(
            "BASTIAN_earth_training_recovery_yoke",
            layer_group,
            [
                (-0.205, -0.018, 1.315),
                (-0.150, -0.102, 1.375),
                (0.0, -0.126, 1.405),
                (0.150, -0.102, 1.375),
                (0.205, -0.018, 1.315),
            ],
            materials["secondaryShell"], "secondaryShell", radius=0.022,
            construction="soft Earth-training recovery / harness yoke concept",
        )
        recovery_yoke["qualification_note"] = (
            "not a life preserver, pressure enclosure, or certified launch/entry garment"
        )
        for side in (-1, 1):
            curve_tube(
                f"BASTIAN_{'left' if side < 0 else 'right'}_kinetic_load_path", body,
                [(side * 0.16, -0.152, 1.33), (side * 0.11, -0.175, 1.02), (side * 0.14, -0.145, 0.76)],
                materials["accent"], "accent", radius=0.0055, part_id="vector-monitoring",
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
        # The external communication/light pods remain available in the live
        # configurator, but the neutral product view presents the base helmet.
        "helmet-cat-ear-pods",
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
    scene.view_settings.exposure = -0.88
    scene.view_settings.look = "Medium High Contrast"
    bpy.ops.render.render(write_still=True)

    three_quarter = preview_path.with_name(f"{preview_path.stem}-three-quarter{preview_path.suffix}")
    camera.location = (4.65, -6.15, 1.18)
    look_at(camera, Vector((0, 0, 0.90)))
    scene.render.filepath = str(three_quarter)
    bpy.ops.render.render(write_still=True)

    rear = preview_path.with_name(f"{preview_path.stem}-rear{preview_path.suffix}")
    camera.location = (4.8, 5.95, 1.15)
    look_at(camera, Vector((0, 0, 0.92)))
    scene.render.filepath = str(rear)
    bpy.ops.render.render(write_still=True)
    print(f"RIEVA_PREVIEW_THREE_QUARTER={three_quarter}")
    print(f"RIEVA_PREVIEW_REAR={rear}")


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
