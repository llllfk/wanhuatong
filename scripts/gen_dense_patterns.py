"""Generate dense full-frame kaleidoscope preset SVGs."""

from __future__ import annotations

import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "images" / "patterns"

PALETTES = [
    ("#0b0618", ["#ff4d6d", "#ff9f1c", "#ffd60a", "#80ed99", "#4cc9f0", "#7209b7", "#f72585", "#ffffff"]),
    ("#1a0a24", ["#ff6bcb", "#ffd166", "#06d6a0", "#118ab2", "#ef476f", "#ff9eed", "#c77dff", "#fff3b0"]),
    ("#020617", ["#00f5d4", "#00bbf9", "#9b5de5", "#fee440", "#f15bb5", "#80ffdb", "#48cae4", "#ffffff"]),
    ("#1c0a00", ["#ffba08", "#faa307", "#f48c06", "#e85d04", "#dc2f02", "#ffea00", "#ff5400", "#fff3b0"]),
    ("#050816", ["#b5179e", "#7209b7", "#560bad", "#3a0ca3", "#4361ee", "#4cc9f0", "#f72585", "#e0aaff"]),
    ("#140a12", ["#ff4d6d", "#ff8fa3", "#ffb3c1", "#ffc2d1", "#fb6f92", "#ff99c8", "#e5989b", "#ffffff"]),
]

NAMES = [
    "pattern-1-rainbow.svg",
    "pattern-2-candy.svg",
    "pattern-3-bubbles.svg",
    "pattern-4-sunburst.svg",
    "pattern-5-gems.svg",
    "pattern-6-petals.svg",
]


def petal(cx: float, cy: float, rx: float, ry: float, rot: float, fill: str, op: float) -> str:
    return (
        f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" '
        f'fill="{fill}" opacity="{op:.2f}" '
        f'transform="rotate({rot:.1f} {cx:.1f} {cy:.1f})"/>'
    )


def circle(cx: float, cy: float, r: float, fill: str, op: float) -> str:
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" opacity="{op:.2f}"/>'


def ring(cx: float, cy: float, r: float, stroke: str, sw: float, op: float) -> str:
    return (
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" '
        f'stroke="{stroke}" stroke-width="{sw:.1f}" opacity="{op:.2f}"/>'
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for idx, ((bg, colors), name) in enumerate(zip(PALETTES, NAMES)):
        rng = random.Random(100 + idx * 17)
        parts = [f'<rect width="1000" height="1000" fill="{bg}"/>']

        for _ in range(220):
            cx, cy = rng.uniform(20, 980), rng.uniform(20, 980)
            c = colors[rng.randrange(len(colors))]
            kind = rng.random()
            if kind < 0.45:
                parts.append(
                    petal(
                        cx,
                        cy,
                        rng.uniform(8, 28),
                        rng.uniform(18, 70),
                        rng.uniform(0, 360),
                        c,
                        rng.uniform(0.55, 0.95),
                    )
                )
            elif kind < 0.8:
                parts.append(circle(cx, cy, rng.uniform(6, 36), c, rng.uniform(0.5, 0.95)))
            else:
                parts.append(
                    ring(cx, cy, rng.uniform(16, 90), c, rng.uniform(4, 16), rng.uniform(0.45, 0.85))
                )

        for _ in range(90):
            parts.append(
                circle(
                    rng.uniform(0, 1000),
                    rng.uniform(0, 1000),
                    rng.uniform(1.5, 6),
                    "#ffffff",
                    rng.uniform(0.5, 1),
                )
            )

        for _ in range(12):
            cx, cy = rng.uniform(100, 900), rng.uniform(100, 900)
            c = colors[rng.randrange(len(colors) - 1)]
            for k in range(6):
                ang = k * 60 + rng.uniform(-8, 8)
                parts.append(petal(cx, cy, rng.uniform(14, 26), rng.uniform(40, 85), ang, c, 0.55))
            parts.append(circle(cx, cy, rng.uniform(10, 22), "#ffffff", 0.85))

        svg = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" '
            'width="1000" height="1000">\n'
            + "".join(parts)
            + "\n</svg>\n"
        )
        path = OUT / name
        path.write_text(svg, encoding="utf-8")
        print(f"{name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
