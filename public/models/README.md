# RIEVA missionwear 3D asset

`rieva-missionwear.glb` is generated in Blender by
[`scripts/build_rieva_suits.py`](../../scripts/build_rieva_suits.py). The three
suit concepts, equipment geometry, materials, hierarchy, and interaction
metadata are original work for this project.

The anatomical scaffold is derived from **Human Base Meshes v1.4.1**, published
by Blender Studio and community contributors under CC0. The source bundle was
downloaded from Blender's official Demo Files page and verified on 1 October
2026. CC0 does not require attribution, but it is recorded here for provenance.

- Source: <https://www.blender.org/download/demo-files/>
- Direct bundle listing: `Human Base Meshes v1.4.1` (updated 20 January 2025)
- License shown by Blender: CC0

The GLB stores only the generated browser asset, not the full 49 MB source
library. Each interactive item carries `part_id`, `materialRole`, and concept
metadata as glTF extras.
