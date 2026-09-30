import { memo } from 'react';
import { riverPath, streets } from '@/lib/street-network';
// Self-contained vector cartography: no tiles, network access, or API key required.
// Coordinates form a deliberately approximate city basemap, not navigation data.
function seeded(n: number) {
  let value = Math.imul(n ^ 0x6a09e667, 1597334677);
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967296;
}
export const Cartography = memo(function Cartography() {
  const blocks = [];
  for (let row = -14; row < 48; row++)
    for (let col = -16; col < 53; col++) {
      const seed = (row + 15) * 71 + col + 17;
      const x = col * 30 + (row % 3) * 2;
      const y = row * 24;
      const park = seeded(seed) > 0.925;
      const fill = park
        ? ['#cfebd8', '#d1ecd7', '#d7eedc'][Math.abs(col) % 3]
        : ['#edf0ed', '#e9ecec', '#e6ebea', '#f1f0e9', '#e8eeee'][Math.floor(seeded(seed + 4) * 5)];
      blocks.push(
        <g key={seed}>
          <rect
            x={x}
            y={y}
            width={24}
            height={18}
            rx={1.2}
            fill={fill}
            stroke={park ? '#c4e4cd' : '#dce4e6'}
            strokeWidth={0.45}
          />
          {!park && seeded(seed + 1) > 0.28 && (
            <>
              <path
                d={`M${x + 3} ${y + 4}h${8 + seeded(seed) * 10}v5h-6v5h-8z`}
                fill="#dfe5e5"
                opacity=".7"
              />
              <path
                d={`M${x + 3} ${y + 2}h18 M${x + 2} ${y + 15}h19`}
                stroke="#f8faf7"
                strokeWidth={0.7}
              />
            </>
          )}
        </g>,
      );
    }
  return (
    <g className="cartography">
      <rect x={-1200} y={-1000} width={3600} height={3000} fill="#eff3f2" />
      <g transform="rotate(-23 600 440)">
        {blocks}
      </g>
      {streets.filter((street) => street.kind === 'street').map(({ a, b }, i) => (
        <g key={i}>
          <path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#d8e9f1" strokeWidth="9" />
          <path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#fff" strokeWidth="5" />
        </g>
      ))}
      <path
        d="M 44 168 C 235 96 290 334 483 244 S 620 147 782 143"
        fill="none"
        stroke="#c0e3f4"
        strokeWidth="14"
      />
      <path
        d="M 63 171 C 235 101 300 337 490 246 S 618 154 784 146"
        fill="none"
        stroke="#aadaf3"
        strokeWidth="5"
        opacity=".55"
      />
      {streets.filter((street) => street.kind === 'arterial').map(({ a, b }, i) => {
        const d = `M${a.x} ${a.y}L${b.x} ${b.y}`;
        return (
        <g key={d}>
          <path d={d} fill="none" stroke="#e3dbc3" strokeWidth={10} />
          <path d={d} fill="none" stroke="#fff8dd" strokeWidth={8} />
          <path d={d} fill="none" stroke="#ffefbf" strokeWidth={3} />
          {i === 1 && <path d={d} fill="none" stroke="white" strokeWidth={1} />}
        </g>
      ); })}
      <path d={riverPath} fill="none" stroke="#edf6e8" strokeWidth="85" />
      <path d={riverPath} fill="none" stroke="#a9dafa" strokeWidth="66" />
      <path d={riverPath} fill="none" stroke="#b2dff9" strokeWidth="46" />
      <path d="M 710 166 C 768 136 791 120 808 97" fill="none" stroke="#c5e9d0" strokeWidth="13" />
      <path d="M 749 391 Q 841 511 801 592" fill="none" stroke="#ccecd6" strokeWidth="16" />
      <path d="M 606 705 Q 621 750 601 801" fill="none" stroke="#c7e5d1" strokeWidth="17" />
      {streets.filter((street) => street.kind === 'bridge').map(({ a, b }, i) => (
        <g key={i}>
          <path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#d5e6ee" strokeWidth="14" />
          <path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#fffef8" strokeWidth="8" />
        </g>
      ))}
      <g className="district-labels">
        <text x="288" y="214">
          静安区
        </text>
        <text x="64" y="377">
          普陀区
        </text>
        <text x="485" y="440">
          黄浦区
        </text>
        <text x="948" y="500">
          浦东新区
        </text>
        <text x="205" y="694">
          徐汇区
        </text>
        <text x="910" y="87">
          虹口区
        </text>
      </g>
      <g className="street-labels">
        <text x="342" y="318" transform="rotate(-22 342 318)">
          南京西路
        </text>
        <text x="528" y="301" transform="rotate(-20 528 301)">
          南京东路
        </text>
        <text x="366" y="549" transform="rotate(-23 366 549)">
          淮海中路
        </text>
        <text x="907" y="432" transform="rotate(-21 907 432)">
          世纪大道
        </text>
        <text x="812" y="673" transform="rotate(-25 812 673)">
          浦东南路
        </text>
        <text x="352" y="126">
          苏州河
        </text>
      </g>
      <g fill="#8ecde9" fontSize="18" fontWeight="500">
        <text x="719" y="591" transform="rotate(7 719 591)">
          黄
          <tspan x="719" dy="23">
            浦
          </tspan>
          <tspan x="719" dy="23">
            江
          </tspan>
        </text>
      </g>
      <g fill="#9ad2f0" stroke="#fff" strokeWidth="2">
        <circle cx="448" cy="210" r="5" />
        <circle cx="558" cy="530" r="4" />
        <circle cx="1004" cy="314" r="4" />
      </g>
    </g>
  );
});
