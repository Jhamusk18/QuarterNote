import { NavLink } from 'react-router-dom'
import { Bell, Search, User } from 'lucide-react'

const TABS = [
  { to: '/updates', label: 'Updates', Icon: Bell },
  { to: '/research', label: 'Research', Icon: Search },
  { to: '/profile', label: 'Profile', Icon: User },
]

export default function TabBar() {
  return (
    <nav aria-label="Main" className="shrink-0 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="relative flex flex-col items-center gap-1 pt-2.5 pb-2.5">
            {({ isActive }) => (
              <>
                <Icon size={24} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? 'text-emerald' : 'text-slate2'} />
                <span className={`text-[12px] font-semibold ${isActive ? 'text-emerald' : 'text-slate2'}`}>{label}</span>
                {isActive && <span className="absolute bottom-0 h-[3px] w-16 rounded-full bg-emerald" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
