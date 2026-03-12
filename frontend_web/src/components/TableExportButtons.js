import React, { useState } from 'react';
import { exportTableToExcel, exportTableToPDF } from './TableExport';
import './TableExportButtons.css';

const TableExportButtons = ({ pistesData }) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = () => {
    setIsExporting(true);
    exportTableToExcel(pistesData);
    setTimeout(() => setIsExporting(false), 1000);
  };

  const handleExportPDF = () => {
    setIsExporting(true);
    exportTableToPDF(pistesData);
    setTimeout(() => setIsExporting(false), 1000);
  };

  return (
    <div className="table-export-buttons">
      <button 
        className="export-btn excel-export" 
        onClick={handleExportExcel}
        disabled={isExporting || !pistesData || pistesData.length === 0}
        title="Exporter en Excel"
      >
        <i className="fas fa-file-excel"></i>
        <span>Excel</span>
      </button>
      
      <button 
        className="export-btn pdf-export" 
        onClick={handleExportPDF}
        disabled={isExporting || !pistesData || pistesData.length === 0}
        title="Exporter en PDF"
      >
        <i className="fas fa-file-pdf"></i>
        <span>PDF</span>
      </button>
    </div>
  );
};

export default TableExportButtons;