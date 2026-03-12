import React, { useRef, useEffect, useState } from "react";
import Chart from "chart.js/auto";
import "./InfrastructureDonut.css";
import useInfrastructureData from "./useinfrastructuredata";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useAuth } from './AuthContext';

const strikethroughLegendPlugin = {
  id: 'strikethroughLegend',
  afterDraw: (chart) => {
    const legend = chart.legend;
    if (!legend || !legend.legendItems) return;

    const ctx = chart.ctx;
    const items = legend.legendItems;

    items.forEach((item, index) => {
      if (!chart.getDataVisibility(index)) {
        const legendX = legend.left;
        const legendY = legend.top;

        const textX = item.text.x || (legendX + item.left);
        const textY = item.text.y || (legendY + item.top + (item.height / 2));
        const textWidth = ctx.measureText(item.text.text || item.text).width;

        ctx.save();
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(textX, textY);
        ctx.lineTo(textX + textWidth, textY);
        ctx.stroke();
        ctx.restore();
      }
    });
  }
};

const InfrastructureDonut = ({ onExpandedChange }) => {
  const chartRef = useRef(null);
  const modalChartRef = useRef(null);
  const chartInstance = useRef(null);
  const modalChartInstance = useRef(null);
  const containerRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // ✅ NOUVEAU: Utiliser le hook au lieu de l'API
  const { globalStats, loading: dataLoading, error: dataError } = useInfrastructureData();

  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [rawStats, setRawStats] = useState({});
  const [allStats, setAllStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('categories');
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [hiddenItems, setHiddenItems] = useState(new Set());

  const [modalFilters] = useState({
    region: '',
    prefecture: '',
    commune_id: '',
    types: []
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

  const categoryMapping = React.useMemo(() => ({
    "Pistes": ["pistes"],
    "Chaussées": ["chaussees"],
    "Ouvrages": ["buses", "dalots", "ponts", "passages", "bacs"],
    "Infrastructures rurales": [
      "localites", "ecoles", "marches", "administratifs",
      "hydrauliques", "sante", "autres", "ppr_itial", "enquete_polygone"
    ]
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

  const mobileLabels = React.useMemo(() => ({
    "Passages submersibles": "Pass. sub.",
    "Bâtiments administratifs": "Bât. admin.",
    "Infrastructures hydrauliques": "Infra. hydra.",
    "Services de santé": "Serv. santé",
    "Autres infrastructures": "Autres infra.",
    "site de plaine": "Site plaine",
    "zones de plaine": "Zones plaine"
  }), []);

  const categoryColors = React.useMemo(() => ({
    "Pistes": "#4e73df",
    "Chaussées": "#8e44ad",
    "Ouvrages": "#1cc88a",
    "Infrastructures rurales": "#f6c23e"
  }), []);

  const typeColors = React.useMemo(() => ({
    pistes: "#4e73df",
    chaussees: "#8e44ad",
    buses: "#e74c3c",
    dalots: "#3498db",
    ponts: "#9b59b6",
    passages: "#1abc9c",
    bacs: "#f39c12",
    localites: "#e67e22",
    ecoles: "#27ae60",
    marches: "#f1c40f",
    administratifs: "#34495e",
    hydrauliques: "#36b9cc",
    sante: "#e74a3b",
    autres: "#95a5a6",
    ppr_itial: "#ff7043",
    enquete_polygone: "#00acc1"
  }), []);

  const normalizeStats = React.useCallback((backendStats) => {
    const normalizedStats = {};

    Object.keys(backendStats).forEach(backendKey => {
      const frontendKey = backendToFrontend[backendKey] || backendKey;
      normalizedStats[frontendKey] = backendStats[backendKey];
    });

    return normalizedStats;
  }, [backendToFrontend]);

  const getModalFilters = React.useCallback(() => {
    return {
      region: modalFilters.region,
      prefecture: modalFilters.prefecture,
      commune_id: modalFilters.commune_id,
      types: modalFilters.types,
    };
  }, [modalFilters]);

  const buildCategoryData = React.useCallback((stats) => {

    const categoryStats = {};

    Object.keys(categoryMapping).forEach(category => {
      const types = categoryMapping[category];
      let total = 0;

      types.forEach(type => {
        if (stats[type]) {
          total += stats[type];
        }
      });

      if (total > 0) {
        categoryStats[category] = total;
      }
    });


    const labels = Object.keys(categoryStats);
    const values = Object.values(categoryStats);
    const colors = labels.map(label => categoryColors[label] || "#95a5a6");

    setChartData({
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    });
  }, [categoryMapping, categoryColors]);

  const buildDetailedData = React.useCallback((stats) => {

    if (isExpanded) {
      const filters = getModalFilters();
      const activeStats = {};

      if (filters.types.length === 0) {
        Object.assign(activeStats, stats);
      } else {
        Object.keys(stats).forEach(type => {
          if (filters.types.includes(type)) {
            activeStats[type] = stats[type];
          }
        });
      }
      stats = activeStats;
    }

    if (Object.keys(stats).length === 0) {
      setChartData({ labels: [], datasets: [] });
      return;
    }

    const labels = Object.keys(stats).map(type => typeLabels[type] || type);
    const values = Object.values(stats);
    const colors = Object.keys(stats).map(type => typeColors[type] || "#95a5a6");


    setChartData({
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    });
  }, [getModalFilters, typeLabels, typeColors]);

  const buildChartData = React.useCallback((stats) => {

    if (viewMode === 'categories') {
      buildCategoryData(stats);
    } else {
      buildDetailedData(stats);
    }
  }, [viewMode, buildCategoryData, buildDetailedData]);

  // ✅ MODIFIÉ: Charger depuis le hook au lieu de l'API
  useEffect(() => {
    if (!dataLoading && globalStats) {

      if (Object.keys(globalStats).length > 0) {
        const normalizedStats = normalizeStats(globalStats);

        const excludedTypes = ['points_coupures', 'points_critiques'];
        const filteredStats = {};

        Object.keys(normalizedStats).forEach(key => {
          if (!excludedTypes.includes(key)) {
            filteredStats[key] = normalizedStats[key];
          }
        });

        setAllStats(filteredStats);
        buildCategoryData(filteredStats);
        setLoading(false);
      } else {
        setLoading(false); // Stop spinner even if empty
      }
    } else if (!dataLoading) {
      setLoading(false);
    }

    if (dataError) {
      setLoading(false);
    }
  }, [globalStats, dataLoading, dataError, normalizeStats, buildCategoryData]);

  const loadFilteredData = React.useCallback(async () => {
    if (!isExpanded) return;

    try {

      const filters = getModalFilters();

      if (!filters.region && !filters.prefecture && !filters.commune_id) {

        let filteredStats = { ...allStats };

        if (filters.types.length > 0) {
          const filtered = {};
          filters.types.forEach(type => {
            if (filteredStats[type]) {
              filtered[type] = filteredStats[type];
            }
          });
          filteredStats = filtered;
        }

        setRawStats(filteredStats);
        buildChartData(filteredStats);
        return;
      }

      // Note: Pour les filtres géographiques, on utilise les données existantes
      // car on n'a plus accès à l'API directement
      setRawStats(allStats);
      buildChartData(allStats);

    } catch (error) {
      setChartData({ labels: [], datasets: [] });
    }
  }, [isExpanded, getModalFilters, allStats, buildChartData]);

  const handleContainerClick = (e) => {
    if (!isExpanded) {
      setIsExpanded(true);
      onExpandedChange?.(true);
      setViewMode('detailed');
    }
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
        ctx.fillText('Répartitions par domaine d\'infrastructure', finalCanvas.width / 2, 40);

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
        link.download = `Repartitions_Infrastructure_${new Date().toISOString().split('T')[0]}.png`;
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
        pdf.text('Répartitions par Domaine d\'Infrastructure', pdfWidth / 2, 15, { align: 'center' });

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
        pdf.save(`Repartitions_Infrastructure_${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (error) {
      alert('Erreur lors de l\'export. Veuillez réessayer.');
    } finally {
      setIsExporting(false);
    }
  };

  const getChartOptions = React.useCallback((expanded = false) => {
    const isMobile = window.innerWidth < 1024;

    // Determine legend position and sizing based on context
    let legendPos, boxW, pad, fontSize;
    if (expanded && isMobile) {
      // Legend rendered as HTML on mobile expanded — disable Chart.js legend
      // responsive: false + explicit canvas width/height = cercle parfait garanti
      return {
        responsive: false,
        maintainAspectRatio: false,
        layout: { padding: 0 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#ffffff",
            titleColor: "#2d3748",
            bodyColor: "#2d3748",
            borderColor: "#e2e8f0",
            borderWidth: 1,
            padding: 8,
            cornerRadius: 6,
            titleFont: { size: 12, weight: "bold" },
            bodyFont: { size: 11 },
            callbacks: {
              label: function (context) {
                const label = context.label;
                const value = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(3);
                return `${label}: ${value} (${percentage}%)`;
              },
            },
          },
        },
      };
    } else if (expanded) {
      legendPos = 'right';
      boxW = 15;
      pad = 12;
      fontSize = 14;
    } else if (isMobile) {
      legendPos = 'bottom';
      boxW = 8;
      pad = 4;
      fontSize = 9;
    } else {
      legendPos = 'bottom';
      boxW = 10;
      pad = 6;
      fontSize = 11;
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: legendPos,
          labels: {
            usePointStyle: true,
            boxWidth: boxW,
            padding: pad,
            font: {
              size: fontSize,
            },
            generateLabels: function (chart) {
              const data = chart.data;
              if (data.labels.length && data.datasets.length) {
                const dataset = data.datasets[0];
                const total = dataset.data.reduce((acc, value) => acc + value, 0);

                return data.labels.map((label, i) => {
                  const value = dataset.data[i];
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(3) : 0;
                  const isHidden = dataset._hiddenSet ? dataset._hiddenSet.has(i) : false;

                  let text;
                  if (isMobile) {
                    const maxLen = expanded ? 16 : 12;
                    const shortLabel = label.length > maxLen ? label.substring(0, maxLen) + '…' : label;
                    text = `${shortLabel} (${value} - ${percentage}%)`;
                  } else {
                    text = `${label} (${value} - ${percentage}%)`;
                  }

                  return {
                    text,
                    fillStyle: isHidden ? '#cccccc' : dataset.backgroundColor[i],
                    strokeStyle: dataset.borderColor,
                    lineWidth: dataset.borderWidth,
                    hidden: false,
                    index: i,
                    fontColor: isHidden ? '#999999' : '#2d3748'
                  };
                });
              }
              return [];
            }
          },
          onClick: (e, legendItem, legend) => {
            const index = legendItem.index;
            const chart = legend.chart;
            const dataset = chart.data.datasets[0];
            if (!dataset._origColors) {
              dataset._origColors = [...dataset.backgroundColor];
            }
            if (!dataset._hiddenSet) {
              dataset._hiddenSet = new Set();
            }
            if (dataset._hiddenSet.has(index)) {
              dataset._hiddenSet.delete(index);
              dataset.backgroundColor[index] = dataset._origColors[index];
            } else {
              dataset._hiddenSet.add(index);
              dataset.backgroundColor[index] = 'rgba(200,200,200,0.3)';
            }
            chart.update();
          }
        },
        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: "#2d3748",
          bodyColor: "#2d3748",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          padding: (expanded && !isMobile) ? 12 : 8,
          cornerRadius: 6,
          titleFont: {
            size: (expanded && !isMobile) ? 14 : 12,
            weight: "bold",
          },
          bodyFont: {
            size: (expanded && !isMobile) ? 12 : 11,
          },
          filter: function (tooltipItem) {
            const dataset = tooltipItem.chart.data.datasets[tooltipItem.datasetIndex];
            return !(dataset._hiddenSet && dataset._hiddenSet.has(tooltipItem.dataIndex));
          },
          callbacks: {
            label: function (context) {
              const label = context.label;
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(3);

              return `${label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
      onHover: (event, elements) => {
        if (!expanded) {
          const canvas = event.native.target;
          canvas.style.cursor = 'pointer';
        }
      }
    };
  }, []);



  const renderChart = React.useCallback(() => {
    if (!isExpanded) {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      if (chartData.labels.length === 0 || !chartRef.current) return;

      const ctx = chartRef.current.getContext("2d");
      chartInstance.current = new Chart(ctx, {
        type: "doughnut",
        data: chartData,
        options: getChartOptions(false),
        plugins: [strikethroughLegendPlugin]
      });

    } else {
      if (modalChartInstance.current) {
        modalChartInstance.current.destroy();
      }

      if (chartData.labels.length === 0 || !modalChartRef.current) return;

      const canvas = modalChartRef.current;
      const isMobile = window.innerWidth < 1024;

      const ctx = canvas.getContext("2d");
      modalChartInstance.current = new Chart(ctx, {
        type: "doughnut",
        data: chartData,
        options: getChartOptions(true),
        plugins: [strikethroughLegendPlugin]
      });

      // Sur mobile : forcer la taille après init (responsive: false dans Chart.js)
      if (isMobile) {
        const size = Math.min(300, Math.round(window.innerWidth * 0.8));
        modalChartInstance.current.resize(size, size);
      }
    }
  }, [chartData, isExpanded, getChartOptions]);

  const handleCloseExpanded = (e) => {
    if (e.target.classList.contains('chart-overlay')) {
      setIsExpanded(false);
      onExpandedChange?.(false);
      setViewMode('categories');
      buildCategoryData(allStats);
    }
  };

  useEffect(() => {
    if (isExpanded) {
      loadFilteredData();
    }
  }, [isExpanded, loadFilteredData]);

  useEffect(() => {
    if (isExpanded && Object.keys(rawStats).length > 0) {
      buildChartData(rawStats);
    }
  }, [viewMode, rawStats, isExpanded, buildChartData]);

  useEffect(() => {
    if (isExpanded) {
      loadFilteredData();
    }
  }, [modalFilters, isExpanded, loadFilteredData]);

  useEffect(() => {
    renderChart();
  }, [renderChart]);

  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
      if (modalChartInstance.current) {
        modalChartInstance.current.destroy();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="donut-wrapper">
        <h2>Capacité par Domaine d'Infrastructure</h2>
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          <p>Chargement des données...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="donut-wrapper" ref={containerRef}>
        <h2>Capacité par Domaine d'Infrastructure</h2>

        {chartData.labels.length === 0 ? (
          <div className="chart-empty">
            <p>Aucune donnée disponible</p>
          </div>
        ) : (
          <div className="chart-container" onClick={handleContainerClick}>
            <canvas ref={chartRef} />
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="chart-overlay" onClick={handleCloseExpanded}>
          <div className="chart-expanded">
            <div className="chart-expanded-header">
              <h3>Infrastructure - Vue détaillée par type</h3>

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
                    setViewMode('categories');
                    buildCategoryData(allStats);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="chart-expanded-content">
              {window.innerWidth < 1024 ? (
                <div className="donut-canvas-mobile-wrapper" style={{ flexShrink: 0, margin: '12px auto 8px' }}>
                  <canvas ref={modalChartRef} />
                </div>
              ) : (
                <canvas ref={modalChartRef} />
              )}
              {window.innerWidth < 1024 && chartData.labels.length > 0 && (
                <div className="custom-legend-mobile">
                  {chartData.labels.map((label, i) => {
                    const dataset = chartData.datasets[0];
                    const value = dataset.data[i];
                    const total = dataset.data.reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? ((value / total) * 100).toFixed(3) : 0;
                    const isHidden = hiddenItems.has(i);
                    return (
                      <div
                        key={i}
                        className={`custom-legend-item ${isHidden ? 'hidden-item' : ''}`}
                        onClick={() => {
                          const newHidden = new Set(hiddenItems);
                          if (newHidden.has(i)) {
                            newHidden.delete(i);
                          } else {
                            newHidden.add(i);
                          }
                          setHiddenItems(newHidden);
                          if (modalChartInstance.current) {
                            const ds = modalChartInstance.current.data.datasets[0];
                            if (!ds._origColors) ds._origColors = [...ds.backgroundColor];
                            if (!ds._hiddenSet) ds._hiddenSet = new Set();
                            if (newHidden.has(i)) {
                              ds._hiddenSet.add(i);
                              ds.backgroundColor[i] = 'rgba(200,200,200,0.3)';
                            } else {
                              ds._hiddenSet.delete(i);
                              ds.backgroundColor[i] = ds._origColors[i];
                            }
                            modalChartInstance.current.update();
                          }
                        }}
                      >
                        <span
                          className="legend-color"
                          style={{ background: isHidden ? '#ccc' : dataset.backgroundColor[i] }}
                        />
                        <span className="legend-label">{mobileLabels[label] || label}</span>
                        <span className="legend-value">({value} - {percentage}%)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InfrastructureDonut;