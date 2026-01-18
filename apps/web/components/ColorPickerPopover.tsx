"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

// Color grid: 12 columns x 10 rows
// First row: grayscale (white to black)
// Remaining rows: color spectrum
const colorGrid = [
  // Row 1: Grayscale
  [
    [255, 255, 255],
    [232, 232, 232],
    [209, 209, 209],
    [185, 185, 185],
    [162, 162, 162],
    [139, 139, 139],
    [116, 116, 116],
    [93, 93, 93],
    [70, 70, 70],
    [46, 46, 46],
    [23, 23, 23],
    [0, 0, 0],
  ],
  // Row 2: Dark colors
  [
    [0, 52, 72],
    [3, 27, 83],
    [15, 5, 58],
    [45, 5, 59],
    [58, 6, 25],
    [88, 6, 1],
    [87, 28, 0],
    [84, 49, 0],
    [83, 59, 0],
    [99, 93, 0],
    [76, 83, 3],
    [36, 59, 14],
  ],
  // Row 3: Medium-dark colors
  [
    [1, 74, 98],
    [0, 45, 119],
    [24, 12, 78],
    [67, 14, 85],
    [81, 17, 39],
    [125, 18, 1],
    [118, 39, 0],
    [119, 71, 0],
    [116, 86, 1],
    [135, 130, 4],
    [108, 114, 13],
    [54, 82, 24],
  ],
  // Row 4: Medium colors
  [
    [0, 106, 138],
    [0, 63, 162],
    [41, 9, 115],
    [94, 21, 120],
    [116, 23, 60],
    [174, 25, 1],
    [167, 58, 0],
    [163, 101, 0],
    [160, 119, 1],
    [188, 181, 0],
    [149, 158, 12],
    [75, 118, 37],
  ],
  // Row 5: Medium-bright colors
  [
    [0, 135, 173],
    [4, 81, 206],
    [54, 25, 141],
    [118, 32, 153],
    [148, 35, 78],
    [219, 34, 5],
    [210, 78, 0],
    [203, 124, 0],
    [203, 151, 0],
    [235, 228, 5],
    [188, 201, 19],
    [99, 151, 48],
  ],
  // Row 6: Bright colors
  [
    [0, 155, 208],
    [0, 95, 244],
    [75, 32, 174],
    [146, 41, 180],
    [179, 43, 90],
    [247, 61, 20],
    [249, 102, 0],
    [245, 166, 0],
    [244, 192, 0],
    [245, 243, 63],
    [210, 228, 54],
    [112, 182, 59],
  ],
  // Row 7: Light-bright colors
  [
    [0, 194, 243],
    [59, 130, 245],
    [91, 45, 226],
    [185, 53, 236],
    [222, 55, 119],
    [246, 94, 77],
    [248, 129, 69],
    [246, 174, 61],
    [244, 196, 60],
    [246, 239, 99],
    [219, 230, 96],
    [145, 203, 93],
  ],
  // Row 8: Light colors
  [
    [81, 207, 243],
    [113, 161, 246],
    [129, 75, 246],
    [203, 86, 246],
    [231, 111, 153],
    [244, 136, 123],
    [247, 160, 120],
    [246, 193, 115],
    [247, 210, 112],
    [248, 239, 143],
    [226, 233, 137],
    [171, 214, 135],
  ],
  // Row 9: Very light colors
  [
    [141, 218, 242],
    [162, 191, 248],
    [169, 136, 244],
    [219, 141, 244],
    [235, 158, 187],
    [246, 173, 167],
    [246, 191, 167],
    [248, 211, 162],
    [245, 220, 163],
    [244, 243, 178],
    [233, 237, 178],
    [197, 223, 175],
  ],
  // Row 10: Pastel colors
  [
    [195, 231, 245],
    [204, 219, 248],
    [210, 193, 245],
    [229, 195, 246],
    [240, 204, 214],
    [247, 212, 210],
    [248, 220, 208],
    [246, 228, 204],
    [244, 233, 205],
    [245, 244, 214],
    [237, 242, 212],
    [215, 230, 207],
  ],
];

// Trending colors (from the HTML reference)
const trendingColors = [
  [0, 0, 0], // #000000
  [255, 255, 255], // #ffffff
  [23, 23, 23], // #171717
  [88, 6, 1], // #580601
  [219, 34, 5], // #db2205
  [174, 25, 1], // #ae1901
  [125, 18, 1], // #7d1201
  [247, 61, 20], // #f73d14
  [249, 102, 0], // #f96600
  [235, 228, 5], // #ebe405
  [36, 59, 14], // #243b0e
  [75, 118, 37], // #4b7625
  [112, 182, 59], // #70b63b
  [0, 95, 244], // #005ff4
  [0, 45, 119], // #002d77
  [4, 81, 206], // #0451ce
  [0, 63, 162], // #003fa2
  [3, 27, 83], // #031b53
  [222, 55, 119], // #de3777
  [231, 111, 153], // #e76f99
];

interface ColorPickerPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorElement?: HTMLElement | null;
}

export function ColorPickerPopover({
  open,
  onOpenChange,
  anchorElement,
}: ColorPickerPopoverProps) {
  const router = useRouter();
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorElement || !open) {
      // Use setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => setPosition(null), 0);
      return () => clearTimeout(timer);
    }

    const updatePosition = () => {
      if (!anchorElement) return;
      const rect = anchorElement.getBoundingClientRect();
      // Center the popover below the search bar
      // The popover width is 720px (more compact), so we center it relative to the search bar
      const popoverWidth = 720;
      const viewportWidth = window.innerWidth;
      let left = rect.left + rect.width / 2 - popoverWidth / 2;

      // Ensure it doesn't go off the edges
      const padding = 8;
      if (left < padding) {
        left = padding;
      } else if (left + popoverWidth > viewportWidth - padding) {
        left = viewportWidth - popoverWidth - padding;
      }

      const top = rect.bottom + window.scrollY + 8; // 8px offset to match sideOffset

      setPosition({
        top: Math.max(padding, top), // Ensure it doesn't go off the top
        left,
        width: rect.width,
      });
    };

    // Initial position update
    const timer = setTimeout(updatePosition, 0);

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorElement, open]);

  const handleColorSelect = (hex: string) => {
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(hex)}`);
  };

  // Determine text color (black or white) based on background brightness
  const getTextColor = (r: number, g: number, b: number): string => {
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? "text-black" : "text-white";
  };

  if (!open || !position) return null;

  const content = (
    <div
      ref={contentRef}
      className={cn(
        "fixed overflow-hidden rounded-2xl border border-gray-800 bg-gray-950",
        "w-[720px] max-w-[calc(100vw-16px)]",
        "p-0 shadow-2xl",
        "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 101,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full px-6 py-4 pb-6">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-200">
            Search by Color
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-all duration-200 ease-out hover:bg-gray-800 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 focus:ring-offset-gray-950"
            aria-label="Close color picker"
          >
            <X className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" />
          </button>
        </div>

        {/* Color Grid - More compact: 12 cols x 8 rows */}
        <div className="h-48 w-full overflow-hidden rounded-xl border border-gray-800/60 bg-gray-900/30">
          <div className="grid h-full w-full grid-cols-12 grid-rows-8 gap-px p-px">
            {colorGrid.slice(0, 8).map((row, rowIndex) =>
              row.map(([r, g, b], colIndex) => {
                const hex = rgbToHex(r, g, b);
                const isLight = (r + g + b) / 3 > 128;
                return (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => handleColorSelect(hex)}
                    className={cn(
                      "relative transition-all duration-150 ease-out",
                      "hover:scale-110 hover:z-10 hover:shadow-xl hover:ring-2 hover:ring-white/20",
                      "focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-gray-950",
                      "active:scale-105"
                    )}
                    style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
                    title={`Search by ${hex}`}
                    aria-label={`Search by color ${hex}`}
                  >
                    {/* Subtle border for better definition */}
                    <div
                      className={cn(
                        "absolute inset-0 border border-black/10",
                        isLight && "border-black/20"
                      )}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Trending Colors */}
        <div className="mt-4">
          <div className="flex items-center pb-3 text-xl text-gray-500 transition-opacity duration-75 ease-in">
            Trending colors
          </div>
          <div className="no-scrollbar flex overflow-x-auto pb-1">
            <div className="flex min-w-max">
              <div className="flex min-w-[calc(100%+100px)] space-x-2">
                {trendingColors.map(([r, g, b], index) => {
                  const hex = rgbToHex(r, g, b);
                  const textColor = getTextColor(r, g, b);
                  const isLight = (r + g + b) / 3 > 128;
                  return (
                    <button
                      key={index}
                      onClick={() => handleColorSelect(hex)}
                      className={cn(
                        "duration-over-long border-separator group flex h-10 w-10 min-w-0 max-w-[130px] cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap rounded-[20px] border transition-all delay-100 hover:flex-auto hover:delay-0",
                        "focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:ring-offset-gray-950"
                      )}
                      style={{
                        backgroundColor: `rgb(${r}, ${g}, ${b})`,
                        borderColor: isLight
                          ? "rgba(0,0,0,0.15)"
                          : "rgba(255,255,255,0.1)",
                      }}
                      title={`Search by ${hex}`}
                      aria-label={`Search by trending color ${hex}`}
                    >
                      {/* Search Icon SVG */}
                      <svg
                        fill="currentColor"
                        height="20"
                        viewBox="0 0 20 20"
                        width="20"
                        className={cn(
                          "duration-over-long mr-2 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-80",
                          textColor
                        )}
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M18.6439 19.452L13.1439 14.1048L14.1895 13.0293L19.6895 18.3765L18.6439 19.452Z"
                          fill="currentColor"
                        />
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M8.77776 15.0379C12.377 15.0379 15.2222 12.2118 15.2222 8.8141C15.2222 5.41636 12.377 2.59033 8.77776 2.59033C5.17848 2.59033 2.33331 5.41636 2.33331 8.8141C2.33331 12.2118 5.17848 15.0379 8.77776 15.0379ZM8.77776 16.5379C13.1654 16.5379 16.7222 13.0798 16.7222 8.8141C16.7222 4.54838 13.1654 1.09033 8.77776 1.09033C4.39016 1.09033 0.833313 4.54838 0.833313 8.8141C0.833313 13.0798 4.39016 16.5379 8.77776 16.5379Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span
                        className={cn(
                          "duration-over-long truncate text-[14px] font-medium opacity-0 transition-opacity group-hover:opacity-80",
                          textColor
                        )}
                      >
                        {hex}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="min-w-8 shrink-0"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20"
        style={{ zIndex: 100 }}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {content}
    </>,
    document.body
  );
}
