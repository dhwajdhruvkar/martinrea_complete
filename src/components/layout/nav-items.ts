import {
  LayoutDashboard,
  FileText,
  ScanLine,
  FileSearch,
  GitMerge,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Store,
  Search,
  BarChart3,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types/user';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /**
   * True once the page is navigable. Every module is now reachable as a
   * testing scaffold (no dummy data) while its backend endpoint is wired up.
   */
  available: boolean;
  /**
   * Roles allowed to see and open this tab. Omit to make the tab visible to
   * every authenticated role. Tweak these arrays to change who sees what.
   */
  roles?: Role[];
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

// Convenience groupings, anchored to the backend permission matrix + role profiles.
const ALL_ROLES: Role[] = ['AP_Clerk', 'Plant_Manager', 'Finance_Director', 'VP_Finance'];
const APPROVERS: Role[] = ['Plant_Manager', 'Finance_Director', 'VP_Finance'];
const FINANCE: Role[] = ['Finance_Director', 'VP_Finance'];
const CAPTURE: Role[] = ['AP_Clerk', 'Finance_Director']; // create/edit-capable roles
/** Roles that work invoices hands-on (capture + plant-level approval). */
const OPERATIONS: Role[] = ['AP_Clerk', 'Plant_Manager', 'Finance_Director'];

/**
 * Every tab declares an explicit `roles` allow-list — a person sees ONLY the
 * tabs assigned to their role:
 *
 *   Tab                 AP_Clerk  Plant_Manager  Finance_Director  VP_Finance
 *   Dashboard              ✓           ✓               ✓               ✓
 *   Invoice Processing     ✓           ✓               ✓               ✓
 *   OCR Validation         ✓           —               ✓               —
 *   Document Viewer        ✓           ✓               ✓               —
 *   2/3-Way Match          ✓           —               ✓               —
 *   Approval Workflow      —           ✓               ✓               ✓
 *   Exceptions             ✓           ✓               ✓               —
 *   Payment Packages       ✓           —               ✓               —
 *   Vendor Portal          ✓           —               ✓               —
 *   Repository Search      ✓           ✓               ✓               ✓
 *   Analytics              —           ✓               ✓               ✓
 *   Audit Logs             —           —               ✓               ✓
 *   Admin Panel            —           —               ✓               —
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Workspace',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, available: true, roles: ALL_ROLES },
      { label: 'Invoice Processing', to: '/invoices', icon: FileText, available: true, roles: ALL_ROLES },
      { label: 'OCR Validation', to: '/ocr', icon: ScanLine, available: true, roles: CAPTURE },
      { label: 'Document Viewer', to: '/documents', icon: FileSearch, available: true, roles: OPERATIONS },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: '2-Way / 3-Way Match', to: '/match', icon: GitMerge, available: true, roles: CAPTURE },
      { label: 'Approval Workflow', to: '/approvals', icon: CheckCircle2, available: true, roles: APPROVERS },
      { label: 'Exceptions', to: '/exceptions', icon: AlertTriangle, available: true, roles: OPERATIONS },
      { label: 'Payment Packages', to: '/payments', icon: CreditCard, available: true, roles: CAPTURE },
    ],
  },
  {
    heading: 'Insight',
    items: [
      { label: 'Vendor Portal', to: '/vendors', icon: Store, available: true, roles: CAPTURE },
      { label: 'Repository Search', to: '/search', icon: Search, available: true, roles: ALL_ROLES },
      { label: 'Analytics', to: '/analytics', icon: BarChart3, available: true, roles: APPROVERS },
      { label: 'Audit Logs', to: '/audit', icon: ScrollText, available: true, roles: FINANCE },
    ],
  },
  {
    heading: 'System',
    items: [
      { label: 'Admin Panel', to: '/admin', icon: Settings, available: true, roles: ['Finance_Director'] },
    ],
  },
];

/** True if `role` may see/open this nav item. Items with no `roles` are open to all. */
export function navItemAllowed(item: NavItem, role: Role | null | undefined): boolean {
  if (!item.roles) return true;
  if (!role) return false;
  return item.roles.includes(role);
}

/** Nav sections filtered to what `role` can access, dropping any now-empty section. */
export function visibleSections(role: Role | null | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => navItemAllowed(item, role)),
  })).filter((section) => section.items.length > 0);
}

/**
 * Whether `role` may access the route at `path`. Paths that don't map to a nav
 * item (e.g. `/invoices/:id`, `/login`) are always allowed.
 */
export function canAccessPath(path: string, role: Role | null | undefined): boolean {
  const item = NAV_SECTIONS.flatMap((s) => s.items).find((i) => path.startsWith(i.to));
  if (!item) return true;
  return navItemAllowed(item, role);
}
