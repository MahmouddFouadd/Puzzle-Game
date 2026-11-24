import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { isConfigured } from './lib/supabase'
import { useI18n } from './lib/i18n'
import Login from './pages/Login'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import PuzzleLab from './pages/admin/PuzzleLab'
import Stories from './pages/admin/Stories'
import StoryEditor from './pages/admin/StoryEditor'
import QuestionBank from './pages/admin/QuestionBank'
import Assignments from './pages/admin/Assignments'
import PublishPanel from './pages/admin/PublishPanel'
import RulesPanel from './pages/admin/RulesPanel'
import Rooms from './pages/admin/Rooms'
import RoomControl from './pages/admin/RoomControl'
import Join from './pages/Join'
import Lobby from './pages/Lobby'
import Users from './pages/admin/Users'
import Reports from './pages/admin/Reports'
import PlatformSettings from './pages/admin/PlatformSettings'

export default function App() {
  const { t } = useI18n()
  if (!isConfigured) return <p className="p-6 text-danger" role="alert">{t('configMissing')}</p>
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/join" element={<Join />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/play/:roomId" element={<Lobby />} />
      <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
        <Route index element={<RequireAuth permission="report.view"><Dashboard /></RequireAuth>} />
        <Route path="stories" element={<RequireAuth permission="story.manage"><Stories /></RequireAuth>} />
        <Route path="stories/:id" element={<RequireAuth permission="story.manage"><StoryEditor /></RequireAuth>} />
        <Route path="stories/:id/questions" element={<RequireAuth permission="story.manage"><QuestionBank /></RequireAuth>} />
        <Route path="stories/:id/assign" element={<RequireAuth permission="story.manage"><Assignments /></RequireAuth>} />
        <Route path="stories/:id/rules" element={<RequireAuth permission="story.manage"><RulesPanel /></RequireAuth>} />
        <Route path="stories/:id/publish" element={<RequireAuth permission="story.manage"><PublishPanel /></RequireAuth>} />
        <Route path="rooms/:id" element={<RequireAuth permission="room.manage"><RoomControl /></RequireAuth>} />
        <Route path="puzzle-lab" element={<RequireAuth permission="story.manage"><PuzzleLab /></RequireAuth>} />
        <Route path="rooms" element={<RequireAuth permission="room.manage"><Rooms /></RequireAuth>} />
        <Route path="users" element={<RequireAuth permission="user.manage"><Users /></RequireAuth>} />
        <Route path="reports" element={<RequireAuth permission="report.view"><Reports /></RequireAuth>} />
        <Route path="settings" element={<RequireAuth permission="*"><PlatformSettings /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/join" replace />} />
    </Routes>
  )
}
