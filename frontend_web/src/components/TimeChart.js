import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import Chart from "chart.js/auto";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import "./TimeChart.css";
import api from "./api";
import * as XLSX from 'xlsx';
import CustomSelect from "./CustomSelect";

/* ── Calendrier custom entièrement contrôlé (sans curseur natif) ── */
const MONTH_NAMES  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const SHORT_MONTHS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const DAY_NAMES   = ['lu','ma','me','je','ve','sa','di'];

const parseDate = (str) => str ? new Date(str + 'T00:00:00') : null;
const toISO = (y, m, d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

const CustomCalendar = ({ value, onChange, min, max, onClose }) => {
  const today      = new Date();
  const selected   = parseDate(value);
  const minDate    = parseDate(min);
  const maxDate    = parseDate(max);

  const initYear  = selected ? selected.getFullYear()  : today.getFullYear();
  const initMonth = selected ? selected.getMonth()     : today.getMonth();
  const [viewYear,  setViewYear]  = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayRaw = new Date(viewYear, viewMonth, 1).getDay();
  const firstDay    = (firstDayRaw + 6) % 7; // lundi = 0

  const cells = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y-1)) : setViewMonth(m => m-1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0),  setViewYear(y => y+1)) : setViewMonth(m => m+1);

  const isDisabled = (d) => {
    if (!d) return true;
    const dt = new Date(viewYear, viewMonth, d);
    return (minDate && dt < minDate) || (maxDate && dt > maxDate);
  };
  const isSelected = (d) => d && selected &&
    selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d;
  const isToday = (d) => d && today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;

  const pick = (d) => {
    if (!d || isDisabled(d)) return;
    onChange({ target: { value: toISO(viewYear, viewMonth, d) } });
    onClose();
  };
  const pickToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear()); setViewMonth(t.getMonth());
    pick(t.getDate());
  };
  const clear = () => { onChange({ target: { value: '' } }); onClose(); };

  return (
    <div className="custom-calendar" onTouchEnd={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="cal-header">
        <button className="cal-nav" onTouchEnd={(e) => { e.preventDefault(); prevMonth(); }} onClick={(e) => { e.stopPropagation(); prevMonth(); }}>‹</button>
        <span className="cal-title">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button className="cal-nav" onTouchEnd={(e) => { e.preventDefault(); nextMonth(); }} onClick={(e) => { e.stopPropagation(); nextMonth(); }}>›</button>
      </div>
      <div className="cal-grid">
        {DAY_NAMES.map(d => <div key={d} className="cal-day-name">{d}</div>)}
        {cells.map((d, i) => (
          <div
            key={i}
            className={[
              'cal-cell',
              !d              ? 'cal-empty'    : '',
              isDisabled(d)   ? 'cal-disabled' : '',
              isSelected(d)   ? 'cal-selected' : '',
              isToday(d)      ? 'cal-today'    : '',
            ].join(' ').trim()}
            onTouchEnd={(e) => { e.preventDefault(); pick(d); }}
            onClick={() => pick(d)}
          >{d}</div>
        ))}
      </div>
      <div className="cal-footer">
        <button className="cal-footer-btn" onTouchEnd={(e) => { e.preventDefault(); clear(); }} onClick={clear}>Effacer</button>
        <button className="cal-footer-btn cal-footer-today" onTouchEnd={(e) => { e.preventDefault(); pickToday(); }} onClick={pickToday}>Aujourd'hui</button>
      </div>
    </div>
  );
};

const CustomDateInput = ({ value, onChange, min, max, placeholder = 'Date' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, []);

  const displayValue = value ? value.split('-').reverse().join('/') : placeholder;

  return (
    <>
      {/* Backdrop mobile : ferme le calendrier au tap en dehors */}
      {open && <div className="cal-backdrop" onTouchEnd={(e) => { e.preventDefault(); setOpen(false); }} onClick={() => setOpen(false)} />}
      <div
        ref={ref}
        className={`custom-date-wrapper${!value ? ' custom-date-empty' : ''}${open ? ' custom-date-open' : ''}`}
        onTouchEnd={(e) => { e.preventDefault(); setOpen(o => !o); }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="custom-date-display">{displayValue}</span>
        <i className="fas fa-calendar-alt custom-date-icon" />
        {open && (
          <CustomCalendar
            value={value}
            onChange={(e) => { onChange(e); setOpen(false); }}
            min={min}
            max={max}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </>
  );
};

/* ── Calendrier mois custom ── */
const CustomMonthCalendar = ({ value, onChange, min, max, onClose }) => {
  const today       = new Date();
  const selYear     = value ? parseInt(value.split('-')[0]) : null;
  const selMonth    = value ? parseInt(value.split('-')[1]) - 1 : null;
  const minYear     = min   ? parseInt(min.split('-')[0])   : null;
  const minMonthIdx = min   ? parseInt(min.split('-')[1]) - 1 : null;
  const maxYear     = max   ? parseInt(max.split('-')[0])   : null;
  const maxMonthIdx = max   ? parseInt(max.split('-')[1]) - 1 : null;

  const [viewYear, setViewYear] = useState(selYear || today.getFullYear());

  // isDisabled reçoit l'année explicitement pour éviter les captures de state périmées
  const isDisabled = (y, mIdx) => {
    if (minYear !== null && (y < minYear || (y === minYear && mIdx < minMonthIdx))) return true;
    if (maxYear !== null && (y > maxYear || (y === maxYear && mIdx > maxMonthIdx))) return true;
    return false;
  };

  const canPrev = minYear === null || viewYear > minYear;
  const canNext = maxYear === null || viewYear < maxYear;

  const pick = (mIdx) => {
    if (isDisabled(viewYear, mIdx)) return;
    onChange({ target: { value: `${viewYear}-${String(mIdx + 1).padStart(2, '0')}` } });
    onClose();
  };

  // pickThisMonth : n'utilise pas viewYear (état potentiellement périmé)
  const pickThisMonth = () => {
    const y = today.getFullYear();
    const m = today.getMonth();
    if (isDisabled(y, m)) return;
    onChange({ target: { value: `${y}-${String(m + 1).padStart(2, '0')}` } });
    setViewYear(y);
    onClose();
  };

  const clear = () => { onChange({ target: { value: '' } }); onClose(); };
  const isTodayDisabled = isDisabled(today.getFullYear(), today.getMonth());

  return (
    <div className="custom-calendar custom-month-calendar"
      onTouchEnd={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="cal-header">
        <button className="cal-nav" disabled={!canPrev}
          onTouchEnd={(e) => { e.preventDefault(); if (canPrev) setViewYear(y => y - 1); }}
          onClick={() => canPrev && setViewYear(y => y - 1)}>‹</button>
        <span className="cal-title">{viewYear}</span>
        <button className="cal-nav" disabled={!canNext}
          onTouchEnd={(e) => { e.preventDefault(); if (canNext) setViewYear(y => y + 1); }}
          onClick={() => canNext && setViewYear(y => y + 1)}>›</button>
      </div>
      <div className="month-grid">
        {SHORT_MONTHS.map((name, idx) => (
          <div key={idx}
            className={[
              'month-cell',
              isDisabled(viewYear, idx) ? 'cal-disabled' : '',
              selYear === viewYear && selMonth === idx ? 'cal-selected' : '',
              today.getFullYear() === viewYear && today.getMonth() === idx ? 'cal-today' : '',
            ].join(' ').trim()}
            onTouchEnd={(e) => { e.preventDefault(); pick(idx); }}
            onClick={() => pick(idx)}>
            {name}
          </div>
        ))}
      </div>
      <div className="cal-footer">
        <button className="cal-footer-btn"
          onTouchEnd={(e) => { e.preventDefault(); clear(); }} onClick={clear}>Effacer</button>
        <button className="cal-footer-btn cal-footer-today"
          disabled={isTodayDisabled}
          onTouchEnd={(e) => { e.preventDefault(); if (!isTodayDisabled) pickThisMonth(); }}
          onClick={pickThisMonth}>Ce mois</button>
      </div>
    </div>
  );
};

const CustomMonthInput = ({ value, onChange, min, max }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, []);

  const displayValue = value
    ? `${SHORT_MONTHS[parseInt(value.split('-')[1]) - 1]} ${value.split('-')[0]}`
    : 'YYYY-MM';

  return (
    <>
      {open && <div className="cal-backdrop"
        onTouchEnd={(e) => { e.preventDefault(); setOpen(false); }} onClick={() => setOpen(false)} />}
      <div ref={ref}
        className={`custom-date-wrapper${!value ? ' custom-date-empty' : ''}${open ? ' custom-date-open' : ''}`}
        onTouchEnd={(e) => { e.preventDefault(); setOpen(o => !o); }}
        onClick={() => setOpen(o => !o)}>
        <span className="custom-date-display">{displayValue}</span>
        <i className="fas fa-calendar-alt custom-date-icon" />
        {open && (
          <CustomMonthCalendar value={value}
            onChange={(e) => { onChange(e); setOpen(false); }}
            min={min} max={max} onClose={() => setOpen(false)} />
        )}
      </div>
    </>
  );
};

const TimeChart = () => {
  const chartRef = useRef(null);
  const modalChartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const modalChartInstanceRef = useRef(null);
  const exportContainerRef = useRef(null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [temporalData, setTemporalData] = useState({});
  const [totalByPeriod, setTotalByPeriod] = useState({});
  const [selectedTypes, setSelectedTypes] = useState(new Set());
  const [modalDateFrom, setModalDateFrom] = useState("");
  const [modalDateTo, setModalDateTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [hasApplied, setHasApplied] = useState(false);



  const [temporalMode, setTemporalMode] = useState('daily');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState('');
  const [selectedCommune, setSelectedCommune] = useState('');
  const [regions, setRegions] = useState([]);
  const [prefectures, setPrefectures] = useState([]);
  const [communes, setCommunes] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [allPrefectures, setAllPrefectures] = useState([]);
  const [allCommunes, setAllCommunes] = useState([]);

  const DATE_LIMITS = {
    minDate: "2020-01-01",
    maxDate: new Date().toISOString().split('T')[0]
  };

  const typeColors = React.useMemo(() => ({
    pistes: "#2980b9",
    services_santes: "#e74c3c",
    ponts: "#9b59b6",
    buses: "#f39c12",
    dalots: "#3498db",
    ecoles: "#27ae60",
    localites: "#e67e22",
    marches: "#f1c40f",
    batiments_administratifs: "#34495e",
    infrastructures_hydrauliques: "#1abc9c",
    bacs: "#d35400",
    passages_submersibles: "#95a5a6",
    autres_infrastructures: "#7f8c8d",
    chaussees: "#8e44ad"
  }), []);

  const typeLabels = React.useMemo(() => ({
    pistes: "Pistes",
    services_santes: "Serv. santé",
    ponts: "Ponts",
    buses: "Buses",
    dalots: "Dalots",
    ecoles: "Écoles",
    localites: "Localités",
    marches: "Marchés",
    batiments_administratifs: "Bât. admin.",
    infrastructures_hydrauliques: "Infra. hydr.",
    bacs: "Bacs",
    passages_submersibles: "Pass. subm.",
    autres_infrastructures: "Autres",
    chaussees: "Chaussées"
  }), []);

  const frontendToBackendMapping = React.useMemo(() => ({
    'pistes': 'pistes',
    'services_santes': 'services_santes',
    'ponts': 'ponts',
    'buses': 'buses',
    'dalots': 'dalots',
    'ecoles': 'ecoles',
    'localites': 'localites',
    'marches': 'marches',
    'batiments_administratifs': 'batiments_administratifs',
    'infrastructures_hydrauliques': 'infrastructures_hydrauliques',
    'bacs': 'bacs',
    'passages_submersibles': 'passages_submersibles',
    'autres_infrastructures': 'autres_infrastructures',
    'chaussees': 'chaussees'
  }), []);

  useEffect(() => {
    const loadHierarchy = async () => {
      try {
        const result = await api.geography.getHierarchy();


        // Gérer les deux formats possibles (avec/sans cache)
        const hierarchy = result.hierarchy || result.data?.hierarchy;

        if (result.success && hierarchy) {

          const regions = [];
          const prefectures = [];
          const communes = [];

          hierarchy.forEach(region => {
            regions.push({
              id: region.id,
              nom: region.nom
            });

            if (region.prefectures) {
              region.prefectures.forEach(prefecture => {
                prefectures.push({
                  id: prefecture.id,
                  nom: prefecture.nom,
                  region_id: region.id
                });

                if (prefecture.communes) {
                  prefecture.communes.forEach(commune => {
                    communes.push({
                      id: commune.id,
                      nom: commune.nom,
                      prefecture_id: prefecture.id,
                      region_id: region.id
                    });
                  });
                }
              });
            }
          });

          setRegions(regions);
          setAllPrefectures(prefectures);
          setAllCommunes(communes);
        } else {
          setRegions([]);
          setAllPrefectures([]);
          setAllCommunes([]);
        }
      } catch (error) {
        setRegions([]);
        setAllPrefectures([]);
        setAllCommunes([]);
      }
    };

    loadHierarchy();
  }, []);

  // Filtrer préfectures LOCALEMENT (sans appel API)
  useEffect(() => {
    if (selectedRegion && allPrefectures.length > 0) {
      const regionIdInt = parseInt(selectedRegion);
      const filtered = allPrefectures.filter(p => p.region_id === regionIdInt);

      setPrefectures(filtered);
    } else {
      setPrefectures([]);
    }

    setSelectedPrefecture('');
    setSelectedCommune('');
  }, [selectedRegion, allPrefectures]);

  // Filtrer communes LOCALEMENT (sans appel API)
  useEffect(() => {
    if (selectedPrefecture && allCommunes.length > 0) {
      const prefectureIdInt = parseInt(selectedPrefecture);
      const filtered = allCommunes.filter(c => c.prefecture_id === prefectureIdInt);

      setCommunes(filtered);
    } else {
      setCommunes([]);
    }

    setSelectedCommune('');
  }, [selectedPrefecture, allCommunes]);

  const formatDate = React.useCallback((dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }, []);

  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split('-');
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const validateDateRange = (dateFrom, dateTo) => {
    if (!dateFrom || !dateTo) {
      return { valid: false, error: "Veuillez sélectionner les deux dates" };
    }

    const startDate = new Date(dateFrom);
    const endDate = new Date(dateTo);
    const minDate = new Date(DATE_LIMITS.minDate);
    const maxDate = new Date(DATE_LIMITS.maxDate);

    if (startDate < minDate || endDate > maxDate) {
      return {
        valid: false,
        error: `Les dates doivent être entre ${DATE_LIMITS.minDate} et ${DATE_LIMITS.maxDate}`
      };
    }

    if (startDate >= endDate) {
      return { valid: false, error: "La date de début doit être antérieure à la date de fin" };
    }

    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 7) {
      return {
        valid: false,
        error: "Période maximum : 7 jours"
      };
    }

    return { valid: true, days: diffDays };
  };

  const generatePeriodDates = () => {
    if (temporalMode === 'monthly') {
      return selectedMonths.sort();
    }

    if (!modalDateFrom || !modalDateTo) return [];

    const dates = [];
    const startDate = new Date(modalDateFrom);
    const endDate = new Date(modalDateTo);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate).toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  };

  const buildSummaryTableData = () => {
    const dates = generatePeriodDates();
    const selectedTypesList = Array.from(selectedTypes);

    const tableData = selectedTypesList.map(type => {
      const typeData = temporalData[type] || [];
      const rowData = {
        type: typeLabels[type] || type,
        color: typeColors[type],
        dates: {},
        total: 0
      };

      dates.forEach(date => {
        rowData.dates[date] = 0;
      });

      typeData.forEach(item => {
        if (rowData.dates.hasOwnProperty(item.period)) {
          rowData.dates[item.period] = item.count;
          rowData.total += item.count;
        }
      });

      return rowData;
    });

    return { dates, tableData };
  };

  const exportToExcel = () => {
    setIsExporting(true);

    try {
      const { dates, tableData } = buildSummaryTableData();

      // Créer les données pour Excel
      const excelData = [];

      // Ligne 1 : Titre
      excelData.push(['ANALYSE TEMPORELLE DES COLLECTES']);

      // Ligne 2 : Mode
      excelData.push([`Mode : ${temporalMode === 'daily' ? 'Journalier (8 jours max)' : 'Mensuel (12 mois max)'}`]);

      // Ligne 3 : Période
      if (temporalMode === 'daily') {
        excelData.push([`Période : Du ${formatDate(modalDateFrom)} au ${formatDate(modalDateTo)}`]);
      } else {
        excelData.push([`Période : ${selectedMonths.length} mois sélectionnés`]);
      }

      // Ligne vide
      excelData.push([]);

      // EN-TÊTE DU TABLEAU
      const header = ['Infrastructure', ...dates.map(d =>
        temporalMode === 'daily' ? formatDate(d) : formatMonth(d)
      ), 'Total'];
      excelData.push(header);

      // DONNÉES
      tableData.forEach(row => {
        const rowData = [
          row.type,
          ...dates.map(date => row.dates[date] || 0),
          row.total
        ];
        excelData.push(rowData);
      });

      // TOTAL GÉNÉRAL
      const totalRow = [
        'TOTAL GÉNÉRAL',
        ...dates.map(date =>
          tableData.reduce((sum, row) => sum + (row.dates[date] || 0), 0)
        ),
        tableData.reduce((sum, row) => sum + row.total, 0)
      ];
      excelData.push(totalRow);

      // Créer le fichier Excel
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Collectes');

      // Télécharger
      XLSX.writeFile(wb, `collectes-${temporalMode}-${new Date().toISOString().split('T')[0]}.xlsx`);

    } catch (error) {
      alert("Erreur lors de l'export Excel");
    } finally {
      setIsExporting(false);
    }
  };

  /* Clone le container dans document.body (hors de tout overflow/height parent) pour
     capturer le tableau COMPLET — même les colonnes/lignes hors écran. */
  const captureExportCanvas = async () => {
    const container = exportContainerRef.current;
    const origTableWrapper = container.querySelector('.summary-table-wrapper');

    // Largeur totale du tableau (inclut les colonnes cachées par overflow-x)
    const fullTableWidth = origTableWrapper ? origTableWrapper.scrollWidth : 0;
    const cloneWidth = Math.max(fullTableWidth + 48, container.offsetWidth);

    // Clone hors DOM visible
    const clone = container.cloneNode(true);
    Object.assign(clone.style, {
      position: 'absolute',
      top: '-99999px',
      left: '0',
      width: cloneWidth + 'px',
      background: 'white',
      overflow: 'visible',
    });

    // Libérer le scroll horizontal du tableau dans le clone
    const cloneTableWrapper = clone.querySelector('.summary-table-wrapper');
    if (cloneTableWrapper) {
      cloneTableWrapper.style.overflowX = 'visible';
      cloneTableWrapper.style.overflowY = 'visible';
    }

    // Supprimer le sticky sur la colonne type (évite artefacts dans le clone)
    clone.querySelectorAll('td.type-cell, th.type-column').forEach(el => {
      el.style.position = 'static';
    });

    document.body.appendChild(clone);
    // Deux frames pour laisser le navigateur calculer le layout du clone
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    let canvas;
    try {
      canvas = await html2canvas(clone, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });
    } finally {
      document.body.removeChild(clone);
    }

    return canvas;
  };

  const handleExportPNG = async () => {
    if (!exportContainerRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await captureExportCanvas();
      const link = document.createElement('a');
      link.download = `evolution-collectes-${modalDateFrom}-${modalDateTo}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      alert("Erreur lors de l'export PNG");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!exportContainerRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await captureExportCanvas();
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const imgWidth  = pdf.internal.pageSize.getWidth() - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`evolution-collectes-${modalDateFrom}-${modalDateTo}.pdf`);
    } catch (error) {
      alert("Erreur lors de l'export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const initializeModalFilters = React.useCallback(() => {
    const allTypes = Object.keys(typeLabels);
    setSelectedTypes(new Set(allTypes));
  }, [typeLabels]);

  const loadDefaultTemporalData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.temporalAnalysis.getTemporalData({
        period_type: "month",
        days_back: 365
      });

      if (result.success && result.data) {
        setTemporalData(result.data.data || {});
        setTotalByPeriod(result.data.total_by_period || {});

        const allTypes = new Set(Object.keys(result.data.data || {}));
        setSelectedTypes(allTypes);
      } else {
        setError(result.error || "Erreur lors du chargement");
        setTemporalData({});
        setTotalByPeriod({});
      }
    } catch (error) {
      setError("Erreur de connexion à l'API");
      setTemporalData({});
      setTotalByPeriod({});
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModalData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (temporalMode === 'daily') {
        const validation = validateDateRange(modalDateFrom, modalDateTo);
        if (!validation.valid) {
          setError(validation.error);
          setLoading(false);
          return;
        }
      } else if (temporalMode === 'monthly') {
        if (selectedMonths.length === 0) {
          setError('Veuillez sélectionner au moins un mois');
          setLoading(false);
          return;
        }
      }

      const backendTypes = Array.from(selectedTypes).map(
        frontendType => frontendToBackendMapping[frontendType] || frontendType
      );

      const filters = {
        period_type: temporalMode === 'daily' ? 'day' : 'month',
        types: backendTypes
      };

      // Filtres géographiques
      if (selectedCommune) {
        filters.commune_id = selectedCommune;
      } else if (selectedPrefecture) {
        filters.prefecture_id = selectedPrefecture;
      } else if (selectedRegion) {
        filters.region_id = selectedRegion;
      }

      if (temporalMode === 'daily') {
        filters.date_from = modalDateFrom;
        filters.date_to = modalDateTo;
      } else {
        const sortedMonths = [...selectedMonths].sort();
        filters.date_from = `${sortedMonths[0]}-01`;
        const [year, month] = sortedMonths[sortedMonths.length - 1].split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        filters.date_to = `${sortedMonths[sortedMonths.length - 1]}-${String(lastDay).padStart(2, '0')}`;
      }


      const result = await api.temporalAnalysis.getTemporalData(filters);


      if (result.success && result.data) {
        const data = result.data.data || {};
        const totals = result.data.total_by_period || {};

        if (temporalMode === 'monthly' && selectedMonths.length > 0) {
          const filteredData = {};
          Object.keys(data).forEach(type => {
            const typeData = data[type];
            const filteredTypeData = typeData.filter(item => selectedMonths.includes(item.period));
            if (filteredTypeData.length > 0) {
              filteredData[type] = filteredTypeData;
            }
          });

          const filteredTotals = {};
          selectedMonths.forEach(month => {
            filteredTotals[month] = 0;
            Object.values(filteredData).forEach(typeData => {
              const monthData = typeData.find(item => item.period === month);
              if (monthData) filteredTotals[month] += monthData.count;
            });
          });

          setTemporalData(filteredData);
          setTotalByPeriod(filteredTotals);
        } else {
          setTemporalData(data);
          setTotalByPeriod(totals);
        }
      } else {
        setError(result.error || "Aucune donnée disponible");
        setTemporalData({});
        setTotalByPeriod({});
      }
    } catch (error) {
      setError("Erreur de connexion à l'API");
      setTemporalData({});
      setTotalByPeriod({});
    } finally {
      setLoading(false);
    }
  };

  const handleChartClick = () => {
    if (Object.keys(temporalData).length > 0) {
      setIsExpanded(true);
      initializeModalFilters();
    }
  };

  const handleCloseExpanded = () => {
    setIsExpanded(false);
    setHasApplied(false);
    loadDefaultTemporalData();
  };

  const applyModalFilters = () => {
    setHasApplied(true);
    loadModalData();
  };

  const resetModalFilters = () => {
    setHasApplied(false);
    if (temporalMode === 'daily') {
      setModalDateFrom("");
      setModalDateTo("");
    } else {
      setSelectedMonths([]);
    }
    setSelectedRegion('');
    setSelectedPrefecture('');
    setSelectedCommune('');
    setError(null);
  };

  const addMonth = () => {
    if (selectedMonths.length >= 12) {
      alert('Maximum 12 mois');
      return;
    }
    const currentMonth = new Date().toISOString().slice(0, 7);
    setSelectedMonths([...selectedMonths, currentMonth]);
  };

  const removeMonth = (index) => {
    setSelectedMonths(selectedMonths.filter((_, i) => i !== index));
  };

  const updateMonth = (index, value) => {
    const newMonths = [...selectedMonths];

    // Vérifier si ce mois existe déjà dans un AUTRE index
    const existingIndex = newMonths.findIndex((m, i) => m === value && i !== index);

    if (existingIndex !== -1) {
      alert('Ce mois est déjà sélectionné');
      return;
    }

    newMonths[index] = value;
    setSelectedMonths(newMonths);
  };



  useEffect(() => {
    loadDefaultTemporalData();
    initializeModalFilters();
  }, [loadDefaultTemporalData, initializeModalFilters]);



  const renderSummaryTable = () => {
    // N'afficher le tableau qu'après un clic sur "Appliquer"
    if (!hasApplied) return null;

    // Vérifier le mode ET les données requises
    if (temporalMode === 'daily' && (!modalDateFrom || !modalDateTo)) {
      return null;
    }

    if (temporalMode === 'monthly' && selectedMonths.length === 0) {
      return null;
    }

    // Afficher uniquement si des données réelles existent dans la base
    if (Object.keys(temporalData).length === 0) {
      return null;
    }

    const { dates, tableData } = buildSummaryTableData();

    if (dates.length === 0 || tableData.length === 0) {
      return null;
    }

    return (
      <div className="summary-table-container">
        <h4 className="summary-table-title">
          <i className="fas fa-table"></i>
          Tableau récapitulatif des collectes
        </h4>
        <div className="summary-table-wrapper">
          <table className="summary-table">
            <thead>
              <tr>
                <th className="type-column">Type</th>
                {dates.map((date, index) => (
                  <th key={`col-${date}-${index}`} className="date-column">
                    {temporalMode === 'daily' ? formatDate(date) : formatMonth(date)}
                  </th>
                ))}
                <th className="total-column">Total</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, index) => (
                <tr key={index}>
                  <td className="type-cell">
                    <span
                      className="type-indicator"
                      style={{ backgroundColor: row.color }}
                    ></span>
                    {row.type}
                  </td>
                  {dates.map((date, index) => (
                    <td key={`col-${date}-${index}`} className="count-cell">
                      {row.dates[date] || 0}
                    </td>
                  ))}
                  <td className="total-cell">{row.total}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td className="type-cell"><strong>Total général</strong></td>
                {dates.map((date, index) => {
                  const dayTotal = tableData.reduce((sum, row) => sum + (row.dates[date] || 0), 0);
                  return <td key={`total-${date}-${index}`} className="count-cell"><strong>{dayTotal}</strong></td>;
                })}
                <td className="total-cell">
                  <strong>{tableData.reduce((sum, row) => sum + row.total, 0)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderMainChart = React.useCallback(() => {
    if (!chartRef.current || Object.keys(totalByPeriod).length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    const labels = Object.keys(totalByPeriod).sort();
    const data = labels.map(label => totalByPeriod[label]);

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Total collectes',
          data: data,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }, [totalByPeriod]);

  const renderModalChart = React.useCallback(() => {
    if (!modalChartRef.current || Object.keys(temporalData).length === 0 || temporalMode !== 'daily') return;

    if (modalChartInstanceRef.current) {
      modalChartInstanceRef.current.destroy();
    }

    const ctx = modalChartRef.current.getContext('2d');
    const allDates = new Set();
    Object.values(temporalData).forEach(typeData => {
      typeData.forEach(item => allDates.add(item.period));
    });
    const labels = Array.from(allDates).sort();

    const datasets = Array.from(selectedTypes).map(type => {
      const typeData = temporalData[type] || [];
      const data = labels.map(label => {
        const item = typeData.find(d => d.period === label);
        return item ? item.count : 0;
      });

      return {
        label: typeLabels[type] || type,
        data: data,
        borderColor: typeColors[type],
        backgroundColor: typeColors[type] + '20',
        tension: 0.3,
        fill: false
      };
    });

    modalChartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(date => formatDate(date)),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            onClick: (_e, legendItem, legend) => {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              const meta = ci.getDatasetMeta(index);
              meta.hidden = !meta.hidden;
              ci.update();
            }
          },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }, [temporalData, temporalMode, selectedTypes, typeLabels, typeColors, formatDate]);

  useEffect(() => {
    renderMainChart();
  }, [renderMainChart]);

  useEffect(() => {
    if (isExpanded) {
      renderModalChart();
    }
  }, [isExpanded, renderModalChart]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
      if (modalChartInstanceRef.current) {
        modalChartInstanceRef.current.destroy();
      }
    };
  }, [isExpanded]);

  return (
    <>
      <div className="analytics-section">
        <div className="analytics-title">
          <i className="fas fa-chart-line"></i>
          Évolution temporelle des collectes
        </div>

        {loading ? (
          <div className="chart-loading">
            <div className="loading-spinner"></div>
            <p>Chargement...</p>
          </div>
        ) : error ? (
          <div className="chart-error">
            <i className="fas fa-exclamation-triangle"></i>
            <p>{error}</p>
            <button onClick={loadDefaultTemporalData} className="retry-btn">
              Réessayer
            </button>
          </div>
        ) : Object.keys(temporalData).length === 0 ? (
          <div className="chart-empty">
            <i className="fas fa-chart-line"></i>
            <p>Aucune donnée pour cette période</p>
          </div>
        ) : (
          <div
            className="chart-container"
            onClick={handleChartClick}
            style={{ cursor: 'pointer' }}
          >
            <canvas ref={chartRef}></canvas>
          </div>
        )}
      </div>

      {isExpanded && ReactDOM.createPortal(
        <div className="chart-modal-overlay">
          <div className="chart-modal-container">
            <div className="chart-modal-header">
              <h3>Analyse temporelle détaillée ({temporalMode === 'daily' ? 'par jour' : 'par mois'})</h3>
              <button className="modal-close-btn" onClick={handleCloseExpanded}>✕</button>
            </div>

            {/* Bouton toggle filtres — visible uniquement sur mobile (CSS) */}
            <button className="filter-toggle-mobile" onClick={() => setFiltersOpen(f => !f)}>
              <span>
                <i className="fas fa-filter" style={{ marginRight: '6px', color: '#2980b9' }}></i>
                Filtres
              </span>
              <i className={`fas fa-chevron-${filtersOpen ? 'up' : 'down'}`}></i>
            </button>

            {/* Filtres */}
            <div className={`modal-filters-oneline${!filtersOpen ? ' filters-collapsed' : ''}`}>
              <CustomSelect className="filter-select-inline" value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
                <option value="">Toutes les régions</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
              </CustomSelect>

              <CustomSelect className="filter-select-inline" value={selectedPrefecture} onChange={(e) => setSelectedPrefecture(e.target.value)} disabled={!selectedRegion}>
                <option value="">Toutes les préfectures</option>
                {prefectures.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </CustomSelect>

              <CustomSelect className="filter-select-inline" value={selectedCommune} onChange={(e) => setSelectedCommune(e.target.value)} disabled={!selectedPrefecture}>
                <option value="">Toutes les communes</option>
                {communes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </CustomSelect>

              <CustomSelect className="filter-select-inline" value={temporalMode} onChange={(e) => { setTemporalMode(e.target.value); setTemporalData({}); setTotalByPeriod({}); setError(null); }}>
                <option value="daily">Par jour</option>
                <option value="monthly">Par mois</option>
              </CustomSelect>

              {temporalMode === 'daily' && (
                <>
                  <CustomDateInput
                    value={modalDateFrom}
                    onChange={(e) => setModalDateFrom(e.target.value)}
                    min={DATE_LIMITS.minDate}
                    max={modalDateTo || DATE_LIMITS.maxDate}
                    placeholder="Date début"
                  />
                  <span className="date-separator">à</span>
                  <CustomDateInput
                    value={modalDateTo}
                    onChange={(e) => setModalDateTo(e.target.value)}
                    min={modalDateFrom || DATE_LIMITS.minDate}
                    max={DATE_LIMITS.maxDate}
                    placeholder="Date fin"
                  />
                </>
              )}

              {temporalMode === 'monthly' && (
                <div className="months-inline-container">
                  {selectedMonths.map((month, index) => (
                    <span key={index} className="month-tag">
                      <CustomMonthInput
                        value={month}
                        onChange={(e) => updateMonth(index, e.target.value)}
                        min="2020-01"
                        max={new Date().toISOString().slice(0, 7)}
                      />
                      <button className="remove-month-inline" onClick={() => removeMonth(index)}>×</button>
                    </span>
                  ))}
                  {selectedMonths.length < 12 && (
                    <button className="add-month-inline" onClick={addMonth}>+</button>
                  )}
                </div>
              )}

              <button className="apply-btn-inline" onClick={applyModalFilters}>Appliquer</button>
              <button className="reset-btn-inline" onClick={resetModalFilters}>Réinitialiser</button>
            </div>

            {modalDateFrom && modalDateTo && temporalMode === 'daily' && (
              <div className="period-info">
                {(() => {
                  const validation = validateDateRange(modalDateFrom, modalDateTo);
                  const startDate = new Date(modalDateFrom);
                  const endDate = new Date(modalDateTo);
                  const diffTime = Math.abs(endDate - startDate);
                  const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                  return (
                    <div className={`period-display ${!validation.valid ? 'error' : 'info'}`}>
                      <div className="period-summary">
                        Période sélectionnée: {daysDiff} jour{daysDiff > 1 ? 's' : ''}
                      </div>
                      {!validation.valid && (
                        <div className="period-error">{validation.error}</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="export-content-wrapper">
              {((temporalMode === 'daily' && modalDateFrom && modalDateTo) ||
                (temporalMode === 'monthly' && selectedMonths.length > 0)) && (
                  <div className="export-controls">
                    <div className="export-info">
                      <i className="fas fa-info-circle"></i>
                      <span>Cliquez pour exporter</span>
                    </div>
                    <div className="export-buttons">
                      {temporalMode === 'daily' && (
                        <>
                          <button className="export-btn export-png" onClick={handleExportPNG} disabled={isExporting}>
                            <i className="fas fa-image"></i>
                            {isExporting ? 'Export...' : 'PNG'}
                          </button>
                          <button className="export-btn export-pdf" onClick={handleExportPDF} disabled={isExporting}>
                            <i className="fas fa-file-pdf"></i>
                            {isExporting ? 'Export...' : 'PDF'}
                          </button>
                        </>
                      )}
                      <button className="export-btn export-excel" onClick={exportToExcel} disabled={isExporting}>
                        <i className="fas fa-file-excel"></i>
                        {isExporting ? 'Export...' : 'EXCEL'}
                      </button>
                    </div>
                  </div>
                )}

              <div ref={exportContainerRef} className="export-container">
                {temporalMode === 'daily' && modalDateFrom && modalDateTo && (
                  <div className="export-header">
                    <h3 className="export-title">
                      Évolution des collectes du {formatDate(modalDateFrom)} au {formatDate(modalDateTo)}
                    </h3>
                  </div>
                )}

                {temporalMode === 'daily' && (
                  <div className="modal-chart-content">
                    <canvas ref={modalChartRef}></canvas>
                  </div>
                )}

                {((temporalMode === 'daily' && modalDateFrom && modalDateTo) ||
                  (temporalMode === 'monthly' && selectedMonths.length > 0)) &&
                  renderSummaryTable()}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default TimeChart;