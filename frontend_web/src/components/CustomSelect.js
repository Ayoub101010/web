import React, { useState, useEffect, useRef } from "react";
import "./CustomSelect.css";

/**
 * Dropdown custom sans curseur natif — fonctionne sur mobile et desktop.
 * Remplace <select> pour éviter le curseur pointeur natif des navigateurs mobiles.
 *
 * Usage identique à <select> :
 *   <CustomSelect value={val} onChange={(e) => setVal(e.target.value)} disabled={...}>
 *     <option value="">Tous</option>
 *     <option value="A">A</option>
 *   </CustomSelect>
 */
const CustomSelect = ({ value, onChange, disabled, children, placeholder, className }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Fermer si clic / tap en dehors
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, []);

  // Extraire les options depuis les children <option>
  const options = React.Children.toArray(children)
    .filter(child => child.type === 'option')
    .map(child => ({ value: child.props.value ?? '', label: child.props.children }));

  const selectedLabel = options.find(o => String(o.value) === String(value))?.label
    || placeholder
    || options[0]?.label
    || '';

  const handleSelect = (optValue) => {
    onChange({ target: { value: optValue } });
    setOpen(false);
  };

  const toggle = (e) => {
    if (disabled) return;
    e.preventDefault();
    setOpen(o => !o);
  };

  return (
    <div
      ref={ref}
      className={[
        'cselect-wrapper',
        disabled ? 'cselect-disabled' : '',
        open     ? 'cselect-open'     : '',
        className || '',
      ].join(' ').trim()}
      onTouchEnd={toggle}
      onClick={(e) => { if (!disabled) setOpen(o => !o); }}
    >
      <div className="cselect-display">
        <span className="cselect-value">{selectedLabel}</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'} cselect-arrow`} />
      </div>

      {open && !disabled && (
        <ul className="cselect-dropdown">
          {options.map((opt) => (
            <li
              key={opt.value}
              className={`cselect-option${String(opt.value) === String(value) ? ' cselect-option-selected' : ''}`}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleSelect(opt.value); }}
              onClick={(e) => { e.stopPropagation(); handleSelect(opt.value); }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CustomSelect;
