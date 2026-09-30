import { createHashRouter } from "react-router";

import { Layout } from "@/components/layout";
import { ExplorePage } from "@/pages/explore";
import { MachinePage } from "@/pages/machine";
import { NotFoundPage } from "@/pages/not-found";
import { PortfolioPage } from "@/pages/portfolio";

/**
 * Hash routing keeps every URL working from a local file server, a subpath or IPFS, with no rewrite rules.
 */
export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <ExplorePage /> },
      { path: "machine/:chainId/:address", element: <MachinePage /> },
      { path: "portfolio", element: <PortfolioPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
