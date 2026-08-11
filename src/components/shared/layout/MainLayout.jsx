import { Outlet } from "react-router-dom";
import AppFooter from "./AppFooter";
import AppNotifier from "../ui/AppNotifier";

// This layout provides the standard Navbar and Footer for public-facing pages.
export default function MainLayout() {
  return (
    <>
      <AppNotifier />
      <main className="">
        <Outlet /> 
      </main>
      <AppFooter />
    </>
  );
}