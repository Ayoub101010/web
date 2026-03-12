/* @refresh reset */

import React, { useEffect, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import "./BarChart.css";
import useInfrastructureData from "./useinfrastructuredata";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useAuth } from './AuthContext';

// ✅ Enregistrer Chart.js SANS ChartDataLabels globalement
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// ✅ Désactiver animations en dev pour éviter conflits hot-reload
if (process.env.NODE_ENV === 'development') {
  ChartJS.defaults.animation = false;
}

const BarChart = ({ onExpandedChange }) => {
  const chartRef = useRef(null);
  const modalChartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const modalChartInstanceRef = useRef(null);
  const containerRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [allStats, setAllStats] = useState({});
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  // ✅ NOUVEAU: Utiliser le hook au lieu de l'API
  const { globalStats, loading, error: dataError } = useInfrastructureData();

  const [modalFilters, setModalFilters] = useState({
    selectedTypes: new Set()
  });

  const canExport = () => {
    if (!user) return false;
    return user.role === 'Super_admin' || user.role === 'Admin';
  };

  const backendToFrontend = React.useMemo(() => ({
    'pistes': 'pistes',
    'chaussees': 'chaussees',
    'buses': 'buses',
    'dalots': 'dalots',
    'ponts': 'ponts',
    'passages_submersibles': 'passages',
    'bacs': 'bacs',
    'localites': 'localites',
    'ecoles': 'ecoles',
    'marches': 'marches',
    'batiments_administratifs': 'administratifs',
    'infrastructures_hydrauliques': 'hydrauliques',
    'services_santes': 'sante',
    'autres_infrastructures': 'autres',
    'ppr_itial': 'ppr_itial',
    'enquete_polygone': 'enquete_polygone'
  }), []);

  const typeLabels = React.useMemo(() => ({
    pistes: "Pistes",
    chaussees: "Chaussées",
    buses: "Buses",
    dalots: "Dalots",
    ponts: "Ponts",
    passages: "Passages submersibles",
    bacs: "Bacs",
    localites: "Localités",
    ecoles: "Écoles",
    marches: "Marchés",
    administratifs: "Bâtiments administratifs",
    hydrauliques: "Infrastructures hydrauliques",
    sante: "Services de santé",
    autres: "Autres infrastructures",
    ppr_itial: "site de plaine",
    enquete_polygone: "zones de plaine"
  }), []);

  const mobileTypeLabels = React.useMemo(() => ({
    pistes: "Pistes",
    chaussees: "Chaussées",
    buses: "Buses",
    dalots: "Dalots",
    ponts: "Ponts",
    passages: "Pass. sub.",
    bacs: "Bacs",
    localites: "Localités",
    ecoles: "Écoles",
    marches: "Marchés",
    administratifs: "Bât. admin.",
    hydrauliques: "Infra. hydra.",
    sante: "Serv. santé",
    autres: "Autres infra.",
    ppr_itial: "Site plaine",
    enquete_polygone: "Zones plaine"
  }), []);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const normalizeStats = React.useCallback((backendStats) => {
    const normalizedStats = {};

    Object.keys(backendStats).forEach(backendKey => {
      const frontendKey = backendToFrontend[backendKey] || backendKey;
      normalizedStats[frontendKey] = backendStats[backendKey];
    });

    return normalizedStats;
  }, [backendToFrontend]);

  const buildChartData = React.useCallback((stats) => {
    if (Object.keys(stats).length === 0) {
      setChartData({ labels: [], datasets: [] });
      return;
    }

    const isMobile = window.innerWidth < 1024;
    const labelMap = isMobile ? mobileTypeLabels : typeLabels;
    const labels = Object.keys(stats).map(key => labelMap[key] || key);
    const values = Object.values(stats);

    setChartData({
      labels,
      datasets: [
        {
          label: "Nombre de collectes",
          data: values,
          backgroundColor: "rgba(59, 130, 246, 0.7)",
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 2,
          borderRadius: 8,
          barPercentage: 0.7,
        },
      ],
    });
  }, [typeLabels, mobileTypeLabels]);

  // ✅ MODIFIÉ: Utiliser globalStats au lieu d'appeler l'API
  useEffect(() => {
    if (!loading && globalStats) {

      if (Object.keys(globalStats).length > 0) {
        const normalizedStats = normalizeStats(globalStats);

        // Exclure les points de surveillance
        const excludedTypes = ['points_coupures', 'points_critiques'];
        const filteredStats = {};

        Object.keys(normalizedStats).forEach(key => {
          if (!excludedTypes.includes(key)) {
            filteredStats[key] = normalizedStats[key];
          }
        });


        setAllStats(filteredStats);
        buildChartData(filteredStats);
      } else {
      }
    } else if (!loading) {
    }
  }, [globalStats, loading, normalizeStats, buildChartData]);

  const applyModalFilters = () => {
    let filteredStats = { ...allStats };

    if (modalFilters.selectedTypes.size > 0) {
      const filtered = {};
      Array.from(modalFilters.selectedTypes).forEach(type => {
        if (filteredStats[type]) {
          filtered[type] = filteredStats[type];
        }
      });
      filteredStats = filtered;
    }

    buildChartData(filteredStats);
  };

  const handleTypeToggle = (type) => {
    const newSelectedTypes = new Set(modalFilters.selectedTypes);

    if (newSelectedTypes.has(type)) {
      newSelectedTypes.delete(type);
    } else {
      newSelectedTypes.add(type);
    }

    setModalFilters(prev => ({
      ...prev,
      selectedTypes: newSelectedTypes
    }));
  };

  const clearAllFilters = () => {
    setModalFilters({
      selectedTypes: new Set()
    });
  };

  const exportChart = async (format = 'png') => {
    setIsExporting(true);
    try {
      const chartElement = isExpanded
        ? document.querySelector('.chart-expanded-content')
        : containerRef.current;

      const exportButtons = document.querySelectorAll('.chart-expanded-header button');
      exportButtons.forEach(btn => btn.style.visibility = 'hidden');

      const canvas = await html2canvas(chartElement, {
        backgroundColor: '#ffffff',
        scale: 3,
        logging: false,
        useCORS: true,
        allowTaint: true
      });

      exportButtons.forEach(btn => btn.style.visibility = 'visible');

      if (format === 'png') {
        const finalCanvas = document.createElement('canvas');
        const titleHeight = 80;
        finalCanvas.width = canvas.width;
        finalCanvas.height = canvas.height + titleHeight;

        const ctx = finalCanvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(' Collectes par type d\'infrastructure', finalCanvas.width / 2, 40);

        ctx.font = '24px Arial';
        ctx.fillStyle = '#666666';
        const dateStr = new Date().toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        ctx.fillText(`Généré le ${dateStr}`, finalCanvas.width / 2, 70);

        ctx.drawImage(canvas, 0, titleHeight);

        const link = document.createElement('a');
        link.download = `Collectes_Infrastructure_${new Date().toISOString().split('T')[0]}.png`;
        link.href = finalCanvas.toDataURL('image/png', 1.0);
        link.click();
      } else if (format === 'pdf') {
        const imgData = canvas.toDataURL('image/png', 1.0);

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = imgWidth / imgHeight;

        const orientation = ratio > 1 ? 'landscape' : 'portrait';
        const pdf = new jsPDF(orientation, 'mm', 'a4');

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.text(' Collectes par type d\'infrastructure', pdfWidth / 2, 15, { align: 'center' });

        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        const dateStr = new Date().toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        pdf.text(`Généré le ${dateStr}`, pdfWidth / 2, 22, { align: 'center' });

        let finalWidth, finalHeight;
        const margin = 10;
        const topMargin = 30;
        const availableHeight = pdfHeight - topMargin - margin;

        if (ratio > pdfWidth / availableHeight) {
          finalWidth = pdfWidth - (2 * margin);
          finalHeight = finalWidth / ratio;
        } else {
          finalHeight = availableHeight;
          finalWidth = finalHeight * ratio;
        }

        const x = (pdfWidth - finalWidth) / 2;
        const y = topMargin;

        pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight, undefined, 'FAST');
        pdf.save(`Collectes_Infrastructure_${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (error) {
      alert('Erreur lors de l\'export. Veuillez réessayer.');
    } finally {
      setIsExporting(false);
    }
  };



  const handleContainerClick = (_e) => {
    if (!isExpanded) {
      setIsExpanded(true);
      onExpandedChange?.(true);
    }
  };

  const getChartOptions = React.useCallback((expanded = false) => {
    const isMobile = window.innerWidth < 1024;
    const isHorizontal = isMobile && expanded;

    if (isHorizontal) {
      // Mobile expanded: horizontal bar chart
      return {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1F2937",
            titleColor: "#FFF",
            bodyColor: "#FFF",
            padding: 8,
            cornerRadius: 8,
            titleFont: { size: 11 },
            bodyFont: { size: 10 },
          },
          datalabels: {
            anchor: 'end',
            align: 'right',
            offset: 4,
            color: '#374151',
            font: { size: 10, weight: 'bold' },
            formatter: (value) => value,
            display: (context) => context.dataset.data[context.dataIndex] > 0,
            clip: false
          }
        },
        scales: {
          y: {
            ticks: {
              font: { size: 11 },
              crossAlign: 'far',
            },
            grid: { display: false },
          },
          x: {
            beginAtZero: true,
            grid: { color: "#E5E7EB" },
            ticks: {
              font: { size: 9 },
              precision: 0,
              callback: (value) => Number.isInteger(value) ? value : "",
            },
          },
        },
        layout: {
          padding: { right: 40 }
        }
      };
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1F2937",
          titleColor: "#FFF",
          bodyColor: "#FFF",
          padding: (expanded && !isMobile) ? 12 : 8,
          cornerRadius: 8,
          titleFont: { size: (expanded && !isMobile) ? 16 : (isMobile ? 11 : 14) },
          bodyFont: { size: (expanded && !isMobile) ? 14 : (isMobile ? 10 : 12) },
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          offset: isMobile ? 2 : (expanded ? 8 : 4),
          color: '#374151',
          font: {
            size: isMobile ? 8 : (expanded ? 14 : 12),
            weight: 'bold'
          },
          formatter: (value) => value,
          display: function(context) {
            if (isMobile) {
              return context.dataset.data[context.dataIndex] > 0;
            }
            return true;
          },
          clip: false
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: isMobile ? 90 : (expanded ? 30 : 45),
            minRotation: isMobile ? 45 : (expanded ? 15 : 45),
            font: { size: isMobile ? 8 : (expanded ? 14 : 12) },
            callback: function (value) {
              const label = this.getLabelForValue(value);
              if (!label) return label;
              const maxLen = isMobile ? 8 : (expanded ? 20 : 15);
              if (label.length > maxLen) {
                return label.substring(0, maxLen) + '…';
              }
              return label;
            }
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          title: {
            display: !isMobile,
            text: "Nombre de collectes",
            font: {
              weight: "600",
              size: expanded ? 16 : 14
            },
          },
          grid: {
            color: "#E5E7EB",
          },
          ticks: {
            font: { size: isMobile ? 9 : (expanded ? 14 : 12) },
            precision: 0,
            callback: function (value) {
              return Number.isInteger(value) ? value : "";
            },
          },
          suggestedMax: function (context) {
            const max = Math.max(...context.chart.data.datasets[0].data);
            return max * 1.15;
          }
        },
      },
      onHover: (event, _elements) => {
        if (!expanded) {
          const canvas = event.native?.target;
          if (canvas) canvas.style.cursor = 'pointer';
        }
      },
      layout: {
        padding: {
          top: isMobile ? 10 : (expanded ? 30 : 20)
        }
      }
    };
  }, []);

  const renderChart = React.useCallback(() => {
    setTimeout(() => {
      if (!isExpanded) {
        if (chartInstanceRef.current) {
          try {
            chartInstanceRef.current.destroy();
          } catch (e) { }
          chartInstanceRef.current = null;
        }

        if (chartData.labels.length === 0 || !chartRef.current) return;

        const ctx = chartRef.current.getContext("2d");
        if (!ctx) return;

        try {
          chartInstanceRef.current = new ChartJS(ctx, {
            type: "bar",
            data: JSON.parse(JSON.stringify(chartData)),
            options: getChartOptions(false),
            plugins: [ChartDataLabels]
          });

        } catch (error) { }
      } else {
        if (modalChartInstanceRef.current) {
          try {
            modalChartInstanceRef.current.destroy();
          } catch (e) { }
          modalChartInstanceRef.current = null;
        }

        if (chartData.labels.length === 0 || !modalChartRef.current) return;

        const ctx = modalChartRef.current.getContext("2d");
        if (!ctx) return;

        try {
          modalChartInstanceRef.current = new ChartJS(ctx, {
            type: "bar",
            data: JSON.parse(JSON.stringify(chartData)),
            options: getChartOptions(true),
            plugins: [ChartDataLabels]
          });
        } catch (error) { }
      }
    }, 0);
  }, [isExpanded, chartData, getChartOptions]);

  const handleCloseExpanded = (e) => {
    if (e.target.classList.contains('chart-overlay')) {
      setIsExpanded(false);
      onExpandedChange?.(false);
      buildChartData(allStats);
    }
  };

  useEffect(() => {
    if (isExpanded && Object.keys(allStats).length > 0) {
      applyModalFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalFilters, isExpanded]);

  useEffect(() => {
    renderChart();
  }, [renderChart]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.destroy();
        } catch (e) { }
        chartInstanceRef.current = null;
      }
      if (modalChartInstanceRef.current) {
        try {
          modalChartInstanceRef.current.destroy();
        } catch (e) { }
        modalChartInstanceRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="bar-chart-wrapper">
        <h2 className="chart-title">📊 Collectes par type d'infrastructure</h2>
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          <p>Chargement des données...</p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="bar-chart-wrapper">
        <h2 className="chart-title">📊 Collectes par type d'infrastructure</h2>
        <div className="chart-empty">
          <p style={{ color: 'red' }}>Erreur: {dataError}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bar-chart-wrapper" ref={containerRef}>
        <h2 className="chart-title">📊 Collectes par type d'infrastructure</h2>

        {chartData.labels.length === 0 ? (
          <div className="chart-empty">
            <p>Aucune donnée disponible</p>
          </div>
        ) : (
          <div className="bar-chart-canvas" onClick={handleContainerClick}>
            <canvas ref={chartRef}></canvas>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="chart-overlay" onClick={handleCloseExpanded}>
          <div className="chart-expanded">
            <div className="chart-expanded-header">
              <h3>📊 Collectes par type - Analyse détaillée</h3>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {canExport() && (
                  <>
                    <button
                      onClick={() => exportChart('png')}
                      disabled={isExporting}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        border: 'none',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: isExporting ? 'not-allowed' : 'pointer',
                        opacity: isExporting ? 0.6 : 1,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => !isExporting && (e.target.style.background = 'rgba(255, 255, 255, 0.3)')}
                      onMouseLeave={(e) => (e.target.style.background = 'rgba(255, 255, 255, 0.2)')}
                    >
                      {isExporting ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          <span>Export...</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-image"></i>
                          <span>PNG</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => exportChart('pdf')}
                      disabled={isExporting}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        border: 'none',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: isExporting ? 'not-allowed' : 'pointer',
                        opacity: isExporting ? 0.6 : 1,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => !isExporting && (e.target.style.background = 'rgba(255, 255, 255, 0.3)')}
                      onMouseLeave={(e) => (e.target.style.background = 'rgba(255, 255, 255, 0.2)')}
                    >
                      {isExporting ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          <span>Export...</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-file-pdf"></i>
                          <span>PDF</span>
                        </>
                      )}
                    </button>
                  </>
                )}

                <button
                  className="chart-close-btn"
                  onClick={() => {
                    setIsExpanded(false);
                    onExpandedChange?.(false);
                    buildChartData(allStats);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={`chart-filters-panel ${!filtersOpen && window.innerWidth < 1024 ? 'filters-collapsed' : ''}`}>
              <div className="filters-row" style={window.innerWidth < 1024 ? { display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '0' } : {}}>
                <div className="filter-stats"
                  onClick={() => { if (window.innerWidth < 1024) setFiltersOpen(!filtersOpen); }}
                  style={{ cursor: window.innerWidth < 1024 ? 'pointer' : 'default', ...(window.innerWidth < 1024 ? { flex: '1', minWidth: '0', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } : {}) }}
                >
                  <span>
                    {modalFilters.selectedTypes.size === 0
                      ? `Tous les types (${Object.keys(allStats).length})`
                      : `${modalFilters.selectedTypes.size} type(s) sélectionné(s)`
                    }
                  </span>
                  {window.innerWidth < 1024 && (
                    <i className={`fas fa-chevron-${filtersOpen ? 'up' : 'down'}`} style={{ marginLeft: '6px', fontSize: '10px' }}></i>
                  )}
                </div>

                <button
                  onClick={clearAllFilters}
                  className="clear-filters-btn"
                  disabled={modalFilters.selectedTypes.size === 0}
                  style={window.innerWidth < 1024 ? { flexShrink: 0 } : {}}
                >
                  Effacer les filtres
                </button>
              </div>

              {(filtersOpen || window.innerWidth >= 1024) && (
                <div className="types-filter-group">
                  <label>Filtrer par types d'infrastructure:</label>
                  <div className="types-checkboxes">
                    {Object.keys(allStats).map(type => (
                      <label key={type} className="type-checkbox">
                        <input
                          type="checkbox"
                          checked={modalFilters.selectedTypes.has(type)}
                          onChange={() => handleTypeToggle(type)}
                        />
                        <span className="checkbox-label">
                          {typeLabels[type] || type}
                          <span className="type-count">({allStats[type]})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="chart-expanded-content"
              style={filtersOpen && window.innerWidth < 1024 ? { display: 'none' } : (window.innerWidth < 1024 ? { padding: '4px 8px 16px' } : {})}>
              <canvas ref={modalChartRef}></canvas>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BarChart;