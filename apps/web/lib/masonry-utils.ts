
export function getDeterministicAspectRatio(id: string | number): number {
  const str = id.toString();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  
  // A pleasing set of aspect ratios for masonry
  // 3:4 (portrait), 1:1 (square), 4:3 (landscape), 9:16 (tall), 16:9 (wide)
  // Weighted slightly towards portrait/square for better vertical density
  const ratios = [
    3/4, 3/4, // Portrait
    1/1, 1/1, // Square
    4/3,      // Landscape
    9/16,     // Tall
    16/9      // Wide
  ];
  
  return ratios[Math.abs(hash) % ratios.length];
}

export function getDeterministicColor(id: string | number): string {
    const str = id.toString();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 80%)`; // Pastel colors
}
