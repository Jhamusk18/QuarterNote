import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Splash from './screens/Splash'
import Push from './screens/Push'
import Pull from './screens/Pull'
import Profile from './screens/Profile'
import TabBar from './components/TabBar'
import ThresholdsSheet from './screens/ThresholdsSheet'
import { AppProvider } from './lib/ctx'

function Frame({ children }) {
  return (
    <div className="min-h-[100dvh] w-full md:flex md:items-center md:justify-center md:py-6">
      <div id="phone" className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-offwhite md:h-[min(920px,calc(100dvh-48px))] md:rounded-[34px] md:border md:border-line md:shadow-2xl">
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const loc = useLocation()
  const showTabs = loc.pathname !== '/'
  return (
    <AppProvider>
      <Frame>
        <div className="relative flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Splash />} />
            <Route path="/updates" element={<Push />} />
            <Route path="/research" element={<Pull />} />
            <Route path="/push" element={<Navigate to="/updates" replace />} />
            <Route path="/pull" element={<Navigate to="/research" replace />} />
            <Route path="/profile/*" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {showTabs && <TabBar />}
        <ThresholdsSheet />
      </Frame>
    </AppProvider>
  )
}
