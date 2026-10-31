"""Command line interface: ``ichantool analyze IMAGE --top 0 --bottom 500``."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import __version__
from .export import to_csv, to_excel
from .io import load_image, load_mask
from .pipeline import analyze_mask
from .segmentation import mask_from_palette, mask_from_threshold


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ichantool", description="Quantitative ichnofabric analysis of core images")
    p.add_argument("--version", action="version", version=f"ichantool {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    a = sub.add_parser("analyze", help="analyse one image")
    a.add_argument("image", type=Path)
    a.add_argument("--top", type=float, required=True, help="depth of the image top")
    a.add_argument("--bottom", type=float, required=True, help="depth of the image bottom")
    a.add_argument("--units", default="cm")
    a.add_argument("--bin-px", type=int, default=1, help="pixel rows per data point")
    a.add_argument("--name", default=None, help="section name (default: file stem)")
    g = a.add_mutually_exclusive_group()
    g.add_argument("--threshold", type=float, default=5,
                   help="gray value <= threshold is bioturbation (default 5, v2.1 behaviour)")
    g.add_argument("--palette", type=Path, help="JSON {class: '#rrggbb'} for colour-coded images")
    g.add_argument("--label-mask", action="store_true", help="image is already an integer label mask")
    a.add_argument("--tolerance", type=int, default=10, help="colour tolerance for --palette")
    a.add_argument("-o", "--output", type=Path, help="output .csv or .xlsx (default: <image>_ichantool.csv)")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "analyze":
        if args.label_mask:
            mask, names = load_mask(args.image), None
        elif args.palette:
            palette = json.loads(args.palette.read_text(encoding="utf-8"))
            mask, names = mask_from_palette(load_image(args.image, "RGB"), palette, args.tolerance)
        else:
            mask, names = mask_from_threshold(load_image(args.image), args.threshold)
        section = analyze_mask(mask, args.top, args.bottom, units=args.units, bin_px=args.bin_px,
                               class_names=names, name=args.name or args.image.stem)
        out = args.output or args.image.with_name(args.image.stem + "_ichantool.csv")
        (to_excel if out.suffix.lower() == ".xlsx" else to_csv)([section], out)
        print(f"{len(section.data)} data points -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
