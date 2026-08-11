import { Outlet } from "react-router-dom";
import AppNotifier from "../ui/AppNotifier";

export default function AuthLayout() {
  return (
    <>
      {/* Notifier handles Toast messages (Success/Error alerts) */}
      <AppNotifier />
      
      <main className="w-100 h-100 p-0 m-0">
        {/* This renders the Login Page content (which handles its own layout) */}
        <Outlet />
      </main>
    </>
  );
}