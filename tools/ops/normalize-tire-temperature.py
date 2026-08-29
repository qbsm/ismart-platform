#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import argparse
import math
import os

from PIL import Image, ImageStat


@dataclass
class ImageStats:
    p5: float
    p95: float
    mean_r: float
    mean_g: float
    mean_b: float


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def percentile_from_hist(hist: list[int], q: float) -> float:
    total = sum(hist)
    if total <= 0:
        return 0.0
    target = total * q
    acc = 0
    for i, count in enumerate(hist):
        acc += count
        if acc >= target:
            return float(i)
    return 255.0


def opaque_mask(alpha: Image.Image, threshold: int = 8) -> Image.Image:
    return alpha.point(lambda v: 255 if v > threshold else 0, mode="L")


def compute_stats(img_rgba: Image.Image) -> ImageStats:
    r, g, b, a = img_rgba.split()
    mask = opaque_mask(a)

    rgb = Image.merge("RGB", (r, g, b))
    luma = rgb.convert("L")
    hist = luma.histogram(mask=mask)

    p5 = percentile_from_hist(hist, 0.05)
    p95 = percentile_from_hist(hist, 0.95)

    mean_r = ImageStat.Stat(r, mask=mask).mean[0]
    mean_g = ImageStat.Stat(g, mask=mask).mean[0]
    mean_b = ImageStat.Stat(b, mask=mask).mean[0]

    return ImageStats(
        p5=p5,
        p95=p95,
        mean_r=mean_r,
        mean_g=mean_g,
        mean_b=mean_b,
    )


def apply_lut(channel: Image.Image, lut: list[int]) -> Image.Image:
    return channel.point(lut, mode="L")


def build_gain_lut(gain: float) -> list[int]:
    return [int(clamp(round(i * gain), 0, 255)) for i in range(256)]


def build_tone_lut(gain: float, bias: float) -> list[int]:
    return [int(clamp(round(i * gain + bias), 0, 255)) for i in range(256)]


def build_midtone_lut(ref_stats: ImageStats, cur_stats: ImageStats) -> list[int]:
    """
    Builds a LUT that maps cur_stats (p5, mean, p95) to ref_stats (p5, mean, p95).
    Uses a power-law (gamma) for midtone adjustment after black/white point alignment.
    """
    lut: list[int] = []
    
    cur_p5 = cur_stats.p5
    cur_p95 = cur_stats.p95
    ref_p5 = ref_stats.p5
    ref_p95 = ref_stats.p95
    
    cur_range = max(1.0, cur_p95 - cur_p5)
    ref_range = max(1.0, ref_p95 - ref_p5)
    
    cur_mean = (cur_stats.mean_r + cur_stats.mean_g + cur_stats.mean_b) / 3.0
    ref_mean = (ref_stats.mean_r + ref_stats.mean_g + ref_stats.mean_b) / 3.0
    
    # Normalized positions [0..1]
    cur_m_norm = clamp((cur_mean - cur_p5) / cur_range, 0.01, 0.99)
    ref_m_norm = clamp((ref_mean - ref_p5) / ref_range, 0.01, 0.99)
    
    # gamma: cur_m_norm ^ gamma = ref_m_norm  =>  gamma = log(ref_m_norm) / log(cur_m_norm)
    gamma = math.log(ref_m_norm) / math.log(cur_m_norm)
    gamma = clamp(gamma, 0.5, 2.0)

    for i in range(256):
        # a. Black/White point stretch
        val = (i - cur_p5) / cur_range
        val = clamp(val, 0.0, 1.0)
        
        # b. Midtone gamma shift
        val = val ** gamma
        
        # c. Map back to reference range
        res = val * ref_range + ref_p5
        lut.append(int(clamp(round(res), 0, 255)))
        
    return lut


def apply_rgb_gain(img_rgba: Image.Image, gain: float) -> Image.Image:
    gain = clamp(gain, 1.0, 2.0)
    lut = [int(clamp(round(i * gain), 0, 255)) for i in range(256)]
    r, g, b, a = img_rgba.split()
    r = apply_lut(r, lut)
    g = apply_lut(g, lut)
    b = apply_lut(b, lut)
    return Image.merge("RGBA", (r, g, b, a))


def build_shadow_lift_lut(strength: float, pivot: float, gamma: float) -> list[int]:
    strength = clamp(strength, 0.0, 1.0)
    pivot = clamp(pivot, 0.05, 0.95)
    gamma = clamp(gamma, 0.5, 4.0)
    lut: list[int] = []
    for i in range(256):
        x = i / 255.0
        t = min(1.0, x / pivot)
        weight = (1.0 - t) ** gamma
        y = x + strength * weight * (1.0 - x)
        lut.append(int(clamp(round(y * 255.0), 0, 255)))
    return lut


def apply_shadow_lift(
    img_rgba: Image.Image,
    strength: float,
    pivot: float = 0.45,
    gamma: float = 1.8,
) -> Image.Image:
    lut = build_shadow_lift_lut(strength, pivot, gamma)
    r, g, b, a = img_rgba.split()
    r = apply_lut(r, lut)
    g = apply_lut(g, lut)
    b = apply_lut(b, lut)
    return Image.merge("RGBA", (r, g, b, a))


def grayscale_roundtrip(img_rgba: Image.Image) -> Image.Image:
    r, g, b, a = img_rgba.split()
    gray = Image.merge("RGB", (r, g, b)).convert("L")
    rgb_back = Image.merge("RGB", (gray, gray, gray))
    rr, gg, bb = rgb_back.split()
    return Image.merge("RGBA", (rr, gg, bb, a))


def normalize_image(img_rgba: Image.Image, ref: ImageStats) -> Image.Image:
    base = img_rgba
    cur = compute_stats(base)
    
    # 1. White Balance
    r, g, b, a = base.split()
    eps = 1e-6
    rg = ref.mean_r / max(cur.mean_r, eps)
    gg = ref.mean_g / max(cur.mean_g, eps)
    bg = ref.mean_b / max(cur.mean_b, eps)
    avg = (rg + gg + bg) / 3.0
    
    rg = clamp(rg / avg, 0.90, 1.10)
    gg = clamp(gg / avg, 0.90, 1.10)
    bg = clamp(bg / avg, 0.90, 1.10)
    
    r = apply_lut(r, build_gain_lut(rg))
    g = apply_lut(g, build_gain_lut(gg))
    b = apply_lut(b, build_gain_lut(bg))
    
    wb_corrected = Image.merge("RGBA", (r, g, b, a))
    wb_stats = compute_stats(wb_corrected)
    
    # 2. Tonal Normalization
    lut_tone = build_midtone_lut(ref, wb_stats)
    
    r2, g2, b2, a2 = wb_corrected.split()
    r2 = apply_lut(r2, lut_tone)
    g2 = apply_lut(g2, lut_tone)
    b2 = apply_lut(b2, lut_tone)
    
    return Image.merge("RGBA", (r2, g2, b2, a2))


def collect_raw_images(root: Path) -> list[Path]:
    return sorted(root.rglob("raw/*.webp"))


def log_msg(message: str) -> None:
    print(message, flush=True)


def load_processed_slugs(log_path: Path) -> set[str]:
    if not log_path.exists():
        return set()
    with open(log_path, "r") as f:
        return {line.strip() for line in f if line.strip()}


def save_processed_slug(log_path: Path, slug: str) -> None:
    with open(log_path, "a") as f:
        f.write(f"{slug}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize tire color temperature by reference image.")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("data/img/tires"),
        help="Root tires directory.",
    )
    parser.add_argument(
        "--reference",
        type=Path,
        default=Path("data/img/tires/ha32/raw/ha32-30deg.webp"),
        help="Reference raw image path.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process first N files only (0 = all).",
    )
    parser.add_argument(
        "--use-grayscale-roundtrip",
        action="store_true",
        help="Enable preprocessing step: color -> grayscale -> color.",
    )
    parser.add_argument(
        "--min-luma-ratio",
        type=float,
        default=0.85,
        help="Minimum allowed output/input luma ratio. If lower, keep original image.",
    )
    parser.add_argument(
        "--dark-luma-threshold",
        type=float,
        default=0.30,
        help="If output luma is below this threshold, apply additional brightening.",
    )
    parser.add_argument(
        "--dark-target-luma",
        type=float,
        default=0.33,
        help="Target luma for dark-image brightening.",
    )
    parser.add_argument(
        "--dark-max-boost",
        type=float,
        default=1.20,
        help="Maximum RGB boost factor for dark-image brightening.",
    )
    parser.add_argument(
        "--shadow-lift-strength",
        type=float,
        default=0.18,
        help="Shadow lift strength for dark images (0..1).",
    )
    parser.add_argument(
        "--shadow-lift-pivot",
        type=float,
        default=0.45,
        help="Shadow lift pivot in tonal range (0..1).",
    )
    parser.add_argument(
        "--shadow-lift-gamma",
        type=float,
        default=1.8,
        help="Shadow lift falloff gamma (>0).",
    )
    parser.add_argument(
        "--no-shadow-lift",
        action="store_true",
        help="Disable localized shadow lift step.",
    )
    parser.add_argument(
        "--no-dark-boost",
        action="store_true",
        help="Disable additional dark-image brightening step.",
    )
    parser.add_argument(
        "--processed-log",
        type=Path,
        default=Path("tools/ops/normalized_models.log"),
        help="Path to the log file of processed models (slugs).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-processing of already logged models.",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    reference_path = args.reference.resolve()
    log_path = args.processed_log.resolve()

    if not reference_path.exists():
        raise SystemExit(f"Reference image not found: {reference_path}")

    ref_img = Image.open(reference_path).convert("RGBA")
    ref_stats = compute_stats(ref_img)

    images = collect_raw_images(root)
    if args.limit > 0:
        images = images[: args.limit]
    if not images:
        log_msg("No raw webp images found.")
        return

    processed_slugs = load_processed_slugs(log_path) if not args.force else set()

    log_msg("[INIT] Temperature normalization started")
    log_msg(f"[INIT] reference={reference_path}")
    log_msg(
        "[ANALYZE] reference_stats "
        f"p5={ref_stats.p5:.2f} p95={ref_stats.p95:.2f} "
        f"mean_rgb=({ref_stats.mean_r:.2f},{ref_stats.mean_g:.2f},{ref_stats.mean_b:.2f})"
    )
    
    # Filter images based on processed slugs
    if not args.force:
        images = [p for p in images if p.parent.parent.name not in processed_slugs]

    all_slugs = sorted({p.parent.parent.name for p in images})
    total_tires = len(all_slugs)
    
    if total_tires == 0:
        log_msg("[DONE] No new models to process.")
        return

    log_msg(f"[INIT] tires={total_tires}")
    log_msg(f"[INIT] images={len(images)}")
    log_msg(
        f"[INIT] use_grayscale_roundtrip={args.use_grayscale_roundtrip} "
        f"min_luma_ratio={args.min_luma_ratio:.2f} "
        f"dark_boost={'off' if args.no_dark_boost else 'on'} "
        f"dark_threshold={args.dark_luma_threshold:.2f} "
        f"dark_target={args.dark_target_luma:.2f} "
        f"dark_max_boost={args.dark_max_boost:.2f} "
        f"shadow_lift={'off' if args.no_shadow_lift else 'on'} "
        f"shadow_lift_strength={args.shadow_lift_strength:.2f} "
        f"shadow_lift_pivot={args.shadow_lift_pivot:.2f} "
        f"shadow_lift_gamma={args.shadow_lift_gamma:.2f}"
    )

    total = len(images)
    current_slug = ""
    tire_index = 0
    skipped_dark = 0
    for idx, path in enumerate(images, start=1):
        rel = path.relative_to(root)
        slug = path.parent.parent.name
        
        if slug != current_slug:
            # If we were processing a slug, it's now done (all its images processed)
            if current_slug:
                save_processed_slug(log_path, current_slug)
            
            current_slug = slug
            tire_index += 1
            log_msg(f"[TIRE {tire_index}/{total_tires}] {slug}")
            
        log_msg(f"[{idx}/{total}] START {rel}")
        original = Image.open(path).convert("RGBA")
        pre = compute_stats(original)

        if args.use_grayscale_roundtrip:
            log_msg(f"[{idx}/{total}] STEP 1/3 grayscale-roundtrip")
            base = grayscale_roundtrip(original)
        else:
            log_msg(f"[{idx}/{total}] STEP 1/3 grayscale-roundtrip (skipped)")
            base = original

        out = normalize_image(base, ref_stats)
        log_msg(f"[{idx}/{total}] STEP 2/3 reference-tone-match")
        post = compute_stats(out)

        pre_luma = (pre.mean_r + pre.mean_g + pre.mean_b) / 3.0
        post_luma = (post.mean_r + post.mean_g + post.mean_b) / 3.0
        ratio = post_luma / max(pre_luma, 1e-6)

        if ratio < args.min_luma_ratio:
            skipped_dark += 1
            log_msg(
                f"[{idx}/{total}] SKIP {rel} "
                f"(too dark: luma_ratio={ratio:.3f} < {args.min_luma_ratio:.3f})"
            )
            continue

        # Additional gentle boost for dark outputs.
        if (not args.no_dark_boost) and post_luma < args.dark_luma_threshold:
            if not args.no_shadow_lift:
                before_luma = post_luma
                out = apply_shadow_lift(
                    out,
                    strength=args.shadow_lift_strength,
                    pivot=args.shadow_lift_pivot,
                    gamma=args.shadow_lift_gamma,
                )
                post_shadow = compute_stats(out)
                post_luma = (post_shadow.mean_r + post_shadow.mean_g + post_shadow.mean_b) / 3.0
                log_msg(
                    f"[{idx}/{total}] SHADOW-LIFT "
                    f"luma={before_luma:.3f} -> {post_luma:.3f} "
                    f"strength={args.shadow_lift_strength:.2f}"
                )

            boost = clamp(
                args.dark_target_luma / max(post_luma, 1e-6),
                1.0,
                args.dark_max_boost,
            )
            if boost > 1.001:
                out = apply_rgb_gain(out, boost)
                post2 = compute_stats(out)
                post_luma2 = (post2.mean_r + post2.mean_g + post2.mean_b) / 3.0
                log_msg(
                    f"[{idx}/{total}] DARK-BOOST "
                    f"luma={post_luma:.3f} -> {post_luma2:.3f} "
                    f"factor={boost:.3f}"
                )

        out.save(path, format="WEBP", quality=90, method=6)
        log_msg(f"[{idx}/{total}] STEP 3/3 save raw")

        # Generate 400x400 version
        preview_dir = path.parent.parent / "400"
        preview_dir.mkdir(parents=True, exist_ok=True)
        preview_path = preview_dir / path.name
        
        # Resize to 400x400
        preview_img = out.resize((400, 400), resample=Image.LANCZOS)
        preview_img.save(preview_path, format="WEBP", quality=85, method=6)
        log_msg(f"[{idx}/{total}] STEP 4/4 save 400x400")

        log_msg(f"[{idx}/{total}] OK {rel} (luma_ratio={ratio:.3f})")

    # Save the last slug processed
    if current_slug:
        save_processed_slug(log_path, current_slug)

    log_msg(f"[DONE] Processed {total} image(s), skipped_dark={skipped_dark}")


if __name__ == "__main__":
    main()
