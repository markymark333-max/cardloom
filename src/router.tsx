import { createRouter, createRootRoute, createRoute, Outlet } from '@tanstack/react-router'
import { RootLayout } from './layouts/RootLayout'
import { IndexPage } from './pages/IndexPage'
import { MarketplacePage } from './pages/MarketplacePage'
import { VaultPage } from './pages/VaultPage'
import { VaultDetailPage } from './pages/VaultDetailPage'
import { PortalPage } from './pages/PortalPage'
import { SellPage } from './pages/SellPage'
import { ExplorePage } from './pages/ExplorePage'
import { MembershipPage } from './pages/MembershipPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ListingPage } from './pages/ListingPage'

// Root route — renders the shared layout with Outlet for child routes
const rootRoute = createRootRoute({
  component: () => (
    <RootLayout>
      <Outlet />
    </RootLayout>
  ),
  notFoundComponent: NotFoundPage,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
})

const marketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/marketplace',
  component: MarketplacePage,
})

const listingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/marketplace/$listingId',
  component: ListingPage,
})

const vaultRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vault',
  component: VaultPage,
})

const vaultDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vault/$id',
  component: VaultDetailPage,
})

const portalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portal',
  component: PortalPage,
})

const sellRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sell',
  component: SellPage,
})

const exploreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore',
  component: ExplorePage,
})

const membershipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/membership',
  component: MembershipPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  marketplaceRoute,
  listingRoute,
  vaultRoute,
  vaultDetailRoute,
  portalRoute,
  sellRoute,
  exploreRoute,
  membershipRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
