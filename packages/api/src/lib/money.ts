export const IDR_MARKS_MIN_UNIT = 1;

export function validateMarksAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Marks amount must be a positive integer");
  }
}

export function validateIdrAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      "IDR amount must be a positive integer (rupiah, no decimals)",
    );
  }
}

export function floorDivision(numerator: number, denominator: number): number {
  return Math.floor(numerator / denominator);
}
