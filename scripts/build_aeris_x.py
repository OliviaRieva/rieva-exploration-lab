#!/usr/bin/env python3
"""Build the original RIEVA AERIS-X browser aircraft in Blender.

Run this script with Blender, not CPython:

    blender -b -P scripts/build_aeris_x.py -- \
      --reference "/tmp/x59-No Stand.STL" \
      --out public/models/rieva-aeris-x.glb \
      --blend /tmp/rieva-aeris-x.blend \
      --preview /tmp/rieva-aeris-x.png

The optional NASA X-59 STL is used only to record a real-aircraft dimensional
reference.  The export is rebuilt as an original, unarmed cranked-delta
research demonstrator with its own planform, twin embedded propulsion system,
materials, interaction hierarchy, and configurable research modules.

Coordinate contract after glTF export (``export_yup=True``):
    +X right wing, +Y up, -Z nose/forward.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector


NASA_REFERENCE_URL = (
    "https://www.nasa.gov/wp-content/uploads/2023/06/x59-no-stand.zip"
)


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--reference")
    parser.add_argument("--blend")
    parser.add_argument("--preview")
    return parser.parse_args(arguments)


def rgba(value: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)) + (alpha,)


def material(
    name: str,
    color: str,
    *,
    metallic: float = 0.0,
    roughness: float = 0.4,
    alpha: float = 1.0,
    transmission: float = 0.0,
    emission: str | None = None,
    emission_strength: float = 0.0,
    coat_weight: float = 0.0,
    coat_roughness: float = 0.12,
    ior: float = 1.45,
    anisotropy: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(color, alpha)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = rgba(color, alpha)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Alpha"].default_value = alpha
        if "Coat Weight" in shader.inputs:
            shader.inputs["Coat Weight"].default_value = coat_weight
        if "Coat Roughness" in shader.inputs:
            shader.inputs["Coat Roughness"].default_value = coat_roughness
        if "IOR" in shader.inputs:
            shader.inputs["IOR"].default_value = ior
        if "Anisotropic IOR Level" in shader.inputs:
            shader.inputs["Anisotropic IOR Level"].default_value = anisotropy
        elif "Anisotropic" in shader.inputs:
            shader.inputs["Anisotropic"].default_value = anisotropy
        if "Transmission Weight" in shader.inputs:
            shader.inputs["Transmission Weight"].default_value = transmission
        if emission and "Emission Color" in shader.inputs:
            shader.inputs["Emission Color"].default_value = rgba(emission)
            shader.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        mat.surface_render_method = "DITHERED"
        mat.use_transparency_overlap = False
    return mat


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def tag(obj: bpy.types.Object, **values: object) -> bpy.types.Object:
    for key, value in values.items():
        if value is not None:
            obj[key] = value
    return obj


def empty(
    name: str,
    parent: bpy.types.Object | None = None,
    *,
    location: Sequence[float] = (0.0, 0.0, 0.0),
    **values: object,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.25
    if parent:
        obj.parent = parent
    return tag(obj, **values)


def mesh_object(
    name: str,
    vertices: Sequence[Sequence[float]],
    faces: Sequence[Sequence[int]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    smooth: bool = True,
    bevel: float = 0.0,
    **values: object,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    if bevel > 0:
        modifier = obj.modifiers.new("Manufactured edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
    return tag(obj, **values)


def mirrored_name(side: int) -> str:
    return "L" if side < 0 else "R"


def reference_metrics(reference_path: str | None) -> dict[str, object]:
    """Import the official educational STL, measure it, then remove it.

    This deliberately does not pass NASA geometry through to the output: the
    public-domain model is a dimensional/silhouette reference, while AERIS-X
    is authored as a separate topology and concept.
    """

    metrics: dict[str, object] = {
        "source": "NASA ARMD X-59 3D-print model",
        "url": NASA_REFERENCE_URL,
        "license_note": "NASA resource described as free and without copyright",
        "used": False,
    }
    if not reference_path:
        return metrics
    path = Path(reference_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Reference mesh not found: {path}")
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]
    if not imported:
        raise RuntimeError(f"No mesh imported from {path}")
    all_points: list[Vector] = []
    for obj in imported:
        all_points.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
    mins = [min(point[i] for point in all_points) for i in range(3)]
    maxs = [max(point[i] for point in all_points) for i in range(3)]
    dims = [maxs[i] - mins[i] for i in range(3)]
    ordered = sorted(dims, reverse=True)
    metrics.update(
        {
            "used": True,
            "file": path.name,
            "source_dimensions": [round(value, 4) for value in dims],
            "source_length_to_span": round(ordered[0] / ordered[1], 4),
            "source_vertices": sum(len(obj.data.vertices) for obj in imported),
        }
    )
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    return metrics


def loft_surface(
    name: str,
    stations: Sequence[tuple[float, float, float, float]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    segments: int = 40,
    superellipse: float = 0.78,
    chine: float = 0.0,
    **values: object,
) -> bpy.types.Object:
    """Create a closed, non-primitive aerodynamic loft along Blender +Y."""

    vertices: list[tuple[float, float, float]] = []
    for y, half_width, half_height, center_z in stations:
        for index in range(segments):
            angle = 2 * math.pi * index / segments
            cosine = math.cos(angle)
            sine = math.sin(angle)
            x = math.copysign(abs(cosine) ** superellipse, cosine) * half_width
            z_shape = math.copysign(abs(sine) ** 0.9, sine)
            # A narrower crown and a subtle lower keel form a plausible chine.
            crown = 1.0 - chine * max(sine, 0.0) * 0.22
            keel = -chine * max(-sine, 0.0) * 0.08 * half_height
            vertices.append((x * crown, y, center_z + half_height * z_shape + keel))
    faces: list[tuple[int, ...]] = []
    for station in range(len(stations) - 1):
        start = station * segments
        nxt = (station + 1) * segments
        for index in range(segments):
            following = (index + 1) % segments
            faces.append((start + index, start + following, nxt + following, nxt + index))
    front_center = len(vertices)
    first = stations[0]
    vertices.append((0.0, first[0], first[3]))
    back_center = len(vertices)
    last = stations[-1]
    vertices.append((0.0, last[0], last[3]))
    for index in range(segments):
        following = (index + 1) % segments
        faces.append((front_center, following, index))
        base = (len(stations) - 1) * segments
        faces.append((back_center, base + index, base + following))
    return mesh_object(name, vertices, faces, mat, parent, **values)


def offset_loft_surface(
    name: str,
    center_x: float,
    stations: Sequence[tuple[float, float, float, float]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    **values: object,
) -> bpy.types.Object:
    obj = loft_surface(name, stations, mat, parent, **values)
    obj.location.x = center_x
    return obj


def naca_thickness(chord_fraction: float, ratio: float) -> float:
    x = max(0.0, min(1.0, chord_fraction))
    return 5 * ratio * (
        0.2969 * math.sqrt(max(x, 1e-8))
        - 0.1260 * x
        - 0.3516 * x * x
        + 0.2843 * x**3
        - 0.1036 * x**4
    )


def wing_surface(
    name: str,
    side: int,
    span_stations: Sequence[tuple[float, float, float, float]],
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    chord_steps: int = 24,
    z_base: float = 0.02,
    **values: object,
) -> bpy.types.Object:
    """Create a true airfoil loft from cranked planform stations."""

    vertices: list[tuple[float, float, float]] = []
    for span, leading_y, trailing_y, thickness_ratio in span_stations:
        chord = leading_y - trailing_y
        for surface_sign in (1.0, -1.0):
            for step in range(chord_steps + 1):
                fraction = step / chord_steps
                y = leading_y - fraction * chord
                camber = 0.018 * chord * math.sin(math.pi * fraction)
                thickness = naca_thickness(fraction, thickness_ratio) * chord
                z = z_base + camber + surface_sign * thickness
                vertices.append((side * span, y, z))
    ring = chord_steps + 1
    section_size = ring * 2
    faces: list[tuple[int, ...]] = []
    for station in range(len(span_stations) - 1):
        base = station * section_size
        nxt = (station + 1) * section_size
        for surface in range(2):
            offset = surface * ring
            for step in range(chord_steps):
                if surface == 0:
                    faces.append(
                        (
                            base + offset + step,
                            nxt + offset + step,
                            nxt + offset + step + 1,
                            base + offset + step + 1,
                        )
                    )
                else:
                    faces.append(
                        (
                            base + offset + step,
                            base + offset + step + 1,
                            nxt + offset + step + 1,
                            nxt + offset + step,
                        )
                    )
        # Leading and trailing edges.
        faces.append((base, base + ring, nxt + ring, nxt))
        faces.append(
            (
                base + ring - 1,
                nxt + ring - 1,
                nxt + section_size - 1,
                base + section_size - 1,
            )
        )
    # Root and tip close-out surfaces.
    for station in (0, len(span_stations) - 1):
        base = station * section_size
        for step in range(chord_steps):
            if station == 0:
                faces.append((base + step, base + step + 1, base + ring + step + 1, base + ring + step))
            else:
                faces.append((base + step, base + ring + step, base + ring + step + 1, base + step + 1))
    return mesh_object(name, vertices, faces, mat, parent, **values)


def extruded_polygon(
    name: str,
    footprint: Sequence[tuple[float, float]],
    z_center: float,
    thickness: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    bevel: float = 0.0,
    **values: object,
) -> bpy.types.Object:
    count = len(footprint)
    vertices = [(x, y, z_center + thickness / 2) for x, y in footprint]
    vertices += [(x, y, z_center - thickness / 2) for x, y in footprint]
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    return mesh_object(name, vertices, faces, mat, parent, bevel=bevel, **values)


def ribbon(
    name: str,
    start: tuple[float, float],
    end: tuple[float, float],
    width: float,
    z: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    **values: object,
) -> bpy.types.Object:
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    length = math.hypot(dx, dy) or 1.0
    px, py = -dy / length * width / 2, dx / length * width / 2
    footprint = [
        (sx + px, sy + py),
        (ex + px, ey + py),
        (ex - px, ey - py),
        (sx - px, sy - py),
    ]
    return extruded_polygon(name, footprint, z, 0.012, mat, parent, **values)


def swept_rectangular_path(
    name: str,
    points: Sequence[Sequence[float]],
    width: float,
    depth: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    bevel: float = 0.0,
    **values: object,
) -> bpy.types.Object:
    """Sweep a compact rectangular section along an authored 3D path.

    This is used for canopy bows, panel seams and structural edge caps.  It
    avoids primitive rods and gives the paths planar highlights at browser
    scale.
    """

    centers = [Vector(point) for point in points]
    if len(centers) < 2:
        raise ValueError("A swept path needs at least two points")
    vertices: list[tuple[float, float, float]] = []
    for index, center in enumerate(centers):
        if index == 0:
            tangent = centers[1] - center
        elif index == len(centers) - 1:
            tangent = center - centers[index - 1]
        else:
            tangent = centers[index + 1] - centers[index - 1]
        tangent.normalize()
        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.92:
            reference = Vector((1.0, 0.0, 0.0))
        lateral = tangent.cross(reference).normalized()
        normal = lateral.cross(tangent).normalized()
        for lateral_sign, normal_sign in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            point = center + lateral * lateral_sign * width / 2 + normal * normal_sign * depth / 2
            vertices.append(tuple(point))
    faces: list[tuple[int, ...]] = []
    for section in range(len(centers) - 1):
        start = section * 4
        nxt = (section + 1) * 4
        for corner in range(4):
            following = (corner + 1) % 4
            faces.append((start + corner, start + following, nxt + following, nxt + corner))
    faces.extend([(0, 3, 2, 1), tuple(range((len(centers) - 1) * 4, len(centers) * 4))])
    return mesh_object(name, vertices, faces, mat, parent, bevel=bevel, **values)


def loft_patch(
    name: str,
    center_x: float,
    stations: Sequence[tuple[float, float, float, float]],
    angle_start: float,
    angle_end: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    arc_steps: int = 20,
    **values: object,
) -> bpy.types.Object:
    """Create an open aerodynamic shell patch over part of a loft."""

    vertices: list[tuple[float, float, float]] = []
    for y, half_width, half_height, center_z in stations:
        for step in range(arc_steps + 1):
            theta = angle_start + (angle_end - angle_start) * step / arc_steps
            vertices.append(
                (
                    center_x + half_width * math.cos(theta),
                    y,
                    center_z + half_height * math.sin(theta),
                )
            )
    ring = arc_steps + 1
    faces: list[tuple[int, ...]] = []
    for station in range(len(stations) - 1):
        a = station * ring
        b = (station + 1) * ring
        for step in range(arc_steps):
            faces.append((a + step, a + step + 1, b + step + 1, b + step))
    return mesh_object(name, vertices, faces, mat, parent, **values)


def annular_face(
    name: str,
    center_x: float,
    y: float,
    outer_radius: float,
    inner_radius: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    segments: int = 40,
    z_scale: float = 0.92,
    **values: object,
) -> bpy.types.Object:
    """A modeled annulus for engine lips, stator rings and exhaust throats."""

    vertices: list[tuple[float, float, float]] = []
    for radius in (outer_radius, inner_radius):
        for index in range(segments):
            theta = 2 * math.pi * index / segments
            vertices.append((center_x + radius * math.cos(theta), y, radius * z_scale * math.sin(theta)))
    faces: list[tuple[int, ...]] = []
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((index, nxt, segments + nxt, segments + index))
    return mesh_object(name, vertices, faces, mat, parent, **values)


def fin_surface(
    name: str,
    side: int,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    **values: object,
) -> bpy.types.Object:
    # Polygon is authored in longitudinal/vertical space; the upper fin is
    # canted outward to avoid the toy-like slab look of a primitive.
    profile = [
        (-1.58, 0.27, 0.105),
        (-2.62, 1.66, 0.054),
        (-2.98, 1.96, 0.038),
        (-3.38, 1.94, 0.035),
        (-3.82, 1.65, 0.046),
        (-4.64, 0.27, 0.090),
    ]
    base_x = side * 0.78
    vertices: list[tuple[float, float, float]] = []
    for face_sign in (1.0, -1.0):
        for y, z, half_thickness in profile:
            cant = side * z * 0.27
            vertices.append((base_x + cant + face_sign * half_thickness, y, z))
    count = len(profile)
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    return mesh_object(name, vertices, faces, mat, parent, bevel=0.024, **values)


def section_loop(
    center_x: float,
    y: float,
    center_z: float,
    half_width: float,
    half_height: float,
    segments: int,
    *,
    side: int,
    d_shape: float = 0.22,
) -> list[tuple[float, float, float]]:
    points: list[tuple[float, float, float]] = []
    for index in range(segments):
        angle = 2 * math.pi * index / segments
        cosine, sine = math.cos(angle), math.sin(angle)
        x = center_x + half_width * math.copysign(abs(cosine) ** 0.74, cosine)
        z = center_z + half_height * math.copysign(abs(sine) ** 0.84, sine)
        # Flatten the inboard wall into a diverterless D-shaped inlet.
        inboard = (x < center_x) if side > 0 else (x > center_x)
        if inboard:
            x = center_x + (x - center_x) * (1.0 - d_shape)
        points.append((x, y, z))
    return points


def intake_assembly(
    side: int,
    mats: dict[str, bpy.types.Material],
    parent: bpy.types.Object,
) -> None:
    label = mirrored_name(side)
    group = empty(
        f"PART_INTAKE_{label}",
        parent,
        part_id=f"intake-{'left' if side < 0 else 'right'}",
        system_id="propulsion-air-path",
        interaction="selectable",
    )
    segments = 32
    center_x = side * 1.04
    outer_front = section_loop(center_x, 1.67, 0.04, 0.41, 0.46, segments, side=side)
    outer_back = section_loop(center_x, 1.52, 0.04, 0.38, 0.42, segments, side=side)
    inner_front = section_loop(center_x, 1.66, 0.04, 0.315, 0.355, segments, side=side)
    inner_back = section_loop(center_x, 1.48, 0.04, 0.30, 0.34, segments, side=side)
    vertices = outer_front + outer_back + inner_front + inner_back
    faces: list[tuple[int, ...]] = []
    for index in range(segments):
        nxt = (index + 1) % segments
        # External lip, front annulus, and inner throat.
        faces.append((index, nxt, segments + nxt, segments + index))
        faces.append((index, 2 * segments + index, 2 * segments + nxt, nxt))
        faces.append(
            (
                2 * segments + index,
                3 * segments + index,
                3 * segments + nxt,
                2 * segments + nxt,
            )
        )
        faces.append(
            (
                segments + index,
                segments + nxt,
                3 * segments + nxt,
                3 * segments + index,
            )
        )
    mesh_object(
        f"INTAKE_LIP_{label}",
        vertices,
        faces,
        mats["edge"],
        group,
        material_role="intake-edge",
        aerodynamic_surface="inlet-lip",
    )
    # The duct narrows and curves toward the embedded engine face.
    duct_sections = [
        (1.47, center_x, 0.04, 0.30, 0.34),
        (0.70, side * 0.93, 0.01, 0.29, 0.31),
        (-0.20, side * 0.80, 0.02, 0.27, 0.29),
        (-1.18, side * 0.72, 0.02, 0.255, 0.27),
    ]
    vertices = []
    for y, cx, cz, hw, hh in duct_sections:
        vertices.extend(section_loop(cx, y, cz, hw, hh, segments, side=side, d_shape=0.12))
    faces = []
    for station in range(len(duct_sections) - 1):
        a = station * segments
        b = (station + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((a + index, a + nxt, b + nxt, b + index))
    mesh_object(
        f"INTAKE_DUCT_{label}",
        vertices,
        faces,
        mats["duct"],
        group,
        material_role="intake-duct",
        aerodynamic_surface="internal-duct",
    )
    # A sculpted compression ramp and center-side splitter make the inlet read
    # as an integrated flow path rather than a dark hole in the fuselage.
    splitter_footprint = [
        (side * 0.73, 1.83),
        (side * 1.05, 1.58),
        (side * 0.91, 0.46),
        (side * 0.69, 0.72),
    ]
    extruded_polygon(
        f"INTAKE_SPLITTER_{label}",
        splitter_footprint,
        0.055,
        0.055,
        mats["titanium"],
        group,
        bevel=0.018,
        material_role="inlet-splitter",
        aerodynamic_surface="compression-ramp",
    )
    ramp_footprint = [
        (side * 0.92, 1.41),
        (side * 1.29, 1.34),
        (side * 1.12, 0.31),
        (side * 0.82, 0.46),
    ]
    extruded_polygon(
        f"INTAKE_COMPRESSION_RAMP_{label}",
        ramp_footprint,
        -0.18,
        0.035,
        mats["duct_detail"],
        group,
        material_role="inlet-ramp",
        aerodynamic_surface="internal-compression-ramp",
    )
    loft_patch(
        f"INTAKE_SHOULDER_COWL_{label}",
        center_x,
        [
            (1.92, 0.47, 0.43, 0.02),
            (1.60, 0.51, 0.47, 0.02),
            (0.45, 0.49, 0.45, 0.015),
            (-0.72, 0.44, 0.40, 0.01),
            (-1.26, 0.38, 0.34, 0.01),
        ],
        math.pi * 0.08,
        math.pi * 0.92,
        mats["shell_light"],
        group,
        arc_steps=22,
        material_role="inlet-shoulder-cowl",
        aerodynamic_surface="blended-inlet-fairing",
    )


def fan_rotor(
    name: str,
    center_x: float,
    y: float,
    radius: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    phase: float = 0.0,
    blade_count: int = 22,
    **values: object,
) -> bpy.types.Object:
    """Generate a bladed rotor as authored wedges, not a cylinder primitive."""

    depth = 0.045
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for blade in range(blade_count):
        angle = phase + 2 * math.pi * blade / blade_count
        sweep = 0.20
        a0 = angle - 0.055
        a1 = angle + 0.075
        a2 = angle + sweep + 0.055
        a3 = angle + sweep - 0.040
        outline = [
            (0.18 * radius, a0),
            (0.18 * radius, a1),
            (0.92 * radius, a2),
            (0.92 * radius, a3),
        ]
        base = len(vertices)
        for plane in (-1.0, 1.0):
            for radial, theta in outline:
                vertices.append(
                    (
                        center_x + radial * math.cos(theta),
                        y + plane * depth,
                        radial * math.sin(theta),
                    )
                )
        faces.extend(
            [
                (base, base + 1, base + 2, base + 3),
                (base + 7, base + 6, base + 5, base + 4),
            ]
        )
        for index in range(4):
            nxt = (index + 1) % 4
            faces.append((base + index, base + 4 + index, base + 4 + nxt, base + nxt))
    # Faceted hub, still purpose-built rather than a primitive operator.
    hub_segments = 24
    hub_start = len(vertices)
    for plane in (-1.0, 1.0):
        for index in range(hub_segments):
            theta = 2 * math.pi * index / hub_segments
            radial = radius * 0.205
            vertices.append((center_x + radial * math.cos(theta), y + plane * depth * 1.4, radial * math.sin(theta)))
    for index in range(hub_segments):
        nxt = (index + 1) % hub_segments
        faces.append((hub_start + index, hub_start + nxt, hub_start + hub_segments + nxt, hub_start + hub_segments + index))
    return mesh_object(name, vertices, faces, mat, parent, **values)


def nozzle_surface(
    name: str,
    center_x: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    stations: Sequence[tuple[float, float, float]] | None = None,
    segments: int = 64,
    lobe_amplitude: float = 0.045,
    reverse_faces: bool = False,
    **values: object,
) -> bpy.types.Object:
    stations = stations or [
        (-5.08, 0.43, 0.38),
        (-5.32, 0.415, 0.365),
        (-5.58, 0.36, 0.325),
        (-5.78, 0.32, 0.295),
        (-5.91, 0.30, 0.28),
    ]
    vertices: list[tuple[float, float, float]] = []
    for y, radius_x, radius_z in stations:
        for index in range(segments):
            theta = 2 * math.pi * index / segments
            lobe = 1.0 + lobe_amplitude * math.cos(12 * theta)
            vertices.append(
                (
                    center_x + radius_x * lobe * math.cos(theta),
                    y,
                    radius_z * lobe * math.sin(theta),
                )
            )
    faces: list[tuple[int, ...]] = []
    for station in range(len(stations) - 1):
        a = station * segments
        b = (station + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            face = (a + index, a + nxt, b + nxt, b + index)
            faces.append(tuple(reversed(face)) if reverse_faces else face)
    return mesh_object(name, vertices, faces, mat, parent, **values)


def module_group(
    name: str,
    module_id: str,
    parent: bpy.types.Object,
    *,
    mass_kg: float,
    drag_delta: float,
    evidence_tier: str,
    default_visible: bool = False,
) -> bpy.types.Object:
    return empty(
        name,
        parent,
        part_id=module_id,
        module_id=module_id,
        interaction="toggle-and-select",
        mass_kg=mass_kg,
        drag_delta=drag_delta,
        evidence_tier=evidence_tier,
        default_visible=default_visible,
    )


def build_modules(
    root: bpy.types.Object,
    mats: dict[str, bpy.types.Material],
) -> None:
    # 1. Multispectral observing window: a flush, faceted fairing under the nose.
    sensor = module_group(
        "MODULE_MULTISPECTRAL_SENSOR",
        "multispectral-sensor",
        root,
        mass_kg=68.0,
        drag_delta=0.001,
        evidence_tier="operational-heritage-components",
        default_visible=True,
    )
    extruded_polygon(
        "MULTISPECTRAL_FACET",
        [(-0.27, 6.36), (0.27, 6.36), (0.38, 5.78), (0.0, 5.48), (-0.38, 5.78)],
        -0.27,
        0.055,
        mats["sensor"],
        sensor,
        material_role="sensor-window",
        part_id="multispectral-sensor",
    )

    # 2. Cockpit radiation liner indicator: visible witness strips only; the
    # material does not claim particle-shield performance.
    liner = module_group(
        "MODULE_RADIATION_LINER",
        "radiation-liner",
        root,
        mass_kg=132.0,
        drag_delta=0.0,
        evidence_tier="engineering-candidate",
    )
    for side in (-1, 1):
        ribbon(
            f"RADIATION_LINER_WITNESS_{mirrored_name(side)}",
            (side * 0.46, 4.95),
            (side * 0.55, 2.78),
            0.055,
            0.76,
            mats["violet"],
            liner,
            material_role="liner-indicator",
            part_id="radiation-liner",
        )

    # 3. Hardened shutters over optical apertures.
    shutters = module_group(
        "MODULE_SENSOR_SHUTTERS",
        "sensor-shutters",
        root,
        mass_kg=22.0,
        drag_delta=0.0005,
        evidence_tier="operational-heritage-components",
    )
    for side in (-1, 1):
        extruded_polygon(
            f"SENSOR_SHUTTER_{mirrored_name(side)}",
            [
                (side * 0.08, 6.42),
                (side * 0.32, 6.34),
                (side * 0.37, 5.91),
                (side * 0.06, 5.72),
            ],
            -0.235,
            0.035,
            mats["edge"],
            shutters,
            material_role="protective-shutter",
            part_id="sensor-shutters",
        )

    # 4. Sealed cabin / sampled-air filtration intake. It is not an
    # "antibiotic shield" and is deliberately kept separate from propulsion.
    bio = module_group(
        "MODULE_BIOFILTRATION",
        "biofiltration-intake",
        root,
        mass_kg=84.0,
        drag_delta=0.0015,
        evidence_tier="engineering-candidate",
    )
    base_footprint = [(-0.42, 1.05), (0.42, 1.05), (0.49, 0.52), (-0.49, 0.52)]
    extruded_polygon(
        "BIOFILTRATION_FAIRING",
        base_footprint,
        0.67,
        0.07,
        mats["shell_dark"],
        bio,
        bevel=0.035,
        material_role="environmental-control-fairing",
        part_id="biofiltration-intake",
    )
    for index in range(5):
        y = 0.62 + index * 0.085
        ribbon(
            f"BIOFILTER_LOUVER_{index + 1:02d}",
            (-0.34, y),
            (0.34, y),
            0.028,
            0.718,
            mats["cyan"],
            bio,
            material_role="filter-louver",
        )

    # 5. Redundant passive/active contact communications: conformal dorsal
    # apertures and two low-profile fins, not an offensive jammer.
    contact = module_group(
        "MODULE_FIRST_CONTACT_ARRAY",
        "first-contact-array",
        root,
        mass_kg=51.0,
        drag_delta=0.0012,
        evidence_tier="original-speculative-integration",
    )
    extruded_polygon(
        "CONTACT_DORSAL_APERTURE",
        [(-0.28, -0.20), (0.28, -0.20), (0.42, -1.00), (0.0, -1.28), (-0.42, -1.00)],
        0.695,
        0.035,
        mats["sensor"],
        contact,
        material_role="wideband-aperture",
        part_id="first-contact-array",
    )
    for side in (-1, 1):
        footprint = [
            (side * 0.34, -0.58),
            (side * 0.61, -0.92),
            (side * 0.48, -1.62),
            (side * 0.25, -1.02),
        ]
        extruded_polygon(
            f"CONTACT_ARRAY_FIN_{mirrored_name(side)}",
            footprint,
            0.68,
            0.06,
            mats["violet"],
            contact,
            bevel=0.015,
            material_role="communications-fin",
        )

    # 6. Thermal-management witness panels. These visibly change the skin but
    # do not imply that color alone establishes thermal performance.
    thermal = module_group(
        "MODULE_THERMAL_MANAGEMENT",
        "thermal-management",
        root,
        mass_kg=116.0,
        drag_delta=0.0008,
        evidence_tier="engineering-candidate",
    )
    for side in (-1, 1):
        for band in range(3):
            x0 = side * (1.46 + band * 0.64)
            x1 = side * (2.02 + band * 0.64)
            ribbon(
                f"THERMAL_PANEL_{mirrored_name(side)}_{band + 1:02d}",
                (x0, -0.28 - band * 0.23),
                (x1, -0.88 - band * 0.28),
                0.16,
                0.18 - band * 0.012,
                mats["thermal"],
                thermal,
                material_role="heat-exchanger-panel",
                part_id="thermal-management",
            )

    # 7. Detachable observer buoy: an unarmed sensor glider nested in a belly
    # bay. Its own custom loft and lifting surfaces remain clearly visible.
    buoy = module_group(
        "MODULE_OBSERVER_BUOY",
        "observer-buoy",
        root,
        mass_kg=94.0,
        drag_delta=0.003,
        evidence_tier="original-speculative-integration",
    )
    buoy_body = offset_loft_surface(
        "OBSERVER_BUOY_BODY",
        0.0,
        [
            (0.25, 0.035, 0.035, -0.57),
            (-0.05, 0.10, 0.075, -0.57),
            (-0.72, 0.13, 0.085, -0.57),
            (-1.32, 0.06, 0.04, -0.57),
        ],
        mats["shell_dark"],
        buoy,
        segments=20,
        part_id="observer-buoy",
        material_role="observer-body",
    )
    buoy_body["detachable"] = True
    extruded_polygon(
        "OBSERVER_BUOY_WING",
        [(-0.06, -0.18), (-0.72, -0.58), (-0.66, -0.84), (0.0, -0.63), (0.66, -0.84), (0.72, -0.58), (0.06, -0.18)],
        -0.57,
        0.045,
        mats["silver"],
        buoy,
        material_role="observer-wing",
    )
    empty(
        "ANCHOR_OBSERVER_BUOY",
        buoy,
        location=(0.0, -0.55, -0.48),
        attach_point="observer-bay",
        module_id="observer-buoy",
    )

    # 8. Explicitly fictional field sensor: sculptural conformal petals with no
    # claim of shielding or unknown-physics control.
    field = module_group(
        "MODULE_FIELD_SENSOR",
        "field-sensor",
        root,
        mass_kg=37.0,
        drag_delta=0.001,
        evidence_tier="fictional-unknown-physics",
    )
    for side in (-1, 1):
        for index in range(3):
            x = side * (0.18 + index * 0.11)
            y = 7.00 - index * 0.36
            footprint = [
                (x, y + 0.22),
                (x + side * 0.16, y - 0.08),
                (x, y - 0.26),
                (x - side * 0.05, y - 0.04),
            ]
            extruded_polygon(
                f"FIELD_SENSOR_PETAL_{mirrored_name(side)}_{index + 1:02d}",
                footprint,
                0.27 - index * 0.025,
                0.025,
                mats["pink"],
                field,
                material_role="fictional-sensor-petal",
                part_id="field-sensor",
            )

    # 9. Electromagnetic hardening: a faceted, conductive avionics enclosure
    # shown as a translucent witness volume. Real protection depends on seams,
    # apertures, bonding, grounding, filtering, and validation—not appearance.
    em_cage = module_group(
        "MODULE_EM_HARDENING",
        "em-hardening",
        root,
        mass_kg=76.0,
        drag_delta=0.0,
        evidence_tier="engineering-candidate",
    )
    loft_surface(
        "EM_AVIONICS_CAGE_SHIELD",
        [
            (0.88, 0.47, 0.31, 0.02),
            (0.72, 0.55, 0.35, 0.02),
            (-0.52, 0.55, 0.35, 0.02),
            (-0.72, 0.47, 0.31, 0.02),
        ],
        mats["em_shield"],
        em_cage,
        segments=12,
        superellipse=0.68,
        part_id="em-hardening",
        material_role="conductive-avionics-enclosure-concept",
        internal_component=True,
        cutaway_target=True,
    )
    # Two physically separate avionics trays make the protected volume easier
    # to read in the cutaway without suggesting a proprietary architecture.
    for side in (-1, 1):
        extruded_polygon(
            f"EM_AVIONICS_TRAY_{mirrored_name(side)}",
            [
                (side * 0.08, 0.53),
                (side * 0.41, 0.53),
                (side * 0.43, -0.43),
                (side * 0.08, -0.43),
            ],
            -0.01,
            0.20,
            mats["cockpit"],
            em_cage,
            bevel=0.035,
            part_id="em-hardening",
            material_role="shielded-avionics-tray",
            internal_component=True,
        )

    # 10. Redundant controls: two visibly independent luminous data/control
    # trunks. Separation is illustrative; a real routing analysis must also
    # address common-mode failures, power, connectors, heat, and maintenance.
    controls = module_group(
        "MODULE_REDUNDANT_CONTROLS",
        "redundant-controls",
        root,
        mass_kg=19.0,
        drag_delta=0.0,
        evidence_tier="operational-heritage-components",
    )
    trunk_specs = [
        ("A", -0.32, 0.04, mats["cyan"], "primary-control-data-path"),
        ("B", 0.32, -0.10, mats["pink"], "independent-control-data-path"),
    ]
    for label, center_x, center_z, trunk_material, role in trunk_specs:
        offset_loft_surface(
            f"REDUNDANT_CONTROL_TRUNK_{label}",
            center_x,
            [
                (4.25, 0.035, 0.030, center_z),
                (3.72, 0.050, 0.040, center_z),
                (1.10, 0.050, 0.040, center_z),
                (-1.65, 0.045, 0.038, center_z),
                (-3.92, 0.035, 0.030, center_z),
            ],
            trunk_material,
            controls,
            segments=8,
            superellipse=0.58,
            part_id="redundant-controls",
            material_role=role,
            internal_component=True,
            cutaway_target=True,
            route_id=label,
        )


def build_aircraft(reference: dict[str, object]) -> bpy.types.Object:
    mats = {
        "silver": material(
            "AERIS pearl ceramic composite",
            "#d9e4ef",
            metallic=0.48,
            roughness=0.23,
            coat_weight=0.34,
            coat_roughness=0.10,
        ),
        "shell_light": material(
            "AERIS cool-white upper skin",
            "#edf4fa",
            metallic=0.18,
            roughness=0.25,
            coat_weight=0.42,
            coat_roughness=0.11,
        ),
        "shell_mid": material(
            "AERIS pale titanium access skin",
            "#b8c8d9",
            metallic=0.66,
            roughness=0.28,
            anisotropy=0.18,
        ),
        "shell_dark": material(
            "AERIS graphite lower skin",
            "#101a2e",
            metallic=0.48,
            roughness=0.33,
            coat_weight=0.18,
        ),
        "edge": material(
            "AERIS nickel leading edge",
            "#8da5b8",
            metallic=0.92,
            roughness=0.18,
            anisotropy=0.34,
        ),
        "seal": material("AERIS flexible seal and panel gap", "#030711", metallic=0.02, roughness=0.82),
        "duct": material("AERIS intake low-reflectance coating", "#050912", metallic=0.04, roughness=0.69),
        "duct_detail": material("AERIS duct wear surface", "#1b2938", metallic=0.44, roughness=0.48),
        "engine": material(
            "AERIS turbine ceramic-metal",
            "#5f6d78",
            metallic=0.90,
            roughness=0.25,
            anisotropy=0.38,
        ),
        "titanium": material(
            "AERIS brushed titanium",
            "#9aa6ae",
            metallic=0.94,
            roughness=0.23,
            anisotropy=0.50,
        ),
        "heat": material("AERIS high-temperature nozzle", "#453e4d", metallic=0.82, roughness=0.30, anisotropy=0.24),
        "heat_inner": material("AERIS exhaust ceramic liner", "#17121a", metallic=0.40, roughness=0.61),
        "glass": material(
            "AERIS canopy laminate",
            "#493d86",
            metallic=0.12,
            roughness=0.08,
            alpha=0.39,
            transmission=0.68,
            coat_weight=0.74,
            coat_roughness=0.045,
            ior=1.52,
        ),
        "sensor": material(
            "AERIS multispectral window",
            "#1a6f91",
            metallic=0.34,
            roughness=0.11,
            emission="#44bfff",
            emission_strength=0.45,
            coat_weight=0.55,
            coat_roughness=0.06,
        ),
        "cyan": material("AERIS cyan witness", "#55dcff", metallic=0.46, roughness=0.18, emission="#3fbfff", emission_strength=1.2),
        "violet": material("AERIS violet witness", "#8a67ff", metallic=0.55, roughness=0.18, emission="#7954ff", emission_strength=0.85),
        "pink": material("AERIS fictional-field witness", "#ff70d6", metallic=0.42, roughness=0.20, emission="#ff57d2", emission_strength=1.1),
        "thermal": material("AERIS thermal exchanger candidate", "#c7a6ff", metallic=0.72, roughness=0.21),
        "cockpit": material("AERIS cockpit interior", "#111421", metallic=0.05, roughness=0.74),
        "cockpit_soft": material("AERIS cockpit restraint textile", "#2a2435", metallic=0.0, roughness=0.90),
        "gear_bay": material("AERIS landing bay interior", "#28303d", metallic=0.58, roughness=0.46),
        "em_shield": material(
            "AERIS faceted EM shield witness",
            "#d8b66d",
            metallic=0.88,
            roughness=0.22,
            alpha=0.48,
            transmission=0.12,
            emission="#f0c776",
            emission_strength=0.25,
        ),
    }

    root = empty(
        "AERIS_X_ROOT",
        design_id="aeris-x",
        display_name="AERIS-X Atmospheric Contact Research Demonstrator",
        creator="RIEVA independent educational concept",
        role="unarmed research aircraft",
        coordinate_contract="glTF +X wing-right, +Y up, -Z nose-forward",
        reference_source=str(reference.get("source")),
        reference_url=str(reference.get("url")),
        reference_used=bool(reference.get("used")),
        reference_metrics=json.dumps(reference, sort_keys=True),
        no_weapons=True,
        scientific_status="concept geometry; not flight-qualified or CFD-validated",
        geometry_revision="AERIS-X R2 blended-airframe detail pass",
        surface_model_note="PBR-ready authored geometry; no claim of CFD or structural validation",
    )

    fuselage_group = empty(
        "PART_FUSELAGE",
        root,
        part_id="fuselage",
        system_id="primary-airframe",
        interaction="selectable",
    )
    loft_surface(
        "FUSELAGE_PRESSURE_BODY",
        [
            (8.55, 0.035, 0.030, 0.02),
            (8.10, 0.16, 0.13, 0.03),
            (7.35, 0.31, 0.25, 0.05),
            (6.45, 0.52, 0.38, 0.08),
            (5.45, 0.73, 0.49, 0.13),
            (4.42, 0.94, 0.58, 0.16),
            (3.26, 1.13, 0.61, 0.14),
            (2.05, 1.27, 0.60, 0.10),
            (0.72, 1.34, 0.59, 0.07),
            (-0.70, 1.30, 0.59, 0.06),
            (-2.05, 1.17, 0.56, 0.05),
            (-3.35, 0.92, 0.49, 0.04),
            (-4.55, 0.68, 0.40, 0.03),
            (-5.45, 0.42, 0.29, 0.02),
            (-5.82, 0.22, 0.17, 0.01),
        ],
        mats["shell_light"],
        fuselage_group,
        segments=64,
        superellipse=0.74,
        chine=0.75,
        part_id="fuselage",
        material_role="primary-skin",
        aerodynamic_surface="forebody-and-centerbody",
    )
    # Dark lower chine visually breaks up the volume and improves depth cues.
    extruded_polygon(
        "LOWER_KEEL_PANEL",
        [(-0.33, 5.42), (0.33, 5.42), (0.58, -3.65), (0.0, -5.33), (-0.58, -3.65)],
        -0.50,
        0.035,
        mats["shell_dark"],
        fuselage_group,
        material_role="lower-keel",
    )

    # The pressure body transitions into a load-carrying centerbody before the
    # main wing. These authored airfoil lofts soften the root discontinuity and
    # give the aircraft a credible blended lifting-body volume.
    centerbody_stations = [
        (0.24, 6.34, -4.55, 0.047),
        (0.72, 5.62, -4.34, 0.045),
        (1.16, 4.56, -4.02, 0.043),
        (1.58, 3.34, -3.62, 0.040),
        (1.92, 2.46, -3.26, 0.036),
    ]
    for side in (-1, 1):
        label = mirrored_name(side)
        wing_surface(
            f"BLENDED_CENTERBODY_{label}",
            side,
            centerbody_stations,
            mats["shell_light"],
            fuselage_group,
            chord_steps=36,
            z_base=0.055,
            part_id="fuselage",
            material_role="blended-centerbody-skin",
            aerodynamic_surface="lifting-body-root-transition",
        )
        swept_rectangular_path(
            f"FOREBODY_CHINE_{label}",
            [
                (side * 0.10, 8.02, 0.09),
                (side * 0.34, 7.18, 0.25),
                (side * 0.61, 6.06, 0.42),
                (side * 0.91, 4.67, 0.55),
                (side * 1.17, 2.62, 0.50),
                (side * 1.30, 0.48, 0.39),
            ],
            0.042,
            0.026,
            mats["edge"],
            fuselage_group,
            bevel=0.008,
            material_role="chine-edge-cap",
            aerodynamic_surface="forebody-chine",
        )

    # Flush maintenance panels and fine gap lines break up the broad upper skin
    # without relying on texture downloads or decorative armor.
    dorsal_panels = [
        ("FORWARD", [(-0.34, 1.66), (0.34, 1.66), (0.42, 0.72), (-0.42, 0.72)], 0.665),
        ("MID", [(-0.47, -1.00), (0.47, -1.00), (0.42, -2.08), (-0.42, -2.08)], 0.638),
        ("AFT", [(-0.38, -2.42), (0.38, -2.42), (0.30, -3.46), (-0.30, -3.46)], 0.535),
    ]
    for panel_name, footprint, height in dorsal_panels:
        extruded_polygon(
            f"DORSAL_SERVICE_PANEL_{panel_name}",
            footprint,
            height,
            0.022,
            mats["shell_mid"],
            fuselage_group,
            bevel=0.018,
            material_role="flush-maintenance-panel",
            maintenance_detail=True,
        )
        # Recessed longitudinal latch witness.
        y_center = sum(point[1] for point in footprint) / len(footprint)
        swept_rectangular_path(
            f"DORSAL_PANEL_LATCH_{panel_name}",
            [(-0.07, y_center + 0.15, height + 0.018), (0.07, y_center + 0.15, height + 0.018)],
            0.025,
            0.014,
            mats["seal"],
            fuselage_group,
            material_role="maintenance-latch-gap",
        )

    canopy_group = empty(
        "PART_CANOPY",
        root,
        part_id="canopy",
        system_id="crew-enclosure",
        interaction="selectable",
    )
    loft_surface(
        "CANOPY_LAMINATE",
        [
            (5.58, 0.06, 0.05, 0.54),
            (5.16, 0.29, 0.24, 0.67),
            (4.50, 0.54, 0.42, 0.78),
            (3.62, 0.64, 0.48, 0.79),
            (2.84, 0.54, 0.36, 0.70),
            (2.38, 0.20, 0.13, 0.59),
        ],
        mats["glass"],
        canopy_group,
        segments=56,
        superellipse=0.84,
        part_id="canopy",
        material_role="transparent-pressure-laminate",
    )
    # Sculpted tandem seat/cockpit insert visible through the transparent shell.
    extruded_polygon(
        "COCKPIT_TUB",
        [(-0.47, 4.96), (0.47, 4.96), (0.53, 2.76), (0.31, 2.48), (-0.31, 2.48), (-0.53, 2.76)],
        0.47,
        0.22,
        mats["cockpit"],
        canopy_group,
        bevel=0.08,
        material_role="cockpit-interior",
    )
    swept_rectangular_path(
        "CANOPY_CENTER_FRAME",
        [
            (0.0, 5.56, 0.59),
            (0.0, 5.02, 0.91),
            (0.0, 4.28, 1.20),
            (0.0, 3.55, 1.26),
            (0.0, 2.86, 1.05),
            (0.0, 2.39, 0.67),
        ],
        0.040,
        0.028,
        mats["edge"],
        canopy_group,
        bevel=0.008,
        material_role="canopy-longitudinal-frame",
    )
    for side in (-1, 1):
        swept_rectangular_path(
            f"CANOPY_SILL_{mirrored_name(side)}",
            [
                (side * 0.05, 5.54, 0.56),
                (side * 0.31, 5.06, 0.66),
                (side * 0.55, 4.36, 0.70),
                (side * 0.62, 3.54, 0.68),
                (side * 0.49, 2.83, 0.62),
                (side * 0.18, 2.39, 0.58),
            ],
            0.055,
            0.034,
            mats["titanium"],
            canopy_group,
            bevel=0.010,
            material_role="canopy-perimeter-frame",
        )
    for frame_name, y, width, base_z, crown_z in [
        ("FORWARD", 4.78, 0.44, 0.70, 1.08),
        ("MID", 3.75, 0.62, 0.70, 1.25),
        ("AFT", 2.92, 0.50, 0.64, 1.02),
    ]:
        swept_rectangular_path(
            f"CANOPY_ARCH_{frame_name}",
            [
                (-width, y, base_z),
                (-width * 0.58, y, crown_z - 0.10),
                (0.0, y, crown_z),
                (width * 0.58, y, crown_z - 0.10),
                (width, y, base_z),
            ],
            0.034,
            0.030,
            mats["edge"],
            canopy_group,
            bevel=0.007,
            material_role="canopy-transverse-frame",
        )

    # Two slim seat shells, head restraints and a canted instrument coaming are
    # visible through the laminate at close zoom.
    for seat_index, seat_y in enumerate((4.25, 3.22), start=1):
        extruded_polygon(
            f"COCKPIT_SEAT_{seat_index}",
            [(-0.24, seat_y + 0.26), (0.24, seat_y + 0.26), (0.21, seat_y - 0.24), (-0.21, seat_y - 0.24)],
            0.66,
            0.23,
            mats["cockpit_soft"],
            canopy_group,
            bevel=0.055,
            material_role="seat-shell-and-restraint",
        )
        extruded_polygon(
            f"COCKPIT_HEADREST_{seat_index}",
            [(-0.14, seat_y + 0.03), (0.14, seat_y + 0.03), (0.13, seat_y - 0.18), (-0.13, seat_y - 0.18)],
            0.92,
            0.16,
            mats["cockpit_soft"],
            canopy_group,
            bevel=0.04,
            material_role="seat-head-restraint",
        )
    extruded_polygon(
        "COCKPIT_INSTRUMENT_COAMING",
        [(-0.36, 5.11), (0.36, 5.11), (0.31, 4.78), (-0.31, 4.78)],
        0.79,
        0.13,
        mats["cockpit"],
        canopy_group,
        bevel=0.035,
        material_role="instrument-coaming",
    )

    wing_stations = [
        (0.70, 4.78, -4.05, 0.046),
        (1.42, 4.05, -3.76, 0.044),
        (2.18, 3.20, -3.35, 0.041),
        (2.88, 2.34, -2.90, 0.039),
        (3.58, 1.42, -2.42, 0.036),
        (4.20, 0.66, -2.15, 0.034),
        (4.78, -0.12, -1.95, 0.031),
        (5.26, -0.65, -1.73, 0.026),
        (5.54, -0.95, -1.60, 0.020),
    ]
    for side in (-1, 1):
        label = mirrored_name(side)
        wing_group = empty(
            f"PART_WING_{label}",
            root,
            part_id=f"wing-{'left' if side < 0 else 'right'}",
            system_id="lifting-surface",
            interaction="selectable",
        )
        wing_surface(
            f"CRANKED_WING_{label}",
            side,
            wing_stations,
            mats["silver"],
            wing_group,
            chord_steps=36,
            part_id=f"wing-{'left' if side < 0 else 'right'}",
            material_role="load-bearing-wing-skin",
            aerodynamic_surface="cranked-delta-wing",
        )
        # Nickel leading edge and iridescent spanwise seam.
        swept_rectangular_path(
            f"LEADING_EDGE_WITNESS_{label}",
            [
                (side * 0.78, 4.70, 0.17),
                (side * 1.46, 3.98, 0.16),
                (side * 2.21, 3.14, 0.14),
                (side * 2.91, 2.28, 0.12),
                (side * 3.61, 1.36, 0.10),
                (side * 4.23, 0.60, 0.08),
                (side * 4.81, -0.18, 0.06),
                (side * 5.28, -0.70, 0.045),
                (side * 5.52, -0.95, 0.035),
            ],
            0.072,
            0.042,
            mats["edge"],
            wing_group,
            bevel=0.010,
            material_role="leading-edge-candidate",
        )
        swept_rectangular_path(
            f"WING_LOAD_PATH_{label}",
            [
                (side * 1.18, 2.12, 0.245),
                (side * 2.32, 1.22, 0.205),
                (side * 3.45, 0.12, 0.165),
                (side * 4.62, -1.18, 0.105),
            ],
            0.034,
            0.020,
            mats["violet"],
            wing_group,
            bevel=0.006,
            material_role="structural-witness-line",
        )
        # Flush panel fields follow the load path and introduce restrained
        # roughness/material variation at close zoom.
        panel_footprint = [
            (side * 1.58, 1.34),
            (side * 2.56, 0.86),
            (side * 3.18, -0.26),
            (side * 2.12, 0.15),
        ]
        extruded_polygon(
            f"WING_COMPOSITE_PANEL_{label}",
            panel_footprint,
            0.205,
            0.018,
            mats["shell_mid"],
            wing_group,
            bevel=0.012,
            material_role="wing-inspection-panel",
            maintenance_detail=True,
        )
        swept_rectangular_path(
            f"WING_TRAILING_SEAM_{label}",
            [
                (side * 1.45, -3.50, 0.08),
                (side * 2.55, -3.05, 0.075),
                (side * 3.68, -2.34, 0.065),
                (side * 4.72, -1.92, 0.055),
                (side * 5.28, -1.63, 0.04),
            ],
            0.030,
            0.015,
            mats["seal"],
            wing_group,
            material_role="control-surface-gap",
        )
        elevon = empty(
            f"PART_ELEVON_{label}",
            root,
            part_id=f"elevon-{'left' if side < 0 else 'right'}",
            system_id="flight-control",
            interaction="selectable",
            articulation_axis="local-X",
        )
        wing_surface(
            f"ELEVON_SURFACE_{label}",
            side,
            [
                (2.42, -2.43, -2.98, 0.060),
                (3.70, -2.10, -2.48, 0.055),
                (4.98, -1.70, -1.98, 0.050),
                (5.28, -1.58, -1.82, 0.044),
            ],
            mats["shell_dark"],
            elevon,
            chord_steps=14,
            z_base=0.03,
            part_id=f"elevon-{'left' if side < 0 else 'right'}",
            material_role="control-surface",
            aerodynamic_surface="all-moving-elevon",
        )
        swept_rectangular_path(
            f"ELEVON_HINGE_LINE_{label}",
            [
                (side * 2.44, -2.42, 0.072),
                (side * 3.70, -2.08, 0.066),
                (side * 4.97, -1.68, 0.055),
                (side * 5.27, -1.57, 0.045),
            ],
            0.035,
            0.018,
            mats["edge"],
            elevon,
            material_role="elevon-hinge-fairing",
        )

    for side in (-1, 1):
        label = mirrored_name(side)
        fin_group = empty(
            f"PART_VTAIL_{label}",
            root,
            part_id=f"v-tail-{'left' if side < 0 else 'right'}",
            system_id="directional-control",
            interaction="selectable",
        )
        fin_surface(
            f"CANTED_FIN_{label}",
            side,
            mats["silver"],
            fin_group,
            part_id=f"v-tail-{'left' if side < 0 else 'right'}",
            material_role="canted-tail-skin",
            aerodynamic_surface="canted-vertical-tail",
        )
        swept_rectangular_path(
            f"VTAIL_LEADING_EDGE_{label}",
            [
                (side * 0.86, -1.60, 0.30),
                (side * 1.19, -2.60, 1.64),
                (side * 1.31, -2.98, 1.94),
                (side * 1.33, -3.34, 1.93),
            ],
            0.050,
            0.034,
            mats["edge"],
            fin_group,
            bevel=0.008,
            material_role="tail-leading-edge-cap",
        )
        swept_rectangular_path(
            f"VTAIL_RUDDER_SEAM_{label}",
            [
                (side * 1.27, -3.63, 1.62),
                (side * 1.10, -3.91, 1.24),
                (side * 0.93, -4.22, 0.78),
                (side * 0.84, -4.50, 0.34),
            ],
            0.026,
            0.018,
            mats["seal"],
            fin_group,
            material_role="rudder-gap",
        )

    # Embedded, selectable twin propulsion paths.
    for side in (-1, 1):
        label = mirrored_name(side)
        intake_assembly(side, mats, root)
        engine = empty(
            f"PART_ENGINE_CORE_{label}",
            root,
            part_id=f"engine-core-{'left' if side < 0 else 'right'}",
            system_id="adaptive-cycle-concept",
            interaction="selectable",
        )
        center_x = side * 0.72
        offset_loft_surface(
            f"ENGINE_CASING_{label}",
            center_x,
            [
                (-0.95, 0.38, 0.34, 0.02),
                (-1.45, 0.47, 0.41, 0.02),
                (-2.55, 0.50, 0.43, 0.01),
                (-3.80, 0.48, 0.41, 0.00),
                (-4.92, 0.43, 0.37, 0.00),
                (-5.28, 0.39, 0.34, 0.00),
            ],
            mats["shell_dark"],
            engine,
            segments=48,
            superellipse=0.76,
            chine=0.4,
            part_id=f"engine-core-{'left' if side < 0 else 'right'}",
            material_role="engine-casing",
        )
        loft_patch(
            f"ENGINE_SHOULDER_COWL_{label}",
            center_x,
            [
                (-1.26, 0.51, 0.46, 0.01),
                (-1.74, 0.55, 0.50, 0.01),
                (-2.72, 0.57, 0.52, 0.00),
                (-3.78, 0.54, 0.49, 0.00),
                (-4.62, 0.49, 0.44, 0.00),
                (-5.06, 0.44, 0.39, 0.00),
            ],
            math.pi * 0.03,
            math.pi * 0.97,
            mats["silver"],
            engine,
            arc_steps=28,
            part_id=f"engine-core-{'left' if side < 0 else 'right'}",
            material_role="blended-engine-cowl",
            aerodynamic_surface="embedded-engine-shoulder",
        )
        fan_rotor(
            f"FAN_ROTOR_{label}",
            center_x,
            -1.22,
            0.34,
            mats["engine"],
            engine,
            part_id=f"engine-core-{'left' if side < 0 else 'right'}",
            material_role="fan-rotor",
        )
        annular_face(
            f"FAN_CASE_RING_{label}",
            center_x,
            -1.13,
            0.355,
            0.305,
            mats["titanium"],
            engine,
            segments=48,
            part_id=f"engine-core-{'left' if side < 0 else 'right'}",
            material_role="fan-case-ring",
        )
        fan_rotor(
            f"STATOR_ROTOR_{label}",
            center_x,
            -1.49,
            0.30,
            mats["titanium"],
            engine,
            phase=math.pi / 18,
            blade_count=18,
            part_id=f"engine-core-{'left' if side < 0 else 'right'}",
            material_role="fan-stator-stage",
        )
        offset_loft_surface(
            f"FAN_SPINNER_{label}",
            center_x,
            [
                (-0.98, 0.025, 0.022, 0.0),
                (-1.10, 0.10, 0.090, 0.0),
                (-1.25, 0.155, 0.135, 0.0),
                (-1.43, 0.12, 0.105, 0.0),
                (-1.57, 0.045, 0.040, 0.0),
            ],
            mats["titanium"],
            engine,
            segments=32,
            superellipse=0.90,
            part_id=f"engine-core-{'left' if side < 0 else 'right'}",
            material_role="fan-spinner",
        )
        # Hot-section witness spine behind the rotor.
        offset_loft_surface(
            f"ENGINE_HOT_CORE_{label}",
            center_x,
            [
                (-2.05, 0.22, 0.20, 0.0),
                (-2.75, 0.26, 0.23, 0.0),
                (-3.78, 0.24, 0.21, 0.0),
                (-4.70, 0.19, 0.17, 0.0),
            ],
            mats["engine"],
            engine,
            segments=28,
            material_role="engine-hot-core",
        )
        for stage_index, stage_y in enumerate((-2.18, -3.04, -3.92, -4.56), start=1):
            annular_face(
                f"HOT_SECTION_RING_{label}_{stage_index:02d}",
                center_x,
                stage_y,
                0.255 - stage_index * 0.010,
                0.205 - stage_index * 0.010,
                mats["heat"],
                engine,
                segments=36,
                part_id=f"engine-core-{'left' if side < 0 else 'right'}",
                material_role="hot-section-support-ring",
            )
        nozzle = empty(
            f"PART_NOZZLE_{label}",
            root,
            part_id=f"nozzle-{'left' if side < 0 else 'right'}",
            system_id="propulsion-exhaust",
            interaction="selectable",
        )
        nozzle_surface(
            f"LOBED_NOZZLE_{label}",
            center_x,
            mats["heat"],
            nozzle,
            part_id=f"nozzle-{'left' if side < 0 else 'right'}",
            material_role="variable-area-nozzle",
        )
        nozzle_surface(
            f"NOZZLE_INTERIOR_{label}",
            center_x,
            mats["heat_inner"],
            nozzle,
            stations=[
                (-5.18, 0.31, 0.275),
                (-5.45, 0.285, 0.255),
                (-5.72, 0.255, 0.230),
                (-5.92, 0.225, 0.205),
            ],
            segments=64,
            lobe_amplitude=0.025,
            reverse_faces=True,
            part_id=f"nozzle-{'left' if side < 0 else 'right'}",
            material_role="exhaust-ceramic-liner",
        )
        fan_rotor(
            f"REAR_TURBINE_FACE_{label}",
            center_x,
            -5.30,
            0.225,
            mats["engine"],
            nozzle,
            phase=math.pi / 24,
            blade_count=20,
            part_id=f"nozzle-{'left' if side < 0 else 'right'}",
            material_role="rear-turbine-witness",
        )
        annular_face(
            f"NOZZLE_THROAT_RING_{label}",
            center_x,
            -5.89,
            0.285,
            0.225,
            mats["titanium"],
            nozzle,
            segments=48,
            part_id=f"nozzle-{'left' if side < 0 else 'right'}",
            material_role="nozzle-throat-edge",
        )
        for seam_index in range(12):
            theta = 2 * math.pi * seam_index / 12
            swept_rectangular_path(
                f"NOZZLE_PETAL_SEAM_{label}_{seam_index + 1:02d}",
                [
                    (
                        center_x + 0.425 * math.cos(theta),
                        -5.09,
                        0.375 * math.sin(theta),
                    ),
                    (
                        center_x + 0.355 * math.cos(theta),
                        -5.58,
                        0.320 * math.sin(theta),
                    ),
                    (
                        center_x + 0.296 * math.cos(theta),
                        -5.90,
                        0.276 * math.sin(theta),
                    ),
                ],
                0.018,
                0.012,
                mats["titanium"],
                nozzle,
                material_role="nozzle-petal-seam",
            )

    # Flush landing-gear-door suggestion: no toy wheels in cruise display.
    gear_specs = [
        ("NOSE", "landing-bay-nose", [(-0.24, 5.20), (0.24, 5.20), (0.30, 4.16), (-0.30, 4.16)]),
        ("MAIN_L", "landing-bay-main-left", [(-1.05, 0.40), (-0.38, 0.42), (-0.42, -1.05), (-1.18, -0.88)]),
        ("MAIN_R", "landing-bay-main-right", [(0.38, 0.42), (1.05, 0.40), (1.18, -0.88), (0.42, -1.05)]),
    ]
    for label, part_id, footprint in gear_specs:
        group = empty(
            f"PART_LANDING_BAY_{label}",
            root,
            part_id=part_id,
            system_id="ground-operations",
            interaction="selectable",
        )
        extruded_polygon(
            f"GEAR_DOOR_{label}",
            footprint,
            -0.53,
            0.025,
            mats["edge"],
            group,
            material_role="flush-gear-door",
            part_id=part_id,
        )
        center_x = sum(point[0] for point in footprint) / len(footprint)
        center_y = sum(point[1] for point in footprint) / len(footprint)
        inset = [
            (
                center_x + (point[0] - center_x) * 0.84,
                center_y + (point[1] - center_y) * 0.84,
            )
            for point in footprint
        ]
        extruded_polygon(
            f"GEAR_BAY_INSET_{label}",
            inset,
            -0.552,
            0.014,
            mats["gear_bay"],
            group,
            material_role="landing-bay-door-inner-panel",
            part_id=part_id,
            maintenance_detail=True,
        )
        swept_rectangular_path(
            f"GEAR_DOOR_HINGE_{label}",
            [
                (footprint[0][0], footprint[0][1], -0.570),
                (footprint[1][0], footprint[1][1], -0.570),
            ],
            0.026,
            0.016,
            mats["seal"],
            group,
            material_role="landing-door-hinge-gap",
        )
        latch_footprint = [
            (
                center_x + 0.045 * math.cos(2 * math.pi * index / 6),
                center_y + 0.045 * math.sin(2 * math.pi * index / 6),
            )
            for index in range(6)
        ]
        extruded_polygon(
            f"GEAR_DOOR_LATCH_{label}",
            latch_footprint,
            -0.570,
            0.018,
            mats["titanium"],
            group,
            material_role="landing-door-latch",
            maintenance_detail=True,
        )

    # Attachment-point empties let the web configurator position its effects.
    for name, position, system in [
        ("ANCHOR_NOSE", (0.0, 7.15, 0.10), "forward-sensor"),
        ("ANCHOR_DORSAL", (0.0, -0.55, 0.72), "communications"),
        ("ANCHOR_BELLY", (0.0, -0.58, -0.53), "observer-bay"),
        ("ANCHOR_WING_L", (-3.15, -0.42, 0.18), "wing-module"),
        ("ANCHOR_WING_R", (3.15, -0.42, 0.18), "wing-module"),
        ("ANCHOR_EXHAUST_L", (-0.72, -5.88, 0.0), "engine-plume"),
        ("ANCHOR_EXHAUST_R", (0.72, -5.88, 0.0), "engine-plume"),
    ]:
        empty(name, root, location=position, attach_point=system)

    build_modules(root, mats)
    return root


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_preview(root: bpy.types.Object, path: Path) -> None:
    # Ground and lights are added after export, so they never enter the GLB.
    preview_mat = material("Preview floor", "#090f25", roughness=0.62)
    bpy.ops.mesh.primitive_plane_add(size=50, location=(0, 0, -0.66))
    floor = bpy.context.object
    floor.name = "PREVIEW_FLOOR"
    floor.data.materials.append(preview_mat)

    for location, energy, size, color in [
        ((7.0, 10.0, 10.0), 1550, 7.0, (0.73, 0.82, 1.0)),
        ((-9.0, 1.0, 6.0), 1250, 6.0, (0.48, 0.26, 1.0)),
        ((4.0, -10.0, 3.5), 1050, 5.0, (0.18, 0.65, 1.0)),
        ((0.0, 3.0, 12.0), 750, 5.0, (1.0, 0.35, 0.74)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        look_at(light, Vector((0, 0.5, 0.0)))

    bpy.ops.object.camera_add(location=(10.8, 13.8, 7.8))
    camera = bpy.context.object
    camera.data.lens = 58
    look_at(camera, Vector((0.0, 0.4, 0.0)))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(path)
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.010, 0.035)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.35
    bpy.ops.render.render(write_still=True)


def export_glb(root: bpy.types.Object, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
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


def asset_stats(root: bpy.types.Object) -> dict[str, int]:
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
    triangles = 0
    vertices = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
    return {"meshes": len(meshes), "vertices": vertices, "triangles": triangles}


def main() -> None:
    args = parse_args()
    clear_scene()
    reference = reference_metrics(args.reference)
    root = build_aircraft(reference)
    stats = asset_stats(root)

    output_path = Path(args.out).expanduser().resolve()
    export_glb(root, output_path)
    print(f"RIEVA_AERIS_GLTF={output_path}")
    print(f"RIEVA_AERIS_STATS={json.dumps(stats, sort_keys=True)}")

    if args.blend:
        blend_path = Path(args.blend).expanduser().resolve()
        blend_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        print(f"RIEVA_AERIS_BLEND={blend_path}")

    if args.preview:
        preview_path = Path(args.preview).expanduser().resolve()
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        setup_preview(root, preview_path)
        print(f"RIEVA_AERIS_PREVIEW={preview_path}")


if __name__ == "__main__":
    main()
