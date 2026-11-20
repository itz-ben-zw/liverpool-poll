const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync("public/index.html", "utf8");
const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error("No inline application scripts found.");
scripts.forEach((match, index) => new vm.Script(match[1], { filename: "public/index.html:inline-script-" + (index + 1) }));
console.log("Validated " + scripts.length + " inline script block(s).");
