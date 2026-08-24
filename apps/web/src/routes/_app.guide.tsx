import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import type { CogitoUser } from "@cogito-app/auth";

import { GuidePage } from "@/components/guide/guide-page";
import {
  GUIDE_VIEWS,
  canViewGuide,
  getDefaultGuideView,
} from "@/components/guide/guide-content";

export const Route = createFileRoute("/_app/guide")({
  validateSearch: z.object({
    view: z.enum(GUIDE_VIEWS).optional(),
  }),
  beforeLoad: ({ context, search }) => {
    const user = context.session.data?.user as CogitoUser | undefined;

    if (search.view && !canViewGuide(user?.role, search.view)) {
      throw redirect({
        to: "/guide",
        search: { view: getDefaultGuideView(user?.role) },
      });
    }
  },
  component: GuideRoute,
});

function GuideRoute() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const user = session.data?.user as CogitoUser | undefined;

  return <GuidePage role={user?.role} requestedView={search.view} />;
}
