import { expect, test } from "bun:test";
import { officeOpenApiPaths, officeActionNames } from "./openapi";
test("OpenAPI exposes snapshot and only approved action names", () => {
  expect(officeOpenApiPaths["/office/snapshot"].get.security).toEqual([
    { officeRead: [] },
  ]);
  expect(officeActionNames).toHaveLength(11);
  expect(
    officeActionNames.some((name) =>
      /delete|refund|payout|wallet|pricing/.test(name),
    ),
  ).toBe(false);
});

test("every concrete action has its runtime input schema and a typed response", () => {
  const paths = JSON.parse(JSON.stringify(officeOpenApiPaths));
  for (const name of officeActionNames) {
    const operation = paths[`/office/actions/${name}`].post;
    const input = operation.requestBody.content["application/json"].schema;
    expect(input.properties.input.properties).toBeDefined();
    expect(input.properties.idempotencyKey.format).toBe("uuid");
    expect(
      operation.responses[200].content["application/json"].schema.properties
        .result.properties,
    ).toBeDefined();
  }
  const schema =
    paths["/office/actions/referrals.createKolCampaign"].post.requestBody
      .content["application/json"].schema;
  expect(schema.properties.input.properties.expiresAt).toMatchObject({
    type: "string",
    format: "date-time",
  });
  expect(
    paths["/office/snapshot"].get.responses[200].content["application/json"]
      .schema.properties.referenceData,
  ).toBeDefined();
});

test("portable Office spec matches generated source without credentials", async () => {
  const { officeOpenApiDocument } = await import("./openapi");
  const file = await Bun.file(
    new URL("../../../../docs/office-openapi.json", import.meta.url),
  ).json();
  expect(file).toEqual(officeOpenApiDocument);
  expect(file.servers).toEqual([{ url: "https://api.cogitoacademy.id" }]);
  expect(file.paths["/office/snapshot"].servers).toBeUndefined();
});
