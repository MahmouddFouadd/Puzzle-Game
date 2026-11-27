import type { ReactNode, SVGProps } from 'react'

/**
 * FRIENDS ZONE icon set: 24px grid, 2px rounded strokes, `currentColor`, no fills except small accent dots.
 * Replaces emoji as primary UI icons. Direction-sensitive icons (back/forward/next) mirror in RTL via `flipRtl`.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number; title?: string; flipRtl?: boolean }

function Icon({ size = 24, title, flipRtl, children, className = '', ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={`${flipRtl ? 'rtl:-scale-x-100' : ''} ${className}`} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} {...rest}>
      {children}
    </svg>
  )
}
const make = (paths: ReactNode, rtl = false) => (p: IconProps) => <Icon flipRtl={rtl} {...p}>{paths}</Icon>

export const IconStory = make(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /><path d="M9 8h7M9 11.5h5" /></>)
export const IconDetective = make(<><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 6 6" /><path d="M8 10.5a2.5 2.5 0 0 1 2.5-2.5" /></>)
export const IconBakasa = make(<><path d="M3 11c2.5-4 15.5-4 18 0-2.5 4-15.5 4-18 0z" /><circle cx="12" cy="11" r="2.5" /><path d="M7 17.5c1.5 1.6 3 2.5 5 2.5s3.5-.9 5-2.5" /></>)
export const IconMultiplayer = make(<><circle cx="8" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M2.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><path d="M14 14.6c2.4-.6 5.4.4 6.5 3.9" /></>)
export const IconFriends = make(<><circle cx="9" cy="7.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.2a6 6 0 0 1 3.5 5.8" /></>)
export const IconRoom = make(<><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9.5 21v-5.5h5V21" /></>)
export const IconVoice = make(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>)
export const IconMicOff = make(<><path d="M15 9.3V6a3 3 0 0 0-5.6-1.5M9 9v2a3 3 0 0 0 4.7 2.5" /><path d="M18.5 11a6.5 6.5 0 0 1-1.1 3.6M5.5 11a6.5 6.5 0 0 0 9.8 5.6M12 17.5V21M8.5 21h7M3 3l18 18" /></>)
export const IconHeadset = make(<><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>)
export const IconChallenge = make(<><path d="M6 3v18" /><path d="M6 4h11l-2.5 4L17 12H6" /></>)
export const IconLeaderboard = make(<><rect x="9" y="5" width="6" height="15" rx="1" /><rect x="2.5" y="10" width="6" height="10" rx="1" /><rect x="15.5" y="13" width="6" height="7" rx="1" /></>)
export const IconTrophy = make(<><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20h7M10 17h4" /></>)
export const IconAchievement = make(<><circle cx="12" cy="9" r="6" /><path d="m12 6 .9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z" /><path d="m8.5 14 -1.5 7 5-2.5 5 2.5-1.5-7" /></>)
export const IconResults = make(<><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>)
export const IconProfile = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>)
export const IconSettings = make(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>)
export const IconBell = make(<><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></>)
export const IconAdmin = make(<><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>)
export const IconPlay = make(<><path d="M7 4.5v15l12-7.5z" /></>, true)
export const IconPlus = make(<><path d="M12 5v14M5 12h14" /></>)
export const IconJoin = make(<><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l4-4-4-4M14 12H3" /></>, true)
export const IconBack = make(<><path d="M15 5l-7 7 7 7" /></>, true)
export const IconForward = make(<><path d="M9 5l7 7-7 7" /></>, true)
export const IconClose = make(<><path d="M6 6l12 12M18 6 6 18" /></>)
export const IconHint = make(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></>)
export const IconTimer = make(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></>)
export const IconStar = make(<><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></>)
export const IconShare = make(<><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></>)
export const IconHome = make(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>)
export const IconCheck = make(<><path d="m5 12.5 4.5 4.5L19 7.5" /></>)
export const IconLock = make(<><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>)
export const IconEvidence = make(<><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><circle cx="11.5" cy="13.5" r="2.5" /><path d="m13.3 15.3 2.2 2.2" /></>)
export const IconTimeline = make(<><path d="M6 4v16" /><circle cx="6" cy="7" r="2" /><circle cx="6" cy="17" r="2" /><path d="M11 7h9M11 12h6M11 17h9" /></>)
export const IconSearch = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>)

export const ICONS = {
  story: IconStory, detective: IconDetective, bakasa: IconBakasa, multiplayer: IconMultiplayer, friends: IconFriends, room: IconRoom,
  voice: IconVoice, micOff: IconMicOff, headset: IconHeadset, challenge: IconChallenge, leaderboard: IconLeaderboard, trophy: IconTrophy,
  achievement: IconAchievement, results: IconResults, profile: IconProfile, settings: IconSettings, bell: IconBell, admin: IconAdmin,
  play: IconPlay, plus: IconPlus, join: IconJoin, back: IconBack, forward: IconForward, close: IconClose, hint: IconHint, timer: IconTimer,
  star: IconStar, share: IconShare, home: IconHome, check: IconCheck, lock: IconLock, evidence: IconEvidence, timeline: IconTimeline, search: IconSearch
} as const
export type IconName = keyof typeof ICONS
