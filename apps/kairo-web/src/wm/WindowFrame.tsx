import React, { useCallback, useRef } from 'react';
import type { WindowState } from '../types/window';

interface WindowFrameProps {
  window: WindowState;
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  children: React.ReactNode;
}

export function WindowFrame({
  window,
  isActive,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onMove,
  onResize,
  children,
}: WindowFrameProps) {
  const isDragging = useRef(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, winX: 0, winY: 0 });

  const isResizing = useRef(false);
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, winW: 0, winH: 0 });

  const handleTitleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || window.isMaximized) return;
      onFocus();
      isDragging.current = true;
      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        winX: window.x,
        winY: window.y,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const dx = moveEvent.clientX - dragStart.current.mouseX;
        const dy = moveEvent.clientY - dragStart.current.mouseY;
        const nextX = Math.max(0, dragStart.current.winX + dx);
        const nextY = Math.max(0, dragStart.current.winY + dy);
        onMove(nextX, nextY);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [window.x, window.y, window.isMaximized, onFocus, onMove]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || window.isMaximized) return;
      e.stopPropagation();
      onFocus();
      isResizing.current = true;
      resizeStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        winW: window.width,
        winH: window.height,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;
        const dw = moveEvent.clientX - resizeStart.current.mouseX;
        const dh = moveEvent.clientY - resizeStart.current.mouseY;
        const nextW = Math.max(window.minWidth, resizeStart.current.winW + dw);
        const nextH = Math.max(window.minHeight, resizeStart.current.winH + dh);
        onResize(nextW, nextH);
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [window.width, window.height, window.minWidth, window.minHeight, window.isMaximized, onFocus, onResize]
  );

  if (window.isMinimized) return null;

  const style: React.CSSProperties = window.isMaximized
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: window.zIndex,
      }
    : {
        position: 'absolute',
        top: window.y,
        left: window.x,
        width: window.width,
        height: window.height,
        zIndex: window.zIndex,
      };

  return (
    <div
      className={`window-frame ${isActive ? 'active' : ''} ${window.isMaximized ? 'maximized' : ''}`}
      style={style}
      onMouseDown={onFocus}
    >
      <div
        className="window-titlebar"
        onMouseDown={handleTitleMouseDown}
        onDoubleClick={onMaximize}
      >
        <div className="traffic-lights">
          <button
            type="button"
            className="traffic-light close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close"
          />
          <button
            type="button"
            className="traffic-light minimize"
            onClick={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
            title="Minimize"
          />
          <button
            type="button"
            className="traffic-light maximize"
            onClick={(e) => {
              e.stopPropagation();
              onMaximize();
            }}
            title="Maximize"
          />
        </div>
        <span className="window-title">
          {window.computerColor && (
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: window.computerColor,
                marginRight: 6,
                verticalAlign: 'middle',
              }}
            />
          )}
          {window.title}
          {window.computerName && (
            <span style={{ opacity: 0.5, fontSize: '0.85em', marginLeft: 6 }}>
              [{window.computerName}]
            </span>
          )}
        </span>
        <div className="titlebar-spacer" />
      </div>

      <div className="window-content">{children}</div>

      {!window.isMaximized && (
        <div
          className="window-resize-handle"
          onMouseDown={handleResizeMouseDown}
          title="Resize"
        />
      )}
    </div>
  );
}
