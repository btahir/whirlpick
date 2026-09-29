// UI copy in one module (i18n-ready, PLAN §6.13). Fixed strings from SPEC §11.
export const t = {
  spin: "Spin",
  spinning: "Spinning…",
  addOneMore: "Add one more name",
  pastePlaceholder: "Paste names, one per line",
  wheelPicked: "The wheel picked",
  wheelPickedMany: "The wheel picked",
  spinAgain: "Spin again",
  nextSpin: "Next spin",
  remove: (name: string) => `Remove ${name}`,
  putEveryoneBack: "Put everyone back",
  everyoneHadTurn: "Everyone has had a turn",
  fairCommitted: "Fair draw",
  fairCommittedSub: "committed before the spin",
  seedRevealed: "Seed revealed",
  seedRevealedSub: "hash matches",
  receipt: "Receipt",
  checksOut: "Checks out",
  doesntMatch: "Doesn't match",
  notRevealed: "Not revealed yet",
  supportAsk: "Whirlpick is free and ad-free.",
  supportAskLink: "Support it?",
  saved: "Saved",
  share: "Share",
  support: "Support",
  onTheWheel: (on: number, all: number) => (on === all ? `${fmt(all)} on the wheel` : `${fmt(on)} of ${fmt(all)} on the wheel`),
  entriesCount: (n: number) => `${fmt(n)} ${n === 1 ? "entry" : "entries"}`,
  lockedWhileSpinning: "Locked while the wheel spins",
  spinLabel: (n: number) => `Spin the wheel: ${fmt(n)} ${n === 1 ? "entry" : "entries"}`,
  winnerAnnounce: (name: string) => `Winner: ${name}`,
  winnersAnnounce: (names: string[]) => `Winners: ${names.join(", ")}`,
  teamsAnnounce: (n: number) => `${n} teams made`,
  removedAnnounce: (name: string) => `${name} removed`,
  toast: {
    notWhirl: "That file isn't a Whirlpick wheel.",
    damagedLink: "This link is damaged. Nothing was loaded.",
    storageFull: "Couldn't save. Your browser storage is full.",
    noImagesInLinks: "Images aren't included in share links.",
    linkCopied: "Link copied.",
    removed: (name: string) => `${name} removed from the wheel.`,
    wheelDeleted: "Wheel deleted.",
    commitmentCopied: "Commitment copied.",
    copied: "Copied.",
    historyCleared: "History cleared.",
    kept1000: "Kept the first 1,000 entries.",
    imported: (n: number) => `Imported ${fmt(n)} ${n === 1 ? "entry" : "entries"}.`,
    updateReady: "An update is ready.",
    everyoneBack: "Everyone is back on the wheel.",
    savedWheel: "Saved to your wheels.",
  },
  notSaving: "This browser isn't saving. Export a file to keep your wheel.",
  imagesNeedIdb: "Images can't be saved in this browser. Export a file to keep them.",
  replayBanner: "Replaying a recorded draw",
  unsavedBanner: "Opened from a link. Your saved wheels are untouched.",
  saveToMyWheels: "Save to my wheels",
};

export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** "7c3e 91ab 5f02 … e8d1 04f2": groups of 4, middle elided (SPEC §4). */
export function groupHash(hex: string, keep = 3): string {
  if (!hex) return "";
  const groups = hex.match(/.{1,4}/g) ?? [];
  if (groups.length <= keep * 2) return groups.join(" ");
  return `${groups.slice(0, keep).join(" ")} … ${groups.slice(-2).join(" ")}`;
}

export function shortHex(hex: string | null | undefined): string {
  if (!hex) return "";
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
}
