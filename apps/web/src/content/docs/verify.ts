import type { DocPage } from "../types";

const PY_CHECK = `# check_receipt.py: re-run a single, multi or elimination draw from a receipt.
# Python 3 standard library only. Usage: python3 check_receipt.py receipt.json
import hashlib, json, sys, unicodedata

def H(b): return hashlib.sha256(b).digest()
def tag(s): return s.encode() + b"\\x00"
def u32(n): return n.to_bytes(4, "big")
def nfc(s): return unicodedata.normalize("NFC", s).encode()
def milli(e): return round(e.get("weight", 1) * 1000)

r = json.load(open(sys.argv[1], encoding="utf-8"))
entries = r["entries"]

wb = tag("whirlpick-wheel-v1") + u32(len(entries))
for e in entries:
    label = nfc(e["label"])
    wb += u32(len(label)) + label + u32(milli(e)) + bytes([1 if e.get("enabled", True) else 0])
    tags = e.get("tags", [])
    wb += u32(len(tags))
    for t in tags:
        tb = nfc(t)
        wb += u32(len(tb)) + tb
wheel_hash = H(wb)
print("list fingerprint matches:", wheel_hash.hex() == r["wheelHash"])

seed = bytes.fromhex(r["seed"])
print("commitment matches:", H(tag("whirlpick-commit-v1") + seed).hex() == r["commitment"])
pi = r.get("publicInput")
key = seed if pi is None else H(tag("whirlpick-mix-v1") + seed + nfc(pi))

class Stream:
    def __init__(self):
        self.c, self.buf = 0, b""
    def take(self, n):
        while len(self.buf) < n:
            self.buf += H(tag("whirlpick-draw-v1") + key + wheel_hash + u32(r["spinIndex"]) + u32(self.c))
            self.c += 1
        out, self.buf = self.buf[:n], self.buf[n:]
        return out
    def below(self, n):
        if n == 1:
            return 0
        limit = 2**64 - (2**64 % n)
        while True:
            x = int.from_bytes(self.take(8), "big")
            if x < limit:
                return x % n

s = Stream()
excluded = r["params"].get("excluded", [])
eligible = [i for i, e in enumerate(entries) if e.get("enabled", True) and i not in excluded]
count = r["params"].get("count", 1)
count = len(eligible) if count == "all" else count
picks = []
for _ in range(count):
    x, acc = s.below(sum(milli(entries[i]) for i in eligible)), 0
    for i in eligible:
        acc += milli(entries[i])
        if x < acc:
            winner = i
            break
    picks.append({"index": winner, "landingU32": int.from_bytes(s.take(4), "big")})
    eligible.remove(winner)
claimed = [{"index": p["index"], "landingU32": p["landingU32"]} for p in r["result"]["picks"]]
print("result matches:", picks == claimed)
for p in picks:
    print("winner:", entries[p["index"]]["label"])`;

export const VERIFY_DOC: DocPage = {
  path: "/verify/",
  title: "Verify a Whirlpick draw receipt",
  description:
    "Paste a Whirlpick receipt to re-run the draw on your device and check the seed, commitment and list fingerprint. Or check it offline with the CLI or SHA-256.",
  h1: "Check a draw receipt",
  intro:
    "Paste a receipt, drop a receipt file or open a verify link, and this page re-runs the draw in your browser. It rebuilds the list fingerprint, the commitment and the winners from the published algorithm and compares each with what the receipt claims. Nothing is uploaded. If you saw a commitment before the spin, enter it too, so the check can confirm the receipt belongs to that draw.",
  sections: [
    {
      h2: "What a receipt is",
      body: [
        "Whirlpick writes a receipt for every spin. It is a small JSON document holding everything needed to repeat the draw: the algorithm version `whirlpick-draw-v1`, the full list of entries with their weights, the list fingerprint (`wheelHash`), the seed, the commitment, any room word, the spin number, the mode and its settings, and the result.",
        "The app's receipt dialog offers it as JSON to copy or download, as a verify link and as a replay link. The draw doesn't depend on anything the receipt leaves out, such as colours, theme, images or the time, so none of that is checked.",
      ],
    },
    {
      h2: "What each check means",
      id: "checks",
      body: [
        "The checks run in this order. Each one shows as a line in the result above.",
        {
          table: {
            head: ["#", "Check", "If it fails"],
            rows: [
              ["1", "The text is a JSON object.", "`BAD_JSON`"],
              ["2", "It is a Whirlpick receipt, version 1.", "`UNSUPPORTED_VERSION`"],
              ["3", "The algorithm is `whirlpick-draw-v1`.", "`UNKNOWN_ALGORITHM`"],
              ["4", "It matches the receipt schema, and every label, tag and weight is valid.", "`SCHEMA_INVALID`, with the path of the bad field"],
              ["5", "The reserved `beacon` field is empty.", "`BEACON_UNSUPPORTED`"],
              ["6", "The list wasn't changed: the fingerprint recomputed from the entries equals `wheelHash`.", "`WHEEL_HASH_MISMATCH`"],
              ["7", "If you entered the fingerprint you saw before the spin, it equals `wheelHash`.", "`EXPECTED_WHEEL_MISMATCH`"],
              ["8", "The seed has been revealed.", "Not a failure. The status is \"not revealed yet\" and the check stops here, showing the commitment."],
              ["9", "If the seed came from a phrase, the phrase gives that seed.", "`SEED_PHRASE_MISMATCH`"],
              ["10", "The seed matches the commitment: SHA-256 of the seed, with its prefix, equals `commitment`.", "`COMMITMENT_MISMATCH`"],
              ["11", "If you entered the commitment you saw before the spin, it equals `commitment`.", "`EXPECTED_COMMITMENT_MISMATCH`"],
              ["12", "The settings make sense for the mode: excluded entries exist and are enabled, the count fits, team rules are valid.", "`PARAMS_INVALID`"],
              ["13", "Re-running the draw gives the same winners and landing spots, or the same teams.", "`RESULT_MISMATCH`, showing expected and claimed"],
              ["14", "Each winner's label matches the entry at that position in the list.", "`LABEL_MISMATCH`"],
              ["15", "The list at commitment time is the list that was drawn from.", "A warning, `WHEEL_CHANGED_AFTER_COMMIT`. The receipt still verifies, but entries were edited after the commitment was shown."],
            ],
          },
        },
        "The result is **valid** when every check passes, **invalid** when any check fails, and **not revealed yet** when the seed is still secret. A valid receipt can still carry the list-changed warning, and that deserves a question to the host.",
        "Checks 7 and 11 are the ones that tie a receipt to what you personally saw. Without them, the page proves the receipt is consistent with itself. With them, it proves this is the draw that was announced.",
      ],
    },
    {
      h2: "Verify offline with the CLI",
      id: "cli",
      body: [
        "The `whirlpick` command-line tool runs the same checks with no network. Install it from the repository as described in [Whirlpick for agents](/docs/agents/), then:",
        {
          code: "whirlpick verify receipt.json --commitment <hex you saw> --wheel-hash <fingerprint you saw>\n\n# a verify link or share code works too\nwhirlpick verify \"{SITE_URL}/verify/#r=1.…\" --json",
          lang: "bash",
        },
        "Exit code 0 means valid, 4 means invalid and 5 means the seed isn't revealed yet. `--json` prints the full report with every check.",
      ],
    },
    {
      h2: "Check the commitment by hand",
      id: "by-hand",
      body: [
        "You don't have to trust this page or our CLI. The commitment is SHA-256 over the bytes of the text `whirlpick-commit-v1`, one zero byte, and the 32 seed bytes. Any SHA-256 tool can recompute it:",
        {
          code: "printf 'whirlpick-commit-v1\\000' > commit.bin\nprintf '%s' \"<seed from the receipt>\" | xxd -r -p >> commit.bin\nshasum -a 256 commit.bin      # or: sha256sum commit.bin",
          lang: "bash",
        },
        "The printed hash must equal the commitment you saw before the spin. If it does, the host couldn't have switched seeds after committing.",
      ],
    },
    {
      h2: "Re-run the draw yourself",
      id: "script",
      body: [
        "This short Python script, written from the public spec, recomputes the list fingerprint, the commitment and the winners for single, multi and elimination receipts. Team splits have more steps, so use the CLI or the [full algorithm](/about/#algorithm) for those.",
        { code: PY_CHECK, lang: "python" },
        "To read a receipt out of a verify link, take the code after `#r=`, drop the `1.` prefix, base64url-decode it and inflate it as raw deflate. In Python that is `zlib.decompress(base64.urlsafe_b64decode(code[2:] + \"==\"), -15)`.",
      ],
    },
  ],
  faq: [
    {
      q: "What does a valid receipt prove?",
      a: "That the winners follow from the published algorithm, the listed entries and the revealed seed, and that the seed matches the commitment. If you saw the commitment before the spin, the host couldn't have changed the seed after seeing the result.",
    },
    {
      q: "Could the host have tried lots of seeds before committing?",
      a: "Yes, a commitment alone doesn't stop that. The room word does: someone in the audience gives a word after the commitment is shown, and it is mixed into the draw, so a seed picked in advance can't steer the result. The receipt records the word so you can see it was used.",
    },
    {
      q: "Why does it say the seed isn't revealed yet?",
      a: "In fair-draw sessions with several spins, the host can keep one seed for all of them and reveal it at the end. Until then the receipt carries only the commitment. Ask the host for the revealed receipt once the session is over.",
    },
    {
      q: "Does verifying send the receipt anywhere?",
      a: "No. The check runs in this page on your device, and verify links keep the receipt in the part of the URL after the # sign, which browsers never send to a server.",
    },
  ],
  updated: "2026-09-29",
};
