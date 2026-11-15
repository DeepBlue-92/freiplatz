import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Crop,
  RotateCcw,
  Move,
  Maximize2,
} from "lucide-react";

interface ImageFocalPointAdjusterProps {
  imageUrl: string;
  positionX?: number; // 0..100 (%)
  positionY?: number; // 0..100 (%)
  scale?: number; // 100..250 (%)
  aspectRatio?: "banner" | "card"; // banner is ~21:9 / 16:7 (~2.3:1), card is 16:9 (~1.78:1)
  onChange: (updates: {
    image_position_x: number;
    image_position_y: number;
    image_scale: number;
  }) => void;
}

type DragMode = "move" | "resize_tl" | "resize_tr" | "resize_bl" | "resize_br" | null;

export const ImageFocalPointAdjuster: React.FC<ImageFocalPointAdjusterProps> = ({
  imageUrl,
  positionX = 50,
  positionY = 50,
  scale = 100,
  aspectRatio = "banner",
  onChange,
}) => {
  const imgElementRef = useRef<HTMLImageElement>(null);

  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initLeft: number;
    initTop: number;
    initWidth: number;
    initHeight: number;
  }>({ startX: 0, startY: 0, initLeft: 0, initTop: 0, initWidth: 0, initHeight: 0 });

  const currentX = typeof positionX === "number" ? Math.max(0, Math.min(100, positionX)) : 50;
  const currentY = typeof positionY === "number" ? Math.max(0, Math.min(100, positionY)) : 50;
  const currentScale = typeof scale === "number" ? Math.max(100, Math.min(250, scale)) : 100;

  // Measure rendered image element size
  const updateImageDimensions = useCallback(() => {
    if (imgElementRef.current) {
      const rect = imgElementRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setImageDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    }
  }, []);

  useEffect(() => {
    updateImageDimensions();
    window.addEventListener("resize", updateImageDimensions);
    return () => window.removeEventListener("resize", updateImageDimensions);
  }, [updateImageDimensions, imageUrl]);

  // Target aspect ratio of the final visible card / banner
  const targetRatio = aspectRatio === "banner" ? 2.3 : 1.777;

  // Compute crop box geometry relative to the rendered image
  const { baseW, baseH, boxWidth, boxHeight, maxLeft, maxTop, boxLeft, boxTop } = React.useMemo(() => {
    const imgW = imageDimensions.width || 600;
    const imgH = imageDimensions.height || 260;
    const imgRatio = imgW / imgH;

    let bW = imgW;
    let bH = imgH;

    if (imgRatio > targetRatio) {
      bH = imgH;
      bW = imgH * targetRatio;
    } else {
      bW = imgW;
      bH = imgW / targetRatio;
    }

    // Zoom scale: 100% means largest crop box; 250% means smallest box (zoomed in)
    const zoomFactor = 100 / currentScale;
    const boxW = Math.min(imgW, Math.max(50, bW * zoomFactor));
    const boxH = Math.min(imgH, Math.max(50 / targetRatio, bH * zoomFactor));

    const maxL = Math.max(0, imgW - boxW);
    const maxT = Math.max(0, imgH - boxH);

    const bLeft = maxL > 0 ? (currentX / 100) * maxL : 0;
    const bTop = maxT > 0 ? (currentY / 100) * maxT : 0;

    return {
      baseW: bW,
      baseH: bH,
      boxWidth: boxW,
      boxHeight: boxH,
      maxLeft: maxL,
      maxTop: maxT,
      boxLeft: bLeft,
      boxTop: bTop,
    };
  }, [imageDimensions, targetRatio, currentScale, currentX, currentY]);

  // Start dragging: either move or corner resize
  const handleStartDrag = (mode: DragMode, clientX: number, clientY: number, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragMode(mode);
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initLeft: boxLeft,
      initTop: boxTop,
      initWidth: boxWidth,
      initHeight: boxHeight,
    };
  };

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragMode) return;
      const imgW = imageDimensions.width || 600;
      const imgH = imageDimensions.height || 260;
      const dx = clientX - dragStartRef.current.startX;
      const dy = clientY - dragStartRef.current.startY;

      if (dragMode === "move") {
        const newLeft = Math.max(0, Math.min(maxLeft, dragStartRef.current.initLeft + dx));
        const newTop = Math.max(0, Math.min(maxTop, dragStartRef.current.initTop + dy));

        const pctX = maxLeft > 0 ? Math.round((newLeft / maxLeft) * 100) : 50;
        const pctY = maxTop > 0 ? Math.round((newTop / maxTop) * 100) : 50;

        onChange({
          image_position_x: Math.max(0, Math.min(100, pctX)),
          image_position_y: Math.max(0, Math.min(100, pctY)),
          image_scale: currentScale,
        });
        return;
      }

      // Handle corner resizing
      const initL = dragStartRef.current.initLeft;
      const initT = dragStartRef.current.initTop;
      const initW = dragStartRef.current.initWidth;
      const initH = dragStartRef.current.initHeight;

      let newCandW = initW;
      let newL = initL;
      let newT = initT;

      if (dragMode === "resize_br") {
        const rawW = initW + dx;
        const rawH = initH + dy;
        const maxAvailW = Math.min(imgW - initL, (imgH - initT) * targetRatio);
        newCandW = Math.max(50, Math.min(maxAvailW, Math.max(rawW, rawH * targetRatio)));
        newL = initL;
        newT = initT;
      } else if (dragMode === "resize_tl") {
        const rightFixed = initL + initW;
        const bottomFixed = initT + initH;
        const rawW = initW - dx;
        const rawH = initH - dy;
        const maxAvailW = Math.min(rightFixed, bottomFixed * targetRatio);
        newCandW = Math.max(50, Math.min(maxAvailW, Math.max(rawW, rawH * targetRatio)));
        const candH = newCandW / targetRatio;
        newL = rightFixed - newCandW;
        newT = bottomFixed - candH;
      } else if (dragMode === "resize_tr") {
        const bottomFixed = initT + initH;
        const rawW = initW + dx;
        const rawH = initH - dy;
        const maxAvailW = Math.min(imgW - initL, bottomFixed * targetRatio);
        newCandW = Math.max(50, Math.min(maxAvailW, Math.max(rawW, rawH * targetRatio)));
        const candH = newCandW / targetRatio;
        newL = initL;
        newT = bottomFixed - candH;
      } else if (dragMode === "resize_bl") {
        const rightFixed = initL + initW;
        const rawW = initW - dx;
        const rawH = initH + dy;
        const maxAvailW = Math.min(rightFixed, (imgH - initT) * targetRatio);
        newCandW = Math.max(50, Math.min(maxAvailW, Math.max(rawW, rawH * targetRatio)));
        newL = rightFixed - newCandW;
        newT = initT;
      }

      // Calculate scale from box width
      const calculatedScale = Math.round(Math.max(100, Math.min(250, (baseW / newCandW) * 100)));
      const candMaxL = Math.max(0, imgW - newCandW);
      const candMaxT = Math.max(0, imgH - (newCandW / targetRatio));

      const pctX = candMaxL > 0 ? Math.round((newL / candMaxL) * 100) : 50;
      const pctY = candMaxT > 0 ? Math.round((newT / candMaxT) * 100) : 50;

      onChange({
        image_position_x: Math.max(0, Math.min(100, pctX)),
        image_position_y: Math.max(0, Math.min(100, pctY)),
        image_scale: calculatedScale,
      });
    },
    [dragMode, imageDimensions, targetRatio, baseW, maxLeft, maxTop, currentScale, onChange]
  );

  // Global mouse / touch listeners while dragging
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragMode) return;
      e.preventDefault();
      handlePointerMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragMode || e.touches.length === 0) return;
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onEnd = () => {
      if (dragMode) setDragMode(null);
    };

    if (dragMode) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("mouseup", onEnd);
      window.addEventListener("touchend", onEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchend", onEnd);
    };
  }, [dragMode, handlePointerMove]);

  // Handle Zoom Wheel over viewport
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 5 : -5;
    const newScale = Math.max(100, Math.min(250, currentScale + delta));
    onChange({
      image_position_x: currentX,
      image_position_y: currentY,
      image_scale: newScale,
    });
  };

  const handlePreset = (x: number, y: number) => {
    onChange({
      image_position_x: x,
      image_position_y: y,
      image_scale: currentScale,
    });
  };

  const handleReset = () => {
    onChange({
      image_position_x: 50,
      image_position_y: 50,
      image_scale: 100,
    });
  };

  if (!imageUrl) return null;

  return (
    <div className="p-4 bg-slate-50/90 text-slate-800 rounded-2xl border border-slate-200/90 shadow-xs space-y-3 select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <div className="w-6 h-6 rounded-lg bg-emerald-100/80 text-[var(--color-primary)] flex items-center justify-center">
            <Crop className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs sm:text-sm font-bold tracking-tight">Bildausschnitt anpassen</span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          title="Auf Standard zurücksetzen (Zentriert / 100%)"
          className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs active:scale-95"
        >
          <RotateCcw className="w-3 h-3 text-slate-500" />
          <span>Zurücksetzen</span>
        </button>
      </div>

      {/* Main Image Cropper Stage in Light Studio Canvas */}
      <div
        onWheel={handleWheel}
        className="relative w-full flex items-center justify-center bg-slate-100/90 rounded-xl overflow-hidden p-3 sm:p-4 border border-slate-200/80 shadow-inner"
      >
        {/* Constrained Image Box */}
        <div className="relative inline-block overflow-hidden rounded-lg select-none shadow-sm">
          {/* Base Image: 100% visible, Grayscale + subtle dimming */}
          <img
            ref={imgElementRef}
            src={imageUrl}
            alt="Gesamtes Foto"
            onLoad={updateImageDimensions}
            draggable={false}
            className="block max-h-[260px] sm:max-h-[320px] w-auto max-w-full object-contain filter grayscale opacity-40 brightness-90 transition-opacity"
          />

          {/* Active Crop Frame (Colored cutout + Rule of Thirds + Interactive Corner Drag Handles) */}
          {imageDimensions.width > 0 && imageDimensions.height > 0 && (
            <div
              className={`absolute overflow-visible rounded-md border-2 border-[var(--color-primary)] shadow-[0_0_20px_rgba(16,185,129,0.35),0_0_0_1px_rgba(255,255,255,0.8)] ${
                dragMode === "move" ? "cursor-grabbing" : "cursor-grab"
              }`}
              style={{
                left: `${boxLeft}px`,
                top: `${boxTop}px`,
                width: `${boxWidth}px`,
                height: `${boxHeight}px`,
              }}
              onMouseDown={(e) => handleStartDrag("move", e.clientX, e.clientY, e)}
              onTouchStart={(e) => {
                if (e.touches.length > 0) {
                  handleStartDrag("move", e.touches[0].clientX, e.touches[0].clientY, e);
                }
              }}
            >
              {/* Colored Image Inside the Crop Window - Perfectly aligned */}
              <div className="absolute inset-0 overflow-hidden rounded-[4px] pointer-events-none">
                <img
                  src={imageUrl}
                  alt="Gewählter Ausschnitt"
                  draggable={false}
                  className="absolute block max-w-none max-h-none filter-none opacity-100 brightness-100"
                  style={{
                    width: `${imageDimensions.width}px`,
                    height: `${imageDimensions.height}px`,
                    left: `${-boxLeft}px`,
                    top: `${-boxTop}px`,
                  }}
                />

                {/* Composition Grid (Rule of Thirds) */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 border border-white/30">
                  <div className="border-r border-b border-white/35" />
                  <div className="border-r border-b border-white/35" />
                  <div className="border-b border-white/35" />
                  <div className="border-r border-b border-white/35" />
                  <div className="border-r border-b border-white/35" />
                  <div className="border-b border-white/35" />
                  <div className="border-r border-white/35" />
                  <div className="border-r border-white/35" />
                  <div />
                </div>
              </div>

              {/* 4 Corner Resize Handles - Drag to change size / zoom */}
              {/* Top-Left */}
              <div
                onMouseDown={(e) => handleStartDrag("resize_tl", e.clientX, e.clientY, e)}
                onTouchStart={(e) => {
                  if (e.touches.length > 0) handleStartDrag("resize_tl", e.touches[0].clientX, e.touches[0].clientY, e);
                }}
                className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-[var(--color-primary)] rounded-full shadow-md cursor-nwse-resize hover:scale-125 active:scale-150 transition-transform z-30"
                title="Ausschnittsgröße anpassen"
              />

              {/* Top-Right */}
              <div
                onMouseDown={(e) => handleStartDrag("resize_tr", e.clientX, e.clientY, e)}
                onTouchStart={(e) => {
                  if (e.touches.length > 0) handleStartDrag("resize_tr", e.touches[0].clientX, e.touches[0].clientY, e);
                }}
                className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-[var(--color-primary)] rounded-full shadow-md cursor-nesw-resize hover:scale-125 active:scale-150 transition-transform z-30"
                title="Ausschnittsgröße anpassen"
              />

              {/* Bottom-Left */}
              <div
                onMouseDown={(e) => handleStartDrag("resize_bl", e.clientX, e.clientY, e)}
                onTouchStart={(e) => {
                  if (e.touches.length > 0) handleStartDrag("resize_bl", e.touches[0].clientX, e.touches[0].clientY, e);
                }}
                className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-[var(--color-primary)] rounded-full shadow-md cursor-nesw-resize hover:scale-125 active:scale-150 transition-transform z-30"
                title="Ausschnittsgröße anpassen"
              />

              {/* Bottom-Right */}
              <div
                onMouseDown={(e) => handleStartDrag("resize_br", e.clientX, e.clientY, e)}
                onTouchStart={(e) => {
                  if (e.touches.length > 0) handleStartDrag("resize_br", e.touches[0].clientX, e.touches[0].clientY, e);
                }}
                className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-[var(--color-primary)] rounded-full shadow-md cursor-nwse-resize hover:scale-125 active:scale-150 transition-transform z-30"
                title="Ausschnittsgröße anpassen"
              />
            </div>
          )}

          {/* Floating Instruction Hint */}
          <div
            className={`absolute bottom-2 left-2 z-10 pointer-events-none transition-opacity duration-200 ${
              dragMode ? "opacity-0" : "opacity-95"
            }`}
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/95 backdrop-blur-xs text-slate-700 text-[11px] font-semibold border border-slate-200/90 shadow-md">
              <Move className="w-3 h-3 text-[var(--color-primary)]" />
              <span>Rahmen verschieben • Ecken ziehen zum Skalieren</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Align Presets Bar */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
          <span>Fokus-Position:</span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => handlePreset(50, 50)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              currentX === 50 && currentY === 50
                ? "bg-emerald-50 text-[var(--color-primary)] border-emerald-300 shadow-2xs"
                : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            Mitte
          </button>
          <button
            type="button"
            onClick={() => handlePreset(50, 0)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              currentX === 50 && currentY === 0
                ? "bg-emerald-50 text-[var(--color-primary)] border-emerald-300 shadow-2xs"
                : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            Oben
          </button>
          <button
            type="button"
            onClick={() => handlePreset(50, 100)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              currentX === 50 && currentY === 100
                ? "bg-emerald-50 text-[var(--color-primary)] border-emerald-300 shadow-2xs"
                : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            Unten
          </button>
          <button
            type="button"
            onClick={() => handlePreset(0, 50)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              currentX === 0 && currentY === 50
                ? "bg-emerald-50 text-[var(--color-primary)] border-emerald-300 shadow-2xs"
                : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            Links
          </button>
          <button
            type="button"
            onClick={() => handlePreset(100, 50)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              currentX === 100 && currentY === 50
                ? "bg-emerald-50 text-[var(--color-primary)] border-emerald-300 shadow-2xs"
                : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            Rechts
          </button>
        </div>
      </div>
    </div>
  );
};
