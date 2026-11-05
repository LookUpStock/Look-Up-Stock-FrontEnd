import { hasManagementRole } from "./auth.js";

export function addDashboardNavigationLink(root, session, currentPage) {
  if (session?.status !== "valid" || !hasManagementRole(session)) {
    return null;
  }

  const nav = root.querySelector(".main-nav");
  if (!nav) return null;

  const link = root.createElement("a");
  link.href = "dashboard.html";
  link.className = "nav-link";
  link.textContent = "Auswertungen";
  if (currentPage === "dashboard.html") link.classList.add("active");
  nav.insertBefore(link, root.getElementById("auth-status"));
  return link;
}
