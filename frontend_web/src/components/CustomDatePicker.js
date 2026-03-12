import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/* Calendrier personnalisé — rendu via portal pour éviter le clipping overflow */

const MONTH_NAMES = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const DAY_NAMES   = ['lu','ma','me','je','ve','sa','di'];

const parseDate = (str) => str ? new Date(str + 'T00:00:00') : null;
const toISO = (y, m, d) => `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

const CustomCalendar = ({ value, onChange, onClose, portalStyle }) => {
  const today    = new Date();
  const selected = parseDate(value);

  const initYear  = selected ? selected.getFullYear() : today.getFullYear();
  const initMonth = selected ? selected.getMonth()    : today.getMonth();
  const [viewYear,  setViewYear]  = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // lundi = 0

  const cells = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => viewMonth === 0
    ? (setViewMonth(11), setViewYear(y => y - 1))
    : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11
    ? (setViewMonth(0), setViewYear(y => y + 1))
    : setViewMonth(m => m + 1);

  const isSelected = (d) => d && selected &&
    selected.getFullYear() === viewYear &&
    selected.getMonth()    === viewMonth &&
    selected.getDate()     === d;
  const isToday = (d) => d &&
    today.getFullYear() === viewYear &&
    today.getMonth()    === viewMonth &&
    today.getDate()     === d;

  const pick = (d) => {
    if (!d) return;
    onChange({ target: { value: toISO(viewYear, viewMonth, d) } });
    onClose();
  };
  const pickToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    pick(t.getDate());
  };
  const clear = () => { onChange({ target: { value: '' } }); onClose(); };

  return (
    <div className="custom-calendar" data-cal-portal style={portalStyle} onTouchEnd={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="cal-header">
        <button className="cal-nav"
          onTouchEnd={(e) => { e.preventDefault(); prevMonth(); }}
          onClick={(e)  => { e.stopPropagation(); prevMonth(); }}>‹</button>
        <span className="cal-title">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button className="cal-nav"
          onTouchEnd={(e) => { e.preventDefault(); nextMonth(); }}
          onClick={(e)  => { e.stopPropagation(); nextMonth(); }}>›</button>
      </div>
      <div className="cal-grid">
        {DAY_NAMES.map(d => <div key={d} className="cal-day-name">{d}</div>)}
        {cells.map((d, i) => (
          <div
            key={i}
            className={[
              'cal-cell',
              !d             ? 'cal-empty'    : '',
              isSelected(d)  ? 'cal-selected' : '',
              isToday(d)     ? 'cal-today'    : '',
            ].join(' ').trim()}
            onTouchEnd={(e) => { e.preventDefault(); pick(d); }}
            onClick={() => pick(d)}
          >{d}</div>
        ))}
      </div>
      <div className="cal-footer">
        <button className="cal-footer-btn"
          onTouchEnd={(e) => { e.preventDefault(); clear(); }}
          onClick={clear}>Effacer</button>
        <button className="cal-footer-btn"
          onTouchEnd={(e) => { e.preventDefault(); pickToday(); }}
          onClick={pickToday}>Aujourd'hui</button>
      </div>
    </div>
  );
};

export const CustomDateInput = ({ value, onChange, placeholder = 'JJ/MM/AAAA' }) => {
  const [open, setOpen] = useState(false);
  const [calPos, setCalPos] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (e.target && e.target.closest('[data-cal-portal]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, []);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        setCalPos({
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10500,
          width: 'min(300px, 92vw)',
          minWidth: 'unset',
          padding: '14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        });
      } else {
        const calWidth = 240;
        const calHeight = 290; // hauteur approximative du calendrier
        const spaceBelow = window.innerHeight - rect.bottom;
        const left = Math.min(rect.left, window.innerWidth - calWidth - 8);
        // Si pas assez de place en bas → ouvrir vers le haut
        const top = spaceBelow < calHeight && rect.top > spaceBelow
          ? Math.max(4, rect.top - calHeight - 4)
          : rect.bottom + 4;
        setCalPos({
          position: 'fixed',
          top,
          left: Math.max(0, left),
          zIndex: 10500,
        });
      }
    }
    setOpen(o => !o);
  };

  const displayValue = value ? value.split('-').reverse().join('/') : placeholder;

  return (
    <>
      {open && createPortal(
        <div
          className="cal-backdrop"
          onTouchEnd={(e) => { e.preventDefault(); setOpen(false); }}
          onClick={() => setOpen(false)}
        />,
        document.body
      )}
      <div
        ref={ref}
        className={`custom-date-wrapper${!value ? ' custom-date-empty' : ''}${open ? ' custom-date-open' : ''}`}
        onTouchEnd={(e) => { e.preventDefault(); handleToggle(e); }}
        onClick={handleToggle}
      >
        <span className="custom-date-display">{displayValue}</span>
        <i className="fas fa-calendar-alt custom-date-icon" />
        {open && calPos && createPortal(
          <CustomCalendar
            value={value}
            onChange={(e) => { onChange(e); setOpen(false); }}
            onClose={() => setOpen(false)}
            portalStyle={calPos}
          />,
          document.body
        )}
      </div>
    </>
  );
};
