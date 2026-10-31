import config from "./playwright.config";

const project = config.projects?.[0];
if (!project) throw new Error("Expected the repository Playwright project.");
config.projects = [
  {
    ...project,
    name: "edge-signup",
    use: { ...project.use, channel: "msedge" },
  },
];

export default config;
