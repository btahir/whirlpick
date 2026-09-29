// Runs before first paint (a tiny external file because the CSP forbids inline scripts):
// applies the saved light/dark choice and stream-mode background so nothing flashes.
(function () {
  var d = document.documentElement;
  try {
    var s = localStorage.getItem("whirlpick:scheme");
    if (s === "light" || s === "dark") d.setAttribute("data-theme", s);
  } catch (e) {}
  try {
    var q = new URLSearchParams(location.search);
    var st = q.get("stream"), bg = q.get("bg");
    if (st && st !== "0") {
      var v = st === "1" ? bg || "transparent" : st;
      if (v === "green" || v === "00B140") d.setAttribute("data-stream", "green");
      else if (v === "magenta" || v === "FF00FF") d.setAttribute("data-stream", "magenta");
      else if (/^#?[0-9a-fA-F]{6}$/.test(v)) { d.setAttribute("data-stream", "custom"); d.style.setProperty("--wp-ground", "#" + v.replace("#", "")); }
      else d.setAttribute("data-stream", "transparent");
    } else if (bg) {
      if (bg === "transparent") d.setAttribute("data-bg", "transparent");
      else if (/^#?[0-9a-fA-F]{6}$/.test(bg)) d.style.setProperty("--wp-ground", "#" + bg.replace("#", ""));
    }
    if (q.get("embed") === "1" || location.pathname.indexOf("/embed/") === 0) d.setAttribute("data-embed", "");
  } catch (e) {}
})();
