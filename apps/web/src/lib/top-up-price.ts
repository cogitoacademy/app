export function previewTopUpPrice(
  marks: number,
  packages: { marks: number; priceIdr: number }[],
  surcharge: number,
) {
  if (!Number.isInteger(marks) || marks < 1 || marks > 1_000_000) return null;
  const exact = packages.find((pkg) => pkg.marks === marks);
  const tier = packages.findLast((pkg) => pkg.marks <= marks) ?? packages[0];
  if (!tier) return null;
  return (
    exact?.priceIdr ??
    Number(
      (BigInt(marks) * BigInt(tier.priceIdr) + BigInt(tier.marks) - 1n) /
        BigInt(tier.marks) +
        BigInt(marks) * BigInt(surcharge),
    )
  );
}
