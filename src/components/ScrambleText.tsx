import React, { useState, useEffect } from 'react';

interface ScrambleTextProps {
  text: string;
  symbols?: string;
  duration?: number;
  delay?: number;
  className?: string;
  as?: React.ElementType;
}

const DEFAULT_SYMBOLS = '+-*/%=#@!?$&01~<>{}^|';

export const ScrambleText: React.FC<ScrambleTextProps> = ({
  text,
  symbols = DEFAULT_SYMBOLS,
  duration = 1400,
  delay = 100,
  className = '',
  as: Component = 'span',
}) => {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    let animationFrameId: number;
    let startTime: number | null = null;
    const length = text.length;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = Math.max(0, timestamp - startTime - delay);
      const progress = Math.min(1, elapsed / duration);

      // Number of characters fully revealed so far
      const revealedCount = Math.floor(progress * length);

      let current = '';
      for (let i = 0; i < length; i++) {
        if (text[i] === ' ') {
          current += ' ';
        } else if (i < revealedCount) {
          current += text[i];
        } else {
          // Pick a random symbol (plus, minus, operators)
          const randomChar = symbols[Math.floor(Math.random() * symbols.length)];
          current += randomChar;
        }
      }

      setDisplayText(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setDisplayText(text);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [text, symbols, duration, delay]);

  return <Component className={className}>{displayText || text}</Component>;
};
