import React, { useState } from 'react';

export interface TooltipProps {
  content?: React.ReactNode;
  text?: React.ReactNode;
  shortcut?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  text,
  shortcut,
  position = 'top',
  children,
  className = ''
}) => {
  const [visible, setVisible] = useState(false);
  const displayText = text ?? content;

  const posClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={`absolute ${posClasses[position]} z-50 pointer-events-none whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-slate-700 text-slate-100 text-[11px] font-medium shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 flex items-center gap-1.5 ring-1 ring-white/10`}
        >
          <span>{displayText}</span>
          {shortcut && (
            <kbd className="px-1 py-0.2 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-400">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
};
