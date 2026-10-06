"""Rebuild the license plate frame with the rear-side features seen in the photos.

Coordinate frame is kept identical to the original STL:
  z = 0   rear (car side)  ->  z = 8  front face
  face plate: z 5..8, pocket skirt: z 0..5
"""
import numpy as np, trimesh
from shapely.geometry import Polygon, Point, box
from shapely.ops import unary_union
from trimesh.creation import extrude_polygon

SRC = 'in/frame.stl'   # the original blank frame STL (front face only)
OUT = 'out/License_Plate_Frame_rear_features_v2.stl'

# ---------------- parameters (mm) ----------------
FACE_Z0, FACE_Z1 = 5.0, 8.0     # face plate
SKIRT_H          = 5.0          # pocket depth (z 0..5)
WALL_T           = 2.5          # perimeter wall thickness (was 1.5)
BOSS_H           = 1.0          # boss height above pocket floor
SCREW_BOSS_OD    = 13.0         # ring around the two through holes
BLIND_BOSS_OD    = 11.0         # blind bosses at bottom hole positions
PILOT_D, PILOT_DEPTH = 3.0, 1.0 # drill-guide dimple in the blind bosses
PLATE_HOLE_DY    = 120.65       # 4.75" vertical hole spacing of a US plate
TAB_W            = 34.0         # retention tab width (along the short end)
TAB_REACH        = 6.0          # how far the tab overhangs past the inner wall face
TAB_T            = 2.5          # tab thickness at the rear (z 0..2.5)
TAB_LEADIN       = 0.8          # chamfer on the tab tip underside
OPEN_BOTTOM_Y    = 12.0         # side walls stop this far above the bottom edge (clear of the corner radius); bottom edge is open
BOSS_CHAMFER     = 1.0          # 45-degree lead-in all round each boss so the plate rides over it

# ---------------- pull the 2D outlines out of the original STL ----------------
src = trimesh.load(SRC)
sec = src.section(plane_origin=[0, 0, 6.5], plane_normal=[0, 0, 1])
loops = [sec.vertices[e.points][:, :2] for e in sec.entities]
loops.sort(key=lambda p: -Polygon(p).area)
outer, window = Polygon(loops[0]), Polygon(loops[1])
holes = []
for p in loops[2:]:
    lo, hi = p.min(0), p.max(0)
    holes.append(((lo + hi) / 2, (hi - lo).mean() / 2))   # (center, radius)
holes.sort(key=lambda h: h[0][0])
(hl_c, hl_r), (hr_c, hr_r) = holes
print('outer', outer.bounds, 'window', window.bounds)
print('holes', hl_c, hl_r, hr_c, hr_r)

ox0, oy0, ox1, oy1 = outer.bounds
cx, cy = (ox0 + ox1) / 2, (oy0 + oy1) / 2

def prism(poly, z0, z1):
    m = extrude_polygon(poly, z1 - z0)
    m.apply_translation([0, 0, z0])
    return m

def boss(center, r, z_top, z_base):
    # frustum: full radius at the pocket floor (z_base), chamfered toward the rear (z_top < z_base)
    h = z_base - z_top
    prof = np.array([[0, 0], [r - BOSS_CHAMFER, 0], [r, min(BOSS_CHAMFER, h)], [r, h + 0.01], [0, h + 0.01]])
    m = trimesh.creation.revolve(prof, sections=96)
    m.apply_translation([center[0], center[1], z_top])
    return m

def cyl(center, r, z0, z1):
    m = trimesh.creation.cylinder(radius=r, height=z1 - z0, sections=96)
    m.apply_translation([center[0], center[1], (z0 + z1) / 2])
    return m

parts = []
# face plate (window cut here; screw holes cut at the end so they pass through the bosses too)
parts.append(prism(outer.difference(window), FACE_Z0, FACE_Z1))
# perimeter wall
wall2d = outer.difference(outer.buffer(-WALL_T)).difference(box(ox0 - 1, oy0 - 1, ox1 + 1, oy0 + OPEN_BOTTOM_Y))
parts.append(prism(wall2d, 0.0, FACE_Z0 + 0.01))
# screw-hole bosses
for c in (hl_c, hr_c):
    parts.append(boss(c, SCREW_BOSS_OD / 2, FACE_Z0 - BOSS_H, FACE_Z0))
# blind bosses at the lower plate-hole positions
blind = [(hl_c[0], hl_c[1] - PLATE_HOLE_DY), (hr_c[0], hr_c[1] - PLATE_HOLE_DY)]
for c in blind:
    parts.append(boss(c, BLIND_BOSS_OD / 2, FACE_Z0 - BOSS_H, FACE_Z0))

# retention tabs on both short ends: profile in (u, z), u = distance inward from the outer edge
prof = [(0, 0), (WALL_T + TAB_REACH, 0), (WALL_T + TAB_REACH, TAB_T - TAB_LEADIN),
        (WALL_T + TAB_REACH - TAB_LEADIN, TAB_T), (WALL_T + TAB_T, TAB_T),
        (WALL_T, FACE_Z0), (0, FACE_Z0 + 0.01)]
def tab(x_edge, direction):
    pts2 = [(x_edge + direction * u, z) for u, z in prof]
    m = extrude_polygon(Polygon(pts2), TAB_W)          # extruded along +z of the 2D (= y after rotation)
    # extrude_polygon builds in XY and extrudes along Z; remap (x,z)->(x,z), extrusion axis -> y
    v = m.vertices.copy()
    m.vertices = np.column_stack([v[:, 0], v[:, 2] + cy - TAB_W / 2, v[:, 1]])
    m.fix_normals()
    return m
parts.append(tab(ox0, +1))
parts.append(tab(ox1, -1))

body = trimesh.boolean.union(parts, engine='manifold')

# cuts: through screw holes, pilot dimples in the blind bosses
cuts = [cyl(c, r, -1, 10) for c, r in ((hl_c, hl_r), (hr_c, hr_r))]
cuts += [cyl(c, PILOT_D / 2, FACE_Z0 - BOSS_H - 1, FACE_Z0 - BOSS_H + PILOT_DEPTH) for c in blind]
body = trimesh.boolean.difference([body] + cuts, engine='manifold')

body.merge_vertices()
print('watertight', body.is_watertight, 'volume', round(body.volume, 1), 'faces', len(body.faces))
print('bounds', body.bounds)
import os; os.makedirs('out', exist_ok=True)
body.export(OUT)
print('wrote', OUT)
