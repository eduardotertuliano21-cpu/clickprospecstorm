import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  id?: string;
  label?: string;
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  shortcut?: string;
  color?: string;
  disabled?: boolean;
  dividerBefore?: boolean;
  divider?: boolean;
  danger?: boolean;
  action?: () => void;
  onClick?: () => void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  title?: string;
  subtitle?: string;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  title,
  subtitle,
  items,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha no clique fora ou tecla Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Ajuste inteligente para não ultrapassar as bordas da janela
  const menuWidth = 240;
  const menuHeight = items.length * 36 + (title ? 50 : 20);

  const adjustedX = Math.min(Math.max(10, x), Math.max(10, window.innerWidth - menuWidth - 12));
  const adjustedY = Math.min(Math.max(10, y), Math.max(10, window.innerHeight - menuHeight - 12));

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto bg-black/10 backdrop-blur-[0.5px]">
      <div
        ref={menuRef}
        style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
        className="fixed w-60 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl p-1.5 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 select-none z-50 ring-1 ring-white/10"
      >
        {/* Cabeçalho Opcional do Menu */}
        {title && (
          <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
            <div className="text-[11px] font-bold text-slate-200 truncate">{title}</div>
            {subtitle && <div className="text-[10px] text-slate-400 truncate">{subtitle}</div>}
          </div>
        )}

        {/* Lista de Ações */}
        <div className="space-y-0.5">
          {items.map((item, idx) => {
            if (item.divider) {
              return <div key={item.id || `div-${idx}`} className="my-1 border-t border-slate-800/70" />;
            }

            const handleClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              (item.action || item.onClick)?.();
              onClose();
            };

            const renderIcon = () => {
              if (!item.icon) return null;
              if (React.isValidElement(item.icon)) {
                return item.icon;
              }
              if (typeof item.icon === 'function') {
                const IconComp = item.icon as React.ComponentType<{ className?: string }>;
                return <IconComp className="w-3.5 h-3.5 shrink-0" />;
              }
              return item.icon as React.ReactNode;
            };

            const itemColor = item.danger 
              ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10' 
              : item.color || 'text-slate-200 hover:text-white hover:bg-slate-800/90';

            return (
              <React.Fragment key={item.id || `item-${idx}`}>
                {item.dividerBefore && (
                  <div className="my-1 border-t border-slate-800/70" />
                )}
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={handleClick}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all group ${
                    item.disabled
                      ? 'opacity-40 cursor-not-allowed text-slate-500'
                      : 'active:scale-[0.98]'
                  } ${itemColor}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {item.icon && (
                      <span className="shrink-0 text-slate-400 group-hover:text-slate-200 transition-colors">
                        {renderIcon()}
                      </span>
                    )}
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.shortcut && (
                    <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400 ml-2 shrink-0 px-1 py-0.5 rounded bg-slate-950/60 border border-slate-800/60">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
