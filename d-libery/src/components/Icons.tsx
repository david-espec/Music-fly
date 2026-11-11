import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: React.ReactNode, filled = false) {
  return function Icon({ size = 22, ...rest }: P) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" {...rest}>
        {paths}
      </svg>
    );
  };
}

export const IconBook = make(<><path d="M2 5.5C4.5 4 7.5 4 12 6c4.5-2 7.5-2 10-.5V19c-2.5-1.5-5.5-1.5-10 .5-4.5-2-7.5-2-10-.5Z" /><path d="M12 6v13.5" /></>);
export const IconLibrary = make(<><path d="M3 21h18" /><path d="M4.5 21V5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V21" /><path d="M8.5 21V8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v13" /><path d="m14 6.6 2-.5a1 1 0 0 1 1.2.7l3.3 13.6" /></>);
export const IconHome = make(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />, true);
export const IconHomeOutline = make(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />);
export const IconSearch = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconChart = make(<path d="M5 20V12M10 20V5M15 20v-9M20 20v-5" />);
export const IconUser = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>);
export const IconSettings = make(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const IconBack = make(<path d="m15 18-6-6 6-6" />);
export const IconNext = make(<path d="m9 18 6-6-6-6" />);
export const IconDown = make(<path d="m6 9 6 6 6-6" />);
export const IconHeart = make(<path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.2 3.8 4 7.1 4c2 0 3.5 1.1 4.9 2.8C13.4 5.1 14.9 4 16.9 4c3.3 0 5.5 3.2 4.3 6.7C19.5 15.4 12 20 12 20Z" />);
export const IconHeartFill = make(<path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.2 3.8 4 7.1 4c2 0 3.5 1.1 4.9 2.8C13.4 5.1 14.9 4 16.9 4c3.3 0 5.5 3.2 4.3 6.7C19.5 15.4 12 20 12 20Z" />, true);
export const IconShare = make(<><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>);
export const IconCamera = make(<><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><circle cx="12" cy="13" r="3.5" /></>);
export const IconImage = make(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 9" /></>);
export const IconFlip = make(<><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>);
export const IconFlash = make(<path d="M13 2 4 14h7l-1 8 9-12h-7Z" />);
export const IconFlashOff = make(<><path d="M13 2 9.5 6.7M16 10h3l-3.8 5M10.4 14H4l3-4M11 14l-1 8 3.4-4.6" /><path d="m3 3 18 18" /></>);
export const IconClose = make(<path d="M18 6 6 18M6 6l12 12" />);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7" />);
export const IconStar = make(<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" />, true);
export const IconStarOutline = make(<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" />);
export const IconEdit = make(<><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>);
export const IconTrash = make(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>);
export const IconBookmark = make(<path d="M6 3h12v18l-6-4-6 4Z" />, true);
export const IconCalendar = make(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const IconPages = make(<><path d="M7 3h7l5 5v13H7Z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>);
export const IconPublisher = make(<><path d="M3 21h18M5 21V10l7-5 7 5v11" /><path d="M9 21v-6h6v6" /></>);
export const IconBarcode = make(<path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14" />);
export const IconTag = make(<><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z" /><circle cx="7.5" cy="7.5" r="1.3" /></>);
export const IconExternal = make(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>);
export const IconMoon = make(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />);
export const IconInfo = make(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const IconDownload = make(<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>);
export const IconUpload = make(<><path d="M12 15V4M7 9l5-5 5 5" /><path d="M5 20h14" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconTrophy = make(<><path d="M8 4h8v6a4 4 0 0 1-8 0Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 14v3M8 21h8M9 17h6v4H9Z" /></>);
export const IconSort = make(<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />);
export const IconKey = make(<><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3" /></>);
export const IconTarget = make(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>);
export const IconSparkle = make(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />);
export const IconPen = make(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>);
