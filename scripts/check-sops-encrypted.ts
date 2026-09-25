import { readFileSync } from "node:fs";

const encryptedRegexSource = readFileSync(".sops.yaml", "utf8").match(
  /encrypted_regex:\s*"([^"]+)"/,
)?.[1];

if (!encryptedRegexSource) {
  throw new Error("Could not read encrypted_regex from .sops.yaml");
}

const encryptedKey = new RegExp(encryptedRegexSource);
const plaintextKeys: string[] = [];

for (const filename of process.argv.slice(2)) {
  for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).trim();
    if (encryptedKey.test(key) && value && !value.startsWith("ENC[")) {
      plaintextKeys.push(key);
    }
  }
}

if (plaintextKeys.length > 0) {
  console.error(`sops-plaintext-guard: PLAINTEXT: ${plaintextKeys.join(" ")}`);
  process.exit(1);
}

console.log("sops-plaintext-guard: OK");
