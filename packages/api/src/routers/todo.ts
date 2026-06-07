import { db } from "@cogito-app/db";
import { todo } from "@cogito-app/db/schema/todo";
import { eq } from "drizzle-orm";
import z from "zod";

import { publicProcedure } from "../index";

export const todoRouter = {
  getAll: publicProcedure
    .route({
      method: "POST",
      path: "/todos/list",
      tags: ["Todos"],
      summary: "List todos",
      description: "Returns all todos",
    })
    .handler(async () => {
    return await db.select().from(todo);
  }),

  create: publicProcedure
    .route({
      method: "POST",
      path: "/todos/create",
      tags: ["Todos"],
      summary: "Create todo",
      description: "Creates a todo",
    })
    .input(z.object({ text: z.string().min(1) }))
    .handler(async ({ input }) => {
      return await db.insert(todo).values({
        text: input.text,
      });
    }),

  toggle: publicProcedure
    .route({
      method: "POST",
      path: "/todos/toggle",
      tags: ["Todos"],
      summary: "Toggle todo",
      description: "Updates a todo completion state",
    })
    .input(z.object({ id: z.number(), completed: z.boolean() }))
    .handler(async ({ input }) => {
      return await db.update(todo).set({ completed: input.completed }).where(eq(todo.id, input.id));
    }),

  delete: publicProcedure
    .route({
      method: "POST",
      path: "/todos/delete",
      tags: ["Todos"],
      summary: "Delete todo",
      description: "Deletes a todo",
    })
    .input(z.object({ id: z.number() })).handler(async ({ input }) => {
    return await db.delete(todo).where(eq(todo.id, input.id));
  }),
};
