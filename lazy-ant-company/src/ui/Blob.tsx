/** 兩隻腳的圓滾滾小精靈（2D 版，用於圖例與標題）。 */
export default function Blob({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 20 23" aria-hidden className="inline-block align-middle">
      <g style={{ filter: 'brightness(0.88)' }} fill={color}>
        <ellipse cx="6.6" cy="20.6" rx="3.4" ry="2.1" />
        <ellipse cx="13.4" cy="20.6" rx="3.4" ry="2.1" />
      </g>
      <circle cx="10" cy="10" r="9.2" fill={color} />
      <circle cx="7" cy="9" r="1.25" fill="#3B4256" />
      <circle cx="13" cy="9" r="1.25" fill="#3B4256" />
    </svg>
  );
}
