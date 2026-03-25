// CartographieGenerator.js — V5b
// Carte 1: Pistes+Ouvrages | Carte 2: Zones de production
// Fix: Préfecture de X dans le header

import jsPDF from "jspdf";
import dataservice from "./dataservice";
import ndgrLogo from "../assets/NDGR_Logo.png";
import etafatLogo from "../assets/etafat.png";
import isadesLogo from "../assets/isades.png";
import urbaplanLogo from "../assets/urbaplan.png";

var CW = 3500,
  CH = 2000;

// ── OPTIONS D'AFFICHAGE ──
// Pour réactiver les étiquettes des localités : passer à true
var SHOW_LOCALITE_LABELS = true;
var MARGIN = 30,
  HEADER_H = 200;
var MAP = {
  x: MARGIN,
  y: HEADER_H + 10,
  w: 2700,
  h: CH - HEADER_H - 50,
};
var prefColors = [
  "rgba(144,238,144,0.55)", "rgba(255,228,181,0.55)", "rgba(221,160,221,0.55)",
  "rgba(255,218,185,0.55)", "rgba(152,251,152,0.55)", "rgba(230,230,250,0.55)",
  "rgba(255,255,153,0.55)", "rgba(255,182,193,0.55)", "rgba(204,255,204,0.55)",
  "rgba(255,210,160,0.55)",
];

// ── COLLISION GLOBALE DES ÉTIQUETTES + PISTES ──
var _labelBoxes = [];
var _pisteSegs   = [];

function resetLabels() { _labelBoxes = []; _pisteSegs = []; }
function registerLabel(x, y, w, h) { _labelBoxes.push({ x: x, y: y, w: w, h: h }); }
function registerPisteSeg(ax, ay, bx, by) { _pisteSegs.push({ ax: ax, ay: ay, bx: bx, by: by }); }

function distToSeg(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Pénalité piste — uniquement pour labels localités (pas pour labels pistes)
var LOCALITE_PISTE_CLEARANCE = 7;
function pisteOverlap(cx, cy, w, h) {
  if (_pisteSegs.length === 0) return 0;
  var pts = [[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx-w/2,cy+h/2],[cx+w/2,cy+h/2],[cx,cy]];
  var minD = Infinity;
  for (var i = 0; i < _pisteSegs.length; i++) {
    var s = _pisteSegs[i];
    for (var j = 0; j < pts.length; j++) {
      var d = distToSeg(pts[j][0], pts[j][1], s.ax, s.ay, s.bx, s.by);
      if (d < minD) minD = d;
    }
  }
  return minD < LOCALITE_PISTE_CLEARANCE ? (LOCALITE_PISTE_CLEARANCE - minD) * 50 : 0;
}

function overlapArea(x, y, w, h) {
  var pad = 3, total = 0;
  for (var i = 0; i < _labelBoxes.length; i++) {
    var b = _labelBoxes[i];
    var ox = Math.max(0, Math.min(x+w/2+pad, b.x+b.w/2+pad) - Math.max(x-w/2-pad, b.x-b.w/2-pad));
    var oy = Math.max(0, Math.min(y+h/2+pad, b.y+b.h/2+pad) - Math.max(y-h/2-pad, b.y-b.h/2-pad));
    total += ox * oy;
  }
  return total;
}

// checkPistes=false pour les labels de pistes (ne pas repousser loin du tracé)
// checkPistes=true (défaut) pour les labels de localités
var MAX_LABEL_OVERLAP = Infinity;
function bestLabelPos(cx, cy, w, h, checkPistes) {
  var steps = [0, 0.5, 1.0, 1.5, 2.0, 2.5];
  var angles = [270, 90, 0, 180, 315, 45, 225, 135];
  var best = { x: cx, y: cy, score: Infinity };
  for (var si = 0; si < steps.length; si++) {
    for (var ai = 0; ai < angles.length; ai++) {
      var rad = angles[ai] * Math.PI / 180;
      var tx = cx + Math.cos(rad) * steps[si] * (w * 0.4);
      var ty = cy + Math.sin(rad) * steps[si] * (h * 0.9);
      var score = overlapArea(tx, ty, w, h) + (checkPistes !== false ? pisteOverlap(tx, ty, w, h) : 0);
      if (score < best.score) { best = { x: tx, y: ty, score: score }; }
      if (score === 0) return best;
    }
  }
  if (best.score > MAX_LABEL_OVERLAP) return null;
  return best;
}

var R_COL_X = MAP.x + MAP.w + 20;
var R_COL_W = CW - R_COL_X - MARGIN;
var LEGEND_BOX  = { x: R_COL_X, y: MAP.y + 15,  w: R_COL_W, h: 0 };
var TABLE_BOX   = { x: R_COL_X, y: 0,            w: R_COL_W, h: 0 };
var SITPLAN_BOX = { x: R_COL_X, y: 0,            w: R_COL_W, h: 310 };

var COLORS = {
  mapBg: "#f0f0f0",
  prefFill: "rgba(255,220,0,0.18)",
  prefStroke: "#e6b800",
  piste: "#CC0000",
  pisteLabel: "#CC0000",
  pisteLblBg: "rgba(255,255,255,0.88)",
  localiteDot: "#1a237e",
  localiteTxt: "#1a237e",
  headerBg: "#1e3a5f",
  border: "#2c3e50",
  tableHead: "#34495e",
  zoneFill: "rgba(144, 238, 144, 0.4)",
  zoneStroke: "#27ae60",
  siteFill: "#000000",
};

var ICON_COLORS = {
  ponts: "#9B59B6",
  buses: "#7F8C8D",
  dalots: "#3498DB",
  bacs: "#F39C12",
  passages_submersibles: "#1ABC9C",
};

// ── HELPERS ──
function loadImage(s) {
  return new Promise(function (r) {
    var i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = function () { r(i); };
    i.onerror = function () { r(null); };
    i.src = s;
  });
}
function bboxFromCoords(c) {
  var a = Infinity, b = Infinity, d = -Infinity, e = -Infinity;
  (function w(x) {
    if (typeof x[0] === "number") {
      a = Math.min(a, x[0]); b = Math.min(b, x[1]);
      d = Math.max(d, x[0]); e = Math.max(e, x[1]);
    } else x.forEach(w);
  })(c);
  return [a, b, d, e];
}
function combinedBbox(fs) {
  var a = Infinity, b = Infinity, d = -Infinity, e = -Infinity;
  fs.forEach(function (f) {
    if (!f.geometry || !f.geometry.coordinates) return;
    var x = bboxFromCoords(f.geometry.coordinates);
    a = Math.min(a, x[0]); b = Math.min(b, x[1]);
    d = Math.max(d, x[2]); e = Math.max(e, x[3]);
  });
  var px = (d - a) * 0.01 || 0.05, py = (e - b) * 0.01 || 0.05;
  return [a - px, b - py, d + px, e + py];
}
function makeProj(bb, r) {
  var s = Math.min(r.w / (bb[2] - bb[0]), r.h / (bb[3] - bb[1]));
  var ox = r.x + (r.w - (bb[2] - bb[0]) * s) / 2,
    oy = r.y + (r.h - (bb[3] - bb[1]) * s) / 2;
  var fn = function (lon, lat) {
    return { x: ox + (lon - bb[0]) * s, y: oy + (bb[3] - lat) * s };
  };
  fn.inv = function (cx, cy) {
    return { lon: (cx - ox) / s + bb[0], lat: bb[3] - (cy - oy) / s };
  };
  return fn;
}
function niceInterval(span, targetCount) {
  var rough = span / targetCount;
  var mag = Math.pow(10, Math.floor(Math.log10(rough)));
  var norm = rough / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}
function getStartEnd(f) {
  var g = f.geometry;
  if (!g || !g.coordinates) return { start: null, end: null };
  var c;
  if (g.type === "LineString") c = g.coordinates;
  else if (g.type === "MultiLineString") c = g.coordinates[0];
  else return { start: null, end: null };
  if (!c || !c.length) return { start: null, end: null };
  return { start: c[0], end: c[c.length - 1] };
}
function computeKm(c) {
  if (!c || c.length < 2) return 0;
  var t = 0;
  for (var i = 1; i < c.length; i++) {
    var R = 6371,
      dLa = ((c[i][1] - c[i - 1][1]) * Math.PI) / 180,
      dLo = ((c[i][0] - c[i - 1][0]) * Math.PI) / 180;
    var a =
      Math.sin(dLa / 2) * Math.sin(dLa / 2) +
      Math.cos((c[i - 1][1] * Math.PI) / 180) *
        Math.cos((c[i][1] * Math.PI) / 180) *
        Math.sin(dLo / 2) *
        Math.sin(dLo / 2);
    t += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return t;
}
function shortLabel(code) {
  if (!code) return "";
  var m = code.match(/(P\d+)$/i);
  return m ? m[1].toUpperCase() : code.slice(-3);
}
function getLabelPos(coords, proj, t) {
  if (!coords || coords.length < 2) return null;
  var pts = coords.map(function (c) { return proj(c[0], c[1]); });
  var segs = [], tot = 0;
  for (var i = 1; i < pts.length; i++) {
    var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    segs.push(Math.sqrt(dx * dx + dy * dy));
    tot += segs[segs.length - 1];
  }
  var half = tot * (t !== undefined ? t : 0.5), cum = 0;
  for (var j = 0; j < segs.length; j++) {
    cum += segs[j];
    if (cum >= half) {
      var ov = cum - half, r = 1 - ov / segs[j];
      var p1 = pts[j], p2 = pts[j + 1];
      var ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      return {
        x: p1.x + (p2.x - p1.x) * r,
        y: p1.y + (p2.y - p1.y) * r,
        angle: ang,
      };
    }
  }
  return { x: pts[0].x, y: pts[0].y, angle: 0 };
}
function createCollision(minD) {
  var pl = [];
  return {
    can: function (x, y) {
      for (var i = 0; i < pl.length; i++) {
        var dx = pl[i][0] - x, dy = pl[i][1] - y;
        if (dx * dx + dy * dy < minD * minD) return false;
      }
      return true;
    },
    add: function (x, y) { pl.push([x, y]); },
  };
}

// ── DESSIN GeoJSON ──
function drawRing(ctx, ring, proj) {
  ctx.beginPath();
  ring.forEach(function (c, i) {
    var p = proj(c[0], c[1]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}
function drawPoly(ctx, coords, proj, fill, stroke, lw) {
  coords.forEach(function (ring, i) {
    drawRing(ctx, ring, proj);
    if (fill && i === 0) { ctx.fillStyle = fill; ctx.fill(); }
  });
  if (stroke) {
    coords.forEach(function (ring) { drawRing(ctx, ring, proj); });
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
  }
}
function drawGeom(ctx, f, proj, fill, stroke, lw, dash) {
  var g = f.geometry;
  if (!g) return;
  ctx.save();
  ctx.setLineDash(dash || []);
  if (g.type === "Polygon")
    drawPoly(ctx, g.coordinates, proj, fill, stroke, lw);
  else if (g.type === "MultiPolygon")
    g.coordinates.forEach(function (p) { drawPoly(ctx, p, proj, fill, stroke, lw); });
  else if (g.type === "LineString") {
    ctx.beginPath();
    g.coordinates.forEach(function (c, i) {
      var p = proj(c[0], c[1]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = stroke || "#000";
    ctx.lineWidth = lw || 2;
    ctx.stroke();
  } else if (g.type === "MultiLineString")
    g.coordinates.forEach(function (line) {
      ctx.beginPath();
      line.forEach(function (c, i) {
        var p = proj(c[0], c[1]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = stroke || "#000";
      ctx.lineWidth = lw || 2;
      ctx.stroke();
    });
  ctx.restore();
}

// ── CROISILLONS ──
function drawCroisillons(ctx, _bbox, proj) {
  var topLeft     = proj.inv(MAP.x,          MAP.y);
  var topRight    = proj.inv(MAP.x + MAP.w,  MAP.y);
  var bottomLeft  = proj.inv(MAP.x,          MAP.y + MAP.h);
  var bottomRight = proj.inv(MAP.x + MAP.w,  MAP.y + MAP.h);
  var lonMin = Math.min(topLeft.lon, bottomLeft.lon);
  var lonMax = Math.max(topRight.lon, bottomRight.lon);
  var latMin = Math.min(bottomLeft.lat, bottomRight.lat);
  var latMax = Math.max(topLeft.lat, topRight.lat);
  var stepLon = niceInterval(lonMax - lonMin, 5);
  var stepLat = niceInterval(latMax - latMin, 5);
  var startLon = Math.ceil(lonMin / stepLon) * stepLon;
  var startLat = Math.ceil(latMin / stepLat) * stepLat;
  var TK = 12;
  ctx.save();

  // Lignes de grille sur toute la carte
  ctx.beginPath();
  ctx.rect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.clip();
  ctx.strokeStyle = "rgba(80,80,120,0.40)"; ctx.lineWidth = 1;
  ctx.setLineDash([8, 6]);
  for (var lon0 = startLon; lon0 <= lonMax + 1e-9; lon0 = Math.round((lon0 + stepLon) * 1e8) / 1e8) {
    var px0 = proj(lon0, (latMin + latMax) / 2).x;
    ctx.beginPath(); ctx.moveTo(px0, MAP.y); ctx.lineTo(px0, MAP.y + MAP.h); ctx.stroke();
  }
  for (var lat0 = startLat; lat0 <= latMax + 1e-9; lat0 = Math.round((lat0 + stepLat) * 1e8) / 1e8) {
    var py0 = proj((lonMin + lonMax) / 2, lat0).y;
    ctx.beginPath(); ctx.moveTo(MAP.x, py0); ctx.lineTo(MAP.x + MAP.w, py0); ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.font = "18px Arial"; ctx.fillStyle = "#444";
  // Longitude — tirets haut+bas, label en bas seulement
  for (var lon = startLon; lon <= lonMax + 1e-9; lon = Math.round((lon + stepLon) * 1e8) / 1e8) {
    var px = proj(lon, (latMin + latMax) / 2).x;
    ctx.beginPath();
    ctx.moveTo(px, MAP.y); ctx.lineTo(px, MAP.y + TK);
    ctx.moveTo(px, MAP.y + MAP.h - TK); ctx.lineTo(px, MAP.y + MAP.h);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(lon.toFixed(2) + "\u00b0", px, MAP.y + MAP.h + 24);
  }
  // Latitude — tirets gauche+droite, label à gauche seulement (fond blanc)
  for (var lat = startLat; lat <= latMax + 1e-9; lat = Math.round((lat + stepLat) * 1e8) / 1e8) {
    var py = proj((lonMin + lonMax) / 2, lat).y;
    ctx.beginPath();
    ctx.moveTo(MAP.x, py); ctx.lineTo(MAP.x + TK, py);
    ctx.moveTo(MAP.x + MAP.w - TK, py); ctx.lineTo(MAP.x + MAP.w, py);
    ctx.stroke();
    var lbl = lat.toFixed(2) + "\u00b0";
    var tw = ctx.measureText(lbl).width;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(MAP.x + TK + 3, py - 10, tw + 4, 20);
    ctx.fillStyle = "#444";
    ctx.textAlign = "left";
    ctx.fillText(lbl, MAP.x + TK + 5, py + 7);
  }
  ctx.restore();
}

// ── DATA ──
async function fetchBoundaries(prefIds) {
  var r = await dataservice.loadAdministrativeBoundaries(12, null, null);
  if (!r.success || !r.data || !r.data.features)
    return { prefs: [], allPrefs: [], communes: [], allRegions: [] };
  var fs = r.data.features;
  return {
    allRegions: fs.filter(function (f) { return f.properties.type === "region"; }),
    allPrefs: fs.filter(function (f) { return f.properties.type === "prefecture"; }),
    communes: fs.filter(function (f) {
      return f.properties.type === "commune" && prefIds.includes(f.properties.prefecture_id);
    }),
    prefs: fs.filter(function (f) {
      return f.properties.type === "prefecture" && prefIds.includes(f.properties.id);
    }),
  };
}
async function fetchInfra(filters, types) {
  var res = {};
  await Promise.all(
    types.map(async function (t) {
      var r = await dataservice.fetchEndpoint(t, filters);
      res[t] = r.success ? r.data || [] : [];
    }),
  );
  return res;
}

// ── HEADER ──
async function drawHeader(ctx, names, titreCarte) {
  ctx.fillStyle = COLORS.headerBg;
  ctx.fillRect(0, 0, CW, HEADER_H);

  var logo = await loadImage(ndgrLogo);
  if (logo) {
    var lh = 160, lw = lh * (logo.width / logo.height);
    var lx = 25, ly = 20, pad = 8;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(lx - pad, ly - pad, lw + pad * 2, lh + pad * 2);
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 4;
    ctx.strokeRect(lx - pad, ly - pad, lw + pad * 2, lh + pad * 2);
    ctx.strokeStyle = "#c8860a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lx - pad + 5, ly - pad + 5, lw + pad * 2 - 10, lh + pad * 2 - 10);
    ctx.drawImage(logo, lx, ly, lw, lh);
  }

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  var cx = CW / 2;
  ctx.font = "bold 26px Arial";
  ctx.fillText("REPUBLIQUE DE GUINEE", cx, 30);
  ctx.font = "20px Arial";
  ctx.fillText("Ministère de l'Agriculture", cx, 54);
  ctx.font = "bold 20px Arial";
  ctx.fillText("Direction Nationale du Génie Rural", cx, 76);
  ctx.font = "15px Arial";
  ctx.fillText("Projet de Désenclavement des zones de production Pisci-rizicole en Basse Guinée et Guinée forestière", cx, 96);

  if (titreCarte) {
    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "#aee6ff";
    ctx.fillText(titreCarte, cx, 120);
  }

  if (names.prefectures && names.prefectures.length) {
    var prefTxt = names.prefectures.length > 1 ? "Préfectures de " : "Préfecture de ";
    ctx.font = "bold 22px Arial";
    ctx.fillStyle = "#f1c40f";
    ctx.fillText(prefTxt + names.prefectures.join(", "), cx, 148);
  }

  ctx.font = "14px Arial";
  ctx.fillStyle = "#bdc3c7";
  ctx.fillText("Financement : Agence Française de Développement (AFD)", cx, 172);
}

// ── LOGOS BAS DE PAGE ──
async function drawFooter(ctx, dynCH) {
  var partnerImgs = await Promise.all([
    loadImage(etafatLogo),
    loadImage(isadesLogo),
    loadImage(urbaplanLogo),
  ]);
  var pHeights = [90, 90, 110];
  var pX = MAP.x + 20;
  var bottomY = dynCH - 15;
  partnerImgs.forEach(function (img, idx) {
    if (!img) { pX += 80; return; }
    var pLH = pHeights[idx] || 65;
    var pW = Math.round(pLH * (img.width / img.height));
    ctx.drawImage(img, pX, bottomY - pLH, pW, pLH);
    pX += pW + 20;
  });
}

// ── SITUATION PLAN ──
function drawSitPlan(ctx, bd) {
  var s = SITPLAN_BOX;
  var bgF = bd.allPrefs.length ? bd.allPrefs : bd.allRegions;
  if (!bgF || !bgF.length) return;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1.5;
  ctx.strokeRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = COLORS.tableHead;
  ctx.fillRect(s.x, s.y, s.w, 30);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
  ctx.fillText("PLAN DE SITUATION", s.x + s.w / 2, s.y + 21);
  var sr = { x: s.x + 10, y: s.y + 38, w: s.w - 20, h: s.h - 48 };
  var sb = combinedBbox(bgF);
  var sp = makeProj(sb, sr);
  ctx.save();
  ctx.beginPath(); ctx.rect(sr.x, sr.y, sr.w, sr.h); ctx.clip();
  bgF.forEach(function (f) { drawGeom(ctx, f, sp, "#e8ecf0", "#b0b8c4", 0.8); });
  bd.prefs.forEach(function (f) {
    drawGeom(ctx, f, sp, "#e74c3c", "#c0392b", 2.5);
    if (f.properties.nom && f.geometry) {
      var cb = bboxFromCoords(f.geometry.coordinates);
      var c = sp((cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2);
      ctx.font = "bold 11px Arial";
      var tw = ctx.measureText(f.properties.nom).width;
      ctx.fillStyle = "rgba(192,57,43,0.85)";
      ctx.fillRect(c.x - tw / 2 - 3, c.y - 8, tw + 6, 14);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.fillText(f.properties.nom, c.x, c.y + 3);
    }
  });
  ctx.restore();
}

// ── SCALE + NORTH + FRAMES ──
function drawScale(ctx, bbox) {
  var m = MAP, sx = m.x + 15, sy = m.y + m.h - 30;
  var mwKm = (bbox[2] - bbox[0]) * 111 * Math.cos((((bbox[1] + bbox[3]) / 2) * Math.PI) / 180);
  var kpp = mwKm / m.w;
  var nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  var nk = nice.find(function (v) { return v >= 150 * kpp; }) || 150 * kpp;
  var npx = nk / kpp;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(sx - 8, sy - 22, npx + 26, 42);
  ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
  ctx.strokeRect(sx - 8, sy - 22, npx + 26, 42);
  var segs = 4, segW = npx / segs;
  for (var i = 0; i < segs; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#333" : "#fff";
    ctx.fillRect(sx + i * segW, sy, segW, 6);
  }
  ctx.strokeRect(sx, sy, npx, 6);
  ctx.font = "bold 11px Arial"; ctx.fillStyle = "#333";
  ctx.textAlign = "left"; ctx.fillText("0", sx, sy - 6);
  ctx.textAlign = "right"; ctx.fillText(nk + " km", sx + npx, sy - 6);
}
function drawNorth(ctx) {
  var nx = MAP.x + MAP.w - 50, ny = MAP.y + 50;
  ctx.beginPath(); ctx.arc(nx, ny, 26, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
  ctx.strokeStyle = "#333"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.moveTo(nx, ny - 18); ctx.lineTo(nx - 8, ny + 4); ctx.lineTo(nx + 8, ny + 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#333"; ctx.font = "bold 16px Arial";
  ctx.textAlign = "center"; ctx.fillText("N", nx, ny + 22);
}
function drawFrames(ctx, dynCH) {
  ctx.strokeStyle = COLORS.border; ctx.lineWidth = 3;
  ctx.strokeRect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, CW, dynCH || CH);
  ctx.font = "11px Arial"; ctx.fillStyle = "#888"; ctx.textAlign = "right";
  ctx.fillText("WGS 84 / EPSG:4326 — " + new Date().toLocaleDateString("fr-FR"), CW - 15, (dynCH || CH) - 8);
}

// ── SHARED: draw pistes + labels ──
function drawPistes(ctx, proj, pistes) {
  (pistes || []).forEach(function (f) {
    drawGeom(ctx, f, proj, null, "rgba(255,255,255,0.7)", 9);
    drawGeom(ctx, f, proj, null, COLORS.piste, 4);
  });

  // Collecter tous les segments projetés de toutes les pistes
  var allSegments = [];
  (pistes || []).forEach(function (f) {
    var coords =
      f.geometry && f.geometry.type === "LineString"
        ? f.geometry.coordinates
        : f.geometry && f.geometry.coordinates
          ? f.geometry.coordinates[0]
          : null;
    if (!coords) return;
    for (var i = 0; i < coords.length - 1; i++) {
      var a = proj(coords[i][0], coords[i][1]);
      var b = proj(coords[i + 1][0], coords[i + 1][1]);
      allSegments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
  });

  // Enregistrer les segments comme obstacles pour les labels de localités
  allSegments.forEach(function (s) { registerPisteSeg(s.ax, s.ay, s.bx, s.by); });

  var lblPlaced = [];
  var OFF = 16;
  var LBL_MIN_D = 45;
  var T_VALS = [0.5, 0.35, 0.65, 0.2, 0.8];
  var SIDES  = [-1, 1];

  (pistes || []).forEach(function (f) {
    var code = f.properties ? f.properties.code_piste : null;
    if (!code) return;
    var lbl = shortLabel(code);
    var coords =
      f.geometry && f.geometry.type === "LineString"
        ? f.geometry.coordinates
        : f.geometry && f.geometry.coordinates
          ? f.geometry.coordinates[0]
          : null;
    if (!coords || coords.length < 2) return;

    var ownSegs = [];
    for (var ii = 0; ii < coords.length - 1; ii++) {
      var a2 = proj(coords[ii][0], coords[ii][1]);
      var b2 = proj(coords[ii + 1][0], coords[ii + 1][1]);
      ownSegs.push({ ax: a2.x, ay: a2.y, bx: b2.x, by: b2.y });
    }

    var best = null, bestScore = -Infinity;
    for (var ti = 0; ti < T_VALS.length; ti++) {
      for (var si = 0; si < SIDES.length; si++) {
        var offY = SIDES[si] * OFF;
        var pos = getLabelPos(coords, proj, T_VALS[ti]);
        if (!pos) continue;
        var lx = pos.x - Math.sin(pos.angle) * offY;
        var ly = pos.y + Math.cos(pos.angle) * offY;

        var clashLbl = lblPlaced.some(function (l) {
          var dx = l.x - lx, dy = l.y - ly;
          return dx * dx + dy * dy < LBL_MIN_D * LBL_MIN_D;
        });
        if (clashLbl) continue;

        // Score = distance minimale aux pistes étrangères
        var minDist = Infinity;
        for (var ki = 0; ki < allSegments.length; ki++) {
          var seg = allSegments[ki];
          var isOwn = ownSegs.some(function (os) { return os.ax === seg.ax && os.ay === seg.ay; });
          if (isOwn) continue;
          var d = distToSeg(lx, ly, seg.ax, seg.ay, seg.bx, seg.by);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestScore) { bestScore = minDist; best = { pos: pos, lx: lx, ly: ly }; }
      }
    }

    // Fallback : midpoint côté supérieur
    if (!best) {
      var pos0 = getLabelPos(coords, proj, 0.5);
      if (!pos0) return;
      var offY0 = -OFF;
      best = {
        pos: pos0,
        lx: pos0.x - Math.sin(pos0.angle) * offY0,
        ly: pos0.y + Math.cos(pos0.angle) * offY0,
      };
    }

    ctx.font = "bold 13px Arial";
    var tw = ctx.measureText(lbl).width;
    var boxH = 18;
    var bp = bestLabelPos(best.lx, best.ly, tw + 8, boxH, false);
    if (!bp) bp = { x: best.lx, y: best.ly };
    lblPlaced.push({ x: bp.x, y: bp.y });
    registerLabel(bp.x, bp.y, tw + 10, boxH);
    ctx.save();

    var paddingX = 5;
    var boxW = tw + paddingX * 2;

    ctx.fillStyle = "#e00000";
    ctx.fillRect(bp.x - boxW / 2, bp.y - boxH / 2, boxW, boxH);

    ctx.strokeStyle = "#660000";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bp.x - boxW / 2, bp.y - boxH / 2, boxW, boxH);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lbl, bp.x, bp.y);

    ctx.restore();

  });
}

// ── SHARED: draw localités ──
function drawLocalites(ctx, proj, localites) {
  (localites || []).forEach(function (f) {
    if (!f.geometry || f.geometry.type !== "Point") return;
    var p = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.localiteDot; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8; ctx.stroke();
    var nom =
      (f.properties ? f.properties.nom || f.properties.nom_localite : "") || "";
    if (nom && SHOW_LOCALITE_LABELS) {
      ctx.font = "11px Arial";
      var tw = ctx.measureText(nom).width;
      var lh = 13;
      var bp = bestLabelPos(p.x + 5 + tw / 2, p.y - lh, tw, lh);
      if (bp) {
        registerLabel(bp.x, bp.y, tw, lh);
        ctx.fillStyle = "#000000";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(nom, bp.x, bp.y);
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  CARTE 1 : PISTES ET OUVRAGES
// ══════════════════════════════════════════════════════════════

export async function generateCarte1(filters, names, onProgress, asBlob) {
  var prog = onProgress || function () {};
  prog("Chargement des limites...");
  var prefIds = (filters.prefecture_id || []).map(function (id) {
    return typeof id === "string" ? parseInt(id) : id;
  });
  var bd = await fetchBoundaries(prefIds);

  // Extraire les noms de préfectures depuis les données GeoJSON
  if (bd.prefs.length) {
    names = Object.assign({}, names, {
      prefectures: bd.prefs.map(function (f) { return f.properties.nom || ""; }).filter(Boolean),
    });
  }

  prog("Chargement des infrastructures...");
  var flt = {};
  if (filters.prefecture_id && filters.prefecture_id.length) flt.prefecture_id = filters.prefecture_id;
  if (filters.commune_id && filters.commune_id.length) flt.commune_id = filters.commune_id;
  if (filters.region_id && filters.region_id.length) flt.region_id = filters.region_id;
  var infra = await fetchInfra(flt, [
    "pistes", "localites", "ponts", "dalots", "buses", "bacs", "passages_submersibles",
  ]);
  if (bd.prefs.length === 0 && (infra.pistes || []).length === 0) {
    alert("Aucune donnée trouvée.");
    return;
  }

  var bbox = combinedBbox(bd.prefs.length ? bd.prefs : bd.allRegions);
  prog("Dessin de la carte...");

  // Canvas dynamique selon nombre de pistes
  var nPistes = (infra.pistes || []).length;
  var ROW_H = 22;
  var dynCH = Math.max(CH,
    MAP.y + 15 + 300 + 15 + SITPLAN_BOX.h + 15 + 50 + Math.min(nPistes, 80) * ROW_H + ROW_H + 50
  );
  MAP.h = dynCH - HEADER_H - 175;

  var canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = dynCH;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CW, dynCH);

  await drawHeader(ctx, names, "Cartographie des pistes et ouvrages réalisés dans le cadre du projet PPR");
  var proj = makeProj(bbox, MAP);

  // Fond océan — bleu uniquement hors limites des régions
  ctx.fillStyle = "#b8d9f0";
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.clip();

  // 1. Masque terre : régions en couleur neutre (cache l'océan sur la terre)
  bd.allRegions.forEach(function (f) {
    drawGeom(ctx, f, proj, "#e8e0d0", null, 0);
  });

  // 2. Préfectures — couleur par index (aucune teinte bleue dans prefColors)
  bd.allPrefs.forEach(function (f, i) {
    var col = prefColors[i % prefColors.length];
    drawGeom(ctx, f, proj, col, "#aaaaaa", 0.8);
    var nom = f.properties && (f.properties.nom || f.properties.nom_prefecture);
    if (nom && f.geometry) {
      var cb = bboxFromCoords(f.geometry.coordinates);
      var c = proj((cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2);
      ctx.font = "bold 18px Arial";
      ctx.fillStyle = "rgba(101, 48, 10, 0.88)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(nom.toUpperCase(), c.x, c.y);
    }
  });

  // 3. Surimpression couleur fixe sur la préfecture sélectionnée
  bd.prefs.forEach(function (f) {
    drawGeom(ctx, f, proj, "rgba(240,215,145,0.75)", null, 0);
  });

  // 4. Communes — trait fin + nom
  bd.communes.forEach(function (f) {
    drawGeom(ctx, f, proj, null, "#444", 1, []);
    var nom = f.properties && (f.properties.nom || f.properties.nom_commune);
    if (nom && f.geometry) {
      var cb = bboxFromCoords(f.geometry.coordinates);
      var c = proj((cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2);
      ctx.font = "bold 20px Arial";
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(nom.toUpperCase(), c.x, c.y);
    }
  });

  // 5. Contours des régions
  bd.allRegions.forEach(function (f) {
    drawGeom(ctx, f, proj, null, "#1a3a6b", 3);
  });

  // 6. Contour préfecture sélectionnée — tirets jaunes/or
  bd.prefs.forEach(function (f) {
    drawGeom(ctx, f, proj, null, COLORS.prefStroke, 2.5, [10, 5]);
  });

  resetLabels();
  drawPistes(ctx, proj, infra.pistes);

  // Ouvrages — points minimalistes avec collision serrée
  var collision = createCollision(6);
  ["ponts", "dalots", "buses", "bacs", "passages_submersibles"].forEach(function (type) {
    var color = ICON_COLORS[type] || "#999";
    (infra[type] || []).forEach(function (f) {
      var px2, py2;
      if (f.geometry && f.geometry.type === "Point") {
        var p = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
        px2 = p.x; py2 = p.y;
      } else {
        var coords =
          f.geometry && f.geometry.type === "LineString"
            ? f.geometry.coordinates
            : f.geometry && f.geometry.coordinates
              ? f.geometry.coordinates[0]
              : null;
        if (coords && coords.length) {
          var mi = Math.floor(coords.length / 2);
          var p2 = proj(coords[mi][0], coords[mi][1]);
          px2 = p2.x; py2 = p2.y;
        }
      }
      if (px2 !== undefined && collision.can(px2, py2)) {
        collision.add(px2, py2);
        ctx.beginPath(); ctx.arc(px2, py2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
      }
    });
  });

  drawLocalites(ctx, proj, infra.localites);
  ctx.restore();

  drawCroisillons(ctx, bbox, proj);

  // Légende — uniquement les types présents (count > 0)
  var legendItems = [];
  if (bd.allRegions.length > 0)
    legendItems.push({ type: "line", color: "#1a3a6b", dash: [], lw: 3, label: "Limite région" });
  if (bd.prefs.length > 0)
    legendItems.push({ type: "line", color: COLORS.prefStroke, dash: [8, 4], lw: 2, label: "Limite préfecture" });
  if (bd.communes.length > 0)
    legendItems.push({ type: "line", color: "#444", dash: [], lw: 1, label: "Limites communes" });
  if (nPistes > 0)
    legendItems.push({ type: "line", color: COLORS.piste, dash: [], lw: 4, label: "Pistes (" + nPistes + ")" });
  var ouvrageLabels = { ponts: "Ponts", dalots: "Dalots", buses: "Buses", bacs: "Bacs", passages_submersibles: "Pass. sub." };
  ["ponts", "dalots", "buses", "bacs", "passages_submersibles"].forEach(function (o) {
    var n = (infra[o] || []).length;
    if (n > 0) legendItems.push({ type: "dot", color: ICON_COLORS[o], label: ouvrageLabels[o] + " (" + n + ")" });
  });
  var locN = (infra.localites || []).length;
  if (locN > 0) legendItems.push({ type: "bigdot", color: COLORS.localiteDot, label: "Localités (" + locN + ")" });

  var legH = drawLegendBox(ctx, legendItems);
  SITPLAN_BOX.y = LEGEND_BOX.y + legH + 15;
  drawSitPlan(ctx, bd);
  TABLE_BOX.y = SITPLAN_BOX.y + SITPLAN_BOX.h + 15;
  TABLE_BOX.h = dynCH - TABLE_BOX.y - 30;
  drawTable1(ctx, infra.pistes, names);
  drawScale(ctx, bbox);
  drawNorth(ctx);
  drawFrames(ctx, dynCH);
  await drawFooter(ctx, dynCH);

  prog("Génération du PDF...");
  var fname = "Carte1_Pistes_Ouvrages_" + (names.prefectures ? names.prefectures[0] : "carte");
  if (asBlob) { prog(null); return exportPdfBlob(canvas, fname); }
  exportPdf(canvas, fname);
  prog(null);
}

// ══════════════════════════════════════════════════════════════
//  CARTE 2 : ZONES DE PRODUCTION AGRICOLE ET HALIEUTIQUE
// ══════════════════════════════════════════════════════════════

export async function generateCarte2(filters, names, onProgress, asBlob) {
  var prog = onProgress || function () {};
  prog("Chargement des limites...");
  var prefIds = (filters.prefecture_id || []).map(function (id) {
    return typeof id === "string" ? parseInt(id) : id;
  });
  var bd = await fetchBoundaries(prefIds);

  if (bd.prefs.length) {
    names = Object.assign({}, names, {
      prefectures: bd.prefs.map(function (f) { return f.properties.nom || ""; }).filter(Boolean),
    });
  }

  prog("Chargement des données...");
  var flt = {};
  if (filters.prefecture_id && filters.prefecture_id.length) flt.prefecture_id = filters.prefecture_id;
  if (filters.commune_id && filters.commune_id.length) flt.commune_id = filters.commune_id;
  if (filters.region_id && filters.region_id.length) flt.region_id = filters.region_id;
  var infra = await fetchInfra(flt, ["pistes", "localites", "ppr_itial", "enquete_polygone"]);
  if (bd.prefs.length === 0 && (infra.enquete_polygone || []).length === 0 && (infra.ppr_itial || []).length === 0) {
    alert("Aucune donnée trouvée.");
    return;
  }

  var bbox = combinedBbox(bd.prefs.length ? bd.prefs : bd.allRegions);
  prog("Dessin de la carte...");

  var nPistesC2 = (infra.pistes || []).length;
  var ROW_H_C2 = 22;
  var dynCH = Math.max(CH,
    MAP.y + 15 + 300 + 15 + SITPLAN_BOX.h + 15 + 50 + Math.min(nPistesC2, 80) * ROW_H_C2 + ROW_H_C2 + 50
  );
  MAP.h = dynCH - HEADER_H - 175;
  MAP.h = dynCH - HEADER_H - 175;

  var canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = dynCH;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CW, dynCH);

  await drawHeader(ctx, names, "Cartographie des zones de production agricole et halieutique désenclavées");
  var proj = makeProj(bbox, MAP);

  // Fond océan — bleu uniquement hors limites des régions
  ctx.fillStyle = "#b8d9f0";
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.clip();

  // 1. Masque terre
  bd.allRegions.forEach(function (f) {
    drawGeom(ctx, f, proj, "#e8e0d0", null, 0);
  });

  // 2. Préfectures
  bd.allPrefs.forEach(function (f, i) {
    var col = prefColors[i % prefColors.length];
    drawGeom(ctx, f, proj, col, "#aaaaaa", 0.8);
    var nom = f.properties && (f.properties.nom || f.properties.nom_prefecture);
    if (nom && f.geometry) {
      var cb = bboxFromCoords(f.geometry.coordinates);
      var c = proj((cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2);
      ctx.font = "bold 18px Arial";
      ctx.fillStyle = "rgba(101, 48, 10, 0.88)";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(nom.toUpperCase(), c.x, c.y);
    }
  });

  // 3. Surimpression couleur fixe sur la préfecture sélectionnée
  bd.prefs.forEach(function (f) {
    drawGeom(ctx, f, proj, "rgba(240,215,145,0.75)", null, 0);
  });

  // 4. Communes — trait fin + nom
  bd.communes.forEach(function (f) {
    drawGeom(ctx, f, proj, null, "#444", 1, []);
    var nom = f.properties && (f.properties.nom || f.properties.nom_commune);
    if (nom && f.geometry) {
      var cb = bboxFromCoords(f.geometry.coordinates);
      var c = proj((cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2);
      ctx.font = "bold 20px Arial";
      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(nom.toUpperCase(), c.x, c.y);
    }
  });

  // 5. Contours des régions
  bd.allRegions.forEach(function (f) {
    drawGeom(ctx, f, proj, null, "#1a3a6b", 3);
  });

  // 6. Contour préfecture sélectionnée — tirets jaunes/or
  bd.prefs.forEach(function (f) {
    drawGeom(ctx, f, proj, null, COLORS.prefStroke, 2.5, [10, 5]);
  });

  (infra.enquete_polygone || []).forEach(function (f) {
    drawGeom(ctx, f, proj, COLORS.zoneFill, COLORS.zoneStroke, 2);
  });

  (infra.ppr_itial || []).forEach(function (f) {
    if (!f.geometry || f.geometry.type !== "Point") return;
    var p = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x - 6, p.y + 5); ctx.lineTo(p.x + 6, p.y + 5);
    ctx.closePath();
    ctx.fillStyle = COLORS.siteFill; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
  });

  resetLabels();
  drawPistes(ctx, proj, infra.pistes);
  drawLocalites(ctx, proj, infra.localites);
  ctx.restore();

  drawCroisillons(ctx, bbox, proj);

  // Légende — uniquement les types présents (count > 0)
  var nPistes = (infra.pistes || []).length;
  var legendItems = [];
  if (bd.allRegions.length > 0)
    legendItems.push({ type: "line", color: "#1a3a6b", dash: [], lw: 3, label: "Limite région" });
  if (bd.prefs.length > 0)
    legendItems.push({ type: "line", color: COLORS.prefStroke, dash: [8, 4], lw: 2, label: "Limite préfecture" });
  if (bd.communes.length > 0)
    legendItems.push({ type: "line", color: "#444", dash: [], lw: 1, label: "Limites communes" });
  if (nPistes > 0)
    legendItems.push({ type: "line", color: COLORS.piste, dash: [], lw: 4, label: "Pistes (" + nPistes + ")" });
  var zoneN = (infra.enquete_polygone || []).length;
  if (zoneN > 0) legendItems.push({ type: "rect", color: COLORS.zoneFill, stroke: COLORS.zoneStroke, label: "Zones de plaine (" + zoneN + ")" });
  var siteN = (infra.ppr_itial || []).length;
  if (siteN > 0) legendItems.push({ type: "triangle", color: COLORS.siteFill, label: "Sites de plaine (" + siteN + ")" });
  var locN = (infra.localites || []).length;
  if (locN > 0) legendItems.push({ type: "bigdot", color: COLORS.localiteDot, label: "Localités (" + locN + ")" });

  var legH = drawLegendBox(ctx, legendItems);
  SITPLAN_BOX.y = LEGEND_BOX.y + legH + 15;
  drawSitPlan(ctx, bd);
  TABLE_BOX.y = SITPLAN_BOX.y + SITPLAN_BOX.h + 15;
  TABLE_BOX.h = dynCH - TABLE_BOX.y - 30;
  drawTable1(ctx, infra.pistes, names);
  drawScale(ctx, bbox);
  drawNorth(ctx);
  drawFrames(ctx, dynCH);
  await drawFooter(ctx, dynCH);

  prog("Génération du PDF...");
  var fname = "Carte2_Zones_Production_" + (names.prefectures ? names.prefectures[0] : "carte");
  if (asBlob) { prog(null); return exportPdfBlob(canvas, fname); }
  exportPdf(canvas, fname);
  prog(null);
}

// ── LÉGENDE GÉNÉRIQUE ──
function drawLegendBox(ctx, items) {
  var l = LEGEND_BOX;
  var lineH = 32;
  var h = 48 + items.length * lineH + 10;
  l.h = h;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(l.x, l.y, l.w, l.h);
  ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1.5;
  ctx.strokeRect(l.x, l.y, l.w, l.h);
  ctx.fillStyle = COLORS.tableHead;
  ctx.fillRect(l.x, l.y, l.w, 38);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px Arial"; ctx.textAlign = "center";
  ctx.fillText("LÉGENDE", l.x + l.w / 2, l.y + 27);
  var yy = l.y + 55;
  items.forEach(function (item) {
    if (item.type === "line") {
      ctx.save();
      ctx.strokeStyle = item.color; ctx.lineWidth = item.lw;
      ctx.setLineDash(item.dash);
      ctx.beginPath(); ctx.moveTo(l.x + 18, yy); ctx.lineTo(l.x + 58, yy); ctx.stroke();
      ctx.restore();
    } else if (item.type === "dot") {
      ctx.beginPath(); ctx.arc(l.x + 38, yy, 5, 0, Math.PI * 2);
      ctx.fillStyle = item.color; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
    } else if (item.type === "bigdot") {
      ctx.beginPath(); ctx.arc(l.x + 38, yy, 6, 0, Math.PI * 2);
      ctx.fillStyle = item.color; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (item.type === "rect") {
      ctx.fillStyle = item.color;
      ctx.fillRect(l.x + 22, yy - 10, 32, 20);
      ctx.strokeStyle = item.stroke || "#333"; ctx.lineWidth = 1.5;
      ctx.strokeRect(l.x + 22, yy - 10, 32, 20);
    } else if (item.type === "triangle") {
      ctx.beginPath();
      ctx.moveTo(l.x + 38, yy - 8); ctx.lineTo(l.x + 30, yy + 6); ctx.lineTo(l.x + 46, yy + 6);
      ctx.closePath();
      ctx.fillStyle = item.color; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.font = "14px Arial"; ctx.fillStyle = "#2c3e50"; ctx.textAlign = "left";
    ctx.fillText(item.label, l.x + 68, yy + 5);
    yy += lineH;
  });
  return l.h;
}

// ── TABLE ──
function drawTable1(ctx, pistes, names) {
  var t = TABLE_BOX;
  var list = pistes || [];
  if (!list.length) return;
  var cols = [
    { label: "Commune",    w: 130 },
    { label: "Code Piste", w: 160 },
    { label: "Long. (km)", w: 100 },
    { label: "X déb",     w: 90 },
    { label: "Y déb",     w: 90 },
    { label: "X fin",     w: 90 },
    { label: "Y fin",     w: 90 },
  ];
  var totalW = cols.reduce(function (s, c) { return s + c.w; }, 0);
  var sc = t.w / totalW;
  cols.forEach(function (c) { c.w *= sc; });
  var rowH = 22;
  var maxRows = Math.max(0, Math.min(list.length, Math.floor((t.h - 50) / rowH)));
  var actualH = 50 + maxRows * rowH + rowH;
  t.h = actualH;
  ctx.fillStyle = "rgba(255,255,255,0.93)";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1.5;
  ctx.strokeRect(t.x, t.y, t.w, t.h);
  ctx.fillStyle = COLORS.tableHead;
  ctx.fillRect(t.x, t.y, t.w, 26);
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px Arial"; ctx.textAlign = "center";
  ctx.fillText("TABLEAU DES PISTES", t.x + t.w / 2, t.y + 18);
  var headerY = t.y + 26;
  var xx = t.x;
  ctx.fillStyle = "#ecf0f1";
  ctx.fillRect(t.x, headerY, t.w, rowH);
  cols.forEach(function (col) {
    ctx.strokeStyle = "#bbb"; ctx.lineWidth = 0.5;
    ctx.strokeRect(xx, headerY, col.w, rowH);
    ctx.font = "bold 10px Arial"; ctx.fillStyle = "#2c3e50"; ctx.textAlign = "center";
    ctx.fillText(col.label, xx + col.w / 2, headerY + 15);
    xx += col.w;
  });
  for (var i = 0; i < maxRows; i++) {
    var f = list[i];
    var pr = f.properties || {};
    var se = getStartEnd(f);
    var coords =
      f.geometry && f.geometry.type === "LineString"
        ? f.geometry.coordinates
        : f.geometry && f.geometry.coordinates
          ? f.geometry.coordinates[0]
          : null;
    var lkm = pr.longueur || pr.kilometrage || pr.length_km || (coords ? computeKm(coords).toFixed(2) : "—");
    var rowY = headerY + rowH + i * rowH;
    xx = t.x;
    ctx.fillStyle = i % 2 === 0 ? "#fff" : "#f7f9fc";
    ctx.fillRect(t.x, rowY, t.w, rowH);
    [
      pr.commune_nom || "—",
      pr.code_piste || "—",
      typeof lkm === "number" ? lkm.toFixed(2) : String(lkm),
      se.start ? se.start[0].toFixed(4) : "—",
      se.start ? se.start[1].toFixed(4) : "—",
      se.end ? se.end[0].toFixed(4) : "—",
      se.end ? se.end[1].toFixed(4) : "—",
    ].forEach(function (v, j) {
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 0.5;
      ctx.strokeRect(xx, rowY, cols[j].w, rowH);
      ctx.font = "9px Arial"; ctx.fillStyle = "#333"; ctx.textAlign = "center";
      ctx.fillText(String(v), xx + cols[j].w / 2, rowY + 15);
      xx += cols[j].w;
    });
  }
  var totY = headerY + rowH + maxRows * rowH;
  ctx.fillStyle = "#ecf0f1";
  ctx.fillRect(t.x, totY, t.w, rowH);
  ctx.strokeStyle = COLORS.border; ctx.lineWidth = 0.5;
  ctx.strokeRect(t.x, totY, t.w, rowH);
  var totKm = list.reduce(function (s, f2) {
    var c =
      f2.geometry && f2.geometry.type === "LineString"
        ? f2.geometry.coordinates
        : f2.geometry && f2.geometry.coordinates
          ? f2.geometry.coordinates[0]
          : null;
    return s + (c ? computeKm(c) : 0);
  }, 0);
  ctx.font = "bold 10px Arial"; ctx.fillStyle = "#2c3e50"; ctx.textAlign = "center";
  ctx.fillText(
    "TOTAL : " + list.length + " pistes — " + totKm.toFixed(2) + " km",
    t.x + t.w / 2,
    totY + 15
  );
}

// ── PDF EXPORT ──
function buildPdf(canvas) {
  var pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [canvas.width, canvas.height],
    compress: true,
  });
  pdf.addImage(
    canvas.toDataURL("image/jpeg", 1),
    "JPEG",
    0, 0,
    pdf.internal.pageSize.getWidth(),
    pdf.internal.pageSize.getHeight(),
    undefined,
    "FAST"
  );
  return pdf;
}

function exportPdf(canvas, filename) {
  buildPdf(canvas).save(filename + "_" + new Date().toISOString().split("T")[0] + ".pdf");
}

function exportPdfBlob(canvas, filename) {
  var pdf = buildPdf(canvas);
  var dated = filename + "_" + new Date().toISOString().split("T")[0] + ".pdf";
  return { blob: pdf.output("blob"), filename: dated };
}

export default {
  generateCarte1: generateCarte1,
  generateCarte2: generateCarte2,
};
