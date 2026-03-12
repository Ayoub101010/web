import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ===== DONNÉES COMMUNES =====

const EXCEL_HEADERS = [
  'Code Piste', 'Date', 'Région', 'Préfecture', 'Commune',
  'Km', 'Zones Plaine', 'Superficie (ha)',
  'Nb Chaussées', 'Types Chaussées', 'Km Chaussées',
  'Buses', 'Ponts', 'Dalots', 'Bacs',
  'Écoles', 'Marchés', 'Services Santé', 'Autres',
  'Bât. Admin', 'Hydrauliques', 'Localités', 'Passages Sub.',
  'Sites Plaine', 'Pts Coupure', 'Pts Critiques',
];

const PDF_HEADERS = [
  'Code Piste', 'Date', 'Région', 'Préfecture', 'Commune',
  'Km', 'Zon.', 'Sup.(ha)',
  'Ch.', 'Types Chaussées', 'Km Ch.',
  'Bus', 'Pnt', 'Dal', 'Bac',
  'Eco', 'Mar', 'San', 'Aut',
  'Adm', 'Hyd', 'Loc', 'Pas',
  'PPR', 'Coup', 'Crit',
];

const INFRA_FIELDS = [
  'buses', 'ponts', 'dalots', 'bacs', 'ecoles', 'marches',
  'services_sante', 'autres', 'batiments_admin', 'hydrauliques',
  'localites', 'passages', 'ppr_itial', 'points_coupures', 'points_critiques',
];

const pisteToRow = (piste) => {
  const types = piste.chaussees_types || {};
  const typesStr = Object.entries(types)
    .map(([t, d]) => d.count > 1 ? `${t} ×${d.count}` : t)
    .join('\n') || '—';
  const kmStr = Object.values(types)
    .map(d => `${parseFloat(d.km).toFixed(3)} km`)
    .join('\n') || '—';
  return [
    piste.code_piste || '',
    piste.date || '',
    piste.region || '',
    piste.prefecture || '',
    piste.localite || '',
    parseFloat(piste.kilometrage || 0).toFixed(3),
    piste.enquete_polygone || 0,
    parseFloat(piste.enquete_polygone_superficie || 0).toFixed(2),
    piste.chaussees_count || 0,
    typesStr,
    kmStr,
    ...INFRA_FIELDS.map(f => piste[f] || 0),
  ];
};

const calcTotals = (pistesData) => [
  'TOTAL', '', '', '', '',
  pistesData.reduce((s, p) => s + parseFloat(p.kilometrage || 0), 0).toFixed(3),
  pistesData.reduce((s, p) => s + (parseInt(p.enquete_polygone) || 0), 0),
  pistesData.reduce((s, p) => s + parseFloat(p.enquete_polygone_superficie || 0), 0).toFixed(2),
  pistesData.reduce((s, p) => s + (parseInt(p.chaussees_count) || 0), 0),
  '', '',
  ...INFRA_FIELDS.map(f =>
    pistesData.reduce((s, p) => s + (parseInt(p[f]) || 0), 0)
  ),
];

// ===== EXPORT EXCEL =====
const exportTableToExcel = (pistesData) => {
  try {
    const rows = pistesData.map(pisteToRow);
    const totals = calcTotals(pistesData);

    const ws = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, ...rows, totals]);

    // Largeurs de colonnes
    ws['!cols'] = [
      { wch: 24 }, // Code Piste
      { wch: 12 }, // Date
      { wch: 16 }, // Région
      { wch: 16 }, // Préfecture
      { wch: 14 }, // Commune
      { wch: 10 }, // Km
      { wch: 10 }, // Zones Plaine
      { wch: 12 }, // Superficie
      { wch: 10 }, // Nb Ch.
      { wch: 24 }, // Types Ch.
      { wch: 16 }, // Km Ch.
      { wch: 8  }, // Buses
      { wch: 8  }, // Ponts
      { wch: 8  }, // Dalots
      { wch: 8  }, // Bacs
      { wch: 8  }, // Écoles
      { wch: 8  }, // Marchés
      { wch: 13 }, // Services Santé
      { wch: 8  }, // Autres
      { wch: 10 }, // Bât. Admin
      { wch: 10 }, // Hydrauliques
      { wch: 10 }, // Localités
      { wch: 13 }, // Passages Sub.
      { wch: 10 }, // Sites Plaine
      { wch: 10 }, // Pts Coupure
      { wch: 10 }, // Pts Critiques
    ];

    // wrapText sur Types Chaussées (col 9) et Km Chaussées (col 10)
    for (let r = 1; r <= rows.length; r++) {
      [9, 10].forEach(c => {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) {
          ws[ref].s = { alignment: { wrapText: true, vertical: 'top' } };
        }
      });
    }

    // Hauteurs de lignes : adaptées au nombre de types par piste
    ws['!rows'] = [
      { hpt: 20 },  // en-tête
      ...rows.map(row => {
        const lines = String(row[9] || '').split('\n').length;
        return { hpt: Math.max(18, lines * 16) };
      }),
      { hpt: 18 },  // TOTAL
    ];

    // Style gras + fond sur l'en-tête et la ligne total
    const totalRowIndex = rows.length + 1; // 0-indexed, après l'en-tête et les données
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
      // En-tête (ligne 0)
      const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[headerCell]) ws[headerCell] = {};
      ws[headerCell].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8EDF5' } }, alignment: { horizontal: 'center' } };
      // Total (dernière ligne)
      const totalCell = XLSX.utils.encode_cell({ r: totalRowIndex, c: C });
      if (ws[totalCell]) {
        ws[totalCell].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F0F4FF' } } };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pistes et Infrastructures');
    XLSX.writeFile(wb, `pistes-infrastructures-${new Date().toISOString().split('T')[0]}.xlsx`);
    return true;
  } catch (error) {
    alert('Erreur lors de l\'export Excel : ' + error.message);
    return false;
  }
};

// ===== EXPORT PDF =====
const exportTableToPDF = (pistesData) => {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const dateStr = new Date().toLocaleDateString('fr-FR');

    // Titre
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('Tableau de Bord — Pistes et Équipements', 10, 12);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`Export du ${dateStr}  |  ${pistesData.length} piste(s)`, 10, 18);
    doc.setTextColor(0);

    const body = pistesData.map(pisteToRow);
    const foot  = [calcTotals(pistesData)];

    autoTable(doc, {
      startY: 22,
      head: [PDF_HEADERS],
      body,
      foot,
      showFoot: 'lastPage',
      theme: 'striped',
      styles: {
        fontSize: 5.8,
        cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
        valign: 'middle',
        overflow: 'linebreak',
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [50, 73, 103],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 5.8,
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 255],
      },
      footStyles: {
        fillColor: [240, 244, 255],
        textColor: [30, 60, 114],
        fontStyle: 'bold',
        fontSize: 5.8,
      },
      columnStyles: {
        0:  { cellWidth: 25, halign: 'left'   }, // Code Piste
        1:  { cellWidth: 15, halign: 'center' }, // Date
        2:  { cellWidth: 14, halign: 'left'   }, // Région
        3:  { cellWidth: 14, halign: 'left'   }, // Préfecture
        4:  { cellWidth: 13, halign: 'left'   }, // Commune
        5:  { cellWidth: 11, halign: 'right'  }, // Km
        6:  { cellWidth: 8,  halign: 'center' }, // Zon.
        7:  { cellWidth: 10, halign: 'right'  }, // Sup.
        8:  { cellWidth: 6,  halign: 'center' }, // Ch.
        9:  { cellWidth: 20, halign: 'left'   }, // Types Ch.
        10: { cellWidth: 14, halign: 'right'  }, // Km Ch.
        // Infrastructure columns (indices 11-25): 7mm each
        11: { cellWidth: 7, halign: 'center' },
        12: { cellWidth: 7, halign: 'center' },
        13: { cellWidth: 7, halign: 'center' },
        14: { cellWidth: 7, halign: 'center' },
        15: { cellWidth: 7, halign: 'center' },
        16: { cellWidth: 7, halign: 'center' },
        17: { cellWidth: 7, halign: 'center' },
        18: { cellWidth: 7, halign: 'center' },
        19: { cellWidth: 7, halign: 'center' },
        20: { cellWidth: 7, halign: 'center' },
        21: { cellWidth: 7, halign: 'center' },
        22: { cellWidth: 7, halign: 'center' },
        23: { cellWidth: 7, halign: 'center' },
        24: { cellWidth: 7, halign: 'center' },
        25: { cellWidth: 7, halign: 'center' },
      },
      margin: { top: 10, left: 10, right: 10, bottom: 14 },
      didDrawPage(data) {
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(120);
        doc.text(
          `Page ${data.pageNumber} / ${pageCount}`,
          doc.internal.pageSize.getWidth() - 10,
          doc.internal.pageSize.getHeight() - 5,
          { align: 'right' }
        );
        doc.setTextColor(0);
      },
    });

    doc.save(`pistes-infrastructures-${new Date().toISOString().split('T')[0]}.pdf`);
    return true;
  } catch (error) {
    alert('Erreur lors de l\'export PDF : ' + error.message);
    return false;
  }
};

export { exportTableToExcel, exportTableToPDF };
