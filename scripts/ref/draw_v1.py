#!/usr/bin/env python3
"""Independent reference for whirlpick-draw-v1 (Python 3, stdlib only: hashlib + unicodedata).

Written from the published algorithm (PLAN §2 / the /about/#algorithm page), not from the
TypeScript. It reproduces the primitives and pick draws so anyone can check a Whirlpick receipt
without trusting our code.

  python3 scripts/ref/draw_v1.py --check packages/core/test/vectors.json   # V0–V2 goldens
  python3 scripts/ref/draw_v1.py --verify receipt.json                     # re-run a pick receipt
"""
import hashlib
import math
import json
import sys
import unicodedata


def H(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def tag(s: str) -> bytes:
    return s.encode("utf-8") + b"\x00"


def u32be(x: int) -> bytes:
    return x.to_bytes(4, "big")


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def milli_weight(w) -> int:
    m = round(w * 1000)
    if not (abs(w * 1000 - m) < 1e-6 and 1 <= m <= 1_000_000_000):
        raise ValueError(f"invalid weight {w}")
    return m


def wheel_bytes(entries) -> bytes:
    out = bytearray(tag("whirlpick-wheel-v1"))
    out += u32be(len(entries))
    for e in entries:
        label = nfc(e["label"]).encode("utf-8")
        out += u32be(len(label)) + label
        out += u32be(milli_weight(e["weight"]))
        out += bytes([1 if e["enabled"] else 0])
        tags = e.get("tags") or []
        out += u32be(len(tags))
        for t in tags:
            tb = nfc(t).encode("utf-8")
            out += u32be(len(tb)) + tb
    return bytes(out)


def wheel_hash(entries) -> str:
    return H(wheel_bytes(entries)).hex()


def seed_from_phrase(phrase: str) -> str:
    return H(tag("whirlpick-seed-v1") + nfc(phrase).encode("utf-8")).hex()


def commitment_for(seed_hex: str) -> str:
    return H(tag("whirlpick-commit-v1") + bytes.fromhex(seed_hex)).hex()


def normalise_public_input(s):
    if s is None:
        return None
    t = nfc(s).strip()
    return t if t else None


def stream_key(seed_hex: str, public_input) -> bytes:
    seed = bytes.fromhex(seed_hex)
    pi = normalise_public_input(public_input)
    if pi is None:
        return seed
    return H(tag("whirlpick-mix-v1") + seed + pi.encode("utf-8"))


class Stream:
    """block(c) = H(tag("whirlpick-draw-v1") ‖ key ‖ wheelHashRaw ‖ u32be(spinIndex) ‖ u32be(c))."""

    def __init__(self, seed_hex, wheel_hash_hex, spin_index, public_input=None):
        self.prefix = tag("whirlpick-draw-v1") + stream_key(seed_hex, public_input) + bytes.fromhex(wheel_hash_hex) + u32be(spin_index)
        self.counter = 0
        self.buf = b""
        self.consumed = 0

    def read(self, n: int) -> bytes:
        while len(self.buf) < n:
            self.buf += H(self.prefix + u32be(self.counter))
            self.counter += 1
        out, self.buf = self.buf[:n], self.buf[n:]
        self.consumed += n
        return out

    def u32(self) -> int:
        return int.from_bytes(self.read(4), "big")

    def rand_below(self, n: int, width: int = 8) -> int:
        return rand_below_width(self.read, n, width)


def rand_below_width(read, n: int, width: int) -> int:
    rng = 1 << (8 * width)
    if not 1 <= n <= rng:
        raise ValueError("n out of range")
    if n == 1:
        return 0
    limit = rng - (rng % n)
    while True:
        x = int.from_bytes(read(width), "big")
        if x < limit:
            return x % n


def draw_picks(entries, seed_hex, public_input, spin_index, count, excluded=()):
    wh = wheel_hash(entries)
    ex = set(excluded)
    working = [(i, e["label"], milli_weight(e["weight"])) for i, e in enumerate(entries) if e["enabled"] and i not in ex]
    k = len(working) if count == "all" else count
    if k > len(working):
        raise ValueError("COUNT_TOO_LARGE")
    s = Stream(seed_hex, wh, spin_index, public_input)
    picks = []
    for _ in range(k):
        total = sum(w for _, _, w in working)
        r = s.rand_below(total)
        cum = 0
        pos = len(working) - 1
        for j, (_, _, w) in enumerate(working):
            cum += w
            if r < cum:
                pos = j
                break
        landing = s.u32()
        idx, label, _ = working[pos]
        picks.append({"index": idx, "label": label, "landingU32": landing})
        del working[pos]
    return wh, picks


def landing_turn(entries, excluded, index, landing_u32):
    ex = set(excluded)
    el = [(i, milli_weight(e["weight"])) for i, e in enumerate(entries) if e["enabled"] and i not in ex]
    total = sum(w for _, w in el)
    before = 0
    for i, w in el:
        if i == index:
            f = 0.05 + 0.90 * (landing_u32 / 2**32)
            return (before + f * w) / total
        before += w
    raise ValueError("index not eligible")


def check(path: str) -> int:
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    inp, exp = doc["inputs"], doc["expected"]
    fails = []

    def eq(name, got, want):
        ok = got == want
        print(f"{'ok  ' if ok else 'FAIL'} {name}: {got}" + ("" if ok else f" (expected {want})"))
        if not ok:
            fails.append(name)

    v0 = inp["V0"]
    e0 = exp["V0"]
    eq("V0 wheelBytesHex", wheel_bytes(v0["entries"]).hex(), e0["wheelBytesHex"])
    wh0 = wheel_hash(v0["entries"])
    eq("V0 wheelHash", wh0, e0["wheelHash"])
    eq("V0 commitment", commitment_for(v0["seed"]), e0["commitment"])
    eq("V0 block0", H(tag("whirlpick-draw-v1") + bytes.fromhex(v0["seed"]) + bytes.fromhex(wh0) + u32be(0) + u32be(0)).hex(), e0["block0"])
    s = Stream(v0["seed"], wh0, 0)
    eq("V0 randBelow(10) x5", [s.rand_below(10) for _ in range(5)], e0["randBelow10"])
    eq("V0 seedFromPhrase", seed_from_phrase(v0["phrase"]), e0["seedFromPhrase"])
    rej = v0["rejection"]
    src = list(rej["bytes"])
    pos = [0]

    def read(n):
        out = bytes(src[pos[0]:pos[0] + n])
        pos[0] += n
        return out

    eq("V0 rejection result", rand_below_width(read, rej["n"], rej["width"]), e0["rejection"]["result"])
    eq("V0 rejection consumed", pos[0], e0["rejection"]["consumed"])

    v1 = inp["V1"]
    e1 = exp["V1"]
    s1 = Stream(v0["seed"], wh0, v1["spinIndex"], v1["publicInput"])
    eq("V1 r", s1.rand_below(4000), e1["r"])
    eq("V1 landingU32 (stream)", s1.u32(), e1["landingU32"])
    _, picks1 = draw_picks(v0["entries"], v0["seed"], v1["publicInput"], v1["spinIndex"], 1)
    eq("V1 winner.index", picks1[0]["index"], e1["winnerIndex"])
    eq("V1 winner.label", picks1[0]["label"], e1["winnerLabel"])
    eq("V1 landingU32", picks1[0]["landingU32"], e1["landingU32"])
    lt = landing_turn(v0["entries"], [], picks1[0]["index"], picks1[0]["landingU32"])
    eq("V1 landingTurn", float(e1["landingTurn"]) == lt, True)
    r0, extra, p = v1["r0"], v1["extra"], v1["pointerTurn"]
    x = p - lt - r0
    fr = r0 + extra + (x - math.floor(x))
    eq("V1 finalRotation", float(e1["finalRotation"]) == fr, True)
    eq("V1 receipt result", e1["receipt"]["result"]["picks"], picks1)
    eq("V1 receipt wheelHash", e1["receipt"]["wheelHash"], wh0)
    eq("V1 receipt commitment", e1["receipt"]["commitment"], commitment_for(v0["seed"]))

    v2 = inp["V2"]
    e2 = exp["V2"]
    eq("V2 wheelHash", wheel_hash(v2["entries"]), e2["wheelHash"])
    eq("V2 key", stream_key(v2["seed"], v2["publicInput"]).hex(), e2["key"])
    eq("V2 T", sum(milli_weight(e["weight"]) for e in v2["entries"] if e["enabled"]), e2["T"])
    _, picks2 = draw_picks(v2["entries"], v2["seed"], v2["publicInput"], v2["spinIndex"], v2["count"])
    eq("V2 picks", picks2, e2["picks"])

    print(f"\n{'All reference checks passed' if not fails else str(len(fails)) + ' reference check(s) FAILED'} ({path})")
    return 1 if fails else 0


def verify(path: str) -> int:
    """Re-run a single/multi/elimination receipt (teams are checked by the TypeScript verifier)."""
    with open(path, encoding="utf-8") as fh:
        r = json.load(fh)
    if r.get("algorithm") != "whirlpick-draw-v1":
        print("unknown algorithm")
        return 4
    wh = wheel_hash(r["entries"])
    print(f"wheelHash   {'ok' if wh == r['wheelHash'] else 'MISMATCH'} {wh}")
    if r.get("seed") is None:
        print(f"not revealed; commitment {r['commitment']}")
        return 5
    c = commitment_for(r["seed"])
    print(f"commitment  {'ok' if c == r['commitment'] else 'MISMATCH'} {c}")
    if r["mode"] == "teams":
        print("teams receipts: use `whirlpick verify`")
        return 0 if wh == r["wheelHash"] and c == r["commitment"] else 4
    _, picks = draw_picks(r["entries"], r["seed"], r.get("publicInput"), r["spinIndex"], r["params"].get("count", 1), r["params"].get("excluded", []))
    same = [(p["index"], p["landingU32"]) for p in picks] == [(p["index"], p["landingU32"]) for p in r["result"]["picks"]]
    print(f"result      {'ok' if same else 'MISMATCH'} {[p['label'] for p in picks]}")
    return 0 if same and wh == r["wheelHash"] and c == r["commitment"] else 4


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--check":
        sys.exit(check(sys.argv[2]))
    if len(sys.argv) == 3 and sys.argv[1] == "--verify":
        sys.exit(verify(sys.argv[2]))
    print(__doc__)
    sys.exit(2)
