#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""剧境 DramaRef 站点图标：橙色圆角块 + 深色衣架
   同一份几何同时产出 favicon.svg / favicon.ico / apple-touch-icon.png / icon-192.png"""
import json, subprocess, sys, time, urllib.request, urllib.parse, base64, os
import websocket
from pathlib import Path
from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 9581
OUTDIR = str(Path(__file__).resolve().parents[1])
SIZE = 512

# ---- 几何：32×32 网格，笔画重量按 16px 观感调过 ----
INK = "#0B0C10"
HOOK_R, HOOK_SW = 3.30, 2.85
BODY_SW = 2.95
HALF_W = 11.30
APEX_Y, BASE_Y = 11.60, 23.60
R_CORNER = 1.95

HOOK = (f'<path d="M{16-HOOK_R*0.62:.2f} 6.00'
        f'a{HOOK_R} {HOOK_R} 0 1 1 {HOOK_R*1.42:.2f} {HOOK_R*0.925:.2f}'
        f'c-0.85 0.38-1.40 1.05-1.40 1.90v1.30" fill="none" stroke="{INK}" '
        f'stroke-width="{HOOK_SW}" stroke-linecap="round"/>')

BODY = (f'<path d="M16 {APEX_Y} {16-HALF_W:.2f} {BASE_Y-3.5:.2f}'
        f'a{R_CORNER} {R_CORNER} 0 0 0 1.17 3.5'
        f'h{(HALF_W-1.17)*2:.2f}'
        f'a{R_CORNER} {R_CORNER} 0 0 0 1.17-3.5Z" fill="none" stroke="{INK}" '
        f'stroke-width="{BODY_SW}" stroke-linejoin="round"/>')

GRAD = ('<defs><linearGradient id="eg" x1="0" y1="0" x2="0.85" y2="1">'
        '<stop offset="0" stop-color="#FF9350"/>'
        '<stop offset="0.55" stop-color="#FF6B3D"/>'
        '<stop offset="1" stop-color="#DC3F17"/></linearGradient></defs>')


def svg(radius=7.5, pretty=False):
    if pretty:
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  '
                + GRAD + '\n  '
                + f'<rect width="32" height="32" rx="{radius}" fill="url(#eg)"/>\n  '
                + HOOK + '\n  ' + BODY + '\n</svg>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
            + GRAD + f'<rect width="32" height="32" rx="{radius}" fill="url(#eg)"/>'
            + HOOK + BODY + '</svg>')


def html(markup, size, bg="transparent"):
    return (f'<!doctype html><html><head><meta charset="utf-8">'
            f'<style>html,body{{margin:0;padding:0;background:{bg};}}'
            f'svg{{display:block;width:{size}px;height:{size}px}}</style></head>'
            f'<body>{markup}</body></html>')


def shoot(page_path, out, size):
    proc = subprocess.Popen([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
                             f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
                             f"--window-size={size},{size}", "--hide-scrollbars",
                             "--user-data-dir=/tmp/pc/cdp-fav", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    tgt = None
    url = "file://" + page_path
    for _ in range(60):
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{PORT}/json/new?{urllib.parse.quote(url, safe='')}",
                method="PUT")
            tgt = json.loads(urllib.request.urlopen(req, timeout=2).read())
            break
        except Exception:
            time.sleep(0.3)
    ws = websocket.create_connection(tgt["webSocketDebuggerUrl"], timeout=60)
    mid = [0]

    def cmd(method, **params):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == mid[0]:
                return m

    cmd("Page.enable")
    cmd("Emulation.setDeviceMetricsOverride", width=size, height=size,
        deviceScaleFactor=1, mobile=False)
    cmd("Emulation.setDefaultBackgroundColorOverride", color={"r": 0, "g": 0, "b": 0, "a": 0})
    time.sleep(1.2)
    shot = cmd("Page.captureScreenshot", format="png",
               clip={"x": 0, "y": 0, "width": size, "height": size, "scale": 1})
    open(out, "wb").write(base64.b64decode(shot["result"]["data"]))
    ws.close()
    proc.terminate()
    proc.wait(timeout=10)


if __name__ == "__main__":
    tmp = "/tmp/pc/_favrender.html"

    open(tmp, "w", encoding="utf-8").write(html(svg(7.5), SIZE))
    shoot(tmp, "/tmp/pc/fav512.png", SIZE)

    open(tmp, "w", encoding="utf-8").write(html(svg(0), SIZE))
    shoot(tmp, "/tmp/pc/fav512_sq.png", SIZE)

    master = Image.open("/tmp/pc/fav512.png").convert("RGBA")
    square = Image.open("/tmp/pc/fav512_sq.png").convert("RGBA")

    def fit(img, s):
        return img.resize((s, s), Image.LANCZOS)

    fit(square, 180).save(f"{OUTDIR}/apple-touch-icon.png", optimize=True)
    fit(master, 192).save(f"{OUTDIR}/icon-192.png", optimize=True)
    fit(master, 32).save(f"{OUTDIR}/icon-32.png", optimize=True)
    fit(master, 48).save(f"{OUTDIR}/favicon.ico", format="ICO",
                         sizes=[(16, 16), (24, 24), (32, 32), (48, 48)])

    open(f"{OUTDIR}/favicon.svg", "w", encoding="utf-8").write(svg(7.5, pretty=True) + "\n")

    for f in ("favicon.svg", "favicon.ico", "apple-touch-icon.png", "icon-192.png"):
        print(f, os.path.getsize(f"{OUTDIR}/{f}"))
