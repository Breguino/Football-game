/**
 * Settings content, as data. Rows carry their own description so the detail
 * panel can render whatever is focused without a lookup table.
 */

export type SettingRow =
  | { kind: 'cycler'; id: string; label: string; options: string[]; value: number; body: string }
  | {
      kind: 'slider';
      id: string;
      label: string;
      /** Lowest selectable value. Defaults to 0. */
      min?: number;
      max: number;
      value: number;
      body: string;
    }
  | { kind: 'action'; id: string; label: string; value: string; body: string };

export interface SettingSection {
  id: string;
  title: string;
  rows: SettingRow[];
}

export interface SettingsTab {
  id: string;
  label: string;
  sections: SettingSection[];
}

export const SETTINGS_TABS: SettingsTab[] = [
  {
    id: 'gameplay',
    label: 'Game Type Settings',
    sections: [
      {
        id: 'match',
        title: 'Match Setup',
        rows: [
          {
            kind: 'cycler',
            id: 'difficulty',
            label: 'Difficulty',
            options: ['Beginner', 'Amateur', 'Semi-Pro', 'Professional', 'World Class', 'Legendary'],
            value: 3,
            body: 'How sharply the CPU presses, closes passing lanes, and punishes a loose first touch.',
          },
          {
            kind: 'slider',
            id: 'halfLength',
            label: 'Half Length',
            // A zero-minute half is over before it starts, and the clock reads
            // its progress as a fraction of the half — which at zero is NaN.
            min: 1,
            max: 20,
            value: 6,
            body: 'Minutes per half. Six is the competitive default; longer halves give the simulation room to produce a real shape to the game.',
          },
          {
            kind: 'cycler',
            id: 'speed',
            label: 'Game Speed',
            options: ['Slow', 'Normal', 'Fast'],
            value: 1,
            body: 'Global tempo multiplier applied to player movement and ball travel.',
          },
          {
            kind: 'cycler',
            id: 'preset',
            label: 'Gameplay Preset',
            options: ['Competitive', 'Authentic'],
            value: 0,
            body: 'Competitive sharpens responsiveness and rewards manual input. Authentic weights physics and player attributes more heavily.',
          },
        ],
      },
      {
        id: 'assists',
        title: 'Assistance',
        rows: [
          {
            kind: 'cycler',
            id: 'passAssist',
            label: 'Pass Assistance',
            options: ['Manual', 'Semi', 'Assisted'],
            value: 2,
            body: 'How much the game corrects your intended pass toward the nearest sensible receiver.',
          },
          {
            kind: 'cycler',
            id: 'shotAssist',
            label: 'Shot Assistance',
            options: ['Manual', 'Semi', 'Assisted'],
            value: 1,
            body: 'Manual shooting gives you the whole goalmouth and none of the help.',
          },
        ],
      },
    ],
  },
  {
    id: 'camera',
    label: 'Camera',
    sections: [
      {
        id: 'options',
        title: 'Camera Options',
        rows: [
          {
            kind: 'cycler',
            id: 'singleCam',
            label: 'Single Player Camera',
            options: ['Tele', 'Tele Broadcast', 'Co-op', 'Tactical', 'Pro'],
            value: 1,
            body: 'The camera used for single player matches. Tele Broadcast sits pitch-side on a long lens and gives the closest thing to a live match feel.',
          },
          {
            kind: 'cycler',
            id: 'multiCam',
            label: 'Multiplayer Camera',
            options: ['Tele', 'Tele Broadcast', 'Co-op', 'Tactical'],
            value: 3,
            body: 'This is the camera used for all local multiplayer matches.',
          },
          {
            kind: 'cycler',
            id: 'powerShotZoom',
            label: 'Power Shot Zoom',
            options: ['Off', 'On'],
            value: 1,
            body: 'Punches the camera in and drops the field of view when a power shot is struck.',
          },
        ],
      },
      {
        id: 'customization',
        title: 'Camera Customization',
        rows: [
          {
            kind: 'slider',
            id: 'height',
            label: 'Height',
            max: 20,
            value: 20,
            body: 'Raises the camera. Higher reads passing lanes better; lower reads the ball better.',
          },
          {
            kind: 'slider',
            id: 'zoom',
            label: 'Zoom',
            max: 20,
            value: 0,
            body: 'Adjust the zoom of the in game camera. Does not apply to Pro Camera.',
          },
          {
            kind: 'slider',
            id: 'swing',
            label: 'Camera Swing',
            max: 20,
            value: 10,
            body: 'How far the camera drifts laterally to lead the ball.',
          },
        ],
      },
    ],
  },
  {
    id: 'visual',
    label: 'Visual',
    sections: [
      {
        id: 'hud',
        title: 'On-Screen Display',
        rows: [
          {
            kind: 'cycler',
            id: 'scoreClock',
            label: 'Score Clock',
            options: ['Off', 'On'],
            value: 1,
            body: 'The broadcast scoreboard in the top corner. Turning it off hides the clock as well.',
          },
          {
            kind: 'cycler',
            id: 'scoreDropdown',
            label: 'Score Clock Dropdown',
            options: ['Off', 'On'],
            value: 1,
            body: 'The chip beneath the clock carrying competition and sponsor information.',
          },
          {
            kind: 'cycler',
            id: 'radar',
            label: 'Radar',
            options: ['Off', '2D', '3D'],
            value: 1,
            body: 'The overhead player map at the foot of the screen.',
          },
          {
            kind: 'cycler',
            id: 'indicatorFade',
            label: 'Player Indicator Fade',
            options: ['Off', 'On'],
            value: 1,
            body: 'When on, the indicator above your active player gradually fades as stamina is depleted.',
          },
          {
            kind: 'cycler',
            id: 'playerNames',
            label: 'Player Name Bars',
            options: ['Off', 'On'],
            value: 1,
            body: 'Name, number, stamina and skill ratings for both active players.',
          },
        ],
      },
      {
        id: 'render',
        title: 'Presentation',
        rows: [
          {
            kind: 'slider',
            id: 'grain',
            label: 'Film Grain',
            max: 20,
            value: 6,
            body: 'Broadcast footage is never clean. A little grain sells the camera.',
          },
          {
            kind: 'slider',
            id: 'dof',
            label: 'Depth of Field',
            max: 20,
            value: 13,
            body: 'How aggressively the foreground and crowd fall out of focus. This single setting does most of the work in making the pitch read as televised.',
          },
          {
            kind: 'cycler',
            id: 'timeOfDay',
            label: 'Time of Day',
            options: ['Day', 'Dusk', 'Night'],
            value: 2,
            body: 'Night brings the floodlight rig up and cools the whole grade.',
          },
        ],
      },
    ],
  },
  {
    id: 'controls',
    label: 'Controls',
    sections: [
      {
        id: 'glyphs',
        title: 'Input',
        rows: [
          {
            kind: 'cycler',
            id: 'glyphSet',
            label: 'Button Glyphs',
            options: ['PlayStation', 'Xbox', 'Keyboard'],
            value: 0,
            body: 'Which button icons the interface draws. Detected automatically when a controller is connected.',
          },
          {
            kind: 'cycler',
            id: 'vibration',
            label: 'Vibration',
            options: ['Off', 'On'],
            value: 1,
            body: 'Rumble on tackles, woodwork and goals.',
          },
        ],
      },
    ],
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    sections: [
      {
        id: 'a11y',
        title: 'Accessibility',
        rows: [
          {
            kind: 'cycler',
            id: 'reducedMotion',
            label: 'Reduced Motion',
            options: ['Off', 'On'],
            value: 0,
            body: 'Removes the iridescent sweep, screen pushes and camera shake. Also honoured automatically from your system setting.',
          },
          {
            kind: 'cycler',
            id: 'colourBlind',
            label: 'Colour Blind Mode',
            options: ['Off', 'Deuteranopia', 'Protanopia', 'Tritanopia'],
            value: 0,
            body: 'Re-maps team and radar colours to remain distinguishable.',
          },
          {
            kind: 'slider',
            id: 'uiScale',
            label: 'Interface Scale',
            max: 20,
            value: 10,
            body: 'Scales every interface element. The layout is specified at 1080p and scales linearly from there.',
          },
        ],
      },
    ],
  },
];

export function rowValueText(row: SettingRow): string {
  if (row.kind === 'cycler') return row.options[row.value] ?? '—';
  if (row.kind === 'slider') return String(row.value);
  return row.value;
}
