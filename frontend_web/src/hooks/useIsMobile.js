import { useState, useEffect } from 'react';

/**
 * Hook personnalisé pour détecter si l'écran est mobile
 * @param {number} breakpoint - Largeur en px pour considérer comme mobile (défaut: 768)
 * @returns {boolean} true si la largeur de l'écran est <= breakpoint
 *
 * Usage:
 *   const isMobile = useIsMobile(768);
 *   return isMobile ? <MobileView /> : <DesktopView />;
 */
export const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    // Throttle pour performance
    let timeoutId;
    const throttledResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 150);
    };

    window.addEventListener('resize', throttledResize);

    // Initial check
    handleResize();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', throttledResize);
    };
  }, [breakpoint]);

  return isMobile;
};

export default useIsMobile;
