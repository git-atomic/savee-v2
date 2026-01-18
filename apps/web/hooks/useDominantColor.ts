import { useState, useEffect } from 'react';
import { FastAverageColor } from 'fast-average-color';

const fac = new FastAverageColor();

export function useDominantColor(imageSrc: string | null) {
  const [color, setColor] = useState<string>('#1a1a1a');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!imageSrc) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageSrc;

    img.onload = () => {
      try {
        const avgColor = fac.getColor(img);
        // Make the color slightly darker for better skeleton appearance
        const [r, g, b] = avgColor.value;
        const darkerColor = `rgb(${Math.floor(r * 0.3)}, ${Math.floor(g * 0.3)}, ${Math.floor(b * 0.3)})`;
        setColor(darkerColor);
      } catch (error) {
        console.error('Failed to extract color:', error);
        setColor('#1a1a1a');
      } finally {
        setIsLoading(false);
      }
    };

    img.onerror = () => {
      setColor('#1a1a1a');
      setIsLoading(false);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageSrc]);

  return { color, isLoading };
}
