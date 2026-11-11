import { createGame } from "./game";
import { registerServiceWorker } from "./shell/register";
import { installStyles } from "./ui/theme";

registerServiceWorker("./sw.js");
installStyles(document);

const canvas = document.getElementById("canvas");
const root = document.getElementById("ui");

if (!(canvas instanceof HTMLCanvasElement) || root === null) {
  throw new Error("GAZER shell markup is missing #canvas or #ui");
}

const endpoint = new URLSearchParams(location.search).get("endpoint");

await createGame({
  doc: document,
  canvas,
  root,
  endpoint: endpoint !== null && /^https?:\/\//.test(endpoint) ? endpoint : null,
});
