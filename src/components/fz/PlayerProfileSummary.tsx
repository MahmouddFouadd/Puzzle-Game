import { Link } from 'react-router-dom'
import { Avatar } from '../../bakasa/ui'

/** Small greeting chip: the player's avatar and name, linking to the profile. */
export function PlayerProfileSummary({ name, avatar, ar }: { name: string; avatar: string; ar: boolean }) {
  const hour = new Date().getHours()
  const greet = ar ? (hour < 12 ? 'صباح الخير' : 'مساء الخير') : (hour < 12 ? 'Good morning' : 'Good evening')
  return (
    <Link to="/me" className="fz-focus inline-flex items-center gap-2 rounded-full bg-black/25 py-1 pe-4 ps-1">
      <Avatar avatar={avatar} size={30} />
      <span className="text-sm font-bold">{greet}{name ? (ar ? ` يا ${name}` : `, ${name}`) : ''} 👋</span>
    </Link>
  )
}
