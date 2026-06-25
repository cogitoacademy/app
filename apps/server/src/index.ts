import { initLogger } from "evlog";

import { createServer } from "./routes";

initLogger({
  env: { service: "cogito-app-server" },
});

const app = createServer();

app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001");
});
