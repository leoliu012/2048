import { analyse } from "./engine.js";

self.onmessage = ({ data }) => {
  const { id, rows, maxDepth } = data;
  self.postMessage({ id, ...analyse(rows, { maxDepth }) });
};
