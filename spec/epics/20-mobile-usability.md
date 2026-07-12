## Epic 20: Mobile Usability

### US-20.1 — Mobile Navigation

**As a** user on a mobile device,
**I want to** navigate the site in a usable way,
**so that** I can browse, bid, and manage my account without needing a desktop.

**Acceptance Criteria:**
- The navigation bar collapses into a hamburger menu on small screens (below `sm` breakpoint).
- All nav links (Browse, Auctions, Prints, My Bids, Settings, Listings, Admin, Sign in/out) are accessible from the mobile menu.
- The mobile menu opens and closes smoothly and can be dismissed by tapping outside it or pressing Escape.
- The mobile menu has an animation when opening based off of this codepen example https://codepen.io/alvarotrigo/pen/LYQNMOb, but using the thematic web-colors of the site. 
- The site logo remains visible and links to the home page on all screen sizes.
- Touch targets (buttons, links) are at least 44×44px on mobile.
- No horizontal overflow or content clipped by the viewport on any core page (browse, artwork detail, checkout, dashboards, settings).
