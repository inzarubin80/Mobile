#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const fontsDir = path.join(__dirname, "..", "android", "app", "src", "main", "assets", "fonts");

function exitWithError(msg) {
  console.error(msg);
  process.exit(1);
}

try {
  if (!fs.existsSync(fontsDir)) {
    exitWithError(`Fonts directory not found: ${fontsDir}`);
  }
  const files = fs.readdirSync(fontsDir).filter((f) => f.toLowerCase().endsWith(".ttf"));
  if (files.length === 0) {
    exitWithError(`No .ttf files found in ${fontsDir}`);
  }
  console.log(`Found ${files.length} .ttf file(s) in ${fontsDir}:`);
  files.forEach((f) => console.log(" - " + f));
  process.exit(0);
} catch (err) {
  console.error("Error while checking fonts:", err && err.message ? err.message : String(err));
  process.exit(2);
}


