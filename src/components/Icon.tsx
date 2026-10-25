import type { ReactNode } from 'react'

type IconName = 'search' | 'image' | 'file-search' | 'file' | 'check'

const paths: Record<IconName, ReactNode> = {
  search: <><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-6 5 5 7-7" /></>,
  'file-search': <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M13 3l5 5m-5-5v5h5v3" /><circle cx="16" cy="16" r="4" /><path d="m19 19 3 3" /></>,
  file: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10l-7-7Z" /><path d="M13 3v7h7" /></>,
  check: <path d="m5 12 4 4L19 6" />,
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  )
}

export default Icon
