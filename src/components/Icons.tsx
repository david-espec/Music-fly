import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5v15l13-7.5-13-7.5z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.3" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.3" fill="currentColor" stroke="none" />
  </Icon>
);

export const NextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 5.5v13l10-6.5-10-6.5z" fill="currentColor" stroke="none" />
    <rect x="17" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" stroke="none" />
  </Icon>
);

export const PrevIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 5.5v13L8 12l10-6.5z" fill="currentColor" stroke="none" />
    <rect x="4.4" y="5" width="2.6" height="14" rx="1.3" fill="currentColor" stroke="none" />
  </Icon>
);

export const ShuffleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 4l3 3-3 3M16 14l3 3-3 3" />
    <path d="M19 7h-3.2a4 4 0 00-3.3 1.7l-4 5.6A4 4 0 015.2 16H3" />
    <path d="M3 7h2.2a4 4 0 013.3 1.7l.6.8M14.5 14.5l.6.8A4 4 0 0018.4 17H19" />
  </Icon>
);

export const RepeatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 2l3 3-3 3" />
    <path d="M20 5H7a4 4 0 00-4 4v1" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M4 19h13a4 4 0 004-4v-1" />
  </Icon>
);

export const RepeatOneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 2l3 3-3 3" />
    <path d="M20 5H7a4 4 0 00-4 4v1" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M4 19h13a4 4 0 004-4v-1" />
    <path d="M11 10.5l1.5-1v5" />
  </Icon>
);

export const VolumeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3l4.5-3.6v12.2L7 14.5H4z" fill="currentColor" stroke="none" />
    <path d="M15.5 9.2a4 4 0 010 5.6M18.2 6.5a8 8 0 010 11" />
  </Icon>
);

export const MuteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3l4.5-3.6v12.2L7 14.5H4z" fill="currentColor" stroke="none" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Icon>
);

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10.4L12 3.8l8.5 6.6" />
    <path d="M5.6 9v10.2a1 1 0 001 1h10.8a1 1 0 001-1V9" />
    <path d="M9.8 20.2v-6h4.4v6" />
  </Icon>
);

export const LyricsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5h11M4 10h11M4 14.5h7" />
    <path d="M20 4v9.2" />
    <ellipse cx="18" cy="15.4" rx="2.3" ry="2" fill="currentColor" stroke="none" />
  </Icon>
);

export const LibraryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4.5h2.5v15H4zM9 4.5h2.5v15H9z" />
    <path d="M15.2 5.2l2.4-.6 3.4 13.6-2.4.6z" />
  </Icon>
);

export const PlaylistIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h11M4 12h11M4 17h7" />
    <circle cx="18" cy="16.5" r="2.5" />
    <path d="M20.5 16.5V9l-2.5.8" />
  </Icon>
);

export const CompassIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2 5.2-2z" fill="currentColor" stroke="none" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8v.2" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4.2L19 9.2a2.1 2.1 0 00-3-3L5.2 17z" />
    <path d="M14.6 6.8l2.6 2.6" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.2h5v2.3" />
    <path d="M6.5 6.5l.9 13a1.5 1.5 0 001.5 1.4h6.2a1.5 1.5 0 001.5-1.4l.9-13" />
    <path d="M10.3 10.5v6.5M13.7 10.5v6.5" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5v11M8 11l4 4 4-4" />
    <path d="M4.5 17v2.2a1.3 1.3 0 001.3 1.3h12.4a1.3 1.3 0 001.3-1.3V17" />
  </Icon>
);

export const CloudIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 18.5a4 4 0 01-.4-8A5.5 5.5 0 0117.4 9.6 3.9 3.9 0 0117 18.5z" />
  </Icon>
);

export const OfflineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20.2l-.02.02" />
    <path d="M2 8.8a15 15 0 0120 0M5.5 12.4a10 10 0 0113 0M8.9 16a5 5 0 016.2 0" />
    <path d="M3 3l18 18" />
  </Icon>
);

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="5.5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
);

export const QueueIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5h12M4 11h12M4 15.5h8" />
    <path d="M19 8v9M15.5 12.5h7" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
);

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6.8A1.8 1.8 0 015.3 5h3.4l2 2.4h8A1.8 1.8 0 0120.5 9.2v8A1.8 1.8 0 0118.7 19H5.3a1.8 1.8 0 01-1.8-1.8z" />
  </Icon>
);

export const MusicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18V5.5l11-2v12" />
    <ellipse cx="6.5" cy="18" rx="2.6" ry="2.2" fill="currentColor" stroke="none" />
    <ellipse cx="17.4" cy="15.5" rx="2.6" ry="2.2" fill="currentColor" stroke="none" />
  </Icon>
);
