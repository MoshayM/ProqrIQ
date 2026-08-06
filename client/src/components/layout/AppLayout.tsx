import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

/**
 * Route-based layout that renders the Sidebar and the matched child route via <Outlet />.
 * Use this as the element for your root authenticated route in the router config.
 */
export function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-64 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
