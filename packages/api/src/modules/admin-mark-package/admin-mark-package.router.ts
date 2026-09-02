import { adminProcedure } from "../../procedures";
import {
  createMarkPackageInput,
  setMarkPackageActiveInput,
  updateMarkPackageInput,
} from "./admin-mark-package.types";
import type { AdminMarkPackageHandler } from "./admin-mark-package.handler";

export function createAdminMarkPackageRouter(handler: AdminMarkPackageHandler) {
  return {
    list: adminProcedure
      .route({
        method: "POST",
        path: "/admin/mark-packages/list",
        tags: ["Admin Mark Packages"],
        summary: "List mark packages",
        description: "Returns all mark packages, including inactive packages",
      })
      .handler(handler.list),

    create: adminProcedure
      .route({
        method: "POST",
        path: "/admin/mark-packages/create",
        tags: ["Admin Mark Packages"],
        summary: "Create mark package",
        description: "Creates a purchasable mark package",
      })
      .input(createMarkPackageInput)
      .handler(handler.create),

    update: adminProcedure
      .route({
        method: "POST",
        path: "/admin/mark-packages/update",
        tags: ["Admin Mark Packages"],
        summary: "Update mark package",
        description: "Updates package name, Marks, or IDR price",
      })
      .input(updateMarkPackageInput)
      .handler(handler.update),

    setActive: adminProcedure
      .route({
        method: "POST",
        path: "/admin/mark-packages/set-active",
        tags: ["Admin Mark Packages"],
        summary: "Activate or deactivate mark package",
        description: "Controls whether a package is available for purchase",
      })
      .input(setMarkPackageActiveInput)
      .handler(handler.setActive),
  };
}
