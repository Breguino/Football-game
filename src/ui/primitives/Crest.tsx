import { useId } from 'react';
import { devicePath, divisionPath, shieldPath } from '@/world/crest';
import type { Club } from '@/world/generate';

/**
 * A generated club crest, drawn as SVG so the same mark serves a 14px radar
 * dot and a full-screen team sheet without a second asset.
 */
export function Crest({ club, size = 48 }: { club: Club; size?: number }) {
  const id = useId();
  const clip = `crest-clip-${id}`;
  const { crest, colours, name } = club;
  const shield = shieldPath(crest.shape);
  const division = divisionPath(crest.division);

  return (
    <svg
      width={size}
      height={size * 1.16}
      viewBox="0 0 100 120"
      role="img"
      aria-label={`${name} crest`}
      style={{ flex: '0 0 auto', overflow: 'visible' }}
    >
      <defs>
        <clipPath id={clip}>
          <path d={shield} />
        </clipPath>
      </defs>

      <path d={shield} fill={colours.primary} />

      {division && (
        <g clipPath={`url(#${clip})`}>
          <path d={division} fill={colours.secondary} opacity={0.92} />
        </g>
      )}

      <path
        d={devicePath(crest.device)}
        fill={crest.device === 'wheel' || crest.device === 'anchor' ? 'none' : colours.ink}
        stroke={colours.ink}
        strokeWidth={crest.device === 'wheel' || crest.device === 'anchor' ? 3.4 : 0}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.94}
        transform={crest.banner ? 'translate(0,-8) scale(0.88) translate(6.8,0)' : ''}
      />

      {crest.banner && (
        <g>
          <path d="M18 88 H82 L76 102 H24 Z" fill={colours.ink} opacity={0.9} />
          <text
            x="50"
            y="99"
            textAnchor="middle"
            fill={colours.primary}
            fontFamily="var(--font-data)"
            fontWeight="800"
            fontSize="13"
            letterSpacing="1.4"
          >
            {crest.initials}
          </text>
        </g>
      )}

      <path
        d={shield}
        fill="none"
        stroke={colours.ink}
        strokeWidth={2.6}
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}
