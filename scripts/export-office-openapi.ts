import { officeOpenApiDocument } from "../apps/server/src/office/openapi";

const target = process.argv[2] ?? "docs/office-openapi.json";
await Bun.write(target, `${JSON.stringify(officeOpenApiDocument, null, 2)}\n`);
console.log(`Office OpenAPI written to ${target}`);
