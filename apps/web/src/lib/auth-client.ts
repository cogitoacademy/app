import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

import { serverUrl } from "./server-url";

export const authClient = createAuthClient({
  baseURL: serverUrl,
  plugins: [emailOTPClient()],
});
