"""Recortes 16:9 centrados no surfista (os quadros do jogo mostram a onda inteira)."""
import os
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
D = os.path.join(ROOT, "brand/photography/game")
FOCUS = {"air-reverse-pico": (0.41, 0.24), "indy-rampa": (0.37, 0.30), "360-pico": (0.42, 0.27), "backflip-lagoa": (0.37, 0.22),
         "superman-rampa": (0.37, 0.29), "method-pico": (0.36, 0.33), "decolagem-pico": (0.35, 0.33), "stalefish-lagoa": (0.36, 0.32)}
os.makedirs(os.path.join(D, "crops"), exist_ok=True)
for n, (fx, fy) in FOCUS.items():
    im = Image.open(os.path.join(D, n + ".jpg")).convert("RGB")
    W, H = im.size
    cw, ch = int(W * 0.55), int(H * 0.55)
    x = min(max(int(fx * W - cw / 2), 0), W - cw)
    y = min(max(int(fy * H - ch * 0.42), 0), H - ch)
    im.crop((x, y, x + cw, y + ch)).resize((1600, 900), Image.LANCZOS).save(os.path.join(D, "crops", n + ".jpg"), quality=88)
print("ok")
