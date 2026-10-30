#!/usr/bin/env python3
"""End-to-end check of the jewellery try-on flow.

Runs: /health -> /uploadDp -> /generateImageByUrl -> /deleteUserImages
using a throwaway userId, and prints where it breaks.

Usage:
    pip install requests
    python scripts/test_tryon.py face.jpg
    python scripts/test_tryon.py face.jpg --url http://localhost:3000 --type necklace --jewel https://...
"""
import argparse
import json
import sys
import time

import requests

DEFAULT_URL = "https://igm-api-4npg.onrender.com"
DEFAULT_JEWEL = "https://www.experapps.xyz/media/catalog/product/1/2/1200x1200px_1174_y-_viwe1.jpg"

HINTS = {
    "Payment Required": "Gemini credits depleted - top up billing in AI Studio.",
    "API key": "GEMINI_API_KEY missing/invalid on the server.",
    "429": "Gemini rate limit / quota hit.",
    "reading 'inlineData'": "Gemini returned no image (likely safety block on the photo).",
    "User profile picture not found": "Uploaded photo is gone - server disk is ephemeral or request hit another instance.",
    "JSON": "jewelleryUrls is not valid JSON.",
    "Request failed with status code": "Server could not download the jewellery image URL.",
}


def step(name, resp):
    ok = resp.ok
    print(f"[{'OK' if ok else 'FAIL'}] {name}: {resp.status_code} ({resp.elapsed.total_seconds():.1f}s)")
    if not ok:
        body = resp.text
        print(f"       {body[:500]}")
        for needle, hint in HINTS.items():
            if needle in body:
                print(f"  hint: {hint}")
                break
    return ok


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("face", help="path to a photo of a person")
    p.add_argument("--url", default=DEFAULT_URL, help="API base URL")
    p.add_argument("--type", default="earring", help="earring|necklace|pendant|ring|bracelet|bangle")
    p.add_argument("--jewel", default=DEFAULT_JEWEL, help="jewellery image URL")
    p.add_argument("--out", default="tryon_result.png", help="where to save the generated image")
    p.add_argument("--keep", action="store_true", help="don't delete the test images afterwards")
    args = p.parse_args()

    base = args.url.rstrip("/")
    stamp = int(time.time())
    user_id = f"tryon_test_{stamp}"
    product_id = f"probe_{stamp}"  # unique so the server's disk cache never short-circuits Gemini

    # Render free instances can take ~1 min to wake up.
    if not step("health", requests.get(f"{base}/health", timeout=120)):
        sys.exit(1)

    with open(args.face, "rb") as f:
        r = requests.post(f"{base}/uploadDp", data={"userId": user_id},
                          files={"userFace": (args.face, f, "image/jpeg")}, timeout=60)
    if not step("uploadDp", r):
        sys.exit(1)

    # (None, value) sends plain multipart fields - the route uses multer's upload.none()
    fields = {
        "userId": user_id,
        "productId": product_id,
        "jewelleryUrls": json.dumps({args.type: args.jewel}),
    }
    r = requests.post(f"{base}/generateImageByUrl", timeout=300,
                      files={k: (None, v) for k, v in fields.items()})
    passed = step("generateImageByUrl", r)
    if passed:
        with open(args.out, "wb") as f:
            f.write(r.content)
        print(f"       saved {len(r.content)} bytes ({r.headers.get('Content-Type')}) to {args.out}")

    if not args.keep:
        step("deleteUserImages", requests.delete(f"{base}/deleteUserImages/{user_id}", timeout=60))

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
