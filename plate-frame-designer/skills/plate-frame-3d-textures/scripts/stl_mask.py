"""Front silhouette of assets/models/plate-frame.stl as a mask image (white =
frame face). Used to cut thumbnails to the real frame outline.

Usage: python3 -I tools/stl_mask.py <out.png> <width-px>
"""
import os
import struct
import sys

import cv2
import numpy as np

STL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "models", "plate-frame.stl")


def load_tris(path=STL):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[80:84])[0]
    rec = np.frombuffer(b[84:84 + n * 50], dtype=np.dtype([("n", "<3f4"), ("v", "<9f4"), ("a", "<u2")]))
    return rec["v"].reshape(-1, 3, 3)


def front_mask(width, ss=4):
    V = load_tris()
    P = V.reshape(-1, 3)
    mn, mx = P.min(0), P.max(0)
    W, H = mx[0] - mn[0], mx[1] - mn[1]
    height = round(width * H / W)
    s = width * ss / W
    N = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0])
    m = np.zeros((height * ss, width * ss), np.uint8)
    for t, n in zip(V, N):
        if n[2] > 0 and t[:, 2].min() > mx[2] - 0.01:
            pts = np.int32([((p[0] - mn[0]) * s, (mx[1] - p[1]) * s) for p in t])
            cv2.fillPoly(m, [pts], 255)
    return cv2.resize(m, (width, height), interpolation=cv2.INTER_AREA)


if __name__ == "__main__":
    cv2.imwrite(sys.argv[1], front_mask(int(sys.argv[2])))
