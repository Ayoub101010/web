// CartographieGenerator.js — V5b
// Carte 1: Pistes+Ouvrages | Carte 2: Zones de production
// Fix: Préfecture de X dans le header

import jsPDF from "jspdf";
import dataservice from "./dataservice";
import ndgrLogo from "../assets/NDGR_Logo.png";

var CW = 2800,
  CH = 2000;
var MARGIN = 30,
  HEADER_H = 200;
var MAP = {
  x: MARGIN,
  y: HEADER_H + 10,
  w: CW - MARGIN * 2,
  h: CH - HEADER_H - 50,
};
var LEGEND_BOX = { x: MAP.x + MAP.w - 360, y: MAP.y + 15, w: 345, h: 0 };
var TABLE_BOX = { x: MAP.x + 15, y: MAP.y + MAP.h - 330, w: 900, h: 315 };
var SITPLAN_BOX = { x: MAP.x + MAP.w - 360, y: 0, w: 345, h: 280 };

var COLORS = {
  mapBg: "#FFF8DC",
  prefFill: "rgba(255,248,220,0.15)",
  prefStroke: "#2980b9",
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
    i.onload = function () {
      r(i);
    };
    i.onerror = function () {
      r(null);
    };
    i.src = s;
  });
}
function bboxFromCoords(c) {
  var a = Infinity,
    b = Infinity,
    d = -Infinity,
    e = -Infinity;
  (function w(x) {
    if (typeof x[0] === "number") {
      a = Math.min(a, x[0]);
      b = Math.min(b, x[1]);
      d = Math.max(d, x[0]);
      e = Math.max(e, x[1]);
    } else x.forEach(w);
  })(c);
  return [a, b, d, e];
}
function combinedBbox(fs) {
  var a = Infinity,
    b = Infinity,
    d = -Infinity,
    e = -Infinity;
  fs.forEach(function (f) {
    if (!f.geometry || !f.geometry.coordinates) return;
    var x = bboxFromCoords(f.geometry.coordinates);
    a = Math.min(a, x[0]);
    b = Math.min(b, x[1]);
    d = Math.max(d, x[2]);
    e = Math.max(e, x[3]);
  });
  var px = (d - a) * 0.12 || 0.05,
    py = (e - b) * 0.12 || 0.05;
  return [a - px, b - py, d + px, e + py];
}
function makeProj(bb, r) {
  var s = Math.min(r.w / (bb[2] - bb[0]), r.h / (bb[3] - bb[1]));
  var ox = r.x + (r.w - (bb[2] - bb[0]) * s) / 2,
    oy = r.y + (r.h - (bb[3] - bb[1]) * s) / 2;
  return function (lon, lat) {
    return { x: ox + (lon - bb[0]) * s, y: oy + (bb[3] - lat) * s };
  };
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
function getLabelPos(coords, proj) {
  if (!coords || coords.length < 2) return null;
  var pts = coords.map(function (c) {
    return proj(c[0], c[1]);
  });
  var segs = [],
    tot = 0;
  for (var i = 1; i < pts.length; i++) {
    var dx = pts[i].x - pts[i - 1].x,
      dy = pts[i].y - pts[i - 1].y;
    segs.push(Math.sqrt(dx * dx + dy * dy));
    tot += segs[segs.length - 1];
  }
  var half = tot / 2,
    cum = 0;
  for (var j = 0; j < segs.length; j++) {
    cum += segs[j];
    if (cum >= half) {
      var ov = cum - half,
        r = 1 - ov / segs[j];
      var p1 = pts[j],
        p2 = pts[j + 1];
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
        var dx = pl[i][0] - x,
          dy = pl[i][1] - y;
        if (dx * dx + dy * dy < minD * minD) return false;
      }
      return true;
    },
    add: function (x, y) {
      pl.push([x, y]);
    },
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
    if (fill && i === 0) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  });
  if (stroke) {
    coords.forEach(function (ring) {
      drawRing(ctx, ring, proj);
    });
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
    g.coordinates.forEach(function (p) {
      drawPoly(ctx, p, proj, fill, stroke, lw);
    });
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

// ── DATA ──
async function fetchBoundaries(prefIds) {
  var r = await dataservice.loadAdministrativeBoundaries(12, null, null);
  if (!r.success || !r.data || !r.data.features)
    return { prefs: [], allPrefs: [], allRegions: [] };
  var fs = r.data.features;
  return {
    allRegions: fs.filter(function (f) {
      return f.properties.type === "region";
    }),
    allPrefs: fs.filter(function (f) {
      return f.properties.type === "prefecture";
    }),
    prefs: fs.filter(function (f) {
      return (
        f.properties.type === "prefecture" && prefIds.includes(f.properties.id)
      );
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
async function drawHeader(ctx, names, carteNum, carteTitle) {
  ctx.fillStyle = COLORS.headerBg;
  ctx.fillRect(0, 0, CW, HEADER_H);
  var logo = await loadImage(ndgrLogo);
  if (logo) {
    var lh = 160,
      lw = lh * (logo.width / logo.height);
    ctx.drawImage(logo, 25, 20, lw, lh);
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  var cx = CW / 2;
  ctx.font = "bold 30px Arial";
  ctx.fillText("REPUBLIQUE DE GUINEE", cx, 36);
  ctx.font = "22px Arial";
  ctx.fillText("Ministère de l'Agriculture", cx, 62);
  ctx.font = "bold 22px Arial";
  ctx.fillText("Direction Nationale du Génie Rural", cx, 90);
  ctx.font = "18px Arial";
  ctx.fillText(
    "Projet de Désenclavement des zones de production Pisci-rizicole",
    cx,
    116,
  );
  ctx.fillText("en Basse Guinée et Guinée forestière", cx, 138);

  // Préfecture(s) en GRAS JAUNE
  if (names.prefectures && names.prefectures.length) {
    var prefTxt =
      names.prefectures.length > 1 ? "Préfectures de " : "Préfecture de ";
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#f1c40f";
    ctx.fillText(prefTxt + names.prefectures.join(", "), cx, 166);
  }

  ctx.font = "16px Arial";
  ctx.fillStyle = "#bdc3c7";
  ctx.fillText(
    "Financement : Agence Française de Développement (AFD)",
    cx,
    190,
  );
}

// ── SITUATION PLAN ──
function drawSitPlan(ctx, bd) {
  var s = SITPLAN_BOX;
  var bgF = bd.allPrefs.length ? bd.allPrefs : bd.allRegions;
  if (!bgF || !bgF.length) return;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = COLORS.tableHead;
  ctx.fillRect(s.x, s.y, s.w, 30);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PLAN DE SITUATION", s.x + s.w / 2, s.y + 21);
  var sr = { x: s.x + 10, y: s.y + 38, w: s.w - 20, h: s.h - 48 };
  var sb = combinedBbox(bgF);
  var sp = makeProj(sb, sr);
  ctx.save();
  ctx.beginPath();
  ctx.rect(sr.x, sr.y, sr.w, sr.h);
  ctx.clip();
  bgF.forEach(function (f) {
    drawGeom(ctx, f, sp, "#e8ecf0", "#b0b8c4", 0.8);
  });
  bd.prefs.forEach(function (f) {
    drawGeom(ctx, f, sp, "#e74c3c", "#c0392b", 2.5);
    if (f.properties.nom && f.geometry) {
      var cb = bboxFromCoords(f.geometry.coordinates);
      var c = sp((cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2);
      ctx.font = "bold 11px Arial";
      var tw = ctx.measureText(f.properties.nom).width;
      ctx.fillStyle = "rgba(192,57,43,0.85)";
      ctx.fillRect(c.x - tw / 2 - 3, c.y - 8, tw + 6, 14);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(f.properties.nom, c.x, c.y + 3);
    }
  });
  ctx.restore();
}

// ── SCALE + NORTH + FRAMES ──
function drawScale(ctx, bbox) {
  var m = MAP,
    sx = m.x + 15,
    sy = m.y + m.h - 30;
  var mwKm =
    (bbox[2] - bbox[0]) *
    111 *
    Math.cos((((bbox[1] + bbox[3]) / 2) * Math.PI) / 180);
  var kpp = mwKm / m.w;
  var nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  var nk =
    nice.find(function (v) {
      return v >= 150 * kpp;
    }) || 150 * kpp;
  var npx = nk / kpp;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(sx - 8, sy - 22, npx + 26, 42);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - 8, sy - 22, npx + 26, 42);
  var segs = 4,
    segW = npx / segs;
  for (var i = 0; i < segs; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#333" : "#fff";
    ctx.fillRect(sx + i * segW, sy, segW, 6);
  }
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx, sy, npx, 6);
  ctx.font = "bold 11px Arial";
  ctx.fillStyle = "#333";
  ctx.textAlign = "left";
  ctx.fillText("0", sx, sy - 6);
  ctx.textAlign = "right";
  ctx.fillText(nk + " km", sx + npx, sy - 6);
}
function drawNorth(ctx) {
  var nx = MAP.x + MAP.w - 50,
    ny = MAP.y + 50;
  ctx.beginPath();
  ctx.arc(nx, ny, 26, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.moveTo(nx, ny - 18);
  ctx.lineTo(nx - 8, ny + 4);
  ctx.lineTo(nx + 8, ny + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText("N", nx, ny + 22);
}
function drawFrames(ctx) {
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 3;
  ctx.strokeRect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, CW, CH);
  ctx.font = "11px Arial";
  ctx.fillStyle = "#888";
  ctx.textAlign = "right";
  ctx.fillText(
    "WGS 84 / EPSG:4326 — " + new Date().toLocaleDateString("fr-FR"),
    CW - 15,
    CH - 8,
  );
}

// ── SHARED: draw pistes + labels ──
function drawPistes(ctx, proj, pistes) {
  (pistes || []).forEach(function (f) {
    drawGeom(ctx, f, proj, null, "rgba(255,255,255,0.5)", 9);
    drawGeom(ctx, f, proj, null, COLORS.piste, 5);
  });
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
    var pos = getLabelPos(coords, proj);
    if (!pos) return;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(pos.angle);
    ctx.font = "bold 14px Arial";
    var tw = ctx.measureText(lbl).width;
    ctx.fillStyle = COLORS.piste;
    ctx.fillRect(-tw / 2 - 5, -10, tw + 10, 18);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(lbl, 0, -1);
    ctx.restore();
  });
}

// ── SHARED: draw localités ──
function drawLocalites(ctx, proj, localites) {
  (localites || []).forEach(function (f) {
    if (!f.geometry || f.geometry.type !== "Point") return;
    var p = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.localiteDot;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    var nom =
      (f.properties ? f.properties.nom || f.properties.nom_localite : "") || "";
    if (nom) {
      ctx.font = "bold 11px Arial";
      ctx.fillStyle = COLORS.localiteTxt;
      ctx.textAlign = "left";
      ctx.fillText(nom, p.x + 8, p.y + 4);
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  CARTE 1 : PISTES ET OUVRAGES
// ══════════════════════════════════════════════════════════════

export async function generateCarte1(filters, names, onProgress) {
  var prog = onProgress || function () {};
  prog("Chargement des limites...");
  var prefIds = (filters.prefecture_id || []).map(function (id) {
    return typeof id === "string" ? parseInt(id) : id;
  });
  var bd = await fetchBoundaries(prefIds);

  prog("Chargement des infrastructures...");
  var flt = {};
  if (filters.prefecture_id && filters.prefecture_id.length)
    flt.prefecture_id = filters.prefecture_id;
  if (filters.commune_id && filters.commune_id.length)
    flt.commune_id = filters.commune_id;
  if (filters.region_id && filters.region_id.length)
    flt.region_id = filters.region_id;
  var infra = await fetchInfra(flt, [
    "pistes",
    "localites",
    "ponts",
    "dalots",
    "buses",
    "bacs",
    "passages_submersibles",
  ]);
  if (bd.prefs.length === 0 && (infra.pistes || []).length === 0) {
    alert("Aucune donnée trouvée.");
    return;
  }

  var bbox = combinedBbox(bd.prefs.length ? bd.prefs : bd.allRegions);
  prog("Dessin de la carte...");
  var canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CW, CH);

  await drawHeader(
    ctx,
    names,
    1,
    "Cartographie des pistes et ouvrages réalisés dans le cadre du projet PPR",
  );
  var proj = makeProj(bbox, MAP);

  // Fond carte + contexte
  ctx.fillStyle = COLORS.mapBg;
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.clip();
  bd.allPrefs.forEach(function (f) {
    drawGeom(ctx, f, proj, "rgba(255,248,220,0.3)", "#c8c8a0", 0.8);
  });
  bd.prefs.forEach(function (f) {
    drawGeom(ctx, f, proj, COLORS.prefFill, COLORS.prefStroke, 5, [16, 8]);
  });
  drawPistes(ctx, proj, infra.pistes);

  // Ouvrages : petits points
  var collision = createCollision(12);
  ["ponts", "dalots", "buses", "bacs", "passages_submersibles"].forEach(
    function (type) {
      var color = ICON_COLORS[type] || "#999";
      (infra[type] || []).forEach(function (f) {
        var px, py;
        if (f.geometry && f.geometry.type === "Point") {
          var p = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
          px = p.x;
          py = p.y;
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
            px = p2.x;
            py = p2.y;
          }
        }
        if (px !== undefined && collision.can(px, py)) {
          collision.add(px, py);
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    },
  );

  drawLocalites(ctx, proj, infra.localites);
  ctx.font = "bold 17px Arial";
  ctx.fillStyle = "#333";
  ctx.textAlign = "left";
  ctx.fillText(
    "Carte 1 : Cartographie des pistes et ouvrages réalisés — Projet PPR",
    MAP.x + 15,
    MAP.y + 22,
  );
  ctx.restore();

  // Légende (sans zéros)
  var legendItems = [
    {
      type: "line",
      color: COLORS.prefStroke,
      dash: [10, 5],
      lw: 4,
      label: "Limite préfecture",
    },
    {
      type: "line",
      color: COLORS.piste,
      dash: [],
      lw: 4,
      label: "Pistes (" + (infra.pistes || []).length + ")",
    },
  ];
  [
    { k: "ponts", c: ICON_COLORS.ponts, l: "Ponts" },
    { k: "dalots", c: ICON_COLORS.dalots, l: "Dalots" },
    { k: "buses", c: ICON_COLORS.buses, l: "Buses" },
    { k: "bacs", c: ICON_COLORS.bacs, l: "Bacs" },
    {
      k: "passages_submersibles",
      c: ICON_COLORS.passages_submersibles,
      l: "Pass. sub.",
    },
  ].forEach(function (o) {
    var n = (infra[o.k] || []).length;
    if (n > 0)
      legendItems.push({
        type: "dot",
        color: o.c,
        label: o.l + " (" + n + ")",
      });
  });
  var locN = (infra.localites || []).length;
  if (locN > 0)
    legendItems.push({
      type: "bigdot",
      color: COLORS.localiteDot,
      label: "Localités (" + locN + ")",
    });
  var legH = drawLegendBox(ctx, legendItems);

  SITPLAN_BOX.y = LEGEND_BOX.y + legH + 15;
  drawSitPlan(ctx, bd);
  drawTable1(ctx, infra.pistes, names);
  drawScale(ctx, bbox);
  drawNorth(ctx);
  drawFrames(ctx);

  prog("Génération du PDF...");
  exportPdf(
    canvas,
    "Carte1_Pistes_Ouvrages_" +
      (names.prefectures ? names.prefectures[0] : "carte"),
  );
  prog(null);
}

// ══════════════════════════════════════════════════════════════
//  CARTE 2 : ZONES DE PRODUCTION AGRICOLE ET HALIEUTIQUE
// ══════════════════════════════════════════════════════════════

export async function generateCarte2(filters, names, onProgress) {
  var prog = onProgress || function () {};
  prog("Chargement des limites...");
  var prefIds = (filters.prefecture_id || []).map(function (id) {
    return typeof id === "string" ? parseInt(id) : id;
  });
  var bd = await fetchBoundaries(prefIds);

  prog("Chargement des données...");
  var flt = {};
  if (filters.prefecture_id && filters.prefecture_id.length)
    flt.prefecture_id = filters.prefecture_id;
  if (filters.commune_id && filters.commune_id.length)
    flt.commune_id = filters.commune_id;
  if (filters.region_id && filters.region_id.length)
    flt.region_id = filters.region_id;
  var infra = await fetchInfra(flt, [
    "pistes",
    "localites",
    "ppr_itial",
    "enquete_polygone",
  ]);
  if (bd.prefs.length === 0 && (infra.pistes || []).length === 0) {
    alert("Aucune donnée trouvée.");
    return;
  }

  var bbox = combinedBbox(bd.prefs.length ? bd.prefs : bd.allRegions);
  prog("Dessin de la carte...");
  var canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CW, CH);

  await drawHeader(
    ctx,
    names,
    2,
    "Cartographie des zones de production agricole et halieutique désenclavées",
  );
  var proj = makeProj(bbox, MAP);

  // Fond + contexte
  ctx.fillStyle = COLORS.mapBg;
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(MAP.x, MAP.y, MAP.w, MAP.h);
  ctx.clip();
  bd.allPrefs.forEach(function (f) {
    drawGeom(ctx, f, proj, "rgba(255,248,220,0.3)", "#c8c8a0", 0.8);
  });
  bd.prefs.forEach(function (f) {
    drawGeom(ctx, f, proj, COLORS.prefFill, COLORS.prefStroke, 5, [16, 8]);
  });

  // Zones de plaine (enquete_polygone) — polygones verts semi-transparents
  (infra.enquete_polygone || []).forEach(function (f) {
    drawGeom(ctx, f, proj, COLORS.zoneFill, COLORS.zoneStroke, 2);
  });

  // Sites de plaine (ppr_itial) — triangles noirs
  (infra.ppr_itial || []).forEach(function (f) {
    if (!f.geometry || f.geometry.type !== "Point") return;
    var p = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    // Triangle noir
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 7);
    ctx.lineTo(p.x - 6, p.y + 5);
    ctx.lineTo(p.x + 6, p.y + 5);
    ctx.closePath();
    ctx.fillStyle = COLORS.siteFill;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Pistes
  drawPistes(ctx, proj, infra.pistes);

  // Localités
  drawLocalites(ctx, proj, infra.localites);

  // Sous-titre
  ctx.font = "bold 17px Arial";
  ctx.fillStyle = "#333";
  ctx.textAlign = "left";
  ctx.fillText(
    "Carte 2 : Cartographie des zones de production agricole et halieutique désenclavées",
    MAP.x + 15,
    MAP.y + 22,
  );
  ctx.restore();

  // Légende
  var legendItems = [
    {
      type: "line",
      color: COLORS.prefStroke,
      dash: [10, 5],
      lw: 4,
      label: "Limite préfecture",
    },
    {
      type: "line",
      color: COLORS.piste,
      dash: [],
      lw: 4,
      label: "Pistes (" + (infra.pistes || []).length + ")",
    },
  ];
  var zoneN = (infra.enquete_polygone || []).length;
  if (zoneN > 0)
    legendItems.push({
      type: "rect",
      color: COLORS.zoneFill,
      stroke: COLORS.zoneStroke,
      label: "Zones de plaine (" + zoneN + ")",
    });
  var siteN = (infra.ppr_itial || []).length;
  if (siteN > 0)
    legendItems.push({
      type: "triangle",
      color: COLORS.siteFill,
      label: "Sites de plaine (" + siteN + ")",
    });
  var locN = (infra.localites || []).length;
  if (locN > 0)
    legendItems.push({
      type: "bigdot",
      color: COLORS.localiteDot,
      label: "Localités (" + locN + ")",
    });
  var legH = drawLegendBox(ctx, legendItems);

  SITPLAN_BOX.y = LEGEND_BOX.y + legH + 15;
  drawSitPlan(ctx, bd);
  drawTable1(ctx, infra.pistes, names);
  drawScale(ctx, bbox);
  drawNorth(ctx);
  drawFrames(ctx);

  prog("Génération du PDF...");
  exportPdf(
    canvas,
    "Carte2_Zones_Production_" +
      (names.prefectures ? names.prefectures[0] : "carte"),
  );
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
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(l.x, l.y, l.w, l.h);
  ctx.fillStyle = COLORS.tableHead;
  ctx.fillRect(l.x, l.y, l.w, 38);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.fillText("LÉGENDE", l.x + l.w / 2, l.y + 27);
  var yy = l.y + 55;
  items.forEach(function (item) {
    if (item.type === "line") {
      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.lw;
      ctx.setLineDash(item.dash);
      ctx.beginPath();
      ctx.moveTo(l.x + 18, yy);
      ctx.lineTo(l.x + 58, yy);
      ctx.stroke();
      ctx.restore();
    } else if (item.type === "dot") {
      ctx.beginPath();
      ctx.arc(l.x + 38, yy, 5, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (item.type === "bigdot") {
      ctx.beginPath();
      ctx.arc(l.x + 38, yy, 6, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (item.type === "rect") {
      ctx.fillStyle = item.color;
      ctx.fillRect(l.x + 22, yy - 10, 32, 20);
      ctx.strokeStyle = item.stroke || "#333";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(l.x + 22, yy - 10, 32, 20);
    } else if (item.type === "triangle") {
      ctx.beginPath();
      ctx.moveTo(l.x + 38, yy - 8);
      ctx.lineTo(l.x + 30, yy + 6);
      ctx.lineTo(l.x + 46, yy + 6);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.font = "14px Arial";
    ctx.fillStyle = "#2c3e50";
    ctx.textAlign = "left";
    ctx.fillText(item.label, l.x + 68, yy + 5);
    yy += lineH;
  });
  return l.h;
}

// ── TABLE (shared) ──
function drawTable1(ctx, pistes, names) {
  var t = TABLE_BOX;
  var list = pistes || [];
  if (!list.length) return;
  var cols = [
    { label: "Commune", w: 120 },
    { label: "Code Piste", w: 145 },
    { label: "Localité", w: 120 },
    { label: "Long. (km)", w: 85 },
    { label: "X déb", w: 80 },
    { label: "Y déb", w: 80 },
    { label: "X fin", w: 80 },
    { label: "Y fin", w: 80 },
  ];
  var totalW = cols.reduce(function (s, c) {
    return s + c.w;
  }, 0);
  var sc = t.w / totalW;
  cols.forEach(function (c) {
    c.w *= sc;
  });
  var rowH = 22;
  var maxRows = Math.min(list.length, Math.floor((t.h - 50) / rowH));
  var actualH = 50 + maxRows * rowH + rowH;
  t.h = actualH;
  ctx.fillStyle = "rgba(255,255,255,0.93)";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(t.x, t.y, t.w, t.h);
  ctx.fillStyle = COLORS.tableHead;
  ctx.fillRect(t.x, t.y, t.w, 26);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";
  ctx.fillText("TABLEAU DES PISTES", t.x + t.w / 2, t.y + 18);
  var headerY = t.y + 26;
  var xx = t.x;
  ctx.fillStyle = "#ecf0f1";
  ctx.fillRect(t.x, headerY, t.w, rowH);
  cols.forEach(function (col) {
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(xx, headerY, col.w, rowH);
    ctx.font = "bold 10px Arial";
    ctx.fillStyle = "#2c3e50";
    ctx.textAlign = "center";
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
    var lkm =
      pr.longueur ||
      pr.kilometrage ||
      pr.length_km ||
      (coords ? computeKm(coords).toFixed(2) : "—");
    var loc = pr.nom_destination_piste || pr.nom_origine_piste || "—";
    var rowY = headerY + rowH + i * rowH;
    xx = t.x;
    ctx.fillStyle = i % 2 === 0 ? "#fff" : "#f7f9fc";
    ctx.fillRect(t.x, rowY, t.w, rowH);
    [
      pr.commune_nom || "—",
      pr.code_piste || "—",
      loc,
      typeof lkm === "number" ? lkm.toFixed(2) : String(lkm),
      se.start ? se.start[0].toFixed(4) : "—",
      se.start ? se.start[1].toFixed(4) : "—",
      se.end ? se.end[0].toFixed(4) : "—",
      se.end ? se.end[1].toFixed(4) : "—",
    ].forEach(function (v, j) {
      ctx.strokeStyle = "#ddd";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(xx, rowY, cols[j].w, rowH);
      ctx.font = "9px Arial";
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      ctx.fillText(String(v), xx + cols[j].w / 2, rowY + 15);
      xx += cols[j].w;
    });
  }
  var totY = headerY + rowH + maxRows * rowH;
  ctx.fillStyle = "#ecf0f1";
  ctx.fillRect(t.x, totY, t.w, rowH);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 0.5;
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
  ctx.font = "bold 10px Arial";
  ctx.fillStyle = "#2c3e50";
  ctx.textAlign = "center";
  ctx.fillText(
    "TOTAL : " + list.length + " pistes — " + totKm.toFixed(2) + " km",
    t.x + t.w / 2,
    totY + 15,
  );
}

// ── PDF EXPORT ──
function exportPdf(canvas, filename) {
  var pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [CW * 0.75, CH * 0.75],
  });
  pdf.addImage(
    canvas.toDataURL("image/png", 1.0),
    "PNG",
    0,
    0,
    pdf.internal.pageSize.getWidth(),
    pdf.internal.pageSize.getHeight(),
    undefined,
    "FAST",
  );
  pdf.save(filename + "_" + new Date().toISOString().split("T")[0] + ".pdf");
}

export default {
  generateCarte1: generateCarte1,
  generateCarte2: generateCarte2,
};
